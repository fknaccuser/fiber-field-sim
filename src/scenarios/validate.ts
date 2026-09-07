/**
 * Validates a scenario definition so a trainee never sees a broken one. Runs at load
 * time (and in CI over every bundled scenario, see library.test.ts). Errors mean the
 * scenario cannot be played; warnings are advisory (missing red herrings, no time
 * budget, etc.) and are printed, never thrown.
 */
import { z } from 'zod';
import { applyFault, createEmptyWorld, FAULT_TAXONOMY_BY_ID } from '../world';
import type { FaultTarget, WorldState } from '../world';
import { resolveProfileSet } from '../profiles';
import { HINT_POLICY } from '../session/costs';
import { startSession, perform } from '../session/runner';
import { scoreSession } from '../scoring/score';
import { AmbiguousPathError } from '../instruments/otdr';
import { resolveTestPath } from '../instruments/shared/opticalPath';
import type { StrandRef } from '../instruments/shared/opticalPath';
import { buildSpan, deriveLiveService, instantiateScenario } from './loader';
import { resolveRandomization } from './randomize';
import type { ScenarioDefinition, ScenarioFaultInstance } from './schema';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
}

function err(code: string, path: string, message: string): ValidationIssue {
  return { severity: 'error', code, path, message };
}
function warn(code: string, path: string, message: string): ValidationIssue {
  return { severity: 'warning', code, path, message };
}

function faultTargetNodeOrSpanId(target: FaultTarget): string | null {
  return target.type === 'fiber-span' ? target.spanId : target.type === 'site' ? target.nodeId : null;
}

function targetExists(def: ScenarioDefinition, target: FaultTarget): boolean {
  switch (target.type) {
    case 'fiber-span':
      return def.topology.spans.some((s) => s.id === target.spanId);
    case 'site':
      return def.topology.nodes.some((n) => n.id === target.nodeId);
    case 'device-global':
      return def.devices.some((d) => d.id === target.deviceId);
    case 'device-interface':
      return def.devices.some((d) => d.id === target.deviceId && d.interfaces.some((i) => i.id === target.interfaceId));
  }
}

// --- E1: unique ids ------------------------------------------------------------------

function checkUniqueIds(def: ScenarioDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  function checkGroup(path: string, ids: string[]) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push(err('E1', path, `Duplicate id "${id}" in ${path}`));
      seen.add(id);
    }
  }
  checkGroup('topology.nodes', def.topology.nodes.map((n) => n.id));
  checkGroup('topology.spans', def.topology.spans.map((s) => s.id));
  checkGroup('devices', def.devices.map((d) => d.id));
  checkGroup('hosts', def.hosts.map((h) => h.id));
  checkGroup('links', def.links.map((l) => l.id));
  checkGroup('plantRecords', def.plantRecords.map((r) => r.id));
  checkGroup('customerReports', def.customerReports.map((r) => r.customerId));
  checkGroup('faults', [...def.faults, ...(def.redHerringPool?.from ?? [])].map((f) => f.instanceId));
  return issues;
}

// --- E2: referential integrity --------------------------------------------------------

function checkReferences(def: ScenarioDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set(def.topology.nodes.map((n) => n.id));

  for (const span of def.topology.spans) {
    if (!nodeIds.has(span.fromNodeId)) issues.push(err('E2', `topology.spans.${span.id}`, `fromNodeId "${span.fromNodeId}" does not exist`));
    if (!nodeIds.has(span.toNodeId)) issues.push(err('E2', `topology.spans.${span.id}`, `toNodeId "${span.toNodeId}" does not exist`));
  }

  const deviceIds = new Set(def.devices.map((d) => d.id));
  for (const link of def.links) {
    if (!deviceIds.has(link.a.deviceId)) issues.push(err('E2', `links.${link.id}`, `endpoint a device "${link.a.deviceId}" does not exist`));
    if ('hostId' in link.b) {
      const hostId = link.b.hostId;
      if (!def.hosts.some((h) => h.id === hostId)) issues.push(err('E2', `links.${link.id}`, `endpoint b host "${hostId}" does not exist`));
    } else {
      const b = link.b;
      if (!deviceIds.has(b.deviceId)) issues.push(err('E2', `links.${link.id}`, `endpoint b device "${b.deviceId}" does not exist`));
    }
  }

  for (const host of def.hosts) {
    const viaOnt = !!host.attachedOntNodeId;
    const viaLink = def.links.some((l) => 'hostId' in l.b && l.b.hostId === host.id);
    if (viaOnt === viaLink) {
      issues.push(err('E2', `hosts.${host.id}`, viaOnt ? 'has both an attachedOntNodeId and a switch-port link (exactly one is required)' : 'has neither an attachedOntNodeId nor a switch-port link'));
    }
    if (host.attachedOntNodeId && !nodeIds.has(host.attachedOntNodeId)) {
      issues.push(err('E2', `hosts.${host.id}`, `attachedOntNodeId "${host.attachedOntNodeId}" does not exist`));
    }
  }

  if (!nodeIds.has(def.startLocationNodeId)) issues.push(err('E2', 'startLocationNodeId', `"${def.startLocationNodeId}" does not exist`));

  for (const pair of def.travelSeconds.pairs) {
    if (!nodeIds.has(pair.from)) issues.push(err('E2', 'travelSeconds.pairs', `node "${pair.from}" does not exist`));
    if (!nodeIds.has(pair.to)) issues.push(err('E2', 'travelSeconds.pairs', `node "${pair.to}" does not exist`));
  }

  return issues;
}

// --- E3: fault kind/params/target ------------------------------------------------------

function paramsAtBound(fault: ScenarioFaultInstance, bound: 'min' | 'max'): Record<string, unknown> {
  const params = { ...fault.params };
  if (fault.randomize) {
    for (const [key, spec] of Object.entries(fault.randomize)) {
      if (Array.isArray(spec)) {
        params[key] = bound === 'min' ? spec[0] : spec[spec.length - 1];
      } else {
        params[key] = (spec as { min: number; max: number })[bound];
      }
    }
  }
  return params;
}

function checkFaultDefinition(def: ScenarioDefinition, fault: ScenarioFaultInstance, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const taxonomyDef = FAULT_TAXONOMY_BY_ID[fault.kind];
  if (!taxonomyDef) {
    issues.push(err('E3', path, `Unknown fault kind "${fault.kind}" (instance "${fault.instanceId}")`));
    return issues;
  }
  for (const bound of ['min', 'max'] as const) {
    const parsed = taxonomyDef.paramsSchema.safeParse(paramsAtBound(fault, bound));
    if (!parsed.success) {
      issues.push(err('E3', path, `Fault "${fault.instanceId}" (${fault.kind}) params invalid at randomize.${bound}: ${z.prettifyError(parsed.error)}`));
    }
  }
  if (fault.target.type !== taxonomyDef.appliesTo) {
    issues.push(err('E3', path, `Fault "${fault.instanceId}" (${fault.kind}) target type "${fault.target.type}" but the taxonomy entry applies to "${taxonomyDef.appliesTo}"`));
  }
  if (!targetExists(def, fault.target)) {
    const ref = faultTargetNodeOrSpanId(fault.target);
    issues.push(err('E3', path, `Fault "${fault.instanceId}" (${fault.kind}) targets "${ref}", which does not exist`));
  }
  return issues;
}

function checkFaults(def: ScenarioDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const fault of def.faults) issues.push(...checkFaultDefinition(def, fault, `faults.${fault.instanceId}`));
  for (const fault of def.redHerringPool?.from ?? []) issues.push(...checkFaultDefinition(def, fault, `redHerringPool.from.${fault.instanceId}`));
  return issues;
}

// --- E4: dry-run fault application ------------------------------------------------------

function buildMinimalWorld(def: ScenarioDefinition, seed: number): WorldState {
  const resolved = resolveRandomization(def, seed);
  const world = createEmptyWorld(seed, def.profiles);
  world.topology.nodes = structuredClone(def.topology.nodes);
  world.topology.spans = def.topology.spans.map((s) => buildSpan(def, resolved.spanLengths, s));
  world.devices = structuredClone(def.devices);
  world.hosts = structuredClone(def.hosts);
  return world;
}

function dryRunAtSeed(def: ScenarioDefinition, seed: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let world: WorldState;
  try {
    world = buildMinimalWorld(def, seed);
  } catch (e) {
    return [err('E4', 'topology', `Building the world at seed ${seed} failed: ${(e as Error).message}`)];
  }
  const resolved = resolveRandomization(def, seed);
  for (const fault of [...resolved.faults, ...resolved.redHerrings]) {
    try {
      world = applyFault(world, fault);
    } catch (e) {
      issues.push(err('E4', `faults.${fault.instanceId}`, `Applying fault "${fault.instanceId}" (${fault.kind}) at seed ${seed} failed: ${(e as Error).message}`));
    }
  }
  return issues;
}

function checkDryRun(def: ScenarioDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const seed of [1, 2, 3]) issues.push(...dryRunAtSeed(def, seed));
  return issues;
}

// --- E5: splitters -----------------------------------------------------------------------

function checkSplitters(def: ScenarioDefinition, profiles = tryResolveProfiles(def)): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const node of def.topology.nodes) {
    if (node.kind !== 'splitter') continue;
    const ratio = node.attributes?.splitRatio;
    if (typeof ratio !== 'string') {
      issues.push(err('E5', `topology.nodes.${node.id}`, 'splitter node has no attributes.splitRatio'));
    } else if (profiles && !profiles.network.splitterLadder.some((l) => l.ratio === ratio)) {
      issues.push(err('E5', `topology.nodes.${node.id}`, `splitRatio "${ratio}" is not in the network profile's splitterLadder`));
    }
    const incidentIn = def.topology.spans.filter((s) => s.toNodeId === node.id);
    if (incidentIn.length !== 1) {
      issues.push(err('E5', `topology.nodes.${node.id}`, `splitter node must have exactly one incoming span (toNodeId === node), found ${incidentIn.length}`));
    }
  }
  return issues;
}

// --- E6: PON orientation ---------------------------------------------------------------

function reachableNodeIds(def: ScenarioDefinition, fromNodeId: string): Set<string> {
  const visited = new Set([fromNodeId]);
  const queue = [fromNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const span of def.topology.spans) {
      if (span.fromNodeId === current && !visited.has(span.toNodeId)) {
        visited.add(span.toNodeId);
        queue.push(span.toNodeId);
      }
    }
  }
  return visited;
}

function checkPonOrientation(def: ScenarioDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const oltReachable = new Set<string>();
  for (const node of def.topology.nodes) {
    if (node.kind !== 'olt') continue;
    for (const id of reachableNodeIds(def, node.id)) oltReachable.add(id);
  }
  for (const node of def.topology.nodes) {
    if (node.kind === 'ont' && !oltReachable.has(node.id)) {
      issues.push(err('E6', `topology.nodes.${node.id}`, 'ont node is not reachable from any olt node along fromNodeId -> toNodeId'));
    }
  }

  const spanById = new Map(def.topology.spans.map((s) => [s.id, s]));
  for (const device of def.devices) {
    if (!device.ponPorts) continue;
    for (const port of device.ponPorts) {
      const span = spanById.get(port.spanId);
      if (!span) {
        issues.push(err('E6', `devices.${device.id}.ponPorts.${port.id}`, `spanId "${port.spanId}" does not exist`));
        continue;
      }
      if (span.fromNodeId !== device.topologyNodeId) {
        issues.push(err('E6', `devices.${device.id}.ponPorts.${port.id}`, `span "${port.spanId}" does not leave the OLT's own topologyNodeId ("${device.topologyNodeId}")`));
      }
      const reachableFromPort = reachableNodeIds(def, span.toNodeId);
      for (const ont of port.onts) {
        if (!def.topology.nodes.some((n) => n.id === ont.ontNodeId)) {
          issues.push(err('E6', `devices.${device.id}.ponPorts.${port.id}`, `OntRecord "${ont.ontId}" references ontNodeId "${ont.ontNodeId}", which does not exist`));
        } else if (!reachableFromPort.has(ont.ontNodeId) && ont.ontNodeId !== span.toNodeId) {
          issues.push(err('E6', `devices.${device.id}.ponPorts.${port.id}`, `OntRecord "${ont.ontId}"'s ontNodeId "${ont.ontNodeId}" is not reachable from the port's span`));
        }
      }
    }
  }
  return issues;
}

// --- E7: splice-map disambiguation ------------------------------------------------------

function checkSpliceDisambiguation(def: ScenarioDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let world: WorldState;
  try {
    world = buildMinimalWorld(def, 1);
  } catch {
    return issues; // structural errors already reported elsewhere
  }
  const profiles = tryResolveProfiles(def);
  if (!profiles) return issues;

  const spanById = new Map(world.topology.spans.map((s) => [s.id, s]));

  // A StrandRequiredError only means "this access point sits on a stranded cable and no
  // strand was specified" -- true of nearly every launch point upstream of a splitter on
  // a stranded feeder, well-formed or not (resolveTestPath has no notion of a port's
  // assigned strand). Only AmbiguousPathError -- an unstranded node with more than one
  // continuation and no splice map to disambiguate it -- signals an actual defect.
  function tryPath(accessNodeId: string, launchSpanId: string, strand?: StrandRef) {
    try {
      resolveTestPath(world, profiles!.network, { accessNodeId, launchSpanId, strand });
    } catch (e) {
      if (e instanceof AmbiguousPathError) {
        issues.push(err('E7', `topology`, `Path from ${accessNodeId} into ${launchSpanId} is unresolvable: ${e.message}`));
      }
    }
  }

  for (const node of world.topology.nodes) {
    if (node.kind !== 'ont') continue;
    const dropSpan = world.topology.spans.find((s) => s.toNodeId === node.id);
    if (dropSpan) tryPath(node.id, dropSpan.id);
  }
  for (const device of def.devices) {
    for (const port of device.ponPorts ?? []) {
      const span = spanById.get(port.spanId);
      if (span && device.topologyNodeId) tryPath(device.topologyNodeId, span.id, port.strand);
    }
  }
  return issues;
}

// --- E8: device/profile consistency -----------------------------------------------------

function tryResolveProfiles(def: ScenarioDefinition) {
  try {
    return resolveProfileSet(def.profiles);
  } catch {
    return null;
  }
}

function checkDevices(def: ScenarioDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const profiles = tryResolveProfiles(def);
  const validVendorIds = profiles ? new Set([profiles.oltVendor.id, profiles.switchVendor.id, profiles.hostShell.id]) : null;
  for (const device of def.devices) {
    if (validVendorIds && !validVendorIds.has(device.vendorProfileId)) {
      issues.push(err('E8', `devices.${device.id}`, `vendorProfileId "${device.vendorProfileId}" does not resolve in this scenario's profile set`));
    }
    if (device.ponPorts && device.ponPorts.length > 0) {
      if (device.role !== 'olt') issues.push(err('E8', `devices.${device.id}`, 'has ponPorts but role is not "olt"'));
      if (!device.topologyNodeId) issues.push(err('E8', `devices.${device.id}`, 'has ponPorts but no topologyNodeId'));
    }
    for (const dhcp of device.dhcp ?? []) {
      if (dhcp.helperAddresses.length > 0 && !dhcp.scope) {
        issues.push(err('E8', `devices.${device.id}.dhcp.${dhcp.vlan}`, 'has helperAddresses but no scope'));
      }
    }
  }
  return issues;
}

// --- E9: profile ids resolve -------------------------------------------------------------

function checkProfilesResolve(def: ScenarioDefinition): ValidationIssue[] {
  try {
    resolveProfileSet(def.profiles);
    return [];
  } catch (e) {
    return [err('E9', 'profiles', (e as Error).message)];
  }
}

// --- E10: truck inventory covers the reference solution -----------------------------------

function checkTruckInventory(def: ScenarioDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const needed = new Set<string>();
  let neededCableMeters = 0;
  for (const step of def.referenceSolution.steps) {
    if (step.type === 'otdr-shot') {
      needed.add('otdr');
      neededCableMeters = Math.max(neededCableMeters, step.settings.launchCableMeters);
    } else if (step.type === 'power-meter') needed.add('power-meter');
    else if (step.type === 'vfl') needed.add('vfl');
    else if (step.type === 'scope') needed.add('inspection-scope');
  }
  for (const item of needed) {
    if (!def.truckInventory.includes(item)) issues.push(err('E10', 'truckInventory', `reference solution needs "${item}", which is not in truckInventory`));
  }
  if (neededCableMeters > 0) {
    const has = def.truckInventory.some((item) => {
      const m = /^launch-cable-(\d+)m$/.exec(item);
      return m !== null && Number(m[1]) >= neededCableMeters;
    });
    if (!has) issues.push(err('E10', 'truckInventory', `reference solution needs a launch cable of at least ${neededCableMeters}m`));
  }
  return issues;
}

// --- E11: reference solution scores perfectly ---------------------------------------------

function claimsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function checkReferenceSolution(def: ScenarioDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let world: WorldState;
  let meta: ReturnType<typeof instantiateScenario>['meta'];
  try {
    ({ world, meta } = instantiateScenario(def, 1));
  } catch (e) {
    return [err('E11', 'referenceSolution', `Instantiating the scenario at seed 1 failed: ${(e as Error).message}`)];
  }
  const profiles = tryResolveProfiles(def);
  if (!profiles) return issues;

  let state = startSession(world, profiles, meta);
  for (const [index, step] of meta.referenceSolution.steps.entries()) {
    const { state: nextState, result } = perform(state, step);
    state = nextState;
    if (result.type === 'refused') {
      issues.push(err('E11', `referenceSolution.steps.${index}`, `Reference step ${index} (${step.type}) was refused: ${result.reason}`));
    }
  }

  const lastStep = meta.referenceSolution.steps[meta.referenceSolution.steps.length - 1];
  if (!lastStep || lastStep.type !== 'diagnosis') {
    issues.push(err('E11', 'referenceSolution.steps', 'The reference solution must end with a diagnosis step'));
    return issues;
  }

  const report = scoreSession(state);
  const { diagnosticAccuracy, evidenceQuality, safetyCompliance } = report.axes;
  if (diagnosticAccuracy.score !== 100 || evidenceQuality.score !== 100 || safetyCompliance.score !== 100) {
    issues.push(
      err(
        'E11',
        'referenceSolution',
        `Reference solution does not score perfectly: diagnosticAccuracy=${diagnosticAccuracy.score}, evidenceQuality=${evidenceQuality.score}, safetyCompliance=${safetyCompliance.score}`,
      ),
    );
  }

  if (def.referenceSolution.expectedClaims.length > 0) {
    const actual = lastStep.diagnosis.claims.map((c) => ({ faultKind: c.faultKind, target: c.target, positionMeters: c.positionMeters, strand: c.strand }));
    if (!claimsEqual(actual, def.referenceSolution.expectedClaims)) {
      issues.push(err('E11', 'referenceSolution.expectedClaims', 'The diagnosis step\'s claims (minus evidenceActionIds) do not match expectedClaims'));
    }
  }

  return issues;
}

// --- E12: hint budget ----------------------------------------------------------------------

function checkHintBudget(def: ScenarioDefinition): ValidationIssue[] {
  const tier = def.tier as 1 | 2 | 3 | 4 | 5 | 6;
  if (tier === 1) {
    return def.hints.length < 3 ? [err('E12', 'hints', 'tier 1 requires at least 3 hints')] : [];
  }
  const policy = HINT_POLICY[tier];
  if (Number.isFinite(policy.max) && policy.max > 0 && def.hints.length < policy.max) {
    return [err('E12', 'hints', `tier ${tier} requires at least ${policy.max} hints (HINT_POLICY), found ${def.hints.length}`)];
  }
  return [];
}

// --- E13: fiber-event/strand/splice-map bounds ------------------------------------------

function checkBoundsAndReferences(def: ScenarioDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const span of def.topology.spans) {
    let lastPosition = -Infinity;
    for (const event of span.events) {
      if (event.positionMeters < 0 || event.positionMeters > span.lengthMeters) {
        issues.push(err('E13', `topology.spans.${span.id}`, `event "${event.id}" positionMeters ${event.positionMeters} is outside [0, ${span.lengthMeters}]`));
      }
      if (event.positionMeters < lastPosition) {
        issues.push(err('E13', `topology.spans.${span.id}`, `event "${event.id}" is out of order (events must be sorted by positionMeters)`));
      }
      lastPosition = event.positionMeters;
    }
  }

  for (const fault of def.faults) {
    if (fault.kind !== 'wrong-tube-continuity' || fault.target.type !== 'fiber-span') continue;
    const targetSpanId = fault.target.spanId;
    const targetSpan = def.topology.spans.find((s) => s.id === targetSpanId);
    const tubeColor = fault.params.tubeColor;
    const fiberColor = fault.params.fiberColor;
    const hasStrand = targetSpan?.strands?.some((st) => st.tubeColor === tubeColor && st.fiberColor === fiberColor);
    if (targetSpan && !hasStrand) {
      issues.push(err('E13', `faults.${fault.instanceId}`, `wrong-tube-continuity names strand ${tubeColor}/${fiberColor}, which does not exist on span "${targetSpanId}"`));
    }
  }

  for (const node of def.topology.nodes) {
    const spliceMap = node.attributes?.spliceMap;
    if (!Array.isArray(spliceMap)) continue;
    for (const entry of spliceMap as Array<{ fromSpanId: string; toSpanId: string }>) {
      for (const spanId of [entry.fromSpanId, entry.toSpanId]) {
        const span = def.topology.spans.find((s) => s.id === spanId);
        if (!span || (span.fromNodeId !== node.id && span.toNodeId !== node.id)) {
          issues.push(err('E13', `topology.nodes.${node.id}`, `spliceMap references span "${spanId}", which is not incident to this node`));
        }
      }
    }
  }

  return issues;
}

// --- E14: red-herring pool entries are individually valid -------------------------------
// (already covered by checkFaults/checkDryRun, which both include redHerringPool.from)

// --- Warnings ------------------------------------------------------------------------------

function checkWarnings(def: ScenarioDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const span of def.topology.spans) {
    const toNode = def.topology.nodes.find((n) => n.id === span.toNodeId);
    if (toNode?.kind !== 'splitter') continue;
    for (const event of span.events) {
      if (event.kind === 'splitter' && Math.abs(event.positionMeters - span.lengthMeters) <= 1) {
        issues.push(warn('W1', `topology.spans.${span.id}`, `inline 'splitter' event at ${event.positionMeters}m is within 1m of splitter node "${toNode.id}" -- likely double-counts the split loss`));
      }
    }
  }

  const hasRedHerring = def.faults.some((f) => f.isRedHerring) || !!(def.redHerringPool && def.redHerringPool.pick > 0);
  if (def.tier >= 3 && !hasRedHerring) issues.push(warn('W2', 'faults', 'tier >= 3 scenario has no red herrings'));

  if (def.tier >= 2 && def.timeBudgetMinutes === undefined) issues.push(warn('W3', 'timeBudgetMinutes', 'tier >= 2 scenario has no time budget'));

  for (const span of def.topology.spans) {
    const range = span.randomize?.lengthMeters;
    if (!range) continue;
    for (const event of span.events) {
      if (event.positionMeters > range.min) {
        issues.push(warn('W4', `topology.spans.${span.id}`, `event "${event.id}" at ${event.positionMeters}m would clamp if the randomized length resolves near its minimum (${range.min}m)`));
      }
    }
  }

  try {
    const world = buildMinimalWorld(def, 1);
    const derived: string[] = [];
    deriveLiveService(world);
    for (const span of world.topology.spans) {
      const authoredSpan = def.topology.spans.find((s) => s.id === span.id)!;
      if (authoredSpan.liveService === undefined && span.liveService === true) derived.push(span.id);
      for (const strand of span.strands ?? []) {
        const authoredStrand = authoredSpan.strands?.find((s) => s.tubeColor === strand.tubeColor && s.fiberColor === strand.fiberColor);
        if (authoredStrand?.live === undefined && strand.live === true) derived.push(`${span.id}:${strand.tubeColor}/${strand.fiberColor}`);
      }
    }
    if (derived.length > 0) issues.push(warn('W5', 'topology.spans', `derived live-service (not explicitly authored): ${derived.join(', ')}`));
  } catch {
    // structural errors already reported by other checks
  }

  const hasTruckRoll = def.referenceSolution.steps.some((s) => s.type === 'truck-roll');
  if (!def.remoteCliAccess && !hasTruckRoll) {
    issues.push(warn('W6', 'referenceSolution.steps', 'remoteCliAccess is false but the reference solution never truck-rolls anywhere'));
  }

  return issues;
}

export function validateScenario(def: ScenarioDefinition): ValidationIssue[] {
  const rationales = def.referenceSolution.rationales;
  if (!rationales || rationales.length !== def.referenceSolution.steps.length || rationales.some((why) => !why.trim())) {
    return [err('E14', 'referenceSolution.rationales', 'Every reference step must have one non-empty explanation.')];
  }
  return [
    ...checkUniqueIds(def),
    ...checkReferences(def),
    ...checkFaults(def),
    ...checkDryRun(def),
    ...checkSplitters(def),
    ...checkPonOrientation(def),
    ...checkSpliceDisambiguation(def),
    ...checkDevices(def),
    ...checkProfilesResolve(def),
    ...checkTruckInventory(def),
    ...checkReferenceSolution(def),
    ...checkHintBudget(def),
    ...checkBoundsAndReferences(def),
    ...checkWarnings(def),
  ];
}
