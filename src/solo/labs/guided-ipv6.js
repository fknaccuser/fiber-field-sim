// Guided material for the IPv6 lab. Same shape as guided.js.

import { makePc } from './world.js';
import { parse6, format6, eui64 } from './ip6.js';

const Q = (q, choices) => ({ q, choices: choices.map(([text, ok, why]) => ({ text, ok: Boolean(ok), why })) });
const S = (device, tiles, traps = []) => ({ device, tiles, traps: traps.map(([text, why]) => ({ text, why })) });

const ENABLE = (d) => S(d, ['enable'], [['configure terminal', 'Not yet. configure terminal only works from privileged mode (#).']]);
const CONF = (d) => S(d, ['configure terminal'], [['interface', 'Interfaces are configured from global configuration. Get there first.']]);

// PC1's MAC is fixed by its name, so the address SLAAC will build is known
// ahead, and so are the near misses.
const MAC = makePc('PC1').mac;
const LAN = parse6('2001:db8:acad:10::');
const ID = eui64(MAC);
const raw48 = BigInt(`0x${MAC.replace(/\./g, '')}`);
const EUI_CHOICES = [
  format6(LAN | ID),
  format6(LAN | (ID ^ (0x02n << 56n))),
  format6(LAN | raw48),
  format6(parse6('2001:db8:acad:f::') | ID),
];

export const GUIDED_IPV6 = {
  'v6-branch': {
    goals: {
      lan: {
        think: Q('How do you give an IPv6 address its subnet size?', [
          ['A prefix length after a slash, like /64', 1, 'Right. IPv6 has no dotted mask; the length rides on the address.'],
          ['A mask, the way IPv4 does: ffff:ffff:ffff:ffff::', 0, 'IOS only takes the /length form for IPv6.'],
          ['It is always /64, so nothing', 0, 'LAN subnets are /64 by convention, but you still write it.'],
        ]),
        steps: [ENABLE('R1'), CONF('R1'), S('R1', ['interface', 'g0/0']),
          S('R1', ['ipv6 address', '2001:db8:acad:10::1/64'], [['ip address', 'That is the IPv4 command. IPv6 has its own: ipv6 address.'], ['2001:db8:acad:10::1 64', 'The length goes after a slash with no space.']])],
      },
      ll: {
        think: Q('Gi0/0 had no link-local address until you gave it a global one. Where did one come from?', [
          ['IOS built FE80:: plus an EUI-64 ID from the MAC as soon as IPv6 came on', 1, 'Right. Every IPv6 interface has a link-local address; configuring one just makes it readable.'],
          ['The ISP assigned it', 0, 'Link-local addresses never leave the link, so nobody hands them out.'],
          ['There is none until you set one', 0, 'An IPv6 interface always has one.'],
        ]),
        steps: [S('R1', ['ipv6 address', 'fe80::1', 'link-local'], [['eui-64', 'eui-64 builds the host half from the MAC. You want a fixed, short link-local here.'], ['fe80::1/64', 'A link-local address takes no prefix length; the keyword link-local says what it is.']])],
      },
      routing: {
        think: Q('R1 has IPv6 addresses now. Will it route IPv6 and advertise its prefix to the PCs?', [
          ['No. ipv6 unicast-routing is off by default', 1, 'Right. Unlike IPv4, IOS ships with IPv6 routing off: no forwarding, no router advertisements.'],
          ['Yes, addressing an interface turns it on', 0, 'The interface answers pings, but the router neither forwards nor advertises.'],
          ['Only after OSPFv3 is running', 0, 'Static routes and SLAAC work without any routing protocol.'],
        ]),
        steps: [S('R1', ['ipv6 unicast-routing'], [['ip routing', 'That is the IPv4 switch, and it is on already.'], ['ipv6 enable', 'That only turns on link-local IPv6 on one interface.']])],
      },
      slaac: {
        think: Q('How does PC1 learn which /64 it is on?', [
          ['From R1\'s router advertisement, which carries the prefix', 1, 'Right. SLAAC: the prefix from the RA, the host half made by the PC.'],
          ['From a DHCPv6 server', 0, 'That is stateful DHCPv6. There is no server here.'],
          ['It guesses from its IPv4 address', 0, 'IPv4 and IPv6 are configured separately.'],
        ]),
        steps: [S('PC1', ['ipv6config', 'auto'], [['ipconfig /renew', 'That asks a DHCPv4 server for an IPv4 address.']])],
      },
      eui: {
        think: Q('SLAAC built the second half of PC1\'s address with EUI-64. What does EUI-64 do to the MAC?', [
          ['Splits it in half, puts FFFE in the middle, and flips the seventh bit', 1, 'Right. 48 bits become 64, and the U/L bit flips.'],
          ['Pads it with zeros to 64 bits', 0, 'The padding is FFFE, in the middle.'],
          ['Copies it unchanged', 0, 'A MAC is 48 bits; the interface ID is 64.'],
        ]),
        steps: [S('PC1', ['ipconfig'])],
        choices: EUI_CHOICES,
      },
      wan: {
        think: Q('The provider is 2001:DB8:ACAD:F::2 on the uplink. Which address belongs on R1 Gi0/1?', [
          ['2001:DB8:ACAD:F::1/64', 1, 'Right. Same /64 as the provider, a different host.'],
          ['2001:DB8:ACAD:10::2/64', 0, 'That is in the LAN prefix, which is on Gi0/0.'],
          ['FE80::2', 0, 'A link-local address cannot carry traffic beyond the link.'],
        ]),
        steps: [S('R1', ['interface', 'g0/1']), S('R1', ['ipv6 address', '2001:db8:acad:f::1/64'], [['2001:db8:acad:f::2/64', 'That is the provider\'s address.']])],
      },
      default: {
        think: Q('How do you write "every destination" in IPv6?', [
          ['::/0', 1, 'Right. All zeros, prefix length zero.'],
          ['0.0.0.0 0.0.0.0', 0, 'That is the IPv4 default route.'],
          ['FF02::1', 0, 'That is the all-nodes multicast group.'],
        ]),
        steps: [S('R1', ['ipv6 route', '::/0', '2001:db8:acad:f::2'], [['ip route', 'That is the IPv4 command.'], ['2001:db8:acad:f::1', 'That is R1 itself. The next hop is the provider.']])],
      },
      ping: {
        think: Q('PC1 sends to 2001:DB8:CAFE::80. Which address does it hand the packet to first?', [
          ['R1\'s link-local, FE80::1, learned from the router advertisement', 1, 'Right. IPv6 hosts use the router\'s link-local as their gateway.'],
          ['2001:DB8:ACAD:F::2', 0, 'That is the provider, two hops away from PC1.'],
          ['The server directly', 0, 'It is not on PC1\'s link.'],
        ]),
        steps: [S('PC1', ['ping', '2001:db8:cafe::80'])],
      },
    },
    teach: Q('A coworker turned on SLAAC on a PC and it got no IPv6 address, though the router interface has a /64. What do you check first?', [
      ['ipv6 unicast-routing on the router: without it, no router advertisements go out', 1, 'Right. No RA, no prefix, no SLAAC.'],
      ['The PC\'s IPv4 gateway', 0, 'IPv4 settings play no part in SLAAC.'],
      ['Whether the switch port is a trunk', 0, 'An access port carries RAs fine.'],
      ['The router\'s DHCP pool', 0, 'SLAAC uses no DHCP server.'],
    ]),
  },
};
