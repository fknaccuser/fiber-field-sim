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
  interfaceState, routingTable, neighbors, ospfEnabled, ospfRole, ospfCost, ping as pingWorld,
  refresh, clearOspf, save, unsaved, reload, makeInterface,
} from './world.js';
import { parseIp, formatIp, maskToLen, lenToMask, network, isIp, isMask, classfulLen } from './ip4.js';

// ---------- interface names ----------

const IF_TYPES = [
  { full: 'GigabitEthernet', short: 'Gi', re: /^g(i(g(a(b(i(t(e(t(h(e(r(n(e(t)?)?)?)?)?)?)?)?)?)?)?)?)?)?$/i },
  { full: 'Loopback', short: 'Lo', re: /^l(o(o(p(b(a(c(k)?)?)?)?)?)?)?$/i },
];

// Accepts "g0/0", "gi 0/0", "GigabitEthernet0/0", "lo0", "loopback 0".
function readInterface(tokens, i) {
  const one = tokens[i]?.text ?? '';
  const m = /^([a-z]+)([\d/]*)$/i.exec(one);
  if (!m) return null;
  const type = IF_TYPES.find(t => t.re.test(m[1]));
  if (!type) return null;
  let num = m[2];
  let used = 1;
  if (!num && tokens[i + 1] && /^[\d/]+$/.test(tokens[i + 1].text)) { num = tokens[i + 1].text; used = 2; }
  if (!num) return null;
  if (type.full === 'Loopback' ? !/^\d+$/.test(num) : !/^\d+\/\d+$/.test(num)) return null;
  return { name: `${type.full}${num}`, used };
}

export const shortIf = (name) => name.replace('GigabitEthernet', 'Gi').replace('Loopback', 'Lo');

// ---------- grammar ----------

const ARG = {
  ip: { check: isIp, help: 'A.B.C.D' },
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

export function runningConfig(dev) {
  const c = dev.config;
  const L = ['!', `hostname ${c.hostname}`, '!'];
  if (c.enableSecret) L.push(`enable secret 9 ${fakeHash(c.enableSecret)}`);
  if (c.enablePassword) L.push(c.servicePasswordEncryption ? `enable password 7 ${fakeHash(c.enablePassword).slice(3, 15)}` : `enable password ${c.enablePassword}`);
  if (c.enableSecret || c.enablePassword) L.push('!');
  for (const [name, u] of Object.entries(c.users)) L.push(`username ${name}${u.privilege ? ` privilege ${u.privilege}` : ''} ${u.secret ? `secret 9 ${fakeHash(u.secret)}` : `password ${u.password}`}`);
  if (Object.keys(c.users).length) L.push('!');
  if (c.domain) L.push(`ip domain name ${c.domain}`, '!');
  if (c.servicePasswordEncryption) L.push('service password-encryption', '!');
  const names = Object.keys(c.interfaces).sort((a, b) => (a.startsWith('Loopback') ? -1 : 0) - (b.startsWith('Loopback') ? -1 : 0) || a.localeCompare(b, undefined, { numeric: true }));
  for (const n of names) {
    const i = c.interfaces[n];
    L.push(`interface ${n}`);
    if (i.description) L.push(` description ${i.description}`);
    L.push(i.ip !== null ? ` ip address ${formatIp(i.ip)} ${formatIp(i.mask)}` : ' no ip address');
    if (i.ospf.networkType) L.push(` ip ospf network ${i.ospf.networkType}`);
    if (i.ospf.priority !== 1) L.push(` ip ospf priority ${i.ospf.priority}`);
    if (i.ospf.cost !== null) L.push(` ip ospf cost ${i.ospf.cost}`);
    if (i.ospf.pid !== null) L.push(` ip ospf ${i.ospf.pid} area ${i.ospf.area}`);
    if (i.shutdown) L.push(' shutdown');
    L.push('!');
  }
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
  if (c.banner) L.push(`banner motd ^C${c.banner}^C`, '!');
  for (const [key, label] of [['con', 'line con 0'], ['vty', 'line vty 0 4']]) {
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
  const names = Object.keys(dev.config.interfaces).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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
    : { text: `${head}\n.....\nSuccess rate is 0 percent (0/5)`, ok: false, src };
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

const SHOW = [
  cmd(['show', 'ip', 'route', ALT('filter', ['connected', 'static', 'ospf'], { opt: true })], ({ filter }, s) => ({ out: showIpRoute(s.world, s.deviceId, filter ?? null) }), { key: 'show ip route' }),
  cmd(['show', 'ip', 'interface', 'brief'], (_, s) => ({ out: showIpIntBrief(s.world, s.deviceId) }), { key: 'show ip interface brief' }),
  cmd(['show', 'ip', 'ospf', 'neighbor'], (_, s) => ({ out: showOspfNeighbor(s.world, s.deviceId) }), { key: 'show ip ospf neighbor' }),
  cmd(['show', 'ip', 'ospf', 'interface', 'brief'], (_, s) => ({ out: showOspfIntBrief(s.world, s.deviceId) }), { key: 'show ip ospf interface brief' }),
  cmd(['show', 'ip', 'protocols'], (_, s) => ({ out: showIpProtocols(s.world, s.deviceId) }), { key: 'show ip protocols' }),
  cmd(['show', 'ip', 'ssh'], (_, s) => ({ out: showIpSsh(s.dev) }), { key: 'show ip ssh' }),
];

const PRIV_ONLY = [
  cmd(['show', 'running-config'], (_, s) => ({ out: runningConfig(s.dev) }), { key: 'show running-config' }),
  cmd(['show', 'startup-config'], (_, s) => ({ out: s.dev.startup ? runningConfig({ config: s.dev.startup }).replace('Building configuration...\n\nCurrent configuration', 'Using') : 'startup-config is not present' }), { key: 'show startup-config' }),
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
      return `\nSystem Bootstrap, Version 15.1(4)M, RELEASE SOFTWARE (fc1)\n...\nPress RETURN to get started!\n\n${s.dev.startup ? '' : '\n         --- System Configuration Dialog ---\n(skipped: lab routers start without setup mode)\n'}`;
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
  cmd(['clear', 'ip', 'ospf', 'process'], (_, s) => ({ out: '', ask: { prompt: 'Reset ALL OSPF processes? [no]: ', answer: (a) => {
    if (!a || !'yes'.startsWith(a.toLowerCase())) return '';
    clearOspf(s.world, s.deviceId);
    s.events.push({ kind: 'clear-ospf' });
    return '';
  } } }), { key: 'clear ip ospf process' }),
  cmd(['disable'], (_, s) => { s.mode = 'user'; return { out: '' }; }),
  cmd(['terminal', 'length', W('n', 'num')], () => ({ out: '' })),
];

const USER = [
  cmd(['enable'], (_, s) => {
    const c = s.dev.config;
    if (!c.enableSecret && !c.enablePassword) { s.mode = 'exec'; return { out: '' }; }
    return { out: '', ask: { prompt: 'Password: ', secret: true, answer: (a) => {
      if (a === (c.enableSecret ?? c.enablePassword)) { s.mode = 'exec'; return ''; }
      return '% Bad secrets';
    } } };
  }, { key: 'enable' }),
  cmd([ALT('how', ['exit', 'logout'])], (_, s) => { s.mode = 'user'; return { out: `\n${s.dev.config.hostname} con0 is now available\n\nPress RETURN to get started.` }; }),
  PING,
  ...SHOW,
];

const EXEC = [
  ...PRIV_ONLY,
  cmd([ALT('how', ['exit', 'logout'])], (_, s) => { s.mode = 'user'; return { out: `\n${s.dev.config.hostname} con0 is now available\n\nPress RETURN to get started.` }; }),
  PING,
  ...SHOW,
];

function invalidAt(s, col) {
  return `${' '.repeat(s.promptLength + Math.max(0, col))}^\n% Invalid input detected at '^' marker.`;
}

const END = cmd(['end'], (_, s) => { s.mode = 'exec'; s.ctx = {}; return { out: '' }; });

const GLOBAL = [
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
    if (!c.interfaces[name]) {
      if (!name.startsWith('Loopback')) return { out: invalidAt(s, s.line.search(/\S+\s*$/)) };
      c.interfaces[name] = makeInterface(name);
      s.notices.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${name}, changed state to up`);
    }
    s.mode = 'if';
    s.ctx = { intf: name };
    return { out: '' };
  }, { key: 'interface' }),
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
  cmd(['ip', ALT('kw', ['domain-name']), W('name', 'word')], ({ name }, s) => { s.dev.config.domain = name; return { out: '' }; }, { key: 'ip domain name', no: (_, s) => { s.dev.config.domain = null; }, noShape: ['ip', 'domain-name', W('name', 'word', { opt: true })] }),
  cmd(['ip', 'domain', 'name', W('name', 'word')], ({ name }, s) => { s.dev.config.domain = name; return { out: '' }; }, { key: 'ip domain name', no: (_, s) => { s.dev.config.domain = null; }, noShape: ['ip', 'domain', 'name', W('name', 'word', { opt: true })] }),
  cmd(['ip', 'ssh', 'version', W('v', 'num')], ({ v }, s) => {
    if (v !== 1 && v !== 2) return { out: invalidAt(s, s.line.search(/\S+\s*$/)) };
    s.dev.config.sshVersion = v;
    return { out: '' };
  }, { key: 'ip ssh version', no: (_, s) => { s.dev.config.sshVersion = null; }, noShape: ['ip', 'ssh', 'version'] }),
  cmd(['crypto', 'key', 'generate', 'rsa', ALT('gk', ['general-keys'], { opt: true }), ALT('m', ['modulus'], { opt: true }), W('bits', 'num', { opt: true })], ({ bits }, s) => {
    const c = s.dev.config;
    if (c.hostname === 'Router') return { out: '% Please define a hostname other than Router.' };
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
  END,
  cmd(['exit'], (_, s) => { s.mode = 'exec'; return { out: '' }; }),
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

const IFACE = [
  cmd(['ip', 'address', W('ip', 'ip'), W('mask', 'mask')], ({ ip, mask }, s) => {
    const c = s.dev.config;
    const intf = c.interfaces[s.ctx.intf];
    const a = parseIp(ip), len = maskToLen(mask);
    if (len < 31 && (a === network(a, len) || a === (network(a, len) | (~lenToMask(len) >>> 0)) >>> 0)) return { out: `Bad mask /${len} for address ${ip}` };
    const clash = Object.values(c.interfaces).find(o => o.name !== intf.name && o.ip !== null && network(o.ip, Math.min(len, maskToLen(o.mask))) === network(a, Math.min(len, maskToLen(o.mask))));
    if (clash) return { out: `% ${formatIp(network(a, len))} overlaps with ${clash.name}` };
    intf.ip = a; intf.mask = parseIp(mask);
    return { out: '' };
  }, { key: 'ip address', no: (_, s) => { const i = s.dev.config.interfaces[s.ctx.intf]; i.ip = null; i.mask = null; }, noShape: ['ip', 'address', W('ip', 'ip', { opt: true }), W('mask', 'mask', { opt: true })] }),
  cmd(['shutdown'], (_, s) => { s.dev.config.interfaces[s.ctx.intf].shutdown = true; return { out: '' }; }, { key: 'shutdown', no: (_, s) => { s.dev.config.interfaces[s.ctx.intf].shutdown = false; } }),
  cmd(['description', W('text', 'rest')], ({ text }, s) => { s.dev.config.interfaces[s.ctx.intf].description = text; return { out: '' }; }, { key: 'description', no: (_, s) => { s.dev.config.interfaces[s.ctx.intf].description = null; }, noShape: ['description', W('text', 'rest', { opt: true })] }),
  cmd(['ip', 'ospf', 'priority', W('n', 'num')], ({ n }, s) => {
    if (n > 255) return { out: invalidAt(s, s.line.search(/\S+\s*$/)) };
    s.dev.config.interfaces[s.ctx.intf].ospf.priority = n;
    return { out: '' };
  }, { key: 'ip ospf priority', no: (_, s) => { s.dev.config.interfaces[s.ctx.intf].ospf.priority = 1; }, noShape: ['ip', 'ospf', 'priority', W('n', 'num', { opt: true })] }),
  cmd(['ip', 'ospf', 'cost', W('n', 'num')], ({ n }, s) => { s.dev.config.interfaces[s.ctx.intf].ospf.cost = n; return { out: '' }; }, { key: 'ip ospf cost', no: (_, s) => { s.dev.config.interfaces[s.ctx.intf].ospf.cost = null; }, noShape: ['ip', 'ospf', 'cost', W('n', 'num', { opt: true })] }),
  cmd(['ip', 'ospf', 'network', ALT('type', ['point-to-point', 'broadcast'])], ({ type }, s) => { s.dev.config.interfaces[s.ctx.intf].ospf.networkType = type; return { out: '' }; }, { key: 'ip ospf network', no: (_, s) => { s.dev.config.interfaces[s.ctx.intf].ospf.networkType = null; }, noShape: ['ip', 'ospf', 'network', ALT('type', ['point-to-point', 'broadcast'], { opt: true })] }),
  cmd(['ip', 'ospf', W('pid', 'num'), 'area', W('area', 'num')], ({ pid, area }, s) => {
    const o = s.dev.config.interfaces[s.ctx.intf].ospf;
    o.pid = pid; o.area = area;
    if (!s.dev.config.ospf) s.dev.config.ospf = { pid, routerId: null, networks: [], passive: [] };
    return { out: '' };
  }, { key: 'ip ospf area', no: (_, s) => { const o = s.dev.config.interfaces[s.ctx.intf].ospf; o.pid = null; o.area = null; }, noShape: ['ip', 'ospf', W('pid', 'num'), 'area', W('area', 'num', { opt: true })] }),
  END,
  cmd(['exit'], (_, s) => { s.mode = 'config'; s.ctx = {}; return { out: '' }; }),
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
  cmd(['exit'], (_, s) => { s.mode = 'config'; s.ctx = {}; return { out: '' }; }),
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
  cmd(['exit'], (_, s) => { s.mode = 'config'; s.ctx = {}; return { out: '' }; }),
];

const MODES = {
  user: { specs: USER, prompt: (h) => `${h}>` },
  exec: { specs: EXEC, prompt: (h) => `${h}#` },
  config: { specs: GLOBAL, prompt: (h) => `${h}(config)#` },
  if: { specs: IFACE, prompt: (h) => `${h}(config-if)#` },
  router: { specs: ROUTER, prompt: (h) => `${h}(config-router)#` },
  line: { specs: LINE, prompt: (h) => `${h}(config-line)#` },
};

const isConfigMode = (mode) => ['config', 'if', 'router', 'line'].includes(mode);

// The "no" form of each command that has one, as its own grammar.
function noSpecs(specs) {
  return specs.filter(s => s.no).map(s => ({ words: ['no', ...(s.noShape ?? s.words)], run: (args, sess) => { s.no(args, sess); return { out: '' }; }, key: `no ${s.key}` }));
}

function specsFor(mode) {
  const base = MODES[mode].specs;
  return isConfigMode(mode) ? [...base, ...noSpecs(base)] : base;
}

// ---------- sessions ----------

export function createSession(world, deviceId) {
  const events = [];
  const push = events.push.bind(events);
  events.push = (...items) => push(...items.map(e => ({ ...e, seq: (world.seq = (world.seq ?? 0) + 1), device: deviceId })));
  return { world, deviceId, mode: 'user', ctx: {}, pending: null, history: [], events, notices: [], line: '', promptLength: 0 };
}

export function prompt(session) {
  if (session.pending) return session.pending.prompt;
  const dev = session.world.devices[session.deviceId];
  return MODES[session.mode].prompt(dev.config.hostname);
}

// What the console prints for each device when its own state changes.
function snapshot(world, deviceId) {
  const dev = world.devices[deviceId];
  const ifs = Object.fromEntries(Object.keys(dev.config.interfaces).map(n => [n, interfaceState(world, deviceId, n)]));
  const nbrs = Object.fromEntries(neighbors(world, deviceId).map(n => [`${n.rid}|${n.intf}`, n.state]));
  return { ifs, nbrs };
}

function diffNotices(before, after) {
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
    if (state === 'FULL') out.push(`%OSPF-5-ADJCHG: Process 1, Nbr ${formatIp(Number(rid))} on ${intf} from LOADING to FULL, Loading Done`);
  }
  for (const k of Object.keys(before.nbrs)) {
    if (after.nbrs[k]) continue;
    const [rid, intf] = k.split('|');
    out.push(`%OSPF-5-ADJCHG: Process 1, Nbr ${formatIp(Number(rid))} on ${intf} from FULL to DOWN, Neighbor Down: Interface down or detached`);
  }
  return out;
}

function runOne(session, specs, tokens) {
  const p = parse(specs, tokens);
  if (p.error) return p;
  const result = p.spec.run(p.args, session) ?? { out: '' };
  session.events.push({ kind: 'command', key: p.spec.key ?? null, mode: session.mode, intf: session.ctx?.intf ?? null });
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
    const notices = [...session.notices, ...diffNotices(before, after)];
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
  if (pipe && /^(do\s+)?sh/i.test(pipe[1])) {
    const kind = ['include', 'exclude', 'begin', 'section'].find(k => k.startsWith(pipe[2].toLowerCase()));
    if (!kind) return invalidAt(session, line.indexOf(pipe[2]));
    session.line = pipe[1];
    const text = execute(session, pipe[1]);
    session.history.pop();
    return filterOutput(text, kind, pipe[3]);
  }

  const tokens = tokenize(line);
  const specs = specsFor(session.mode);

  // "do" runs an EXEC command from any configuration mode.
  if (isConfigMode(session.mode) && tokens[0].text.toLowerCase() === 'do' && tokens.length > 1) {
    const saved = session.mode;
    session.mode = 'exec';
    const r = runOne(session, EXEC, tokens.slice(1));
    session.mode = saved;
    if (r.error) return finish(errorText(session, r, tokens.slice(1)));
    const text = r.result.out;
    if (r.result.ask) session.pending = r.result.ask;
    return finish(text);
  }

  let r = runOne(session, specs, tokens);
  // A sub-mode falls back to global configuration, leaving the sub-mode.
  if (r.error && ['if', 'router', 'line'].includes(session.mode)) {
    const saved = { mode: session.mode, ctx: session.ctx };
    session.mode = 'config';
    const g = runOne(session, specsFor('config'), tokens);
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
  let specs = specsFor(session.mode);
  if (isConfigMode(session.mode) && tokens[0]?.text.toLowerCase() === 'do') { specs = EXEC; tokens = tokens.slice(1); }
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
  let specs = specsFor(session.mode);
  if (isConfigMode(session.mode) && tokens[0]?.text.toLowerCase() === 'do' && tokens.length > 1) { specs = EXEC; tokens = tokens.slice(1); }
  const last = tokens.pop();
  const { words } = nextChoices(specs, tokens);
  const hits = words.filter(w => /^[a-z]/.test(w) && w.toLowerCase().startsWith(last.text.toLowerCase()));
  if (hits.length !== 1) return line;
  return `${line.slice(0, line.length - last.text.length)}${hits[0]} `;
}
