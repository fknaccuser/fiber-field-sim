/**
 * Derives what IP a host is actually running today: static as configured, DHCP-assigned
 * when a relay path to a working scope exists, or APIPA (with the specific reason) when
 * it doesn't -- exactly the state a customer's `ipconfig` would show.
 */
import type { HostConfig, NetworkDeviceConfig, WorldState } from '../../../world';
import type { NetworkProfile } from '../../../profiles';
import type { Endpoint } from '../types';
import { intToIp, ipToInt, ownerOfIp } from './addressing';
import { attachmentForHost, l2Reachable } from './l2';
import { forward } from './forwarding';

export type ApipaReason = 'no-link' | 'no-dhcp' | 'no-helper' | 'scope-exhausted' | 'server-unreachable';

export type HostAddressingState =
  | { state: 'static' | 'dhcp-assigned'; ip: string; prefixLength: number; gateway: string; dns: string; dhcpServerIp?: string }
  | { state: 'apipa'; ip: string; reason: ApipaReason };

function apipaIp(worldSeed: number, hostIndex: number): string {
  return `169.254.${(worldSeed % 254) + 1}.${hostIndex + 1}`;
}

function findGatewayDevice(world: WorldState, hostAttachment: ReturnType<typeof attachmentForHost>, vlan: number): NetworkDeviceConfig | null {
  if (!hostAttachment) return null;
  for (const device of world.devices) {
    const svi = device.interfaces.find((i) => i.id === `Vlan${vlan}` && i.ipAddress);
    if (svi && l2Reachable(world, hostAttachment.attachment, { deviceId: device.id }, vlan).ok) return device;
  }
  return null;
}

/** Index of `host` among all hosts sharing the same effective VLAN, in world.hosts order -- used to hand out stable sequential DHCP/APIPA addresses. */
function hostIndexOnVlan(world: WorldState, network: NetworkProfile, host: HostConfig, vlan: number): number {
  const sameVlan = world.hosts.filter((h) => attachmentForHost(world, network, h)?.vlan === vlan);
  return Math.max(0, sameVlan.findIndex((h) => h.id === host.id));
}

export function resolveHostAddressing(world: WorldState, network: NetworkProfile, host: HostConfig): HostAddressingState {
  if (host.addressing.mode === 'static') {
    const a = host.addressing;
    return { state: 'static', ip: a.ip, prefixLength: a.prefixLength, gateway: a.gateway, dns: a.dns };
  }

  const attachment = attachmentForHost(world, network, host);
  if (!attachment || !attachment.usable) {
    return { state: 'apipa', ip: apipaIp(world.seed, 0), reason: 'no-link' };
  }
  const vlan = attachment.vlan;
  const hostIndex = hostIndexOnVlan(world, network, host, vlan);

  const gateway = findGatewayDevice(world, attachment, vlan);
  if (!gateway) return { state: 'apipa', ip: apipaIp(world.seed, hostIndex), reason: 'no-link' };

  const entry = gateway.dhcp?.find((d) => d.vlan === vlan);
  if (!entry) return { state: 'apipa', ip: apipaIp(world.seed, hostIndex), reason: 'no-dhcp' };

  const hasHelpers = entry.helperAddresses.length > 0;
  if (!hasHelpers && !entry.scope) return { state: 'apipa', ip: apipaIp(world.seed, hostIndex), reason: 'no-helper' };

  let dhcpServerIp: string | undefined;
  if (hasHelpers) {
    const helper = entry.helperAddresses[0];
    const owner = ownerOfIp(world, network, helper);
    if (!owner) return { state: 'apipa', ip: apipaIp(world.seed, hostIndex), reason: 'server-unreachable' };
    const gatewayEndpoint: Endpoint = { kind: 'device', deviceId: gateway.id };
    const fwd = forward(world, network, gatewayEndpoint, helper, 'icmp');
    if (!fwd.delivered) return { state: 'apipa', ip: apipaIp(world.seed, hostIndex), reason: 'server-unreachable' };
    dhcpServerIp = helper;
  }

  if (!entry.scope) return { state: 'apipa', ip: apipaIp(world.seed, hostIndex), reason: 'no-helper' };
  if (entry.scope.leased >= entry.scope.poolSize) return { state: 'apipa', ip: apipaIp(world.seed, hostIndex), reason: 'scope-exhausted' };

  const svi = gateway.interfaces.find((i) => i.id === `Vlan${vlan}`)!;
  const sviIp = svi.ipAddress!;
  const gatewayIp = entry.rogueDetected ? entry.rogueDetected.rogueGateway : sviIp;
  const dns = entry.dnsServerIp ?? sviIp;
  const [baseIp, prefixStr] = entry.scope.network.split('/');
  const assignedIp = intToIp(ipToInt(baseIp) + 100 + hostIndex);
  const prefixLength = Number(prefixStr);

  return { state: 'dhcp-assigned', ip: assignedIp, prefixLength, gateway: gatewayIp, dns, dhcpServerIp };
}
