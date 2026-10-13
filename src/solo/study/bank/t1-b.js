// Tree 1, Network Fundamentals, part B: IPv4 subnetting, IPv6, wireless
// principles, virtualization, and how a switch learns and forwards.

import { Q, X } from './qb.js';

export const T1_B = [
  // ---------- t1-ipv4 ----------
  Q('b1-v4-01', 'NF', 't1-ipv4', 'What is the network address of host 172.16.45.200/20?', [
    ['172.16.32.0', true, 'A /20 steps by 16 in the third octet: 32 to 47.'],
    ['172.16.45.0', false, 'That assumes a /24.'],
    ['172.16.40.0', false, 'Not a multiple of 16.'],
    ['172.16.0.0', false, 'That assumes a /16.'],
  ], 'A /20 mask is 255.255.240.0, so the interesting octet is the third with a block size of 256 minus 240, which is 16. Subnets start at 0, 16, 32, 48. 45 falls in the 32 block, so the network is 172.16.32.0 and the broadcast 172.16.47.255.'),
  Q('b1-v4-02', 'NF', 't1-ipv4', 'What is the broadcast address of 10.10.10.70/26?', [
    ['10.10.10.127', true, '/26 blocks of 64: 64 to 127.'],
    ['10.10.10.255', false, 'That is the /24 broadcast.'],
    ['10.10.10.63', false, 'That ends the previous block.'],
    ['10.10.10.71', false, 'Not a block boundary.'],
  ], 'A /26 has 6 host bits, a block of 64: subnets at .0, .64, .128, .192. .70 sits in the .64 block, so the network is .64, the first host .65, the last host .126 and the broadcast .127.'),
  Q('b1-v4-03', 'NF', 't1-ipv4', 'Which mask gives at least 50 usable hosts while wasting the fewest addresses?', [
    ['255.255.255.192 (/26)', true, '62 usable hosts.'],
    ['255.255.255.224 (/27)', false, 'Only 30 usable.'],
    ['255.255.255.128 (/25)', false, '126 usable; wasteful.'],
    ['255.255.255.0 (/24)', false, '254 usable; very wasteful.'],
  ], 'Find the smallest power of two that is at least hosts plus 2: 50 plus 2 is 52, the next power of two is 64, which is 6 host bits, so /26 with 62 usable addresses.'),
  Q('b1-v4-04', 'NF', 't1-ipv4', 'How many /27 subnets fit inside one /24?', [
    ['8', true, '2 to the 3 borrowed bits.'],
    ['4', false, 'That is /26.'],
    ['16', false, 'That is /28.'],
    ['32', false, 'That is the block size.'],
  ], 'Going from /24 to /27 borrows 3 bits, and 2 to the 3rd power is 8 subnets, each a block of 32 addresses with 30 usable hosts.'),
  Q('b1-v4-05', 'NF', 't1-ipv4', 'Which mask is used on point-to-point links to give exactly two usable addresses?', [
    ['/30 (255.255.255.252)', true, '4 addresses, 2 usable.'],
    ['/29 (255.255.255.248)', false, '6 usable.'],
    ['/32', false, 'A single host.'],
    ['/28', false, '14 usable.'],
  ], '/30 is the classic point-to-point mask: network, two hosts, broadcast. /31 (RFC 3021) also works on point-to-point links with no network or broadcast address, and is supported by IOS.'),
  Q('b1-v4-06', 'NF', 't1-ipv4', 'Are 192.168.1.130/25 and 192.168.1.120/25 in the same subnet?', [
    ['No: one is in 192.168.1.128/25, the other in 192.168.1.0/25', true, '/25 splits at .128.'],
    ['Yes: both start with 192.168.1', false, 'The mask decides, not the first three octets.'],
    ['Yes: /25 covers the whole /24', false, 'It covers half.'],
    ['Cannot tell without the gateway', false, 'The addresses and mask are enough.'],
  ], 'A /25 divides the /24 into .0 to .127 and .128 to .255. Hosts on either side of .128 need a router to talk to each other, even though their addresses look similar.'),
  Q('b1-v4-07', 'NF', 't1-ipv4', 'Which address is a valid host address in 192.168.50.64/27?', [
    ['192.168.50.94', true, 'Hosts run .65 to .94.'],
    ['192.168.50.64', false, 'The network address.'],
    ['192.168.50.95', false, 'The broadcast address.'],
    ['192.168.50.96', false, 'The next subnet.'],
  ], 'A /27 block is 32 addresses: .64 is the network, .65 to .94 are hosts, .95 is the broadcast, and .96 starts the next subnet.'),
  Q('b1-v4-08', 'NF', 't1-ipv4', 'What is 255.255.255.240 in prefix notation?', [
    ['/28', true, '24 plus 4 bits of 240.'],
    ['/27', false, 'That is .224.'],
    ['/29', false, 'That is .248.'],
    ['/26', false, 'That is .192.'],
  ], 'The mask octet values to memorize are 128 (1 bit), 192 (2), 224 (3), 240 (4), 248 (5), 252 (6), 254 (7), 255 (8). So 255.255.255.240 is 24 plus 4, a /28 with 14 usable hosts.'),
  Q('b1-v4-09', 'NF', 't1-ipv4', 'Which of these is a public, internet-routable address?', [
    ['8.8.4.4', true, 'Outside every reserved range.'],
    ['10.200.1.1', false, 'RFC 1918 private.'],
    ['172.20.1.1', false, 'Inside 172.16.0.0/12.'],
    ['192.168.200.1', false, 'RFC 1918 private.'],
  ], 'The private ranges are 10.0.0.0/8, 172.16.0.0/12 (172.16 to 172.31) and 192.168.0.0/16. Also not routable on the internet: 127.0.0.0/8 loopback, 169.254.0.0/16 link-local and 100.64.0.0/10 carrier-grade NAT.'),
  Q('b1-v4-10', 'NF', 't1-ipv4', 'Using VLSM, a /24 must provide subnets for 100, 50 and 20 hosts plus one point-to-point link. Which plan fits?', [
    ['/25 for 100, /26 for 50, /27 for 20, /30 for the link', true, '128 + 64 + 32 + 4 = 228 addresses, inside 256.'],
    ['/24 for 100 and /24 for the rest', false, 'Uses two /24s.'],
    ['Four /26 subnets', false, 'A /26 cannot hold 100 hosts.'],
    ['/26 for every subnet', false, 'Fails the 100-host requirement.'],
  ], 'VLSM sizes each subnet to its need, largest first: 100 hosts needs a /25 (126), 50 needs a /26 (62), 20 needs a /27 (30), and the link a /30. Allocating largest first keeps every block on a valid boundary.'),
  Q('b1-v4-11', 'NF', 't1-ipv4', 'Which configuration is invalid because the address is the subnet\'s network address?', [
    ['ip address 10.1.1.64 255.255.255.192', true, '.64 is the network of the /26.'],
    ['ip address 10.1.1.65 255.255.255.192', false, 'First valid host.'],
    ['ip address 10.1.1.126 255.255.255.192', false, 'Last valid host.'],
    ['ip address 10.1.1.1 255.255.255.0', false, 'Valid.'],
  ], 'IOS rejects an address that is the network or broadcast of its own mask with "Bad mask" or "overlaps" style errors. Always check the block: /26 blocks are .0, .64, .128 and .192.', { console: true }),
  Q('b1-v4-12', 'NF', 't1-ipv4', 'Which two addresses belong to the same /29 subnet? (Choose two.)', [
    ['10.0.0.17', true, 'Block .16 to .23.'],
    ['10.0.0.22', true, 'Block .16 to .23.'],
    ['10.0.0.24', false, 'Starts the next block.'],
    ['10.0.0.15', false, 'In the previous block.'],
  ], 'A /29 has blocks of 8: .0, .8, .16, .24. .17 and .22 both sit between .16 and .23. .15 belongs to .8 to .15 and .24 starts .24 to .31.'),
  Q('b1-v4-13', 'NF', 't1-ipv4', 'Which range is used by carrier-grade NAT and is not RFC 1918?', [
    ['100.64.0.0/10', true, 'Shared address space for providers.'],
    ['192.0.2.0/24', false, 'Documentation range.'],
    ['169.254.0.0/16', false, 'Link-local.'],
    ['127.0.0.0/8', false, 'Loopback.'],
  ], 'RFC 6598 reserves 100.64.0.0/10 for providers that NAT their customers. If a customer router\'s WAN shows 100.64 to 100.127, the provider is doing CGNAT and inbound port forwards from the internet will not work.'),
  Q('b1-v4-14', 'NF', 't1-ipv4', 'From this output, what is the subnet of the link between R1 and R2?', [
    ['10.0.12.0/30', true, 'Address .1 with a /30 mask.'],
    ['10.0.12.1/32', false, 'That is the interface host route.'],
    ['10.0.0.0/8', false, 'The mask is /30, not /8.'],
    ['10.0.12.0/24', false, 'The mask is 255.255.255.252.'],
  ], 'The Internet address line shows the interface address with its prefix. 10.0.12.1/30 sits in 10.0.12.0/30, whose usable hosts are .1 and .2, so R2 is 10.0.12.2.', {
    exhibit: X(`
R1#show interfaces g0/0 | include Internet
  Internet address is 10.0.12.1/30`,
      ['show interfaces g0/0 | include Internet', 'cmd'], ['10.0.12.1', 'ip'], ['/30', 'mask']),
  }),
  Q('b1-v4-15', 'NF', 't1-ipv4', 'What is the wildcard mask for 255.255.255.224?', [
    ['0.0.0.31', true, '255 minus 224.'],
    ['0.0.0.32', false, 'That is the block size.'],
    ['0.0.0.224', false, 'Not inverted.'],
    ['255.255.255.31', false, 'Only the last octet should be non-zero.'],
  ], 'Subtract each mask octet from 255: 255.255.255.224 becomes 0.0.0.31. Wildcards are used in OSPF network statements and ACLs, and the block-size-minus-one shortcut gets you there fast.'),
  Q('b1-v4-16', 'NF', 't1-ipv4', 'How many usable hosts does a /22 provide?', [
    ['1022', true, '2 to the 10 minus 2.'],
    ['1024', false, 'Forgot network and broadcast.'],
    ['510', false, 'That is /23.'],
    ['254', false, 'That is /24.'],
  ], 'A /22 leaves 10 host bits: 1024 addresses minus 2 is 1022. It spans four consecutive /24s starting on a multiple of 4 in the third octet, such as 10.4.4.0 to 10.4.7.255.'),
  Q('b1-v4-17', 'NF', 't1-ipv4', 'Two routers are cabled together and configured as shown. Why will they not ping each other?', [
    ['They are in different /30 subnets: .5 is in .4/30, .9 is in .8/30', true, 'Each /30 block holds only two hosts.'],
    ['/30 is not allowed on Ethernet', false, 'It works on any interface.'],
    ['Both need no shutdown', false, 'Nothing says they are shut.'],
    ['The masks must be /24', false, 'Any matching mask works.'],
  ], '/30 blocks go .0, .4, .8, .12. 10.1.1.5 belongs to .4 to .7 and 10.1.1.9 to .8 to .11. The two ends of a link must share a subnet; change R2 to 10.1.1.6.', {
    exhibit: X(`
R1(config-if)#ip address 10.1.1.5 255.255.255.252
R2(config-if)#ip address 10.1.1.9 255.255.255.252`,
      [/R\d\(config-if\)#/, 'prompt'], ['10.1.1.5', 'ip', 'R1'], ['10.1.1.9', 'fail', 'R2 in a different /30'], [/255\.255\.255\.252/, 'mask']),
  }),
  Q('b1-v4-18', 'NF', 't1-ipv4', 'What is the purpose of the loopback interface on a router?', [
    ['A virtual interface that never goes down, used for router IDs and management reachability', true, 'Up as long as the router is up.'],
    ['To test the physical port', false, 'Loopback0 is virtual.'],
    ['To connect two routers back to back', false, 'Use a physical link.'],
    ['To receive DHCP leases', false, 'Unrelated.'],
  ], 'A loopback stays up regardless of physical links, so it makes a stable OSPF router ID and a reliable address to manage the router, reachable through any working path. It is usually a /32.'),
  Q('b1-v4-19', 'NF', 't1-ipv4', 'Which is the last usable host in 172.20.8.0/21?', [
    ['172.20.15.254', true, '/21 spans 8.0 to 15.255.'],
    ['172.20.8.254', false, 'That assumes a /24.'],
    ['172.20.15.255', false, 'The broadcast.'],
    ['172.20.16.254', false, 'Outside the block.'],
  ], 'A /21 steps by 8 in the third octet: 8.0 to 15.255. The broadcast is 172.20.15.255 and the last host one below it, 172.20.15.254.'),
  Q('b1-v4-20', 'NF', 't1-ipv4', 'What does 0.0.0.0/0 represent in a routing table?', [
    ['Every possible destination: the default route', true, 'A zero-length prefix matches everything.'],
    ['An unconfigured interface', false, 'That shows unassigned.'],
    ['The local host', false, 'That is 127.0.0.1.'],
    ['A broadcast', false, 'That is 255.255.255.255.'],
  ], 'With zero network bits, 0.0.0.0/0 matches any address but is the least specific match possible, so it is only used when nothing more specific exists. That makes it the gateway of last resort.'),
  Q('b1-v4-21', 'NF', 't1-ipv4', 'Which address class and default mask would 172.16.0.0 have had under classful addressing?', [
    ['Class B, 255.255.0.0', true, 'First octet 128 to 191.'],
    ['Class A, 255.0.0.0', false, 'First octet 1 to 126.'],
    ['Class C, 255.255.255.0', false, 'First octet 192 to 223.'],
    ['Class D, multicast', false, 'First octet 224 to 239.'],
  ], 'Classes are obsolete for routing (CIDR replaced them) but still show up in wording: A is 1 to 126 (/8), B 128 to 191 (/16), C 192 to 223 (/24), D 224 to 239 multicast and E 240 to 255 reserved.'),
  Q('b1-v4-22', 'NF', 't1-ipv4', 'A host is 192.168.4.77 with mask 255.255.255.248. Which gateway address is valid for it?', [
    ['192.168.4.73', true, 'In the .72/29 block, .73 to .78.'],
    ['192.168.4.1', false, 'Outside the /29.'],
    ['192.168.4.79', false, 'The broadcast.'],
    ['192.168.4.72', false, 'The network address.'],
  ], '/29 blocks are 8 wide: .72 to .79 holds .77. Usable hosts are .73 to .78, so the gateway must be one of those; .73 or .78 are the usual picks.'),
  Q('b1-v4-23', 'NF', 't1-ipv4', 'Which summary route covers 10.1.4.0/24, 10.1.5.0/24, 10.1.6.0/24 and 10.1.7.0/24 exactly?', [
    ['10.1.4.0/22', true, 'Four /24s aligned on 4.'],
    ['10.1.0.0/16', false, 'Covers far more.'],
    ['10.1.4.0/23', false, 'Covers only 4 and 5.'],
    ['10.1.4.0/21', false, 'Not a /21 boundary; the /21 holding these is 10.1.0.0/21, which also covers 10.1.0 to 10.1.3.'],
  ], 'Four contiguous /24s collapse into a /22 when the first one is a multiple of 4 in the third octet. 4, 5, 6, 7 qualifies, so 10.1.4.0/22. Summaries keep routing tables small.'),
  Q('b1-v4-24', 'NF', 't1-ipv4', 'Which address is reserved for documentation and examples?', [
    ['192.0.2.10', true, '192.0.2.0/24 is TEST-NET-1.'],
    ['10.0.0.10', false, 'Private, usable in networks.'],
    ['8.8.8.8', false, 'A public resolver in use on the internet.'],
    ['172.31.0.10', false, 'Private.'],
  ], 'RFC 5737 reserves 192.0.2.0/24, 198.51.100.0/24 and 203.0.113.0/24 for documentation, so examples never collide with hosts in use. You will see them in exam questions and in this app.'),
  Q('b1-v4-25', 'NF', 't1-ipv4', 'Which mask splits 192.168.10.0/24 into exactly four equal subnets?', [
    ['255.255.255.192', true, '/26 gives four blocks of 64.'],
    ['255.255.255.128', false, 'Two subnets.'],
    ['255.255.255.224', false, 'Eight subnets.'],
    ['255.255.255.240', false, 'Sixteen subnets.'],
  ], 'Four subnets need 2 borrowed bits (2 squared is 4), so /24 becomes /26: .0, .64, .128 and .192, each with 62 usable hosts.'),
  Q('b1-v4-26', 'NF', 't1-ipv4', 'What is the first usable host in 10.33.96.0/19?', [
    ['10.33.96.1', true, 'Network .96.0, first host .96.1.'],
    ['10.33.96.0', false, 'The network address.'],
    ['10.33.97.1', false, 'Still valid, but not the first.'],
    ['10.33.64.1', false, 'Different /19.'],
  ], 'A /19 steps by 32 in the third octet: 64, 96, 128. 10.33.96.0 is a network boundary, so the first host is .96.1 and the broadcast is 10.33.127.255.'),

  // ---------- t1-ipv6 ----------
  Q('b1-v6-01', 'NF', 't1-ipv6', 'Which is the correct shortened form of 2001:0db8:0000:0000:0000:0000:0a00:0001?', [
    ['2001:db8::a00:1', true, 'Drop leading zeros, replace one run of zero groups with ::.'],
    ['2001:db8::a::1', false, ':: may appear only once.'],
    ['2001:db8:0:0:0:0:a:1', false, 'a00 loses significant trailing zeros.'],
    ['2001:db8:a00:1', false, 'Missing the :: so groups are lost.'],
  ], 'Two rules: drop leading zeros in each hextet (0db8 to db8, 0a00 to a00, 0001 to 1), and replace one longest run of all-zero hextets with ::. Trailing zeros are significant and stay.'),
  Q('b1-v6-02', 'NF', 't1-ipv6', 'Which prefix identifies IPv6 multicast addresses?', [
    ['ff00::/8', true, 'All multicast starts ff.'],
    ['fe80::/10', false, 'Link-local unicast.'],
    ['fc00::/7', false, 'Unique local.'],
    ['2000::/3', false, 'Global unicast.'],
  ], 'IPv6 has no broadcast; multicast replaces it. ff02::1 is all nodes on the link, ff02::2 all routers, and ff02::1:ffxx:xxxx the solicited-node groups that neighbor discovery uses instead of ARP broadcasts.'),
  Q('b1-v6-03', 'NF', 't1-ipv6', 'What is the usual prefix length for an IPv6 LAN subnet?', [
    ['/64', true, 'Required for SLAAC and EUI-64.'],
    ['/24', false, 'An IPv4 habit.'],
    ['/128', false, 'A single host.'],
    ['/48', false, 'A typical site allocation, not a LAN.'],
  ], 'Sites often receive a /48 from a provider and carve /64s for each LAN, giving 65,536 subnets. A /64 leaves 64 bits for the interface ID, which SLAAC and modified EUI-64 depend on.'),
  Q('b1-v6-04', 'NF', 't1-ipv6', 'Using modified EUI-64, what interface ID comes from MAC 0050.3e12.3456?', [
    ['0250:3eff:fe12:3456', true, 'Insert fffe in the middle and flip the seventh bit (00 becomes 02).'],
    ['0050:3eff:fe12:3456', false, 'The universal/local bit was not flipped.'],
    ['0050:3e12:3456:fffe', false, 'fffe goes in the middle.'],
    ['fffe:0050:3e12:3456', false, 'fffe goes in the middle.'],
  ], 'Split the 48-bit MAC in half (0050.3e | 12.3456), insert ff:fe between the halves, then invert the seventh bit of the first byte: 00 becomes 02. The result is 0250:3eff:fe12:3456.'),
  Q('b1-v6-05', 'NF', 't1-ipv6', 'Which IPv6 address type is automatically configured on every IPv6-enabled interface?', [
    ['Link-local (fe80::/10)', true, 'Always present.'],
    ['Global unicast', false, 'Only when configured or learned.'],
    ['Unique local', false, 'Only when configured.'],
    ['Anycast', false, 'Only when configured.'],
  ], 'A link-local address appears the moment IPv6 is enabled on an interface. Neighbor discovery and routing protocols use it as the next hop, which is why show ipv6 route often lists fe80 addresses rather than global ones.'),
  Q('b1-v6-06', 'NF', 't1-ipv6', 'What does this interface\'s output tell you about its addresses?', [
    ['It has a link-local fe80 address and a global 2001:db8:acad:1::1/64 address', true, 'Both are listed.'],
    ['It has only a link-local address', false, 'A global address is listed too.'],
    ['It is using EUI-64 for its global address', false, 'The global address ends in ::1, configured manually.'],
    ['IPv6 is disabled', false, 'IPv6 is enabled.'],
  ], 'show ipv6 interface brief lists each interface\'s link-local address first, then any global or unique local addresses. Manually configured addresses often end in ::1; EUI-64 ones end in the MAC with ff:fe in the middle.', {
    exhibit: X(`
R1#show ipv6 interface brief
GigabitEthernet0/0     [up/up]
    FE80::1
    2001:DB8:ACAD:1::1
GigabitEthernet0/1     [administratively down/down]
    unassigned`,
      ['show ipv6 interface brief', 'cmd'], [/GigabitEthernet0\/\d/, 'iface'], ['FE80::1', 'ip', 'Link-local'], ['2001:DB8:ACAD:1::1', 'ip', 'Global unicast'], ['[up/up]', 'ok', 'Up/up'], ['administratively down/down', 'fail', 'Shut down']),
  }),
  Q('b1-v6-07', 'NF', 't1-ipv6', 'Which global command must be entered before a Cisco router will route IPv6 packets?', [
    ['ipv6 unicast-routing', true, 'IPv6 routing is off by default.'],
    ['ipv6 enable', false, 'That enables IPv6 on one interface.'],
    ['ip routing', false, 'That is for IPv4.'],
    ['ipv6 router ospf 1', false, 'That starts OSPFv3, but packets still are not routed.'],
  ], 'Without ipv6 unicast-routing a router can have IPv6 addresses and answer pings, but it will not forward IPv6 or send router advertisements, so hosts cannot use SLAAC through it.', { console: true }),
  Q('b1-v6-08', 'NF', 't1-ipv6', 'How does a host using SLAAC learn its prefix and default gateway?', [
    ['From Router Advertisements sent by the local router', true, 'RAs carry the prefix and the router\'s link-local address.'],
    ['From a DHCPv6 server only', false, 'SLAAC is stateless; no DHCP server is needed.'],
    ['From ARP', false, 'IPv6 has no ARP.'],
    ['From DNS', false, 'DNS resolves names.'],
  ], 'The host sends a Router Solicitation; the router answers with a Router Advertisement containing the /64 prefix. The host builds its own interface ID (EUI-64 or random) and uses the router\'s link-local address as its gateway.'),
  Q('b1-v6-09', 'NF', 't1-ipv6', 'Which address is an IPv6 unique local address?', [
    ['fd12:3456:789a::10', true, 'fd00::/8 is the used half of fc00::/7.'],
    ['fe80::10', false, 'Link-local.'],
    ['2001:db8::10', false, 'Global (documentation) range.'],
    ['ff02::10', false, 'Multicast.'],
  ], 'Unique local addresses are IPv6\'s rough equivalent of RFC 1918: routable inside an organization, not on the internet. In practice they start with fd followed by a random 40-bit global ID.'),
  Q('b1-v6-10', 'NF', 't1-ipv6', 'Which statement describes an IPv6 anycast address?', [
    ['The same address on several devices; packets go to the nearest one by routing metric', true, 'Used for DNS and similar services.'],
    ['An address for all devices on a link', false, 'That is multicast ff02::1.'],
    ['A special prefix starting fa', false, 'Anycast uses ordinary unicast addresses.'],
    ['An address that changes over time', false, 'That describes privacy addresses.'],
  ], 'Anycast addresses look like unicast; what makes them anycast is that several devices advertise the same one. Routing delivers each packet to the closest. Public DNS resolvers use the same idea.'),
  Q('b1-v6-11', 'NF', 't1-ipv6', 'Which IPv6 mechanism replaces ARP?', [
    ['Neighbor Discovery using Neighbor Solicitation and Neighbor Advertisement', true, 'ICMPv6 messages to solicited-node multicast.'],
    ['DHCPv6', false, 'Assigns addresses.'],
    ['Router Advertisement', false, 'Announces routers and prefixes.'],
    ['Inverse ARP', false, 'A Frame Relay mechanism.'],
  ], 'To find a neighbor\'s MAC, an IPv6 host sends a Neighbor Solicitation to that address\'s solicited-node multicast group and gets a Neighbor Advertisement back. show ipv6 neighbors is the IPv6 counterpart of show arp.'),
  Q('b1-v6-12', 'NF', 't1-ipv6', 'Which interface command assigns a global IPv6 address and builds the interface ID from the MAC?', [
    ['ipv6 address 2001:db8:1:1::/64 eui-64', true, 'The router fills in the host bits.'],
    ['ipv6 address 2001:db8:1:1::1/64', false, 'A fully manual address.'],
    ['ipv6 address autoconfig', false, 'Learns the prefix from RAs instead.'],
    ['ipv6 enable', false, 'Only a link-local address.'],
  ], 'With eui-64 you give only the /64 prefix and IOS appends the modified EUI-64 interface ID. ipv6 address autoconfig makes the interface a SLAAC client, and ipv6 enable creates just the link-local address.', { console: true }),
  Q('b1-v6-13', 'NF', 't1-ipv6', 'Which multicast group do all IPv6 routers on a link join?', [
    ['ff02::2', true, 'All routers, link-local scope.'],
    ['ff02::1', false, 'All nodes.'],
    ['ff02::5', false, 'All OSPFv3 routers.'],
    ['ff05::2', false, 'Site-local scope.'],
  ], 'ff02::1 reaches every IPv6 node on the link and ff02::2 every router. A host\'s Router Solicitation goes to ff02::2, and Router Advertisements go to ff02::1.'),
  Q('b1-v6-14', 'NF', 't1-ipv6', 'Which IPv6 static route sends all unknown traffic to 2001:db8:0:12::2?', [
    ['ipv6 route ::/0 2001:db8:0:12::2', true, '::/0 is the IPv6 default.'],
    ['ipv6 route 0.0.0.0/0 2001:db8:0:12::2', false, 'Mixes IPv4 notation.'],
    ['ip route ::/0 2001:db8:0:12::2', false, 'ip route is IPv4.'],
    ['ipv6 route default 2001:db8:0:12::2', false, 'Not valid syntax.'],
  ], 'IPv6 static routes use ipv6 route prefix/length next-hop. ::/0 is the default route. When the next hop is a link-local address you must also name the exit interface, because fe80 addresses repeat on every link.', { console: true }),
  Q('b1-v6-15', 'NF', 't1-ipv6', 'How many bits long is an IPv6 address?', [
    ['128', true, 'Eight 16-bit hextets.'],
    ['64', false, 'That is the usual prefix length.'],
    ['32', false, 'IPv4.'],
    ['48', false, 'A MAC address.'],
  ], 'IPv6 addresses are 128 bits, written as eight groups of four hex digits. On a LAN the first 64 bits are the network prefix and the last 64 the interface ID.'),
  Q('b1-v6-16', 'NF', 't1-ipv6', 'Which route in this IPv6 table points to a remote network, and what is its next hop?', [
    ['2001:DB8:ACAD:2::/64 via FE80::2 out GigabitEthernet0/0', true, 'An S static route with a link-local next hop.'],
    ['2001:DB8:ACAD:1::/64, connected', false, 'That is connected (C).'],
    ['2001:DB8:ACAD:1::1/128, local', false, 'That is the router\'s own address (L).'],
    ['FF00::/8, Null0', false, 'The multicast route.'],
  ], 'show ipv6 route uses the same codes as IPv4: C connected, L local, S static, O OSPF. Next hops for learned routes are often link-local addresses, so the exit interface is always listed beside them.', {
    exhibit: X(`
R1#show ipv6 route
C   2001:DB8:ACAD:1::/64 [0/0]
     via GigabitEthernet0/1, directly connected
L   2001:DB8:ACAD:1::1/128 [0/0]
     via GigabitEthernet0/1, receive
S   2001:DB8:ACAD:2::/64 [1/0]
     via FE80::2, GigabitEthernet0/0
L   FF00::/8 [0/0]
     via Null0, receive`,
      ['show ipv6 route', 'cmd'], [/^[CLS](?=   )/m, 'code'], [/\[\d+\/\d+\]/, 'metric'], ['FE80::2', 'hop'], [/GigabitEthernet0\/\d|Null0/, 'iface'], [/2001:DB8:ACAD:\d::(1\/128|\/64)/, 'ip', 'Prefix'], ['FF00::/8', 'ip', 'Prefix']),
  }),
  Q('b1-v6-17', 'NF', 't1-ipv6', 'Which DHCPv6 approach gives hosts DNS servers while they still build their own addresses with SLAAC?', [
    ['Stateless DHCPv6', true, 'Addresses from SLAAC, options from DHCPv6.'],
    ['Stateful DHCPv6', false, 'The server assigns addresses too.'],
    ['EUI-64 only', false, 'Gives no DNS.'],
    ['DHCPv4 relay', false, 'IPv4 only.'],
  ], 'Router Advertisement flags tell hosts what to do: the O flag (other config) means use SLAAC for addresses and ask DHCPv6 for options such as DNS, which is stateless DHCPv6. The M flag means get the address from DHCPv6 too.'),
  Q('b1-v6-18', 'NF', 't1-ipv6', 'Which IPv6 address is the loopback?', [
    ['::1', true, 'The single IPv6 loopback address.'],
    ['::', false, 'The unspecified address.'],
    ['fe80::1', false, 'A link-local address.'],
    ['127.0.0.1', false, 'IPv4 loopback.'],
  ], 'IPv6 has one loopback address, ::1/128. :: (all zeros) is the unspecified address that a host uses as its source before it has an address, for example during duplicate address detection.'),

  // ---------- t1-wireless ----------
  Q('b1-wl-01', 'NF', 't1-wireless', 'Which 2.4 GHz channels do not overlap in North America?', [
    ['1, 6 and 11', true, 'Five channels apart.'],
    ['1, 5, 9 and 13', false, 'Used in some regions with 20 MHz tolerance, not the North America answer.'],
    ['1, 2 and 3', false, 'Heavily overlapping.'],
    ['36, 40 and 44', false, '5 GHz channels.'],
  ], '2.4 GHz channels are 5 MHz apart but about 22 MHz wide, so only channels five apart avoid each other: 1, 6 and 11. Neighboring APs should use different ones of those three.'),
  Q('b1-wl-02', 'NF', 't1-wireless', 'What is an SSID?', [
    ['The name of a wireless network that clients see and join', true, 'Service set identifier.'],
    ['The MAC address of the AP radio', false, 'That is the BSSID.'],
    ['The encryption key', false, 'That is the PSK.'],
    ['The channel number', false, 'Unrelated.'],
  ], 'An SSID is the network name, up to 32 characters. One AP can advertise several SSIDs, each with its own BSSID (radio MAC) and often its own VLAN and security settings.'),
  Q('b1-wl-03', 'NF', 't1-wireless', 'Why does the 5 GHz band usually perform better in a busy office than 2.4 GHz?', [
    ['It has many more non-overlapping channels and less interference', true, 'Fewer neighbors share each channel.'],
    ['It travels farther through walls', false, '2.4 GHz travels farther.'],
    ['It needs no encryption', false, 'Encryption is independent of band.'],
    ['It uses wired backhaul', false, 'Unrelated to band.'],
  ], '2.4 GHz has three usable channels and is shared with microwaves, Bluetooth and older devices. 5 GHz has more than twenty channels, so neighboring APs rarely clash, at the cost of shorter range.'),
  Q('b1-wl-04', 'NF', 't1-wireless', 'What does a BSSID identify?', [
    ['The MAC address of a specific AP radio serving an SSID', true, 'Basic service set identifier.'],
    ['The WLAN name', false, 'That is the SSID.'],
    ['The client\'s MAC', false, 'Clients have their own MACs.'],
    ['The controller', false, 'Not a BSSID.'],
  ], 'A BSS is one AP radio and its clients, identified by the BSSID. An ESS is several BSSs sharing an SSID so clients can roam. When a client roams, the SSID stays the same and the BSSID changes.'),
  Q('b1-wl-05', 'NF', 't1-wireless', 'Which access method do Wi-Fi clients use to share the medium?', [
    ['CSMA/CA', true, 'Collision avoidance.'],
    ['CSMA/CD', false, 'Wired half-duplex Ethernet.'],
    ['Token passing', false, 'Token Ring.'],
    ['Full duplex', false, 'Wi-Fi is half duplex.'],
  ], 'Radios cannot listen while transmitting, so Wi-Fi avoids collisions instead of detecting them: listen, wait a random backoff, transmit, and expect an acknowledgment. Everything on a channel takes turns, which is why channel planning matters.'),
  Q('b1-wl-06', 'NF', 't1-wireless', 'Which encryption should a new WLAN use?', [
    ['WPA3, or WPA2 with AES at minimum', true, 'The current standards.'],
    ['WEP', false, 'Broken.'],
    ['WPA with TKIP', false, 'Deprecated.'],
    ['Open with MAC filtering', false, 'MAC filtering is easily spoofed.'],
  ], 'WEP and TKIP are broken and modern clients refuse them. WPA2 uses AES-CCMP; WPA3 adds SAE for personal networks and stronger enterprise options. Pick WPA3 where clients support it, WPA2/WPA3 transition mode otherwise.'),
  Q('b1-wl-07', 'NF', 't1-wireless', 'What happens when two neighboring APs are both on channel 6?', [
    ['They share airtime, so both cells slow down (co-channel interference)', true, 'Only one transmits at a time.'],
    ['Clients get double the speed', false, 'They compete instead.'],
    ['Nothing; APs coordinate perfectly', false, 'They still defer to each other.'],
    ['Both APs shut down', false, 'They keep working, slower.'],
  ], 'Devices on the same channel hear each other and wait their turn, so two cells on one channel behave like one shared cell. Spread neighbors across 1, 6 and 11, or move clients to 5 GHz.'),
  Q('b1-wl-08', 'NF', 't1-wireless', 'Which factor most reduces wireless signal through a building?', [
    ['Absorption and reflection by walls, metal, water and glass', true, 'RF attenuates through materials.'],
    ['The SSID length', false, 'Irrelevant.'],
    ['WPA2 encryption', false, 'Encryption does not weaken signal.'],
    ['The number of VLANs', false, 'Irrelevant.'],
  ], 'Concrete, metal and water absorb and reflect RF; higher frequencies suffer more, so 5 GHz fades faster than 2.4 GHz. Site surveys place APs to cover each area with enough overlap for roaming.'),
  Q('b1-wl-09', 'NF', 't1-wireless', 'What does RSSI measure?', [
    ['The received signal strength at the client or AP, in dBm', true, 'Closer to zero is stronger.'],
    ['The number of clients', false, 'Unrelated.'],
    ['The noise floor', false, 'Noise is a separate measure.'],
    ['The data rate', false, 'Rate depends on signal and noise.'],
  ], 'Signal strength is a negative dBm value: -50 is strong, -67 is a common minimum for voice, -80 is weak. What matters is the gap between signal and noise (SNR); 25 dB or more is good.'),
  Q('b1-wl-10', 'NF', 't1-wireless', 'Which statement describes a wireless ESS?', [
    ['Several APs advertising the same SSID so clients can roam between them', true, 'Extended service set.'],
    ['One AP with no clients', false, 'Not a definition.'],
    ['Two clients talking directly', false, 'That is an ad hoc IBSS.'],
    ['A wired uplink', false, 'Not a wireless term.'],
  ], 'BSS is one AP\'s cell; ESS is many cells joined by the wired distribution system with one SSID. IBSS (ad hoc) has no AP at all. Roaming is a client moving from one BSS to another inside the ESS.'),
  Q('b1-wl-11', 'NF', 't1-wireless', 'What is channel bonding in Wi-Fi?', [
    ['Combining adjacent 20 MHz channels into 40, 80 or 160 MHz for higher throughput', true, 'Wider channels carry more data.'],
    ['Giving each client its own channel', false, 'Not how it works.'],
    ['Using both bands at once on one client', false, 'That is multi-link operation, a newer feature.'],
    ['Encrypting the channel', false, 'Unrelated.'],
  ], 'Wider channels raise top speed but use up the channel plan: in 2.4 GHz a 40 MHz channel leaves no room for neighbors, so bonding is a 5 or 6 GHz practice, and dense deployments often stay at 20 or 40 MHz.'),
  Q('b1-wl-12', 'NF', 't1-wireless', 'Which frequency band did Wi-Fi 6E add?', [
    ['6 GHz', true, 'Adds a large, clean band.'],
    ['900 MHz', false, 'Not a Wi-Fi 6E band.'],
    ['60 GHz', false, 'That is WiGig.'],
    ['3.5 GHz', false, 'Cellular.'],
  ], 'Wi-Fi 6E extends 802.11ax into 6 GHz, which has many wide channels and no legacy devices, and requires WPA3. Wi-Fi 7 (802.11be) builds on the same bands.'),
  Q('b1-wl-13', 'NF', 't1-wireless', 'Users in one conference room have strong signal but very slow Wi-Fi at busy times. What is the most likely cause?', [
    ['Too many clients sharing one AP\'s airtime on one channel', true, 'Capacity, not coverage.'],
    ['The SSID is hidden', false, 'Hiding does not slow traffic.'],
    ['The AP needs a new IP address', false, 'Addressing would stop traffic, not slow it.'],
    ['The DHCP lease time is too long', false, 'Unrelated.'],
  ], 'Strong signal with poor speed points at capacity: airtime is shared by everyone on the channel. Add APs on different channels, move clients to 5 or 6 GHz, and limit low data rates so slow clients do not hog the air.'),
  Q('b1-wl-14', 'NF', 't1-wireless', 'Which device type in a home network combines the AP with routing and switching?', [
    ['A wireless router', true, 'The SOHO all-in-one.'],
    ['A lightweight AP', false, 'Needs a controller.'],
    ['A WLC', false, 'Manages APs only.'],
    ['A PoE injector', false, 'Provides power.'],
  ], 'Consumer wireless routers combine an AP, a small switch, a router doing NAT, DHCP and DNS forwarding, and a basic firewall. Enterprise networks split those jobs across separate devices.'),

  // ---------- t1-virtual ----------
  Q('b1-vir-01', 'NF', 't1-virtual', 'What is the difference between a Type 1 and a Type 2 hypervisor?', [
    ['Type 1 runs directly on hardware; Type 2 runs on top of a host operating system', true, 'Bare metal versus hosted.'],
    ['Type 1 runs containers; Type 2 runs VMs', false, 'Both run VMs.'],
    ['Type 2 is faster', false, 'Type 1 is usually faster.'],
    ['There is no difference', false, 'Placement differs.'],
  ], 'Type 1 (ESXi, Hyper-V Server, KVM) owns the hardware and is used in data centers. Type 2 (VirtualBox, VMware Workstation) runs as an application on a desktop OS, handy for labs.'),
  Q('b1-vir-02', 'NF', 't1-virtual', 'How do containers differ from virtual machines?', [
    ['Containers share the host OS kernel; VMs each run a full guest OS', true, 'Lighter and faster to start.'],
    ['Containers each run their own kernel', false, 'That describes VMs.'],
    ['VMs cannot be networked', false, 'Both can.'],
    ['Containers need a Type 2 hypervisor', false, 'Containers need a container runtime.'],
  ], 'A container packages an application with its libraries and runs in an isolated slice of the host OS, starting in seconds with megabytes of overhead. A VM emulates a whole machine with its own OS, heavier but more isolated.'),
  Q('b1-vir-03', 'NF', 't1-virtual', 'What does a VRF let a router do?', [
    ['Keep several separate routing tables, so overlapping address ranges can coexist', true, 'Virtual routers inside one router.'],
    ['Run virtual machines', false, 'Not a hypervisor function.'],
    ['Encrypt traffic', false, 'That is IPsec.'],
    ['Split a switch into VLANs', false, 'That is Layer 2.'],
  ], 'Each VRF has its own interfaces and routing table. Providers use VRFs to keep customers apart even when two customers both use 10.0.0.0/8; enterprises use them to separate guest or management traffic.'),
  Q('b1-vir-04', 'NF', 't1-virtual', 'How do virtual machines on one host usually reach the physical network?', [
    ['Through a virtual switch in the hypervisor, uplinked to physical NICs', true, 'The vSwitch connects vNICs to the wire.'],
    ['Each VM has its own physical cable', false, 'VMs share physical NICs.'],
    ['Through the console port', false, 'Not a data path.'],
    ['They cannot reach the network', false, 'They can.'],
  ], 'Each VM gets virtual NICs plugged into a virtual switch. The vSwitch can tag VLANs, so the physical switch port toward the host is usually an 802.1Q trunk carrying all the VMs\' VLANs.'),
  Q('b1-vir-05', 'NF', 't1-virtual', 'Which statement about server virtualization is true?', [
    ['One physical server runs many isolated virtual servers, improving hardware use', true, 'Consolidation.'],
    ['Each VM needs its own physical CPU', false, 'VMs share CPUs.'],
    ['Virtual servers cannot be moved between hosts', false, 'Live migration moves them.'],
    ['VMs are always slower than containers at networking', false, 'Not a defining property.'],
  ], 'Virtualization lets one host run many workloads, moves VMs between hosts for maintenance, and snapshots them before changes. Networking follows the VM, which is why data center switch ports to hosts are trunks.'),
  Q('b1-vir-06', 'NF', 't1-virtual', 'A host runs VMs in VLANs 10, 20 and 30. How should the physical switch port toward the host be configured?', [
    ['As an 802.1Q trunk allowing VLANs 10, 20 and 30', true, 'The vSwitch tags each VM\'s traffic.'],
    ['As an access port in VLAN 10', false, 'VLANs 20 and 30 would be lost.'],
    ['As a routed port', false, 'The vSwitch expects Layer 2.'],
    ['Shut down', false, 'Unreachable.'],
  ], 'The virtual switch tags frames with each VM\'s VLAN, so the physical port must carry all of them as a trunk. Allow only the VLANs the host uses, and match the native VLAN on both sides.'),
  Q('b1-vir-07', 'NF', 't1-virtual', 'Which command shows the routing table of a VRF named CUSTOMER-A?', [
    ['show ip route vrf CUSTOMER-A', true, 'Each VRF has its own table.'],
    ['show ip route', false, 'Shows only the global table.'],
    ['show vrf routes', false, 'Not valid syntax.'],
    ['show ip interface brief vrf', false, 'Not valid.'],
  ], 'Commands that touch routing take a vrf keyword: show ip route vrf NAME, ping vrf NAME 10.1.1.1, and so on. Without it you are looking at the global table and may think routes are missing.', { console: true }),
  Q('b1-vir-08', 'NF', 't1-virtual', 'What is a virtual network function (NFV)?', [
    ['A network service such as a router or firewall running as software on standard servers', true, 'Network functions virtualization.'],
    ['A VLAN', false, 'Layer 2 segmentation.'],
    ['A physical appliance', false, 'The opposite.'],
    ['A type of cable', false, 'Unrelated.'],
  ], 'NFV runs routers, firewalls, load balancers and WAN optimizers as VMs or containers instead of dedicated boxes. A cloud router such as a Cisco Catalyst 8000V is the CCNA-level example.'),
  Q('b1-vir-09', 'NF', 't1-virtual', 'What starts faster and uses less memory: a container or a VM?', [
    ['A container', true, 'No guest OS to boot.'],
    ['A VM', false, 'It boots a whole OS.'],
    ['They are identical', false, 'They are not.'],
    ['Neither can start without a router', false, 'Unrelated.'],
  ], 'Because containers share the host kernel, they start in seconds and carry only the application and its libraries. VMs boot an entire operating system, which takes longer and reserves more memory.'),
  Q('b1-vir-10', 'NF', 't1-virtual', 'Two customers on one provider edge router both use 10.1.1.0/24. What keeps their routes apart?', [
    ['Each customer\'s interfaces are in their own VRF', true, 'Separate tables allow overlap.'],
    ['NAT on the provider router', false, 'Possible, but not how routes are separated.'],
    ['Different VLANs only', false, 'VLANs separate Layer 2, not routing tables.'],
    ['STP', false, 'Unrelated.'],
  ], 'Without VRFs a router has one table and one route per prefix, so overlapping customer prefixes would collide. VRFs give each customer a private table, and the same prefix can exist once in each.'),
  Q('b1-vir-11', 'NF', 't1-virtual', 'Which component lets a single physical NIC be shared by many VMs?', [
    ['The hypervisor\'s virtual switch', true, 'It multiplexes vNICs onto the physical NIC.'],
    ['A PoE injector', false, 'Provides power.'],
    ['A crossover cable', false, 'Physical connection between two devices.'],
    ['The VTY lines', false, 'Management sessions.'],
  ], 'The hypervisor presents each VM with virtual NICs and connects them through a software switch to one or more physical uplinks, often teamed for redundancy.'),
  Q('b1-vir-12', 'NF', 't1-virtual', 'Why might an organization run a virtual router in a public cloud?', [
    ['To give cloud workloads a familiar routing, VPN and security edge', true, 'Same features as on premises.'],
    ['Because physical routers are not allowed in data centers', false, 'They are.'],
    ['To avoid IP addressing', false, 'It still needs addresses.'],
    ['To replace switches in the office', false, 'Unrelated.'],
  ], 'A virtual router (Catalyst 8000V and similar) runs as a VM in the cloud and terminates site-to-site VPNs, routes between cloud networks and applies the same features the team already uses on premises.'),

  // ---------- t1-switching ----------
  Q('b1-sw-01', 'NF', 't1-switching', 'How does a switch learn which port a MAC address lives on?', [
    ['From the source MAC of frames arriving on each port', true, 'Learning uses source addresses.'],
    ['From the destination MAC', false, 'Destinations decide forwarding, not learning.'],
    ['From ARP replies only', false, 'Any frame teaches it.'],
    ['From the routing table', false, 'Switches do not use routing tables for this.'],
  ], 'Every frame that arrives teaches the switch "this source MAC is behind this port". It then forwards by destination MAC: known destinations go out one port, unknown ones are flooded within the VLAN.'),
  Q('b1-sw-02', 'NF', 't1-switching', 'A frame arrives for a destination MAC not in the MAC address table. What does the switch do?', [
    ['Floods it out every port in the VLAN except the one it arrived on', true, 'Unknown unicast flooding.'],
    ['Drops it', false, 'Switches flood unknowns.'],
    ['Sends it to the router', false, 'Only if the router is the destination.'],
    ['Sends an ARP request', false, 'Switches do not ARP for frames.'],
  ], 'Unknown unicast, broadcasts and most multicasts are flooded within the VLAN. When the destination replies, the switch learns its port from the reply\'s source MAC and stops flooding to it.'),
  Q('b1-sw-03', 'NF', 't1-switching', 'What is the default MAC address table aging time on a Cisco switch?', [
    ['300 seconds', true, 'Five minutes.'],
    ['30 seconds', false, 'Too short.'],
    ['4 hours', false, 'That is the default ARP timeout on routers.'],
    ['Forever', false, 'Dynamic entries age out.'],
  ], 'Dynamic MAC entries are removed after 300 seconds without a frame from that address, which keeps the table current when devices move. Routers keep ARP entries for 4 hours by default, a mismatch that sometimes causes brief flooding.'),
  Q('b1-sw-04', 'NF', 't1-switching', 'Which port does this switch use to reach MAC 0050.7966.6801?', [
    ['Gi0/3', true, 'The table maps that MAC to Gi0/3 in VLAN 10.'],
    ['Gi0/24', false, 'That port holds other MACs learned over the trunk.'],
    ['Gi0/1', false, 'Holds a different MAC.'],
    ['It will flood', false, 'The MAC is known.'],
  ], 'show mac address-table lists VLAN, MAC, type (DYNAMIC or STATIC) and port. Many MACs behind one port usually means that port leads to another switch, here the uplink Gi0/24.', {
    exhibit: X(`
SW1#show mac address-table dynamic
          Mac Address Table
-------------------------------------------
Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
  10    0050.7966.6800    DYNAMIC     Gi0/1
  10    0050.7966.6801    DYNAMIC     Gi0/3
  10    00a0.c9f0.1111    DYNAMIC     Gi0/24
  20    00a0.c9f0.2222    DYNAMIC     Gi0/24`,
      ['show mac address-table dynamic', 'cmd'], [/(?<=^ {2})\d{2}(?= {4})/m, 'vlan'], [/[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}/, 'mac'], [/Gi0\/\d+/, 'iface'], [/DYNAMIC/, 'state', 'Learned']),
  }),
  Q('b1-sw-05', 'NF', 't1-switching', 'What does a switch do with a broadcast frame?', [
    ['Floods it out every port in the same VLAN except the arrival port', true, 'Broadcasts stay inside the VLAN.'],
    ['Sends it to every VLAN', false, 'VLANs bound broadcasts.'],
    ['Drops it', false, 'Broadcasts are needed for ARP and DHCP.'],
    ['Forwards it to the default gateway only', false, 'Switches do not route.'],
  ], 'Broadcasts such as ARP requests and DHCP discovers reach every device in the VLAN. A router or Layer 3 switch does not forward them to other subnets, which is why DHCP needs a relay to cross subnets.'),
  Q('b1-sw-06', 'NF', 't1-switching', 'Which forwarding method has the lowest latency because the switch starts sending as soon as it reads the destination MAC?', [
    ['Cut-through', true, 'Forwards after the destination address.'],
    ['Store-and-forward', false, 'Waits for the whole frame and checks the FCS.'],
    ['Fragment-free', false, 'Waits for the first 64 bytes.'],
    ['Flooding', false, 'A forwarding decision, not a method.'],
  ], 'Store-and-forward checks the whole frame\'s FCS and drops bad frames, the default on most Catalyst access switches. Cut-through starts forwarding early for minimum latency but passes corrupted frames on. Fragment-free waits 64 bytes to skip collision fragments.'),
  Q('b1-sw-07', 'NF', 't1-switching', 'What does each switch port represent in terms of domains?', [
    ['Its own collision domain, but part of its VLAN\'s broadcast domain', true, 'Switches split collision domains, not broadcast domains.'],
    ['Its own broadcast domain', false, 'Only VLANs and routers split broadcast domains.'],
    ['A shared collision domain', false, 'That was hubs.'],
    ['A separate subnet', false, 'Ports in one VLAN share a subnet.'],
  ], 'Each switch port is a separate collision domain, which on full duplex means no collisions at all. All ports in one VLAN share a broadcast domain and normally a single IP subnet.'),
  Q('b1-sw-08', 'NF', 't1-switching', 'A switch sees the same source MAC arriving on Gi0/1 and then Gi0/2 repeatedly, every second. What does that suggest?', [
    ['A Layer 2 loop, or a device moving rapidly between ports', true, 'MAC flapping.'],
    ['A normal roaming laptop', false, 'Not every second.'],
    ['A duplex mismatch', false, 'Unrelated.'],
    ['The MAC table is full', false, 'Full tables cause flooding, not flapping.'],
  ], 'The switch logs %SW_MATM-4-MACFLAP_NOTIF when one MAC keeps moving between ports. The usual cause is a loop (STP disabled or a bridge between ports); find it before broadcast storms bring the VLAN down.'),
  Q('b1-sw-09', 'NF', 't1-switching', 'Which command adds a permanent MAC entry so a device is always reached on Gi0/5?', [
    ['mac address-table static 0011.2233.4455 vlan 10 interface gi0/5', true, 'Static entries do not age out.'],
    ['switchport mac 0011.2233.4455', false, 'Not valid syntax.'],
    ['arp 0011.2233.4455 gi0/5', false, 'ARP maps IP to MAC on routers.'],
    ['mac address-table aging-time 0', false, 'Disables aging but adds no entry.'],
  ], 'Static MAC entries pin a device to a port and survive aging. They are rarely needed; port security sticky addresses are the more common way to pin MACs on access ports.', { console: true }),
  Q('b1-sw-10', 'NF', 't1-switching', 'Which field in an Ethernet frame does a switch check to detect corruption?', [
    ['The FCS (frame check sequence)', true, 'A CRC over the frame.'],
    ['The TTL', false, 'An IP header field.'],
    ['The destination MAC', false, 'Used for forwarding.'],
    ['The EtherType', false, 'Names the payload protocol.'],
  ], 'The FCS is a 4-byte CRC in the trailer. A store-and-forward switch recalculates it and drops frames that fail, counting them as CRC errors on the receiving port.'),
  Q('b1-sw-11', 'NF', 't1-switching', 'Which EtherType value means the frame carries an IPv4 packet?', [
    ['0x0800', true, 'IPv4.'],
    ['0x86DD', false, 'IPv6.'],
    ['0x0806', false, 'ARP.'],
    ['0x8100', false, '802.1Q tag.'],
  ], 'The EtherType tells the receiver what is inside: 0x0800 IPv4, 0x0806 ARP, 0x86DD IPv6. 0x8100 means an 802.1Q tag follows, with the payload\'s EtherType after the tag.'),
  Q('b1-sw-12', 'NF', 't1-switching', 'What is the destination MAC of an Ethernet broadcast?', [
    ['ffff.ffff.ffff', true, 'All ones.'],
    ['0000.0000.0000', false, 'All zeros is not broadcast.'],
    ['0100.5e00.0001', false, 'An IPv4 multicast MAC.'],
    ['3333.0000.0001', false, 'An IPv6 multicast MAC.'],
  ], 'All ones is broadcast. IPv4 multicast maps to 01:00:5e plus the low 23 bits of the group, and IPv6 multicast to 33:33 plus the low 32 bits. Switches flood all three unless IGMP or MLD snooping prunes multicast.'),
  Q('b1-sw-13', 'NF', 't1-switching', 'How many MAC addresses has this switch learned on Gi0/24, and what does that tell you?', [
    ['Three, which suggests Gi0/24 leads to another switch', true, 'Many MACs behind one port means more devices downstream.'],
    ['One, so Gi0/24 is an access port', false, 'Three entries list Gi0/24.'],
    ['None, the port is down', false, 'Entries exist.'],
    ['Three, which proves a loop', false, 'Several MACs on an uplink is normal.'],
  ], 'Count the entries per port. Access ports normally show one MAC (two with an IP phone and PC). Uplinks to other switches or virtualization hosts show many. A sudden explosion of MACs on an access port can mean an unmanaged switch was plugged in.', {
    exhibit: X(`
SW1#show mac address-table interface gi0/24
Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
  10    00a0.c9f0.1111    DYNAMIC     Gi0/24
  10    00a0.c9f0.3333    DYNAMIC     Gi0/24
  20    00a0.c9f0.2222    DYNAMIC     Gi0/24`,
      ['show mac address-table interface gi0/24', 'cmd'], [/[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}/, 'mac'], [/Gi0\/24/, 'iface']),
  }),
  Q('b1-sw-14', 'NF', 't1-switching', 'Why does a host ARP for its default gateway rather than for a remote server?', [
    ['Because the remote server is in another subnet; the frame goes to the gateway\'s MAC', true, 'MACs only matter on the local link.'],
    ['Because ARP cannot carry IP addresses', false, 'ARP carries IPs.'],
    ['Because the server has no MAC', false, 'Every NIC has a MAC.'],
    ['Because routers block all ARP', false, 'They do not forward it, but that is not the reason.'],
  ], 'Layer 2 addresses are hop by hop: the destination MAC is always the next device on this link. For off-subnet traffic that is the gateway, while the IP destination stays the remote server end to end.'),
  Q('b1-sw-15', 'NF', 't1-switching', 'Along a path through three routers, which addresses change at each hop?', [
    ['The source and destination MAC addresses', true, 'Rewritten on every link.'],
    ['The source and destination IP addresses', false, 'Unchanged end to end (without NAT).'],
    ['The TCP ports', false, 'Unchanged without NAT.'],
    ['Nothing changes', false, 'MACs and TTL change.'],
  ], 'Each router strips the old frame, decrements the TTL, looks up the IP destination, and builds a new frame with its own MAC as source and the next hop\'s MAC as destination. IPs stay the same unless NAT rewrites them.'),
  Q('b1-sw-16', 'NF', 't1-switching', 'Which command clears all dynamically learned MAC addresses so the switch relearns them?', [
    ['clear mac address-table dynamic', true, 'Flushes dynamic entries.'],
    ['clear arp', false, 'That clears the ARP cache.'],
    ['no mac address-table', false, 'Not valid.'],
    ['reload', false, 'Works, but drastic.'],
  ], 'Clearing the table is harmless: the switch floods briefly and relearns from the next frames. It helps after moving devices or to see whether a MAC reappears on an unexpected port.', { console: true }),
];
