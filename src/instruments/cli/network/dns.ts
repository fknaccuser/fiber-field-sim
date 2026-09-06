/**
 * DNS resolution: a hostname resolves through whichever server the requester actually
 * uses, subject to that server's reachability and health -- so a stale record or a dead
 * DNS server surfaces exactly the way it would on a real network: name lookups fail or
 * lie while the underlying IP path stays intact.
 */
import { createRng, deriveSeed, findDevice, findHost } from '../../../world';
import type { NetworkDeviceConfig, WorldState } from '../../../world';
import type { NetworkProfile } from '../../../profiles';
import type { Endpoint } from '../types';
import { ownerOfIp } from './addressing';
import { resolveHostAddressing } from './dhcp';
import { forward } from './forwarding';

export interface ResolveNameResult {
  ip: string | null;
  serverIp: string | null;
  stale: boolean;
  serverHealth: string | null;
  timedOut: boolean;
}

function lookupRecord(device: NetworkDeviceConfig, name: string) {
  return device.dnsRecords?.find((r) => r.hostname.toLowerCase() === name.toLowerCase()) ?? null;
}

/** `attemptCounter` should be the action index (or similar), so repeated lookups against a degraded server differ deterministically instead of always resolving the same way. */
export function resolveName(world: WorldState, network: NetworkProfile, requester: Endpoint, name: string, attemptCounter = 0): ResolveNameResult {
  let serverIp: string | null = null;
  let localAnswerDevice: NetworkDeviceConfig | null = null;

  if (requester.kind === 'host') {
    const host = findHost(world, requester.hostId);
    const addressing = resolveHostAddressing(world, network, host);
    serverIp = addressing.state === 'apipa' ? null : addressing.dns;
  } else {
    const device = findDevice(world, requester.deviceId);
    if (device.dnsResolverIp) {
      serverIp = device.dnsResolverIp;
    } else if (device.dnsRecords) {
      localAnswerDevice = device;
    }
  }

  if (localAnswerDevice) {
    const record = lookupRecord(localAnswerDevice, name);
    if (!record) return { ip: null, serverIp: null, stale: false, serverHealth: null, timedOut: false };
    return { ip: record.stale ? (record.resolvedIp ?? null) : record.actualIp, serverIp: null, stale: !!record.stale, serverHealth: null, timedOut: false };
  }

  if (!serverIp) return { ip: null, serverIp: null, stale: false, serverHealth: null, timedOut: false };

  const owner = ownerOfIp(world, network, serverIp);
  if (!owner || owner.kind !== 'device-interface') {
    return { ip: null, serverIp, stale: false, serverHealth: null, timedOut: true };
  }
  const serverDevice = findDevice(world, owner.deviceId);
  const health = serverDevice.dnsServerHealth ?? 'ok';

  const fwd = forward(world, network, requester, serverIp);
  if (!fwd.delivered) return { ip: null, serverIp, stale: false, serverHealth: health, timedOut: true };

  if (health === 'down') return { ip: null, serverIp, stale: false, serverHealth: health, timedOut: true };
  if (health === 'degraded') {
    const rng = createRng(deriveSeed(world.seed, 'dns', name, String(attemptCounter)));
    if (rng.next() < 0.5) return { ip: null, serverIp, stale: false, serverHealth: health, timedOut: true };
  }

  const record = lookupRecord(serverDevice, name);
  if (!record) return { ip: null, serverIp, stale: false, serverHealth: health, timedOut: false };
  return { ip: record.stale ? (record.resolvedIp ?? null) : record.actualIp, serverIp, stale: !!record.stale, serverHealth: health, timedOut: false };
}
