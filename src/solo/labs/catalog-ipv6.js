// The IPv6 lab: bring IPv6 up on a branch router that already runs IPv4,
// let a PC build its own address by SLAAC, and route out to the provider.

import { makeDevice, makeSwitch, makePc, makeWorld, freshElections, save } from './world.js';
import { createSession, execute } from './ios.js';
import { parse6, format6 } from './ip6.js';
import { v6Of } from './v6.js';

const G3 = ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2'];
const L = (id, a, ai, b, bi) => ({ id, ends: [[a, ai], [b, bi]] });
const NIC = 'FastEthernet0';

function build({ devices, links, switches = [], pcs = {}, setup = {}, saved = [] }) {
  const make = (id) => (switches.includes(id) ? makeSwitch(id) : pcs[id] ? makePc(id, pcs[id]) : makeDevice(id, G3));
  const world = makeWorld(devices.map(make), links);
  for (const [id, lines] of Object.entries(setup)) {
    const s = createSession(world, id);
    for (const l of ['enable', 'configure terminal', ...lines, 'end']) execute(s, l);
  }
  for (const id of saved) save(world, id);
  freshElections(world);
  world.seq = 0;
  world.learned = {};
  return world;
}

const v6 = (c, d, n) => c.world.devices[d].config.interfaces[n]?.v6 ?? null;
const hasAddr = (c, d, n, addr, len) => (v6(c, d, n)?.addrs ?? []).some(x => x.addr === format6(parse6(addr)) && x.len === len);
const events = (c, d) => c.events.filter(e => !d || e.device === d);
const pinged6 = (c, d, dst) => events(c, d).some(e => e.kind === 'ping6' && e.ok && e.dst === format6(parse6(dst)));

// PC1's SLAAC address, once it has one.
export const slaacAddress = (world) => {
  const a = v6Of(world, 'PC1', NIC).addrs[0];
  return a ? a.addr : null;
};
const sameAddr = (want) => (text) => { const a = parse6(String(text ?? '').trim().replace(/\/64$/, '')); return want !== null && a === want; };

export const IPV6_LABS = [
  {
    id: 'v6-branch',
    title: 'Turn on IPv6 at a branch',
    lights: ['t1-ipv6'],
    story: 'The provider has handed the branch 2001:DB8:ACAD::/48 and already routes it to R1. R1 runs IPv4 today. Add IPv6 alongside it: address the LAN and the uplink, let the PCs configure themselves, and reach the provider\'s web server at 2001:DB8:CAFE::80.',
    start: 'R1',
    devices: ['R1', 'ISP', 'SW1', 'PC1', 'WEB'],
    links: [L('pc', 'PC1', NIC, 'SW1', 'FastEthernet0/1'), L('lan', 'SW1', 'GigabitEthernet0/1', 'R1', 'GigabitEthernet0/0'),
      L('wan', 'R1', 'GigabitEthernet0/1', 'ISP', 'GigabitEthernet0/0'), L('web', 'ISP', 'GigabitEthernet0/1', 'WEB', NIC)],
    topology: 'PC1 ── SW1 ── Gi0/0 R1 Gi0/1 ── Gi0/0 ISP (2001:DB8:ACAD:F::2) ── WEB 2001:DB8:CAFE::80',
    build() {
      return build({
        devices: this.devices, links: this.links, switches: ['SW1'],
        pcs: { PC1: { ip: '10.10.10.20', mask: '255.255.255.0', gateway: '10.10.10.1' }, WEB: { v6: { addrs: [{ addr: '2001:db8:cafe::80', len: 64 }], gw: '2001:db8:cafe::1' } } },
        setup: {
          SW1: ['hostname SW1'],
          R1: ['hostname R1', 'interface g0/0', 'ip address 10.10.10.1 255.255.255.0', 'no shutdown', 'interface g0/1', 'ip address 203.0.113.2 255.255.255.252', 'no shutdown'],
          ISP: ['hostname ISP', 'ipv6 unicast-routing', 'interface g0/0', 'ipv6 address 2001:db8:acad:f::2/64', 'no shutdown', 'interface g0/1', 'ipv6 address 2001:db8:cafe::1/64', 'no shutdown', 'exit', 'ipv6 route 2001:db8:acad::/48 2001:db8:acad:f::1'],
        },
        saved: ['R1', 'ISP'],
      });
    },
    goals: [
      { id: 'lan', text: 'Give R1 Gi0/0 the LAN address 2001:DB8:ACAD:10::1/64', check: (c) => hasAddr(c, 'R1', 'GigabitEthernet0/0', '2001:db8:acad:10::1', 64),
        hint: 'ipv6 address, in interface configuration, with the prefix length after a slash. No mask in IPv6.', show: { R1: ['enable', 'configure terminal', 'interface g0/0', 'ipv6 address 2001:db8:acad:10::1/64'] } },
      { id: 'll', text: 'Set Gi0/0\'s link-local address to FE80::1 so the PCs\' gateway is easy to read', check: (c) => v6(c, 'R1', 'GigabitEthernet0/0')?.ll === 'fe80::1',
        hint: 'ipv6 address FE80::1 link-local. Every IPv6 interface already has a link-local address built from its MAC; this replaces it with a short one.', show: { R1: ['ipv6 address fe80::1 link-local'] } },
      { id: 'routing', text: 'Turn on IPv6 routing on R1', check: (c) => Boolean(c.world.devices.R1.config.ipv6?.routing),
        hint: 'ipv6 unicast-routing, in global configuration. IPv6 routing is off by default; without it R1 forwards nothing and sends no router advertisements.', show: { R1: ['exit', 'ipv6 unicast-routing'] } },
      { id: 'slaac', text: 'On PC1, turn on IPv6 autoconfiguration and get an address', check: (c) => slaacAddress(c.world) !== null,
        hint: 'ipv6config auto on PC1. It listens for R1\'s router advertisement and builds its own address from the prefix.', show: { PC1: ['ipv6config auto'] } },
      { id: 'eui', text: 'What global IPv6 address did PC1 build for itself?', ask: 'Full address, like 2001:db8:...', check: (c) => sameAddr(slaacAddress(c.world))(c.answers.eui),
        hint: 'ipconfig on PC1 shows it. The first half is R1\'s /64 prefix; the second half is PC1\'s MAC with FFFE in the middle and the seventh bit flipped (EUI-64).', show: { PC1: ['ipconfig'] } },
      { id: 'wan', text: 'Give R1 Gi0/1 the uplink address 2001:DB8:ACAD:F::1/64', check: (c) => hasAddr(c, 'R1', 'GigabitEthernet0/1', '2001:db8:acad:f::1', 64),
        hint: 'Same command as the LAN, on Gi0/1. The provider is ::2 on that link.', show: { R1: ['interface g0/1', 'ipv6 address 2001:db8:acad:f::1/64'] } },
      { id: 'default', text: 'Add an IPv6 default route toward the provider at 2001:DB8:ACAD:F::2', check: (c) => (c.world.devices.R1.config.ipv6?.statics ?? []).some(s => s.net === '::' && s.len === 0 && (s.nh === '2001:db8:acad:f::2' || s.intf === 'GigabitEthernet0/1')),
        hint: 'The IPv6 default route is ::/0. ipv6 route ::/0 followed by the next hop.', show: { R1: ['ipv6 route ::/0 2001:db8:acad:f::2'] } },
      { id: 'ping', text: 'From PC1, ping the web server at 2001:DB8:CAFE::80', check: (c) => pinged6(c, 'PC1', '2001:db8:cafe::80'),
        hint: 'ping works with IPv6 addresses the same way. If it fails, check show ipv6 route on R1.', show: { PC1: ['ping 2001:db8:cafe::80'] } },
    ],
  },
];
