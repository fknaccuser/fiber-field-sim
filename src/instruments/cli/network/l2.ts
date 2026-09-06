/**
 * Layer 2: link/port usability, VLAN crossing rules (access/trunk/native-mismatch), and
 * a device-to-device BFS answering "can this VLAN actually get from A to B".
 */
import type { Duplex, InterfaceState, NetworkLink, WorldState } from '../../../world';
import { findDevice, findInterface } from '../../../world';
import type { NetworkProfile } from '../../../profiles';
import { deriveOntStatus } from './ontStatus';

export interface L2Attachment {
  deviceId: string;
  interfaceId?: string;
}

export function linkFor(world: WorldState, deviceId: string, interfaceId: string): NetworkLink | null {
  return (
    world.links.find(
      (l) =>
        (l.a.deviceId === deviceId && l.a.interfaceId === interfaceId) ||
        ('deviceId' in l.b && l.b.deviceId === deviceId && l.b.interfaceId === interfaceId),
    ) ?? null
  );
}

export function interfaceUsable(iface: InterfaceState): boolean {
  return (
    iface.adminStatus === 'up' &&
    iface.lineStatus === 'up' &&
    iface.portSecurity?.state !== 'err-disabled' &&
    iface.stpState !== 'blocking' &&
    iface.stpState !== 'disabled'
  );
}

function effectiveDuplex(self: Duplex, peerIsAuto: boolean): 'full' | 'half' {
  if (self !== 'auto') return self;
  return peerIsAuto ? 'full' : 'half'; // auto+auto negotiates full; auto against an explicit peer falls back to half
}

/** 0.4 when the two sides' effective duplex differs (a classic auto/manual mismatch), else 0. */
export function linkLossFraction(a: InterfaceState, b: InterfaceState): number {
  const aEff = effectiveDuplex(a.duplex, b.duplex === 'auto');
  const bEff = effectiveDuplex(b.duplex, a.duplex === 'auto');
  return aEff !== bEff ? 0.4 : 0;
}

/**
 * Loss fraction for a host-attachment link (a switch port with a customer laptop on
 * the other end). Host NICs aren't modeled as their own InterfaceState, so a
 * duplex-speed-mismatch fault applied to the switch port alone is treated as a mismatch
 * against an always-auto-negotiating host NIC -- the classic real-world case of one
 * side forced and the other auto.
 */
export function hostLinkLossFraction(switchIface: InterfaceState): number {
  return linkLossFraction(switchIface, { ...switchIface, duplex: 'auto' });
}

/** Whether `vlan` can cross a link between two device-to-device interfaces. */
export function vlanCrossesLink(a: InterfaceState, b: InterfaceState, vlan: number): boolean {
  if (!interfaceUsable(a) || !interfaceUsable(b)) return false;
  const aAccess = a.mode === 'access';
  const bAccess = b.mode === 'access';

  if (aAccess && bAccess) {
    return (a.accessVlan ?? 1) === vlan && (b.accessVlan ?? 1) === vlan;
  }

  if (!aAccess && !bAccess) {
    const inA = a.allowedVlans ? a.allowedVlans.includes(vlan) : true;
    const inB = b.allowedVlans ? b.allowedVlans.includes(vlan) : true;
    if (!inA || !inB) return false;
    const aNative = a.nativeVlan ?? 1;
    const bNative = b.nativeVlan ?? 1;
    const nativeMismatchStrandsThisVlan = vlan === aNative !== (vlan === bNative);
    return !nativeMismatchStrandsThisVlan;
  }

  const accessSide = aAccess ? a : b;
  const trunkSide = aAccess ? b : a;
  if ((accessSide.accessVlan ?? 1) !== vlan) return false;
  const inTrunk = trunkSide.allowedVlans ? trunkSide.allowedVlans.includes(vlan) : true;
  const trunkNative = trunkSide.nativeVlan ?? 1;
  return inTrunk && vlan !== trunkNative;
}

export interface L2ReachableResult {
  ok: boolean;
  lossFraction: number;
  blockedAt?: string;
}

/**
 * BFS across device-to-device links (host-attachment links are endpoints, not fabric
 * hops) restricted to links that carry `vlan`. A host attached to an ONT is a special
 * case: its attachment is the OLT's PON port, usable only while the ONT is optically
 * online -- this is where optical faults become logical symptoms.
 */
export function l2Reachable(world: WorldState, from: L2Attachment, to: L2Attachment, vlan: number): L2ReachableResult {
  if (from.interfaceId) {
    // A PON port id (an ONT-attached host's attachment) isn't a device.interfaces entry
    // -- its own usability was already decided by deriveOntStatus before this was
    // called, so only check usability here when it really is a regular interface.
    const fromIface = findDevice(world, from.deviceId).interfaces.find((i) => i.id === from.interfaceId);
    if (fromIface && !interfaceUsable(fromIface)) return { ok: false, lossFraction: 0, blockedAt: from.deviceId };
  }
  if (from.deviceId === to.deviceId) return { ok: true, lossFraction: 0 };

  const visited = new Set<string>([from.deviceId]);
  let frontier: Array<{ deviceId: string; lossFraction: number }> = [{ deviceId: from.deviceId, lossFraction: 0 }];

  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const current of frontier) {
      for (const link of world.links) {
        if (!('deviceId' in link.b)) continue; // host-attachment link, not a fabric hop
        const aIsCurrent = link.a.deviceId === current.deviceId;
        const bIsCurrent = link.b.deviceId === current.deviceId;
        if (!aIsCurrent && !bIsCurrent) continue;
        const localSide = aIsCurrent ? link.a : link.b;
        const remoteSide = aIsCurrent ? link.b : link.a;
        if (visited.has(remoteSide.deviceId)) continue;

        const localIface = findInterface(findDevice(world, localSide.deviceId), localSide.interfaceId);
        const remoteIface = findInterface(findDevice(world, remoteSide.deviceId), remoteSide.interfaceId);
        if (!vlanCrossesLink(localIface, remoteIface, vlan)) continue;

        const lossFraction = Math.max(current.lossFraction, linkLossFraction(localIface, remoteIface));
        if (remoteSide.deviceId === to.deviceId) return { ok: true, lossFraction };
        visited.add(remoteSide.deviceId);
        next.push({ deviceId: remoteSide.deviceId, lossFraction });
      }
    }
    frontier = next;
  }
  return { ok: false, lossFraction: 0, blockedAt: from.deviceId };
}

/** Resolves a host's L2 attachment point: a switch port, or (for an ONT-attached host) the OLT's PON port -- usable only while the ONT is optically online. */
export function attachmentForHost(
  world: WorldState,
  network: NetworkProfile,
  host: { id: string; attachedOntNodeId?: string; vlan?: number },
): { attachment: L2Attachment; vlan: number; usable: boolean } | null {
  if (host.attachedOntNodeId) {
    for (const device of world.devices) {
      for (const port of device.ponPorts ?? []) {
        const ont = port.onts.find((o) => o.ontNodeId === host.attachedOntNodeId);
        if (ont) {
          const status = deriveOntStatus(world, network, device, port, ont);
          return { attachment: { deviceId: device.id, interfaceId: port.id }, vlan: host.vlan ?? 1, usable: status.status === 'online' };
        }
      }
    }
    return null;
  }
  const link = world.links.find((l) => 'hostId' in l.b && l.b.hostId === host.id);
  if (!link) return null;
  const iface = findInterface(findDevice(world, link.a.deviceId), link.a.interfaceId);
  return { attachment: { deviceId: link.a.deviceId, interfaceId: link.a.interfaceId }, vlan: iface.accessVlan ?? 1, usable: interfaceUsable(iface) };
}
