// Tree 3, IP Connectivity, part A: reading the routing table, how a router
// forwards, ping and traceroute, and static routing (default, network, host
// and floating; IPv4 and IPv6).

import { Q, X } from './qb.js';

const RT = `
R1#show ip route
Codes: L - local, C - connected, S - static, O - OSPF, * - candidate default
Gateway of last resort is 203.0.113.1 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 203.0.113.1
      10.0.0.0/8 is variably subnetted, 4 subnets, 3 masks
C        10.0.12.0/30 is directly connected, GigabitEthernet0/0
L        10.0.12.1/32 is directly connected, GigabitEthernet0/0
O        10.1.0.0/16 [110/3] via 10.0.12.2, 00:14:06, GigabitEthernet0/0
O        10.1.5.0/24 [110/20] via 10.0.12.2, 00:14:06, GigabitEthernet0/0
      192.168.1.0/24 is variably subnetted, 2 subnets, 2 masks
C        192.168.1.0/24 is directly connected, GigabitEthernet0/1
L        192.168.1.1/32 is directly connected, GigabitEthernet0/1`;
const RT_MARKS = [
  ['show ip route', 'cmd'], [/^(S\*|C|L|O)(?= )/m, 'code'], [/\[\d+\/\d+\]/, 'metric'],
  ['Gateway of last resort is 203.0.113.1', 'gw', 'Gateway of last resort'], [/via (10\.0\.12\.2|203\.0\.113\.1)/, 'hop'],
  [/GigabitEthernet0\/\d/, 'iface'], [/\d+\.\d+\.\d+\.\d+\/\d+/, 'ip', 'Destination prefix'],
];

export const T3_A = [
  // ---------- t3-table ----------
  Q('b3-rt-01', 'IPC', 't3-table', 'Which route will R1 use for a packet to 10.1.5.77?', [
    ['O 10.1.5.0/24 via 10.0.12.2', true, 'The /24 is the longest match.'],
    ['O 10.1.0.0/16 via 10.0.12.2', false, 'It matches but is less specific.'],
    ['S* 0.0.0.0/0 via 203.0.113.1', false, 'The default is used only when nothing else matches.'],
    ['C 10.0.12.0/30', false, '10.1.5.77 is not in that /30.'],
  ], 'The router compares the destination with every prefix and picks the longest one that matches. 10.1.5.77 matches 0.0.0.0/0, 10.1.0.0/16 and 10.1.5.0/24; the /24 wins, even though its OSPF metric (20) is higher than the /16\'s (3). Metric and AD only compare routes to the same prefix.', { exhibit: X(RT, ...RT_MARKS) }),
  Q('b3-rt-02', 'IPC', 't3-table', 'Where does R1 send a packet to 172.16.9.9?', [
    ['To 203.0.113.1, using the default route', true, 'Nothing more specific matches.'],
    ['It drops it', false, 'A default route exists.'],
    ['To 10.0.12.2', false, 'No route via 10.0.12.2 covers 172.16.9.9.'],
    ['Out GigabitEthernet0/1', false, 'That only reaches 192.168.1.0/24.'],
  ], 'No specific prefix covers 172.16.9.9, so the packet follows 0.0.0.0/0 to the gateway of last resort, 203.0.113.1. Without that default route the router would drop it and send ICMP unreachable back to the source.', { exhibit: X(RT, ...RT_MARKS) }),
  Q('b3-rt-03', 'IPC', 't3-table', 'In "O 10.1.0.0/16 [110/3]", what do 110 and 3 mean?', [
    ['110 is the administrative distance (OSPF), 3 is the OSPF cost', true, '[AD/metric].'],
    ['110 is the cost, 3 is the hop count', false, 'Reversed meaning.'],
    ['110 is the process ID, 3 is the area', false, 'Not shown here.'],
    ['110 seconds old, 3 hops away', false, 'Age is shown separately.'],
  ], 'Every learned route shows [administrative distance/metric]. AD says how trusted the source is (OSPF 110, static 1, connected 0). Metric is the protocol\'s own measure of the path: OSPF cost, here 3.', { exhibit: X(RT, ...RT_MARKS) }),
  Q('b3-rt-04', 'IPC', 't3-table', 'What do the L routes in this table represent?', [
    ['The router\'s own interface addresses as /32 host routes', true, 'Local routes.'],
    ['Routes learned from LDP', false, 'Not in the codes.'],
    ['Loopback interfaces only', false, 'Any interface with an address gets one.'],
    ['Routes that are about to expire', false, 'Not a meaning of L.'],
  ], 'For every up interface with an address, IOS installs two routes: C for the connected subnet and L for the exact /32 of its own address. L routes let the router recognise packets addressed to itself.', { exhibit: X(RT, ...RT_MARKS) }),
  Q('b3-rt-05', 'IPC', 't3-table', 'R1 learns 10.5.5.0/24 from OSPF (AD 110) and also has a static route to 10.5.5.0/24 (AD 1). Which is installed?', [
    ['The static route', true, 'Lower AD wins for the same prefix.'],
    ['The OSPF route', false, '110 is higher than 1.'],
    ['Both, load-balanced', false, 'Different sources do not share.'],
    ['Neither', false, 'One wins.'],
  ], 'When two sources offer the same prefix and length, the lower administrative distance wins. Default ADs: connected 0, static 1, eBGP 20, EIGRP 90, OSPF 110, RIP 120, iBGP 200. 255 means "do not trust", never installed.'),
  Q('b3-rt-06', 'IPC', 't3-table', 'Which administrative distance values are correct? (Choose two.)', [
    ['OSPF 110', true, 'Default OSPF AD.'],
    ['Static 1', true, 'Default static AD.'],
    ['RIP 90', false, 'RIP is 120; EIGRP is 90.'],
    ['Connected 1', false, 'Connected is 0.'],
  ], 'Memorize: 0 connected, 1 static, 5 EIGRP summary, 20 eBGP, 90 internal EIGRP, 110 OSPF, 115 IS-IS, 120 RIP, 170 external EIGRP, 200 iBGP, 255 unreachable.'),
  Q('b3-rt-07', 'IPC', 't3-table', 'What does "Gateway of last resort is not set" mean?', [
    ['There is no default route; packets to unknown networks are dropped', true, 'No 0.0.0.0/0.'],
    ['The router has no interfaces up', false, 'Unrelated.'],
    ['OSPF is not running', false, 'Unrelated.'],
    ['The router cannot reach its neighbors', false, 'Unrelated.'],
  ], 'The gateway of last resort is the next hop of the default route. Not set means no 0.0.0.0/0 exists, so anything not matching a specific route is dropped with ICMP unreachable sent back.', { console: true }),
  Q('b3-rt-08', 'IPC', 't3-table', 'Two OSPF routes to 10.9.9.0/24 appear, both [110/20], via different next hops. What does the router do?', [
    ['Installs both and load-balances across them (ECMP)', true, 'Equal cost multipath.'],
    ['Uses only the first one learned', false, 'Equal paths are both used.'],
    ['Uses the one with the lower next-hop IP', false, 'Not a tiebreaker for installation.'],
    ['Drops traffic to that network', false, 'No.'],
  ], 'OSPF installs up to four equal-cost paths by default (maximum-paths changes it). The route shows one prefix with two via lines, and CEF spreads flows across them per destination by default.'),
  Q('b3-rt-09', 'IPC', 't3-table', 'Which part of the routing table entry tells the router where to send the packet next?', [
    ['The next-hop address after "via" and the exit interface', true, 'Forwarding information.'],
    ['The prefix', false, 'That is what it matches.'],
    ['The age timer', false, 'How long since learned.'],
    ['The code letter', false, 'Where it came from.'],
  ], 'A learned route reads: code, prefix, [AD/metric], via next hop, age, exit interface. The next hop is resolved to a MAC by ARP and the packet leaves through the exit interface.', { exhibit: X(RT, ...RT_MARKS) }),
  Q('b3-rt-10', 'IPC', 't3-table', 'Why might a static route not appear in the routing table after you configure it?', [
    ['Its next hop is unreachable, or its exit interface is down', true, 'IOS only installs usable routes.'],
    ['Static routes never show in show ip route', false, 'They show with code S.'],
    ['OSPF must be running', false, 'Not required.'],
    ['The router needs a reload', false, 'Routes install immediately.'],
  ], 'IOS installs a static route only if it can resolve the next hop through another route (often connected) or if the exit interface is up. A typo in the next hop, or a down link, leaves the route in the config but out of the table.'),
  Q('b3-rt-11', 'IPC', 't3-table', 'Which prefixes match destination 192.168.10.130? (Choose two.)', [
    ['192.168.10.128/25', true, 'Covers .128 to .255.'],
    ['192.168.10.0/24', true, 'Covers all of 10.x.'],
    ['192.168.10.0/25', false, 'Covers .0 to .127.'],
    ['192.168.10.192/26', false, 'Covers .192 to .255.'],
  ], 'Check each prefix\'s range. Of the matches, the router uses the most specific, the /25. Being able to list every matching route quickly is what longest-match questions test.'),
  Q('b3-rt-12', 'IPC', 't3-table', 'Which route code marks a route learned from OSPF in another area?', [
    ['O IA', true, 'Inter-area.'],
    ['O E2', false, 'External type 2.'],
    ['O', false, 'Intra-area.'],
    ['S', false, 'Static.'],
  ], 'O alone is intra-area, O IA is inter-area (a type 3 summary LSA), and O E1 or O E2 are routes redistributed into OSPF. The CCNA tests single-area OSPF, so expect plain O most of the time.'),
  Q('b3-rt-13', 'IPC', 't3-table', 'A route reads "S 10.20.0.0/16 is directly connected, GigabitEthernet0/2". How was it configured?', [
    ['ip route 10.20.0.0 255.255.0.0 GigabitEthernet0/2', true, 'Exit interface instead of next hop.'],
    ['ip route 10.20.0.0 255.255.0.0 10.0.0.2', false, 'That would show via 10.0.0.2.'],
    ['network 10.20.0.0 0.0.255.255 area 0', false, 'That is OSPF.'],
    ['ip address 10.20.0.1 255.255.0.0 on Gi0/2', false, 'That would be code C.'],
  ], 'A static route pointing at an exit interface shows as directly connected. On Ethernet, the router then ARPs for every destination in the prefix and relies on proxy ARP downstream, so naming the next hop (or both) is preferred.'),
  Q('b3-rt-14', 'IPC', 't3-table', 'Which command shows only the OSPF-learned routes?', [
    ['show ip route ospf', true, 'Filters by source.'],
    ['show ip ospf route', false, 'Not the standard filter (it shows a different OSPF view on some platforms).'],
    ['show ip route | include S', false, 'Matches static and any line with S.'],
    ['show ospf', false, 'Not valid.'],
  ], 'show ip route takes a source keyword (connected, static, ospf) or a prefix (show ip route 10.1.5.0) to answer "which route will this destination use" directly.', { console: true }),
  Q('b3-rt-15', 'IPC', 't3-table', 'Which command answers "which route would R1 use for 10.1.5.77?" in one step?', [
    ['show ip route 10.1.5.77', true, 'IOS prints the best matching route.'],
    ['show ip route | include 10.1.5.77', false, 'The host address is not literally in the table.'],
    ['ping 10.1.5.77', false, 'Tests reachability, not the route.'],
    ['show arp 10.1.5.77', false, 'ARP shows MACs.'],
  ], 'Giving show ip route a host address makes IOS do the longest-match lookup for you and print the winning entry with its next hop and exit interface.', { console: true }),
  Q('b3-rt-16', 'IPC', 't3-table', 'Which route in this table is the router\'s path to the internet, and how was it learned?', [
    ['S* 0.0.0.0/0 via 203.0.113.1, a static default route', true, 'S* is a static candidate default.'],
    ['C 10.0.12.0/30, a connected route', false, 'A point-to-point link.'],
    ['O 10.1.0.0/16, learned by OSPF', false, 'An internal prefix.'],
    ['L 192.168.1.1/32', false, 'The router\'s own LAN address.'],
  ], 'The asterisk marks a candidate default. Here a static route, ip route 0.0.0.0 0.0.0.0 203.0.113.1, is the gateway of last resort. OSPF can also originate a default with default-information originate.', { exhibit: X(RT, ...RT_MARKS) }),
  Q('b3-rt-17', 'IPC', 't3-table', 'What does "variably subnetted, 4 subnets, 3 masks" tell you?', [
    ['Routes inside 10.0.0.0/8 use several different prefix lengths', true, 'VLSM in use.'],
    ['The table is corrupted', false, 'It is informational.'],
    ['There are 4 routers', false, 'It counts subnets.'],
    ['Three routes are missing', false, 'No.'],
  ], 'IOS groups routes under their classful parent network and reports how many subnets and distinct masks it holds. It is just bookkeeping; the routes below are what matter.', { exhibit: X(RT, ...RT_MARKS) }),
  Q('b3-rt-18', 'IPC', 't3-table', 'Which statement about the metric is true?', [
    ['It compares routes to the same prefix from the same routing protocol', true, 'AD compares across sources.'],
    ['It decides between routes of different lengths', false, 'Longest match does that.'],
    ['Higher is better', false, 'Lower is better.'],
    ['It is the same in every protocol', false, 'OSPF uses cost, RIP hop count.'],
  ], 'Selection order: longest prefix first; for equal prefixes, lowest administrative distance; within one protocol, lowest metric; equal metrics are load-balanced.'),
  Q('b3-rt-19', 'IPC', 't3-table', 'A router has routes 10.0.0.0/8 via R2, 10.10.0.0/16 via R3 and 10.10.10.0/24 via R4. Where does a packet to 10.10.20.5 go?', [
    ['R3', true, '10.10.0.0/16 is the longest match.'],
    ['R4', false, '10.10.10.0/24 does not contain 10.10.20.5.'],
    ['R2', false, 'Less specific than the /16.'],
    ['It is dropped', false, 'Two routes match.'],
  ], '10.10.20.5 is inside 10.0.0.0/8 and 10.10.0.0/16 but not 10.10.10.0/24, which only covers 10.10.10.0 to 10.10.10.255. Of the routes that match, the /16 via R3 is the most specific.'),
  Q('b3-rt-20', 'IPC', 't3-table', 'What happens to a route learned with administrative distance 255?', [
    ['It is never installed in the routing table', true, '255 means untrusted.'],
    ['It is always preferred', false, 'The opposite.'],
    ['It is used as a backup', false, 'Never used.'],
    ['It is load-balanced', false, 'Never installed.'],
  ], 'AD 255 means "unknown source, do not use". Setting a route\'s distance to 255 is a way to keep it out of the table without deleting its configuration.'),

  // ---------- t3-forwarding ----------
  Q('b3-fw-01', 'IPC', 't3-forwarding', 'Put the router\'s forwarding steps in the right order. Which comes first after a frame arrives?', [
    ['Check the frame\'s FCS and destination MAC, then strip the Layer 2 header', true, 'De-encapsulate first.'],
    ['Look up the routing table', false, 'That follows de-encapsulation.'],
    ['ARP for the next hop', false, 'Last, before the new frame.'],
    ['Decrement the TTL', false, 'After deciding the packet is to be routed.'],
  ], 'A router: checks the FCS and that the frame is for its MAC, removes the Layer 2 header, checks the IP header and decrements TTL, finds the longest-match route, resolves the next hop\'s MAC (ARP or CEF adjacency), and builds a new frame out the exit interface.'),
  Q('b3-fw-02', 'IPC', 't3-forwarding', 'What does the router do when a packet\'s TTL reaches 0?', [
    ['Drops it and sends ICMP Time Exceeded to the source', true, 'Prevents endless loops.'],
    ['Forwards it with TTL 255', false, 'TTL is never reset by routers.'],
    ['Sends it to the default route', false, 'Dropped first.'],
    ['Stores it until a route appears', false, 'Routers do not queue for routes.'],
  ], 'Every router decrements the TTL. At zero the packet dies and an ICMP Time Exceeded goes back. traceroute exploits exactly this, sending probes with TTL 1, 2, 3 to make each hop identify itself.'),
  Q('b3-fw-03', 'IPC', 't3-forwarding', 'What do the symbols in this ping output mean?', [
    ['Four replies arrived and one timed out (the first, typically while ARP resolved)', true, '. is a timeout, ! a reply.'],
    ['Four packets were lost and one succeeded', false, 'Reversed.'],
    ['The target is unreachable', false, 'U would show that.'],
    ['The TTL expired', false, 'That shows &.'],
  ], 'IOS ping symbols: ! reply, . timeout, U destination unreachable received, & TTL exceeded, M could not fragment. A first dot followed by bangs is normal: the first packet was dropped while the router resolved ARP.', {
    exhibit: X(`
R1#ping 10.0.23.3
Type escape sequence to abort.
Sending 5, 100-byte ICMP Echos to 10.0.23.3, timeout is 2 seconds:
.!!!!
Success rate is 80 percent (4/5), round-trip min/avg/max = 1/2/4 ms`,
      ['ping 10.0.23.3', 'cmd'], ['10.0.23.3', 'ip'], [/^\./m, 'fail', 'Timeout (.)'], [/!!!!/, 'ok', 'Replies (!)'], ['80 percent (4/5)', 'count', 'Success rate']),
  }),
  Q('b3-fw-04', 'IPC', 't3-forwarding', 'This ping prints U.U.U. What does it tell you?', [
    ['A router along the way has no route and is sending ICMP unreachable back', true, 'U means an unreachable message arrived.'],
    ['The target is down but reachable', false, 'That would show timeouts.'],
    ['The path works', false, 'No replies.'],
    ['The TTL is too small', false, 'That shows &.'],
  ], 'U means someone answered "I cannot get there". That narrows the fault to a router missing a route (or an ACL rejecting with unreachables). Dots alone mean nothing came back at all: a silent drop, a down host, or a broken return path.', {
    exhibit: X(`
R1#ping 172.16.50.10
Sending 5, 100-byte ICMP Echos to 172.16.50.10, timeout is 2 seconds:
U.U.U
Success rate is 0 percent (0/5)`,
      ['ping 172.16.50.10', 'cmd'], ['172.16.50.10', 'ip'], ['U.U.U', 'fail', 'Unreachable (U)'], ['0 percent (0/5)', 'fail', 'Nothing came back']),
  }),
  Q('b3-fw-05', 'IPC', 't3-forwarding', 'Where does this path fail?', [
    ['After 10.0.23.3: the third hop does not answer', true, 'Hops 1 and 2 reply, then asterisks.'],
    ['At R1 itself', false, 'Hop 1 answered.'],
    ['At 10.0.12.2', false, 'Hop 1 answered.'],
    ['Nowhere; traceroute always shows asterisks', false, 'Asterisks mean no reply.'],
  ], 'Each line is one hop answering with Time Exceeded. 10.0.12.2 and 10.0.23.3 answered; from hop 3 on nothing replied. Start at the last good hop: does 10.0.23.3 have a route onward, and does the next router have a route back?', {
    exhibit: X(`
R1#traceroute 192.168.9.9
Type escape sequence to abort.
Tracing the route to 192.168.9.9
  1 10.0.12.2 2 msec 1 msec 1 msec
  2 10.0.23.3 2 msec 2 msec 3 msec
  3  *  *  *
  4  *  *  *`,
      ['traceroute 192.168.9.9', 'cmd'], ['192.168.9.9', 'ip', 'Destination'], [/10\.0\.(12\.2|23\.3)/, 'hop', 'Hop that answered'], [/ {2}\*  \*  \*/, 'fail', 'No answer']),
  }),
  Q('b3-fw-06', 'IPC', 't3-forwarding', 'A ping from R1 to R3\'s LAN times out, but R3 can see the pings arriving with debug. What is the most likely problem?', [
    ['R3 has no route back to R1\'s source address', true, 'The reply has nowhere to go.'],
    ['R1 has no route to R3', false, 'The pings arrive.'],
    ['R3\'s interface is down', false, 'It received the pings.'],
    ['ARP failed on R1', false, 'The pings left R1.'],
  ], 'Reachability is two one-way trips. A ping that arrives but never returns points at the return path: R3 or a router between needs a route to R1\'s source subnet. Check with show ip route on R3 or ping back with a source interface.'),
  Q('b3-fw-07', 'IPC', 't3-forwarding', 'What is CEF?', [
    ['Cisco Express Forwarding: a FIB and adjacency table built from the routing and ARP tables for fast hardware or software forwarding', true, 'The default switching method.'],
    ['A routing protocol', false, 'It forwards; it does not learn routes.'],
    ['A type of cable', false, 'No.'],
    ['A firewall feature', false, 'No.'],
  ], 'Process switching looks up every packet in software. CEF precomputes a forwarding information base from the routing table and an adjacency table with ready-made Layer 2 headers, so forwarding is a quick lookup. It is on by default.'),
  Q('b3-fw-08', 'IPC', 't3-forwarding', 'Which addresses does R1 put in the frame when forwarding a packet from PC1 (10.1.1.10) to a server (10.3.3.30) via next hop R2?', [
    ['Source MAC R1, destination MAC R2; source IP 10.1.1.10, destination IP 10.3.3.30', true, 'MACs change per hop, IPs do not.'],
    ['Source MAC PC1, destination MAC server', false, 'MACs are only local to the link.'],
    ['Source IP R1, destination IP R2', false, 'IPs stay end to end without NAT.'],
    ['Destination MAC ffff.ffff.ffff', false, 'Not a broadcast.'],
  ], 'Layer 3 addresses describe the whole journey, Layer 2 addresses describe the current hop. R1 rewrites the frame with its own MAC as source and R2\'s MAC as destination, leaving the IP addresses alone.'),
  Q('b3-fw-09', 'IPC', 't3-forwarding', 'Which command pings a remote host using R1\'s LAN interface as the source address?', [
    ['ping 10.3.3.30 source GigabitEthernet0/1', true, 'Tests the path for that subnet.'],
    ['ping 10.3.3.30 from g0/1', false, 'Not valid syntax.'],
    ['ping g0/1 10.3.3.30', false, 'Not valid.'],
    ['traceroute source', false, 'Incomplete.'],
  ], 'By default a router pings from the exit interface\'s address, which may be a link the far side already knows. Sourcing from the LAN interface tests what users experience, including the far end\'s return route to the LAN.', { console: true }),
  Q('b3-fw-10', 'IPC', 't3-forwarding', 'A host sends traffic to a destination on its own subnet. What does it need?', [
    ['The destination\'s MAC address, learned by ARP', true, 'Delivered directly, no router.'],
    ['The default gateway\'s MAC', false, 'Only for off-subnet traffic.'],
    ['A route in the router', false, 'No router is involved.'],
    ['A DNS server', false, 'Only for names.'],
  ], 'Hosts decide local or remote by comparing the destination with their own address and mask. Local destinations are reached directly by ARPing for them; remote ones are sent to the gateway\'s MAC.'),
  Q('b3-fw-11', 'IPC', 't3-forwarding', 'What does the & symbol in IOS ping output mean?', [
    ['The packet\'s TTL expired in transit', true, 'A Time Exceeded came back, often a loop.'],
    ['Success', false, 'That is !.'],
    ['Timeout', false, 'That is a dot.'],
    ['Destination unreachable', false, 'That is U.'],
  ], 'A ping returning & means a router decremented TTL to zero, which in a normal path with a high TTL usually means a routing loop. traceroute to the destination will show the hops repeating.', { console: true }),
  Q('b3-fw-12', 'IPC', 't3-forwarding', 'This traceroute shows two routers alternating forever. What is wrong?', [
    ['A routing loop: each router points to the other for this destination', true, 'Packets bounce until TTL expires.'],
    ['The destination is down', false, 'A loop is visible before it.'],
    ['ICMP is blocked', false, 'Hops are answering.'],
    ['Normal load balancing', false, 'Load balancing does not repeat hops back and forth.'],
  ], 'Hops that ping-pong between the same two addresses are the signature of a loop, usually two static routes pointing at each other or a default route on each side. Fix one router\'s route to the destination.', {
    exhibit: X(`
R1#traceroute 172.30.1.1
  1 10.0.12.2 1 msec 1 msec 1 msec
  2 10.0.12.1 1 msec 2 msec 1 msec
  3 10.0.12.2 2 msec 1 msec 2 msec
  4 10.0.12.1 2 msec 2 msec 2 msec`,
      ['traceroute 172.30.1.1', 'cmd'], ['172.30.1.1', 'ip', 'Destination'], [/10\.0\.12\.[12]/, 'fail', 'Hops repeating']),
  }),
  Q('b3-fw-13', 'IPC', 't3-forwarding', 'Which statement about how routers handle broadcasts is correct?', [
    ['Routers do not forward broadcasts between interfaces by default', true, 'Broadcasts stop at the router.'],
    ['Routers forward all broadcasts', false, 'That would merge broadcast domains.'],
    ['Routers convert broadcasts to multicasts', false, 'No.'],
    ['Routers forward only ARP broadcasts', false, 'ARP stays local.'],
  ], 'Each router interface is the edge of a broadcast domain. That is why DHCP Discover broadcasts need ip helper-address to cross a router, and why ARP only resolves addresses on the local link.'),
  Q('b3-fw-14', 'IPC', 't3-forwarding', 'What is the router\'s ARP table used for when forwarding?', [
    ['To find the MAC address of the next hop (or a directly connected destination)', true, 'Builds the outgoing frame.'],
    ['To choose the best route', false, 'The routing table does that.'],
    ['To block traffic', false, 'ACLs do that.'],
    ['To assign IP addresses', false, 'DHCP does that.'],
  ], 'The routing table answers "which next hop", ARP answers "what is that next hop\'s MAC". show ip arp lists them; an Incomplete entry means the router asked and nobody answered, often a down neighbor or wrong address.'),
  Q('b3-fw-15', 'IPC', 't3-forwarding', 'An entry in show ip arp shows "Incomplete" for the next hop 10.0.12.2. What does that indicate?', [
    ['R1 sent an ARP request for 10.0.12.2 and got no reply', true, 'The neighbor is not answering ARP.'],
    ['The entry is static', false, 'Static entries show a MAC.'],
    ['The neighbor is reachable', false, 'No MAC was learned.'],
    ['The routing table is full', false, 'Unrelated.'],
  ], 'Incomplete means ARP is unresolved. Check that the neighbor is up, in the same subnet, on the same VLAN, and that the address is not mistyped in the route or the neighbor\'s interface.', { console: true }),
  Q('b3-fw-16', 'IPC', 't3-forwarding', 'Which ping result shows the path works end to end?', [
    ['!!!!!', true, 'Five replies.'],
    ['.....', false, 'Five timeouts.'],
    ['UUUUU', false, 'Unreachable messages.'],
    ['&&&&&', false, 'TTL expired.'],
  ], 'Five exclamation marks means five echo replies. A successful ping proves both directions work, which is more than a route in your own table can tell you.', { console: true }),
  Q('b3-fw-17', 'IPC', 't3-forwarding', 'Which IPv4 header field does a router change on every hop?', [
    ['TTL (and so the header checksum)', true, 'Decremented each hop.'],
    ['Destination IP', false, 'Unchanged without NAT.'],
    ['Source IP', false, 'Unchanged without NAT.'],
    ['Protocol', false, 'Unchanged.'],
  ], 'A router decrements TTL and recomputes the header checksum because the header changed. Everything else in the IP header stays the same unless NAT or QoS marking rewrites it.'),
  Q('b3-fw-18', 'IPC', 't3-forwarding', 'A user can ping the server by IP but traceroute shows the last hops as * * * even though the ping works. Why?', [
    ['The server or a firewall does not send ICMP Time Exceeded or port unreachable replies to traceroute probes', true, 'Many hosts filter them.'],
    ['The path is broken', false, 'Ping works.'],
    ['The DNS server is wrong', false, 'Unrelated to traceroute stars.'],
    ['TTL is too high', false, 'Not the cause.'],
  ], 'Asterisks only mean no answer to the probe. Hosts and firewalls often drop traceroute\'s UDP or ICMP probes while still answering ping. Interpret stars together with whether the destination is reachable another way.'),

  // ---------- t3-static ----------
  Q('b3-st-01', 'IPC', 't3-static', 'Which command creates a static route to 192.168.30.0/24 via next hop 10.0.12.2?', [
    ['ip route 192.168.30.0 255.255.255.0 10.0.12.2', true, 'Network, mask, next hop.'],
    ['ip route 192.168.30.0/24 10.0.12.2', false, 'IOS IPv4 static routes take a dotted mask.'],
    ['route add 192.168.30.0 mask 255.255.255.0 10.0.12.2', false, 'That is Windows syntax.'],
    ['ip route 10.0.12.2 192.168.30.0 255.255.255.0', false, 'Order is wrong.'],
  ], 'ip route network mask {next-hop | exit-interface [next-hop]} [distance]. Using the network address (not a host address) with the matching mask is required; IOS rejects a mismatch.', { console: true }),
  Q('b3-st-02', 'IPC', 't3-static', 'Which command creates a default route to 203.0.113.1?', [
    ['ip route 0.0.0.0 0.0.0.0 203.0.113.1', true, 'All-zero network and mask.'],
    ['ip default-gateway 203.0.113.1', false, 'Used only when routing is off.'],
    ['ip route default 203.0.113.1', false, 'Not valid.'],
    ['ip default-network 203.0.113.1', false, 'A legacy command for classful networks.'],
  ], 'The default route catches everything with no more specific match and becomes the gateway of last resort. Routers use ip route 0.0.0.0 0.0.0.0; ip default-gateway is for switches and routers with ip routing disabled.', { console: true }),
  Q('b3-st-03', 'IPC', 't3-static', 'What is a floating static route?', [
    ['A backup static route with a higher administrative distance than the primary, used only if the primary disappears', true, 'It floats above the primary.'],
    ['A route that moves between interfaces', false, 'No.'],
    ['A static route with AD 0', false, 'Static routes cannot use 0.'],
    ['A route learned by DHCP', false, 'No.'],
  ], 'Add a distance to the static route, for example ip route 0.0.0.0 0.0.0.0 10.0.13.3 5. While the primary (AD 1, or an OSPF route at 110 if you use AD 120 for the backup) exists, the floating route stays out of the table; it installs when the primary is removed.', { console: true }),
  Q('b3-st-04', 'IPC', 't3-static', 'R1 learns 10.50.0.0/16 by OSPF. Which backup static route will only be used if the OSPF route disappears?', [
    ['ip route 10.50.0.0 255.255.0.0 10.0.13.3 115', true, 'AD 115 is above OSPF\'s 110.'],
    ['ip route 10.50.0.0 255.255.0.0 10.0.13.3', false, 'AD 1 beats OSPF and becomes primary.'],
    ['ip route 10.50.0.0 255.255.0.0 10.0.13.3 100', false, '100 is below 110, so it wins.'],
    ['ip route 10.50.0.0 255.255.0.0 10.0.13.3 255', false, '255 is never installed at all.'],
  ], 'A floating static must have a higher AD than the route it backs up. Against OSPF (110) any value from 111 to 254 works. 255 means never install, so it would never take over.', { console: true }),
  Q('b3-st-05', 'IPC', 't3-static', 'Which is a host route?', [
    ['ip route 10.9.9.9 255.255.255.255 10.0.12.2', true, 'A /32 to one address.'],
    ['ip route 10.9.9.0 255.255.255.0 10.0.12.2', false, 'A network route.'],
    ['ip route 0.0.0.0 0.0.0.0 10.0.12.2', false, 'A default route.'],
    ['ip route 10.0.0.0 255.0.0.0 10.0.12.2', false, 'A network route.'],
  ], 'Host routes (/32 for IPv4, /128 for IPv6) match exactly one address. Because they are the most specific possible, they override any network route, which is useful to steer traffic to one server along a particular path.', { console: true }),
  Q('b3-st-06', 'IPC', 't3-static', 'After adding the floating route, the primary link fails and is removed. Which route does R1 now use for the default?', [
    ['The floating route via 10.0.13.3 with AD 5', true, 'It installs when the primary is gone.'],
    ['None; the primary must return first', false, 'The floating route takes over.'],
    ['Both, load-balanced', false, 'Different ADs never share.'],
    ['A route via 203.0.113.1', false, 'That route is gone.'],
  ], 'Floating statics sit in the configuration but not the table while a better route exists. When the AD 1 route is withdrawn (its interface goes down), the AD 5 route installs within seconds. Note: if the primary link stays up while the provider fails beyond it, the static route will not know; tracking with IP SLA solves that.', {
    exhibit: X(`
ip route 0.0.0.0 0.0.0.0 203.0.113.1
ip route 0.0.0.0 0.0.0.0 10.0.13.3 5`,
      ['203.0.113.1', 'hop', 'Primary next hop'], ['10.0.13.3', 'hop', 'Backup next hop'], [/ 5$/m, 'metric', 'AD 5']),
  }),
  Q('b3-st-07', 'IPC', 't3-static', 'Which IPv6 static route is valid with a link-local next hop?', [
    ['ipv6 route 2001:db8:2::/64 GigabitEthernet0/0 fe80::2', true, 'Link-local next hops need the exit interface.'],
    ['ipv6 route 2001:db8:2::/64 fe80::2', false, 'Ambiguous: fe80::2 could be on any link.'],
    ['ip route 2001:db8:2::/64 fe80::2', false, 'ip route is IPv4.'],
    ['ipv6 route 2001:db8:2:: 255.255.255.0 fe80::2', false, 'IPv6 uses prefix lengths.'],
  ], 'Every interface has link-local addresses in the same fe80::/10 range, so a link-local next hop is meaningless without the interface. A global next hop can stand alone.', { console: true }),
  Q('b3-st-08', 'IPC', 't3-static', 'R1 and R2 each have a static route for the other\'s LAN. PCs on R1\'s LAN still cannot reach R3\'s LAN behind R2. What is missing?', [
    ['A route on R1 to R3\'s LAN, and a route back from R3 to R1\'s LAN', true, 'Both directions need routes.'],
    ['A default gateway on R2', false, 'Routers use routes, not gateways.'],
    ['ip routing on R1', false, 'On by default.'],
    ['A trunk', false, 'Unrelated.'],
  ], 'Every router in the path needs a route to the destination, and every router on the way back needs a route to the source. With statics, list every remote subnet on every router (or use defaults at the edges).'),
  Q('b3-st-09', 'IPC', 't3-static', 'What is the administrative distance of a static route that names only an exit interface?', [
    ['1, the same as a next-hop static', true, 'All statics default to 1.'],
    ['0', false, 'Only connected routes have 0.'],
    ['5', false, 'Not a default.'],
    ['110', false, 'OSPF.'],
  ], 'All static routes default to AD 1 regardless of form. They display as "directly connected" when they name only an exit interface, which is easy to misread as AD 0; check with show ip route 10.20.0.0, which prints the distance.'),
  Q('b3-st-10', 'IPC', 't3-static', 'Why is a fully specified static route (exit interface plus next hop) recommended on Ethernet?', [
    ['The router ARPs only for the next hop instead of for every destination', true, 'Avoids proxy ARP dependence.'],
    ['It has a lower AD', false, 'Same AD.'],
    ['It encrypts traffic', false, 'No.'],
    ['It is required for IPv4', false, 'Not required, recommended.'],
  ], 'With only an exit interface on a multiaccess link, the router treats every destination as directly connected and ARPs for each, relying on the neighbor\'s proxy ARP. Naming the next hop too avoids that and the recursive lookup.'),
  Q('b3-st-11', 'IPC', 't3-static', 'R2 cannot reach 192.168.3.0/24 behind R3. Based on R2\'s table, what should be added?', [
    ['ip route 192.168.3.0 255.255.255.0 10.0.23.3', true, 'R3 is the next hop on the 10.0.23.0/30 link.'],
    ['ip route 192.168.3.0 255.255.255.0 10.0.12.1', false, 'That points back to R1.'],
    ['ip route 10.0.23.0 255.255.255.252 10.0.23.3', false, 'The link is already connected.'],
    ['ip route 192.168.1.0 255.255.255.0 10.0.23.3', false, 'Wrong destination.'],
  ], 'R2 knows its connected links and R1\'s LAN, but nothing about 192.168.3.0/24. The next hop must be the neighbor that can reach it, R3 at 10.0.23.3, on a link R2 is connected to.', {
    exhibit: X(`
R2#show ip route | begin Gateway
Gateway of last resort is not set
      10.0.0.0/8 is variably subnetted, 4 subnets, 2 masks
C        10.0.12.0/30 is directly connected, GigabitEthernet0/0
L        10.0.12.2/32 is directly connected, GigabitEthernet0/0
C        10.0.23.0/30 is directly connected, GigabitEthernet0/1
L        10.0.23.2/32 is directly connected, GigabitEthernet0/1
S     192.168.1.0/24 [1/0] via 10.0.12.1`,
      ['show ip route | begin Gateway', 'cmd'], ['Gateway of last resort is not set', 'fail', 'No default route'], [/^(C|L|S)(?= )/m, 'code'], [/\[1\/0\]/, 'metric'], ['via 10.0.12.1', 'hop'], [/GigabitEthernet0\/\d/, 'iface'], [/10\.0\.23\.0\/30/, 'ip', 'Link to R3']),
  }),
  Q('b3-st-12', 'IPC', 't3-static', 'Which command removes the static route ip route 10.8.0.0 255.255.0.0 10.0.12.2?', [
    ['no ip route 10.8.0.0 255.255.0.0 10.0.12.2', true, 'no plus the same line.'],
    ['delete ip route 10.8.0.0', false, 'Not IOS syntax.'],
    ['clear ip route 10.8.0.0', false, 'Clears from the table, but the config re-adds it.'],
    ['no route 10.8.0.0', false, 'Not valid.'],
  ], 'Configuration is removed with no. clear ip route only flushes a route from the table temporarily; a configured static comes straight back.', { console: true }),
  Q('b3-st-13', 'IPC', 't3-static', 'Which network is a stub network where a single default route is the right design?', [
    ['A branch with one link to headquarters and no other exits', true, 'Every destination is through the same link.'],
    ['A core with many paths', false, 'Needs dynamic routing.'],
    ['A data center with ECMP', false, 'Multiple paths.'],
    ['An internet exchange', false, 'Full routing tables.'],
  ], 'If a network has only one way out, listing every remote prefix is pointless: one default route does the job. The hub then needs specific routes back to the branch LAN.'),
  Q('b3-st-14', 'IPC', 't3-static', 'A static route via 10.0.12.2 is configured but does not appear in show ip route. show ip interface brief shows Gi0/0 (10.0.12.1/30) as down/down. Why?', [
    ['The next hop is not resolvable because the connected network went down with the interface', true, 'No connected route, no next hop.'],
    ['Static routes need OSPF', false, 'No.'],
    ['The AD is too high', false, 'Default AD 1.'],
    ['The route has a typo', false, 'The cause is the down interface.'],
  ], 'When Gi0/0 goes down, 10.0.12.0/30 leaves the table, so 10.0.12.2 is no longer reachable and IOS withdraws the static route. That withdrawal is what lets a floating static take over.'),
  Q('b3-st-15', 'IPC', 't3-static', 'Which IPv6 default route sends traffic out Gi0/1 to next hop 2001:db8:ff::1?', [
    ['ipv6 route ::/0 GigabitEthernet0/1 2001:db8:ff::1', true, 'Fully specified IPv6 default.'],
    ['ipv6 route 0::0/128 2001:db8:ff::1', false, '/128 is a host route.'],
    ['ipv6 default-route 2001:db8:ff::1', false, 'Not valid.'],
    ['ip route ::/0 2001:db8:ff::1', false, 'ip route is IPv4.'],
  ], 'IPv6 static routes mirror IPv4: ::/0 for default, a prefix/length for networks and /128 for hosts, with an exit interface, a next hop, or both. Remember ipv6 unicast-routing must be on.', { console: true }),
  Q('b3-st-16', 'IPC', 't3-static', 'Which two statements about static routes are true? (Choose two.)', [
    ['They do not adapt to topology changes beyond their own interface or next hop', true, 'No dynamic awareness.'],
    ['They add no routing protocol overhead or traffic', true, 'Nothing is exchanged.'],
    ['They have an AD of 110', false, 'Default is 1.'],
    ['They are learned automatically from neighbors', false, 'They are typed by hand.'],
  ], 'Static routes are predictable, secure and cost no CPU or bandwidth, but they do not scale and they cannot react to failures past the next hop. Dynamic protocols like OSPF trade some overhead for adaptability.'),
  Q('b3-st-17', 'IPC', 't3-static', 'R1 has ip route 0.0.0.0 0.0.0.0 10.0.12.2 and R2 has ip route 0.0.0.0 0.0.0.0 10.0.12.1. A packet to 8.8.8.8 enters R1. What happens?', [
    ['It loops between R1 and R2 until TTL expires', true, 'Each points its default at the other.'],
    ['It reaches the internet', false, 'Neither has an exit to the internet.'],
    ['R1 drops it immediately', false, 'R1 has a default route.'],
    ['R2 sends it back as unreachable', false, 'R2 also has a default.'],
  ], 'Two routers pointing default routes at each other loop any unknown destination. Only one of them, the one with the internet exit, should have that default; the other needs specific routes or a default toward the exit.'),
  Q('b3-st-18', 'IPC', 't3-static', 'What does this configuration achieve on R1?', [
    ['Traffic to the server at 10.5.5.5 takes R3, while the rest of 10.5.5.0/24 takes R2', true, 'The /32 is more specific.'],
    ['All of 10.5.5.0/24 is load-balanced', false, 'Different prefix lengths do not load-balance.'],
    ['The host route is ignored', false, 'Longest match wins.'],
    ['Traffic to 10.5.5.5 is dropped', false, 'It is routed via R3.'],
  ], 'Longest match lets you steer one host differently from its subnet. The /32 via 10.0.13.3 overrides the /24 via 10.0.12.2 for that single address only.', {
    exhibit: X(`
ip route 10.5.5.0 255.255.255.0 10.0.12.2
ip route 10.5.5.5 255.255.255.255 10.0.13.3`,
      ['10.5.5.0', 'ip', 'Network route'], ['10.5.5.5', 'ip', 'Host route'], ['255.255.255.255', 'mask', '/32'], ['255.255.255.0', 'mask'], [/10\.0\.1[23]\.[23]/, 'hop']),
  }),
  Q('b3-st-19', 'IPC', 't3-static', 'Which command shows only the static routes?', [
    ['show ip route static', true, 'Filters by source.'],
    ['show ip static', false, 'Not valid.'],
    ['show running-config | include ip route', false, 'Shows configured routes, not which are installed.'],
    ['show ip route connected', false, 'Connected only.'],
  ], 'Comparing show running-config | include ip route (what you configured) with show ip route static (what is installed) quickly shows which statics were withdrawn, for example because their next hop is unreachable or they are floating.', { console: true }),
  Q('b3-st-20', 'IPC', 't3-static', 'This route was entered and rejected. Why?', [
    ['192.168.3.1 is a host address, not the network address for /24', true, 'The network is 192.168.3.0.'],
    ['The next hop is wrong', false, 'The error is about the mask.'],
    ['Static routes need a distance', false, 'Optional.'],
    ['The router is in the wrong mode', false, 'It is in global configuration.'],
  ], 'IOS requires the destination to be a network address that matches its mask. 192.168.3.1 with 255.255.255.0 has host bits set, so it prints "%Inconsistent address and mask". Use 192.168.3.0.', {
    exhibit: X(`
R1(config)#ip route 192.168.3.1 255.255.255.0 10.0.12.2
%Inconsistent address and mask`,
      ['R1(config)#', 'prompt'], ['192.168.3.1', 'fail', 'Host bits set'], ['255.255.255.0', 'mask'], ['10.0.12.2', 'hop'], ['%Inconsistent address and mask', 'fail', 'The error']),
  }),
  Q('b3-st-21', 'IPC', 't3-static', 'Which feature lets a static default route be removed when the provider beyond a still-up link stops answering?', [
    ['IP SLA tracking on the static route', true, 'ip route ... track N.'],
    ['A floating static route alone', false, 'It cannot see failures past the link.'],
    ['PortFast', false, 'STP feature.'],
    ['HSRP preempt', false, 'Gateway redundancy.'],
  ], 'A static route only notices its own link going down. IP SLA pings a target beyond the provider; tying the route to that probe with track removes it when the probe fails, so the floating backup can take over.'),
  Q('b3-st-22', 'IPC', 't3-static', 'Which IPv4 static route sends all traffic for 172.16.0.0/12 out Serial0/0/0 to 10.9.9.2?', [
    ['ip route 172.16.0.0 255.240.0.0 Serial0/0/0 10.9.9.2', true, '/12 is 255.240.0.0.'],
    ['ip route 172.16.0.0 255.255.0.0 Serial0/0/0 10.9.9.2', false, 'That is /16.'],
    ['ip route 172.16.0.0 255.248.0.0 Serial0/0/0 10.9.9.2', false, 'That is /13.'],
    ['ip route 172.16.0.0 0.15.255.255 Serial0/0/0 10.9.9.2', false, 'That is a wildcard.'],
  ], '/12 leaves 4 network bits in the second octet: 255.240.0.0, block of 16 (172.16 to 172.31). Static routes always take subnet masks, never wildcards.', { console: true }),
];
