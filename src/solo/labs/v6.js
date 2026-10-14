// IPv6 in the lab world: each interface's addresses (configured, EUI-64,
// link-local, or learned by SLAAC from a router's advertisements), the IPv6
// routing table, and a packet walk for ping and traceroute.
//
// Configuration keeps addresses as text so it stays plain JSON; the math
// here works in BigInt.
//   router/switch interface: intf.v6 = { addrs: [{ addr, len, eui }], ll, enabled, auto }
//   router:                  config.ipv6 = { routing, statics: [{ net, len, nh, intf, ad }] }
//   PC:                      config.v6 = { addrs: [{ addr, len }], gw, auto }

import { interfaceState, l2Of } from './world.js';
import { macOf, keyOf, parentOf } from './switching.js';
import { parse6, net6, inPrefix6, eui64, linkLocalOf, isLinkLocal } from './ip6.js';

const routes = (dev) => Boolean(dev.config.ipv6?.routing);

// A router interface with a /64 global prefix, on a router sending router
// advertisements (ipv6 unicast-routing): what SLAAC hears on that wire.
export function slaacFrom(world, d, i) {
  const reach = l2Of(world).reach[keyOf(d, i)];
  for (const k of reach?.ends ?? []) {
    const [od, oi] = k.split('|');
    if (od === d) continue;
    const odev = world.devices[od];
    if ((odev.kind ?? 'router') !== 'router' || !routes(odev)) continue;
    const intf = odev.config.interfaces[oi];
    const a = (intf?.v6?.addrs ?? []).find(x => x.len === 64 && !isLinkLocal(parse6(x.addr)));
    if (!a || !interfaceState(world, od, oi).up) continue;
    return { prefix: net6(parse6(a.addr), 64), router: od, gw: v6Of(world, od, oi, 1).ll };
  }
  return null;
}

// v6Of -> { on, ll, addrs: [{ addr, len }] } with BigInt addresses.
export function v6Of(world, d, i, depth = 0) {
  const dev = world.devices[d];
  const intf = dev?.config.interfaces[i];
  if (!intf) return { on: false, ll: null, addrs: [] };
  if (dev.kind === 'pc') {
    const c = dev.config.v6 ?? { addrs: [], gw: null, auto: false };
    const addrs = c.addrs.map(x => ({ addr: parse6(x.addr), len: x.len }));
    if (c.auto && depth < 2) {
      const s = slaacFrom(world, d, i);
      if (s) addrs.push({ addr: s.prefix | eui64(dev.mac), len: 64 });
    }
    return { on: true, ll: linkLocalOf(dev.mac), addrs };
  }
  const v = intf.v6;
  if (!v || !(v.addrs.length || v.enabled || v.auto || v.ll)) return { on: false, ll: null, addrs: [] };
  const mac = macOf(world, d, parentOf(i));
  const addrs = v.addrs.map(x => {
    const a = parse6(x.addr);
    return { addr: x.eui ? net6(a, x.len) | eui64(mac) : a, len: x.len };
  });
  if (v.auto && depth < 2) {
    const s = slaacFrom(world, d, i);
    if (s) addrs.push({ addr: s.prefix | eui64(mac), len: 64 });
  }
  return { on: true, ll: v.ll ? parse6(v.ll) : linkLocalOf(mac), addrs };
}

const up = (world, d, i) => interfaceState(world, d, i).up;

export function owns6(world, d, a) {
  return Object.keys(world.devices[d].config.interfaces).some(i => {
    if (!up(world, d, i)) return false;
    const v = v6Of(world, d, i);
    return v.on && (v.ll === a || v.addrs.some(x => x.addr === a));
  });
}

// The IPv6 routing table: connected and local routes from every up
// interface, statics whose next hop or exit is usable, and for a PC its
// default gateway.
export function routingTable6(world, d) {
  const dev = world.devices[d];
  const out = [];
  for (const i of Object.keys(dev.config.interfaces)) {
    if (!up(world, d, i)) continue;
    const v = v6Of(world, d, i);
    for (const x of v.addrs) {
      out.push({ type: 'connected', net: net6(x.addr, x.len), len: x.len, ad: 0, hops: [{ nh: null, intf: i }] });
      out.push({ type: 'local', net: x.addr, len: 128, ad: 0, hops: [{ nh: null, intf: i }] });
    }
  }
  const lookupIn = (a) => out.filter(r => r.type === 'connected' && inPrefix6(a, r.net, r.len)).sort((x, y) => y.len - x.len)[0] ?? null;
  if (dev.kind === 'pc') {
    const c = dev.config.v6;
    let gw = c?.gw ? parse6(c.gw) : null;
    if (c?.auto && gw === null) gw = slaacFrom(world, d, 'FastEthernet0')?.gw ?? null;
    if (gw !== null && (isLinkLocal(gw) || lookupIn(gw))) out.push({ type: 'static', net: 0n, len: 0, ad: 1, hops: [{ nh: gw, intf: 'FastEthernet0' }] });
  } else {
    for (const s of dev.config.ipv6?.statics ?? []) {
      const nh = s.nh ? parse6(s.nh) : null;
      let intf = s.intf;
      if (intf) { if (!up(world, d, intf)) continue; } else if (nh !== null && !isLinkLocal(nh)) {
        const via = lookupIn(nh);
        if (!via) continue;
        intf = via.hops[0].intf;
      } else continue;
      out.push({ type: 'static', net: net6(parse6(s.net), s.len), len: s.len, ad: s.ad, hops: [{ nh, intf, given: s.intf ?? null }] });
    }
  }
  const best = new Map();
  for (const r of out) {
    const k = `${r.net}/${r.len}`;
    const cur = best.get(k);
    if (!cur || r.ad < cur.ad) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => (a.net < b.net ? -1 : a.net > b.net ? 1 : a.len - b.len));
}

const lookup6 = (world, d, a) => routingTable6(world, d).filter(r => inPrefix6(a, r.net, r.len)).sort((x, y) => y.len - x.len)[0] ?? null;

function owner6In(world, a, d, i) {
  const reach = l2Of(world).reach[keyOf(d, i)];
  for (const k of reach?.ends ?? []) {
    const [od, oi] = k.split('|');
    if (od === d && oi === i) continue;
    if (!up(world, od, oi)) continue;
    const v = v6Of(world, od, oi);
    if (v.on && (v.ll === a || v.addrs.some(x => x.addr === a))) return { device: od, intf: oi };
  }
  return null;
}

export function walk6(world, from, dst, trail = null) {
  let at = from;
  for (let hop = 0; hop < 20; hop += 1) {
    if (owns6(world, at, dst)) return { ok: true, at };
    const dev = world.devices[at];
    if (at !== from && (dev.kind !== 'router' || !routes(dev))) return { ok: false, reason: 'not-routing', at };
    const r = lookup6(world, at, dst);
    if (!r) return { ok: false, reason: 'no-route', at };
    const h = r.hops[0];
    if (!up(world, at, h.intf)) return { ok: false, reason: 'down', at };
    const target = r.type === 'connected' || !h.nh ? dst : h.nh;
    const owner = owner6In(world, target, at, h.intf);
    if (!owner) return { ok: false, reason: 'nd', at };
    if (trail) trail.push({ device: owner.device, intf: owner.intf });
    at = owner.device;
  }
  return { ok: false, reason: 'loop', at };
}

// The source a device would use toward dst: the exit interface's global
// address, or its link-local for a link-local destination.
function source6(world, d, dst) {
  if (owns6(world, d, dst)) return dst;
  const r = lookup6(world, d, dst);
  if (!r) return null;
  const v = v6Of(world, d, r.hops[0].intf);
  if (isLinkLocal(dst)) return v.ll;
  return v.addrs[0]?.addr ?? null;
}

// ping6 -> { ok, reason?, src }. A link-local destination is only
// reachable on one wire, so it needs the outgoing interface (a PC has one).
export function ping6(world, d, dst, intf = null) {
  if (isLinkLocal(dst)) {
    const dev = world.devices[d];
    const out = intf ?? (dev.kind === 'pc' ? 'FastEthernet0' : null);
    if (!out) return { ok: false, reason: 'need-intf', src: null };
    const v = v6Of(world, d, out);
    if (!v.on || !up(world, d, out)) return { ok: false, reason: 'down', src: null };
    if (v.ll === dst) return { ok: true, src: v.ll };
    return { ok: Boolean(owner6In(world, dst, d, out)), reason: 'nd', src: v.ll };
  }
  const src = source6(world, d, dst);
  if (src === null) return { ok: false, reason: 'no-route', src: null };
  const there = walk6(world, d, dst);
  if (!there.ok) return { ...there, src };
  const back = walk6(world, there.at, src);
  return back.ok && back.at === d ? { ok: true, src } : { ok: false, reason: back.reason ?? 'no-return', src };
}

export function trace6(world, d, dst) {
  const trail = [];
  const r = walk6(world, d, dst, trail);
  const hops = trail.map(t => {
    const v = v6Of(world, t.device, t.intf);
    return v.addrs[0]?.addr ?? v.ll;
  });
  return { ok: r.ok, hops };
}
