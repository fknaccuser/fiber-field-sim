import type { UiSessionState } from '../../session/runner';
import type { DiagnosisClaim } from '../../session/types';
import type { FaultTarget } from '../../world';

export type NodeMark = 'current' | 'visited' | 'tested' | 'alarm' | 'claimed';
export type SpanMark = 'tested' | 'alarm' | 'claimed';

export interface MapOverlay {
  nodes: Record<string, NodeMark[]>;
  spans: Record<string, SpanMark[]>;
}

/**
 * Everything the map is allowed to highlight comes from two places only: what the trainee
 * has *observed* (the action log) and what the trainee *claims* (draft and submitted
 * diagnoses). The map never sees the answer key, so it can never leak it.
 */
export function buildMapOverlay(ui: UiSessionState, draftClaims: DiagnosisClaim[]): MapOverlay {
  const nodes: Record<string, Set<NodeMark>> = {};
  const spans: Record<string, Set<SpanMark>> = {};
  const node = (id: string, mark: NodeMark) => (nodes[id] ??= new Set()).add(mark);
  const span = (id: string, mark: SpanMark) => (spans[id] ??= new Set()).add(mark);
  const deviceNode = (deviceId: string) => ui.world.devices.find((d) => d.id === deviceId)?.topologyNodeId;

  node(ui.meta.startLocationNodeId, 'visited');
  node(ui.locationNodeId, 'current');

  for (const a of ui.log) {
    switch (a.type) {
      case 'truck-roll':
        node(a.fromNodeId, 'visited');
        node(a.toNodeId, 'visited');
        break;
      case 'otdr-shot':
        for (const id of a.pathSpanIds) span(id, 'tested');
        break;
      case 'power-meter':
        node(a.nodeId, a.dbm === null ? 'alarm' : 'tested');
        break;
      case 'vfl':
        span(a.spanId, a.leaks.length > 0 ? 'alarm' : 'tested');
        break;
      case 'scope':
        span(a.spanId, a.grade === 'fail' ? 'alarm' : 'tested');
        break;
      case 'cli': {
        if (a.endpoint.kind !== 'device') break;
        const id = deviceNode(a.endpoint.deviceId);
        if (!id) break;
        const bad = a.facts.some((f) => (f.kind === 'ont-status-observed' && f.status !== 'online') || (f.kind === 'transceiver-observed' && f.rxPowerDbm === null));
        node(id, bad ? 'alarm' : 'tested');
        break;
      }
      case 'diagnosis':
        for (const c of a.diagnosis.claims) markClaim(c.target);
        break;
      default:
        break;
    }
  }
  for (const c of draftClaims) markClaim(c.target);

  function markClaim(target: FaultTarget): void {
    switch (target.type) {
      case 'fiber-span':
        span(target.spanId, 'claimed');
        break;
      case 'site':
        node(target.nodeId, 'claimed');
        break;
      case 'device-global':
      case 'device-interface': {
        const id = deviceNode(target.deviceId);
        if (id) node(id, 'claimed');
        break;
      }
    }
  }

  return {
    nodes: Object.fromEntries(Object.entries(nodes).map(([k, v]) => [k, [...v]])),
    spans: Object.fromEntries(Object.entries(spans).map(([k, v]) => [k, [...v]])),
  };
}

const NODE_PRIORITY: NodeMark[] = ['claimed', 'alarm', 'current', 'tested', 'visited'];
const SPAN_PRIORITY: SpanMark[] = ['claimed', 'alarm', 'tested'];

export function dominantNodeMark(marks: NodeMark[] | undefined): NodeMark | null {
  return NODE_PRIORITY.find((m) => marks?.includes(m)) ?? null;
}

export function dominantSpanMark(marks: SpanMark[] | undefined): SpanMark | null {
  return SPAN_PRIORITY.find((m) => marks?.includes(m)) ?? null;
}
