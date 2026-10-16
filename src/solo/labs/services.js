// Router services for the labs: access lists, NAT and DHCP.
//
// ACLs and NAT act on packets as they cross interfaces during the packet
// walk in world.js. DHCP hands out addresses when a PC asks. Configuration
// lives on the device as plain data; the few things a router remembers
// between packets (ACL hit counts, NAT translations, DHCP bindings) live on
// the device or the world, never in its configuration.

import { parseIp, formatIp, maskToLen, lenToMask, network, inSubnet } from './ip4.js';

// ---------- ACLs ----------

export const PORT_NAMES = { www: 80, telnet: 23, ftp: 21, 'ftp-data': 20, ssh: 22, domain: 53, smtp: 25, pop3: 110, tftp: 69, snmp: 161, ntp: 123, bootps: 67, bootpc: 68, https: 443 };
const NAME_OF_PORT = { 80: 'www', 23: 'telnet', 21: 'ftp', 22: '22', 53: 'domain', 25: 'smtp', 110: 'pop3', 69: 'tftp', 161: 'snmp', 123: 'ntp', 67: 'bootps', 68: 'bootpc', 443: '443' };

export const aclKind = (name) => {
  const n = Number(name);
  if (Number.isInteger(n) && ((n >= 1 && n <= 99) || (n >= 1300 && n <= 1999))) return 'standard';
  if (Number.isInteger(n) && ((n >= 100 && n <= 199) || (n >= 2000 && n <= 2699))) return 'extended';
  return null;
};

// An address spec: "any", "host A.B.C.D", or "A.B.C.D WILDCARD" (a standard
// ACL also takes a bare address, meaning host). Returns { spec, used } or null.
function readAddr(tokens, i, bareHost) {
  const t = tokens[i]?.toLowerCase();
  if (t === 'any') return { spec: { any: true }, used: 1 };
  if (t === 'host' && parseIp(tokens[i + 1]) !== null) return { spec: { ip: parseIp(tokens[i + 1]), wild: 0 }, used: 2 };
  const ip = parseIp(tokens[i]);
  if (ip === null) return null;
  const wild = parseIp(tokens[i + 1]);
  if (wild !== null) return { spec: { ip: (ip & ~wild) >>> 0, wild }, used: 2 };
  if (bareHost) return { spec: { ip, wild: 0 }, used: 1 };
  return null;
}

function readPort(tokens, i) {
  const op = tokens[i]?.toLowerCase();
  if (!['eq', 'neq', 'gt', 'lt', 'range'].includes(op)) return { port: null, used: 0 };
  const val = (t) => (t === undefined ? null : /^\d+$/.test(t) ? Number(t) : PORT_NAMES[t.toLowerCase()] ?? null);
  const a = val(tokens[i + 1]);
  if (a === null) return null;
  if (op === 'range') { const b = val(tokens[i + 2]); if (b === null) return null; return { port: { op, a, b }, used: 3 }; }
  return { port: { op, a }, used: 2 };
}

// "permit 10.0.0.0 0.0.0.255" or "deny tcp any host 10.0.0.5 eq www" -> entry or null.
export function parseAce(kind, text) {
  const tokens = String(text).trim().split(/\s+/);
  const action = tokens[0]?.toLowerCase();
  if (!['permit', 'deny'].includes(action)) return null;
  let i = 1;
  if (kind === 'standard') {
    const src = readAddr(tokens, i, true);
    if (!src) return null;
    i += src.used;
    const log = tokens[i]?.toLowerCase() === 'log';
    if (log) i += 1;
    if (i < tokens.length) return null;
    return { action, proto: 'ip', src: src.spec, dst: { any: true }, port: null, log };
  }
  const proto = tokens[i]?.toLowerCase();
  if (!['ip', 'tcp', 'udp', 'icmp'].includes(proto)) return null;
  i += 1;
  const src = readAddr(tokens, i, false);
  if (!src) return null;
  i += src.used;
  const sport = ['tcp', 'udp'].includes(proto) ? readPort(tokens, i) : { port: null, used: 0 };
  if (!sport) return null;
  i += sport.used;
  const dst = readAddr(tokens, i, false);
  if (!dst) return null;
  i += dst.used;
  const dport = ['tcp', 'udp'].includes(proto) ? readPort(tokens, i) : { port: null, used: 0 };
  if (!dport) return null;
  i += dport.used;
  let established = false;
  let echo = null;
  if (proto === 'tcp' && tokens[i]?.toLowerCase() === 'established') { established = true; i += 1; }
  if (proto === 'icmp' && ['echo', 'echo-reply'].includes(tokens[i]?.toLowerCase())) { echo = tokens[i].toLowerCase(); i += 1; }
  const log = tokens[i]?.toLowerCase() === 'log';
  if (log) i += 1;
  if (i < tokens.length) return null;
  return { action, proto, src: src.spec, sport: sport.port, dst: dst.spec, port: dport.port, established, echo, log };
}

const addrMatch = (spec, ip) => spec.any || ((ip & ~spec.wild) >>> 0) === spec.ip;
const portMatch = (p, value) => {
  if (!p) return true;
  if (value === null || value === undefined) return false;
  if (p.op === 'eq') return value === p.a;
  if (p.op === 'neq') return value !== p.a;
  if (p.op === 'gt') return value > p.a;
  if (p.op === 'lt') return value < p.a;
  return value >= p.a && value <= p.b;
};

// packet: { src, dst, proto: 'icmp'|'tcp'|'udp', sport, dport, reply }
export function aceMatches(e, pkt) {
  if (e.proto !== 'ip' && e.proto !== pkt.proto) return false;
  if (!addrMatch(e.src, pkt.src) || !addrMatch(e.dst, pkt.dst)) return false;
  if (!portMatch(e.sport, pkt.sport) || !portMatch(e.port, pkt.dport)) return false;
  if (e.established && !pkt.reply) return false;
  if (e.echo === 'echo' && pkt.reply) return false;
  if (e.echo === 'echo-reply' && !pkt.reply) return false;
  return true;
}

// Run a packet through an ACL. An ACL that does not exist permits
// everything, as IOS does; one that exists ends in an implicit deny.
export function aclDecide(dev, name, pkt) {
  const acl = dev.config.acls?.[name];
  if (!acl) return true;
  dev.aclHits ??= {};
  for (const e of acl.entries) {
    if (!aceMatches(e, pkt)) continue;
    const key = `${name}|${e.seq}`;
    dev.aclHits[key] = (dev.aclHits[key] ?? 0) + 1;
    return e.action === 'permit';
  }
  return false;
}

export function aclPermits(dev, ifName, dir, pkt) {
  const intf = dev.config.interfaces[ifName];
  const name = dir === 'in' ? intf?.aclIn : intf?.aclOut;
  return name === null || name === undefined ? true : aclDecide(dev, name, pkt);
}

const addrText = (spec, standard) => (spec.any ? 'any' : spec.wild === 0 ? (standard ? formatIp(spec.ip) : `host ${formatIp(spec.ip)}`) : `${formatIp(spec.ip)} ${formatIp(spec.wild)}`);
const portText = (p) => (!p ? '' : p.op === 'range' ? ` range ${NAME_OF_PORT[p.a] ?? p.a} ${NAME_OF_PORT[p.b] ?? p.b}` : ` ${p.op} ${NAME_OF_PORT[p.a] ?? p.a}`);

// The line as the running config writes it, without the action.
export function aceText(kind, e) {
  if (kind === 'standard') return `${addrText(e.src, true)}${e.log ? ' log' : ''}`;
  return `${e.proto} ${addrText(e.src, false)}${portText(e.sport)} ${addrText(e.dst, false)}${portText(e.port)}${e.established ? ' established' : ''}${e.echo ? ` ${e.echo}` : ''}${e.log ? ' log' : ''}`;
}

// "show access-lists" writes standard entries with "wildcard bits".
function aceShow(kind, e) {
  if (kind === 'standard') return e.src.any ? 'any' : e.src.wild === 0 ? `host ${formatIp(e.src.ip)}` : `${formatIp(e.src.ip)}, wildcard bits ${formatIp(e.src.wild)}`;
  return aceText(kind, e);
}

export function addAce(dev, name, kind, entry, seq = null) {
  dev.config.acls ??= {};
  const acl = dev.config.acls[name] ??= { kind, named: aclKind(name) === null, entries: [] };
  if (acl.kind !== kind) return `% ${name} is ${acl.kind === 'standard' ? 'a standard' : 'an extended'} access list`;
  const next = seq ?? (acl.entries.length ? Math.max(...acl.entries.map(x => x.seq)) + 10 : 10);
  if (acl.entries.some(x => x.seq === next)) return '% Duplicate sequence number';
  // A duplicate of an existing line is ignored, as IOS does.
  if (acl.entries.some(x => JSON.stringify({ ...x, seq: 0 }) === JSON.stringify({ ...entry, seq: 0 }))) return '';
  acl.entries.push({ ...entry, seq: next });
  acl.entries.sort((a, b) => a.seq - b.seq);
  return '';
}

export function showAccessLists(dev, only = null) {
  const out = [];
  for (const [name, acl] of Object.entries(dev.config.acls ?? {})) {
    if (only !== null && String(only) !== name) continue;
    out.push(`${acl.kind === 'standard' ? 'Standard' : 'Extended'} IP access list ${name}`);
    for (const e of acl.entries) {
      const hits = dev.aclHits?.[`${name}|${e.seq}`] ?? 0;
      out.push(`    ${e.seq} ${e.action.padEnd(6)} ${aceShow(acl.kind, e)}${hits ? ` (${hits} match${hits === 1 ? '' : 'es'})` : ''}`);
    }
  }
  return out.join('\n');
}

export function aclConfigLines(dev) {
  const out = [];
  for (const [name, acl] of Object.entries(dev.config.acls ?? {})) {
    if (acl.named) {
      out.push(`ip access-list ${acl.kind} ${name}`);
      for (const e of acl.entries) out.push(` ${e.action} ${aceText(acl.kind, e)}`);
    } else {
      for (const e of acl.entries) out.push(`access-list ${name} ${e.action} ${aceText(acl.kind, e)}`);
    }
  }
  return out;
}

// ---------- NAT ----------
// config.nat = { statics: [{ local, global }], rules: [{ acl, iface?, pool?, overload }], pools: { NAME: { start, end, mask } } }
// world.natTable[deviceId] = [{ proto, local, global, outside, kind: 'static'|'dynamic'|'pat' }]

export const natRole = (dev, ifName) => dev.config.interfaces[ifName]?.nat ?? null;

function poolAddresses(pool) {
  const out = [];
  for (let a = pool.start; a <= pool.end && out.length < 256; a += 1) out.push(a >>> 0);
  return out;
}

// Inside to outside: rewrite the source, remembering how to undo it.
export function natOut(world, dev, egress, pkt) {
  const nat = dev.config.nat;
  if (!nat) return pkt;
  world.natTable ??= {};
  const table = world.natTable[dev.id] ??= [];
  const st = nat.statics.find(s => s.local === pkt.src);
  if (st) {
    if (!table.some(t => t.kind === 'static' && t.local === st.local)) table.push({ kind: 'static', proto: null, local: st.local, global: st.global, outside: null });
    if (pkt.proto) table.push({ kind: 'flow', proto: pkt.proto, local: pkt.src, global: st.global, outside: pkt.dst });
    return { ...pkt, src: st.global };
  }
  for (const r of nat.rules) {
    if (!dev.config.acls?.[r.acl]) continue;
    if (!aclDecide(dev, r.acl, { ...pkt, dst: pkt.dst })) continue;
    let global = null;
    if (r.iface) {
      const out = dev.config.interfaces[r.iface];
      if (!out?.ip || r.iface !== egress) continue;
      global = out.ip;
    } else if (r.pool) {
      const pool = nat.pools[r.pool];
      if (!pool) continue;
      const held = table.find(t => t.kind === 'dynamic' && t.local === pkt.src);
      if (held) global = held.global;
      else if (r.overload) global = pool.start;
      else {
        const used = new Set(table.filter(t => t.kind === 'dynamic').map(t => t.global));
        global = poolAddresses(pool).find(a => !used.has(a)) ?? null;
        if (global === null) return null; // pool exhausted: IOS drops it
        table.push({ kind: 'dynamic', proto: null, local: pkt.src, global, outside: null });
      }
    }
    if (global === null) continue;
    table.push({ kind: 'flow', proto: pkt.proto, local: pkt.src, global, outside: pkt.dst, pat: Boolean(r.overload || r.iface) });
    return { ...pkt, src: global };
  }
  return pkt;
}

// Outside to inside: a reply to a translated flow, or traffic to a static
// mapping, gets its destination put back.
export function natIn(world, dev, pkt) {
  const nat = dev.config.nat;
  if (!nat) return pkt;
  const table = world.natTable?.[dev.id] ?? [];
  const flow = [...table].reverse().find(t => t.kind === 'flow' && t.global === pkt.dst && t.outside === pkt.src);
  if (flow) return { ...pkt, dst: flow.local };
  const st = nat.statics.find(s => s.global === pkt.dst);
  if (st) return { ...pkt, dst: st.local };
  return pkt;
}

// Addresses a router answers ARP for on its outside interfaces: static
// globals and pool addresses in that interface's subnet.
export function natClaims(dev, ifName, ip) {
  const nat = dev.config.nat;
  const intf = dev.config.interfaces[ifName];
  if (!nat || intf?.nat !== 'outside' || intf.ip === null) return false;
  if (!inSubnet(ip, intf.ip, maskToLen(intf.mask))) return false;
  if (nat.statics.some(s => s.global === ip)) return true;
  return Object.values(nat.pools).some(p => ip >= p.start && ip <= p.end);
}

const pad = (s, n) => (String(s).length >= n ? `${s} ` : String(s).padEnd(n));

export function showNatTranslations(world, dev) {
  const table = world.natTable?.[dev.id] ?? [];
  const out = [`${pad('Pro', 5)}${pad('Inside global', 22)}${pad('Inside local', 22)}${pad('Outside local', 22)}Outside global`];
  let n = 1;
  for (const t of table) {
    if (t.kind === 'flow') {
      const id = t.pat ? `:${n}` : '';
      out.push(`${pad(t.proto ?? '---', 5)}${pad(`${formatIp(t.global)}${id}`, 22)}${pad(`${formatIp(t.local)}${id}`, 22)}${pad(`${formatIp(t.outside)}${id}`, 22)}${formatIp(t.outside)}${id}`);
      n += 1;
    } else out.push(`${pad('---', 5)}${pad(formatIp(t.global), 22)}${pad(formatIp(t.local), 22)}${pad('---', 22)}---`);
  }
  return out.join('\n');
}

export function natConfigLines(dev) {
  const nat = dev.config.nat;
  if (!nat) return [];
  const out = [];
  for (const [name, p] of Object.entries(nat.pools)) out.push(`ip nat pool ${name} ${formatIp(p.start)} ${formatIp(p.end)} netmask ${formatIp(p.mask)}`);
  for (const r of nat.rules) out.push(`ip nat inside source list ${r.acl} ${r.iface ? `interface ${r.iface}` : `pool ${r.pool}`}${r.overload ? ' overload' : ''}`);
  for (const s of nat.statics) out.push(`ip nat inside source static ${formatIp(s.local)} ${formatIp(s.global)}`);
  return out;
}

export const emptyNat = () => ({ statics: [], rules: [], pools: {} });

// ---------- DHCP ----------
// config.dhcp = { excluded: [[lo, hi]], pools: { NAME: { net, len, router, dns, domain } } }
// world.dhcpLeases[serverId] = { ip(number): mac }

export const emptyDhcp = () => ({ excluded: [], pools: {} });

// A server (a PC-kind device with config.server) runs DHCP the way a
// server's DHCP service is set up in a GUI: a pool by start address, mask,
// gateway, DNS and a maximum number of users. Addresses below the start are
// left out, the same as an excluded range on a router.
//   config.server = { dns: { on, records: { name: ip } }, dhcp: { on, pools: [{ name, start, mask, gateway, dns, max }] } }
export function dhcpView(dev) {
  if (!dev) return null;
  if (dev.kind === 'pc') {
    const s = dev.config.server?.dhcp;
    if (!s?.on) return null;
    const pools = {};
    const excluded = [];
    for (const p of s.pools ?? []) {
      if (p.start === null || p.mask === null) continue;
      const len = maskToLen(p.mask);
      const net = network(p.start, len);
      pools[p.name] = { net, len, router: p.gateway ?? null, dns: p.dns ?? null, domain: null, max: p.max ?? null };
      if (p.start > net + 1) excluded.push([(net + 1) >>> 0, (p.start - 1) >>> 0]);
    }
    return { excluded, pools };
  }
  return dev.config.dhcp ?? null;
}
export const servesDhcp = (dev) => Object.keys(dhcpView(dev)?.pools ?? {}).length > 0;

export function poolFor(dev, gi) {
  const pools = Object.entries(dhcpView(dev)?.pools ?? {});
  const hit = pools.find(([, p]) => p.net !== null && inSubnet(gi, p.net, p.len));
  return hit ? { name: hit[0], pool: hit[1] } : null;
}

// Lease the first free address: not excluded, not leased, not already on
// any interface in the lab (IOS pings before it offers, to catch conflicts).
export function lease(world, server, poolName, mac) {
  const dev = world.devices[server];
  const view = dhcpView(dev);
  const p = view.pools[poolName];
  world.dhcpLeases ??= {};
  const leases = world.dhcpLeases[server] ??= {};
  const mine = Object.entries(leases).find(([, m]) => m === mac);
  if (mine && inSubnet(Number(mine[0]), p.net, p.len)) return Number(mine[0]);
  const taken = new Set(Object.values(world.devices).flatMap(d => Object.values(d.config.interfaces).map(i => i.ip).filter(x => x !== null)));
  const excluded = (a) => (view.excluded ?? []).some(([lo, hi]) => a >= lo && a <= hi);
  const inPool = Object.keys(leases).filter(a => inSubnet(Number(a), p.net, p.len)).length;
  if (p.max && inPool >= p.max) return null;
  const first = (network(p.net, p.len) + 1) >>> 0;
  const last = ((network(p.net, p.len) | (~lenToMask(p.len) >>> 0)) - 1) >>> 0;
  for (let a = first; a <= last; a += 1) {
    if (excluded(a) || taken.has(a) || leases[a]) continue;
    leases[a] = mac;
    return a;
  }
  return null;
}

export function showDhcpBinding(world, dev) {
  const leases = world.dhcpLeases?.[dev.id] ?? {};
  const out = ['Bindings from all pools not associated with VRF:', `${pad('IP address', 18)}${pad('Client-ID/', 21)}${pad('Lease expiration', 24)}${pad('Type', 10)}State      Interface`, `${pad('', 18)}Hardware address/`, `${pad('', 18)}User name`];
  for (const [ip, mac] of Object.entries(leases).sort((a, b) => a[0] - b[0])) {
    const cid = `01${mac.replace(/\./g, '')}`.match(/.{1,4}/g).join('.');
    out.push(`${pad(formatIp(Number(ip)), 18)}${pad(cid, 21)}${pad('Oct 14 2026 09:00 AM', 24)}${pad('Automatic', 10)}Active     GigabitEthernet0/0`);
  }
  return out.join('\n');
}

export function dhcpConfigLines(dev) {
  const d = dev.config.dhcp;
  if (!d) return [];
  const out = [];
  for (const [lo, hi] of d.excluded) out.push(`ip dhcp excluded-address ${formatIp(lo)}${hi !== lo ? ` ${formatIp(hi)}` : ''}`);
  if (d.excluded.length) out.push('!');
  for (const [name, p] of Object.entries(d.pools)) {
    out.push(`ip dhcp pool ${name}`);
    if (p.net !== null) out.push(` network ${formatIp(p.net)} ${formatIp(lenToMask(p.len))}`);
    if (p.router !== null) out.push(` default-router ${formatIp(p.router)}`);
    if (p.dns !== null) out.push(` dns-server ${formatIp(p.dns)}`);
    if (p.domain) out.push(` domain-name ${p.domain}`);
    out.push('!');
  }
  return out;
}

// ---------- DNS ----------
// A name lookup from a PC: ask its DNS server over UDP 53, then read the
// server's records. Names match without case, with or without a final dot.
export function dnsRecordsOf(dev) {
  const d = dev?.config.server?.dns;
  return d?.on ? d.records ?? {} : null;
}
