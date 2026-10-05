// The lab world: a few routers, the cables between them, and everything that
// follows from their configuration: interface state, the routing table, OSPF
// neighbors and DR election, and whether a ping gets there and back.
//
// Device configuration is plain data so it can be saved, compared and copied.
// The derived state (routes, neighbors) is recomputed after every command by
// refresh(); only the few things IOS itself remembers between events (the
// OSPF router ID in use, who won a DR election) are stored.

import { parseIp, formatIp, maskToLen, lenToMask, network, inSubnet, wildcardMatch } from './ip4.js';

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
  return { id, config, startup: null, rsaBits: null, ospfRid: null };
}

// links: { id, ends: [[deviceId, interfaceName], ...], segment?: true }
// A two-ended link without segment is a cable; a segment is a switch, and a
// one-ended segment is a LAN with hosts the lab does not model.
export function makeWorld(devices, links) {
  const world = { devices: Object.fromEntries(devices.map(d => [d.id, d])), links, elections: {} };
  refresh(world);
  return world;
}

export const clone = (value) => JSON.parse(JSON.stringify(value));

// ---------- interface state ----------

function linkOf(world, deviceId, ifName) {
  return world.links.find(l => l.ends.some(([d, i]) => d === deviceId && i === ifName)) ?? null;
}

export function interfaceState(world, deviceId, ifName) {
  const intf = world.devices[deviceId]?.config.interfaces[ifName];
  if (!intf) return { status: 'deleted', protocol: 'down', up: false };
  if (intf.shutdown) return { status: 'administratively down', protocol: 'down', up: false };
  if (ifName.startsWith('Loopback')) return { status: 'up', protocol: 'up', up: true };
  const link = linkOf(world, deviceId, ifName);
  if (!link) return { status: 'down', protocol: 'down', up: false };
  if (link.segment) return { status: 'up', protocol: 'up', up: true };
  const other = link.ends.find(([d, i]) => !(d === deviceId && i === ifName));
  const peer = other && world.devices[other[0]]?.config.interfaces[other[1]];
  return peer && !peer.shutdown ? { status: 'up', protocol: 'up', up: true } : { status: 'down', protocol: 'down', up: false };
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

// Every OSPF speaker on a link, ready to form adjacencies there.
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
  for (const link of world.links) {
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
}

function ministers(world, link) {
  return ospfMembers(world, link).filter(m => m.type === 'broadcast');
}

// neighbors(world, deviceId) -> [{ rid, priority, state, role, address, intf }]
export function neighbors(world, deviceId) {
  const out = [];
  for (const link of world.links) {
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
  const link = linkOf(world, deviceId, ifName);
  const dev = world.devices[deviceId];
  const intf = dev.config.interfaces[ifName];
  if (!link || !ospfEnabled(world, deviceId, ifName)) return null;
  if (netType(intf) === 'point-to-point') return 'P2P';
  if (netType(intf) === 'loopback') return 'LOOP';
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
    adj[id] = neighbors(world, id).map(n => ({ to: n.device, cost: ospfCost(world.devices[id].config.interfaces[n.intf]), intf: n.intf }));
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
        ? [{ intf: e.intf, nh: world.devices[e.to].config.interfaces[linkPeerIf(world, deviceId, e.intf, e.to)]?.ip ?? null }]
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

function linkPeerIf(world, deviceId, ifName, peerDevice) {
  const link = linkOf(world, deviceId, ifName);
  const end = link?.ends.find(([d]) => d === peerDevice);
  return end ? end[1] : null;
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

export function routingTable(world, deviceId) {
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

function ownerOf(world, ip, link = null) {
  for (const [id, dev] of Object.entries(world.devices)) {
    for (const intf of Object.values(dev.config.interfaces)) {
      if (intf.ip !== ip || !interfaceState(world, id, intf.name).up) continue;
      if (link && !link.ends.some(([d, i]) => d === id && i === intf.name)) continue;
      return { device: id, intf: intf.name };
    }
  }
  return null;
}

// Follow the packet hop by hop. Returns the device that owns dst, or null.
function deliver(world, fromDevice, dst) {
  let at = fromDevice;
  for (let hop = 0; hop < 16; hop += 1) {
    const dev = world.devices[at];
    if (Object.values(dev.config.interfaces).some(i => i.ip === dst && interfaceState(world, at, i.name).up)) return at;
    const route = lookup(world, at, dst);
    if (!route) return null;
    const h = route.hops[0];
    const link = h.intf ? linkOf(world, at, h.intf) : null;
    if (!link) return null;
    const target = route.type === 'connected' || route.type === 'local' || !h.nh ? dst : h.nh;
    const owner = ownerOf(world, target, link);
    if (!owner) return null;
    at = owner.device;
  }
  return null;
}

// ping: there and back. source defaults to the exit interface's address.
export function ping(world, deviceId, dst, source = null) {
  const route = lookup(world, deviceId, dst);
  const local = Object.values(world.devices[deviceId].config.interfaces).some(i => i.ip === dst && interfaceState(world, deviceId, i.name).up);
  if (!route && !local) return { ok: false, reason: 'no-route' };
  let src = source;
  if (src === null) {
    if (local) src = dst;
    else {
      const intf = world.devices[deviceId].config.interfaces[route.hops[0].intf];
      src = intf?.ip ?? null;
    }
  }
  if (src === null) return { ok: false, reason: 'no-source' };
  const there = deliver(world, deviceId, dst);
  if (!there) return { ok: false, reason: 'no-reach' };
  const back = deliver(world, there, src);
  return back === deviceId ? { ok: true } : { ok: false, reason: 'no-return' };
}

// ---------- after every change ----------

export function refresh(world) {
  settleRouterIds(world);
  runElections(world);
  return world;
}

// clear ip ospf process: a new router ID can take effect, and the elections
// on this router's segments are run again from scratch.
export function clearOspf(world, deviceId) {
  const dev = world.devices[deviceId];
  dev.ospfRid = null;
  // The restarted router gives up any role it held; the BDR steps up and the
  // others elect a new BDR, which may be the restarted router itself.
  for (const link of world.links) {
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
  const blank = makeDevice(deviceId, Object.keys(dev.config.interfaces)).config;
  dev.config = dev.startup ? clone(dev.startup) : blank;
  dev.ospfRid = null;
  dev.rsaBits = dev.startup ? dev.rsaBits : null;
  for (const link of world.links) {
    if (link.ends.some(([d]) => d === deviceId)) delete world.elections[link.id];
  }
  refresh(world);
}

export { parseIp, formatIp, maskToLen, lenToMask, network };
