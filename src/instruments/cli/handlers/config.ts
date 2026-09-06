/**
 * All configuration-mode handlers: interface/VLAN context entry, switchport/IP/route
 * mutation. Every handler here clones the world itself and returns the clone, per the
 * "same reference if unchanged, a clone if mutated" contract.
 */
import { cloneWorld, findDevice, findInterface } from '../../../world';
import type { Duplex, InterfaceState, NetworkDeviceConfig, WorldState } from '../../../world';
import { maskToPrefix, resolveInterfaceId } from '../format';
import { linkFor } from '../network/l2';
import type { Handler, HandlerContext, HandlerOutcome } from './types';

/** Clones the world, locates the current device and its in-context interface, runs `mutate`, and returns the standard config-changed outcome. */
function withInterface(ctx: HandlerContext, summary: string, mutate: (iface: InterfaceState, device: NetworkDeviceConfig, world: WorldState) => string[] | void): HandlerOutcome {
  const world = cloneWorld(ctx.world);
  const device = findDevice(world, ctx.device!.id);
  const iface = findInterface(device, ctx.session.contextInterfaceId!);
  const extra = mutate(iface, device, world) ?? [];
  return { output: extra, world, facts: [{ kind: 'config-changed', deviceId: device.id, summary }] };
}

export const enterInterfaceConfig: Handler = (ctx, params) => {
  const device = ctx.device!;
  const families = ctx.vendorProfile.interfaceFamilies;
  const resolvedId = resolveInterfaceId(params.id, device.interfaces.map((i) => i.id), families);
  if (resolvedId) return { output: [], session: { contextInterfaceId: resolvedId } };

  const sviMatch = /^Vlan(\d+)$/i.exec(params.id);
  if (!sviMatch) return { output: [`% Invalid input detected at '^' marker.`] };
  const newId = `Vlan${sviMatch[1]}`;
  const world = cloneWorld(ctx.world);
  const d = findDevice(world, device.id);
  d.interfaces.push({ id: newId, adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access' });
  return { output: [], world, session: { contextInterfaceId: newId } };
};

export const enterVlanConfig: Handler = (ctx, params) => {
  const id = Number(params.id);
  const world = cloneWorld(ctx.world);
  const device = findDevice(world, ctx.device!.id);
  if (!device.vlans.some((v) => v.id === id)) {
    device.vlans.push({ id, name: `VLAN${String(id).padStart(4, '0')}` });
  }
  return { output: [], world, session: { contextVlanId: id } };
};

export const vlanName: Handler = (ctx, params) => {
  const world = cloneWorld(ctx.world);
  const device = findDevice(world, ctx.device!.id);
  const vlan = device.vlans.find((v) => v.id === ctx.session.contextVlanId);
  if (vlan) vlan.name = params.name;
  return { output: [], world };
};

export const ifSwitchportMode: Handler = (ctx, params) => {
  if (params.mode !== 'access' && params.mode !== 'trunk') return { output: [`% Invalid input detected at '^' marker.`] };
  return withInterface(ctx, `switchport mode ${params.mode}`, (iface) => {
    iface.mode = params.mode as 'access' | 'trunk';
  });
};

export const ifAccessVlan: Handler = (ctx, params) => {
  const id = Number(params.id);
  const world = cloneWorld(ctx.world);
  const device = findDevice(world, ctx.device!.id);
  const iface = findInterface(device, ctx.session.contextInterfaceId!);
  const output: string[] = [];
  if (!device.vlans.some((v) => v.id === id)) {
    device.vlans.push({ id, name: `VLAN${String(id).padStart(4, '0')}` });
    output.push(`% Access VLAN does not exist. Creating vlan ${id}`);
  }
  iface.mode = 'access';
  iface.accessVlan = id;
  return { output, world, facts: [{ kind: 'config-changed', deviceId: device.id, summary: `switchport access vlan ${id}` }] };
};

function parseVlanList(list: string): number[] {
  const result: number[] = [];
  for (const part of list.split(',')) {
    const range = /^(\d+)-(\d+)$/.exec(part.trim());
    if (range) {
      for (let v = Number(range[1]); v <= Number(range[2]); v++) result.push(v);
    } else if (part.trim()) {
      result.push(Number(part.trim()));
    }
  }
  return result;
}

export const ifTrunkAllowed: Handler = (ctx, params) =>
  withInterface(ctx, `switchport trunk allowed vlan ${params.list}`, (iface) => {
    iface.mode = 'trunk';
    iface.allowedVlans = parseVlanList(params.list);
  });

export const ifTrunkAllowedAdd: Handler = (ctx, params) =>
  withInterface(ctx, `switchport trunk allowed vlan add ${params.list}`, (iface) => {
    iface.mode = 'trunk';
    const merged = new Set([...(iface.allowedVlans ?? []), ...parseVlanList(params.list)]);
    iface.allowedVlans = Array.from(merged).sort((a, b) => a - b);
  });

export const ifTrunkNative: Handler = (ctx, params) =>
  withInterface(ctx, `switchport trunk native vlan ${params.id}`, (iface) => {
    iface.mode = 'trunk';
    iface.nativeVlan = Number(params.id);
  });

export const ifShutdown: Handler = (ctx) =>
  withInterface(ctx, 'shutdown', (iface) => {
    iface.adminStatus = 'administratively-down';
    iface.lineStatus = 'down';
  });

export const ifNoShutdown: Handler = (ctx) =>
  withInterface(ctx, 'no shutdown', (iface, device, world) => {
    iface.adminStatus = 'up';
    if (iface.portSecurity) iface.portSecurity.state = 'ok';

    const isSvi = iface.id.startsWith('Vlan');
    const hasHostAttached = world.links.some((l) => 'hostId' in l.b && l.a.deviceId === device.id && l.a.interfaceId === iface.id);
    const link = linkFor(world, device.id, iface.id);
    let peerUp = false;
    if (link && 'deviceId' in link.b) {
      const peerSide = link.a.deviceId === device.id ? link.b : link.a;
      const peerDevice = world.devices.find((d) => d.id === peerSide.deviceId);
      const peerIface = peerDevice?.interfaces.find((i) => i.id === peerSide.interfaceId);
      peerUp = peerIface?.adminStatus === 'up';
    }
    iface.lineStatus = isSvi || hasHostAttached || peerUp ? 'up' : 'down';
  });

export const ifDuplex: Handler = (ctx, params) =>
  withInterface(ctx, `duplex ${params.mode}`, (iface) => {
    iface.duplex = params.mode as Duplex;
  });

export const ifSpeed: Handler = (ctx, params) =>
  withInterface(ctx, `speed ${params.value}`, (iface) => {
    if (params.value === 'auto') iface.duplex = 'auto';
    else iface.speedMbps = Number(params.value);
  });

export const ifIpAddress: Handler = (ctx, params) =>
  withInterface(ctx, `ip address ${params.ip} ${params.mask}`, (iface) => {
    iface.ipAddress = params.ip;
    iface.prefixLength = maskToPrefix(params.mask);
  });

export const ifIpHelper: Handler = (ctx, params) => {
  const ifaceId = ctx.session.contextInterfaceId!;
  if (!ifaceId.startsWith('Vlan')) return { output: [`% Invalid input detected at '^' marker.`] };
  const vlanNum = Number(ifaceId.replace('Vlan', ''));
  const world = cloneWorld(ctx.world);
  const device = findDevice(world, ctx.device!.id);
  const list = device.dhcp ?? (device.dhcp = []);
  let entry = list.find((d) => d.vlan === vlanNum);
  if (!entry) {
    entry = { vlan: vlanNum, helperAddresses: [] };
    list.push(entry);
  }
  if (!entry.helperAddresses.includes(params.ip)) entry.helperAddresses.push(params.ip);
  return { output: [], world, facts: [{ kind: 'config-changed', deviceId: device.id, summary: `ip helper-address ${params.ip} on ${ifaceId}` }] };
};

export const ifIpHelperRemove: Handler = (ctx, params) => {
  const ifaceId = ctx.session.contextInterfaceId!;
  const vlanNum = Number(ifaceId.replace('Vlan', ''));
  const world = cloneWorld(ctx.world);
  const device = findDevice(world, ctx.device!.id);
  const entry = device.dhcp?.find((d) => d.vlan === vlanNum);
  if (entry) entry.helperAddresses = entry.helperAddresses.filter((h) => h !== params.ip);
  return { output: [], world };
};

export const ifDescription: Handler = (ctx, params) =>
  withInterface(ctx, `description ${params.rest}`, (iface) => {
    iface.description = params.rest;
  });

export const ipRouteAdd: Handler = (ctx, params) => {
  const world = cloneWorld(ctx.world);
  const device = findDevice(world, ctx.device!.id);
  const prefix = maskToPrefix(params.mask);
  const cidr = `${params.network}/${prefix}`;
  device.routeTable = device.routeTable.filter((r) => r.network !== cidr);
  device.routeTable.push({ network: cidr, nextHop: params.nexthop, source: params.mask === '0.0.0.0' ? 'default' : 'static' });
  return { output: [], world, facts: [{ kind: 'config-changed', deviceId: device.id, summary: `ip route ${cidr} via ${params.nexthop}` }] };
};

export const ipRouteRemove: Handler = (ctx, params) => {
  const world = cloneWorld(ctx.world);
  const device = findDevice(world, ctx.device!.id);
  const prefix = maskToPrefix(params.mask);
  const cidr = `${params.network}/${prefix}`;
  device.routeTable = device.routeTable.filter((r) => !(r.network === cidr && r.nextHop === params.nexthop));
  return { output: [], world };
};
