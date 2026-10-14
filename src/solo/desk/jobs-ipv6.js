// IPv6 work for the Field desk: a dual-stack build at a branch that runs
// IPv4 today, and trouble tickets on a branch already running IPv6.
// Same shape as jobs-router.js and jobs-repair.js.

import { rngOf, int, pick } from '../study/gen/kit.js';
import { exchange } from '../labs/world.js';
import { macFrom, OUI } from '../labs/switching.js';
import { parseIp } from '../labs/ip4.js';
import { parse6, format6, eui64, net6 } from '../labs/ip6.js';
import { v6Of, ping6 } from '../labs/v6.js';
import { cloneWorld } from './grade.js';

const NIC = 'FastEthernet0';
const M24 = '255.255.255.0';
const G0 = 'GigabitEthernet0/0';
const G1 = 'GigabitEthernet0/1';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const ifRe = (...names) => new RegExp(`^interface (${names.map(esc).join('|')})\\|`);
const globalRe = (prefix) => new RegExp(`^global\\|${esc(prefix)}`);
const PC_LINES = /^pc\|/;
const cfg = (w, d) => w.devices[d].config;
const v6conf = (w, d, n) => cfg(w, d).interfaces[n]?.v6 ?? null;
const canon = (t) => format6(parse6(t));
const hasAddr = (w, d, n, addr, len = 64) => (v6conf(w, d, n)?.addrs ?? []).some(x => x.addr === canon(addr) && x.len === len);
const hasEui = (w, d, n, pfx) => (v6conf(w, d, n)?.addrs ?? []).some(x => x.eui && x.len === 64 && x.addr === canon(`${pfx}::`));
const reach6 = (w, d, dst) => ping6(w, d, parse6(dst)).ok;
const pcHas6 = (w, d, prefix) => v6Of(w, d, NIC).addrs.some(x => net6(x.addr, 64) === parse6(`${prefix}::`));
const defaultVia = (w, d, nh) => (cfg(w, d).ipv6?.statics ?? []).some(s => s.net === '::' && s.len === 0 && s.nh === canon(nh));

let linkSeq = 0;
const L = (a, ai, b, bi) => ({ id: `v${linkSeq += 1}`, ends: [[a, ai], [b, bi]] });

const SITES = ['Harbor Clinic', 'Elm Street Branch', 'Northgate Office', 'Mesa Warehouse', 'Riverside Annex', 'Pine Ridge School', 'Lakeview Dental', 'Canyon Library', 'Bayside Depot', 'Cedar Hall'];
const REQUESTERS = ['IT Service Desk', 'Network Operations', 'Branch Manager', 'Project Lead'];
const CALLERS = ['the front desk', 'the office manager', 'the help desk', 'the network monitoring team', 'a developer testing the new app'];
const ROUTERS = ['BR-RTR', 'R1', 'EDGE1', 'SITE-RTR'];
const hex = (n) => n.toString(16);

// The addressing plan: a /48 from the provider, a /64 for the LAN, one for
// the uplink, and the provider's web server.
function plan(rnd) {
  const site = `2001:db8:${hex(int(rnd, 0x1000, 0xfffe))}`;
  const lanId = pick(rnd, ['10', '20', '30', 'a', 'b0', '100']);
  const wanId = pick(rnd, ['f', 'ff', '99', 'fe']);
  const rtr = pick(rnd, ROUTERS);
  const v4 = `10.${int(rnd, 1, 250)}.${int(rnd, 0, 250)}`;
  return {
    rtr, site, lan: `${site}:${lanId}`, wan: `${site}:${wanId}`,
    web: '2001:db8:cafe::80', webNet: '2001:db8:cafe',
    pc2: `${site}:${lanId}::${hex(int(rnd, 0x10, 0xfe))}`,
    v4, gw4: `${v4}.1`,
  };
}

function devicesOf(n) {
  return {
    devices: [
      { id: n.rtr, kind: 'router', x: 50, y: 12 }, { id: 'ISP', kind: 'router', x: 86, y: 12 },
      { id: 'WEB', kind: 'pc', x: 88, y: 40, pc: { v6: { addrs: [{ addr: n.web, len: 64 }], gw: `${n.webNet}::1` } } },
      { id: 'SW1', kind: 'switch', x: 40, y: 36 },
      { id: 'PC1', kind: 'pc', x: 22, y: 62, pc: { ip: `${n.v4}.21`, mask: M24, gateway: n.gw4 } },
      { id: 'PC2', kind: 'pc', x: 58, y: 62, pc: { ip: `${n.v4}.22`, mask: M24, gateway: n.gw4 } },
    ],
    links: [L(n.rtr, G0, 'SW1', 'GigabitEthernet0/1'), L(n.rtr, G1, 'ISP', G0), L('ISP', G1, 'WEB', NIC),
      L('PC1', NIC, 'SW1', 'FastEthernet0/1'), L('PC2', NIC, 'SW1', 'FastEthernet0/2')],
  };
}

const ispSetup = (n, rtrWan) => ['hostname ISP', 'ipv6 unicast-routing', 'interface g0/0', `ipv6 address ${n.wan}::2/64`, 'no shutdown',
  'interface g0/1', `ipv6 address ${n.webNet}::1/64`, 'no shutdown', 'exit', `ipv6 route ${n.site}::/48 ${rtrWan}`];

const v4Tests = (n) => [{ id: 'v4', text: 'IPv4 still works: PC1 reaches its gateway', check: (w) => exchange(cloneWorld(w), 'PC1', parseIp(n.gw4), {}).ok }];

// ------------------------------------------------------------ the build
const BUILD = {
  kind: 'build-ipv6',
  title: 'Add IPv6 to a branch',
  minutes: 12,
  lights: ['t1-ipv6', 't3-static'],
  make(seed) {
    const rnd = rngOf(seed);
    const n = plan(rnd);
    const f = { number: `CHG${int(rnd, 10000, 99999)}`, site: pick(rnd, SITES), requester: pick(rnd, REQUESTERS), priority: pick(rnd, ['P3', 'P3', 'P4']), kind: this.kind };
    const ll = rnd() < 0.5;
    const eui = rnd() < 0.4;
    const r = n.rtr;
    const rtrWan = eui ? format6(parse6(`${n.wan}::`) | eui64(macFrom(`${r}|${G1}`, OUI.router))) : `${n.wan}::1`;
    const gw = ll ? 'fe80::1' : `${n.lan}::1`;
    const { devices, links } = devicesOf(n);
    const setup = {
      SW1: ['hostname SW1'],
      [r]: [`hostname ${r}`, 'interface g0/0', `ip address ${n.gw4} ${M24}`, 'no shutdown', 'interface g0/1', 'ip address 203.0.113.2 255.255.255.252', 'no shutdown'],
      ISP: ispSetup(n, rtrWan),
    };
    const reqs = [
      { id: 'routing', text: `Turn on IPv6 routing on ${r}`, device: r, check: (w) => Boolean(cfg(w, r).ipv6?.routing), owns: { [r]: [globalRe('ipv6 unicast-routing')] },
        hint: 'IOS ships with IPv6 routing off. ipv6 unicast-routing, in global configuration, turns on forwarding and router advertisements.', show: { [r]: ['enable', 'configure terminal', 'ipv6 unicast-routing'] } },
      { id: 'lan', text: `Address the LAN: ${n.lan}::1/64 on Gi0/0`, device: r, check: (w) => hasAddr(w, r, G0, `${n.lan}::1`), owns: { [r]: [ifRe(G0)] },
        hint: 'ipv6 address with a /length, on the interface. It sits alongside the IPv4 address; nothing replaces it.', show: { [r]: ['interface g0/0', `ipv6 address ${n.lan}::1/64`] } },
    ];
    if (ll) {
      reqs.push({ id: 'll', text: 'Set the LAN link-local address to FE80::1 (the site standard for gateways)', device: r, check: (w) => v6conf(w, r, G0)?.ll === 'fe80::1', owns: { [r]: [ifRe(G0)] },
        hint: 'ipv6 address FE80::1 link-local, on Gi0/0.', show: { [r]: ['interface g0/0', 'ipv6 address fe80::1 link-local'] } });
    }
    reqs.push(eui
      ? { id: 'wan', text: `Address the uplink from ${n.wan}::/64 with EUI-64`, device: r, check: (w) => hasEui(w, r, G1, n.wan), owns: { [r]: [ifRe(G1)] },
        hint: 'ipv6 address PREFIX::/64 eui-64 builds the host half from the interface MAC. show ipv6 interface brief shows the result.', show: { [r]: ['interface g0/1', `ipv6 address ${n.wan}::/64 eui-64`] } }
      : { id: 'wan', text: `Address the uplink: ${n.wan}::1/64 on Gi0/1`, device: r, check: (w) => hasAddr(w, r, G1, `${n.wan}::1`), owns: { [r]: [ifRe(G1)] },
        hint: 'Same command as the LAN, on Gi0/1. The provider is ::2.', show: { [r]: ['interface g0/1', `ipv6 address ${n.wan}::1/64`] } });
    reqs.push(
      { id: 'default', text: `Default route to the provider at ${n.wan}::2`, device: r, check: (w) => defaultVia(w, r, `${n.wan}::2`), owns: { [r]: [globalRe('ipv6 route ::/0')] },
        hint: 'ipv6 route ::/0 NEXT-HOP. ::/0 is IPv6\'s "everything".', show: { [r]: ['exit', `ipv6 route ::/0 ${n.wan}::2`] } },
      { id: 'slaac', text: 'PC1 configures itself by SLAAC', device: 'PC1', check: (w) => Boolean(cfg(w, 'PC1').v6?.auto) && pcHas6(w, 'PC1', n.lan), owns: { PC1: [PC_LINES] },
        hint: 'ipv6config auto on PC1. It needs a router advertisement, so the router side comes first.', show: { PC1: ['ipv6config auto'] } },
      { id: 'static', text: `PC2 gets the fixed address ${n.pc2}/64, gateway ${ll ? 'FE80::1' : `${n.lan}::1`}`, device: 'PC2',
        check: (w) => (cfg(w, 'PC2').v6?.addrs ?? []).some(x => x.addr === canon(n.pc2) && x.len === 64) && cfg(w, 'PC2').v6?.gw === canon(gw), owns: { PC2: [PC_LINES] },
        hint: `ipv6config ADDRESS/64 GATEWAY on PC2.${ll ? ' A host can use the router\'s link-local as its gateway; it is the one router advertisements carry.' : ''}`, show: { PC2: [`ipv6config ${n.pc2}/64 ${gw}`] } },
    );
    const notes = [`Provider block ${n.site}::/48`, `LAN ${n.lan}::/64 (PC1 by SLAAC, PC2 fixed at ${n.pc2})`,
      eui ? `Uplink ${n.wan}::/64, EUI-64 on our side; provider is ::2 and routes the /48 to our EUI-64 address` : `Uplink ${n.wan}::/64: us ::1, provider ::2`,
      `IPv4 stays as it is (${n.v4}.0/24)`, `Test site ${n.web}`];
    return {
      ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: r,
      summary: `${f.site} is going dual-stack. The provider has assigned ${n.site}::/48 and already routes it to ${r}. Bring IPv6 up next to IPv4, get both PCs addressed, and reach the provider's test site.`,
      devices, links, setup, saved: [], notes, requirements: reqs,
      tests: [
        { id: 'web1', text: `PC1 reaches ${n.web}`, check: (w) => reach6(w, 'PC1', n.web) },
        { id: 'web2', text: `PC2 reaches ${n.web}`, check: (w) => reach6(w, 'PC2', n.web) },
        ...v4Tests(n),
      ],
    };
  },
};

// ------------------------------------------------------------ the tickets
// A branch already running IPv6; each fault breaks one thing.
function healthy(n, flt) {
  const f = (id) => flt.id === id;
  const r = n.rtr;
  const lanAddr = f('wrong-prefix') ? `${n.typo}::1/64` : `${n.lan}::1/64`;
  const wanLine = f('wan-eui') ? `ipv6 address ${n.wan}::/64 eui-64` : `ipv6 address ${n.wan}::1/64`;
  const route = f('no-default') ? [] : [`ipv6 route ::/0 ${f('bad-nexthop') ? `${n.wan}::3` : `${n.wan}::2`}`];
  return {
    SW1: ['hostname SW1'],
    [r]: [`hostname ${r}`, ...(f('no-routing') ? [] : ['ipv6 unicast-routing']),
      'interface g0/0', `ip address ${n.gw4} ${M24}`, `ipv6 address ${lanAddr}`, 'ipv6 address fe80::1 link-local', 'no shutdown',
      'interface g0/1', 'ip address 203.0.113.2 255.255.255.252', wanLine, 'no shutdown', 'exit', ...route],
    ISP: ispSetup(n, `${n.wan}::1`),
    PC1: ['ipv6config auto'],
    PC2: [`ipv6config ${n.pc2}/64 ${f('pc-gateway') ? `${n.lan}::fe` : 'fe80::1'}`],
  };
}

const both = (n) => (w) => reach6(w, 'PC1', n.web) && reach6(w, 'PC2', n.web);
const R = (n) => n.rtr;

const FAULTS = [
  { id: 'no-routing', lights: ['t1-ipv6'], says: 'Since the branch router was replaced, laptops show only an fe80 address for IPv6. IPv4 is fine.',
    symptom: (n) => ({ text: 'PC1 gets a global IPv6 address and both PCs reach the test site', check: (w) => pcHas6(w, 'PC1', n.lan) && both(n)(w) }),
    owns: (n) => ({ [R(n)]: [globalRe('ipv6 unicast-routing')] }), fix: (n) => ({ [R(n)]: ['enable', 'configure terminal', 'ipv6 unicast-routing'] }),
    hint: 'show ipv6 interface g0/0: is the router in FF02::2, the all-routers group? No routing, no router advertisements, no SLAAC.' },
  { id: 'wrong-prefix', lights: ['t1-ipv6'], says: 'IPv6 users get an address, but nothing outside the office answers them. IPv4 works.',
    symptom: (n) => ({ text: 'PC1 is in the assigned /48 and both PCs reach the test site', check: (w) => pcHas6(w, 'PC1', n.lan) && both(n)(w) }),
    owns: (n) => ({ [R(n)]: [ifRe(G0)] }), fix: (n) => ({ [R(n)]: ['enable', 'configure terminal', 'interface g0/0', `no ipv6 address ${n.typo}::1/64`, `ipv6 address ${n.lan}::1/64`] }),
    hint: 'Compare ipconfig on PC1 with the addressing plan in the notes, digit by digit. Where does a SLAAC host get its prefix?' },
  { id: 'no-default', lights: ['t1-ipv6', 't3-static'], says: 'Nothing beyond the branch answers over IPv6. Pings to the router\'s own addresses work.',
    symptom: (n) => ({ text: 'Both PCs reach the test site over IPv6', check: both(n) }),
    owns: (n) => ({ [R(n)]: [globalRe('ipv6 route ::/0')] }), fix: (n) => ({ [R(n)]: ['enable', 'configure terminal', `ipv6 route ::/0 ${n.wan}::2`] }),
    hint: 'show ipv6 route. What does the router do with a destination it has no route for?' },
  { id: 'bad-nexthop', lights: ['t1-ipv6', 't3-static'], says: 'After last night\'s change, IPv6 to the internet is down. The change record says "default route updated".',
    symptom: (n) => ({ text: 'Both PCs reach the test site over IPv6', check: both(n) }),
    owns: (n) => ({ [R(n)]: [globalRe('ipv6 route ::/0')] }), fix: (n) => ({ [R(n)]: ['enable', 'configure terminal', `no ipv6 route ::/0 ${n.wan}::3`, `ipv6 route ::/0 ${n.wan}::2`] }),
    hint: 'The route is in show ipv6 route, so look at where it points. Who is on the uplink, according to the notes?' },
  { id: 'wan-eui', lights: ['t1-ipv6'], says: 'Outbound IPv6 leaves the branch but nothing comes back. The provider says they route our /48 to ::1 on the uplink, as agreed.',
    symptom: (n) => ({ text: 'Both PCs reach the test site over IPv6', check: both(n) }),
    owns: (n) => ({ [R(n)]: [ifRe(G1)] }), fix: (n) => ({ [R(n)]: ['enable', 'configure terminal', 'interface g0/1', `no ipv6 address ${n.wan}::/64 eui-64`, `ipv6 address ${n.wan}::1/64`] }),
    hint: 'show ipv6 interface brief: what is the uplink\'s address, and is it the one the provider sends to? eui-64 builds the host half from the MAC.' },
  { id: 'pc-gateway', lights: ['t1-ipv6', 't1-client'], says: 'PC2 has a fixed IPv6 address and reaches PC1, but nothing beyond the office.',
    symptom: (n) => ({ text: 'PC2 reaches the test site over IPv6', check: (w) => reach6(w, 'PC2', n.web) }),
    owns: () => ({ PC2: [PC_LINES] }), fix: (n) => ({ PC2: [`ipv6config ${n.pc2}/64 fe80::1`] }),
    hint: 'ipv6config on PC2: who is its gateway, and does anyone answer at that address? The router\'s link-local is FE80::1.' },
];

const REPAIR = {
  kind: 'repair-ipv6',
  title: 'Trouble ticket: IPv6',
  minutes: 10,
  faults: FAULTS,
  lights: [...new Set(FAULTS.flatMap(f => f.lights))],
  make(seed, { fault = null } = {}) {
    const rnd = rngOf(seed);
    const t = { number: `INC${int(rnd, 100000, 999999)}`, site: pick(rnd, SITES), requester: pick(rnd, CALLERS), priority: pick(rnd, ['P2', 'P2', 'P3']), kind: this.kind };
    const flt = FAULTS.find(f => f.id === fault) ?? pick(rnd, FAULTS);
    const n = plan(rnd);
    // A transposed hextet: the kind of typo that reads right at a glance.
    const h = n.site.split(':')[2].padStart(4, '0');
    n.typo = `2001:db8:${h[1]}${h[0]}${h.slice(2)}:${n.lan.split(':')[3]}`;
    if (n.typo.split(':')[2] === h) n.typo = `2001:db8:${h.slice(0, 2)}${h[3]}${h[2]}:${n.lan.split(':')[3]}`;
    if (n.typo.split(':')[2] === h) n.typo = `2001:db8:${hex((parseInt(h, 16) + 1) & 0xffff)}:${n.lan.split(':')[3]}`;
    const sym = flt.symptom(n);
    const fix = flt.fix(n);
    const { devices, links } = devicesOf(n);
    return {
      ...t, title: this.title, minutes: this.minutes, start: n.rtr, fault: flt.id, lights: flt.lights,
      summary: `Reported by ${t.requester}: "${flt.says}"`,
      devices, links, setup: healthy(n, flt), saved: [],
      notes: [`Provider block ${n.site}::/48`, `LAN ${n.lan}::/64, gateway FE80::1 (PC1 by SLAAC, PC2 fixed at ${n.pc2})`, `Uplink ${n.wan}::/64: us ::1, provider ::2`, `IPv4 LAN ${n.v4}.0/24`, `Test site ${n.web}`],
      requirements: [{ id: 'fix', text: sym.text, device: Object.keys(fix)[0], check: sym.check, owns: flt.owns(n), hint: flt.hint, show: fix }],
      tests: [
        { id: 'slaac', text: 'PC1 has an address in the LAN prefix', check: (w) => pcHas6(w, 'PC1', n.lan) },
        { id: 'web', text: `Both PCs reach ${n.web}`, check: both(n) },
        ...v4Tests(n),
      ],
    };
  },
};

export const IPV6_TEMPLATES = [BUILD];
export const IPV6_REPAIRS = [REPAIR];
