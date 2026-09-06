/**
 * Evidence predicates and the fault-kind -> sufficient-evidence-sets table. A predicate
 * answers "does this subset of the action log prove this fault?" -- evidence.ts decides
 * *how* much of the log (cited-only vs. the whole log) each predicate is checked against
 * and turns the result into a 0/30/60/100 score per matched claim.
 */
import type { CliFact, Endpoint } from '../instruments/cli';
import type { FaultInstance, WorldState } from '../world';
import type { ProfileSet } from '../profiles';
import type { ActionEvent } from '../session/types';

export interface EvidenceContext {
  /** The scenario's frozen ground-truth world (never the live, possibly-mutated one). */
  world: WorldState;
  profiles: ProfileSet;
  /** The subset of the action log being checked -- either just the cited actions, or the whole log. */
  actions: ActionEvent[];
  fault: FaultInstance;
}

export type EvidencePredicate = (ctx: EvidenceContext) => boolean;
export type EvidenceSet = EvidencePredicate[];

// --- Small topology helpers ----------------------------------------------------------

function spanTouchesNode(world: WorldState, spanId: string, nodeId: string): boolean {
  const span = world.topology.spans.find((s) => s.id === spanId);
  return !!span && (span.fromNodeId === nodeId || span.toNodeId === nodeId);
}

/** ONT nodes reachable downstream of a span's customer-facing end, by walking the plain span graph (no physics -- just "is there a path"). */
function downstreamOntNodeIds(world: WorldState, spanId: string): string[] {
  const span = world.topology.spans.find((s) => s.id === spanId);
  if (!span) return [];
  const visited = new Set<string>([span.toNodeId]);
  const queue = [span.toNodeId];
  const found: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = world.topology.nodes.find((n) => n.id === current);
    if (node?.kind === 'ont') found.push(current);
    for (const s of world.topology.spans) {
      const next = s.fromNodeId === current ? s.toNodeId : s.toNodeId === current ? s.fromNodeId : null;
      if (next && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return found;
}

/** The 'site' node a site-targeted fault sits at, or null for any other target type. */
function faultSiteNodeId(fault: FaultInstance): string | null {
  return fault.target.type === 'site' ? fault.target.nodeId : null;
}

/** For a fiber-span splice-point fault (e.g. wrong-tube-continuity), the closure is conventionally the span's downstream (toNodeId) end. */
function faultClosureNodeId(world: WorldState, fault: FaultInstance): string | null {
  if (fault.target.type !== 'fiber-span') return null;
  const target = fault.target;
  const span = world.topology.spans.find((s) => s.id === target.spanId);
  return span?.toNodeId ?? null;
}

function faultDeviceId(fault: FaultInstance): string | null {
  if (fault.target.type === 'device-global' || fault.target.type === 'device-interface') return fault.target.deviceId;
  return null;
}

// --- Instrument-action predicates ------------------------------------------------------

function otdrShots(ctx: EvidenceContext) {
  return ctx.actions.filter((a): a is Extract<ActionEvent, { type: 'otdr-shot' }> => a.type === 'otdr-shot');
}

export function otdrResolves(ctx: EvidenceContext): boolean {
  return otdrShots(ctx).some((a) => a.groundTruth.some((g) => g.eventId === ctx.fault.instanceId && g.resolved));
}

export function otdrResolvesAtWavelengths(n: number): EvidencePredicate {
  return (ctx) => {
    const wavelengths = new Set(
      otdrShots(ctx)
        .filter((a) => a.groundTruth.some((g) => g.eventId === ctx.fault.instanceId && g.resolved))
        .map((a) => a.settings.wavelengthNm),
    );
    return wavelengths.size >= n;
  };
}

export function otdrBidirectional(ctx: EvidenceContext): boolean {
  const shots = otdrShots(ctx).filter((a) => a.groundTruth.some((g) => g.eventId === ctx.fault.instanceId && g.resolved));
  for (let i = 0; i < shots.length; i++) {
    for (let j = i + 1; j < shots.length; j++) {
      if (JSON.stringify(shots[i].pathSpanIds) === JSON.stringify([...shots[j].pathSpanIds].reverse())) return true;
    }
  }
  return false;
}

export function otdrUnterminatedEndAt(nodeId: string): EvidencePredicate {
  return (ctx) =>
    otdrShots(ctx).some((a) => {
      const lastSpan = a.pathSpanIds[a.pathSpanIds.length - 1];
      return !!lastSpan && spanTouchesNode(ctx.world, lastSpan, nodeId) && a.groundTruth.some((g) => g.kind === 'unterminated-end' && g.resolved);
    });
}

export function otdrUnterminatedEndAtClosure(): EvidencePredicate {
  return (ctx) => {
    const closure = faultClosureNodeId(ctx.world, ctx.fault);
    return closure !== null && otdrUnterminatedEndAt(closure)(ctx);
  };
}

export function powerMeterAt(nodeId: string, pred: (dbm: number | null) => boolean): EvidencePredicate {
  return (ctx) => ctx.actions.some((a) => a.type === 'power-meter' && a.nodeId === nodeId && pred(a.dbm));
}

export function powerMeterAtSite(pred: (dbm: number | null) => boolean): EvidencePredicate {
  return (ctx) => {
    const nodeId = faultSiteNodeId(ctx.fault);
    return nodeId !== null && powerMeterAt(nodeId, pred)(ctx);
  };
}

export function powerMeterAtClosure(pred: (dbm: number | null) => boolean): EvidencePredicate {
  return (ctx) => {
    const closure = faultClosureNodeId(ctx.world, ctx.fault);
    return closure !== null && powerMeterAt(closure, pred)(ctx);
  };
}

export function powerMeterDownstream(pred: (dbm: number | null) => boolean): EvidencePredicate {
  return (ctx) => {
    if (ctx.fault.target.type !== 'fiber-span') return false;
    const { spanId } = ctx.fault.target;
    const nodes = downstreamOntNodeIds(ctx.world, spanId);
    return nodes.some((nodeId) => powerMeterAt(nodeId, pred)(ctx));
  };
}

export function powerMeterDownstreamBelowMin(): EvidencePredicate {
  return (ctx) => powerMeterDownstream((dbm) => dbm === null || dbm < ctx.profiles.network.receivePower.minDbm)(ctx);
}

export function powerMeterDownstreamNull(): EvidencePredicate {
  return powerMeterDownstream((dbm) => dbm === null);
}

/** True if any one of the given predicates holds. */
export function anyOf(...preds: EvidencePredicate[]): EvidencePredicate {
  return (ctx) => preds.some((p) => p(ctx));
}

export function fatPowerOutOfSpec(): EvidencePredicate {
  return (ctx) => {
    const window = ctx.profiles.network.receivePower;
    return powerMeterAtSite((dbm) => dbm !== null && (dbm < window.minDbm || dbm > window.maxDbm))(ctx);
  };
}

export function vflLeakAt(toleranceMeters = 20): EvidencePredicate {
  return (ctx) => {
    if (ctx.fault.target.type !== 'fiber-span') return false;
    const { spanId } = ctx.fault.target;
    const positionMeters = typeof ctx.fault.params.positionMeters === 'number' ? ctx.fault.params.positionMeters : null;
    return ctx.actions.some(
      (a) =>
        a.type === 'vfl' &&
        a.spanId === spanId &&
        a.leaks.some((l) => positionMeters === null || Math.abs(l.positionMeters - positionMeters) <= toleranceMeters),
    );
  };
}

export function scopeFail(): EvidencePredicate {
  return (ctx) => {
    if (ctx.fault.target.type !== 'fiber-span') return false;
    const { spanId } = ctx.fault.target;
    return ctx.actions.some((a) => a.type === 'scope' && a.spanId === spanId && a.eventId === ctx.fault.instanceId && a.grade === 'fail');
  };
}

export function recordsAtFaultLocation(): EvidencePredicate {
  return (ctx) => {
    const target = ctx.fault.target;
    return ctx.actions.some((a) => {
      if (a.type !== 'records') return false;
      if (target.type === 'fiber-span') return a.spanId === target.spanId;
      if (target.type === 'site') return a.nodeId === target.nodeId;
      return false;
    });
  };
}

export function recordsAtClosure(): EvidencePredicate {
  return (ctx) => {
    const closure = faultClosureNodeId(ctx.world, ctx.fault);
    return closure !== null && ctx.actions.some((a) => a.type === 'records' && a.nodeId === closure);
  };
}

export function truckRollToFaultSite(): EvidencePredicate {
  return (ctx) => {
    const nodeId = faultSiteNodeId(ctx.fault);
    return nodeId !== null && ctx.actions.some((a) => a.type === 'truck-roll' && a.toNodeId === nodeId);
  };
}

// --- CLI-fact predicates ---------------------------------------------------------------

function cliActions(ctx: EvidenceContext) {
  return ctx.actions.filter((a): a is Extract<ActionEvent, { type: 'cli' }> => a.type === 'cli');
}

function endpointIsDevice(endpoint: Endpoint, deviceId: string): boolean {
  return endpoint.kind === 'device' && endpoint.deviceId === deviceId;
}

export function cliFactOnDevice(deviceId: string, kind: CliFact['kind']): EvidencePredicate {
  return (ctx) => cliActions(ctx).some((a) => endpointIsDevice(a.endpoint, deviceId) && a.facts.some((f) => f.kind === kind));
}

export function cliFactOnFaultDevice(kind: CliFact['kind']): EvidencePredicate {
  return (ctx) => {
    const deviceId = faultDeviceId(ctx.fault);
    return deviceId !== null && cliFactOnDevice(deviceId, kind)(ctx);
  };
}

export function anyCliFactOnFaultDevice(): EvidencePredicate {
  return (ctx) => {
    const deviceId = faultDeviceId(ctx.fault);
    return deviceId !== null && cliActions(ctx).some((a) => endpointIsDevice(a.endpoint, deviceId) && a.facts.length > 0);
  };
}

export function interfaceObservedOnFault(): EvidencePredicate {
  return (ctx) => {
    if (ctx.fault.target.type !== 'device-interface') return false;
    const { deviceId, interfaceId } = ctx.fault.target;
    return cliActions(ctx).some(
      (a) => endpointIsDevice(a.endpoint, deviceId) && a.facts.some((f) => f.kind === 'interface-observed' && f.interfaceId === interfaceId),
    );
  };
}

export function transceiverLowObservedOnFault(): EvidencePredicate {
  return (ctx) => {
    if (ctx.fault.target.type !== 'device-interface') return false;
    const { deviceId, interfaceId } = ctx.fault.target;
    const lowAlarm = typeof ctx.fault.params.lowAlarmDbm === 'number' ? ctx.fault.params.lowAlarmDbm : -24;
    return cliActions(ctx).some(
      (a) =>
        endpointIsDevice(a.endpoint, deviceId) &&
        a.facts.some((f) => f.kind === 'transceiver-observed' && f.interfaceId === interfaceId && f.rxPowerDbm !== null && f.rxPowerDbm < lowAlarm),
    );
  };
}

function hostFacts(ctx: EvidenceContext, hostId: string) {
  return cliActions(ctx).filter((a) => a.endpoint.kind === 'host' && a.endpoint.hostId === hostId);
}

export function hostPing(hostId: string, target: string | ((t: string) => boolean), delivered: 'all' | 'none' | 'partial'): EvidencePredicate {
  return (ctx) =>
    hostFacts(ctx, hostId).some((a) => {
      const fact = a.facts.find((f): f is Extract<CliFact, { kind: 'ping' }> => f.kind === 'ping');
      if (!fact) return false;
      const targetOk = typeof target === 'function' ? target(fact.target) : fact.target === target;
      if (!targetOk) return false;
      if (delivered === 'all') return fact.sent > 0 && fact.delivered === fact.sent;
      if (delivered === 'none') return fact.delivered === 0;
      return fact.delivered > 0 && fact.delivered < fact.sent;
    });
}

export function anyPingPartial(): EvidencePredicate {
  return (ctx) =>
    cliActions(ctx).some((a) => {
      const fact = a.facts.find((f): f is Extract<CliFact, { kind: 'ping' }> => f.kind === 'ping');
      return !!fact && fact.delivered > 0 && fact.delivered < fact.sent;
    });
}

export function anyPingNone(): EvidencePredicate {
  return (ctx) =>
    cliActions(ctx).some((a) => {
      const fact = a.facts.find((f): f is Extract<CliFact, { kind: 'ping' }> => f.kind === 'ping');
      return !!fact && fact.sent > 0 && fact.delivered === 0;
    });
}

export function anyPingAll(): EvidencePredicate {
  return (ctx) => cliActions(ctx).some((a) => a.facts.some((f) => f.kind === 'ping' && f.sent > 0 && f.delivered === f.sent));
}

export function hostAddressingObserved(hostId?: string): EvidencePredicate {
  return (ctx) =>
    cliActions(ctx).some(
      (a) => a.endpoint.kind === 'host' && (hostId === undefined || a.endpoint.hostId === hostId) && a.facts.some((f) => f.kind === 'host-addressing-observed'),
    );
}

export function hostApipa(hostId?: string, reason?: string): EvidencePredicate {
  return (ctx) =>
    cliActions(ctx).some(
      (a) =>
        a.endpoint.kind === 'host' &&
        (hostId === undefined || a.endpoint.hostId === hostId) &&
        a.facts.some((f) => f.kind === 'host-addressing-observed' && f.state === 'apipa' && (reason === undefined || f.reason === reason)),
    );
}

export function hostDnsFail(hostId?: string): EvidencePredicate {
  return (ctx) =>
    cliActions(ctx).some(
      (a) =>
        (hostId === undefined || (a.endpoint.kind === 'host' && a.endpoint.hostId === hostId)) &&
        a.facts.some((f) => f.kind === 'dns-lookup' && f.resolvedIp === null),
    );
}

export function dnsLookupStaleOrWrong(): EvidencePredicate {
  return (ctx) => {
    const actualIp = typeof ctx.fault.params.actualIp === 'string' ? ctx.fault.params.actualIp : undefined;
    return cliActions(ctx).some((a) =>
      a.facts.some((f) => f.kind === 'dns-lookup' && (f.stale || (actualIp !== undefined && f.resolvedIp !== null && f.resolvedIp !== actualIp))),
    );
  };
}

export function dnsLookupServerUnhealthy(): EvidencePredicate {
  return (ctx) => cliActions(ctx).some((a) => a.facts.some((f) => f.kind === 'dns-lookup' && (f.serverHealth === 'down' || f.serverHealth === 'degraded')));
}

export function pingActualIpAll(): EvidencePredicate {
  return (ctx) => {
    const actualIp = typeof ctx.fault.params.actualIp === 'string' ? ctx.fault.params.actualIp : null;
    if (actualIp === null) return false;
    return cliActions(ctx).some((a) => a.facts.some((f) => f.kind === 'ping' && f.target === actualIp && f.sent > 0 && f.delivered === f.sent));
  };
}

export function ontStatusIs(status: string): EvidencePredicate {
  return (ctx) => {
    const ontId = typeof ctx.fault.params.ontId === 'string' ? ctx.fault.params.ontId : null;
    return cliActions(ctx).some((a) => a.facts.some((f) => f.kind === 'ont-status-observed' && (ontId === null || f.ontId === ontId) && f.status === status));
  };
}

export function ontStatusLosCountAtLeast(min: number): EvidencePredicate {
  return (ctx) => {
    const seen = new Set<string>();
    for (const a of cliActions(ctx)) {
      for (const f of a.facts) {
        if (f.kind === 'ont-status-observed' && f.status === 'los') seen.add(f.ontId);
      }
    }
    return seen.size >= min;
  };
}

export function logObservedOnFaultDevice(): EvidencePredicate {
  return cliFactOnFaultDevice('log-observed');
}

// --- The table ---------------------------------------------------------------------------

export const EVIDENCE_RULES: Record<string, EvidenceSet[]> = {
  'fusion-splice-degraded': [[otdrResolves]],
  'connector-dirty': [[otdrResolves], [scopeFail()]],
  macrobend: [[otdrResolvesAtWavelengths(2)], [vflLeakAt()], [otdrResolves, powerMeterDownstreamBelowMin()]],
  'fiber-break': [[otdrResolves], [powerMeterDownstreamNull(), vflLeakAt()]],
  'mismatched-fiber-splice': [[otdrBidirectional]],
  'wrong-tube-continuity': [
    [otdrUnterminatedEndAtClosure(), recordsAtClosure()],
    [powerMeterDownstreamNull(), powerMeterAtClosure((dbm) => dbm !== null), recordsAtClosure()],
  ],
  'fat-power-out-of-spec': [[fatPowerOutOfSpec()]],
  'ont-unpowered': [
    [ontStatusIs('offline'), powerMeterAtSite((dbm) => dbm !== null && dbm >= 0)],
    [hostApipa(undefined, 'no-link'), powerMeterAtSite((dbm) => dbm !== null && dbm >= 0)],
  ],
  'ont-serial-mismatch': [[ontStatusIs('serial-mismatch')]],
  'rogue-ont': [[ontStatusIs('rogue')], [ontStatusLosCountAtLeast(2), logObservedOnFaultDevice()]],
  'vlan-wrong-access-port': [[anyOf(cliFactOnFaultDevice('interface-observed'), cliFactOnFaultDevice('vlan-table-observed')), anyOf(hostApipa(), anyPingNone())]],
  'trunk-missing-allowed-vlan': [[interfaceObservedOnFault(), anyPingNone()]],
  'trunk-native-vlan-mismatch': [[interfaceObservedOnFault(), anyPingNone()]],
  'duplex-speed-mismatch': [[interfaceObservedOnFault(), anyPingPartial()]],
  'port-security-violation-errdisabled': [[interfaceObservedOnFault()], [logObservedOnFaultDevice()]],
  'stp-unexpected-blocking': [[interfaceObservedOnFault()]],
  'dhcp-relay-missing-helper': [[hostApipa(undefined, 'no-helper'), cliFactOnFaultDevice('route-table-observed')]],
  'dhcp-scope-exhausted': [[hostApipa(), anyCliFactOnFaultDevice()]],
  'rogue-dhcp-server': [[hostAddressingObserved(), anyPingNone()]],
  'default-route-missing-or-wrong': [[cliFactOnFaultDevice('route-table-observed'), anyPingNone(), anyPingAll()]],
  'subnet-mask-typo-overlap': [[cliFactOnFaultDevice('route-table-observed')], [interfaceObservedOnFault()]],
  'acl-silent-drop': [[cliFactOnFaultDevice('route-table-observed'), cliFactOnFaultDevice('vlan-table-observed'), anyPingNone()]],
  'ospf-exstart-mtu-mismatch': [[interfaceObservedOnFault(), cliFactOnFaultDevice('route-table-observed')]],
  'dns-stale-record': [[dnsLookupStaleOrWrong(), pingActualIpAll()]],
  'dns-server-unresponsive': [[dnsLookupServerUnhealthy(), anyPingAll()], [hostDnsFail(), anyPingAll()]],
  'transceiver-rx-power-low': [[transceiverLowObservedOnFault()]],
  'locate-ticket-expired': [[recordsAtFaultLocation()], [truckRollToFaultSite()]],
  'dig-inside-tolerance-zone': [[recordsAtFaultLocation()], [truckRollToFaultSite()]],
  'aerial-strand-lasher-degraded': [[recordsAtFaultLocation()], [truckRollToFaultSite()]],
  'aerial-midspan-sag': [[recordsAtFaultLocation()], [truckRollToFaultSite()]],
  'aerial-down-guy-damage': [[recordsAtFaultLocation()], [truckRollToFaultSite()]],
  'aerial-clearance-violation': [[recordsAtFaultLocation()], [truckRollToFaultSite()]],
};
