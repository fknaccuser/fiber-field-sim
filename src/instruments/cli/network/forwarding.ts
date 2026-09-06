/**
 * Hop-by-hop L3 forwarding with ACLs -- the engine behind ping/traceroute. Faults become
 * symptoms here: a wrong VLAN, a missing route, a native-VLAN mismatch, or an ACL all
 * surface as a specific, distinguishable failure point along the path.
 */
import type { NetworkDeviceConfig, RouteEntry, WorldState } from '../../../world';
import { findDevice, findHost, findInterface } from '../../../world';
import type { NetworkProfile } from '../../../profiles';
import type { Endpoint } from '../types';
import { cidrContains, longestPrefixMatch, networkAddress, ownerOfIp } from './addressing';
import { attachmentForHost, hostLinkLossFraction, interfaceUsable, l2Reachable } from './l2';
import { resolveHostAddressing } from './dhcp';

export type FailureAt =
  | 'source-no-route'
  | 'source-interface-down'
  | 'l2-blocked'
  | 'next-hop-unreachable'
  | 'acl-denied'
  | 'no-route-at-hop'
  | 'destination-unreachable'
  | 'ttl-exceeded';

export interface Hop {
  deviceId: string;
  ingressIp: string | null;
}

export interface ForwardResult {
  delivered: boolean;
  hops: Hop[];
  failure?: { at: FailureAt; hopIndex: number; detail: string };
  lossFraction: number;
}

function effectiveRoutesFor(device: NetworkDeviceConfig): RouteEntry[] {
  const connected: RouteEntry[] = [];
  for (const iface of device.interfaces) {
    if (iface.ipAddress && iface.prefixLength != null) {
      connected.push({
        network: `${networkAddress(iface.ipAddress, iface.prefixLength)}/${iface.prefixLength}`,
        interfaceId: iface.id,
        source: 'connected',
      });
    }
  }
  const combined = [...connected];
  for (const r of device.routeTable) {
    if (!combined.some((c) => c.network === r.network)) combined.push(r);
  }
  return combined;
}

function aclDeniesAt(
  device: NetworkDeviceConfig,
  interfaceId: string,
  direction: 'in' | 'out',
  srcIp: string | null,
  dstIp: string,
  protocol: string,
): boolean {
  for (const acl of device.acls ?? []) {
    if (!acl.appliedTo?.some((a) => a.interfaceId === interfaceId && a.direction === direction)) continue;
    if (!acl.match) {
      if (acl.action === 'deny') return true;
      continue;
    }
    const protoMatches = acl.match.protocol === 'ip' || acl.match.protocol === protocol;
    const srcMatches = srcIp === null || cidrContains(acl.match.srcCidr, srcIp);
    const dstMatches = cidrContains(acl.match.dstCidr, dstIp);
    if (protoMatches && srcMatches && dstMatches) return acl.action === 'deny';
  }
  return false;
}

export function forward(world: WorldState, network: NetworkProfile, src: Endpoint, dstIp: string, protocol: 'icmp' = 'icmp', ttlMax = 30): ForwardResult {
  const hops: Hop[] = [];
  let lossFraction = 0;
  let srcIp: string | null = null;
  let currentDeviceId: string;
  let currentIngressInterfaceId: string | null = null;

  if (src.kind === 'host') {
    const host = findHost(world, src.hostId);
    const addressing = resolveHostAddressing(world, network, host);
    if (addressing.state === 'apipa') {
      return { delivered: false, hops, failure: { at: 'source-no-route', hopIndex: 0, detail: 'host has no usable address' }, lossFraction };
    }
    srcIp = addressing.ip;
    const attachment = attachmentForHost(world, network, host);
    if (!attachment || !attachment.usable) {
      return { delivered: false, hops, failure: { at: 'l2-blocked', hopIndex: 0, detail: 'host attachment not usable' }, lossFraction };
    }
    const hostSubnet = `${networkAddress(addressing.ip, addressing.prefixLength)}/${addressing.prefixLength}`;
    const inSubnet = cidrContains(hostSubnet, dstIp);
    const targetIp = inSubnet ? dstIp : addressing.gateway;
    const owner = ownerOfIp(world, network, targetIp);
    if (!owner || owner.kind !== 'device-interface') {
      return { delivered: false, hops, failure: { at: 'next-hop-unreachable', hopIndex: 0, detail: `no device owns ${targetIp}` }, lossFraction };
    }
    const l2 = l2Reachable(world, attachment.attachment, { deviceId: owner.deviceId }, attachment.vlan);
    if (!l2.ok) {
      return { delivered: false, hops, failure: { at: 'l2-blocked', hopIndex: 0, detail: `vlan ${attachment.vlan} blocked reaching ${owner.deviceId}` }, lossFraction };
    }
    lossFraction = Math.max(lossFraction, l2.lossFraction);
    if (!host.attachedOntNodeId && attachment.attachment.interfaceId) {
      // A switch-port attachment: fold in the host's own access port's duplex/speed
      // mismatch loss, since l2Reachable's BFS only covers device-to-device fabric hops.
      const hostPortIface = findInterface(findDevice(world, attachment.attachment.deviceId), attachment.attachment.interfaceId);
      lossFraction = Math.max(lossFraction, hostLinkLossFraction(hostPortIface));
    }
    if (inSubnet && targetIp === dstIp) {
      const targetDevice = findDevice(world, owner.deviceId);
      const targetIface = findInterface(targetDevice, owner.interfaceId);
      hops.push({ deviceId: owner.deviceId, ingressIp: targetIface.ipAddress ?? null });
      // The packet still enters this interface -- an inbound ACL there applies even
      // though the destination is the interface's own address (matches real IOS: ACLs
      // are checked before the "is this address mine" delivery decision).
      if (aclDeniesAt(targetDevice, targetIface.id, 'in', srcIp, dstIp, protocol)) {
        return { delivered: false, hops, failure: { at: 'acl-denied', hopIndex: 0, detail: `inbound ACL on ${targetIface.id}` }, lossFraction };
      }
      return { delivered: true, hops, lossFraction };
    }
    currentDeviceId = owner.deviceId;
    currentIngressInterfaceId = owner.interfaceId;
  } else {
    currentDeviceId = src.deviceId;
    const device = findDevice(world, src.deviceId);
    srcIp = device.interfaces.find((i) => i.ipAddress)?.ipAddress ?? null;
  }

  for (let hopIndex = 0; hopIndex < ttlMax; hopIndex++) {
    const device = findDevice(world, currentDeviceId);
    const ingressIface = currentIngressInterfaceId ? findInterface(device, currentIngressInterfaceId) : null;
    hops.push({ deviceId: device.id, ingressIp: ingressIface?.ipAddress ?? null });

    if (ingressIface && aclDeniesAt(device, ingressIface.id, 'in', srcIp, dstIp, protocol)) {
      return { delivered: false, hops, failure: { at: 'acl-denied', hopIndex, detail: `inbound ACL on ${ingressIface.id}` }, lossFraction };
    }

    if (device.interfaces.some((i) => i.ipAddress === dstIp)) {
      return { delivered: true, hops, lossFraction };
    }

    const routes = effectiveRoutesFor(device);
    const route = longestPrefixMatch(routes, dstIp);
    if (!route) {
      return {
        delivered: false,
        hops,
        failure: { at: hopIndex === 0 ? 'source-no-route' : 'no-route-at-hop', hopIndex, detail: `no route to ${dstIp} on ${device.id}` },
        lossFraction,
      };
    }

    let egressIface = route.interfaceId ? device.interfaces.find((i) => i.id === route.interfaceId) : undefined;
    if (!egressIface && route.nextHop) {
      egressIface = device.interfaces.find(
        (i) => i.ipAddress && i.prefixLength != null && cidrContains(`${networkAddress(i.ipAddress, i.prefixLength)}/${i.prefixLength}`, route.nextHop!),
      );
    }
    if (!egressIface || !interfaceUsable(egressIface)) {
      return {
        delivered: false,
        hops,
        failure: { at: hopIndex === 0 ? 'source-interface-down' : 'next-hop-unreachable', hopIndex, detail: `egress interface unusable on ${device.id}` },
        lossFraction,
      };
    }

    if (aclDeniesAt(device, egressIface.id, 'out', srcIp, dstIp, protocol)) {
      return { delivered: false, hops, failure: { at: 'acl-denied', hopIndex, detail: `outbound ACL on ${egressIface.id}` }, lossFraction };
    }

    if (route.source === 'connected') {
      const vlan = egressIface.id.startsWith('Vlan') ? Number(egressIface.id.replace('Vlan', '')) : egressIface.accessVlan ?? 1;
      const owner = ownerOfIp(world, network, dstIp);
      if (!owner) {
        return { delivered: false, hops, failure: { at: 'destination-unreachable', hopIndex, detail: `nobody owns ${dstIp}` }, lossFraction };
      }
      if (owner.kind === 'host') {
        const host = findHost(world, owner.hostId);
        const attachment = attachmentForHost(world, network, host);
        if (!attachment || !attachment.usable) {
          return { delivered: false, hops, failure: { at: 'l2-blocked', hopIndex, detail: `host ${host.id} unreachable at L2` }, lossFraction };
        }
        const l2 = l2Reachable(world, { deviceId: device.id, interfaceId: egressIface.id }, attachment.attachment, vlan);
        if (!l2.ok) {
          return { delivered: false, hops, failure: { at: 'l2-blocked', hopIndex, detail: `vlan ${vlan} blocked reaching ${host.id}` }, lossFraction };
        }
        const hostSideLoss = !host.attachedOntNodeId && attachment.attachment.interfaceId ? hostLinkLossFraction(egressIface) : 0;
        lossFraction = Math.max(lossFraction, l2.lossFraction, hostSideLoss);
        return { delivered: true, hops, lossFraction };
      }
      if (owner.deviceId !== device.id) {
        const l2 = l2Reachable(world, { deviceId: device.id, interfaceId: egressIface.id }, { deviceId: owner.deviceId }, vlan);
        if (!l2.ok) {
          return { delivered: false, hops, failure: { at: 'destination-unreachable', hopIndex, detail: `${dstIp} not reachable at L2` }, lossFraction };
        }
        lossFraction = Math.max(lossFraction, l2.lossFraction);
      }
      return { delivered: true, hops, lossFraction };
    }

    const nextOwner = route.nextHop ? ownerOfIp(world, network, route.nextHop) : null;
    if (!nextOwner || nextOwner.kind !== 'device-interface') {
      return { delivered: false, hops, failure: { at: 'next-hop-unreachable', hopIndex, detail: `next hop ${route.nextHop} unowned` }, lossFraction };
    }
    const vlan = egressIface.accessVlan ?? 1;
    if (nextOwner.deviceId !== device.id) {
      const l2 = l2Reachable(world, { deviceId: device.id, interfaceId: egressIface.id }, { deviceId: nextOwner.deviceId }, vlan);
      if (!l2.ok) {
        return { delivered: false, hops, failure: { at: 'next-hop-unreachable', hopIndex, detail: `L2 blocked to next hop ${route.nextHop}` }, lossFraction };
      }
      lossFraction = Math.max(lossFraction, l2.lossFraction);
    }
    currentDeviceId = nextOwner.deviceId;
    currentIngressInterfaceId = nextOwner.interfaceId;
  }

  return { delivered: false, hops, failure: { at: 'ttl-exceeded', hopIndex: ttlMax, detail: 'TTL exceeded' }, lossFraction };
}
