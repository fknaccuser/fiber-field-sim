/**
 * IPv4 addressing primitives, plus `ownerOfIp` -- the single place that answers "which
 * device interface or host currently has this IP", used throughout forwarding, DNS, and
 * DHCP resolution.
 */
import type { RouteEntry, WorldState } from '../../../world';
import type { NetworkProfile } from '../../../profiles';
import { resolveHostAddressing } from './dhcp';

export function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function networkAddress(ip: string, prefixLength: number): string {
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return intToIp(ipToInt(ip) & mask);
}

export function cidrContains(cidr: string, ip: string): boolean {
  const [network, prefixStr] = cidr.split('/');
  const prefix = Number(prefixStr);
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipToInt(network) & mask) === (ipToInt(ip) & mask);
}

/** Longest-prefix match over a route table; ties keep the first (route-table order). Returns null if nothing matches. */
export function longestPrefixMatch(routes: readonly RouteEntry[], ip: string): RouteEntry | null {
  let best: RouteEntry | null = null;
  let bestPrefix = -1;
  for (const route of routes) {
    const prefix = Number(route.network.split('/')[1] ?? '0');
    if (cidrContains(route.network, ip) && prefix > bestPrefix) {
      best = route;
      bestPrefix = prefix;
    }
  }
  return best;
}

export type IpOwner = { kind: 'device-interface'; deviceId: string; interfaceId: string } | { kind: 'host'; hostId: string };

/** Finds whichever device interface or host currently holds `ip`. Hosts are checked via their *resolved* addressing (DHCP-assigned or APIPA), not just static config. */
export function ownerOfIp(world: WorldState, network: NetworkProfile, ip: string): IpOwner | null {
  for (const device of world.devices) {
    for (const iface of device.interfaces) {
      if (iface.ipAddress === ip) return { kind: 'device-interface', deviceId: device.id, interfaceId: iface.id };
    }
  }
  for (const host of world.hosts) {
    const addressing = resolveHostAddressing(world, network, host);
    if ('ip' in addressing && addressing.ip === ip) return { kind: 'host', hostId: host.id };
  }
  return null;
}
