// Layer 2 for the labs: switches, PCs, and what follows from their
// configuration. DTP decides which ports trunk, EtherChannel decides which
// ports bundle, spanning tree decides which ports forward, and port security
// and BPDU Guard decide which ports get shut. Then a frame walk works out
// which layer 3 interfaces can hear each other: that is what routing, OSPF
// and ping run on.
//
// Everything here is derived from configuration and recomputed by
// computeL2() after each command. The few things a switch remembers between
// events (a port it err-disabled, a sticky MAC it learned, which MACs it has
// seen) live on the device or the world, not here.

export const isSub = (n) => n.includes('.');
export const isSvi = (n) => n.startsWith('Vlan');
export const isPo = (n) => n.startsWith('Port-channel');
export const isLoop = (n) => n.startsWith('Loopback');
export const isPhysical = (n) => !isSub(n) && !isSvi(n) && !isPo(n) && !isLoop(n);
export const parentOf = (n) => n.split('.')[0];
export const keyOf = (d, i) => `${d}|${i}`;

const ADMIN = { status: 'administratively down', protocol: 'down', up: false };
const DOWN = { status: 'down', protocol: 'down', up: false };
const UP = { status: 'up', protocol: 'up', up: true };

// ---------- building switches and PCs ----------

export function makeSwitchport() {
  return {
    mode: 'dynamic auto', access: 1, native: 1, allowed: null, nonegotiate: false, encap: null, voice: null,
    portfast: false, bpduguard: null,
    psec: { on: false, max: 1, violation: 'shutdown', sticky: false, macs: [] },
    channel: null,
  };
}

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}

// A stable MAC for any name: an OUI by kind, then six digits from a hash.
export function macFrom(text, oui = '0050.79') {
  const h = hash(text).toString(16).padStart(8, '0').slice(-6);
  const all = `${oui.replace('.', '')}${h}`;
  return `${all.slice(0, 4)}.${all.slice(4, 8)}.${all.slice(8, 12)}`;
}

export const OUI = { router: '00d0.97', switch: '0019.e8', pc: '0050.79' };

export function macOf(world, d, i) {
  const dev = world.devices[d];
  if (!dev) return null;
  const kind = dev.kind ?? 'router';
  if (kind === 'switch' && isSvi(i)) return dev.mac;
  if (kind === 'pc') return dev.mac;
  return macFrom(`${d}|${parentOf(i)}`, OUI[kind]);
}

// ---------- links ----------

export function linkOf(world, d, i) {
  return world.links.find(l => l.ends.some(([a, b]) => a === d && b === i)) ?? null;
}

// The far ends of a cable (one) or a shared segment (any number).
export function peersOf(world, d, i) {
  const link = linkOf(world, d, i);
  if (!link) return [];
  return link.ends.filter(([a, b]) => !(a === d && b === i));
}

export const kindOf = (world, d) => world.devices[d]?.kind ?? 'router';

// A port's own state: shut, err-disabled, no cable, or a cable to something
// that is itself shut.
export function physState(world, d, i) {
  const dev = world.devices[d];
  const intf = dev?.config.interfaces[i];
  if (!intf) return { status: 'deleted', protocol: 'down', up: false };
  if (intf.shutdown) return ADMIN;
  if (dev.err?.[i]) return { ...DOWN, err: dev.err[i] };
  const link = linkOf(world, d, i);
  if (!link) return DOWN;
  if (link.segment) return UP;
  const other = link.ends.find(([a, b]) => !(a === d && b === i));
  const pdev = other && world.devices[other[0]];
  const peer = pdev?.config.interfaces[other[1]];
  if (!peer || peer.shutdown || pdev.err?.[other[1]]) return DOWN;
  return UP;
}

// ---------- VLANs ----------

export const vlanActive = (dev, v) => Boolean(dev.config.vlans?.[v]);
export const allowedHas = (sw, v) => sw.allowed === null || sw.allowed.includes(v);

// "10,20,30-32" <-> [10, 20, 30, 31, 32]
export function parseVlanList(text) {
  const out = new Set();
  for (const part of String(text).split(',')) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < 1 || b > 4094 || b < a) return null;
    for (let v = a; v <= b; v += 1) out.add(v);
  }
  return [...out].sort((x, y) => x - y);
}

export function formatVlanList(list) {
  if (list === null) return '1-4094';
  if (!list.length) return 'none';
  const out = [];
  let start = list[0];
  let prev = list[0];
  for (const v of [...list.slice(1), null]) {
    if (v !== null && v === prev + 1) { prev = v; continue; }
    out.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = v;
    prev = v;
  }
  return out.join(',');
}

// ---------- DTP ----------

// What a switch port actually ended up as: IOS's "operational mode".
export function operMode(world, d, i) {
  const intf = world.devices[d]?.config.interfaces[i];
  const sw = intf?.sw;
  if (!sw) return null;
  if (!physState(world, d, i).up) return 'down';
  if (sw.mode === 'access') return 'access';
  if (sw.mode === 'trunk') return 'trunk';
  const [peer] = peersOf(world, d, i);
  const pdev = peer && world.devices[peer[0]];
  const psw = pdev?.kind === 'switch' ? pdev.config.interfaces[peer[1]]?.sw : null;
  if (!psw) return 'access';
  const pm = psw.mode;
  const peerSends = pm === 'trunk' ? !psw.nonegotiate : pm.startsWith('dynamic');
  if (!peerSends) return 'access';
  if (sw.mode === 'dynamic desirable') return pm === 'trunk' || pm.startsWith('dynamic') ? 'trunk' : 'access';
  return pm === 'trunk' || pm === 'dynamic desirable' ? 'trunk' : 'access';
}

// ---------- EtherChannel ----------

const COMPAT = { active: ['active', 'passive'], passive: ['active'], on: ['on'], desirable: ['desirable', 'auto'], auto: ['desirable'] };
export const channelProtocol = (mode) => (['active', 'passive'].includes(mode) ? 'LACP' : ['desirable', 'auto'].includes(mode) ? 'PAgP' : '-');

function sameSwitchport(a, b) {
  if (!a || !b) return false;
  const al = a.allowed === null ? 'all' : a.allowed.join(',');
  const bl = b.allowed === null ? 'all' : b.allowed.join(',');
  return a.mode === b.mode && a.access === b.access && a.native === b.native && al === bl;
}

// A member's flag in "show etherchannel summary": P bundled, I stand-alone,
// s suspended, D down.
export function memberFlag(world, d, i) {
  const dev = world.devices[d];
  const intf = dev.config.interfaces[i];
  const ch = intf.sw?.channel;
  if (!ch) return null;
  if (!physState(world, d, i).up) return 'D';
  const po = dev.config.interfaces[`Port-channel${ch.group}`];
  if (!po || !sameSwitchport(intf.sw, po.sw)) return 's';
  const [peer] = peersOf(world, d, i);
  const pdev = peer && world.devices[peer[0]];
  const pintf = pdev?.kind === 'switch' ? pdev.config.interfaces[peer[1]] : null;
  const pch = pintf?.sw?.channel;
  if (!pch || !COMPAT[ch.mode].includes(pch.mode)) return ch.mode === 'on' ? 's' : 'I';
  const ppo = pdev.config.interfaces[`Port-channel${pch.group}`];
  if (!ppo || !sameSwitchport(pintf.sw, ppo.sw)) return ch.mode === 'on' ? 's' : 'I';
  return 'P';
}

// The ports spanning tree and forwarding see: bundled members fold into
// their Port-channel; everything else stands alone.
function logicalPorts(world, d) {
  const dev = world.devices[d];
  const out = [];
  const groups = new Map();
  for (const name of dev.ports) {
    const ch = dev.config.interfaces[name]?.sw?.channel;
    if (ch && memberFlag(world, d, name) === 'P') {
      if (!groups.has(ch.group)) groups.set(ch.group, []);
      groups.get(ch.group).push(name);
      continue;
    }
    out.push({ name, members: [name] });
  }
  for (const [g, members] of groups) out.push({ name: `Port-channel${g}`, members });
  return out;
}

// ---------- the derived layer 2 state ----------

const portNumber = (dev, name) => (isPo(name) ? 64 + Number(name.slice(12)) : dev.ports.indexOf(name) + 1);
const bridgePrio = (dev, v) => (dev.config.stp?.prio?.[v] ?? 32768) + v;
const cmpBid = (a, b) => (a.prio - b.prio) || (a.mac < b.mac ? -1 : a.mac > b.mac ? 1 : 0);
const cmpTuple = (a, b) => (a[0] - b[0]) || cmpBid(a[1], b[1]) || (a[2] - b[2]);

export function portCost(dev, L) {
  if (isPo(L.name)) return L.members[0].startsWith('Fast') ? 12 : 3;
  return L.name.startsWith('Fast') ? 19 : 4;
}

export function computeL2(world) {
  const l2 = { lp: {}, logicalOf: {}, mode: {}, sw: {}, stp: {}, sviUp: {}, reach: {}, psec: {}, domains: [] };
  const switches = Object.values(world.devices).filter(dv => dv.kind === 'switch').map(dv => dv.id);

  // Logical ports, their mode and settings.
  for (const d of switches) {
    const dev = world.devices[d];
    const lp = logicalPorts(world, d);
    l2.lp[d] = lp;
    for (const L of lp) {
      for (const m of L.members) l2.logicalOf[keyOf(d, m)] = L;
      const k = keyOf(d, L.name);
      const up = L.members.some(m => physState(world, d, m).up);
      L.up = up;
      if (isPo(L.name)) {
        const po = dev.config.interfaces[L.name];
        l2.sw[k] = po.sw;
        l2.mode[k] = !up ? 'down' : po.sw.mode === 'trunk' || po.sw.mode === 'access' ? po.sw.mode : operMode(world, d, L.members[0]);
      } else {
        l2.sw[k] = dev.config.interfaces[L.name].sw;
        l2.mode[k] = operMode(world, d, L.name);
      }
    }
  }

  const swOf = (d, L) => l2.sw[keyOf(d, L.name)];
  const modeOf = (d, L) => l2.mode[keyOf(d, L.name)];
  const carries = (d, L, v) => {
    if (!L.up || !vlanActive(world.devices[d], v)) return false;
    const m = modeOf(d, L);
    const sw = swOf(d, L);
    if (m === 'access') return sw.access === v;
    if (m === 'trunk') return allowedHas(sw, v);
    return false;
  };
  l2.carries = carries;

  // Port security: which MACs each secure port lets in. Sticky MACs are
  // written into the running configuration as they are learned.
  for (const d of switches) {
    const dev = world.devices[d];
    for (const name of dev.ports) {
      const intf = dev.config.interfaces[name];
      const ps = intf.sw?.psec;
      if (!ps?.on || !physState(world, d, name).up) continue;
      const seen = peersOf(world, d, name).map(([od, oi]) => macOf(world, od, oi)).filter(Boolean);
      const allowed = ps.macs.map(m => m.mac);
      const offenders = [];
      for (const mac of seen) {
        if (allowed.includes(mac)) continue;
        if (allowed.length < ps.max) {
          allowed.push(mac);
          if (ps.sticky) ps.macs.push({ mac, sticky: true });
        } else offenders.push(mac);
      }
      l2.psec[keyOf(d, name)] = { allowed, offenders, seen };
    }
  }

  // Spanning tree, one instance per VLAN.
  const peerLogical = (d, L) => {
    const m = L.members.find(x => physState(world, d, x).up) ?? L.members[0];
    const [peer] = peersOf(world, d, m);
    if (!peer || kindOf(world, peer[0]) !== 'switch') return null;
    const PL = l2.logicalOf[keyOf(peer[0], peer[1])];
    return PL ? { d: peer[0], L: PL } : null;
  };
  const vlans = new Set();
  for (const d of switches) for (const v of Object.keys(world.devices[d].config.vlans)) vlans.add(Number(v));
  for (const v of [...vlans].sort((a, b) => a - b)) {
    const nodes = switches.filter(d => vlanActive(world.devices[d], v));
    const bid = (d) => ({ prio: bridgePrio(world.devices[d], v), mac: world.devices[d].mac });
    const pid = (d, L) => portNumber(world.devices[d], L.name);
    const edges = [];
    const ports = {};
    for (const d of nodes) {
      ports[d] = {};
      for (const L of l2.lp[d]) {
        if (!carries(d, L, v)) continue;
        const peer = peerLogical(d, L);
        if (peer && nodes.includes(peer.d) && carries(peer.d, peer.L, v)) edges.push({ a: d, la: L, b: peer.d, lb: peer.L });
        else ports[d][L.name] = { role: 'Desg', state: 'FWD', edge: true };
      }
    }
    // Components, and the lowest bridge ID in each is its root.
    const comp = {};
    for (const d of nodes) {
      if (comp[d]) continue;
      const members = [d];
      comp[d] = members;
      for (let k = 0; k < members.length; k += 1) {
        for (const e of edges) if (e.a === members[k] && !comp[e.b]) { comp[e.b] = members; members.push(e.b); }
      }
    }
    const dist = {};
    const rootOf = {};
    for (const members of new Set(Object.values(comp))) {
      const root = members.reduce((x, y) => (cmpBid(bid(x), bid(y)) <= 0 ? x : y));
      for (const m of members) rootOf[m] = root;
      dist[root] = 0;
      const done = new Set();
      while (true) {
        const open = members.filter(m => dist[m] !== undefined && !done.has(m));
        if (!open.length) break;
        const u = open.reduce((x, y) => (dist[x] <= dist[y] ? x : y));
        done.add(u);
        for (const e of edges) {
          if (e.b !== u) continue;
          // e.a hears u's BPDU on its port la.
          const c = dist[u] + portCost(world.devices[e.a], e.la);
          if (dist[e.a] === undefined || c < dist[e.a]) dist[e.a] = c;
        }
      }
    }
    const rootPort = {};
    for (const d of nodes) {
      if (rootOf[d] === d) continue;
      let best = null;
      for (const e of edges) {
        if (e.a !== d || dist[e.b] === undefined) continue;
        const t = [dist[e.b] + portCost(world.devices[d], e.la), bid(e.b), pid(e.b, e.lb), pid(d, e.la)];
        if (!best || cmpTuple(t, best.t) < 0 || (cmpTuple(t, best.t) === 0 && t[3] < best.t[3])) best = { t, L: e.la, via: e };
      }
      if (best) { rootPort[d] = best.L.name; dist[d] = best.t[0]; }
    }
    for (const e of edges) {
      const mine = [dist[e.a] ?? 0, bid(e.a), pid(e.a, e.la)];
      const theirs = [dist[e.b] ?? 0, bid(e.b), pid(e.b, e.lb)];
      if (cmpTuple(mine, theirs) < 0) ports[e.a][e.la.name] = { role: 'Desg', state: 'FWD' };
      else if (rootPort[e.a] === e.la.name) ports[e.a][e.la.name] = { role: 'Root', state: 'FWD' };
      else ports[e.a][e.la.name] = { role: 'Altn', state: 'BLK' };
    }
    for (const d of nodes) {
      if (!Object.keys(ports[d]).length) continue;
      l2.stp[d] ??= {};
      const root = rootOf[d];
      const Lrp = rootPort[d] ? l2.lp[d].find(L => L.name === rootPort[d]) : null;
      l2.stp[d][v] = {
        bid: bid(d), root: bid(root), rootId: root, cost: dist[d] ?? 0, rootPort: rootPort[d] ?? null,
        rootPortNum: Lrp ? pid(d, Lrp) : null,
        ports: Object.fromEntries(l2.lp[d].filter(L => ports[d][L.name]).map(L => [L.name, { ...ports[d][L.name], cost: portCost(world.devices[d], L), num: pid(d, L) }])),
      };
    }
  }
  const forwarding = (d, L, v) => (l2.stp[d]?.[v]?.ports[L.name]?.state ?? 'FWD') === 'FWD';
  l2.forwarding = forwarding;

  // An SVI is up when its VLAN has a port up and forwarding.
  for (const d of switches) {
    const dev = world.devices[d];
    for (const name of Object.keys(dev.config.interfaces).filter(isSvi)) {
      const v = Number(name.slice(4));
      l2.sviUp[keyOf(d, name)] = vlanActive(dev, v) && l2.lp[d].some(L => carries(d, L, v) && forwarding(d, L, v));
    }
  }

  // The frame walk: from each layer 3 interface, who hears it.
  const endpoints = [];
  for (const [d, dev] of Object.entries(world.devices)) {
    const kind = dev.kind ?? 'router';
    for (const name of Object.keys(dev.config.interfaces)) {
      if (kind === 'switch' && !isSvi(name)) continue;
      endpoints.push([d, name]);
    }
  }
  for (const [d, i] of endpoints) l2.reach[keyOf(d, i)] = walk(world, l2, d, i);

  // Broadcast domains, for OSPF: each distinct set of hearers once.
  const seen = new Set();
  for (const [d, i] of endpoints) {
    const r = l2.reach[keyOf(d, i)];
    const ends = [...r.ends].sort();
    const sig = ends.join(',');
    if (seen.has(sig)) continue;
    seen.add(sig);
    let id = `l2:${ends[0]}`;
    if (!r.switched && !isLoop(i)) {
      const link = linkOf(world, d, parentOf(i));
      if (link && ends.every(k => { const [a, b] = k.split('|'); return link.ends.some(([x, y]) => x === a && y === parentOf(b)); })) id = link.id;
    }
    l2.domains.push({ id, ends: ends.map(k => k.split('|')) });
  }
  return l2;
}

// Walk a broadcast from one layer 3 interface through every switch it can
// cross, the way an ARP request would.
function walk(world, l2, d, i) {
  const me = keyOf(d, i);
  const ends = new Set([me]);
  const via = {};
  const visited = new Set();
  let switched = false;
  const dev = world.devices[d];
  const intf = dev.config.interfaces[i];
  const kind = dev.kind ?? 'router';
  const mac = macOf(world, d, i);

  const receive = (od, oi, tag) => {
    const odev = world.devices[od];
    const okind = odev.kind ?? 'router';
    if (okind === 'switch') {
      const L = l2.logicalOf[keyOf(od, oi)];
      if (!L || !L.up || !physState(world, od, oi).up) return;
      const m = l2.mode[keyOf(od, L.name)];
      const sw = l2.sw[keyOf(od, L.name)];
      let v = null;
      if (m === 'access') v = tag === null ? sw.access : null;
      else if (m === 'trunk') v = tag === null ? sw.native : (allowedHas(sw, tag) ? tag : null);
      if (v === null || !vlanActive(odev, v) || !l2.carries(od, L, v) || !l2.forwarding(od, L, v)) return;
      const ps = l2.psec[keyOf(od, oi)];
      if (ps && !ps.allowed.includes(mac)) return;
      via[od] ??= {};
      if (via[od][v] === undefined) via[od][v] = L.name;
      switched = true;
      flood(od, v, L.name);
      return;
    }
    const oint = odev.config.interfaces[oi];
    if (!oint || !physState(world, od, oi).up) return;
    if (okind === 'pc') { if (tag === null) ends.add(keyOf(od, oi)); return; }
    // A router: untagged frames reach the interface itself and any native
    // subinterface; tagged ones reach the subinterface for that VLAN.
    for (const [name, x] of Object.entries(odev.config.interfaces)) {
      if (name === oi && tag === null) ends.add(keyOf(od, name));
      if (!isSub(name) || parentOf(name) !== oi || x.shutdown || !x.encap) continue;
      if ((tag === null && x.encap.native) || (tag !== null && !x.encap.native && x.encap.vlan === tag)) ends.add(keyOf(od, name));
    }
  };

  const send = (sd, port, tag) => {
    for (const [od, oi] of peersOf(world, sd, port)) receive(od, oi, tag);
  };

  const flood = (sw, v, ingress) => {
    const k = `${sw}|${v}`;
    if (visited.has(k)) return;
    visited.add(k);
    const sdev = world.devices[sw];
    const svi = `Vlan${v}`;
    if (sdev.config.interfaces[svi] && !sdev.config.interfaces[svi].shutdown && l2.sviUp[keyOf(sw, svi)]) ends.add(keyOf(sw, svi));
    for (const L of l2.lp[sw]) {
      if (L.name === ingress || !l2.carries(sw, L, v) || !l2.forwarding(sw, L, v)) continue;
      const sp = l2.sw[keyOf(sw, L.name)];
      const tag = l2.mode[keyOf(sw, L.name)] === 'trunk' && v !== sp.native ? v : null;
      const m = L.members.find(x => physState(world, sw, x).up);
      if (m) send(sw, m, tag);
    }
  };

  if (isLoop(i)) return { ends, via, switched };
  if (kind === 'switch') {
    if (isSvi(i) && !intf.shutdown && l2.sviUp[me]) flood(d, Number(i.slice(4)), null);
    return { ends, via, switched };
  }
  const phys = parentOf(i);
  if (!physState(world, d, phys).up) return { ends, via, switched };
  let tag = null;
  if (isSub(i)) {
    if (intf.shutdown || !intf.encap) return { ends, via, switched };
    tag = intf.encap.native ? null : intf.encap.vlan;
  }
  send(d, phys, tag);
  return { ends, via, switched };
}

// ---------- the events a switch reacts to ----------

// BPDU Guard and port security can shut a port. Returns the log lines for
// each device whose port was just err-disabled.
export function enforce(world, l2) {
  const notices = [];
  for (const dev of Object.values(world.devices)) {
    if (dev.kind !== 'switch') continue;
    dev.err ??= {};
    dev.psecCount ??= {};
    dev.psecLast ??= {};
    for (const name of dev.ports) {
      const intf = dev.config.interfaces[name];
      const sw = intf.sw;
      if (!sw || dev.err[name] || !physState(world, dev.id, name).up) continue;
      const guard = sw.bpduguard === 'enable' || (sw.bpduguard !== 'disable' && sw.portfast && dev.config.stp?.bpduguardDefault);
      const [peer] = peersOf(world, dev.id, name);
      if (guard && peer && kindOf(world, peer[0]) === 'switch') {
        dev.err[name] = 'bpduguard';
        notices.push([dev.id, `%SPANTREE-2-BLOCK_BPDUGUARD: Received BPDU on port ${name} with BPDU Guard enabled. Disabling port.`,
          `%PM-4-ERR_DISABLE: bpduguard error detected on ${shortName(name)}, putting ${shortName(name)} in err-disable state`]);
        continue;
      }
      const ps = l2.psec[keyOf(dev.id, name)];
      if (!ps || !ps.offenders.length) { if (ps) dev.psecLast[name] = ''; continue; }
      const sig = ps.offenders.join(',');
      if (dev.psecLast[name] === sig) continue;
      dev.psecLast[name] = sig;
      dev.psecCount[name] = (dev.psecCount[name] ?? 0) + 1;
      if (sw.psec.violation === 'shutdown') {
        dev.err[name] = 'psecure-violation';
        notices.push([dev.id, `%PM-4-ERR_DISABLE: psecure-violation error detected on ${shortName(name)}, putting ${shortName(name)} in err-disable state`,
          `%PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address ${ps.offenders[0]} on port ${name}.`]);
      } else if (sw.psec.violation === 'restrict') {
        notices.push([dev.id, `%PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address ${ps.offenders[0]} on port ${name}.`]);
      }
    }
  }
  return notices;
}

// CDP notices a native VLAN mismatch on a trunk and says so on both ends.
export function nativeMismatches(world, l2) {
  const out = [];
  for (const dev of Object.values(world.devices)) {
    if (dev.kind !== 'switch' || dev.config.cdp === false) continue;
    for (const L of l2.lp[dev.id] ?? []) {
      if (l2.mode[keyOf(dev.id, L.name)] !== 'trunk') continue;
      const m = L.members[0];
      const [peer] = peersOf(world, dev.id, m);
      if (!peer || kindOf(world, peer[0]) !== 'switch') continue;
      const PL = l2.logicalOf[keyOf(peer[0], peer[1])];
      if (!PL || l2.mode[keyOf(peer[0], PL.name)] !== 'trunk') continue;
      const mine = l2.sw[keyOf(dev.id, L.name)].native;
      const theirs = l2.sw[keyOf(peer[0], PL.name)].native;
      if (mine !== theirs) out.push({ device: dev.id, key: `${m}|${mine}|${theirs}`, text: `%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on ${m} (${mine}), with ${world.devices[peer[0]].config.hostname} ${peer[1]} (${theirs}).` });
    }
  }
  return out;
}

export const shortName = (name) => name
  .replace('GigabitEthernet', 'Gi').replace('FastEthernet', 'Fa').replace('Port-channel', 'Po').replace('Loopback', 'Lo');
