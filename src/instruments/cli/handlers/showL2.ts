import { deriveSeed } from '../../../world';
import type { ProfileSet, VendorProfile } from '../../../profiles';
import { abbrev, cdpName } from '../format';
import { interfaceUsable } from '../network/l2';
import type { Handler } from './types';

export const showVlanBrief: Handler = (ctx) => {
  const device = ctx.device!;
  const families = ctx.vendorProfile.interfaceFamilies;
  const vlans = [{ id: 1, name: 'default' }, ...device.vlans.filter((v) => v.id !== 1)].sort((a, b) => a.id - b.id);
  const lines: string[] = ['VLAN Name                             Status    Ports', '---- -------------------------------- --------- -------------------------------'];
  for (const vlan of vlans) {
    const ports = device.interfaces
      .filter((i) => i.mode === 'access' && (i.accessVlan ?? 1) === vlan.id && !i.id.startsWith('Vlan'))
      .map((i) => abbrev(i.id, families))
      .join(', ');
    lines.push(`${String(vlan.id).padEnd(5)}${vlan.name.padEnd(33)}active    ${ports}`);
  }
  return { output: lines, facts: [{ kind: 'vlan-table-observed', deviceId: device.id }] };
};

export const showMacAddressTable: Handler = (ctx) => {
  const device = ctx.device!;
  const families = ctx.vendorProfile.interfaceFamilies;
  const entries: Array<{ mac: string; vlan: number; interfaceId: string }> = [...device.macTable];

  for (const link of ctx.world.links) {
    if (!('hostId' in link.b)) continue;
    if (link.a.deviceId !== device.id) continue;
    const iface = device.interfaces.find((i) => i.id === link.a.interfaceId);
    if (!iface || !interfaceUsable(iface)) continue;
    // A real switch only forwards on -- and therefore only learns MACs on -- a VLAN it
    // actually knows about. An access port assigned to a VLAN that was never created
    // (e.g. by a vlan-wrong-access-port fault pointing at a nonexistent VLAN) is
    // effectively inactive, so it must not appear here even though the port itself is
    // administratively/line up.
    const accessVlan = iface.accessVlan ?? 1;
    if (accessVlan !== 1 && !device.vlans.some((v) => v.id === accessVlan)) continue;
    const hostId = link.b.hostId;
    const host = ctx.world.hosts.find((h) => h.id === hostId);
    if (!host) continue;
    entries.push({ mac: host.macAddress, vlan: iface.accessVlan ?? 1, interfaceId: iface.id });
  }

  const deduped = Array.from(new Map(entries.map((e) => [e.mac, e])).values()).sort((a, b) => a.vlan - b.vlan || a.mac.localeCompare(b.mac));

  const lines: string[] = ['          Mac Address Table', '-------------------------------------------', '', 'Vlan    Mac Address       Type        Ports', '----    -----------       --------    -----'];
  for (const e of deduped) {
    lines.push(`${String(e.vlan).padStart(4)}    ${e.mac.padEnd(18)}${'DYNAMIC'.padEnd(12)}${abbrev(e.interfaceId, families)}`);
  }
  lines.push(`Total Mac Addresses for this criterion: ${deduped.length}`);
  return { output: lines, facts: [{ kind: 'mac-table-observed', deviceId: device.id }] };
};

const CDP_CAPABILITY_HEADER = [
  'Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge',
  '                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone,',
  '                  D - Remote, C - CVTA, M - Two-port Mac Relay',
  '',
];

function vendorProfileFor(profiles: ProfileSet, vendorProfileId: string): VendorProfile | undefined {
  return [profiles.oltVendor, profiles.switchVendor, profiles.hostShell].find((p) => p.id === vendorProfileId);
}

function capabilitiesFor(role: string | undefined): string {
  switch (role) {
    case 'switch':
      return 'S I';
    case 'l3-switch':
      return 'R S I';
    case 'router':
      return 'R';
    default:
      return 'H';
  }
}

export const showCdpNeighbors: Handler = (ctx) => {
  const device = ctx.device!;
  const families = ctx.vendorProfile.interfaceFamilies;
  const lines: string[] = [...CDP_CAPABILITY_HEADER, 'Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID', ''];
  let count = 0;

  for (const link of ctx.world.links) {
    if (!('deviceId' in link.b)) continue;
    const aIsThis = link.a.deviceId === device.id;
    const bIsThis = link.b.deviceId === device.id;
    if (!aIsThis && !bIsThis) continue;
    const localSide = aIsThis ? link.a : link.b;
    const remoteSide = aIsThis ? link.b : link.a;
    const localIface = device.interfaces.find((i) => i.id === localSide.interfaceId);
    const peerDevice = ctx.world.devices.find((d) => d.id === remoteSide.deviceId);
    if (!localIface || !peerDevice) continue;
    const peerIface = peerDevice.interfaces.find((i) => i.id === remoteSide.interfaceId);
    if (!peerIface) continue;
    const peerProfile = vendorProfileFor(ctx.profiles, peerDevice.vendorProfileId);
    if (!peerProfile?.cdpCapable) continue;
    if (!interfaceUsable(localIface) || !interfaceUsable(peerIface)) continue;

    const holdtime = 120 + (deriveSeed(ctx.world.seed, 'cdp-holdtime', device.id, localIface.id) % 60);
    const platform = peerDevice.platform ?? peerProfile.displayName;
    lines.push(
      `${peerDevice.hostname.padEnd(17)}${cdpName(localIface.id, families).padEnd(18)}${String(holdtime).padStart(3)}${''.padEnd(13)}${capabilitiesFor(peerDevice.role).padEnd(12)}${platform.padEnd(10)}${cdpName(peerIface.id, families)}`,
    );
    count++;
  }
  lines.push('', `Total cdp entries displayed : ${count}`);
  return { output: lines };
};
