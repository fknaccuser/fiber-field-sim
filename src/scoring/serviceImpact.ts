/**
 * Service impact: how many premises were actually out, and for how long relative to the
 * reference solution.
 *
 * This used to be called customer impact, which read as though the technician's relationship
 * with those subscribers were being scored. It never was. A field technician does not speak
 * to them — NOC does — and the axis measures the only thing the technician controls: how
 * long service stayed down while they worked. The subscribers are still counted, because
 * they are still out; the number is derived from the world, not from anybody being phoned.
 *
 * Evaluated on the frozen `initialWorld` -- Stage 1 has no mid-session repairs, so a
 * premise's affected status never changes over the session.
 */
import type { HostConfig, NetworkDeviceConfig, OntRecord, PonPortState, WorldState } from '../world';
import type { ProfileSet } from '../profiles';
import type { ScenarioMeta, SessionState } from '../session/types';
import type { Endpoint } from '../instruments/cli';
import { deriveOntStatus, forward, resolveHostAddressing, resolveName } from '../instruments/cli';
import type { AxisScore } from './types';
import { clamp } from './util';

function findOntContext(world: WorldState, ontNodeId: string): { olt: NetworkDeviceConfig; pon: PonPortState; ont: OntRecord } | null {
  for (const device of world.devices) {
    if (device.role !== 'olt') continue;
    for (const port of device.ponPorts ?? []) {
      const ont = port.onts.find((o) => o.ontNodeId === ontNodeId);
      if (ont) return { olt: device, pon: port, ont };
    }
  }
  return null;
}

function isCustomerAffected(world: WorldState, profiles: ProfileSet, meta: ScenarioMeta, host: HostConfig): boolean {
  if (host.attachedOntNodeId) {
    const ontCtx = findOntContext(world, host.attachedOntNodeId);
    if (ontCtx && deriveOntStatus(world, profiles.network, ontCtx.olt, ontCtx.pon, ontCtx.ont).status !== 'online') return true;
  }

  const addressing = resolveHostAddressing(world, profiles.network, host);
  if (addressing.state === 'apipa') return true;

  const endpoint: Endpoint = { kind: 'host', hostId: host.id };
  const ping = forward(world, profiles.network, endpoint, addressing.gateway, 'icmp');
  if (!ping.delivered) return true;

  const dns = resolveName(world, profiles.network, endpoint, meta.serviceCheckHostname, 0);
  return dns.ip === null;
}

/** Premise-node ids of every customer-premise whose service is currently degraded. */
export function affectedCustomerIds(world: WorldState, profiles: ProfileSet, meta: ScenarioMeta): string[] {
  const affected: string[] = [];
  for (const node of world.topology.nodes) {
    if (node.kind !== 'customer-premise') continue;
    const host = world.hosts.find((h) => h.premiseNodeId === node.id);
    if (!host) continue;
    if (isCustomerAffected(world, profiles, meta, host)) affected.push(node.id);
  }
  return affected;
}

export function computeServiceImpact(state: SessionState): AxisScore {
  const affected = affectedCustomerIds(state.initialWorld, state.profiles, state.meta);
  if (affected.length === 0) {
    return { axis: 'serviceImpact', score: 100, details: ['No premises out of service.'] };
  }

  const customerMinutes = affected.length * (state.clockSeconds / 60);
  const refMinutes = state.meta.referenceSolution.affectedCustomerMinutes;
  const score = 100 * clamp(refMinutes / customerMinutes, 0, 1);
  return {
    axis: 'serviceImpact',
    score,
    details: [`${affected.length} premise(s) out for ${customerMinutes.toFixed(1)} minute(s) vs a ${refMinutes.toFixed(1)}-minute reference.`],
  };
}
