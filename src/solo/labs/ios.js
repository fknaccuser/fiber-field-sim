// A Cisco IOS command line for the labs.
//
// Real modes and prompts, unique-prefix abbreviations ("conf t", "sh ip ro"),
// "?" help, Tab completion, IOS's own error messages, and the questions IOS
// asks back (save before reload? how many bits in the modulus?). Commands
// change the device's configuration in the lab world; everything else (state,
// routes, neighbors) follows from world.js.
//
// The grammar is a table per mode. A command that does not parse in a
// sub-mode is tried against global configuration, as IOS does, which is how
// "interface g0/1" works from inside another interface.

import {
  interfaceState, routingTable, neighbors, ospfEnabled, ospfRole, ospfCost, ping as pingWorld, trace as traceWorld, exchange, requestDhcp,
  refresh, clearOspf, save, unsaved, reload, makeInterface, l2Of, takeNotices,
} from './world.js';
import { parseIp, formatIp, maskToLen, lenToMask, network, isIp, isMask, classfulLen } from './ip4.js';
import { makeSwitchport, parseVlanList, formatVlanList, isSub, isSvi, isPo, parentOf } from './switching.js';
import {
  aclKind, parseAce, addAce, showAccessLists, aclConfigLines, emptyNat, natConfigLines, showNatTranslations,
  emptyDhcp, dhcpConfigLines, showDhcpBinding,
} from './services.js';
import {
  showVlanBrief, showInterfacesStatus, showInterfacesTrunk, showSwitchport, showInterface, showMacTable, showSpanningTree,
  showEtherchannelSummary, showPortSecurity, showPortSecurityInterface, showCdpNeighbors, showCdpDetail, showLldpNeighbors, showHostRoute,
} from './show-l2.js';
import { parse6, format6, parsePrefix6, net6, isLinkLocal, solicited } from './ip6.js';
import { v6Of, routingTable6, ping6, trace6, slaacFrom } from './v6.js';

// ---------- interface names ----------

const IF_TYPES = [
  { full: 'GigabitEthernet', short: 'Gi', re: /^g(i(g(a(b(i(t(e(t(h(e(r(n(e(t)?)?)?)?)?)?)?)?)?)?)?)?)?)?$/i, num: /^\d+\/\d+(\.\d+)?$/ },
  { full: 'FastEthernet', short: 'Fa', re: /^f(a(s(t(e(t(h(e(r(n(e(t)?)?)?)?)?)?)?)?)?)?)?$/i, num: /^\d+\/\d+(\.\d+)?$/ },
  { full: 'Loopback', short: 'Lo', re: /^l(o(o(p(b(a(c(k)?)?)?)?)?)?)?$/i, num: /^\d+$/ },
  { full: 'Vlan', short: 'Vlan', re: /^v(l(a(n)?)?)?$/i, num: /^\d+$/ },
  { full: 'Port-channel', short: 'Po', re: /^po(r(t(-(c(h(a(n(n(e(l)?)?)?)?)?)?)?)?)?)?$/i, num: /^\d+$/ },
];

// Accepts "g0/0", "gi 0/0", "GigabitEthernet0/0", "f0/1", "g0/0.10",
// "lo0", "loopback 0", "vlan 10", "po1".
function readInterface(tokens, i) {
  const one = tokens[i]?.text ?? '';
  const m = /^([a-z][a-z-]*?)([\d/.]*)$/i.exec(one);
  if (!m) return null;
  const type = IF_TYPES.find(t => t.re.test(m[1]));
  if (!type) return null;
  let num = m[2];
  let used = 1;
  if (!num && tokens[i + 1] && /^[\d/.]+$/.test(tokens[i + 1].text)) { num = tokens[i + 1].text; used = 2; }
  if (!num || !type.num.test(num)) return null;
  return { name: `${type.full}${num}`, used };
}

export const shortIf = (name) => name.replace('GigabitEthernet', 'Gi').replace('FastEthernet', 'Fa').replace('Loopback', 'Lo').replace('Port-channel', 'Po');


// ---------- grammar ----------

const ARG = {
  ip: { check: isIp, help: 'A.B.C.D' },
  ip6: { check: (t) => parse6(t) !== null, help: 'X:X:X:X::X' },
  ip6pfx: { check: (t) => parsePrefix6(t) !== null, help: 'X:X:X:X::X/<0-128>' },
  mask: { check: isMask, help: 'A.B.C.D  Mask' },
  wild: { check: isIp, help: 'A.B.C.D  Wildcard bits' },
  num: { check: (t) => /^\d+$/.test(t), help: '<0-4294967295>' },
  word: { check: (t) => t.length > 0, help: 'WORD' },
  rest: { check: () => true, help: 'LINE' },
};

const W = (name, type, extra = {}) => ({ arg: type, name, ...extra });
const ALT = (name, options, extra = {}) => ({ alt: options, name, ...extra });

// Tokenize, remembering where each token starts so an error can point at it.
function tokenize(line) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line))) out.push({ text: m[0], at: m.index });
  return out;
}

// Try one command spec against the tokens.
function matchSpec(spec, tokens) {
  const args = {};
  let i = 0;
  let exact = 0;
  const literals = [];
  for (let w = 0; w < spec.words.length; w += 1) {
    const el = spec.words[w];
    const optional = typeof el === 'object' && el.opt;
    if (i >= tokens.length) {
      if (optional || (typeof el === 'object' && el.arg === 'rest' && el.opt)) continue;
      return { ok: false, incomplete: true, failAt: i, literals };
    }
    const tok = tokens[i].text;
    if (typeof el === 'string') {
      if (!el.startsWith(tok.toLowerCase())) return { ok: false, failAt: i, literals };
      if (el === tok.toLowerCase()) exact += 1;
      literals.push({ pos: i, word: el, typed: tok });
      i += 1;
    } else if (el.alt) {
      const hits = el.alt.filter(o => o.startsWith(tok.toLowerCase()));
      const chosen = hits.includes(tok.toLowerCase()) ? tok.toLowerCase() : hits.length === 1 ? hits[0] : null;
      if (!chosen) {
        if (optional) continue;
        return { ok: false, failAt: i, literals, ambiguous: hits.length > 1 };
      }
      args[el.name] = chosen;
      literals.push({ pos: i, word: chosen, typed: tok });
      i += 1;
    } else if (el.arg === 'intf') {
      const r = readInterface(tokens, i);
      if (!r) { if (optional) continue; return { ok: false, failAt: i, literals }; }
      args[el.name] = r.name;
      i += r.used;
    } else if (el.arg === 'rest') {
      args[el.name] = tokens.slice(i).map(t => t.text).join(' ');
      i = tokens.length;
    } else {
      if (!ARG[el.arg].check(tok)) { if (optional) continue; return { ok: false, failAt: i, literals }; }
      args[el.name] = el.arg === 'num' ? Number(tok) : tok;
      i += 1;
    }
  }
  if (i < tokens.length) return { ok: false, failAt: i, literals };
  return { ok: true, args, exact, literals };
}

// Choose among the specs of a mode the way IOS does: an abbreviation must be
// unique among the words that could appear in that position.
function parse(specs, tokens) {
  const results = specs.map(spec => ({ spec, r: matchSpec(spec, tokens) }));
  const ok = results.filter(x => x.r.ok);
  if (ok.length) {
    // Ambiguity: two commands whose words differ where the typed word is a
    // prefix of both, and neither matched it exactly.
    for (let pos = 0; pos < tokens.length; pos += 1) {
      const words = new Set();
      for (const x of results) {
        const lit = x.r.literals?.find(l => l.pos === pos);
        if (lit && (x.r.ok || x.r.failAt > pos)) words.add(lit.word);
      }
      const typed = tokens[pos].text.toLowerCase();
      if (words.size > 1 && ![...words].includes(typed)) {
        return { error: 'ambiguous', upto: pos };
      }
    }
    ok.sort((a, b) => b.r.exact - a.r.exact);
    return { spec: ok[0].spec, args: ok[0].r.args };
  }
  const furthest = Math.max(...results.map(x => x.r.failAt ?? 0));
  const incomplete = results.some(x => x.r.incomplete && x.r.failAt === furthest && furthest === tokens.length);
  if (incomplete) return { error: 'incomplete' };
  if (results.some(x => x.r.ambiguous && x.r.failAt === furthest)) return { error: 'ambiguous', upto: furthest };
  return { error: 'invalid', at: furthest };
}

// ---------- helpers for output ----------

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const AGE = '00:01:12';

function fakeHash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const alphabet = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < 43; i += 1) { h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0; out += alphabet[h % 64]; }
  return `$9$${out.slice(0, 14)}$${out.slice(14)}`;
}

// The order IOS lists interfaces in: Loopback and Port-channel first, then
// the physical ports, then SVIs.
const IF_ORDER = (n) => (n.startsWith('Loopback') ? 0 : n.startsWith('Port') ? 1 : n.startsWith('Fast') ? 2 : n.startsWith('Gig') ? 3 : 4);
const ifSort = (a, b) => IF_ORDER(a) - IF_ORDER(b) || a.localeCompare(b, undefined, { numeric: true });

function switchportLines(sw) {
  const L = [];
  if (sw.encap) L.push(' switchport trunk encapsulation dot1q');
  if (sw.native !== 1) L.push(` switchport trunk native vlan ${sw.native}`);
  if (sw.allowed !== null) L.push(` switchport trunk allowed vlan ${formatVlanList(sw.allowed)}`);
  if (sw.access !== 1) L.push(` switchport access vlan ${sw.access}`);
  if (sw.mode !== 'dynamic auto') L.push(` switchport mode ${sw.mode}`);
  if (sw.nonegotiate) L.push(' switchport nonegotiate');
  if (sw.voice !== null) L.push(` switchport voice vlan ${sw.voice}`);
  const p = sw.psec;
  if (p.max !== 1) L.push(` switchport port-security maximum ${p.max}`);
  if (p.violation !== 'shutdown') L.push(` switchport port-security violation ${p.violation}`);
  if (p.sticky) L.push(' switchport port-security mac-address sticky');
  for (const m of p.macs) L.push(m.sticky ? ` switchport port-security mac-address sticky ${m.mac}` : ` switchport port-security mac-address ${m.mac}`);
  if (p.on) L.push(' switchport port-security');
  return L;
}

export function runningConfig(dev) {
  const c = dev.config;
  const isSwitch = dev.kind === 'switch';
  const L = ['!', `hostname ${c.hostname}`, '!'];
  if (c.enableSecret) L.push(`enable secret 9 ${fakeHash(c.enableSecret)}`);
  if (c.enablePassword) L.push(c.servicePasswordEncryption ? `enable password 7 ${fakeHash(c.enablePassword).slice(3, 15)}` : `enable password ${c.enablePassword}`);
  if (c.enableSecret || c.enablePassword) L.push('!');
  for (const [name, u] of Object.entries(c.users)) L.push(`username ${name}${u.privilege ? ` privilege ${u.privilege}` : ''} ${u.secret ? `secret 9 ${fakeHash(u.secret)}` : `password ${u.password}`}`);
  if (Object.keys(c.users).length) L.push('!');
  if (c.domain) L.push(`ip domain name ${c.domain}`, '!');
  if (c.timestamps) L.push('service timestamps log datetime msec', '!');
  L.push(...v6GlobalLines(c));
  L.push(...dhcpConfigLines(dev));
  if (c.servicePasswordEncryption) L.push('service password-encryption', '!');
  if (isSwitch) {
    L.push(`spanning-tree mode ${c.stp.mode}`);
    if (c.stp.portfastDefault) L.push('spanning-tree portfast default');
    if (c.stp.bpduguardDefault) L.push('spanning-tree portfast bpduguard default');
    L.push('spanning-tree extend system-id');
    for (const [v, p] of Object.entries(c.stp.prio).sort((a, b) => a[0] - b[0])) L.push(`spanning-tree vlan ${v} priority ${p}`);
    L.push('!');
  }
  if (c.cdp === false) L.push('no cdp run', '!');
  if (c.lldp) L.push('lldp run', '!');
  const names = Object.keys(c.interfaces).sort(ifSort);
  for (const n of names) {
    const i = c.interfaces[n];
    L.push(`interface ${n}`);
    if (i.description) L.push(` description ${i.description}`);
    if (i.speed && i.speed !== 'auto') L.push(` speed ${i.speed}`);
    if (i.duplex && i.duplex !== 'auto') L.push(` duplex ${i.duplex}`);
    if (i.sw) {
      L.push(...switchportLines(i.sw));
      if (i.shutdown) L.push(' shutdown');
      if (i.cdp === false) L.push(' no cdp enable');
      if (i.sw.channel) L.push(` channel-group ${i.sw.channel.group} mode ${i.sw.channel.mode}`);
      if (i.sw.portfast) L.push(' spanning-tree portfast');
      if (i.sw.bpduguard) L.push(` spanning-tree bpduguard ${i.sw.bpduguard}`);
      L.push('!');
      continue;
    }
    if (i.encap) L.push(` encapsulation dot1Q ${i.encap.vlan}${i.encap.native ? ' native' : ''}`);
    L.push(i.ip !== null ? ` ip address ${formatIp(i.ip)} ${formatIp(i.mask)}` : ' no ip address');
    if (i.ospf.networkType) L.push(` ip ospf network ${i.ospf.networkType}`);
    if (i.ospf.priority !== 1) L.push(` ip ospf priority ${i.ospf.priority}`);
    if (i.ospf.cost !== null) L.push(` ip ospf cost ${i.ospf.cost}`);
    if (i.ospf.pid !== null) L.push(` ip ospf ${i.ospf.pid} area ${i.ospf.area}`);
    L.push(...v6InterfaceLines(i));
    if (i.helper) L.push(` ip helper-address ${formatIp(i.helper)}`);
    if (i.aclIn) L.push(` ip access-group ${i.aclIn} in`);
    if (i.aclOut) L.push(` ip access-group ${i.aclOut} out`);
    if (i.nat) L.push(` ip nat ${i.nat}`);
    if (i.cdp === false) L.push(' no cdp enable');
    if (i.shutdown) L.push(' shutdown');
    L.push('!');
  }
  if (isSwitch && c.defaultGateway !== null && c.defaultGateway !== undefined) L.push(`ip default-gateway ${formatIp(c.defaultGateway)}`, '!');
  if (c.ospf) {
    L.push(`router ospf ${c.ospf.pid}`);
    if (c.ospf.routerId) L.push(` router-id ${formatIp(c.ospf.routerId)}`);
    for (const p of c.ospf.passive) L.push(` passive-interface ${p}`);
    for (const n of c.ospf.networks) L.push(` network ${formatIp(n.ip)} ${formatIp(n.wildcard)} area ${n.area}`);
    L.push('!');
  }
  for (const s of c.statics) L.push(`ip route ${formatIp(s.net)} ${formatIp(lenToMask(s.len))}${s.intf ? ` ${s.intf}` : ''}${s.nh !== null && s.nh !== undefined ? ` ${formatIp(s.nh)}` : ''}${s.ad !== 1 ? ` ${s.ad}` : ''}`);
  if (c.sshVersion) L.push(`ip ssh version ${c.sshVersion}`);
  if (c.statics.length || c.sshVersion) L.push('!');
  const r6 = v6RouteLines(c);
  if (r6.length) L.push(...r6, '!');
  const svc = [...natConfigLines(dev), ...aclConfigLines(dev)];
  if (svc.length) L.push(...svc, '!');
  const ops = [...(c.logHosts ?? []).map(h => `logging host ${formatIp(h)}`), ...(c.ntp ?? []).map(h => `ntp server ${formatIp(h)}`)];
  if (ops.length) L.push(...ops, '!');
  if (c.banner) L.push(`banner motd ^C${c.banner}^C`, '!');
  const blocks = [['con', 'line con 0'], ['vty', 'line vty 0 4']];
  if (isSwitch) blocks.push(['vty', 'line vty 5 15']);
  for (const [key, label] of blocks) {
    const l = c.lines[key];
    L.push(label);
    if (l.execTimeout !== null) L.push(` exec-timeout ${l.execTimeout}`);
    if (l.password) L.push(` password ${c.servicePasswordEncryption ? `7 ${fakeHash(l.password).slice(3, 13)}` : l.password}`);
    if (l.login === 'local') L.push(' login local');
    else if (l.login === 'line') L.push(' login');
    if (l.transport) L.push(` transport input ${l.transport}`);
  }
  L.push('!', 'end');
  const body = L.join('\n');
  return `Building configuration...\n\nCurrent configuration : ${body.length + 1} bytes\n${body}`;
}

function showIpRoute(world, deviceId, filter = null) {
  const table = routingTable(world, deviceId);
  const def = table.find(r => r.net === 0 && r.len === 0);
  const out = [
    'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
    '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
    '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
    '       E1 - OSPF external type 1, E2 - OSPF external type 2',
    '       i - IS-IS, su - IS-IS summary, L1 - IS-IS level-1, L2 - IS-IS level-2',
    '       ia - IS-IS inter area, * - candidate default, U - per-user static route',
    '       o - ODR, P - periodic downloaded static route, H - NHRP, l - LISP',
    '       + - replicated route, % - next hop override',
    '',
    def ? `Gateway of last resort is ${def.hops[0].nh !== null ? formatIp(def.hops[0].nh) : '0.0.0.0'} to network 0.0.0.0` : 'Gateway of last resort is not set',
    '',
  ];
  const typeCode = { connected: 'C', local: 'L', static: 'S', ospf: 'O' };
  const shown = table.filter(r => !filter || (filter === 'connected' ? ['connected', 'local'].includes(r.type) : r.type === filter));
  const line = (r, indent) => {
    let code = typeCode[r.type];
    if (r.net === 0 && r.len === 0) code += '*';
    const prefix = `${formatIp(r.net)}/${r.len}`;
    const lead = pad(code, indent);
    if (r.type === 'connected' || r.type === 'local') return [`${lead}${prefix} is directly connected, ${r.hops[0].intf}`];
    if (r.type === 'static') {
      return r.hops.map((h, k) => {
        const head = k === 0 ? `${lead}${prefix} ` : ' '.repeat(lead.length + prefix.length + 1);
        return h.nh !== null ? `${head}[${r.ad}/0] via ${formatIp(h.nh)}` : `${head}is directly connected, ${h.intf}`;
      });
    }
    return r.hops.map((h, k) => {
      const head = k === 0 ? `${lead}${prefix} ` : ' '.repeat(lead.length + prefix.length + 1);
      return `${head}[${r.ad}/${r.metric}] via ${formatIp(h.nh)}, ${AGE}, ${h.intf}`;
    });
  };
  // Group by classful network, the way IOS prints the table.
  const groups = new Map();
  for (const r of shown) {
    const major = r.len === 0 ? -1 : network(r.net, classfulLen(r.net));
    if (!groups.has(major)) groups.set(major, []);
    groups.get(major).push(r);
  }
  for (const [major, rs] of groups) {
    if (major === -1) { for (const r of rs) out.push(...line(r, 6)); continue; }
    const cl = classfulLen(major);
    const grouped = rs.length > 1 || rs[0].len !== cl;
    if (!grouped) { for (const r of rs) out.push(...line(r, 6)); continue; }
    const masks = new Set(rs.map(r => r.len));
    out.push(masks.size > 1
      ? `      ${formatIp(major)}/${cl} is variably subnetted, ${rs.length} subnets, ${masks.size} masks`
      : `      ${formatIp(major)}/${[...masks][0]} is subnetted, ${rs.length} subnets`);
    for (const r of rs) out.push(...line(r, 9));
  }
  return out.join('\n');
}

function showIpIntBrief(world, deviceId) {
  const dev = world.devices[deviceId];
  const out = [`${pad('Interface', 23)}${pad('IP-Address', 16)}${pad('OK?', 4)}${pad('Method', 7)}${pad('Status', 22)}Protocol`];
  const names = Object.keys(dev.config.interfaces).sort(dev.kind === 'switch' ? ifSort : (a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const n of names) {
    const i = dev.config.interfaces[n];
    const st = interfaceState(world, deviceId, n);
    out.push(`${pad(n, 23)}${pad(i.ip !== null ? formatIp(i.ip) : 'unassigned', 16)}${pad('YES', 4)}${pad(i.ip !== null ? 'manual' : 'unset', 7)}${pad(st.status, 22)}${st.protocol}`);
  }
  return out.join('\n');
}

function showOspfNeighbor(world, deviceId) {
  const list = neighbors(world, deviceId);
  const out = ['', `${pad('Neighbor ID', 16)}${pad('Pri', 6)}${pad('State', 16)}${pad('Dead Time', 12)}${pad('Address', 16)}Interface`];
  for (const n of list) {
    const state = `${n.state}/${n.role === '-' ? '  -' : n.role}`;
    out.push(`${pad(formatIp(n.rid), 16)}${lpad(n.priority, 3)}   ${pad(state, 16)}${pad('00:00:3' + (n.rid % 10), 12)}${pad(formatIp(n.address), 16)}${n.intf}`);
  }
  return out.join('\n');
}

function showOspfIntBrief(world, deviceId) {
  const dev = world.devices[deviceId];
  if (!dev.config.ospf) return '';
  const out = [`${pad('Interface', 13)}${pad('PID', 6)}${pad('Area', 16)}${pad('IP Address/Mask', 19)}${pad('Cost', 6)}${pad('State', 6)}Nbrs F/C`];
  const nbrs = neighbors(world, deviceId);
  for (const i of Object.values(dev.config.interfaces)) {
    if (!ospfEnabled(world, deviceId, i.name)) continue;
    const mine = nbrs.filter(n => n.intf === i.name);
    out.push(`${pad(shortIf(i.name), 13)}${pad(dev.config.ospf.pid, 6)}${pad(i.ospf.area ?? dev.config.ospf.networks.find(n => (i.ip & ~n.wildcard) === (n.ip & ~n.wildcard))?.area ?? 0, 16)}${pad(`${formatIp(i.ip)}/${maskToLen(i.mask)}`, 19)}${pad(ospfCost(i), 6)}${pad(ospfRole(world, deviceId, i.name) ?? 'DOWN', 6)}${mine.filter(n => n.state === 'FULL').length}/${mine.length}`);
  }
  return out.join('\n');
}

function showIpProtocols(world, deviceId) {
  const dev = world.devices[deviceId];
  const o = dev.config.ospf;
  if (!o) return '*** IP Routing is NSF aware ***\n';
  const out = ['*** IP Routing is NSF aware ***', '', `Routing Protocol is "ospf ${o.pid}"`,
    `  Router ID ${dev.ospfRid !== null ? formatIp(dev.ospfRid) : '0.0.0.0'}`, '  Routing for Networks:'];
  for (const n of o.networks) out.push(`    ${formatIp(n.ip)} ${formatIp(n.wildcard)} area ${n.area}`);
  if (o.passive.length) { out.push('  Passive Interface(s):'); for (const p of o.passive) out.push(`    ${p}`); }
  out.push('  Routing Information Sources:', '    Gateway         Distance      Last Update');
  for (const n of neighbors(world, deviceId)) out.push(`    ${pad(formatIp(n.rid), 16)}${pad('110', 14)}${AGE}`);
  out.push('  Distance: (default is 110)');
  return out.join('\n');
}

function showIpSsh(dev) {
  if (!dev.rsaBits) return 'SSH Disabled - version 1.99\n%Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).';
  const v = dev.config.sshVersion === 2 ? '2.0' : dev.config.sshVersion === 1 ? '1.5' : '1.99';
  return `SSH Enabled - version ${v}\nAuthentication methods:publickey,keyboard-interactive,password\nAuthentication timeout: 120 secs; Authentication retries: 3\nMinimum expected Diffie Hellman key size : 2048 bits\nIOS Keys in SECSH format(ssh-rsa, base64 encoded): ${dev.config.hostname}\nModulus Size : ${dev.rsaBits} bits`;
}

function pingText(world, deviceId, dstText, sourceText) {
  const dst = parseIp(dstText);
  let src = null;
  if (sourceText) {
    const dev = world.devices[deviceId];
    const asIf = readInterface(tokenize(sourceText), 0);
    const intf = asIf ? dev.config.interfaces[asIf.name] : Object.values(dev.config.interfaces).find(i => i.ip === parseIp(sourceText));
    if (!intf || intf.ip === null || !interfaceState(world, deviceId, intf.name).up) {
      return { text: '% Invalid source address- IP address not on any of our up interfaces', ok: false };
    }
    src = intf.ip;
  }
  const r = pingWorld(world, deviceId, dst, src);
  const head = `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${dstText}, timeout is 2 seconds:${src !== null ? `\nPacket sent with a source address of ${formatIp(src)}` : ''}`;
  return r.ok
    ? { text: `${head}\n!!!!!\nSuccess rate is 100 percent (5/5), round-trip min/avg/max = 1/1/2 ms`, ok: true, src }
    : { text: `${head}\n${r.reason === 'acl' && r.stage === 'there' ? 'U.U.U' : '.....'}\nSuccess rate is 0 percent (0/5)`, ok: false, src };
}

// ---------- the commands ----------

function cmd(words, run, extra = {}) { return { words, run, ...extra }; }

const PING = cmd(['ping', W('dst', 'ip'), W('opt', 'rest', { opt: true })], ({ dst, opt }, s) => {
  let source = null;
  if (opt) {
    const t = opt.split(/\s+/);
    if (!'source'.startsWith(t[0].toLowerCase()) || t.length < 2) return { out: invalidAt(s, s.line.indexOf(opt)) };
    source = t.slice(1).join(' ');
  }
  const r = pingText(s.world, s.deviceId, dst, source);
  s.events.push({ kind: 'ping', dst: parseIp(dst), src: r.src ?? null, ok: r.ok });
  return { out: r.text };
}, { key: 'ping' });

const TRACEROUTE = cmd(['traceroute', W('dst', 'ip')], ({ dst }, s) => {
  const r = traceWorld(s.world, s.deviceId, parseIp(dst));
  const hops = r.hops.map(h => h.ip);
  if (r.ok && hops[hops.length - 1] !== parseIp(dst)) hops.push(parseIp(dst));
  const lines = hops.map((ip, k) => `  ${k + 1} ${formatIp(ip)} 0 msec 0 msec 0 msec`);
  if (!r.ok) lines.push(`  ${hops.length + 1}  *  *  * `);
  s.events.push({ kind: 'trace', dst: parseIp(dst), ok: r.ok });
  return { out: `Type escape sequence to abort.\nTracing the route to ${dst}\nVRF info: (vrf in name/id, vrf out name/id)\n${lines.join('\n')}` };
}, { key: 'traceroute' });

const intfArg = (s, name) => (s.dev.config.interfaces[name] ? null : invalidAt(s, s.line.search(/\S+\s*$/)));

// Show commands every IOS device has.
const SHOW_COMMON = [
  cmd(['show', 'ip', 'interface', 'brief'], (_, s) => ({ out: showIpIntBrief(s.world, s.deviceId) }), { key: 'show ip interface brief' }),
  cmd(['show', 'ip', 'ssh'], (_, s) => ({ out: showIpSsh(s.dev) }), { key: 'show ip ssh' }),
  cmd(['show', 'cdp', 'neighbors', ALT('detail', ['detail'], { opt: true })], ({ detail }, s) => ({ out: detail ? showCdpDetail(s.world, s.deviceId) : showCdpNeighbors(s.world, s.deviceId) }), { key: 'show cdp neighbors' }),
  cmd(['show', 'lldp', 'neighbors'], (_, s) => ({ out: showLldpNeighbors(s.world, s.deviceId) }), { key: 'show lldp neighbors' }),
  cmd(['show', 'interfaces', W('name', 'intf')], ({ name }, s) => ({ out: intfArg(s, name) ?? showInterface(s.world, s.deviceId, name) }), { key: 'show interfaces' }),
];


// ---------- ACLs, NAT, DHCP, NTP, logging (routers) ----------

function showIpInterface(world, dev, name) {
  const i = dev.config.interfaces[name];
  const st = interfaceState(world, dev.id, name);
  const lines = [`${name} is ${st.status}, line protocol is ${st.protocol}`];
  lines.push(i.ip !== null ? `  Internet address is ${formatIp(i.ip)}/${maskToLen(i.mask)}` : '  Internet protocol processing disabled');
  if (i.ip !== null) {
    lines.push('  Broadcast address is 255.255.255.255');
    lines.push(`  Helper address is ${i.helper ? formatIp(i.helper) : 'not set'}`);
    lines.push(`  Outgoing Common access list is not set`, `  Outgoing access list is ${i.aclOut ?? 'not set'}`, `  Inbound Common access list is not set`, `  Inbound  access list is ${i.aclIn ?? 'not set'}`);
    lines.push(`  IP NAT ${i.nat ? `${i.nat} interface` : 'disabled'}`);
  }
  return lines.join('\n');
}

function showNtp(world, dev) {
  const servers = dev.config.ntp ?? [];
  if (!servers.length) return '%NTP is not enabled.';
  const out = ['  address         ref clock       st   when   poll reach  delay  offset   disp'];
  for (const sv of servers) {
    const ok = pingWorld(world, dev.id, sv).ok;
    out.push(`${ok ? '*~' : ' ~'}${formatIp(sv).padEnd(16)}${ok ? '.GPS.'.padEnd(16) : '.INIT.'.padEnd(16)}${ok ? '  1' : ' 16'}     ${ok ? '12' : ' -'}     64   ${ok ? '377' : '  0'}  1.021   0.214  0.091`);
  }
  out.push(' * sys.peer, # selected, + candidate, - outlyer, x falseticker', ' ~ configured');
  return out.join('\n');
}

const SHOW_SERVICES = [
  cmd(['show', ALT('ipkw', ['ip'], { opt: true }), 'access-lists', W('name', 'word', { opt: true })], ({ name }, s) => ({ out: showAccessLists(s.dev, name ?? null) }), { key: 'show access-lists' }),
  cmd(['show', 'ip', 'nat', 'translations'], (_, s) => ({ out: showNatTranslations(s.world, s.dev) }), { key: 'show ip nat translations' }),
  cmd(['show', 'ip', 'dhcp', 'binding'], (_, s) => ({ out: showDhcpBinding(s.world, s.dev) }), { key: 'show ip dhcp binding' }),
  cmd(['show', 'ip', 'interface', W('name', 'intf')], ({ name }, s) => ({ out: intfArg(s, name) ?? showIpInterface(s.world, s.dev, name) }), { key: 'show ip interface' }),
  cmd(['show', 'ntp', 'associations'], (_, s) => ({ out: showNtp(s.world, s.dev) }), { key: 'show ntp associations' }),
];

const CLEAR_NAT = cmd(['clear', 'ip', 'nat', 'translation', W('star', 'word')], ({ star }, s) => {
  if (star !== '*') return { out: invalidAt(s, s.line.indexOf(star)) };
  if (s.world.natTable) s.world.natTable[s.deviceId] = [];
  return { out: '' };
}, { key: 'clear ip nat translation' });

// ---------- IPv6 ----------

const up6 = (x) => format6(x, true);

function showIpv6IntBrief(world, deviceId) {
  const dev = world.devices[deviceId];
  const names = Object.keys(dev.config.interfaces).sort(dev.kind === 'switch' ? ifSort : (a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const out = [];
  for (const n of names) {
    const st = interfaceState(world, deviceId, n);
    out.push(`${pad(n, 23)}[${st.status}/${st.protocol}]`);
    const v = v6Of(world, deviceId, n);
    if (!v.on) { out.push('    unassigned'); continue; }
    out.push(`    ${up6(v.ll)}`, ...v.addrs.map(x => `    ${up6(x.addr)}`));
  }
  return out.join('\n');
}

function showIpv6Interface(world, dev, name) {
  const st = interfaceState(world, dev.id, name);
  const v = v6Of(world, dev.id, name);
  const lines = [`${name} is ${st.status}, line protocol is ${st.protocol}`];
  if (!v.on) return [...lines, '  IPv6 is not enabled on this interface'].join('\n');
  const conf = dev.config.interfaces[name].v6;
  const routing = Boolean(dev.config.ipv6?.routing);
  lines.push(`  IPv6 is ${st.up ? 'enabled' : 'tentative'}, link-local address is ${up6(v.ll)}`, '  No Virtual link-local address(es):');
  if (conf?.auto) lines.push('  Stateless address autoconfig enabled');
  lines.push('  Global unicast address(es):');
  if (!v.addrs.length) lines.push('    none');
  v.addrs.forEach((x, k) => {
    const eui = conf?.addrs[k]?.eui ? ' [EUI]' : k >= (conf?.addrs.length ?? 0) ? ' [EUI/CAL/PRE]' : '';
    lines.push(`    ${up6(x.addr)}, subnet is ${up6(net6(x.addr, x.len))}/${x.len}${eui}`);
  });
  const groups = ['FF02::1'];
  if (routing) groups.push('FF02::2');
  for (const a of [v.ll, ...v.addrs.map(x => x.addr)]) { const g = up6(solicited(a)); if (!groups.includes(g)) groups.push(g); }
  lines.push('  Joined group address(es):', ...groups.map(g => `    ${g}`));
  lines.push('  MTU is 1500 bytes', '  ICMP error messages limited to one every 100 milliseconds', '  ICMP redirects are enabled', '  ICMP unreachables are sent', '  ND DAD is enabled, number of DAD attempts: 1', '  ND reachable time is 30000 milliseconds (using 30000)');
  if (routing) lines.push('  ND advertised reachable time is 0 (unspecified)', '  ND advertised retransmit interval is 0 (unspecified)', '  ND router advertisements are sent every 200 seconds', '  ND router advertisements live for 1800 seconds', '  ND advertised default router preference is Medium', '  Hosts use stateless autoconfig for addresses.');
  return lines.join('\n');
}

const V6_CODES = 'Codes: C - Connected, L - Local, S - Static, U - Per-user Static route\n       B - BGP, R - RIP, H - NHRP, I1 - ISIS L1\n       I2 - ISIS L2, IA - ISIS interarea, IS - ISIS summary, D - EIGRP\n       EX - EIGRP external, ND - ND Default, NDp - ND Prefix, DCE - Destination\n       NDr - Redirect, O - OSPF Intra, OI - OSPF Inter, OE1 - OSPF ext 1\n       OE2 - OSPF ext 2, ON1 - OSPF NSSA ext 1, ON2 - OSPF NSSA ext 2';

function showIpv6Route(world, deviceId, filter = null) {
  const table = routingTable6(world, deviceId).filter(r => !filter || r.type === filter);
  const rows = [];
  for (const r of table) {
    const code = { connected: 'C', local: 'L', static: 'S' }[r.type];
    const h = r.hops[0];
    rows.push(`${pad(code, 4)}${up6(r.net)}/${r.len} [${r.ad}/0]`);
    if (r.type === 'connected') rows.push(`     via ${h.intf}, directly connected`);
    else if (r.type === 'local') rows.push(`     via ${h.intf}, receive`);
    else if (h.nh !== null && h.given) rows.push(`     via ${up6(h.nh)}, ${h.given}`);
    else if (h.nh !== null) rows.push(`     via ${up6(h.nh)}`);
    else rows.push(`     via ${h.intf}, directly connected`);
  }
  const count = table.length + (filter ? 0 : 1);
  if (!filter) rows.push('L   FF00::/8 [0/0]', '     via Null0, receive');
  return `IPv6 Routing Table - default - ${count} entries\n${V6_CODES}\n${rows.join('\n')}`;
}

function ping6Text(world, deviceId, dst, intf = null) {
  const r = ping6(world, deviceId, dst, intf);
  if (r.reason === 'no-route') return { text: '% No valid route for destination', ok: false };
  const head = `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${up6(dst)}, timeout is 2 seconds:${intf ? `\nPacket sent with a source address of ${up6(r.src ?? 0n)}%${intf}` : ''}`;
  return r.ok
    ? { text: `${head}\n!!!!!\nSuccess rate is 100 percent (5/5), round-trip min/avg/max = 0/0/1 ms`, ok: true }
    : { text: `${head}\n.....\nSuccess rate is 0 percent (0/5)`, ok: false };
}

const PING6 = cmd(['ping', ALT('v6', ['ipv6'], { opt: true }), W('dst', 'ip6')], ({ dst }, s) => {
  const a = parse6(dst);
  const done = (r) => { s.events.push({ kind: 'ping6', dst: format6(a), ok: r.ok }); return r.text; };
  if (isLinkLocal(a)) {
    return { out: '', ask: { prompt: 'Output Interface: ', answer: (t) => {
      const r = readInterface(tokenize(t), 0);
      if (!r || !s.dev.config.interfaces[r.name]) return '% Invalid interface. Use full interface name without spaces (e.g. Serial0/1)';
      return done(ping6Text(s.world, s.deviceId, a, r.name));
    } } };
  }
  return { out: done(ping6Text(s.world, s.deviceId, a)) };
}, { key: 'ping ipv6' });

const TRACE6 = cmd(['traceroute', ALT('v6', ['ipv6'], { opt: true }), W('dst', 'ip6')], ({ dst }, s) => {
  const a = parse6(dst);
  const r = trace6(s.world, s.deviceId, a);
  const hops = [...r.hops];
  if (r.ok && hops.length) hops[hops.length - 1] = a;
  const lines = hops.map((x, k) => `  ${k + 1} ${up6(x)} 0 msec 0 msec 0 msec`);
  if (!r.ok) lines.push(`  ${hops.length + 1}  *  *  * `);
  s.events.push({ kind: 'trace6', dst: format6(a), ok: r.ok });
  return { out: `Type escape sequence to abort.\nTracing the route to ${up6(a)}\n\n${lines.join('\n')}` };
}, { key: 'traceroute ipv6' });

const SHOW_V6 = [
  cmd(['show', 'ipv6', 'interface', 'brief'], (_, s) => ({ out: showIpv6IntBrief(s.world, s.deviceId) }), { key: 'show ipv6 interface brief' }),
  cmd(['show', 'ipv6', 'interface', W('name', 'intf')], ({ name }, s) => ({ out: intfArg(s, name) ?? showIpv6Interface(s.world, s.dev, name) }), { key: 'show ipv6 interface' }),
  cmd(['show', 'ipv6', 'route', ALT('filter', ['connected', 'static', 'local'], { opt: true })], ({ filter }, s) => ({ out: showIpv6Route(s.world, s.deviceId, filter ?? null) }), { key: 'show ipv6 route' }),
];

// "GigabitEthernet0/1 FE80::2 5" after the prefix of an ipv6 route.
function parseRoute6Tail(text) {
  const tokens = tokenize(text);
  let i = 0;
  let nh = null, intf = null, ad = null;
  const r = readInterface(tokens, 0);
  if (r) { intf = r.name; i = r.used; }
  if (tokens[i] && parse6(tokens[i].text) !== null) { nh = parse6(tokens[i].text); i += 1; }
  if (!intf && nh === null) return null;
  if (tokens[i] && /^\d+$/.test(tokens[i].text)) { ad = Number(tokens[i].text); i += 1; if (ad < 1 || ad > 254) return null; }
  if (i < tokens.length) return null;
  return { nh, intf, ad };
}

const ensureV6 = (c) => (c.ipv6 ??= { routing: false, statics: [] });

const GLOBAL_V6 = [
  cmd(['ipv6', 'unicast-routing'], (_, s) => { ensureV6(s.dev.config).routing = true; return { out: '' }; }, { key: 'ipv6 unicast-routing', no: (_, s) => { ensureV6(s.dev.config).routing = false; } }),
  cmd(['ipv6', 'route', W('pfx', 'ip6pfx'), W('via', 'rest')], ({ pfx, via }, s) => {
    const p = parsePrefix6(pfx);
    const t = parseRoute6Tail(via);
    if (!t) return { out: invalidAt(s, s.line.indexOf(via)) };
    if (t.intf && !s.dev.config.interfaces[t.intf]) return { out: invalidAt(s, s.line.indexOf(via)) };
    if (t.nh !== null && isLinkLocal(t.nh) && !t.intf) return { out: '% Interface has to be specified for a link-local nexthop' };
    const st = { net: format6(net6(p.addr, p.len)), len: p.len, nh: t.nh === null ? null : format6(t.nh), intf: t.intf, ad: t.ad ?? 1 };
    const c = ensureV6(s.dev.config);
    c.statics = c.statics.filter(x => !(x.net === st.net && x.len === st.len && x.nh === st.nh && x.intf === st.intf));
    c.statics.push(st);
    return { out: '' };
  }, { key: 'ipv6 route', no: ({ pfx, via }, s) => {
    const p = parsePrefix6(pfx);
    const t = via ? parseRoute6Tail(via) : null;
    const net = format6(net6(p.addr, p.len));
    const c = ensureV6(s.dev.config);
    c.statics = c.statics.filter(x => !(x.net === net && x.len === p.len && (!t || (x.nh === (t.nh === null ? null : format6(t.nh)) && x.intf === t.intf))));
  }, noShape: ['ipv6', 'route', W('pfx', 'ip6pfx'), W('via', 'rest', { opt: true })] }),
];

const ensureIf6 = (i) => (i.v6 ??= { addrs: [], ll: null, enabled: false, auto: false });

function v6Allowed(s) {
  const intf = here(s);
  if (intf.sw) return invalidAt(s, s.line.search(/\bipv6\b/));
  if (isSub(intf.name) && !intf.encap) return SUBIF_IP_ERROR;
  return null;
}

const IFACE_V6 = [
  cmd(['ipv6', 'address', W('pfx', 'ip6pfx'), ALT('eui', ['eui-64'], { opt: true })], ({ pfx, eui }, s) => {
    const bad = v6Allowed(s);
    if (bad) return { out: bad };
    const p = parsePrefix6(pfx);
    if (isLinkLocal(p.addr)) return { out: '% Link-local addresses are configured with "ipv6 address FE80::X link-local"' };
    if (eui && p.len > 64) return { out: `% ${up6(net6(p.addr, p.len))}/${p.len} cannot be used with eui-64: the prefix must be /64 or shorter` };
    const net = net6(p.addr, p.len);
    for (const [n, o] of Object.entries(s.dev.config.interfaces)) {
      if (n === s.ctx.intf || !o.v6) continue;
      if (o.v6.addrs.some(x => { const m = Math.min(x.len, p.len); return net6(parse6(x.addr), m) === net6(p.addr, m); })) return { out: `% ${up6(net)}/${p.len} overlaps with ${n}` };
    }
    const v = ensureIf6(here(s));
    const entry = { addr: format6(eui ? net : p.addr), len: p.len, eui: Boolean(eui) };
    v.addrs = v.addrs.filter(x => !(x.addr === entry.addr && x.len === entry.len));
    v.addrs.push(entry);
    return { out: '' };
  }, { key: 'ipv6 address', no: ({ rest }, s) => {
    const v = here(s).v6;
    if (!v) return;
    const t = (rest ?? '').trim().split(/\s+/).filter(Boolean);
    if (!t.length) { v.addrs = []; v.ll = null; v.auto = false; return; }
    if ('autoconfig'.startsWith(t[0].toLowerCase())) { v.auto = false; return; }
    if (t[1] && 'link-local'.startsWith(t[1].toLowerCase())) { v.ll = null; return; }
    const p = parsePrefix6(t[0]);
    if (!p) return;
    const eui = Boolean(t[1]);
    const addr = format6(eui ? net6(p.addr, p.len) : p.addr);
    v.addrs = v.addrs.filter(x => !(x.addr === addr && x.len === p.len));
  }, noShape: ['ipv6', 'address', W('rest', 'rest', { opt: true })] }),
  cmd(['ipv6', 'address', W('ll', 'ip6'), 'link-local'], ({ ll }, s) => {
    const bad = v6Allowed(s);
    if (bad) return { out: bad };
    const a = parse6(ll);
    if (!isLinkLocal(a)) return { out: '% Invalid link-local address' };
    ensureIf6(here(s)).ll = format6(a);
    return { out: '' };
  }, { key: 'ipv6 address link-local' }),
  cmd(['ipv6', 'address', 'autoconfig', ALT('def', ['default'], { opt: true })], (_, s) => {
    const bad = v6Allowed(s);
    if (bad) return { out: bad };
    ensureIf6(here(s)).auto = true;
    return { out: '' };
  }, { key: 'ipv6 address autoconfig' }),
  cmd(['ipv6', 'enable'], (_, s) => {
    const bad = v6Allowed(s);
    if (bad) return { out: bad };
    ensureIf6(here(s)).enabled = true;
    return { out: '' };
  }, { key: 'ipv6 enable', no: (_, s) => { if (here(s).v6) here(s).v6.enabled = false; } }),
];

// Running-configuration lines for IPv6.
function v6GlobalLines(c) {
  return c.ipv6?.routing ? ['ipv6 unicast-routing', '!'] : [];
}
function v6InterfaceLines(i) {
  const v = i.v6;
  if (!v) return [];
  const L = [];
  if (v.ll) L.push(` ipv6 address ${up6(parse6(v.ll))} link-local`);
  for (const x of v.addrs) L.push(` ipv6 address ${up6(parse6(x.addr))}/${x.len}${x.eui ? ' eui-64' : ''}`);
  if (v.auto) L.push(' ipv6 address autoconfig');
  if (v.enabled) L.push(' ipv6 enable');
  return L;
}
function v6RouteLines(c) {
  return (c.ipv6?.statics ?? []).map(x => `ipv6 route ${up6(parse6(x.net))}/${x.len}${x.intf ? ` ${x.intf}` : ''}${x.nh ? ` ${up6(parse6(x.nh))}` : ''}${x.ad !== 1 ? ` ${x.ad}` : ''}`);
}

// A PC's IPv6: a static address and gateway, or SLAAC.
function pcV6Lines(world, dev) {
  const v = v6Of(world, dev.id, 'FastEthernet0');
  const L = v.addrs.map(x => `   IPv6 Address. . . . . . . . . . . : ${format6(x.addr)}`);
  L.push(`   Link-local IPv6 Address . . . . . : ${format6(v.ll)}%11`);
  return L;
}
function pcV6Gateway(world, dev) {
  const c = dev.config.v6;
  if (c?.gw) return c.gw;
  if (c?.auto) { const sl = slaacFrom(world, dev.id, 'FastEthernet0'); if (sl) return `${format6(sl.gw)}%11`; }
  return null;
}

function pcPing6(s, a) {
  const r = ping6(s.world, s.deviceId, a);
  const t = format6(a);
  if (r.reason === 'no-route') return { text: `\nPinging ${t} with 32 bytes of data:\nPING: transmit failed. General failure. \nPING: transmit failed. General failure. \nPING: transmit failed. General failure. \nPING: transmit failed. General failure. \n\nPing statistics for ${t}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),`, ok: false };
  const replies = Array(4).fill(r.ok ? `Reply from ${t}: time<1ms` : 'Request timed out.');
  const stats = `Ping statistics for ${t}:\n    Packets: Sent = 4, Received = ${r.ok ? 4 : 0}, Lost = ${r.ok ? 0 : 4} (${r.ok ? 0 : 100}% loss),${r.ok ? '\nApproximate round trip times in milli-seconds:\n    Minimum = 0ms, Maximum = 1ms, Average = 0ms' : ''}`;
  return { text: `\nPinging ${t} with 32 bytes of data:\n${replies.join('\n')}\n\n${stats}`, ok: r.ok };
}

const PC_V6 = [
  cmd(['ipv6config', W('pfx', 'ip6pfx'), W('gw', 'ip6', { opt: true })], ({ pfx, gw }, s) => {
    const p = parsePrefix6(pfx);
    const c = s.dev.config;
    c.v6 = { addrs: [{ addr: format6(p.addr), len: p.len }], gw: gw ? format6(parse6(gw)) : (c.v6?.gw ?? null), auto: false };
    return { out: '' };
  }, { key: 'ipv6config set' }),
  cmd(['ipv6config', 'auto'], (_, s) => {
    s.dev.config.v6 = { addrs: [], gw: null, auto: true };
    const sl = slaacFrom(s.world, s.deviceId, 'FastEthernet0');
    s.events.push({ kind: 'slaac', ok: Boolean(sl) });
    return { out: sl ? '' : 'IPv6 autoconfiguration failed: no router advertisement was heard on FastEthernet0.' };
  }, { key: 'ipv6config auto' }),
  cmd(['ipv6config'], (_, s) => {
    const gw = pcV6Gateway(s.world, s.dev);
    return { out: ['', 'Ethernet adapter FastEthernet0:', '', ...pcV6Lines(s.world, s.dev), `   Default Gateway . . . . . . . . . : ${gw ?? ''}`, `   Autoconfiguration . . . . . . . . : ${s.dev.config.v6?.auto ? 'Yes' : 'No'}`].join('\n') };
  }, { key: 'ipv6config' }),
  cmd(['ping', W('dst', 'ip6')], ({ dst }, s) => {
    const a = parse6(dst);
    const r = pcPing6(s, a);
    s.events.push({ kind: 'ping6', dst: format6(a), ok: r.ok });
    return { out: r.text };
  }, { key: 'ping ipv6' }),
  cmd(['tracert', W('dst', 'ip6')], ({ dst }, s) => {
    const a = parse6(dst);
    const r = trace6(s.world, s.deviceId, a);
    const hops = [...r.hops];
    if (r.ok && hops.length) hops[hops.length - 1] = a;
    const rows = hops.map((x, k) => `${lpad(k + 1, 3)}   0 ms      0 ms      0 ms      ${format6(x)}`);
    if (!r.ok) rows.push(`${lpad(hops.length + 1, 3)}   *         *         *         Request timed out.`);
    s.events.push({ kind: 'trace6', dst: format6(a), ok: r.ok });
    return { out: `\nTracing route to ${format6(a)} over a maximum of 30 hops\n\n${rows.join('\n')}\n\nTrace complete.` };
  }, { key: 'tracert ipv6' }),
];

const SHOW = [
  ...SHOW_SERVICES,
  ...SHOW_V6,
  cmd(['show', 'ip', 'route', ALT('filter', ['connected', 'static', 'ospf'], { opt: true })], ({ filter }, s) => ({ out: showIpRoute(s.world, s.deviceId, filter ?? null) }), { key: 'show ip route' }),
  cmd(['show', 'ip', 'ospf', 'neighbor'], (_, s) => ({ out: showOspfNeighbor(s.world, s.deviceId) }), { key: 'show ip ospf neighbor' }),
  cmd(['show', 'ip', 'ospf', 'interface', 'brief'], (_, s) => ({ out: showOspfIntBrief(s.world, s.deviceId) }), { key: 'show ip ospf interface brief' }),
  cmd(['show', 'ip', 'protocols'], (_, s) => ({ out: showIpProtocols(s.world, s.deviceId) }), { key: 'show ip protocols' }),
  ...SHOW_COMMON,
];

const SHOW_SWITCH = [
  cmd(['show', 'ip', 'route'], (_, s) => ({ out: showHostRoute(s.world, s.deviceId) }), { key: 'show ip route' }),
  cmd(['show', 'vlan', ALT('brief', ['brief'], { opt: true })], ({ brief }, s) => ({ out: showVlanBrief(s.world, s.deviceId, !brief) }), { key: 'show vlan brief' }),
  cmd(['show', 'interfaces', 'status'], (_, s) => ({ out: showInterfacesStatus(s.world, s.deviceId) }), { key: 'show interfaces status' }),
  cmd(['show', 'interfaces', 'trunk'], (_, s) => ({ out: showInterfacesTrunk(s.world, s.deviceId) }), { key: 'show interfaces trunk' }),
  cmd(['show', 'interfaces', W('name', 'intf'), 'switchport'], ({ name }, s) => ({ out: intfArg(s, name) ?? showSwitchport(s.world, s.deviceId, name) }), { key: 'show interfaces switchport' }),
  cmd(['show', 'mac', 'address-table', ALT('dyn', ['dynamic'], { opt: true })], ({ dyn }, s) => ({ out: showMacTable(s.world, s.deviceId, Boolean(dyn)) }), { key: 'show mac address-table' }),
  cmd(['show', 'spanning-tree', ALT('vk', ['vlan'], { opt: true }), W('v', 'num', { opt: true })], ({ vk, v }, s) => {
    if (vk && v === undefined) return { out: '% Incomplete command.' };
    return { out: showSpanningTree(s.world, s.deviceId, vk ? v : null) };
  }, { key: 'show spanning-tree' }),
  cmd(['show', 'etherchannel', 'summary'], (_, s) => ({ out: showEtherchannelSummary(s.world, s.deviceId) }), { key: 'show etherchannel summary' }),
  cmd(['show', 'port-security', ALT('ik', ['interface'], { opt: true }), W('name', 'intf', { opt: true })], ({ ik, name }, s) => {
    if (ik && !name) return { out: '% Incomplete command.' };
    if (name) return { out: intfArg(s, name) ?? showPortSecurityInterface(s.world, s.deviceId, name) };
    return { out: showPortSecurity(s.world, s.deviceId) };
  }, { key: 'show port-security' }),
  ...SHOW_COMMON,
];

const PRIV_ONLY = [
  cmd(['show', 'running-config'], (_, s) => ({ out: runningConfig(s.dev) }), { key: 'show running-config' }),
  cmd(['show', 'startup-config'], (_, s) => ({ out: s.dev.startup ? runningConfig({ ...s.dev, config: s.dev.startup }).replace('Building configuration...\n\nCurrent configuration', 'Using') : 'startup-config is not present' }), { key: 'show startup-config' }),
  cmd(['configure', ALT('where', ['terminal'], { opt: true })], ({ where }, s) => {
    const enter = () => { s.mode = 'config'; return 'Enter configuration commands, one per line.  End with CNTL/Z.'; };
    if (where) return { out: enter() };
    return { out: '', ask: { prompt: 'Configuring from terminal, memory, or network [terminal]? ', answer: (a) => (!a || 'terminal'.startsWith(a.toLowerCase()) ? enter() : '% Only terminal configuration is available in this lab.') } };
  }, { key: 'configure terminal' }),
  cmd(['enable'], () => ({ out: '' })),
  cmd(['copy', 'running-config', 'startup-config'], (_, s) => ({
    out: '',
    ask: { prompt: 'Destination filename [startup-config]? ', answer: () => { save(s.world, s.deviceId); s.events.push({ kind: 'save' }); return 'Building configuration...\n[OK]'; } },
  }), { key: 'copy running-config startup-config' }),
  cmd(['write', ALT('what', ['memory'], { opt: true })], (_, s) => { save(s.world, s.deviceId); s.events.push({ kind: 'save' }); return { out: 'Building configuration...\n[OK]' }; }, { key: 'write memory' }),
  cmd(['reload'], (_, s) => {
    const proceed = { prompt: 'Proceed with reload? [confirm]', answer: (a) => {
      if (a && !'yes'.startsWith(a.toLowerCase()) && a.toLowerCase() !== 'y') return '';
      reload(s.world, s.deviceId);
      s.mode = 'user';
      s.events.push({ kind: 'reload' });
      return `\nSystem Bootstrap, Version 15.1(4)M, RELEASE SOFTWARE (fc1)\n...\nPress RETURN to get started!\n\n${s.dev.startup ? '' : '\n         --- System Configuration Dialog ---\n(skipped: lab devices start without setup mode)\n'}`;
    } };
    if (unsaved(s.world, s.deviceId)) {
      return { out: '', ask: { prompt: 'System configuration has been modified. Save? [yes/no]: ', answer: (a) => {
        const yes = 'yes'.startsWith((a || 'x').toLowerCase());
        if (yes) { save(s.world, s.deviceId); s.events.push({ kind: 'save' }); }
        return { text: yes ? 'Building configuration...\n[OK]' : '', ask: proceed };
      } } };
    }
    return { out: '', ask: proceed };
  }, { key: 'reload' }),
  cmd(['disable'], (_, s) => { s.mode = 'user'; return { out: '' }; }),
  cmd(['terminal', 'length', W('n', 'num')], () => ({ out: '' })),
];

const CLEAR_OSPF = cmd(['clear', 'ip', 'ospf', 'process'], (_, s) => ({ out: '', ask: { prompt: 'Reset ALL OSPF processes? [no]: ', answer: (a) => {
  if (!a || !'yes'.startsWith(a.toLowerCase())) return '';
  clearOspf(s.world, s.deviceId);
  s.events.push({ kind: 'clear-ospf' });
  return '';
} } }), { key: 'clear ip ospf process' });

const CLEAR_MAC = cmd(['clear', 'mac', 'address-table', ALT('dyn', ['dynamic'], { opt: true })], (_, s) => {
  if (s.world.learned) delete s.world.learned[s.deviceId];
  s.events.push({ kind: 'clear-mac' });
  return { out: '' };
}, { key: 'clear mac address-table' });

const ENABLE = cmd(['enable'], (_, s) => {
  const c = s.dev.config;
  if (!c.enableSecret && !c.enablePassword) { s.mode = 'exec'; return { out: '' }; }
  return { out: '', ask: { prompt: 'Password: ', secret: true, answer: (a) => {
    if (a === (c.enableSecret ?? c.enablePassword)) { s.mode = 'exec'; return ''; }
    return '% Bad secrets';
  } } };
}, { key: 'enable' });
const LOGOUT = cmd([ALT('how', ['exit', 'logout'])], (_, s) => { s.mode = 'user'; return { out: `\n${s.dev.config.hostname} con0 is now available\n\nPress RETURN to get started.` }; });

const USER = [ENABLE, LOGOUT, PING, PING6, TRACEROUTE, TRACE6, ...SHOW];
const EXEC = [...PRIV_ONLY, CLEAR_OSPF, CLEAR_NAT, LOGOUT, PING, PING6, TRACEROUTE, TRACE6, ...SHOW];
const USER_SWITCH = [ENABLE, LOGOUT, PING, TRACEROUTE, ...SHOW_SWITCH];
const EXEC_SWITCH = [...PRIV_ONLY, CLEAR_MAC, LOGOUT, PING, TRACEROUTE, ...SHOW_SWITCH];

function invalidAt(s, col) {
  return `${' '.repeat(s.promptLength + Math.max(0, col))}^\n% Invalid input detected at '^' marker.`;
}

const END = cmd(['end'], (_, s) => { s.mode = 'exec'; s.ctx = {}; return { out: '' }; }, { once: true });

// "f0/1 - 12, g0/1 - 2" -> full interface names, or null.
function parseRange(text, dev) {
  const out = [];
  for (const part of text.split(',')) {
    const m = /^\s*([a-z][a-z-]*?)\s*(\d+)\/(\d+)\s*(?:-\s*(\d+))?\s*$/i.exec(part);
    if (!m) return null;
    const type = IF_TYPES.find(t => t.re.test(m[1]));
    if (!type) return null;
    const a = Number(m[3]);
    const b = m[4] === undefined ? a : Number(m[4]);
    if (b < a) return null;
    for (let k = a; k <= b; k += 1) {
      const name = `${type.full}${m[2]}/${k}`;
      if (!dev.config.interfaces[name]) return null;
      if (!out.includes(name)) out.push(name);
    }
  }
  return out.length ? out : null;
}

const GLOBAL_COMMON = [
  cmd(['hostname', W('name', 'word')], ({ name }, s) => {
    if (!/^[A-Za-z][A-Za-z0-9-]{0,62}$/.test(name)) return { out: '% Hostname contains one or more illegal characters.' };
    s.dev.config.hostname = name;
    return { out: '' };
  }, { key: 'hostname' }),
  cmd(['enable', 'secret', W('value', 'rest')], ({ value }, s) => { s.dev.config.enableSecret = value.replace(/^0\s+/, ''); return { out: '' }; }, { key: 'enable secret', no: (_, s) => { s.dev.config.enableSecret = null; } }),
  cmd(['enable', 'password', W('value', 'rest')], ({ value }, s) => { s.dev.config.enablePassword = value; return { out: '' }; }, { key: 'enable password', no: (_, s) => { s.dev.config.enablePassword = null; } }),
  cmd(['banner', 'motd', W('text', 'rest')], ({ text }, s) => {
    const d = text[0];
    const end = text.indexOf(d, 1);
    if (end > 0) { s.dev.config.banner = text.slice(1, end); return { out: '' }; }
    const lines = [text.slice(1)];
    const collect = { prompt: '', answer: (a) => {
      const at = a.indexOf(d);
      if (at >= 0) { lines.push(a.slice(0, at)); s.dev.config.banner = lines.filter(Boolean).join('\n'); return ''; }
      lines.push(a);
      return { text: '', ask: collect };
    } };
    return { out: `Enter TEXT message.  End with the character '${d}'.`, ask: collect };
  }, { key: 'banner motd', no: (_, s) => { s.dev.config.banner = null; } }),
  cmd(['interface', W('name', 'intf')], ({ name }, s) => {
    const c = s.dev.config;
    const sw = s.dev.kind === 'switch';
    if (!c.interfaces[name]) {
      if (name.startsWith('Loopback')) {
        c.interfaces[name] = makeInterface(name);
        s.notices.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${name}, changed state to up`);
      } else if (!sw && isSub(name) && c.interfaces[parentOf(name)] && !isSub(parentOf(name))) {
        c.interfaces[name] = makeInterface(name, { shutdown: false, encap: null });
      } else if (sw && isSvi(name) && Number(name.slice(4)) >= 1 && Number(name.slice(4)) <= 4094) {
        // Only Vlan1 ships shut down; an SVI you create starts enabled.
        c.interfaces[name] = makeInterface(name, { shutdown: false });
      } else if (sw && isPo(name) && Number(name.slice(12)) >= 1 && Number(name.slice(12)) <= 48) {
        c.interfaces[name] = makeInterface(name, { shutdown: false, sw: makeSwitchport(), cdp: true });
      } else return { out: invalidAt(s, s.line.search(/\S+\s*$/)) };
    }
    s.mode = 'if';
    s.ctx = { intf: name };
    return { out: '' };
  }, { key: 'interface' }),
  cmd(['interface', 'range', W('list', 'rest')], ({ list }, s) => {
    const names = parseRange(list, s.dev);
    if (!names) return { out: invalidAt(s, s.line.indexOf(list)) };
    s.mode = 'if';
    s.ctx = { intf: names[0], range: names };
    return { out: '' };
  }, { key: 'interface range' }),
  cmd(['ip', ALT('kw', ['domain-name']), W('name', 'word')], ({ name }, s) => { s.dev.config.domain = name; return { out: '' }; }, { key: 'ip domain name', no: (_, s) => { s.dev.config.domain = null; }, noShape: ['ip', 'domain-name', W('name', 'word', { opt: true })] }),
  cmd(['ip', 'domain', 'name', W('name', 'word')], ({ name }, s) => { s.dev.config.domain = name; return { out: '' }; }, { key: 'ip domain name', no: (_, s) => { s.dev.config.domain = null; }, noShape: ['ip', 'domain', 'name', W('name', 'word', { opt: true })] }),
  cmd(['ip', 'ssh', 'version', W('v', 'num')], ({ v }, s) => {
    if (v !== 1 && v !== 2) return { out: invalidAt(s, s.line.search(/\S+\s*$/)) };
    s.dev.config.sshVersion = v;
    return { out: '' };
  }, { key: 'ip ssh version', no: (_, s) => { s.dev.config.sshVersion = null; }, noShape: ['ip', 'ssh', 'version'] }),
  cmd(['crypto', 'key', 'generate', 'rsa', ALT('gk', ['general-keys'], { opt: true }), ALT('m', ['modulus'], { opt: true }), W('bits', 'num', { opt: true })], ({ bits }, s) => {
    const c = s.dev.config;
    if (c.hostname === 'Router' || c.hostname === 'Switch') return { out: `% Please define a hostname other than ${c.hostname}.` };
    if (!c.domain) return { out: '% Please define a domain-name first.' };
    const make = (b) => {
      if (!(b >= 360 && b <= 4096)) return '% Key modulus must be between 360 and 4096.';
      s.dev.rsaBits = b;
      s.events.push({ kind: 'rsa', bits: b });
      return `% Generating ${b} bit RSA keys, keys will be non-exportable...\n[OK] (elapsed time was 1 seconds)\n\n%SSH-5-ENABLED: SSH 1.99 has been enabled`;
    };
    const head = `The name for the keys will be: ${c.hostname}.${c.domain}`;
    if (bits) return { out: `${head}\n${make(bits)}` };
    return { out: `${head}\nChoose the size of the key modulus in the range of 360 to 4096 for your\n  General Purpose Keys. Choosing a key modulus greater than 512 may take\n  a few minutes.\n`, ask: { prompt: 'How many bits in the modulus [512]: ', answer: (a) => make(a ? Number(a) : 512) } };
  }, { key: 'crypto key generate rsa' }),
  cmd(['username', W('name', 'word'), W('rest', 'rest')], ({ name, rest }, s) => {
    const m = /^(?:privilege\s+(\d+)\s+)?(secret|password)\s+(?:[05]\s+)?(.+)$/i.exec(rest);
    if (!m) return { out: invalidAt(s, s.line.indexOf(rest)) };
    s.dev.config.users[name] = { privilege: m[1] ? Number(m[1]) : null, [m[2].toLowerCase()]: m[3] };
    return { out: '' };
  }, { key: 'username', no: ({ name }, s) => { delete s.dev.config.users[name]; }, noShape: ['username', W('name', 'word'), W('rest', 'rest', { opt: true })] }),
  cmd(['line', 'vty', W('a', 'num'), W('b', 'num', { opt: true })], (_, s) => { s.mode = 'line'; s.ctx = { line: 'vty' }; return { out: '' }; }, { key: 'line vty' }),
  cmd(['line', 'console', W('a', 'num')], (_, s) => { s.mode = 'line'; s.ctx = { line: 'con' }; return { out: '' }; }, { key: 'line console' }),
  cmd(['service', 'password-encryption'], (_, s) => { s.dev.config.servicePasswordEncryption = true; return { out: '' }; }, { key: 'service password-encryption', no: (_, s) => { s.dev.config.servicePasswordEncryption = false; } }),
  cmd(['cdp', 'run'], (_, s) => { s.dev.config.cdp = true; return { out: '' }; }, { key: 'cdp run', no: (_, s) => { s.dev.config.cdp = false; } }),
  cmd(['lldp', 'run'], (_, s) => { s.dev.config.lldp = true; return { out: '' }; }, { key: 'lldp run', no: (_, s) => { s.dev.config.lldp = false; } }),
  END,
  cmd(['exit'], (_, s) => { s.mode = 'exec'; return { out: '' }; }, { once: true }),
];

const ensureNat = (c) => (c.nat ??= emptyNat());
const ensureDhcp = (c) => (c.dhcp ??= emptyDhcp());

// "network 10.0.0.0 255.255.255.0" or "network 10.0.0.0 /24".
function readNetwork(text) {
  const m = /^(\S+)\s+(\/\d+|\S+)$/.exec(text.trim());
  if (!m || !isIp(m[1])) return null;
  const len = m[2].startsWith('/') ? Number(m[2].slice(1)) : maskToLen(m[2]);
  if (len === null || len > 30) return null;
  return { net: network(parseIp(m[1]), len), len };
}

const ACL_GLOBAL = [
  cmd(['access-list', W('name', 'num'), W('rest', 'rest')], ({ name, rest }, s) => {
    const kind = aclKind(name);
    if (!kind) return { out: invalidAt(s, s.line.indexOf(String(name))) };
    const e = parseAce(kind, rest);
    if (!e) return { out: invalidAt(s, s.line.indexOf(rest)) };
    return { out: addAce(s.dev, String(name), kind, e) };
  }, { key: 'access-list', no: ({ name }, s) => { if (s.dev.config.acls) delete s.dev.config.acls[String(name)]; }, noShape: ['access-list', W('name', 'num'), W('rest', 'rest', { opt: true })] }),
  cmd(['ip', 'access-list', ALT('kind', ['standard', 'extended']), W('name', 'word')], ({ kind, name }, s) => {
    const c = s.dev.config;
    c.acls ??= {};
    if (c.acls[name] && c.acls[name].kind !== kind) return { out: `% A named access list of another type exists with name ${name}` };
    c.acls[name] ??= { kind, named: aclKind(name) === null, entries: [] };
    s.mode = 'acl';
    s.ctx = { acl: name, kind };
    return { out: '' };
  }, { key: 'ip access-list', no: ({ name }, s) => { if (s.dev.config.acls) delete s.dev.config.acls[name]; } }),
  cmd(['ip', 'nat', 'inside', 'source', 'list', W('acl', 'word'), ALT('how', ['interface', 'pool']), W('target', 'rest')], ({ acl, how, target }, s) => {
    const t = target.trim().split(/\s+/);
    const overload = t[t.length - 1]?.toLowerCase() === 'overload';
    if (overload) t.pop();
    const nat = ensureNat(s.dev.config);
    let rule;
    if (how === 'interface') {
      const r = readInterface(t.map(x => ({ text: x })), 0);
      if (!r || !s.dev.config.interfaces[r.name]) return { out: invalidAt(s, s.line.indexOf(target)) };
      rule = { acl, iface: r.name, pool: null, overload: true };
      if (!overload) return { out: '% Interface overload is the only form this lab supports; add overload.' };
    } else {
      if (t.length !== 1) return { out: invalidAt(s, s.line.indexOf(target)) };
      rule = { acl, iface: null, pool: t[0], overload };
    }
    nat.rules = nat.rules.filter(r => r.acl !== acl);
    nat.rules.push(rule);
    return { out: '' };
  }, { key: 'ip nat inside source list', no: ({ acl }, s) => { const nat = s.dev.config.nat; if (nat) nat.rules = nat.rules.filter(r => r.acl !== acl); }, noShape: ['ip', 'nat', 'inside', 'source', 'list', W('acl', 'word'), W('rest', 'rest', { opt: true })] }),
  cmd(['ip', 'nat', 'inside', 'source', 'static', W('local', 'ip'), W('global', 'ip')], ({ local, global }, s) => {
    const nat = ensureNat(s.dev.config);
    nat.statics = nat.statics.filter(x => x.local !== parseIp(local));
    nat.statics.push({ local: parseIp(local), global: parseIp(global) });
    return { out: '' };
  }, { key: 'ip nat inside source static', no: ({ local }, s) => { const nat = s.dev.config.nat; if (nat) nat.statics = nat.statics.filter(x => x.local !== parseIp(local)); } }),
  cmd(['ip', 'nat', 'pool', W('name', 'word'), W('start', 'ip'), W('end', 'ip'), 'netmask', W('mask', 'mask')], ({ name, start, end, mask }, s) => {
    if (parseIp(end) < parseIp(start)) return { out: '%Pool end address is less than start address' };
    ensureNat(s.dev.config).pools[name] = { start: parseIp(start), end: parseIp(end), mask: parseIp(mask) };
    return { out: '' };
  }, { key: 'ip nat pool', no: ({ name }, s) => { if (s.dev.config.nat) delete s.dev.config.nat.pools[name]; }, noShape: ['ip', 'nat', 'pool', W('name', 'word'), W('rest', 'rest', { opt: true })] }),
  cmd(['ip', 'dhcp', 'excluded-address', W('lo', 'ip'), W('hi', 'ip', { opt: true })], ({ lo, hi }, s) => {
    const d = ensureDhcp(s.dev.config);
    const a = parseIp(lo);
    const b = hi ? parseIp(hi) : a;
    if (b < a) return { out: '% Invalid address range' };
    if (!d.excluded.some(([x, y]) => x === a && y === b)) d.excluded.push([a, b]);
    return { out: '' };
  }, { key: 'ip dhcp excluded-address', no: ({ lo, hi }, s) => { const d = s.dev.config.dhcp; if (d) { const a = parseIp(lo); const b = hi ? parseIp(hi) : a; d.excluded = d.excluded.filter(([x, y]) => !(x === a && y === b)); } } }),
  cmd(['ip', 'dhcp', 'pool', W('name', 'word')], ({ name }, s) => {
    const d = ensureDhcp(s.dev.config);
    d.pools[name] ??= { net: null, len: null, router: null, dns: null, domain: null };
    s.mode = 'dhcp';
    s.ctx = { pool: name };
    return { out: '' };
  }, { key: 'ip dhcp pool', no: ({ name }, s) => { if (s.dev.config.dhcp) delete s.dev.config.dhcp.pools[name]; } }),
  cmd(['ntp', 'server', W('ip', 'ip')], ({ ip }, s) => { const c = s.dev.config; c.ntp ??= []; if (!c.ntp.includes(parseIp(ip))) c.ntp.push(parseIp(ip)); return { out: '' }; }, { key: 'ntp server', no: ({ ip }, s) => { const c = s.dev.config; c.ntp = (c.ntp ?? []).filter(x => x !== parseIp(ip)); } }),
  cmd(['logging', ALT('host', ['host'], { opt: true }), W('ip', 'ip')], ({ ip }, s) => { const c = s.dev.config; c.logHosts ??= []; if (!c.logHosts.includes(parseIp(ip))) c.logHosts.push(parseIp(ip)); return { out: '' }; }, { key: 'logging host', no: ({ ip }, s) => { const c = s.dev.config; c.logHosts = (c.logHosts ?? []).filter(x => x !== parseIp(ip)); } }),
  cmd(['service', 'timestamps', ALT('what', ['log', 'debug']), ALT('fmt', ['datetime', 'uptime'], { opt: true }), ALT('ms', ['msec'], { opt: true })], (_, s) => { s.dev.config.timestamps = true; return { out: '' }; }, { key: 'service timestamps', no: (_, s) => { s.dev.config.timestamps = false; }, noShape: ['service', 'timestamps', W('rest', 'rest', { opt: true })] }),
];

const IFACE_SERVICES = [
  cmd(['ip', 'access-group', W('acl', 'word'), ALT('dir', ['in', 'out'])], ({ acl, dir }, s) => {
    const i = s.dev.config.interfaces[s.ctx.intf];
    if (dir === 'in') i.aclIn = acl; else i.aclOut = acl;
    return { out: '' };
  }, { key: 'ip access-group', no: ({ dir }, s) => { const i = s.dev.config.interfaces[s.ctx.intf]; if (dir === 'in') i.aclIn = null; else i.aclOut = null; }, noShape: ['ip', 'access-group', W('acl', 'word'), ALT('dir', ['in', 'out'])] }),
  cmd(['ip', 'nat', ALT('role', ['inside', 'outside'])], ({ role }, s) => { s.dev.config.interfaces[s.ctx.intf].nat = role; return { out: '' }; }, { key: 'ip nat', no: (_, s) => { s.dev.config.interfaces[s.ctx.intf].nat = null; } }),
  cmd(['ip', 'helper-address', W('ip', 'ip')], ({ ip }, s) => { s.dev.config.interfaces[s.ctx.intf].helper = parseIp(ip); return { out: '' }; }, { key: 'ip helper-address', no: (_, s) => { s.dev.config.interfaces[s.ctx.intf].helper = null; }, noShape: ['ip', 'helper-address', W('ip', 'ip', { opt: true })] }),
];

const ACL_MODE = [
  cmd([W('seq', 'num', { opt: true }), ALT('action', ['permit', 'deny']), W('rest', 'rest')], ({ seq, action, rest }, s) => {
    const e = parseAce(s.ctx.kind, `${action} ${rest}`);
    if (!e) return { out: invalidAt(s, s.line.indexOf(rest)) };
    return { out: addAce(s.dev, s.ctx.acl, s.ctx.kind, e, seq ?? null) };
  }, { key: 'ace' }),
  cmd(['remark', W('text', 'rest')], () => ({ out: '' }), { key: 'remark' }),
  cmd(['no', W('seq', 'num')], ({ seq }, s) => { const acl = s.dev.config.acls[s.ctx.acl]; acl.entries = acl.entries.filter(e => e.seq !== seq); return { out: '' }; }, { key: 'no ace' }),
  END,
  cmd(['exit'], (_, s) => { s.mode = 'config'; s.ctx = {}; return { out: '' }; }, { once: true }),
];

const DHCP_MODE = [
  cmd(['network', W('text', 'rest')], ({ text }, s) => {
    const n = readNetwork(text);
    if (!n) return { out: invalidAt(s, s.line.indexOf(text)) };
    Object.assign(s.dev.config.dhcp.pools[s.ctx.pool], n);
    return { out: '' };
  }, { key: 'dhcp network' }),
  cmd(['default-router', W('ip', 'ip')], ({ ip }, s) => { s.dev.config.dhcp.pools[s.ctx.pool].router = parseIp(ip); return { out: '' }; }, { key: 'default-router', no: (_, s) => { s.dev.config.dhcp.pools[s.ctx.pool].router = null; }, noShape: ['default-router', W('ip', 'ip', { opt: true })] }),
  cmd(['dns-server', W('ip', 'ip')], ({ ip }, s) => { s.dev.config.dhcp.pools[s.ctx.pool].dns = parseIp(ip); return { out: '' }; }, { key: 'dns-server', no: (_, s) => { s.dev.config.dhcp.pools[s.ctx.pool].dns = null; }, noShape: ['dns-server', W('ip', 'ip', { opt: true })] }),
  cmd(['domain-name', W('name', 'word')], ({ name }, s) => { s.dev.config.dhcp.pools[s.ctx.pool].domain = name; return { out: '' }; }, { key: 'dhcp domain-name' }),
  cmd(['lease', W('days', 'num'), W('rest', 'rest', { opt: true })], () => ({ out: '' }), { key: 'lease' }),
  END,
  cmd(['exit'], (_, s) => { s.mode = 'config'; s.ctx = {}; return { out: '' }; }, { once: true }),
];


const GLOBAL = [
  ...GLOBAL_COMMON,
  ...ACL_GLOBAL,
  ...GLOBAL_V6,
  cmd(['ip', 'route', W('net', 'ip'), W('mask', 'mask'), W('via', 'rest')], ({ net, mask, via }, s) => {
    const parsed = parseRouteTail(via);
    if (!parsed) return { out: invalidAt(s, s.line.indexOf(via)) };
    const len = maskToLen(mask);
    const n = parseIp(net);
    if (network(n, len) !== n) return { out: '%Inconsistent address and mask' };
    const st = { net: n, len, nh: parsed.nh, intf: parsed.intf, ad: parsed.ad ?? 1 };
    const c = s.dev.config;
    c.statics = c.statics.filter(x => !(x.net === st.net && x.len === st.len && x.nh === st.nh && x.intf === st.intf));
    c.statics.push(st);
    return { out: '' };
  }, { key: 'ip route', no: ({ net, mask, via }, s) => {
    const len = maskToLen(mask);
    const n = parseIp(net);
    const parsed = via ? parseRouteTail(via) : null;
    s.dev.config.statics = s.dev.config.statics.filter(x => !(x.net === n && x.len === len && (!parsed || (x.nh === parsed.nh && x.intf === parsed.intf))));
  }, noShape: ['ip', 'route', W('net', 'ip'), W('mask', 'mask'), W('via', 'rest', { opt: true })] }),
  cmd(['router', 'ospf', W('pid', 'num')], ({ pid }, s) => {
    const c = s.dev.config;
    if (c.ospf && c.ospf.pid !== pid) return { out: `% This lab supports one OSPF process. Remove "router ospf ${c.ospf.pid}" first.` };
    if (!c.ospf) c.ospf = { pid, routerId: null, networks: [], passive: [] };
    s.mode = 'router';
    s.ctx = {};
    return { out: '' };
  }, { key: 'router ospf', no: ({ pid }, s) => { if (s.dev.config.ospf?.pid === pid) s.dev.config.ospf = null; } }),
];

const PRIORITY_HELP = '% Bridge Priority must be in increments of 4096.\n% Allowed values are:\n  0     4096  8192  12288 16384 20480 24576 28672\n  32768 36864 40960 45056 49152 53248 57344 61440';

function vlanName(v) { return `VLAN${String(v).padStart(4, '0')}`; }

const GLOBAL_SWITCH = [
  ...GLOBAL_COMMON,
  cmd(['vlan', W('list', 'word')], ({ list }, s) => {
    const ids = parseVlanList(list);
    if (!ids) return { out: invalidAt(s, s.line.indexOf(list)) };
    if (ids.some(v => v >= 1002 && v <= 1005)) return { out: `Default VLAN ${ids.find(v => v >= 1002 && v <= 1005)} may not be modified.` };
    for (const v of ids) s.dev.config.vlans[v] ??= { name: vlanName(v) };
    s.mode = 'vlan';
    s.ctx = { vlans: ids };
    return { out: '' };
  }, { key: 'vlan', no: ({ list }, s) => {
    const ids = parseVlanList(list) ?? [];
    for (const v of ids) if (v !== 1) delete s.dev.config.vlans[v];
    if (ids.includes(1)) s.notices.push('%Default VLAN 1 may not be deleted.');
  } }),
  cmd(['ip', 'default-gateway', W('gw', 'ip')], ({ gw }, s) => { s.dev.config.defaultGateway = parseIp(gw); return { out: '' }; }, { key: 'ip default-gateway', no: (_, s) => { s.dev.config.defaultGateway = null; }, noShape: ['ip', 'default-gateway', W('gw', 'ip', { opt: true })] }),
  cmd(['spanning-tree', 'mode', ALT('m', ['pvst', 'rapid-pvst'])], ({ m }, s) => { s.dev.config.stp.mode = m; return { out: '' }; }, { key: 'spanning-tree mode', no: (_, s) => { s.dev.config.stp.mode = 'pvst'; }, noShape: ['spanning-tree', 'mode', ALT('m', ['pvst', 'rapid-pvst'], { opt: true })] }),
  cmd(['spanning-tree', 'vlan', W('list', 'word'), 'priority', W('p', 'num')], ({ list, p }, s) => {
    const ids = parseVlanList(list);
    if (!ids) return { out: invalidAt(s, s.line.indexOf(list)) };
    if (p % 4096 !== 0 || p > 61440) return { out: PRIORITY_HELP };
    for (const v of ids) s.dev.config.stp.prio[v] = p;
    return { out: '' };
  }, { key: 'spanning-tree vlan priority', no: ({ list }, s) => { for (const v of parseVlanList(list) ?? []) delete s.dev.config.stp.prio[v]; }, noShape: ['spanning-tree', 'vlan', W('list', 'word'), 'priority', W('p', 'num', { opt: true })] }),
  cmd(['spanning-tree', 'vlan', W('list', 'word'), 'root', ALT('r', ['primary', 'secondary'])], ({ list, r }, s) => {
    const ids = parseVlanList(list);
    if (!ids) return { out: invalidAt(s, s.line.indexOf(list)) };
    for (const v of ids) {
      if (r === 'secondary') { s.dev.config.stp.prio[v] = 28672; continue; }
      const inst = l2Of(s.world).stp[s.deviceId]?.[v];
      const rootBase = inst ? inst.root.prio - v : 32768;
      const mine = inst && inst.rootId === s.deviceId;
      s.dev.config.stp.prio[v] = mine ? Math.min(24576, rootBase) : rootBase > 24576 ? 24576 : Math.max(0, rootBase - 4096);
    }
    return { out: '' };
  }, { key: 'spanning-tree vlan root', no: ({ list }, s) => { for (const v of parseVlanList(list) ?? []) delete s.dev.config.stp.prio[v]; }, noShape: ['spanning-tree', 'vlan', W('list', 'word'), 'root'] }),
  cmd(['spanning-tree', 'portfast', 'default'], (_, s) => { s.dev.config.stp.portfastDefault = true; return { out: '%Warning: this command enables portfast by default on all interfaces. You\n should now disable portfast explicitly on switched ports leading to hubs,\n switches and bridges as they may create temporary bridging loops.' }; }, { key: 'spanning-tree portfast default', no: (_, s) => { s.dev.config.stp.portfastDefault = false; } }),
  cmd(['spanning-tree', 'portfast', 'bpduguard', 'default'], (_, s) => { s.dev.config.stp.bpduguardDefault = true; return { out: '' }; }, { key: 'spanning-tree portfast bpduguard default', no: (_, s) => { s.dev.config.stp.bpduguardDefault = false; } }),
];

function parseRouteTail(text) {
  const tokens = tokenize(text);
  let i = 0;
  let nh = null, intf = null, ad = null;
  const r = readInterface(tokens, 0);
  if (r) { intf = r.name; i = r.used; }
  if (tokens[i] && isIp(tokens[i].text)) { nh = parseIp(tokens[i].text); i += 1; }
  if (!intf && nh === null) return null;
  if (tokens[i] && /^\d+$/.test(tokens[i].text)) { ad = Number(tokens[i].text); i += 1; if (ad < 1 || ad > 255) return null; }
  if (i < tokens.length) return null;
  return { nh, intf, ad };
}

const here = (s) => s.dev.config.interfaces[s.ctx.intf];

const IFACE_COMMON = [
  cmd(['shutdown'], (_, s) => {
    here(s).shutdown = true;
    // Shutting a port is half of recovering it from err-disabled.
    if (s.dev.err) delete s.dev.err[s.ctx.intf];
    return { out: '' };
  }, { key: 'shutdown', no: (_, s) => { here(s).shutdown = false; } }),
  cmd(['description', W('text', 'rest')], ({ text }, s) => { here(s).description = text; return { out: '' }; }, { key: 'description', no: (_, s) => { here(s).description = null; }, noShape: ['description', W('text', 'rest', { opt: true })] }),
  cmd(['cdp', 'enable'], (_, s) => { here(s).cdp = true; return { out: '' }; }, { key: 'cdp enable', no: (_, s) => { here(s).cdp = false; } }),
  cmd(['speed', ALT('v', ['10', '100', '1000', 'auto'])], ({ v }, s) => {
    const name = s.ctx.intf;
    if (!/^(Fast|Gigabit)Ethernet/.test(name) || isSub(name)) return { out: invalidAt(s, 0) };
    if (v === '1000' && name.startsWith('Fast')) return { out: invalidAt(s, s.line.search(/\S+\s*$/)) };
    here(s).speed = v === 'auto' ? 'auto' : Number(v);
    return { out: '' };
  }, { key: 'speed', no: (_, s) => { here(s).speed = 'auto'; }, noShape: ['speed', W('v', 'word', { opt: true })] }),
  cmd(['duplex', ALT('v', ['auto', 'full', 'half'])], ({ v }, s) => {
    const name = s.ctx.intf;
    if (!/^(Fast|Gigabit)Ethernet/.test(name) || isSub(name)) return { out: invalidAt(s, 0) };
    here(s).duplex = v;
    return { out: '' };
  }, { key: 'duplex', no: (_, s) => { here(s).duplex = 'auto'; }, noShape: ['duplex', W('v', 'word', { opt: true })] }),
  END,
  cmd(['exit'], (_, s) => { s.mode = 'config'; s.ctx = {}; return { out: '' }; }, { once: true }),
];

const SUBIF_IP_ERROR = '% Configuring IP routing on a LAN subinterface is only allowed if that\nsubinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q,\nor ISL vLAN.';

const IP_ADDRESS = cmd(['ip', 'address', W('ip', 'ip'), W('mask', 'mask')], ({ ip, mask }, s) => {
  const c = s.dev.config;
  const intf = here(s);
  if (intf.sw) return { out: invalidAt(s, s.line.search(/\baddress\b/)) };
  if (isSub(intf.name) && !intf.encap) return { out: SUBIF_IP_ERROR };
  const a = parseIp(ip), len = maskToLen(mask);
  if (len < 31 && (a === network(a, len) || a === (network(a, len) | (~lenToMask(len) >>> 0)) >>> 0)) return { out: `Bad mask /${len} for address ${ip}` };
  const clash = Object.values(c.interfaces).find(o => o.name !== intf.name && o.ip !== null && network(o.ip, Math.min(len, maskToLen(o.mask))) === network(a, Math.min(len, maskToLen(o.mask))));
  if (clash) return { out: `% ${formatIp(network(a, len))} overlaps with ${clash.name}` };
  intf.ip = a; intf.mask = parseIp(mask);
  return { out: '' };
}, { key: 'ip address', no: (_, s) => { const i = here(s); i.ip = null; i.mask = null; }, noShape: ['ip', 'address', W('ip', 'ip', { opt: true }), W('mask', 'mask', { opt: true })] });

const IFACE = [
  IP_ADDRESS,
  ...IFACE_V6,
  ...IFACE_SERVICES,
  cmd(['encapsulation', ALT('e', ['dot1q']), W('vlan', 'num'), ALT('native', ['native'], { opt: true })], ({ vlan, native }, s) => {
    if (!isSub(s.ctx.intf)) return { out: invalidAt(s, 0) };
    if (vlan < 1 || vlan > 4094) return { out: invalidAt(s, s.line.search(/\d+\s*(native)?\s*$/)) };
    here(s).encap = { vlan, native: Boolean(native) };
    return { out: '' };
  }, { key: 'encapsulation dot1q', no: (_, s) => { here(s).encap = null; }, noShape: ['encapsulation', ALT('e', ['dot1q'], { opt: true }), W('vlan', 'num', { opt: true })] }),
  cmd(['ip', 'ospf', 'priority', W('n', 'num')], ({ n }, s) => {
    if (n > 255) return { out: invalidAt(s, s.line.search(/\S+\s*$/)) };
    here(s).ospf.priority = n;
    return { out: '' };
  }, { key: 'ip ospf priority', no: (_, s) => { here(s).ospf.priority = 1; }, noShape: ['ip', 'ospf', 'priority', W('n', 'num', { opt: true })] }),
  cmd(['ip', 'ospf', 'cost', W('n', 'num')], ({ n }, s) => { here(s).ospf.cost = n; return { out: '' }; }, { key: 'ip ospf cost', no: (_, s) => { here(s).ospf.cost = null; }, noShape: ['ip', 'ospf', 'cost', W('n', 'num', { opt: true })] }),
  cmd(['ip', 'ospf', 'network', ALT('type', ['point-to-point', 'broadcast'])], ({ type }, s) => { here(s).ospf.networkType = type; return { out: '' }; }, { key: 'ip ospf network', no: (_, s) => { here(s).ospf.networkType = null; }, noShape: ['ip', 'ospf', 'network', ALT('type', ['point-to-point', 'broadcast'], { opt: true })] }),
  cmd(['ip', 'ospf', W('pid', 'num'), 'area', W('area', 'num')], ({ pid, area }, s) => {
    const o = here(s).ospf;
    o.pid = pid; o.area = area;
    if (!s.dev.config.ospf) s.dev.config.ospf = { pid, routerId: null, networks: [], passive: [] };
    return { out: '' };
  }, { key: 'ip ospf area', no: (_, s) => { const o = here(s).ospf; o.pid = null; o.area = null; }, noShape: ['ip', 'ospf', W('pid', 'num'), 'area', W('area', 'num', { opt: true })] }),
  ...IFACE_COMMON,
];

// Settings a Port-channel pushes down to its members, as IOS does.
const SYNCED = ['mode', 'access', 'native', 'allowed', 'nonegotiate', 'encap', 'voice'];
function syncChannel(s) {
  if (!isPo(s.ctx.intf)) return;
  const po = here(s).sw;
  const group = Number(s.ctx.intf.slice(12));
  for (const name of s.dev.ports) {
    const sw = s.dev.config.interfaces[name].sw;
    if (sw?.channel?.group === group) for (const k of SYNCED) sw[k] = Array.isArray(po[k]) ? [...po[k]] : po[k];
  }
}

// A switchport command: rejected on an SVI, synced from a Port-channel.
function swc(words, run, extra = {}) {
  const wrap = (fn) => (args, s) => {
    const sw = here(s).sw;
    if (!sw) return { out: invalidAt(s, 0) };
    const r = fn(args, s, sw);
    syncChannel(s);
    return r;
  };
  return cmd(words, wrap(run), { ...extra, no: extra.no ? (args, s) => { const sw = here(s).sw; if (!sw) return; extra.no(args, s, sw); syncChannel(s); } : undefined });
}

const MAC_RE = /^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/i;

function needVlan(s, v) {
  if (s.dev.config.vlans[v]) return '';
  s.dev.config.vlans[v] = { name: vlanName(v) };
  return `% Access VLAN does not exist. Creating vlan ${v}`;
}

function allowedEdit(sw, text) {
  const t = text.trim().toLowerCase();
  const all = () => Array.from({ length: 4094 }, (_, k) => k + 1);
  if (t === 'all') return null;
  if (t === 'none') return [];
  const m = /^(add|remove|except)\s+(.+)$/.exec(t);
  if (m) {
    const list = parseVlanList(m[2]);
    if (!list) return undefined;
    if (m[1] === 'add') return sw.allowed === null ? null : [...new Set([...sw.allowed, ...list])].sort((a, b) => a - b);
    if (m[1] === 'remove') return (sw.allowed ?? all()).filter(v => !list.includes(v));
    return all().filter(v => !list.includes(v));
  }
  const list = parseVlanList(t);
  return list ?? undefined;
}

const IFACE_SWITCH = [
  IP_ADDRESS,
  swc(['switchport', 'mode', ALT('m', ['access', 'trunk'])], ({ m }, s, sw) => { sw.mode = m; return { out: '' }; }, { key: 'switchport mode', no: (_, s, sw) => { sw.mode = 'dynamic auto'; sw.nonegotiate = false; }, noShape: ['switchport', 'mode'] }),
  swc(['switchport', 'mode', 'dynamic', ALT('d', ['auto', 'desirable'])], ({ d }, s, sw) => {
    if (sw.nonegotiate) return { out: `Command rejected: Conflict between 'nonegotiate' and 'dynamic' status on this interface: ${shortIf(s.ctx.intf)}.` };
    if (sw.psec.on) return { out: `Command rejected: ${s.ctx.intf} is a secure port.` };
    sw.mode = `dynamic ${d}`;
    return { out: '' };
  }, { key: 'switchport mode dynamic' }),
  swc(['switchport', 'access', 'vlan', W('v', 'num')], ({ v }, s, sw) => {
    if (v < 1 || v > 4094) return { out: invalidAt(s, s.line.search(/\S+\s*$/)) };
    sw.access = v;
    return { out: needVlan(s, v) };
  }, { key: 'switchport access vlan', no: (_, s, sw) => { sw.access = 1; }, noShape: ['switchport', 'access', 'vlan', W('v', 'num', { opt: true })] }),
  swc(['switchport', 'trunk', 'native', 'vlan', W('v', 'num')], ({ v }, s, sw) => {
    if (v < 1 || v > 4094) return { out: invalidAt(s, s.line.search(/\S+\s*$/)) };
    sw.native = v;
    return { out: '' };
  }, { key: 'switchport trunk native vlan', no: (_, s, sw) => { sw.native = 1; }, noShape: ['switchport', 'trunk', 'native', 'vlan', W('v', 'num', { opt: true })] }),
  swc(['switchport', 'trunk', 'allowed', 'vlan', W('list', 'rest')], ({ list }, s, sw) => {
    const next = allowedEdit(sw, list);
    if (next === undefined) return { out: invalidAt(s, s.line.indexOf(list)) };
    sw.allowed = next;
    return { out: '' };
  }, { key: 'switchport trunk allowed vlan', no: (_, s, sw) => { sw.allowed = null; }, noShape: ['switchport', 'trunk', 'allowed', 'vlan', W('list', 'rest', { opt: true })] }),
  swc(['switchport', 'trunk', 'encapsulation', ALT('e', ['dot1q'])], (_, s, sw) => { sw.encap = 'dot1q'; return { out: '' }; }, { key: 'switchport trunk encapsulation', no: (_, s, sw) => { sw.encap = null; }, noShape: ['switchport', 'trunk', 'encapsulation'] }),
  swc(['switchport', 'nonegotiate'], (_, s, sw) => {
    if (sw.mode.startsWith('dynamic')) return { out: `Command rejected: Conflict between 'nonegotiate' and 'dynamic' status on this interface: ${shortIf(s.ctx.intf)}.` };
    sw.nonegotiate = true;
    return { out: '' };
  }, { key: 'switchport nonegotiate', no: (_, s, sw) => { sw.nonegotiate = false; } }),
  swc(['switchport', 'voice', 'vlan', W('v', 'num')], ({ v }, s, sw) => {
    if (v < 1 || v > 4094) return { out: invalidAt(s, s.line.search(/\S+\s*$/)) };
    sw.voice = v;
    return { out: needVlan(s, v).replace('Access', 'Voice') };
  }, { key: 'switchport voice vlan', no: (_, s, sw) => { sw.voice = null; }, noShape: ['switchport', 'voice', 'vlan', W('v', 'num', { opt: true })] }),
  swc(['switchport', 'port-security'], (_, s, sw) => {
    if (sw.mode.startsWith('dynamic')) return { out: `Command rejected: ${s.ctx.intf} is a dynamic port.` };
    sw.psec.on = true;
    return { out: '' };
  }, { key: 'switchport port-security', no: (_, s, sw) => { sw.psec.on = false; if (s.dev.err?.[s.ctx.intf] === 'psecure-violation') delete s.dev.err[s.ctx.intf]; } }),
  swc(['switchport', 'port-security', 'maximum', W('n', 'num')], ({ n }, s, sw) => {
    if (n < 1 || n > 8192) return { out: invalidAt(s, s.line.search(/\S+\s*$/)) };
    if (n < sw.psec.macs.length) return { out: 'Maximum is less than number of currently secured mac-addresses.' };
    sw.psec.max = n;
    return { out: '' };
  }, { key: 'switchport port-security maximum', no: (_, s, sw) => { sw.psec.max = 1; }, noShape: ['switchport', 'port-security', 'maximum', W('n', 'num', { opt: true })] }),
  swc(['switchport', 'port-security', 'violation', ALT('v', ['protect', 'restrict', 'shutdown'])], ({ v }, s, sw) => { sw.psec.violation = v; return { out: '' }; }, { key: 'switchport port-security violation', no: (_, s, sw) => { sw.psec.violation = 'shutdown'; }, noShape: ['switchport', 'port-security', 'violation', ALT('v', ['protect', 'restrict', 'shutdown'], { opt: true })] }),
  swc(['switchport', 'port-security', 'mac-address', 'sticky', W('mac', 'word', { opt: true })], ({ mac }, s, sw) => {
    if (mac === undefined) { sw.psec.sticky = true; return { out: '' }; }
    if (!MAC_RE.test(mac)) return { out: invalidAt(s, s.line.indexOf(mac)) };
    if (!sw.psec.macs.some(m => m.mac === mac.toLowerCase())) sw.psec.macs.push({ mac: mac.toLowerCase(), sticky: true });
    sw.psec.sticky = true;
    return { out: '' };
  }, { key: 'switchport port-security mac-address sticky', no: ({ mac }, s, sw) => {
    if (mac) { sw.psec.macs = sw.psec.macs.filter(m => m.mac !== mac.toLowerCase()); return; }
    sw.psec.sticky = false; sw.psec.macs = sw.psec.macs.filter(m => !m.sticky);
  }, noShape: ['switchport', 'port-security', 'mac-address', 'sticky', W('mac', 'word', { opt: true })] }),
  swc(['switchport', 'port-security', 'mac-address', W('mac', 'word')], ({ mac }, s, sw) => {
    if (!MAC_RE.test(mac)) return { out: invalidAt(s, s.line.indexOf(mac)) };
    if (sw.psec.macs.length >= sw.psec.max) return { out: `Total secure mac-addresses on interface ${s.ctx.intf} has reached maximum limit.` };
    if (!sw.psec.macs.some(m => m.mac === mac.toLowerCase())) sw.psec.macs.push({ mac: mac.toLowerCase(), sticky: false });
    return { out: '' };
  }, { key: 'switchport port-security mac-address', no: ({ mac }, s, sw) => { sw.psec.macs = sw.psec.macs.filter(m => m.mac !== String(mac).toLowerCase()); } }),
  swc(['spanning-tree', 'portfast', ALT('t', ['trunk', 'disable'], { opt: true })], ({ t }, s, sw) => {
    if (t === 'disable') { sw.portfast = false; return { out: '' }; }
    sw.portfast = true;
    const warn = `%Warning: portfast should only be enabled on ports connected to a single\n host. Connecting hubs, concentrators, switches, bridges, etc... to this\n interface  when portfast is enabled, can cause temporary bridging loops.\n Use with CAUTION`;
    const where = t === 'trunk' ? '' : `\n\n%Portfast has been configured on ${s.ctx.intf} but will only\n have effect when the interface is in a non-trunking mode.`;
    return { out: `${warn}${where}` };
  }, { key: 'spanning-tree portfast', no: (_, s, sw) => { sw.portfast = false; }, noShape: ['spanning-tree', 'portfast'] }),
  swc(['spanning-tree', 'bpduguard', ALT('b', ['enable', 'disable'])], ({ b }, s, sw) => { sw.bpduguard = b; return { out: '' }; }, { key: 'spanning-tree bpduguard', no: (_, s, sw) => { sw.bpduguard = null; }, noShape: ['spanning-tree', 'bpduguard', ALT('b', ['enable', 'disable'], { opt: true })] }),
  swc(['channel-group', W('g', 'num'), 'mode', ALT('m', ['active', 'passive', 'on', 'desirable', 'auto'])], ({ g, m }, s, sw) => {
    if (isPo(s.ctx.intf)) return { out: invalidAt(s, 0) };
    if (g < 1 || g > 48) return { out: invalidAt(s, s.line.indexOf(String(g))) };
    const name = `Port-channel${g}`;
    const c = s.dev.config;
    let out = '';
    const others = s.dev.ports.filter(n => n !== s.ctx.intf && c.interfaces[n].sw?.channel?.group === g);
    const proto = (x) => channelProtocolOf(x);
    if (others.length && proto(c.interfaces[others[0]].sw.channel.mode) !== proto(m)) {
      return { out: `Command rejected (Channel protocol mismatch for interface ${shortIf(s.ctx.intf)} in group ${g}): the interface can not be added to the channel group` };
    }
    if (!c.interfaces[name]) {
      const po = makeSwitchport();
      for (const k of SYNCED) po[k] = Array.isArray(sw[k]) ? [...sw[k]] : sw[k];
      c.interfaces[name] = makeInterface(name, { shutdown: false, sw: po, cdp: true });
      out = `Creating a port-channel interface Port-channel ${g}`;
    } else {
      const po = c.interfaces[name].sw;
      for (const k of SYNCED) sw[k] = Array.isArray(po[k]) ? [...po[k]] : po[k];
    }
    sw.channel = { group: g, mode: m };
    return { out };
  }, { key: 'channel-group', no: (_, s, sw) => { sw.channel = null; }, noShape: ['channel-group'] }),
  ...IFACE_COMMON,
];

const channelProtocolOf = (m) => (['active', 'passive'].includes(m) ? 'lacp' : ['desirable', 'auto'].includes(m) ? 'pagp' : 'none');

const VLAN_MODE = [
  cmd(['name', W('name', 'word')], ({ name }, s) => {
    for (const v of s.ctx.vlans) s.dev.config.vlans[v].name = name;
    return { out: '' };
  }, { key: 'vlan name', no: (_, s) => { for (const v of s.ctx.vlans) s.dev.config.vlans[v].name = vlanName(v); }, noShape: ['name'] }),
  END,
  cmd(['exit'], (_, s) => { s.mode = 'config'; s.ctx = {}; return { out: '' }; }, { once: true }),
];

const ROUTER = [
  cmd(['router-id', W('rid', 'ip')], ({ rid }, s) => {
    const o = s.dev.config.ospf;
    const value = parseIp(rid);
    o.routerId = value;
    if (s.dev.ospfRid !== null && s.dev.ospfRid !== value) return { out: '% OSPF: Reload or use "clear ip ospf process" command, for this to take effect' };
    return { out: '' };
  }, { key: 'router-id', no: (_, s) => { s.dev.config.ospf.routerId = null; }, noShape: ['router-id', W('rid', 'ip', { opt: true })] }),
  cmd(['network', W('ip', 'ip'), W('wild', 'wild'), 'area', W('area', 'num')], ({ ip, wild, area }, s) => {
    const o = s.dev.config.ospf;
    const n = { ip: (parseIp(ip) & (~parseIp(wild) >>> 0)) >>> 0, wildcard: parseIp(wild), area };
    if (!o.networks.some(x => x.ip === n.ip && x.wildcard === n.wildcard)) o.networks.push(n);
    return { out: '' };
  }, { key: 'network', no: ({ ip, wild }, s) => {
    const o = s.dev.config.ospf;
    const target = (parseIp(ip) & (~parseIp(wild) >>> 0)) >>> 0;
    o.networks = o.networks.filter(x => !(x.ip === target && x.wildcard === parseIp(wild)));
  }, noShape: ['network', W('ip', 'ip'), W('wild', 'wild'), 'area', W('area', 'num')] }),
  cmd(['passive-interface', W('name', 'intf')], ({ name }, s) => {
    const o = s.dev.config.ospf;
    if (!s.dev.config.interfaces[name]) return { out: invalidAt(s, s.line.search(/\S+\s*$/)) };
    if (!o.passive.includes(name)) o.passive.push(name);
    return { out: '' };
  }, { key: 'passive-interface', no: ({ name }, s) => { const o = s.dev.config.ospf; o.passive = o.passive.filter(p => p !== name); } }),
  END,
  cmd(['exit'], (_, s) => { s.mode = 'config'; s.ctx = {}; return { out: '' }; }, { once: true }),
];

const LINE = [
  cmd(['login', ALT('how', ['local'], { opt: true })], ({ how }, s) => {
    const l = s.dev.config.lines[s.ctx.line];
    l.login = how === 'local' ? 'local' : 'line';
    if (!how && !l.password) return { out: `% Login disabled on line ${s.ctx.line === 'vty' ? 66 : 0}, until 'password' is set` };
    return { out: '' };
  }, { key: 'login', no: (_, s) => { s.dev.config.lines[s.ctx.line].login = null; }, noShape: ['login', ALT('how', ['local'], { opt: true })] }),
  cmd(['password', W('value', 'rest')], ({ value }, s) => { s.dev.config.lines[s.ctx.line].password = value; return { out: '' }; }, { key: 'line password', no: (_, s) => { s.dev.config.lines[s.ctx.line].password = null; }, noShape: ['password'] }),
  cmd(['transport', 'input', ALT('a', ['ssh', 'telnet', 'all', 'none']), ALT('b', ['ssh', 'telnet'], { opt: true })], ({ a, b }, s) => {
    s.dev.config.lines[s.ctx.line].transport = b && b !== a ? [a, b].sort().reverse().join(' ') : a;
    return { out: '' };
  }, { key: 'transport input', no: (_, s) => { s.dev.config.lines[s.ctx.line].transport = null; }, noShape: ['transport', 'input'] }),
  cmd(['exec-timeout', W('m', 'num'), W('sec', 'num', { opt: true })], ({ m, sec }, s) => { s.dev.config.lines[s.ctx.line].execTimeout = sec ? `${m} ${sec}` : `${m}`; return { out: '' }; }, { key: 'exec-timeout' }),
  END,
  cmd(['exit'], (_, s) => { s.mode = 'config'; s.ctx = {}; return { out: '' }; }, { once: true }),
];

// ---------- a PC's command prompt ----------

const winMac = (mac) => mac.replace(/\./g, '').toUpperCase().match(/../g).join('-');

function pcPing(s, dstText) {
  const dst = parseIp(dstText);
  const nic = s.dev.config.interfaces.FastEthernet0;
  if (nic.ip === null) return { text: `\nPinging ${dstText} with 32 bytes of data:\n\nPING: transmit failed. General failure. \nPING: transmit failed. General failure. \nPING: transmit failed. General failure. \nPING: transmit failed. General failure. \n\nPing statistics for ${dstText}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),`, ok: false, src: null };
  const r = pingWorld(s.world, s.deviceId, dst, null);
  const owner = Object.values(s.world.devices).find(dv => Object.values(dv.config.interfaces).some(i => i.ip === dst));
  const ttl = owner?.kind === 'pc' ? 128 : 255;
  const blocker = r.reason === 'acl' && r.stage === 'there' ? s.world.devices[r.acl.device]?.config.interfaces[r.acl.intf]?.ip : null;
  const replies = r.ok ? Array(4).fill(`Reply from ${dstText}: bytes=32 time<1ms TTL=${ttl}`)
    : blocker ? Array(4).fill(`Reply from ${formatIp(blocker)}: Destination host unreachable.`) : Array(4).fill('Request timed out.');
  const stats = `Ping statistics for ${dstText}:\n    Packets: Sent = 4, Received = ${r.ok ? 4 : 0}, Lost = ${r.ok ? 0 : 4} (${r.ok ? 0 : 100}% loss),${r.ok ? '\nApproximate round trip times in milli-seconds:\n    Minimum = 0ms, Maximum = 1ms, Average = 0ms' : ''}`;
  return { text: `\nPinging ${dstText} with 32 bytes of data:\n\n${replies.join('\n')}\n\n${stats}`, ok: r.ok, src: nic.ip };
}

const PC = [
  cmd(['ipconfig', ALT('op', ['/renew', '/release'])], ({ op }, s) => {
    const c = s.dev.config;
    const nic = c.interfaces.FastEthernet0;
    if (op === '/release') {
      nic.ip = null; nic.mask = null; c.gateway = null; c.dns = null; c.dhcp = true;
      return { out: '\nEthernet adapter FastEthernet0:\n\n   IPv4 Address. . . . . . . . . . . : 0.0.0.0' };
    }
    const r = requestDhcp(s.world, s.deviceId);
    c.dhcp = true;
    s.events.push({ kind: 'dhcp', ok: r.ok, ip: r.ip ?? null });
    if (!r.ok) {
      // No server answered: Windows falls back to a link-local address.
      const h = parseInt(s.dev.mac.replace(/\./g, '').slice(-4), 16);
      nic.ip = parseIp(`169.254.${(h >> 8) % 254 + 1}.${(h & 255) % 254 + 1}`);
      nic.mask = parseIp('255.255.0.0');
      c.gateway = null;
      return { out: 'An error occurred while renewing interface FastEthernet0 : unable to contact your DHCP server.  Request has timed out.' };
    }
    nic.ip = r.ip; nic.mask = lenToMask(r.len); c.gateway = r.router; c.dns = r.dns;
    return { out: `\nEthernet adapter FastEthernet0:\n\n   Connection-specific DNS Suffix  . :\n   IPv4 Address. . . . . . . . . . . : ${formatIp(r.ip)}\n   Subnet Mask . . . . . . . . . . . : ${formatIp(lenToMask(r.len))}\n   Default Gateway . . . . . . . . . : ${r.router === null ? '' : formatIp(r.router)}` };
  }, { key: 'ipconfig renew' }),
  cmd(['telnet', W('dst', 'ip'), W('port', 'num', { opt: true })], ({ dst, port }, s) => {
    const p = port ?? 23;
    const r = exchange(s.world, s.deviceId, parseIp(dst), { proto: 'tcp', port: p });
    s.events.push({ kind: 'tcp', dst: parseIp(dst), port: p, ok: r.ok });
    return { out: r.ok ? `Connecting To ${dst}...\nConnected to ${dst} on port ${p}. (Closed: this lab only tests the connection.)` : `Connecting To ${dst}...Could not open connection to the host, on port ${p}: Connect failed` };
  }, { key: 'telnet' }),
  cmd(['ipconfig', ALT('all', ['/all'], { opt: true })], ({ all }, s) => {
    const nic = s.dev.config.interfaces.FastEthernet0;
    const v = (x) => (x === null || x === undefined ? '0.0.0.0' : formatIp(x));
    const lines = ['', 'Ethernet adapter FastEthernet0:', '', '   Connection-specific DNS Suffix  . :'];
    if (all) lines.push(`   Physical Address. . . . . . . . . : ${winMac(s.dev.mac)}`, `   DHCP Enabled. . . . . . . . . . . : ${s.dev.config.dhcp ? 'Yes' : 'No'}`);
    const gw4 = s.dev.config.gateway === null ? '' : formatIp(s.dev.config.gateway);
    const gw6 = pcV6Gateway(s.world, s.dev);
    lines.push(...pcV6Lines(s.world, s.dev), `   IPv4 Address. . . . . . . . . . . : ${v(nic.ip)}`, `   Subnet Mask . . . . . . . . . . . : ${v(nic.mask)}`, `   Default Gateway . . . . . . . . . : ${gw6 ?? gw4}`);
    if (gw6 && gw4) lines.push(`                                       ${gw4}`);
    if (all) lines.push(`   DNS Servers . . . . . . . . . . . : ${s.dev.config.dns === null ? '' : formatIp(s.dev.config.dns)}`);
    return { out: lines.join('\n') };
  }, { key: 'ipconfig' }),
  cmd(['ipconfig', W('ip', 'ip'), W('mask', 'mask'), W('gw', 'ip', { opt: true })], ({ ip, mask, gw }, s) => {
    const nic = s.dev.config.interfaces.FastEthernet0;
    nic.ip = parseIp(ip);
    nic.mask = parseIp(mask);
    s.dev.config.dhcp = false;
    if (gw !== undefined) s.dev.config.gateway = parseIp(gw);
    return { out: '' };
  }, { key: 'ipconfig set' }),
  cmd(['ping', W('dst', 'ip')], ({ dst }, s) => {
    const r = pcPing(s, dst);
    s.events.push({ kind: 'ping', dst: parseIp(dst), src: r.src, ok: r.ok });
    return { out: r.text };
  }, { key: 'ping' }),
  cmd(['tracert', W('dst', 'ip')], ({ dst }, s) => {
    const r = traceWorld(s.world, s.deviceId, parseIp(dst));
    const hops = r.hops.map(h => h.ip);
    if (r.ok && hops[hops.length - 1] !== parseIp(dst)) hops.push(parseIp(dst));
    const rows = hops.map((ip, k) => `${lpad(k + 1, 3)}   0 ms      0 ms      0 ms      ${formatIp(ip)}`);
    if (!r.ok) rows.push(`${lpad(hops.length + 1, 3)}   *         *         *         Request timed out.`);
    s.events.push({ kind: 'trace', dst: parseIp(dst), ok: r.ok });
    return { out: `\nTracing route to ${dst} over a maximum of 30 hops: \n\n${rows.join('\n')}\n\nTrace complete.` };
  }, { key: 'tracert' }),
  ...PC_V6,
];

const MODES = {
  user: { specs: { router: USER, switch: USER_SWITCH }, prompt: (h) => `${h}>` },
  exec: { specs: { router: EXEC, switch: EXEC_SWITCH }, prompt: (h) => `${h}#` },
  config: { specs: { router: GLOBAL, switch: GLOBAL_SWITCH }, prompt: (h) => `${h}(config)#` },
  if: { specs: { router: IFACE, switch: IFACE_SWITCH }, prompt: (h, s) => `${h}(config-${s?.ctx?.range ? 'if-range' : isSub(s?.ctx?.intf ?? '') ? 'subif' : 'if'})#` },
  router: { specs: { router: ROUTER, switch: ROUTER }, prompt: (h) => `${h}(config-router)#` },
  line: { specs: { router: LINE, switch: LINE }, prompt: (h) => `${h}(config-line)#` },
  vlan: { specs: { router: VLAN_MODE, switch: VLAN_MODE }, prompt: (h) => `${h}(config-vlan)#` },
  acl: { specs: { router: ACL_MODE, switch: ACL_MODE }, prompt: (h, s) => `${h}(config-${s?.ctx?.kind === 'extended' ? 'ext' : 'std'}-nacl)#` },
  dhcp: { specs: { router: DHCP_MODE, switch: DHCP_MODE }, prompt: (h) => `${h}(dhcp-config)#` },
  pc: { specs: { pc: PC }, prompt: () => 'C:\\>' },
};

const isConfigMode = (mode) => ['config', 'if', 'router', 'line', 'vlan', 'acl', 'dhcp'].includes(mode);

// The "no" form of each command that has one, as its own grammar.
function noSpecs(specs) {
  return specs.filter(s => s.no).map(s => ({ words: ['no', ...(s.noShape ?? s.words)], run: (args, sess) => { s.no(args, sess); return { out: '' }; }, key: `no ${s.key}`, once: s.once }));
}

function specsFor(mode, kind = 'router') {
  const table = MODES[mode].specs;
  const base = table[kind] ?? table.router ?? table.pc;
  return isConfigMode(mode) ? [...base, ...noSpecs(base)] : base;
}

const execSpecs = (kind) => (kind === 'switch' ? EXEC_SWITCH : EXEC);

// ---------- sessions ----------

export function createSession(world, deviceId) {
  const events = [];
  const push = events.push.bind(events);
  events.push = (...items) => push(...items.map(e => ({ ...e, seq: (world.seq = (world.seq ?? 0) + 1), device: deviceId })));
  const kind = world.devices[deviceId]?.kind ?? 'router';
  return { world, deviceId, kind, mode: kind === 'pc' ? 'pc' : 'user', ctx: {}, pending: null, history: [], events, notices: [], line: '', promptLength: 0 };
}

const kindOfSession = (session) => session.world.devices[session.deviceId]?.kind ?? 'router';

export function prompt(session) {
  if (session.pending) return session.pending.prompt;
  const dev = session.world.devices[session.deviceId];
  return MODES[session.mode].prompt(dev.config.hostname, session);
}

// What the console prints for each device when its own state changes.
function snapshot(world, deviceId) {
  const dev = world.devices[deviceId];
  const ifs = Object.fromEntries(Object.keys(dev.config.interfaces).map(n => [n, interfaceState(world, deviceId, n)]));
  const nbrs = Object.fromEntries(neighbors(world, deviceId).map(n => [`${n.rid}|${n.intf}`, n.state]));
  return { ifs, nbrs };
}

function diffNotices(before, after, pid = 1) {
  const out = [];
  for (const [n, st] of Object.entries(after.ifs)) {
    const was = before.ifs[n];
    if (!was) continue;
    if (was.status !== st.status) out.push(`%LINK-${st.status === 'administratively down' ? 5 : 3}-UPDOWN: Interface ${n}, changed state to ${st.status}`);
    if (was.protocol !== st.protocol) out.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${n}, changed state to ${st.protocol}`);
  }
  for (const [k, state] of Object.entries(after.nbrs)) {
    if (before.nbrs[k] === state) continue;
    const [rid, intf] = k.split('|');
    if (state === 'FULL') out.push(`%OSPF-5-ADJCHG: Process ${pid}, Nbr ${formatIp(Number(rid))} on ${intf} from LOADING to FULL, Loading Done`);
  }
  for (const k of Object.keys(before.nbrs)) {
    if (after.nbrs[k]) continue;
    const [rid, intf] = k.split('|');
    out.push(`%OSPF-5-ADJCHG: Process ${pid}, Nbr ${formatIp(Number(rid))} on ${intf} from FULL to DOWN, Neighbor Down: Interface down or detached`);
  }
  return out;
}

function runOne(session, specs, tokens) {
  const p = parse(specs, tokens);
  if (p.error) return p;
  // interface range: the command runs once on each port in the range.
  const range = session.mode === 'if' && session.ctx?.range && !p.spec.once ? session.ctx.range : null;
  if (range) {
    const outs = [];
    let result = { out: '' };
    for (const name of range) {
      session.ctx.intf = name;
      const mode = session.mode;
      result = p.spec.run(p.args, session) ?? { out: '' };
      if (result.out && !outs.includes(result.out)) outs.push(result.out);
      session.events.push({ kind: 'command', key: p.spec.key ?? null, mode, intf: name });
      if (session.mode !== 'if' || session.ctx?.range !== range) break;
    }
    if (session.mode === 'if' && session.ctx?.range === range) session.ctx.intf = range[0];
    return { result: { ...result, out: outs.join('\n') } };
  }
  const mode = session.mode;
  const intf = session.ctx?.intf ?? null;
  const result = p.spec.run(p.args, session) ?? { out: '' };
  session.events.push({ kind: 'command', key: p.spec.key ?? null, mode, intf });
  return { result };
}

function errorText(session, p, tokens) {
  if (p.error === 'incomplete') return '% Incomplete command.';
  if (p.error === 'ambiguous') return `% Ambiguous command:  "${tokens.slice(0, (p.upto ?? 0) + 1).map(t => t.text).join(' ')}"`;
  return invalidAt(session, tokens[p.at]?.at ?? session.line.length);
}

// execute(session, line) -> text the console prints (without the next prompt).
export function execute(session, rawLine) {
  const world = session.world;
  const dev = world.devices[session.deviceId];
  session.dev = dev;
  session.notices = [];
  const before = snapshot(world, session.deviceId);
  const finish = (text) => {
    refresh(world);
    const after = snapshot(world, session.deviceId);
    const logs = takeNotices(world, session.deviceId);
    const notices = dev.kind === 'pc' ? [] : [...session.notices, ...logs, ...diffNotices(before, after, dev.config.ospf?.pid ?? 1)];
    return [text, ...notices].filter(t => t !== '' && t !== undefined && t !== null).join('\n');
  };

  if (session.pending) {
    const ask = session.pending;
    session.pending = null;
    const r = ask.answer(rawLine.trim());
    if (r && typeof r === 'object') { session.pending = r.ask ?? null; return finish(r.text ?? ''); }
    return finish(r ?? '');
  }

  const line = rawLine.replace(/\s+$/, '');
  session.line = line;
  session.promptLength = prompt(session).length;
  if (!line.trim()) return '';
  if (/\?$/.test(line)) return help(session, line);
  session.history.push(line);

  // Output filters on show commands: | include, | exclude, | begin, | section.
  const pipe = /^(.*?\S)\s*\|\s*(\S+)\s+(.+)$/.exec(line);
  if (pipe && session.mode !== 'pc' && /^(do\s+)?sh/i.test(pipe[1])) {
    const kind = ['include', 'exclude', 'begin', 'section'].find(k => k.startsWith(pipe[2].toLowerCase()));
    if (!kind) return invalidAt(session, line.indexOf(pipe[2]));
    session.line = pipe[1];
    const text = execute(session, pipe[1]);
    session.history.pop();
    return filterOutput(text, kind, pipe[3]);
  }

  const tokens = tokenize(line);
  const kind = kindOfSession(session);
  const specs = specsFor(session.mode, kind);

  // "do" runs an EXEC command from any configuration mode.
  if (isConfigMode(session.mode) && tokens[0].text.toLowerCase() === 'do' && tokens.length > 1) {
    const saved = session.mode;
    const savedCtx = session.ctx;
    session.mode = 'exec';
    const r = runOne(session, execSpecs(kind), tokens.slice(1));
    if (session.mode === 'exec') { session.mode = saved; session.ctx = savedCtx; }
    session.mode = saved;
    if (r.error) return finish(errorText(session, r, tokens.slice(1)));
    const text = r.result.out;
    if (r.result.ask) session.pending = r.result.ask;
    return finish(text);
  }

  let r = runOne(session, specs, tokens);
  // A sub-mode falls back to global configuration, leaving the sub-mode.
  if (r.error && ['if', 'router', 'line', 'vlan', 'acl', 'dhcp'].includes(session.mode)) {
    const saved = { mode: session.mode, ctx: session.ctx };
    session.mode = 'config';
    const g = runOne(session, specsFor('config', kind), tokens);
    if (!g.error) r = g;
    else { session.mode = saved.mode; session.ctx = saved.ctx; }
  }
  if (r.error) return finish(errorText(session, r, tokens));
  if (r.result.ask) session.pending = r.result.ask;
  return finish(r.result.out);
}

function filterOutput(text, kind, pattern) {
  let re;
  try { re = new RegExp(pattern, 'i'); } catch { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
  const lines = text.split('\n');
  if (kind === 'include') return lines.filter(l => re.test(l)).join('\n');
  if (kind === 'exclude') return lines.filter(l => !re.test(l)).join('\n');
  if (kind === 'begin') { const at = lines.findIndex(l => re.test(l)); return at < 0 ? '' : lines.slice(at).join('\n'); }
  const out = [];
  let inSection = false;
  for (const l of lines) {
    if (!/^\s/.test(l)) inSection = re.test(l);
    if (inSection) out.push(l);
  }
  return out.join('\n');
}

// ---------- ? and Tab ----------

function nextChoices(specs, tokens) {
  const words = new Map();
  let canEnd = false;
  for (const spec of specs) {
    // Match the tokens typed so far, then report what this spec takes next.
    let i = 0, w = 0, ok = true;
    while (i < tokens.length && w < spec.words.length) {
      const el = spec.words[w];
      const tok = tokens[i].text.toLowerCase();
      if (typeof el === 'string') { if (!el.startsWith(tok)) { ok = false; break; } i += 1; w += 1; }
      else if (el.alt) { if (el.alt.some(o => o.startsWith(tok))) { i += 1; w += 1; } else if (el.opt) w += 1; else { ok = false; break; } }
      else if (el.arg === 'intf') { const r = readInterface(tokens, i); if (r) { i += r.used; w += 1; } else if (el.opt) w += 1; else { ok = false; break; } }
      else if (el.arg === 'rest') { i = tokens.length; w += 1; }
      else if (ARG[el.arg].check(tokens[i].text)) { i += 1; w += 1; }
      else if (el.opt) w += 1;
      else { ok = false; break; }
    }
    if (!ok || i < tokens.length) continue;
    let rest = spec.words.slice(w);
    if (rest.every(e => typeof e === 'object' && e.opt)) canEnd = true;
    for (const el of rest) {
      if (typeof el === 'string') { words.set(el, ''); break; }
      if (el.alt) for (const o of el.alt) words.set(o, '');
      else words.set(el.arg === 'intf' ? 'GigabitEthernet' : ARG[el.arg].help, '');
      if (!el.opt) break;
    }
  }
  return { words: [...words.keys()], canEnd };
}

function help(session, line) {
  const body = line.slice(0, -1);
  const partial = /\S$/.test(body);
  let tokens = tokenize(body);
  const kind = kindOfSession(session);
  let specs = specsFor(session.mode, kind);
  if (isConfigMode(session.mode) && tokens[0]?.text.toLowerCase() === 'do') { specs = execSpecs(kind); tokens = tokens.slice(1); }
  if (partial) {
    const last = tokens.pop().text.toLowerCase();
    const { words } = nextChoices(specs, tokens);
    const hits = words.filter(w => w.toLowerCase().startsWith(last));
    return hits.length ? hits.join('  ') : '% Unrecognized command';
  }
  const { words, canEnd } = nextChoices(specs, tokens);
  const lines = words.map(w => `  ${w}`);
  if (canEnd) lines.push('  <cr>');
  return lines.length ? lines.join('\n') : '% Unrecognized command';
}

// Tab: finish the last word when only one keyword fits.
export function complete(session, line) {
  if (/\s$/.test(line) || !line.trim()) return line;
  let tokens = tokenize(line);
  const kind = kindOfSession(session);
  let specs = specsFor(session.mode, kind);
  if (isConfigMode(session.mode) && tokens[0]?.text.toLowerCase() === 'do' && tokens.length > 1) { specs = execSpecs(kind); tokens = tokens.slice(1); }
  const last = tokens.pop();
  const { words } = nextChoices(specs, tokens);
  const hits = words.filter(w => /^[a-z]/.test(w) && w.toLowerCase().startsWith(last.text.toLowerCase()));
  if (hits.length !== 1) return line;
  return `${line.slice(0, line.length - last.text.length)}${hits[0]} `;
}

// "g0/1", "gi 0/1", "Loopback0" -> the full interface name, or null.
export function normalizeInterface(text) {
  return readInterface(tokenize(String(text ?? '')), 0)?.name ?? null;
}

// ---------- recognising a command without running it ----------
// Which command a line is, the way the parser reads it: the same
// abbreviations and the same argument reading as a live console. Used to
// grade typed answers, where "sh ip int br" must count as the full form.
const RECOGNISE_MODES = ['exec', 'config', 'if', 'router', 'line', 'vlan', 'acl', 'dhcp'];

function canonicalArgs(args) {
  return Object.fromEntries(Object.entries(args ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v.toLowerCase().replace(/\s+/g, ' ') : v]));
}

// recogniseCommand(line, { kinds, modes }) -> [{ kind, mode, key, args }] for
// every mode and device kind that accepts the line ("do" and pipes stripped).
export function recogniseCommand(rawLine, { kinds = ['router', 'switch'], modes = RECOGNISE_MODES } = {}) {
  let line = String(rawLine ?? '').trim().replace(/\s+/g, ' ');
  if (/^do /i.test(line)) line = line.slice(3);
  line = line.replace(/\s*\|.*$/, '');
  if (!line) return [];
  const tokens = tokenize(line);
  const out = [];
  for (const kind of kinds) {
    for (const mode of modes) {
      const p = parse(specsFor(mode, kind), tokens);
      if (!p.error) out.push({ kind, mode, key: p.spec.key ?? null, args: canonicalArgs(p.args) });
    }
  }
  return out;
}

// sameCommand(answer, typed): does the typed line mean the answer, in some
// mode where the answer itself is valid?
export function sameCommand(answer, typed) {
  const want = recogniseCommand(answer);
  if (!want.length) return false;
  const got = recogniseCommand(typed);
  return want.some(w => got.some(g => g.kind === w.kind && g.mode === w.mode && g.key === w.key && JSON.stringify(g.args) === JSON.stringify(w.args)));
}
