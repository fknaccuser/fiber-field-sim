/**
 * Turns an authored scenario definition into a concrete, deterministic WorldState +
 * ScenarioMeta pair. `loadScenarioYaml` only parses/validates shape (Zod); all of the
 * "what actually happens this run" logic -- randomization, derived live-service,
 * applying faults, and computing the reference solution's timing -- lives here.
 */
import { load as parseYamlDocument } from 'js-yaml';
import { applyFault, createEmptyWorld, getSpliceMap } from '../world';
import type { ActiveProfileSet, FiberSpan, FiberTubeColor, WorldState } from '../world';
import { resolveProfileSet } from '../profiles';
import type { ProfileSet } from '../profiles';
import { perform, startSession } from '../session/runner';
import type { Intent, ScenarioMeta } from '../session/types';
import { affectedCustomerIds } from '../scoring/serviceImpact';
import { ScenarioDefinitionSchema } from './schema';
import type { ScenarioDefinition, ScenarioIntent } from './schema';
import { resolveRandomization } from './randomize';

export function loadScenarioYaml(text: string): ScenarioDefinition {
  return ScenarioDefinitionSchema.parse(parseYamlDocument(text));
}

interface StrandLike {
  tubeColor: FiberTubeColor;
  fiberColor: FiberTubeColor;
}

function strandRefEquals(a: StrandLike | undefined, b: StrandLike | undefined): boolean {
  if (!a || !b) return false;
  return a.tubeColor === b.tubeColor && a.fiberColor === b.fiberColor;
}

/**
 * BFS from every 'olt' node along fromNodeId -> toNodeId: reached spans default to live
 * unless already authored. At a stranded span, only a splice map's *actual* continuation
 * of the specific strand we arrived on propagates liveness onward -- naively marking
 * every feeder/distribution/backbone-role strand live regardless of splicing would also
 * mark a strand that a wrong-tube fault physically disconnects (see item 5 test 5's
 * post-fault clearing step, and the safety check on a live-PON OTDR test, which a
 * splice-unaware derivation would wrongly flag on a genuinely dead leg). Run BEFORE
 * faults are applied; `clearLiveOnBrokenStrands` runs after.
 */
export function deriveLiveService(world: WorldState): void {
  interface Frame {
    nodeId: string;
    arrivingSpanId: string | null;
    strand: StrandLike | undefined;
  }
  // Keyed by node id *and* strand, not just node id: two different fibers can legitimately
  // pass through the same node (e.g. a splice closure), and blocking the second on a
  // plain node-visited set would wrongly stop that strand's liveness from propagating.
  function frameKey(nodeId: string, strand: StrandLike | undefined): string {
    return strand ? `${nodeId}|${strand.tubeColor}/${strand.fiberColor}` : nodeId;
  }

  const visited = new Set<string>();
  const queue: Frame[] = [];
  for (const node of world.topology.nodes) {
    if (node.kind !== 'olt') continue;
    visited.add(frameKey(node.id, undefined));
    queue.push({ nodeId: node.id, arrivingSpanId: null, strand: undefined });
  }

  while (queue.length > 0) {
    const { nodeId, arrivingSpanId, strand } = queue.shift()!;
    const node = world.topology.nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    const outgoing = world.topology.spans.filter((s) => s.fromNodeId === nodeId && s.id !== arrivingSpanId);
    const spliceMap = node.kind !== 'splitter' ? getSpliceMap(node) : [];

    for (const span of outgoing) {
      const hasStrands = !!span.strands && span.strands.length > 0;
      let strandsToMark: (StrandLike | undefined)[];

      if (arrivingSpanId !== null && spliceMap.length > 0) {
        // Only the splice map's actual continuation of the strand we arrived on -- not
        // every strand this candidate span happens to carry.
        strandsToMark = spliceMap.filter((e) => e.fromSpanId === arrivingSpanId && e.toSpanId === span.id && strandRefEquals(e.fromStrand, strand)).map((e) => e.toStrand);
        if (strandsToMark.length === 0) continue; // this splice map does not continue our fiber onto this span
      } else if (hasStrands) {
        strandsToMark = span.strands!.filter((s) => s.role === 'feeder' || s.role === 'distribution' || s.role === 'backbone').map((s) => ({ tubeColor: s.tubeColor, fiberColor: s.fiberColor }));
      } else {
        strandsToMark = [undefined];
      }

      if (span.liveService === undefined) span.liveService = true;
      for (const mark of strandsToMark) {
        if (mark) {
          const strandObj = span.strands?.find((s) => s.tubeColor === mark.tubeColor && s.fiberColor === mark.fiberColor);
          if (strandObj && strandObj.live === undefined) strandObj.live = true;
        }

        const key = frameKey(span.toNodeId, mark);
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({ nodeId: span.toNodeId, arrivingSpanId: span.id, strand: mark });
        }
      }
    }
  }
}

/** A strand whose continuity a fault broke can no longer be carrying live service, regardless of the structural derivation above. Run AFTER faults are applied (item 5 test 5). */
function clearLiveOnBrokenStrands(world: WorldState): void {
  for (const span of world.topology.spans) {
    for (const strand of span.strands ?? []) {
      if (strand.continuityBroken) strand.live = false;
    }
  }
}

/** `"$3"` in an authored reference solution's evidenceActionIds means "the action from step 3" -- since the runner assigns ids `a${index}` strictly by log position and a valid reference solution is never refused, step *i* always becomes action `ai`. */
function rewriteRef(ref: string): string {
  const m = /^\$(\d+)$/.exec(ref);
  return m ? `a${m[1]}` : ref;
}

function rewriteStep(intent: ScenarioIntent): Intent {
  if (intent.type !== 'diagnosis') return intent as Intent;
  const { diagnosis } = intent;
  return {
    type: 'diagnosis',
    diagnosis: {
      claims: diagnosis.claims.map((c) => ({ ...c, evidenceActionIds: c.evidenceActionIds.map(rewriteRef) })),
      escalate: diagnosis.escalate ? { ...diagnosis.escalate, evidenceActionIds: diagnosis.escalate.evidenceActionIds.map(rewriteRef) } : undefined,
      noFaultInScope: diagnosis.noFaultInScope,
    },
  };
}

export function buildSpan(def: ScenarioDefinition, spanLengths: Map<string, number>, span: ScenarioDefinition['topology']['spans'][number]): FiberSpan {
  const lengthMeters = spanLengths.get(span.id) ?? span.lengthMeters;
  const events = span.events.map((e) => ({ ...e, positionMeters: Math.min(e.positionMeters, lengthMeters) }));
  const { randomize: _randomize, ...rest } = span;
  void def;
  return { ...rest, lengthMeters, events };
}

/** Runs the authored reference solution against the just-built world (`perform` never mutates its input, so this is safe to do on the world we're about to return) to derive the two numbers item 5's validator and item 4's scorer need: total time and affected-customer-minutes. */
function computeReferenceTotals(world: WorldState, profiles: ProfileSet, meta: ScenarioMeta): { totalSeconds: number; affectedCustomerMinutes: number; stepSeconds: number[] } {
  let state = startSession(world, profiles, meta);
  for (const step of meta.referenceSolution.steps) {
    state = perform(state, step).state;
  }
  const totalSeconds = state.clockSeconds;
  const affected = affectedCustomerIds(world, profiles, meta);
  return { totalSeconds, affectedCustomerMinutes: affected.length * (totalSeconds / 60), stepSeconds: state.log.map((action) => action.durationSeconds) };
}

export function instantiateScenario(def: ScenarioDefinition, seed: number): { world: WorldState; meta: ScenarioMeta } {
  // A private deep copy: everything below mutates freely without ever touching the
  // caller's `def`, which may be instantiated again with a different seed.
  const cloned = structuredClone(def);
  const resolved = resolveRandomization(cloned, seed);
  const activeProfiles: ActiveProfileSet = cloned.profiles;

  let world = createEmptyWorld(seed, activeProfiles);
  world.id = `${cloned.id}#${seed}`;
  world.environment = cloned.environment;
  world.truckInventory = cloned.truckInventory;
  world.timeBudgetMinutes = cloned.timeBudgetMinutes;
  world.topology.nodes = cloned.topology.nodes;
  world.topology.spans = cloned.topology.spans.map((s) => buildSpan(cloned, resolved.spanLengths, s));
  world.devices = cloned.devices;
  world.links = cloned.links;
  world.hosts = cloned.hosts;
  world.plantRecords = cloned.plantRecords;
  world.nocReports = cloned.nocReports.map((r) => ({
    customerId: r.customerId,
    premiseNodeId: r.premiseNodeId,
    reportedSymptom: resolved.customerSymptoms.get(r.customerId) ?? r.reportedSymptom,
    isRedHerring: r.isRedHerring,
  }));

  deriveLiveService(world);
  for (const fault of [...resolved.faults, ...resolved.redHerrings]) {
    world = applyFault(world, fault);
  }
  clearLiveOnBrokenStrands(world);

  const metaDraft: ScenarioMeta = {
    scenarioId: cloned.id,
    title: cloned.title,
    tier: cloned.tier as ScenarioMeta['tier'],
    seed,
    startLocationNodeId: cloned.startLocationNodeId,
    timeBudgetMinutes: cloned.timeBudgetMinutes,
    remoteCliAccess: cloned.remoteCliAccess,
    remoteHostAccess: cloned.remoteHostAccess,
    positionToleranceMeters: cloned.positionToleranceMeters,
    serviceCheckHostname: cloned.serviceCheckHostname,
    travelSeconds: cloned.travelSeconds,
    hints: cloned.hints,
    referenceSolution: { steps: cloned.referenceSolution.steps.map(rewriteStep), rationales: cloned.referenceSolution.rationales, totalSeconds: 0, affectedCustomerMinutes: 0 },
    today: cloned.today,
  };

  const profiles = resolveProfileSet(activeProfiles);
  const totals = computeReferenceTotals(world, profiles, metaDraft);

  return {
    world,
    meta: { ...metaDraft, referenceSolution: { ...metaDraft.referenceSolution, ...totals } },
  };
}
