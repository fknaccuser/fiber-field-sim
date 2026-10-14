// What a Catalyst prints for its switching show commands, laid out the way
// IOS lays them out, so reading them here is practice for reading them on
// the exam.

import { interfaceState, l2Of } from './world.js';
import {
  keyOf, operMode, memberFlag, channelProtocol, formatVlanList, allowedHas, physState, peersOf,
  macOf, isPo, shortName, kindOf, negotiate,
} from './switching.js';
import { formatIp } from './ip4.js';

const pad = (s, n) => (String(s).length >= n ? `${s} ` : String(s).padEnd(n));
const lpad = (s, n) => String(s).padStart(n);
const portSort = (a, b) => rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true });
const rank = (n) => (n.startsWith('Fast') ? 0 : n.startsWith('Gig') ? 1 : n.startsWith('Port') ? 2 : 3);

const RESERVED = [
  [1002, 'fddi-default'], [1003, 'token-ring-default'], [1004, 'fddinet-default'], [1005, 'trnet-default'],
];

// Ports that belong to a VLAN as access ports: not trunking, not folded
// into a bundle.
function accessPortsIn(world, d, v) {
  const dev = world.devices[d];
  const out = [];
  for (const name of dev.ports) {
    const intf = dev.config.interfaces[name];
    const sw = intf.sw;
    if (!sw || sw.channel) continue;
    const m = operMode(world, d, name);
    if (m === 'trunk' || (m === 'down' && sw.mode === 'trunk')) continue;
    if (sw.access === v) out.push(shortName(name));
  }
  for (const name of Object.keys(dev.config.interfaces).filter(isPo)) {
    const po = dev.config.interfaces[name];
    if (po.sw.mode === 'access' && po.sw.access === v) out.push(shortName(name));
  }
  return out;
}

export function showVlanBrief(world, d, full = false) {
  const dev = world.devices[d];
  const out = [
    '',
    'VLAN Name                             Status    Ports',
    '---- -------------------------------- --------- -------------------------------',
  ];
  const ids = Object.keys(dev.config.vlans).map(Number).sort((a, b) => a - b);
  for (const v of ids) {
    const ports = accessPortsIn(world, d, v);
    const rows = [];
    for (let k = 0; k < ports.length; k += 4) rows.push(ports.slice(k, k + 4).join(', ') + (k + 4 < ports.length ? ',' : ''));
    out.push(`${pad(v, 5)}${pad(dev.config.vlans[v].name, 33)}${pad('active', 10)}${rows[0] ?? ''}`);
    for (const r of rows.slice(1)) out.push(`${' '.repeat(48)}${r}`);
  }
  for (const [v, name] of RESERVED) out.push(`${pad(v, 5)}${pad(name, 33)}act/unsup`);
  if (full) {
    out.push('', 'VLAN Type  SAID       MTU   Parent RingNo BridgeNo Stp  BrdgMode Trans1 Trans2',
      '---- ----- ---------- ----- ------ ------ -------- ---- -------- ------ ------');
    for (const v of ids) out.push(`${pad(v, 5)}enet  ${pad(100000 + v, 11)}1500  -      -      -        -    -        0      0`);
  }
  return out.join('\n');
}

const STATUS_WORD = (st) => (st.err ? 'err-disabled' : st.status === 'administratively down' ? 'disabled' : st.up ? 'connected' : 'notconnect');

export function showInterfacesStatus(world, d) {
  const dev = world.devices[d];
  const l2 = l2Of(world);
  const out = ['', `${pad('Port', 10)}${pad('Name', 19)}${pad('Status', 13)}${pad('Vlan', 11)}${pad('Duplex', 7)}${pad('Speed', 6)}Type`];
  const names = [...dev.ports, ...Object.keys(dev.config.interfaces).filter(isPo)].sort(portSort);
  for (const name of names) {
    const intf = dev.config.interfaces[name];
    const st = interfaceState(world, d, name);
    let vlan;
    if (isPo(name)) vlan = intf.sw.mode === 'trunk' ? 'trunk' : intf.sw.access;
    else {
      const L = l2.logicalOf[keyOf(d, name)];
      const m = L && isPo(L.name) ? l2.mode[keyOf(d, L.name)] : operMode(world, d, name);
      vlan = m === 'trunk' ? 'trunk' : intf.sw.access;
    }
    const gig = name.startsWith('Gig');
    const type = isPo(name) ? '' : gig ? '10/100/1000BaseTX' : '10/100BaseTX';
    const word = isPo(name) ? (st.up ? 'connected' : 'notconnect') : STATUS_WORD(st);
    const neg = st.up && !isPo(name) ? negotiate(world, d, name) : null;
    const duplex = !st.up ? (intf.duplex && intf.duplex !== 'auto' ? intf.duplex : 'auto')
      : neg?.ok ? (neg.autoDuplex ? `a-${neg.duplex}` : neg.duplex) : 'a-full';
    const speed = !st.up ? (intf.speed && intf.speed !== 'auto' ? String(intf.speed) : 'auto')
      : neg?.ok ? (neg.autoSpeed ? `a-${neg.speed}` : String(neg.speed)) : (gig || isPo(name) ? 'a-1000' : 'a-100');
    out.push(`${pad(shortName(name), 10)}${pad((intf.description ?? '').slice(0, 18), 19)}${pad(word, 13)}${pad(vlan, 11)}${pad(duplex, 7)}${pad(speed, 6)}${type}`);
  }
  return out.join('\n');
}

const ADMIN_MODE = { trunk: 'on', 'dynamic desirable': 'desirable', 'dynamic auto': 'auto', access: 'off' };

export function showInterfacesTrunk(world, d) {
  const l2 = l2Of(world);
  const trunks = (l2.lp[d] ?? []).filter(L => l2.mode[keyOf(d, L.name)] === 'trunk').sort((a, b) => portSort(a.name, b.name));
  if (!trunks.length) return '';
  const dev = world.devices[d];
  const sw = (L) => l2.sw[keyOf(d, L.name)];
  const out = ['', `${pad('Port', 12)}${pad('Mode', 17)}${pad('Encapsulation', 15)}${pad('Status', 14)}Native vlan`];
  for (const L of trunks) out.push(`${pad(shortName(L.name), 12)}${pad(ADMIN_MODE[sw(L).mode], 17)}${pad('802.1q', 15)}${pad('trunking', 14)}${sw(L).native}`);
  out.push('', `${pad('Port', 12)}Vlans allowed on trunk`);
  for (const L of trunks) out.push(`${pad(shortName(L.name), 12)}${formatVlanList(sw(L).allowed)}`);
  const active = (L) => Object.keys(dev.config.vlans).map(Number).filter(v => allowedHas(sw(L), v)).sort((a, b) => a - b);
  out.push('', `${pad('Port', 12)}Vlans allowed and active in management domain`);
  for (const L of trunks) out.push(`${pad(shortName(L.name), 12)}${formatVlanList(active(L))}`);
  out.push('', `${pad('Port', 12)}Vlans in spanning tree forwarding state and not pruned`);
  for (const L of trunks) out.push(`${pad(shortName(L.name), 12)}${formatVlanList(active(L).filter(v => l2.forwarding(d, L, v)))}`);
  return out.join('\n');
}

export function showSwitchport(world, d, name) {
  const dev = world.devices[d];
  const intf = dev.config.interfaces[name];
  if (!intf?.sw) return `% ${name} is not a switchable port`;
  const sw = intf.sw;
  const m = operMode(world, d, name);
  const oper = m === 'trunk' ? 'trunk' : m === 'access' ? 'static access' : 'down';
  const vname = (v) => `${v} (${dev.config.vlans[v]?.name ?? 'Inactive'})`;
  return [
    `Name: ${shortName(name)}`,
    'Switchport: Enabled',
    `Administrative Mode: ${sw.mode === 'access' ? 'static access' : sw.mode}`,
    `Operational Mode: ${oper}`,
    'Administrative Trunking Encapsulation: dot1q',
    `Operational Trunking Encapsulation: ${m === 'trunk' ? 'dot1q' : 'native'}`,
    `Negotiation of Trunking: ${sw.nonegotiate || sw.mode === 'access' ? 'Off' : 'On'}`,
    `Access Mode VLAN: ${vname(sw.access)}`,
    `Trunking Native Mode VLAN: ${vname(sw.native)}`,
    `Voice VLAN: ${sw.voice ?? 'none'}`,
    `Trunking VLANs Enabled: ${sw.allowed === null ? 'ALL' : formatVlanList(sw.allowed)}`,
    'Pruning VLANs Enabled: 2-1001',
    'Protected: false',
  ].join('\n');
}

export function showInterface(world, d, name) {
  const dev = world.devices[d];
  const intf = dev.config.interfaces[name];
  const st = interfaceState(world, d, name);
  const mac = macOf(world, d, name);
  const head = `${name} is ${st.err ? 'down' : st.status}, line protocol is ${st.protocol}${st.err ? ' (err-disabled)' : st.up ? ' (connected)' : ''}`;
  const hw = name.startsWith('Vlan') ? 'EtherSVI' : name.startsWith('Fast') ? 'Fast Ethernet' : 'Gigabit Ethernet';
  const lines = [head, `  Hardware is ${hw}, address is ${mac} (bia ${mac})`];
  if (intf.description) lines.push(`  Description: ${intf.description}`);
  if (intf.ip !== null) lines.push(`  Internet address is ${formatIp(intf.ip)}/${maskLen(intf.mask)}`);
  lines.push(`  MTU 1500 bytes, BW ${name.startsWith('Fast') ? '100000' : '1000000'} Kbit/sec, DLY 10 usec,`);
  const neg = st.up && !name.startsWith('Vlan') && !name.startsWith('Port') ? negotiate(world, d, name) : null;
  if (!name.startsWith('Vlan') && !name.startsWith('Loop')) {
    const dup = neg?.ok ? `${neg.duplex === 'full' ? 'Full' : 'Half'}-duplex` : st.up ? 'Full-duplex' : 'Auto-duplex';
    const spd = neg?.ok ? `${neg.speed}Mb/s` : st.up ? (name.startsWith('Fast') ? '100Mb/s' : '1000Mb/s') : 'Auto-speed';
    lines.push(`  ${dup}, ${spd}, media type is ${name.startsWith('Fast') ? '10/100BaseTX' : '10/100/1000BaseTX'}`);
  }
  // A duplex mismatch shows on both ends: the full side counts CRC errors
  // and runts from frames cut short, the half side counts late collisions.
  const bad = neg?.ok && neg.mismatch;
  const crc = bad && neg.duplex === 'full' ? 1847 : 0;
  const late = bad && neg.duplex === 'half' ? 932 : 0;
  lines.push(`     ${crc ? 214 : 0} runts, 0 giants, 0 throttles`);
  lines.push(`     ${crc} input errors, ${crc} CRC, 0 frame, 0 overrun, 0 ignored`);
  lines.push(`     ${late ? late + 61 : 0} output errors, ${late ? late + 61 : 0} collisions, 0 interface resets`);
  lines.push(`     ${late} late collision, 0 deferred`);
  return lines.join('\n');
}

const maskLen = (m) => { let n = 0; for (let b = 31; b >= 0 && ((m >>> b) & 1); b -= 1) n += 1; return n; };

export function showMacTable(world, d, dynamicOnly = false) {
  const l2 = l2Of(world);
  const learned = world.learned?.[d] ?? {};
  const rows = [];
  for (const key of Object.keys(learned)) {
    const via = l2.reach[key]?.via?.[d];
    if (!via) continue;
    const [od, oi] = key.split('|');
    for (const [v, port] of Object.entries(via)) rows.push({ v: Number(v), mac: macOf(world, od, oi), port: shortName(port) });
  }
  // Sticky and static secure addresses show as STATIC.
  const dev = world.devices[d];
  for (const name of dev.ports) {
    const sw = dev.config.interfaces[name].sw;
    if (!sw?.psec.on) continue;
    for (const m of sw.psec.macs) {
      if (!rows.some(r => r.mac === m.mac)) rows.push({ v: sw.access, mac: m.mac, port: shortName(name), type: 'STATIC' });
      else rows.find(r => r.mac === m.mac).type = 'STATIC';
    }
  }
  rows.sort((a, b) => a.v - b.v || a.mac.localeCompare(b.mac));
  const out = ['          Mac Address Table', '-------------------------------------------', '', 'Vlan    Mac Address       Type        Ports', '----    -----------       --------    -----'];
  if (!dynamicOnly) {
    for (const mac of ['0100.0ccc.cccc', '0100.0ccc.cccd', '0180.c200.0000']) out.push(` All    ${mac}    STATIC      CPU`);
  }
  const shown = rows.filter(r => !dynamicOnly || r.type !== 'STATIC');
  for (const r of shown) out.push(`${lpad(r.v, 4)}    ${r.mac}    ${pad(r.type ?? 'DYNAMIC', 12)}${r.port}`);
  out.push(`Total Mac Addresses for this criterion: ${shown.length + (dynamicOnly ? 0 : 3)}`);
  return out.join('\n');
}

export function showSpanningTree(world, d, only = null) {
  const l2 = l2Of(world);
  const dev = world.devices[d];
  const inst = l2.stp[d] ?? {};
  const vlans = Object.keys(inst).map(Number).filter(v => only === null || v === only).sort((a, b) => a - b);
  if (!vlans.length) return only === null ? 'No spanning tree instance exists.' : `Spanning tree instance(s) for vlan ${only} does not exist.`;
  const rapid = dev.config.stp.mode === 'rapid-pvst';
  const out = [];
  for (const v of vlans) {
    const s = inst[v];
    const isRoot = s.rootId === d;
    const base = s.bid.prio - v;
    out.push(`VLAN${String(v).padStart(4, '0')}`, `  Spanning tree enabled protocol ${rapid ? 'rstp' : 'ieee'}`,
      `  Root ID    Priority    ${s.root.prio}`, `             Address     ${s.root.mac}`);
    if (isRoot) out.push('             This bridge is the root');
    else out.push(`             Cost        ${s.cost}`, `             Port        ${s.rootPortNum} (${s.rootPort})`);
    out.push('             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec', '',
      `  Bridge ID  Priority    ${s.bid.prio}  (priority ${base} sys-id-ext ${v})`, `             Address     ${s.bid.mac}`,
      '             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec', '             Aging Time  300 sec', '',
      'Interface           Role Sts Cost      Prio.Nbr Type', '------------------- ---- --- --------- -------- --------------------------------');
    const names = Object.keys(s.ports).sort(portSort);
    for (const name of names) {
      const p = s.ports[name];
      const sw = l2.sw[keyOf(d, name)];
      const edge = sw?.portfast || (dev.config.stp.portfastDefault && l2.mode[keyOf(d, name)] === 'access');
      out.push(`${pad(shortName(name), 20)}${pad(p.role, 5)}${pad(p.state, 4)}${pad(p.cost, 10)}${pad(`128.${p.num}`, 9)}P2p${edge ? ' Edge' : ''}`);
    }
    out.push('', '');
  }
  return out.join('\n').replace(/\n+$/, '');
}

export function showEtherchannelSummary(world, d) {
  const dev = world.devices[d];
  const groups = new Map();
  for (const name of dev.ports) {
    const ch = dev.config.interfaces[name].sw?.channel;
    if (!ch) continue;
    if (!groups.has(ch.group)) groups.set(ch.group, []);
    groups.get(ch.group).push(name);
  }
  const out = [
    'Flags:  D - down        P - bundled in port-channel', '        I - stand-alone s - suspended', '        H - Hot-standby (LACP only)',
    '        R - Layer3      S - Layer2', '        U - in use      f - failed to allocate aggregator', '',
    '        M - not in use, minimum links not met', '        u - unsuitable for bundling', '        w - waiting to be aggregated',
    '        d - default port', '', '',
    `Number of channel-groups in use: ${groups.size}`, `Number of aggregators:           ${groups.size}`, '',
    'Group  Port-channel  Protocol    Ports', '------+-------------+-----------+-----------------------------------------------',
  ];
  for (const [g, members] of [...groups].sort((a, b) => a[0] - b[0])) {
    const flags = members.map(m => memberFlag(world, d, m));
    const inUse = flags.includes('P');
    const mode = dev.config.interfaces[members[0]].sw.channel.mode;
    out.push(`${pad(g, 7)}${pad(`Po${g}(S${inUse ? 'U' : 'D'})`, 16)}${pad(channelProtocol(mode), 10)}${members.map((m, k) => `${shortName(m)}(${flags[k]})`).join('    ')}`);
  }
  return out.join('\n');
}

const ACTION = { shutdown: 'Shutdown', restrict: 'Restrict', protect: 'Protect' };

export function showPortSecurity(world, d) {
  const dev = world.devices[d];
  const l2 = l2Of(world);
  const out = ['Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action', '                (Count)       (Count)          (Count)',
    '---------------------------------------------------------------------------'];
  for (const name of dev.ports) {
    const sw = dev.config.interfaces[name].sw;
    if (!sw?.psec.on) continue;
    const cur = l2.psec[keyOf(d, name)]?.allowed.length ?? sw.psec.macs.length;
    out.push(`${lpad(shortName(name), 11)}${lpad(sw.psec.max, 15)}${lpad(cur, 13)}${lpad(dev.psecCount?.[name] ?? 0, 19)}${lpad(ACTION[sw.psec.violation], 18)}`);
  }
  out.push('---------------------------------------------------------------------------',
    'Total Addresses in System (excluding one mac per port)     : 0', 'Max Addresses limit in System (excluding one mac per port) : 8192');
  return out.join('\n');
}

export function showPortSecurityInterface(world, d, name) {
  const dev = world.devices[d];
  const sw = dev.config.interfaces[name]?.sw;
  if (!sw) return '% Invalid interface';
  const l2 = l2Of(world);
  const st = interfaceState(world, d, name);
  const ps = l2.psec[keyOf(d, name)];
  const status = !sw.psec.on ? 'Secure-down' : st.err === 'psecure-violation' ? 'Secure-shutdown' : st.up ? 'Secure-up' : 'Secure-down';
  const sticky = sw.psec.macs.filter(m => m.sticky).length;
  const last = ps?.offenders?.[0] ?? ps?.seen?.[0] ?? '0000.0000.0000';
  return [
    `Port Security              : ${sw.psec.on ? 'Enabled' : 'Disabled'}`,
    `Port Status                : ${status}`,
    `Violation Mode             : ${ACTION[sw.psec.violation]}`,
    'Aging Time                 : 0 mins',
    'Aging Type                 : Absolute',
    'SecureStatic Address Aging : Disabled',
    `Maximum MAC Addresses      : ${sw.psec.max}`,
    `Total MAC Addresses        : ${ps?.allowed.length ?? sw.psec.macs.length}`,
    `Configured MAC Addresses   : ${sw.psec.macs.length - sticky}`,
    `Sticky MAC Addresses       : ${sticky}`,
    `Last Source Address:Vlan   : ${last}:${sw.access}`,
    `Security Violation Count   : ${dev.psecCount?.[name] ?? 0}`,
  ].join('\n');
}

// ---------- neighbor discovery ----------

const PLATFORM = { router: 'CISCO2911', switch: 'WS-C2960-' };
const CAPS = { router: 'R B S I', switch: 'S I' };

function discoveryNeighbors(world, d, proto) {
  const dev = world.devices[d];
  const on = (x) => (proto === 'cdp' ? x.config.cdp !== false : x.config.lldp === true);
  if (!on(dev)) return null;
  const out = [];
  const names = (dev.ports ?? Object.keys(dev.config.interfaces)).filter(n => !n.startsWith('Loopback'));
  for (const name of names) {
    const intf = dev.config.interfaces[name];
    if (!intf || (proto === 'cdp' && intf.cdp === false) || !physState(world, d, name).up) continue;
    for (const [od, oi] of peersOf(world, d, name)) {
      const odev = world.devices[od];
      const kind = kindOf(world, od);
      if (kind === 'pc' || !on(odev)) continue;
      if (proto === 'cdp' && odev.config.interfaces[oi]?.cdp === false) continue;
      out.push({ local: name, id: odev.config.hostname, port: oi, kind, dev: odev });
    }
  }
  return out;
}

export function showCdpNeighbors(world, d) {
  const list = discoveryNeighbors(world, d, 'cdp');
  if (list === null) return '% CDP is not enabled';
  const out = ['Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge',
    '                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone,', '                  D - Remote, C - CVTA, M - Two-port Mac Relay', '',
    'Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID'];
  list.sort((a, b) => a.id.localeCompare(b.id));
  for (const n of list) out.push(`${pad(n.id, 17)}${pad(cdpIf(n.local), 18)}${pad(lpad(160 + (n.id.length % 9), 6), 11)}${pad(lpad(CAPS[n.kind], 10), 12)}${pad(PLATFORM[n.kind], 10)}${cdpIf(n.port)}`);
  out.push('', `Total cdp entries displayed : ${list.length}`);
  return out.join('\n');
}

export function showCdpDetail(world, d) {
  const list = discoveryNeighbors(world, d, 'cdp');
  if (list === null) return '% CDP is not enabled';
  const out = [];
  for (const n of list) {
    const addr = Object.values(n.dev.config.interfaces).find(i => i.ip !== null && (n.kind === 'switch' ? i.name.startsWith('Vlan') : i.name === n.port))?.ip;
    out.push('-------------------------', `Device ID: ${n.id}`, 'Entry address(es): ');
    if (addr !== undefined) out.push(`  IP address: ${formatIp(addr)}`);
    out.push(`Platform: cisco ${n.kind === 'router' ? 'CISCO2911/K9' : 'WS-C2960-24TT-L'},  Capabilities: ${n.kind === 'router' ? 'Router Switch IGMP' : 'Switch IGMP'}`,
      `Interface: ${n.local},  Port ID (outgoing port): ${n.port}`, 'Holdtime : 163 sec', '', 'Version :',
      n.kind === 'router' ? 'Cisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.7(3)M3' : 'Cisco IOS Software, C2960 Software (C2960-LANBASEK9-M), Version 15.0(2)SE11', '');
  }
  out.push(`Total cdp entries displayed : ${list.length}`);
  return out.join('\n');
}

export function showLldpNeighbors(world, d) {
  const list = discoveryNeighbors(world, d, 'lldp');
  if (list === null) return '% LLDP is not enabled';
  const out = ['Capability codes:', '    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device', '    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other', '',
    'Device ID           Local Intf     Hold-time  Capability      Port ID'];
  for (const n of list) out.push(`${pad(n.id, 20)}${pad(shortName(n.local), 15)}${pad('120', 11)}${pad(n.kind === 'router' ? 'R' : 'B', 16)}${shortName(n.port)}`);
  out.push('', `Total entries displayed: ${list.length}`);
  return out.join('\n');
}

const cdpIf = (name) => name.replace('GigabitEthernet', 'Gig ').replace('FastEthernet', 'Fas ').replace('Port-channel', 'Po');

// "show ip route" on a switch that is not routing: just its gateway.
export function showHostRoute(world, d) {
  const gw = world.devices[d].config.defaultGateway;
  return `Default gateway is ${gw !== null && gw !== undefined ? formatIp(gw) : 'not set'}\n\nHost               Gateway           Last Use    Total Uses  Interface\nICMP redirect cache is empty`;
}

