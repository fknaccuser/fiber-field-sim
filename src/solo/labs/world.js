// The lab world: a few routers, the cables between them, and everything that
// follows from their configuration: interface state, the routing table, OSPF
// neighbors and DR election, and whether a ping gets there and back.
//
// Device configuration is plain data so it can be saved, compared and copied.
// The derived state (routes, neighbors) is recomputed after every command by
// refresh(); only the few things IOS itself remembers between events (the
// OSPF router ID in use, who won a DR election) are stored.

import { parseIp, formatIp, maskToLen, lenToMask, network, inSubnet, wildcardMatch } from './ip4.js';
import {
  computeL2, enforce, nativeMismatches, physState, makeSwitchport, macFrom, OUI, keyOf,
  isSub, isSvi, isPo, isLoop, parentOf,
} from './switching.js';
import { aclPermits, natRole, natIn, natOut, natClaims, poolFor, lease, servesDhcp, dnsRecordsOf } from './services.js';

// The derived layer 2 state of each world, rebuilt by refresh().
const L2 = new WeakMap();
export function l2Of(world) {
  if (!L2.has(world)) L2.set(world, computeL2(world));
  return L2.get(world);
}

export const AD = { connected: 0, static: 1, ospf: 110 };

// ---------- building a world ----------

export function makeInterface(name, extra = {}) {
  const loop = name.startsWith('Loopback');
  return {
    name,
    ip: null, mask: null,
    shutdown: !loop,
    description: null,
    ospf: { priority: 1, cost: null, networkType: null, pid: null, area: null },
    ...extra,
  };
}

export function makeDevice(id, interfaceNames) {
  const config = {
    hostname: 'Router',
    enableSecret: null, enablePassword: null, banner: null,
    domain: null, sshVersion: null, servicePasswordEncryption: false,
    users: {},
    lines: { con: { login: null, password: null, transport: null, execTimeout: null }, vty: { login: null, password: null, transport: null, execTimeout: null } },
    interfaces: Object.fromEntries(interfaceNames.map(n => [n, makeInterface(n)])),
    statics: [],
    ospf: null,
  };
  return { id, kind: 'router', ports: [...interfaceNames], config, startup: null, rsaBits: null, ospfRid: null };
}

export const SWITCH_PORTS = [
  ...Array.from({ length: 24 }, (_, k) => `FastEthernet0/${k + 1}`),
  'GigabitEthernet0/1', 'GigabitEthernet0/2',
];

function switchConfig(ports) {
  const config = makeDevice('x', []).config;
  config.hostname = 'Switch';
  config.interfaces = Object.fromEntries(ports.map(n => [n, makeInterface(n, { shutdown: false, sw: makeSwitchport(), cdp: true })]));
  config.interfaces.Vlan1 = makeInterface('Vlan1');
  config.vlans = { 1: { name: 'default' } };
  config.defaultGateway = null;
  config.stp = { mode: 'pvst', prio: {}, bpduguardDefault: false, portfastDefault: false };
  config.cdp = true;
  config.lldp = false;
  return config;
}

// A Catalyst-style access switch: 24 FastEthernet ports, 2 Gigabit uplinks.
export function makeSwitch(id, { ports = SWITCH_PORTS, mac = null } = {}) {
  return { id, kind: 'switch', ports: [...ports], mac: mac ?? macFrom(`bridge|${id}`, OUI.switch), config: switchConfig(ports), startup: null, rsaBits: null, ospfRid: null, err: {} };
}

// A PC: one NIC, an address, a gateway.
export function makePc(id, { ip = null, mask = null, gateway = null, mac = null, services = [], dhcp = false, v6 = null, nic = null, server = null } = {}) {
  const config = makeDevice('x', []).config;
  config.hostname = id;
  // nic: { speed, duplex } for a device whose port is hard-set and cannot be changed from here.
  config.interfaces = { FastEthernet0: makeInterface('FastEthernet0', { shutdown: false, ip: ip === null ? null : parseIp(ip), mask: mask === null ? null : parseIp(mask), ...(nic ? { speed: nic.speed ?? 'auto', duplex: nic.duplex ?? 'auto' } : {}) }) };
  config.gateway = gateway === null ? null : parseIp(gateway);
  config.dns = null;
  // A server is a PC that listens: services lists its open TCP ports.
  config.services = [...services];
  config.dhcp = dhcp;
  // A server also runs DNS and DHCP services, set the way a server's
  // service pages set them (addresses given as text here, kept as numbers).
  if (server) config.server = makeServerConfig(server);
  // IPv6 keeps addresses as text: { addrs: [{ addr, len }], gw, auto }.
  config.v6 = v6 ? { addrs: [...(v6.addrs ?? [])], gw: v6.gw ?? null, auto: Boolean(v6.auto) } : { addrs: [], gw: null, auto: false };
  return { id, kind: 'pc', ports: ['FastEthernet0'], mac: mac ?? macFrom(`pc|${id}`, OUI.pc), config, startup: null, rsaBits: null, ospfRid: null };
}

const ipOrNull = (x) => (x === null || x === undefined || x === '' ? null : typeof x === 'number' ? x : parseIp(x));
export function makeServerConfig({ dns = {}, dhcp = {} } = {}) {
  return {
    dns: { on: Boolean(dns.on), records: Object.fromEntries(Object.entries(dns.records ?? {}).map(([n, a]) => [n, ipOrNull(a)])) },
    dhcp: { on: Boolean(dhcp.on), pools: (dhcp.pools ?? []).map(p => ({ name: p.name ?? 'serverPool', start: ipOrNull(p.start), mask: ipOrNull(p.mask), gateway: ipOrNull(p.gateway), dns: ipOrNull(p.dns), max: p.max ?? null })) },
  };
}

export function blankConfig(dev) {
  if (dev.kind === 'switch') return switchConfig(dev.ports);
  return makeDevice(dev.id, dev.ports).config;
}

// links: { id, ends: [[deviceId, interfaceName], ...], segment?: true }
// A two-ended link without segment is a cable; a segment is a switch, and a
// one-ended segment is a LAN with hosts the lab does not model.
export function makeWorld(devices, links) {
  const world = { devices: Object.fromEntries(devices.map(d => [d.id, d])), links, elections: {}, notices: {}, learned: {} };
  refresh(world);
  return world;
}

export const clone = (value) => JSON.parse(JSON.stringify(value));

// ---------- interface state ----------

export function interfaceState(world, deviceId, ifName) {
  const intf = world.devices[deviceId]?.config.interfaces[ifName];
  if (!intf) return { status: 'deleted', protocol: 'down', up: false };
  if (intf.shutdown) return { status: 'administratively down', protocol: 'down', up: false };
  if (isLoop(ifName)) return { status: 'up', protocol: 'up', up: true };
  if (isSub(ifName)) return interfaceState(world, deviceId, parentOf(ifName));
  if (isSvi(ifName)) {
    const up = Boolean(l2Of(world).sviUp[keyOf(deviceId, ifName)]);
    return { status: up ? 'up' : 'down', protocol: up ? 'up' : 'down', up };
  }
  if (isPo(ifName)) {
    const L = l2Of(world).lp[deviceId]?.find(x => x.name === ifName);
    const up = Boolean(L?.up);
    return { status: up ? 'up' : 'down', protocol: up ? 'up' : 'down', up };
  }
  return physState(world, deviceId, ifName);
}

function upInterfaces(world, deviceId) {
  const dev = world.devices[deviceId];
  return Object.values(dev.config.interfaces).filter(i => i.ip !== null && interfaceState(world, deviceId, i.name).up);
}

// ---------- OSPF ----------

function ospfArea(dev, intf) {
  const ospf = dev.config.ospf;
  if (!ospf || intf.ip === null) return null;
  if (intf.ospf.pid !== null && intf.ospf.pid === ospf.pid) return intf.ospf.area;
  const hit = ospf.networks.find(n => wildcardMatch(intf.ip, n.ip, n.wildcard));
  return hit ? hit.area : null;
}

export function ospfEnabled(world, deviceId, ifName) {
  const dev = world.devices[deviceId];
  const intf = dev.config.interfaces[ifName];
  return Boolean(dev.config.ospf && interfaceState(world, deviceId, ifName).up && ospfArea(dev, intf) !== null);
}

// The router ID is fixed once OSPF is running on an interface, the way IOS
// does it: a configured router-id first, then the highest loopback, then the
// highest active address. Changing it afterwards takes a process reset.
function candidateRid(world, deviceId) {
  const dev = world.devices[deviceId];
  if (dev.config.ospf?.routerId) return dev.config.ospf.routerId;
  const up = upInterfaces(world, deviceId);
  const loops = up.filter(i => i.name.startsWith('Loopback')).map(i => i.ip);
  const pool = loops.length ? loops : up.map(i => i.ip);
  return pool.length ? Math.max(...pool) >>> 0 : null;
}

function settleRouterIds(world) {
  for (const id of Object.keys(world.devices)) {
    const dev = world.devices[id];
    if (!dev.config.ospf) { dev.ospfRid = null; continue; }
    const running = Object.keys(dev.config.interfaces).some(n => ospfEnabled(world, id, n));
    if (!running) dev.ospfRid = null;
    else if (dev.ospfRid === null) dev.ospfRid = candidateRid(world, id);
  }
}

export const ospfCost = (intf) => intf.ospf.cost ?? 1;
const isPassive = (dev, ifName) => (dev.config.ospf?.passive ?? []).includes(ifName);
const netType = (intf) => intf.ospf.networkType ?? (intf.name.startsWith('Loopback') ? 'loopback' : 'broadcast');

// The broadcast domains: a cable, a shared segment, or everything one VLAN
// reaches through the switches.
const domains = (world) => l2Of(world).domains;
const domainOf = (world, deviceId, ifName) => domains(world).find(dm => dm.ends.some(([d, i]) => d === deviceId && i === ifName)) ?? null;

// Every OSPF speaker in a broadcast domain, ready to form adjacencies there.
function ospfMembers(world, link) {
  return link.ends
    .filter(([d, i]) => world.devices[d] && ospfEnabled(world, d, i) && !isPassive(world.devices[d], i) && world.devices[d].ospfRid !== null)
    .map(([d, i]) => {
      const dev = world.devices[d];
      const intf = dev.config.interfaces[i];
      return { device: d, intf: i, ip: intf.ip, len: maskToLen(intf.mask), area: ospfArea(dev, intf), rid: dev.ospfRid, priority: intf.ospf.priority, type: netType(intf) };
    });
}

// Two speakers on the same link become neighbors when they agree on subnet,
// area and network type and their router IDs differ.
function compatible(a, b) {
  return a.len === b.len && inSubnet(a.ip, b.ip, a.len) && a.area === b.area && a.type === b.type && a.rid !== b.rid;
}

// DR and BDR are elected once and kept: a better router arriving later does
// not take over until the election is rerun (clear ip ospf process).
function elect(members) {
  const eligible = members.filter(m => m.priority > 0)
    .sort((x, y) => (y.priority - x.priority) || (y.rid - x.rid));
  return { dr: eligible[0]?.device ?? null, bdr: eligible[1]?.device ?? null };
}

function runElections(world) {
  const live = new Set();
  for (const link of domains(world)) {
    live.add(link.id);
    const members = ministers(world, link);
    if (members.length === 0) { delete world.elections[link.id]; continue; }
    const eligible = new Set(members.filter(m => m.priority > 0).map(m => m.device));
    let e = world.elections[link.id];
    if (!e) e = elect(members);
    else {
      e = { ...e };
      // A DR that leaves or drops to priority 0 hands over to its BDR.
      if (e.dr && !eligible.has(e.dr)) { e.dr = e.bdr && eligible.has(e.bdr) ? e.bdr : null; e.bdr = null; }
      if (e.bdr && !eligible.has(e.bdr)) e.bdr = null;
      const best = (exclude) => elect(members.filter(m => !exclude.includes(m.device))).dr;
      if (!e.dr) e.dr = best([]);
      if (!e.bdr) e.bdr = best([e.dr].filter(Boolean));
    }
    world.elections[link.id] = e;
  }
  for (const id of Object.keys(world.elections)) if (!live.has(id)) delete world.elections[id];
}

function ministers(world, link) {
  return ospfMembers(world, link).filter(m => m.type === 'broadcast');
}

// neighbors(world, deviceId) -> [{ rid, priority, state, role, address, intf }]
export function neighbors(world, deviceId) {
  const out = [];
  for (const link of domains(world)) {
    const members = ospfMembers(world, link);
    const me = members.find(m => m.device === deviceId);
    if (!me) continue;
    const e = world.elections[link.id] ?? {};
    for (const other of members) {
      if (other.device === deviceId || !compatible(me, other)) continue;
      let state, role;
      if (me.type === 'point-to-point') { state = 'FULL'; role = '-'; }
      else {
        role = other.device === e.dr ? 'DR' : other.device === e.bdr ? 'BDR' : 'DROTHER';
        const full = [me.device, other.device].some(d => d === e.dr || d === e.bdr);
        state = full ? 'FULL' : '2WAY';
      }
      out.push({ rid: other.rid, priority: other.priority, state, role, address: other.ip, intf: me.intf, device: other.device });
    }
  }
  return out;
}

export function ospfRole(world, deviceId, ifName) {
  const dev = world.devices[deviceId];
  const intf = dev.config.interfaces[ifName];
  if (!ospfEnabled(world, deviceId, ifName)) return null;
  if (netType(intf) === 'loopback') return 'LOOP';
  const link = domainOf(world, deviceId, ifName);
  if (!link) return null;
  if (netType(intf) === 'point-to-point') return 'P2P';
  const e = world.elections[link.id];
  // Alone on its segment (or passive), a router is DR of nobody but itself.
  if (!e) return 'DR';
  return deviceId === e.dr ? 'DR' : deviceId === e.bdr ? 'BDR' : 'DROTH';
}

// Shortest paths over the OSPF adjacencies, then every OSPF-enabled network
// each router advertises. Loopbacks advertise as /32, as IOS does.
function ospfRoutes(world, deviceId) {
  if (!world.devices[deviceId].ospfRid) return [];
  const adj = {};
  for (const id of Object.keys(world.devices)) {
    adj[id] = neighbors(world, id).map(n => ({ to: n.device, cost: ospfCost(world.devices[id].config.interfaces[n.intf]), intf: n.intf, nh: n.address }));
  }
  const dist = { [deviceId]: 0 };
  const first = { [deviceId]: [] };
  const done = new Set();
  while (true) {
    const open = Object.keys(dist).filter(id => !done.has(id));
    if (!open.length) break;
    const u = open.reduce((a, b) => (dist[a] <= dist[b] ? a : b));
    done.add(u);
    for (const e of adj[u] ?? []) {
      const d = dist[u] + e.cost;
      const hop = u === deviceId
        ? [{ intf: e.intf, nh: e.nh ?? null }]
        : first[u];
      if (dist[e.to] === undefined || d < dist[e.to]) { dist[e.to] = d; first[e.to] = [...hop]; }
      else if (d === dist[e.to]) {
        for (const h of hop) if (!first[e.to].some(x => x.nh === h.nh)) first[e.to].push(h);
      }
    }
  }
  const mine = new Set(upInterfaces(world, deviceId).map(i => `${network(i.ip, maskToLen(i.mask))}/${maskToLen(i.mask)}`));
  const best = new Map();
  for (const [rid, d] of Object.entries(dist)) {
    if (rid === deviceId) continue;
    const dev = world.devices[rid];
    for (const intf of Object.values(dev.config.interfaces)) {
      if (!ospfEnabled(world, rid, intf.name)) continue;
      const loop = netType(intf) === 'loopback';
      const len = loop ? 32 : maskToLen(intf.mask);
      const net = network(intf.ip, len);
      const key = `${net}/${len}`;
      if (mine.has(key)) continue;
      const metric = d + ospfCost(intf);
      const prior = best.get(key);
      if (!prior || metric < prior.metric) best.set(key, { net, len, metric, hops: first[rid] });
      else if (metric === prior.metric) for (const h of first[rid]) if (!prior.hops.some(x => x.nh === h.nh)) prior.hops.push(h);
    }
  }
  return [...best.values()].map(r => ({ type: 'ospf', net: r.net, len: r.len, ad: AD.ospf, metric: r.metric, hops: r.hops.map(h => ({ nh: h.nh, intf: h.intf })) }));
}

// ---------- the routing table ----------

function connectedRoutes(world, deviceId) {
  const out = [];
  for (const intf of upInterfaces(world, deviceId)) {
    const len = maskToLen(intf.mask);
    out.push({ type: 'connected', net: network(intf.ip, len), len, ad: 0, metric: 0, hops: [{ nh: null, intf: intf.name }] });
    if (len < 32) out.push({ type: 'local', net: intf.ip, len: 32, ad: 0, metric: 0, hops: [{ nh: null, intf: intf.name }] });
  }
  return out;
}

function lookupIn(routes, ip) {
  let best = null;
  for (const r of routes) {
    if (inSubnet(ip, r.net, r.len) && (!best || r.len > best.len)) best = r;
  }
  return best;
}

// A static route is installed only when its next hop is reachable, or its
// exit interface is up.
function staticRoutes(world, deviceId, base) {
  const dev = world.devices[deviceId];
  const out = [];
  for (const s of dev.config.statics) {
    if (s.intf) {
      if (!interfaceState(world, deviceId, s.intf).up) continue;
      out.push({ type: 'static', net: s.net, len: s.len, ad: s.ad, metric: 0, hops: [{ nh: s.nh ?? null, intf: s.intf }] });
    } else {
      const via = lookupIn(base, s.nh);
      if (!via || via.type === 'static') continue;
      out.push({ type: 'static', net: s.net, len: s.len, ad: s.ad, metric: 0, hops: [{ nh: s.nh, intf: via.hops[0]?.intf ?? null }] });
    }
  }
  return out;
}

// A PC, or a switch that does not route, sends everything off its subnet to
// its default gateway.
function hostRoutes(world, deviceId) {
  const dev = world.devices[deviceId];
  const connected = connectedRoutes(world, deviceId);
  const gw = dev.kind === 'pc' ? dev.config.gateway : dev.config.defaultGateway;
  const via = gw !== null && gw !== undefined ? lookupIn(connected, gw) : null;
  const def = via ? [{ type: 'static', net: 0, len: 0, ad: 1, metric: 0, hops: [{ nh: gw, intf: via.hops[0].intf }] }] : [];
  return [...connected, ...def].sort((a, b) => (a.net - b.net) || (a.len - b.len));
}

export const isHost = (world, deviceId) => ['pc', 'switch'].includes(world.devices[deviceId]?.kind);

export function routingTable(world, deviceId) {
  if (isHost(world, deviceId)) return hostRoutes(world, deviceId);
  const connected = connectedRoutes(world, deviceId);
  const ospf = ospfRoutes(world, deviceId);
  const base = [...connected, ...ospf];
  const statics = staticRoutes(world, deviceId, base);
  const all = [...connected, ...statics, ...ospf];
  const byPrefix = new Map();
  for (const r of all) {
    const key = `${r.net}/${r.len}`;
    const cur = byPrefix.get(key);
    if (!cur || r.ad < cur.ad) byPrefix.set(key, { ...r, hops: [...r.hops] });
    else if (r.ad === cur.ad && r.type === cur.type) for (const h of r.hops) if (!cur.hops.some(x => x.nh === h.nh && x.intf === h.intf)) cur.hops.push(h);
  }
  return [...byPrefix.values()].sort((a, b) => (a.net - b.net) || (a.len - b.len));
}

export const lookup = (world, deviceId, ip) => lookupIn(routingTable(world, deviceId), ip);

// ---------- forwarding ----------

// Who answers ARP for this address among the interfaces that hear the
// sender: the next hop has to be in the same broadcast domain.
function ownerIn(world, ip, fromDevice, fromIntf) {
  const reach = l2Of(world).reach[keyOf(fromDevice, fromIntf)];
  if (!reach) return null;
  for (const k of reach.ends) {
    const [id, name] = k.split('|');
    if (id === fromDevice && name === fromIntf) continue;
    const intf = world.devices[id]?.config.interfaces[name];
    if (intf?.ip === ip && interfaceState(world, id, name).up) return { device: id, intf: name };
  }
  // The active HSRP router answers for the virtual address.
  const v = world.hsrpVip?.[ip];
  if (v && [...reach.ends].includes(`${v.device}|${v.intf}`)) return { device: v.device, intf: v.intf };
  // A NAT router answers for its static and pool addresses on the outside.
  for (const k of reach.ends) {
    const [id, name] = k.split('|');
    if (id === fromDevice) continue;
    if (natClaims(world.devices[id], name, ip) && interfaceState(world, id, name).up) return { device: id, intf: name };
  }
  return null;
}

// Every interface that put a frame on the wire is learned by the switches
// that frame crossed: that is what fills a MAC address table.
function heard(world, deviceId, ifName) {
  const reach = l2Of(world).reach[keyOf(deviceId, ifName)];
  world.learned ??= {};
  for (const sw of Object.keys(reach?.via ?? {})) {
    world.learned[sw] ??= {};
    world.learned[sw][keyOf(deviceId, ifName)] = true;
  }
}

const owns = (world, d, ip) => Object.values(world.devices[d].config.interfaces).some(i => i.ip === ip && interfaceState(world, d, i.name).up) || world.hsrpVip?.[ip]?.device === d;

// Walk one packet hop by hop: routing, ACLs in and out, and NAT where an
// inside interface meets an outside one.
// pkt = { src, dst, proto: 'icmp'|'tcp'|'udp', sport, dport, reply }
// Returns { ok, at, pkt, reason, hops: [{ device, ip }] }.
export function walk(world, fromDevice, pkt, { trail = null } = {}) {
  let at = fromDevice;
  let ingress = null;
  let p = { ...pkt };
  for (let hop = 0; hop < 20; hop += 1) {
    const dev = world.devices[at];
    if (ingress && natRole(dev, ingress) === 'outside') p = natIn(world, dev, p);
    if (owns(world, at, p.dst)) return { ok: true, at, pkt: p };
    // Hosts do not forward other people's packets.
    if (at !== fromDevice && isHost(world, at)) return { ok: false, reason: 'host', at, pkt: p };
    const route = lookup(world, at, p.dst);
    if (!route) return { ok: false, reason: 'no-route', at, pkt: p };
    const h = route.hops[0];
    if (!h.intf || !interfaceState(world, at, h.intf).up) return { ok: false, reason: 'down', at, pkt: p };
    if (!aclPermits(dev, h.intf, 'out', p)) return { ok: false, reason: 'acl', at, pkt: p, acl: { device: at, intf: h.intf, dir: 'out' } };
    if (ingress && natRole(dev, ingress) === 'inside' && natRole(dev, h.intf) === 'outside') {
      const q = natOut(world, dev, h.intf, p);
      if (!q) return { ok: false, reason: 'nat', at, pkt: p };
      p = q;
    }
    const target = route.type === 'connected' || route.type === 'local' || !h.nh ? p.dst : h.nh;
    heard(world, at, h.intf);
    const owner = ownerIn(world, target, at, h.intf);
    if (!owner) return { ok: false, reason: 'arp', at, pkt: p };
    heard(world, owner.device, owner.intf);
    if (!aclPermits(world.devices[owner.device], owner.intf, 'in', p)) return { ok: false, reason: 'acl', at: owner.device, pkt: p, acl: { device: owner.device, intf: owner.intf, dir: 'in' } };
    if (trail && owner.device !== fromDevice) trail.push({ device: owner.device, ip: world.devices[owner.device].config.interfaces[owner.intf].ip });
    at = owner.device;
    ingress = owner.intf;
  }
  return { ok: false, reason: 'loop', at, pkt: p };
}

// What a device answers on: ICMP always; TCP and UDP when a service is up.
export function listens(world, d, proto, port) {
  if (proto === 'icmp') return true;
  const dev = world.devices[d];
  if (proto === 'udp' && port === 67) return servesDhcp(dev);
  if (proto === 'udp' && port === 53) return dnsRecordsOf(dev) !== null;
  if (proto === 'udp' && port === 161) return Object.keys(dev.config.snmp?.communities ?? {}).length > 0;
  if (dev.kind === 'pc') return (dev.config.services ?? []).includes(port);
  if (proto === 'tcp' && port === 23) return ['telnet', 'all'].includes(dev.config.lines.vty.transport ?? 'all') && Boolean(dev.config.lines.vty.login);
  if (proto === 'tcp' && port === 22) return Boolean(dev.rsaBits) && ['ssh', 'all', 'ssh telnet'].includes(dev.config.lines.vty.transport ?? 'all');
  return false;
}

function sourceFor(world, deviceId, dst, source) {
  if (source !== null) return source;
  if (owns(world, deviceId, dst)) return dst;
  const route = lookup(world, deviceId, dst);
  if (!route) return null;
  return world.devices[deviceId].config.interfaces[route.hops[0].intf]?.ip ?? null;
}

// A request there and its reply back. proto/port default to a ping.
export function exchange(world, deviceId, dst, { source = null, proto = 'icmp', port = null } = {}) {
  const src = sourceFor(world, deviceId, dst, source);
  if (src === null) return { ok: false, reason: lookup(world, deviceId, dst) ? 'no-source' : 'no-route' };
  const sport = proto === 'icmp' ? null : 49152 + (dst % 1000);
  const there = walk(world, deviceId, { src, dst, proto, sport, dport: port, reply: false });
  if (!there.ok) return { ok: false, reason: there.reason, acl: there.acl, stage: 'there' };
  if (!listens(world, there.at, proto, port)) return { ok: false, reason: 'refused', stage: 'there' };
  const back = walk(world, there.at, { src: there.pkt.dst, dst: there.pkt.src, proto, sport: port, dport: sport, reply: true });
  if (!back.ok || back.at !== deviceId) return { ok: false, reason: back.reason ?? 'no-return', acl: back.acl, stage: 'back' };
  return { ok: true };
}

// tracert / traceroute: the address of each hop on the way there.
export function trace(world, deviceId, dst) {
  const trail = [];
  const src = sourceFor(world, deviceId, dst, null);
  if (src === null) return { ok: false, hops: [] };
  const r = walk(world, deviceId, { src, dst, proto: 'icmp', reply: false }, { trail });
  return { ok: r.ok, hops: trail };
}

// A PC asks for an address: its broadcast reaches every interface in its
// VLAN. A router there either serves it from a local pool for that subnet,
// or relays it to its ip helper-address, if the relay can reach the server.
// Returns { ok, ip, len, router, dns, server } or { ok: false, apipa }.
export function requestDhcp(world, pcId) {
  const pc = world.devices[pcId];
  const reach = l2Of(world).reach[keyOf(pcId, 'FastEthernet0')];
  for (const k of reach?.ends ?? []) {
    const [d, i] = k.split('|');
    const dev = world.devices[d];
    if (d === pcId || ((dev.kind ?? 'router') === 'pc' && !servesDhcp(dev))) continue;
    const intf = dev.config.interfaces[i];
    if (intf?.ip === null || intf?.ip === undefined || !interfaceState(world, d, i).up) continue;
    let server = null;
    if (poolFor(dev, intf.ip)) server = d;
    else if (intf.helper) {
      const r = exchange(world, d, intf.helper, { source: intf.ip, proto: 'udp', port: 67 });
      if (r.ok) server = Object.keys(world.devices).find(id => owns(world, id, intf.helper)) ?? null;
    }
    if (!server) continue;
    const hit = poolFor(world.devices[server], intf.ip);
    if (!hit) continue;
    const addr = lease(world, server, hit.name, pc.mac);
    if (addr === null) continue;
    return { ok: true, ip: addr, len: hit.pool.len, router: hit.pool.router, dns: hit.pool.dns, server };
  }
  return { ok: false };
}

// ping: there and back. source defaults to the exit interface's address.
export function ping(world, deviceId, dst, source = null) {
  return exchange(world, deviceId, dst, { source });
}

// ---------- after every change ----------

export function refresh(world) {
  world.notices ??= {};
  world.mismatch ??= {};
  let l2 = computeL2(world);
  // BPDU Guard and port security can shut ports, which changes the topology.
  for (let pass = 0; pass < 4; pass += 1) {
    const shut = enforce(world, l2);
    if (!shut.length) break;
    for (const [d, ...lines] of shut) (world.notices[d] ??= []).push(...lines);
    l2 = computeL2(world);
  }
  L2.set(world, l2);
  const now = {};
  for (const m of nativeMismatches(world, l2)) {
    now[m.key] = true;
    if (!world.mismatch[m.key]) (world.notices[m.device] ??= []).push(m.text);
  }
  world.mismatch = now;
  settleRouterIds(world);
  runElections(world);
  runHsrp(world);
  return world;
}

// ---------- HSRP ----------
// intf.hsrp = { [group]: { ip, priority, preempt } }
// Routers in one broadcast domain with the same group elect an active one:
// highest priority, then highest interface address. The active router
// answers for the virtual address. Like a DR, it keeps the job when a better
// router appears later, unless that router is set to preempt.
const hsrpRank = (a, b) => (b.priority - a.priority) || (b.ip - a.ip);
export function runHsrp(world) {
  world.hsrp ??= {};
  const vip = {};
  const live = new Set();
  const notes = [];
  for (const dom of domains(world)) {
    const groups = {};
    for (const [d, i] of dom.ends) {
      const dev = world.devices[d];
      const intf = dev?.config.interfaces[i];
      if (!intf?.hsrp || intf.ip === null || !interfaceState(world, d, i).up) continue;
      for (const [g, h] of Object.entries(intf.hsrp)) (groups[g] ??= []).push({ device: d, intf: i, ip: intf.ip, priority: h.priority ?? 100, preempt: Boolean(h.preempt), vip: h.ip ?? null });
    }
    for (const [g, members] of Object.entries(groups)) {
      const key = `${dom.id}:${g}`;
      live.add(key);
      const virtual = members.find(m => m.vip !== null)?.vip ?? null;
      const ranked = [...members].sort(hsrpRank);
      const prior = world.hsrp[key];
      let active = members.find(m => m.device === prior?.active) ?? null;
      const challenger = ranked.find(m => m.preempt && active && hsrpRank(m, active) < 0);
      if (!active || challenger) active = challenger ?? ranked[0];
      const standby = ranked.find(m => m.device !== active.device) ?? null;
      if (prior?.active !== active.device) notes.push([active.device, `%HSRP-6-STATECHANGE: ${active.intf} Grp ${g} state ${prior?.standby === active.device ? 'Standby' : 'Speak'} -> Active`]);
      world.hsrp[key] = { active: active.device, standby: standby?.device ?? null, group: Number(g), vip: virtual, members: members.map(m => ({ device: m.device, intf: m.intf, ip: m.ip, priority: m.priority, preempt: m.preempt })) };
      if (virtual !== null) vip[virtual] = { device: active.device, intf: active.intf };
    }
  }
  for (const k of Object.keys(world.hsrp)) if (!live.has(k)) delete world.hsrp[k];
  for (const [d, line] of notes) (world.notices[d] ??= []).push(line);
  world.hsrpVip = vip;
}

// The log lines a device has queued since its console last printed.
export function takeNotices(world, deviceId) {
  const out = world.notices?.[deviceId] ?? [];
  if (world.notices) world.notices[deviceId] = [];
  return out;
}

// clear ip ospf process: a new router ID can take effect, and the elections
// on this router's segments are run again from scratch.
export function clearOspf(world, deviceId) {
  const dev = world.devices[deviceId];
  dev.ospfRid = null;
  // The restarted router gives up any role it held; the BDR steps up and the
  // others elect a new BDR, which may be the restarted router itself.
  for (const link of domains(world)) {
    const e = world.elections[link.id];
    if (!e || !link.ends.some(([d]) => d === deviceId)) continue;
    if (e.dr === deviceId) world.elections[link.id] = { dr: e.bdr, bdr: null };
    else if (e.bdr === deviceId) world.elections[link.id] = { dr: e.dr, bdr: null };
  }
  refresh(world);
}

// Every router on a segment booting together: a clean election.
export function freshElections(world) {
  world.elections = {};
  refresh(world);
}

// ---------- saving and reloading ----------

export function save(world, deviceId) {
  const dev = world.devices[deviceId];
  dev.startup = clone(dev.config);
}

export function unsaved(world, deviceId) {
  const dev = world.devices[deviceId];
  return JSON.stringify(dev.startup) !== JSON.stringify(dev.config);
}

export function reload(world, deviceId) {
  const dev = world.devices[deviceId];
  const vlans = dev.config.vlans;
  dev.config = dev.startup ? clone(dev.startup) : blankConfig(dev);
  // VLANs live in vlan.dat, not the startup configuration: they survive.
  if (vlans) dev.config.vlans = clone(vlans);
  dev.ospfRid = null;
  dev.rsaBits = dev.startup ? dev.rsaBits : null;
  if (dev.err) dev.err = {};
  if (world.learned) delete world.learned[deviceId];
  for (const link of domains(world)) {
    if (link.ends.some(([d]) => d === deviceId)) delete world.elections[link.id];
  }
  refresh(world);
}

export { parseIp, formatIp, maskToLen, lenToMask, network };

// resolveName(world, pcId, name) -> { ok, ip, server } or { ok: false, reason, server }
//   reason: 'no-server' (no DNS server set), 'timeout' (the server never
//   answered), 'nxdomain' (it answered: no such name)
export function resolveName(world, pcId, name) {
  const pc = world.devices[pcId];
  const server = pc.config.dns ?? null;
  if (server === null || server === undefined) return { ok: false, reason: 'no-server', server: null };
  const r = exchange(world, pcId, server, { proto: 'udp', port: 53 });
  if (!r.ok) return { ok: false, reason: 'timeout', server };
  const owner = Object.keys(world.devices).find(id => owns(world, id, server));
  const records = dnsRecordsOf(world.devices[owner]) ?? {};
  const want = String(name).toLowerCase().replace(/\.$/, '');
  const hit = Object.entries(records).find(([n]) => n.toLowerCase().replace(/\.$/, '') === want);
  return hit ? { ok: true, ip: hit[1], server } : { ok: false, reason: 'nxdomain', server };
}
