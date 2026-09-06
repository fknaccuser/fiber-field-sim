/** Presence rules (must you physically be somewhere to do this?) and travel time between nodes. */
import { deviceIdAt, findDevice, findHost, findSpan } from '../world';
import type { WorldState } from '../world';
import type { Intent, ScenarioMeta } from './types';

/** A device's physical location: its own topologyNodeId (required for role 'olt'), or the 'network-device' node whose attributes.deviceId matches it. */
export function deviceLocationNodeId(world: WorldState, deviceId: string): string | null {
  const device = findDevice(world, deviceId);
  if (device.topologyNodeId) return device.topologyNodeId;
  const node = world.topology.nodes.find((n) => n.kind === 'network-device' && deviceIdAt(n) === deviceId);
  return node?.id ?? null;
}

export interface PresenceCheck {
  ok: boolean;
  reason?: string;
}

export function checkPresence(world: WorldState, meta: ScenarioMeta, locationNodeId: string, intent: Intent): PresenceCheck {
  switch (intent.type) {
    case 'otdr-shot':
      return locationNodeId === intent.access.accessNodeId ? { ok: true } : { ok: false, reason: `must be at ${intent.access.accessNodeId} to plug in the OTDR` };
    case 'power-meter':
      return locationNodeId === intent.nodeId ? { ok: true } : { ok: false, reason: `must be at ${intent.nodeId}` };
    case 'excavate':
      return locationNodeId === intent.nodeId ? { ok: true } : { ok: false, reason: `must be at ${intent.nodeId}` };
    case 'vfl':
      return locationNodeId === intent.fromNodeId ? { ok: true } : { ok: false, reason: `must be at ${intent.fromNodeId}` };
    case 'scope': {
      const span = findSpan(world, intent.spanId);
      return locationNodeId === span.fromNodeId || locationNodeId === span.toNodeId
        ? { ok: true }
        : { ok: false, reason: `must be at one end of span ${intent.spanId}` };
    }
    case 'cli': {
      if (intent.endpoint.kind === 'device') {
        if (meta.remoteCliAccess) return { ok: true };
        const nodeId = deviceLocationNodeId(world, intent.endpoint.deviceId);
        return nodeId && locationNodeId === nodeId ? { ok: true } : { ok: false, reason: `must be on-site with ${intent.endpoint.deviceId}` };
      }
      if (meta.remoteHostAccess) return { ok: true };
      const host = findHost(world, intent.endpoint.hostId);
      return locationNodeId === host.premiseNodeId ? { ok: true } : { ok: false, reason: 'must be at the customer premise' };
    }
    default:
      return { ok: true }; // truck-roll, records, customer-contact, hint, diagnosis carry no presence requirement
  }
}

export function travelTimeSeconds(meta: ScenarioMeta, fromNodeId: string, toNodeId: string): number {
  const pair = meta.travelSeconds.pairs.find((p) => (p.from === fromNodeId && p.to === toNodeId) || (p.from === toNodeId && p.to === fromNodeId));
  return pair ? pair.seconds : meta.travelSeconds.default;
}
