// Tree 3, IP Connectivity, part B: single-area OSPFv2 (configuration,
// neighbors, DR/BDR, cost, verification and faults) and first hop
// redundancy (HSRP, VRRP, GLBP).

import { Q, X } from './qb.js';

const NBR = `
R1#show ip ospf neighbor
Neighbor ID     Pri   State           Dead Time   Address         Interface
2.2.2.2           1   FULL/DR         00:00:35    10.0.0.2        GigabitEthernet0/0
3.3.3.3           1   2WAY/DROTHER    00:00:31    10.0.0.3        GigabitEthernet0/0
4.4.4.4           0   FULL/  -        00:00:38    10.0.14.4       GigabitEthernet0/1`;
const NBR_MARKS = [
  ['show ip ospf neighbor', 'cmd'], [/^\d\.\d\.\d\.\d/m, 'key', 'Neighbor router ID'], [/FULL\/DR|FULL\/  -/, 'ok', 'Full adjacency'],
  ['2WAY/DROTHER', 'state', '2-Way (normal between DROTHERs)'], [/00:00:\d\d/, 'count', 'Dead timer counting down'],
  [/10\.0\.(0\.[23]|14\.4)/, 'ip', 'Neighbor interface address'], [/GigabitEthernet0\/\d/, 'iface'],
];

export const T3_B = [
  // ---------- t3-ospf: concepts ----------
  Q('b3-os-01', 'IPC', 't3-ospf', 'What kind of routing protocol is OSPF?', [
    ['Link-state: each router builds a full map of the area and runs SPF', true, 'Dijkstra\'s shortest path first.'],
    ['Distance-vector: routers share only their routing tables', false, 'That is RIP.'],
    ['Path-vector', false, 'That is BGP.'],
    ['Static', false, 'OSPF is dynamic.'],
  ], 'OSPF routers flood link-state advertisements so every router in an area holds the same link-state database. Each then runs SPF with itself as the root to compute its own best paths.'),
  Q('b3-os-02', 'IPC', 't3-ospf', 'How is the OSPF router ID chosen when none is configured?', [
    ['The highest IP address on an up loopback; if none, the highest on an up physical interface', true, 'The standard order.'],
    ['The lowest IP address on any interface', false, 'Highest wins.'],
    ['The MAC address of the first interface', false, 'RIDs are IPv4-format numbers.'],
    ['Randomly at each boot', false, 'Deterministic.'],
  ], 'Order: router-id command, then highest loopback IP, then highest active physical interface IP. The RID is chosen when the process starts; changing it later takes clear ip ospf process (or a reload).'),
  Q('b3-os-03', 'IPC', 't3-ospf', 'Which multicast addresses does OSPFv2 use? (Choose two.)', [
    ['224.0.0.5, all OSPF routers', true, 'Hellos and updates from DR.'],
    ['224.0.0.6, all DR and BDR routers', true, 'Updates sent to the DR/BDR.'],
    ['224.0.0.9', false, 'RIPv2.'],
    ['224.0.0.10', false, 'EIGRP.'],
  ], 'OSPF runs directly over IP (protocol 89). Hellos go to 224.0.0.5. On multiaccess segments, DROTHERs send updates to 224.0.0.6 (DR and BDR), and the DR floods them back out to 224.0.0.5.'),
  Q('b3-os-04', 'IPC', 't3-ospf', 'What are the default OSPF hello and dead intervals on an Ethernet link?', [
    ['10 seconds and 40 seconds', true, 'Broadcast and point-to-point defaults.'],
    ['30 and 120 seconds', false, 'Non-broadcast defaults.'],
    ['2 and 20 seconds', false, 'STP-like.'],
    ['60 and 180 seconds', false, 'CDP.'],
  ], 'Neighbors must agree on both timers to become neighbors. The dead timer counts down from 40 and resets with every hello; reaching zero tears the adjacency down.'),
  Q('b3-os-05', 'IPC', 't3-ospf', 'Which must match between two routers for an OSPF adjacency to form? (Choose two.)', [
    ['Area ID, and the subnet and mask on the link', true, 'Same area and same network.'],
    ['Hello and dead intervals', true, 'Timers must match.'],
    ['Router IDs', false, 'Router IDs must be unique, not equal.'],
    ['OSPF process IDs', false, 'Process IDs are local and may differ.'],
  ], 'Neighbors must match: area, subnet and mask, hello and dead timers, authentication, area type (stub flags), and MTU for the database exchange. Router IDs must differ. The process ID is local to each router.'),
  Q('b3-os-06', 'IPC', 't3-ospf', 'Two OSPF routers on a link use process IDs 1 and 10. Will they form an adjacency?', [
    ['Yes; process IDs are locally significant', true, 'They do not have to match.'],
    ['No; process IDs must match', false, 'A common trap.'],
    ['Only if both are in area 10', false, 'Unrelated.'],
    ['Only after a reload', false, 'No.'],
  ], 'router ospf <process-id> only names the process on that router. Two neighbors with different process IDs form adjacencies normally, as long as area, subnet, timers and the rest match.'),
  Q('b3-os-07', 'IPC', 't3-ospf', 'What is the order of OSPF neighbor states to reach full adjacency?', [
    ['Down, Init, 2-Way, ExStart, Exchange, Loading, Full', true, 'The full sequence.'],
    ['Down, 2-Way, Init, Full', false, 'Out of order and incomplete.'],
    ['Init, ExStart, 2-Way, Full', false, 'Out of order.'],
    ['Listen, Learn, Forward', false, 'STP-like states.'],
  ], 'Init means "I heard you", 2-Way means "you heard me too". DR/BDR election happens at 2-Way. ExStart picks who leads the database exchange, Exchange swaps LSA summaries, Loading requests missing LSAs, and Full means the databases match.'),
  Q('b3-os-08', 'IPC', 't3-ospf', 'An OSPF neighbor is stuck in ExStart/Exchange. What is the classic cause?', [
    ['An MTU mismatch on the link', true, 'Database description packets are rejected.'],
    ['Different process IDs', false, 'Allowed.'],
    ['Mismatched hello timers', false, 'That would prevent reaching 2-Way.'],
    ['Wrong area', false, 'That would prevent adjacency entirely.'],
  ], 'Hellos are small, so mismatched MTUs still reach 2-Way. The database descriptions are large and get rejected, so the routers loop in ExStart or Exchange. Match the MTU (or, as a workaround, ip ospf mtu-ignore).'),

  // ---------- t3-ospf: config ----------
  Q('b3-os-09', 'IPC', 't3-ospf', 'Which network statement enables OSPF area 0 on an interface addressed 10.1.1.1/24?', [
    ['network 10.1.1.0 0.0.0.255 area 0', true, 'Wildcard mask matches the /24.'],
    ['network 10.1.1.0 0.0.0.255', false, 'The area is missing, so IOS answers % Incomplete command.'],
    ['network 10.1.1.1 area 0', false, 'A wildcard is required.'],
    ['ospf network 10.1.1.0/24 area 0', false, 'Not valid syntax.'],
  ], 'The network command matches interface addresses against address-plus-wildcard and enables OSPF on any interface that falls inside. network 10.1.1.1 0.0.0.0 area 0 matches exactly one interface, a precise and common style.', { console: true }),
  Q('b3-os-10', 'IPC', 't3-ospf', 'Which interface command enables OSPF process 1 in area 0 without a network statement?', [
    ['ip ospf 1 area 0', true, 'Interface-level OSPF enablement.'],
    ['ospf area 0', false, 'Not valid.'],
    ['router ospf 1 area 0', false, 'Not valid.'],
    ['ip ospf network area 0', false, 'Not valid.'],
  ], 'Configuring OSPF on the interface is explicit: what you see under the interface is what runs. It overrides network statements for that interface. show ip ospf interface shows "Attached via Interface Enable".', { console: true }),
  Q('b3-os-11', 'IPC', 't3-ospf', 'Why make a LAN interface passive in OSPF?', [
    ['To advertise the LAN subnet while not sending hellos to hosts', true, 'No neighbors expected there.'],
    ['To stop advertising the subnet', false, 'It is still advertised.'],
    ['To make it the DR', false, 'Passive interfaces form no adjacencies.'],
    ['To increase the cost', false, 'Unrelated.'],
  ], 'Hellos on a user LAN waste a little bandwidth and invite a rogue router to form an adjacency. passive-interface g0/1 under router ospf keeps the network in OSPF but silences hellos. passive-interface default plus no passive-interface on uplinks is a common pattern.', { console: true }),
  Q('b3-os-12', 'IPC', 't3-ospf', 'Which command makes an OSPF router advertise its static default route to the rest of the area?', [
    ['default-information originate', true, 'Under router ospf.'],
    ['redistribute static', false, 'Redistributes statics, but 0.0.0.0/0 needs default-information originate.'],
    ['network 0.0.0.0 255.255.255.255 area 0', false, 'Enables OSPF on all interfaces.'],
    ['ip default-network', false, 'Legacy command.'],
  ], 'The edge router with the internet default runs default-information originate under router ospf, and other routers learn O*E2 0.0.0.0/0. Adding always advertises it even if the router has no default itself.', { console: true }),
  Q('b3-os-13', 'IPC', 't3-ospf', 'What is the OSPF cost of a 1 Gb/s interface with the default reference bandwidth?', [
    ['1', true, '100 Mb/s divided by 1000 Mb/s rounds up to 1.'],
    ['10', false, 'That is 10 Mb/s.'],
    ['4', false, 'That is an STP cost.'],
    ['0.1', false, 'Costs are whole numbers, minimum 1.'],
  ], 'Cost = reference bandwidth / interface bandwidth, default reference 100 Mb/s. FastEthernet, Gigabit and 10 Gigabit all cost 1, so OSPF cannot tell them apart. Fix it with auto-cost reference-bandwidth 100000 (in Mb/s) on every router.'),
  Q('b3-os-14', 'IPC', 't3-ospf', 'Which command, entered on every OSPF router, lets OSPF tell 1 Gb/s and 10 Gb/s links apart?', [
    ['auto-cost reference-bandwidth 10000', true, '10 Gb/s reference: 1G costs 10, 10G costs 1.'],
    ['bandwidth 10000', false, 'Changes one interface\'s bandwidth value.'],
    ['ip ospf cost 1', false, 'Sets one interface.'],
    ['ospf reference 10', false, 'Not valid.'],
  ], 'The reference bandwidth is in Mb/s and must match on all routers, or cost calculations disagree and paths become asymmetric. IOS even warns to use the same value everywhere.', { console: true }),
  Q('b3-os-15', 'IPC', 't3-ospf', 'Which interface command forces OSPF to prefer a link by setting its cost directly?', [
    ['ip ospf cost 5', true, 'Overrides the bandwidth-based cost.'],
    ['bandwidth 5', false, 'Changes bandwidth, which changes cost indirectly.'],
    ['ip ospf priority 5', false, 'DR election.'],
    ['ip ospf metric 5', false, 'Not valid.'],
  ], 'ip ospf cost sets the outgoing cost on that interface. A route\'s cost is the sum of the outgoing interface costs along the path, so lowering one link\'s cost attracts traffic to it.', { console: true }),
  Q('b3-os-16', 'IPC', 't3-ospf', 'Which interface command removes the DR/BDR election on a link between just two routers?', [
    ['ip ospf network point-to-point', true, 'No DR on point-to-point.'],
    ['ip ospf priority 0', false, 'On both sides that leaves no DR and the adjacency stuck at 2-Way.'],
    ['passive-interface', false, 'Stops adjacency entirely.'],
    ['no ip ospf dr', false, 'Not valid.'],
  ], 'Ethernet defaults to the broadcast network type with a DR election and a 40-second wait. Two-router Ethernet links are effectively point-to-point; setting that type on both ends skips the election and forms adjacencies faster.', { console: true }),
  Q('b3-os-17', 'IPC', 't3-ospf', 'Which configuration sets router ID 1.1.1.1 on a running OSPF process so it takes effect?', [
    ['router-id 1.1.1.1 under router ospf 1, then clear ip ospf process', true, 'The RID changes on process restart.'],
    ['router-id 1.1.1.1 alone', false, 'IOS keeps the old RID until the process restarts.'],
    ['ip ospf router-id 1.1.1.1 on the interface', false, 'Not valid.'],
    ['hostname 1.1.1.1', false, 'Hostname is unrelated.'],
  ], 'After router-id on a running process, IOS says "Reload or use clear ip ospf process command, for this to take effect". Clearing restarts every adjacency, so do it in a maintenance window.', { console: true }),
  Q('b3-os-18', 'IPC', 't3-ospf', 'In single-area OSPF, which area should every router use?', [
    ['Area 0, the backbone', true, 'Single-area designs use area 0.'],
    ['Any area, as long as all routers match', false, 'Technically works, but the exam expects area 0.'],
    ['Area 1', false, 'Not the backbone.'],
    ['Each router its own area', false, 'That is multi-area and breaks adjacencies.'],
  ], 'Multi-area OSPF requires every area to touch area 0. The CCNA covers single-area OSPF, which in practice means everything in area 0.'),

  // ---------- t3-ospf: verification ----------
  Q('b3-os-19', 'IPC', 't3-ospf', 'Which neighbor is the DR on Gi0/0?', [
    ['2.2.2.2', true, 'Its state reads FULL/DR.'],
    ['3.3.3.3', false, 'It is a DROTHER.'],
    ['4.4.4.4', false, 'On Gi0/1, with no DR role.'],
    ['R1 itself', false, 'The neighbor table shows neighbors\' roles.'],
  ], 'The State column shows adjacency state and the neighbor\'s role: DR, BDR or DROTHER. A dash means no DR on that link, typical of point-to-point. The Pri column is the neighbor\'s interface priority.', { exhibit: X(NBR, ...NBR_MARKS) }),
  Q('b3-os-20', 'IPC', 't3-ospf', 'Neighbor 3.3.3.3 sits in 2WAY/DROTHER. Is that a problem?', [
    ['No; DROTHERs only go Full with the DR and BDR, and stay 2-Way with each other', true, 'This is normal.'],
    ['Yes; the MTU is mismatched', false, 'That shows ExStart/Exchange.'],
    ['Yes; the timers are wrong', false, 'There would be no neighbor at all.'],
    ['Yes; the area is wrong', false, 'No neighbor would appear.'],
  ], 'On a multiaccess segment, every router forms Full adjacencies with the DR and BDR only. R1 here is itself a DROTHER (or the BDR) and stays 2-Way with 3.3.3.3, which is exactly the design: fewer adjacencies, less flooding.', { exhibit: X(NBR, ...NBR_MARKS) }),
  Q('b3-os-21', 'IPC', 't3-ospf', 'Neighbor 4.4.4.4 shows Pri 0 and "FULL/  -". What does that tell you?', [
    ['The link to it has no DR election, such as a point-to-point network type', true, 'The dash means no role.'],
    ['4.4.4.4 is down', false, 'It is Full.'],
    ['4.4.4.4 is the DR', false, 'DR would be shown.'],
    ['OSPF is misconfigured', false, 'This is normal on point-to-point.'],
  ], 'On point-to-point links OSPF elects no DR, so the role column shows a dash. Priority 0 shows as well, consistent with an interface that never takes part in an election.', { exhibit: X(NBR, ...NBR_MARKS) }),
  Q('b3-os-22', 'IPC', 't3-ospf', 'R1 and R2 are cabled and both run OSPF, but show ip ospf neighbor is empty. The interface output is shown. What is wrong?', [
    ['The hello and dead timers differ (10/40 versus 5/20)', true, 'Timers must match.'],
    ['The areas match, so it should work; reload both', false, 'Reloading will not fix timers.'],
    ['The network types differ', false, 'Both show BROADCAST.'],
    ['The router IDs are the same', false, 'They differ.'],
  ], 'Hellos carrying different timers are ignored, so neither router lists the other. Set ip ospf hello-interval and dead-interval to match on both, or remove the custom values on R2.', {
    exhibit: X(`
R1#show ip ospf interface g0/0 | include Timer|Area|Network
  Internet Address 10.0.12.1/30, Area 0, Attached via Network Statement
  Process ID 1, Router ID 1.1.1.1, Network Type BROADCAST, Cost: 1
  Timer intervals configured, Hello 10, Dead 40, Wait 40, Retransmit 5
R2#show ip ospf interface g0/0 | include Timer|Area|Network
  Internet Address 10.0.12.2/30, Area 0, Attached via Network Statement
  Process ID 1, Router ID 2.2.2.2, Network Type BROADCAST, Cost: 1
  Timer intervals configured, Hello 5, Dead 20, Wait 20, Retransmit 5`,
      [/R\d#/, 'prompt'], [/10\.0\.12\.[12]/, 'ip'], ['/30', 'mask'], [/Area 0/, 'key', 'Area'], [/Hello 10, Dead 40/, 'ok', 'Default timers'], [/Hello 5, Dead 20/, 'fail', 'Changed timers'], [/Router ID \d\.\d\.\d\.\d/, 'key', 'Router ID']),
  }),
  Q('b3-os-23', 'IPC', 't3-ospf', 'R3 should form an adjacency with R1 on 10.0.13.0/30 but does not. What is the mismatch?', [
    ['R3\'s interface is in area 1 while R1\'s is in area 0', true, 'Areas must match.'],
    ['The process IDs differ', false, 'Process IDs may differ.'],
    ['The wildcard masks differ', false, 'Each router\'s statement only has to match its own interface.'],
    ['R3 needs a loopback', false, 'Not required.'],
  ], 'Both ends of a link must be in the same area. IOS logs "mismatched area ID" for this case. Correct R3\'s network statement or ip ospf command to area 0.', {
    exhibit: X(`
R1#show run | section router ospf
router ospf 1
 network 10.0.13.0 0.0.0.3 area 0
R3#show run | section router ospf
router ospf 7
 network 10.0.13.0 0.0.0.3 area 1`,
      [/R\d#/, 'prompt'], [/router ospf \d/, 'key', 'Process ID (local only)'], [/10\.0\.13\.0/, 'ip'], [/0\.0\.0\.3/, 'mask', 'Wildcard'], ['area 0', 'ok', 'Area 0'], ['area 1', 'fail', 'Area 1']),
  }),
  Q('b3-os-24', 'IPC', 't3-ospf', 'Which command lists each OSPF interface with its area, cost, state and neighbor count?', [
    ['show ip ospf interface brief', true, 'One line per interface.'],
    ['show ip ospf neighbor', false, 'Lists neighbors.'],
    ['show ip protocols', false, 'Summarizes the process.'],
    ['show ip route ospf', false, 'Lists routes.'],
  ], 'show ip ospf interface brief answers "which interfaces run OSPF, in which area, at what cost, as DR/BDR/DROTHER/P2P, with how many neighbors". An interface missing from it was never enabled for OSPF.', { console: true }),
  Q('b3-os-25', 'IPC', 't3-ospf', 'Which interface is passive here, and what does that mean?', [
    ['Gi0/1: it is in OSPF (its subnet is advertised) but has no neighbors', true, 'Nbrs 0/0, listed under passive.'],
    ['Gi0/0: it has a neighbor', false, 'Gi0/0 has a full neighbor.'],
    ['Lo0: loopbacks are always passive', false, 'Loopbacks never form neighbors but are not listed as passive here.'],
    ['None', false, 'Gi0/1 is passive.'],
  ], 'show ip protocols lists Passive Interface(s); show ip ospf interface brief shows them with 0 neighbors. They still advertise their connected subnet into OSPF.', {
    exhibit: X(`
R1#show ip protocols | begin Passive
  Passive Interface(s):
    GigabitEthernet0/1
  Routing Information Sources:
    Gateway         Distance      Last Update
    2.2.2.2              110      00:12:40
  Distance: (default is 110)
R1#show ip ospf interface brief
Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C
Gi0/0        1     0               10.0.12.1/30       1     P2P   1/1
Gi0/1        1     0               192.168.1.1/24     1     DR    0/0
Lo0          1     0               1.1.1.1/32         1     LOOP  0/0`,
      [/show ip protocols \| begin Passive|show ip ospf interface brief/, 'cmd'], [/GigabitEthernet0\/1|Gi0\/1/, 'iface', 'Passive interface'], [/Gi0\/0|Lo0/, 'iface'], ['2.2.2.2', 'key', 'Neighbor router ID'], [/\b110\b/, 'metric', 'OSPF AD'], [/(10\.0\.12\.1|192\.168\.1\.1|1\.1\.1\.1)(?=\/)/, 'ip'], [/\/(30|24|32)(?= )/, 'mask'], [/1\/1/, 'ok', 'Neighbor full'], [/0\/0/, 'state', 'No neighbors']),
  }),
  Q('b3-os-26', 'IPC', 't3-ospf', 'Which output fields of show ip protocols confirm which networks OSPF is enabled on?', [
    ['Routing for Networks', true, 'Lists the network statements.'],
    ['Distance', false, 'The AD.'],
    ['Routing Information Sources', false, 'Neighbors routes came from.'],
    ['Maximum path', false, 'ECMP limit.'],
  ], 'show ip protocols summarizes each routing process: router ID, network statements (Routing for Networks), interfaces enabled directly, passive interfaces, sources and AD. It is the best one-screen check of an OSPF config.', { console: true }),

  // ---------- t3-ospf: DR/BDR ----------
  Q('b3-os-27', 'IPC', 't3-ospf', 'How is the OSPF DR elected on a broadcast segment?', [
    ['Highest interface priority; ties broken by the highest router ID', true, 'Priority, then RID.'],
    ['Lowest router ID', false, 'Highest wins.'],
    ['The first router to boot always', false, 'Only in effect, because there is no preemption.'],
    ['Lowest IP address', false, 'No.'],
  ], 'Default priority is 1. Priority 0 means never DR or BDR. There is no preemption: a better router joining later does not take over until the DR fails or the process is reset, which is why the first routers up often end up DR.'),
  Q('b3-os-28', 'IPC', 't3-ospf', 'R4 joins a segment with priority 200, higher than the current DR\'s 1. What happens?', [
    ['Nothing until the DR or BDR fails or OSPF is reset; OSPF DR election is not preemptive', true, 'No preemption.'],
    ['R4 immediately becomes DR', false, 'Not preemptive.'],
    ['R4 becomes BDR immediately', false, 'Only if the BDR role is vacant.'],
    ['The segment re-elects at once', false, 'No.'],
  ], 'Once elected, a DR keeps the role. If the DR fails, the BDR is promoted and a new BDR is elected. To force R4 in, clear the OSPF process on the current DR and BDR in a maintenance window.'),
  Q('b3-os-29', 'IPC', 't3-ospf', 'Which interface command ensures a router never becomes DR or BDR?', [
    ['ip ospf priority 0', true, 'Priority 0 opts out.'],
    ['ip ospf priority 255', false, 'That makes it most likely.'],
    ['ip ospf cost 0', false, 'Not valid and unrelated.'],
    ['passive-interface', false, 'Stops adjacencies.'],
  ], 'Priority 0 is the opt-out, useful for spoke routers or low-powered devices. If every router on a segment has priority 0 there is no DR, and adjacencies stay at 2-Way, so at least one must be eligible.', { console: true }),
  Q('b3-os-30', 'IPC', 't3-ospf', 'Why does OSPF elect a DR on multiaccess networks?', [
    ['To cut the number of adjacencies and LSA floods: everyone syncs with the DR instead of each other', true, 'Scales a shared segment.'],
    ['To choose the default gateway for hosts', false, 'That is FHRP.'],
    ['To pick the root bridge', false, 'That is STP.'],
    ['To encrypt updates', false, 'No.'],
  ], 'Without a DR, n routers on a segment would need n(n-1)/2 full adjacencies. With a DR and BDR, each router has just two, and the DR represents the segment with a type 2 network LSA.'),
  Q('b3-os-31', 'IPC', 't3-ospf', 'On this segment, which router will be DR after a fresh simultaneous start?', [
    ['R3 (priority 50)', true, 'Highest priority wins.'],
    ['R2 (RID 9.9.9.9)', false, 'RID only breaks priority ties.'],
    ['R1 (priority 1, RID 5.5.5.5)', false, 'Lower priority.'],
    ['R4 (priority 0)', false, 'Priority 0 is never DR.'],
  ], 'Compare priority first: R3\'s 50 beats everyone. The BDR is the next best: R2 and R1 both have priority 1, so the higher RID, R2 (9.9.9.9), becomes BDR. R4 with 0 is ineligible.', {
    exhibit: X(`
Router  Priority  Router ID
R1      1         5.5.5.5
R2      1         9.9.9.9
R3      50        3.3.3.3
R4      0         10.10.10.10`,
      [/^R\d/m, 'role', 'Router'], [/(?<= {6})(1|50|0)(?= {5,})/, 'key', 'Priority'], [/\d+\.\d+\.\d+\.\d+/, 'ip', 'Router ID']),
  }),
  Q('b3-os-32', 'IPC', 't3-ospf', 'On a point-to-point serial link, which OSPF state do both neighbors reach?', [
    ['FULL, with no DR or BDR', true, 'Point-to-point skips the election.'],
    ['2-WAY/DROTHER', false, 'Only on multiaccess.'],
    ['FULL/DR', false, 'No DR is elected.'],
    ['EXSTART forever', false, 'Only with an MTU problem.'],
  ], 'Point-to-point network types (serial by default, or Ethernet configured with ip ospf network point-to-point) form Full adjacencies directly, shown as FULL/  - in the neighbor table.'),

  // ---------- t3-ospf: LSAs, routes, faults ----------
  Q('b3-os-33', 'IPC', 't3-ospf', 'Which LSA types describe a single area? (Choose two.)', [
    ['Type 1, router LSA', true, 'Each router\'s links.'],
    ['Type 2, network LSA', true, 'Generated by the DR for a segment.'],
    ['Type 5, external LSA', false, 'Redistributed routes.'],
    ['Type 3, summary LSA', false, 'Inter-area.'],
  ], 'Within an area, every router floods a type 1 describing its links, and each DR floods a type 2 describing its segment. Type 3 summarizes between areas and type 5 carries external routes.'),
  Q('b3-os-34', 'IPC', 't3-ospf', 'R1 shows an O route to 192.168.3.0/24 with [110/3] via 10.0.12.2. Which links add up to that cost?', [
    ['The outgoing interface costs along the path from R1 to the destination', true, 'Cost is the sum of outbound costs.'],
    ['The incoming interface costs', false, 'OSPF sums outgoing costs.'],
    ['The number of hops times 110', false, '110 is the AD.'],
    ['The bandwidth in Mb/s', false, 'Cost is derived from bandwidth, not equal to it.'],
  ], 'Each router adds the cost of the interface it would send out of. With every link at cost 1, three outbound interfaces (R1, R2 and R3\'s LAN interface) give 3. Changing a cost on the far side changes R1\'s metric too.'),
  Q('b3-os-35', 'IPC', 't3-ospf', 'Two routers show each other as neighbors but OSPF routes to R2\'s LAN never appear on R1. R2\'s LAN interface is not listed in show ip ospf interface brief. Why?', [
    ['R2 never enabled OSPF on its LAN interface, so the subnet is not advertised', true, 'No network statement or ip ospf command covers it.'],
    ['R1 has the wrong area', false, 'The adjacency is up.'],
    ['The LAN is passive', false, 'Passive interfaces are still advertised and would be listed.'],
    ['Hellos are mismatched', false, 'They are neighbors.'],
  ], 'OSPF only advertises subnets of interfaces that are part of the process. Add a network statement covering the LAN (and make it passive), or put ip ospf 1 area 0 on that interface.'),
  Q('b3-os-36', 'IPC', 't3-ospf', 'Which log message indicates two OSPF routers share a router ID?', [
    ['%OSPF-4-DUP_RTRID_NBR', true, 'Duplicate router ID detected.'],
    ['%LINK-3-UPDOWN', false, 'Interface state.'],
    ['%CDP-4-NATIVE_VLAN_MISMATCH', false, 'Trunk native VLAN.'],
    ['%SYS-5-CONFIG_I', false, 'Configuration change.'],
  ], 'OSPF requires unique router IDs. Duplicates (often from copying configs with a router-id line) break adjacencies or confuse the database. Set a unique router-id and clear the process.', { console: true }),
  Q('b3-os-37', 'IPC', 't3-ospf', 'R1 receives the same prefix from OSPF and from a static route with AD 1. Which statement is true?', [
    ['The static route is installed; the OSPF route stays in the OSPF database', true, 'Lower AD wins the table.'],
    ['Both are installed', false, 'Only one source per prefix.'],
    ['OSPF wins because it is dynamic', false, 'AD decides.'],
    ['Neither is installed', false, 'No.'],
  ], 'The routing table takes the lowest-AD source. OSPF still knows the route and will install it immediately if the static disappears, which is the mirror image of a floating static.'),
  Q('b3-os-38', 'IPC', 't3-ospf', 'Which three commands configure OSPF on R1 so its LAN 192.168.1.0/24 and link 10.0.12.0/30 are in area 0, with RID 1.1.1.1? (Choose three.)', [
    ['router ospf 1 / router-id 1.1.1.1', true, 'Process and RID.'],
    ['network 192.168.1.0 0.0.0.255 area 0', true, 'LAN.'],
    ['network 10.0.12.0 0.0.0.3 area 0', true, 'Link.'],
    ['network 10.0.12.0 255.255.255.252 area 0', false, 'Use the wildcard, 0.0.0.3.'],
  ], 'Start the process, set a stable RID, and enable each interface with a network statement using a wildcard mask. Add passive-interface for the LAN, then verify with show ip ospf neighbor and show ip route ospf.', { console: true }),
  Q('b3-os-39', 'IPC', 't3-ospf', 'An OSPF neighbor keeps going up and down every 40 seconds. Which is the most likely cause?', [
    ['Hellos are lost intermittently (a flapping or erroring link), so the dead timer expires', true, 'The dead interval is 40 seconds.'],
    ['Mismatched process IDs', false, 'Allowed.'],
    ['A mismatched area', false, 'No adjacency would form at all.'],
    ['Passive interface', false, 'No adjacency would form.'],
  ], 'If hellos stop arriving for 40 seconds, the adjacency drops; when they return, it comes back. Look at the interface for errors and drops, and at CPU or queue issues that delay hellos.'),
  Q('b3-os-40', 'IPC', 't3-ospf', 'Which route code appears for a default route learned through OSPF from default-information originate?', [
    ['O*E2', true, 'An external type 2 candidate default.'],
    ['S*', false, 'That is a local static default.'],
    ['O IA', false, 'Inter-area.'],
    ['C', false, 'Connected.'],
  ], 'The originating router advertises the default as a type 5 external LSA, so others see O*E2 0.0.0.0/0 with a metric of 1 by default. The asterisk marks it as a candidate default.'),
  Q('b3-os-41', 'IPC', 't3-ospf', 'What does OSPF do when a link fails?', [
    ['The affected routers flood updated LSAs and every router reruns SPF', true, 'Fast, event-driven convergence.'],
    ['It waits for the next periodic table exchange', false, 'Distance-vector behavior.'],
    ['Nothing until the routers reboot', false, 'No.'],
    ['It removes all routes', false, 'Only those affected change.'],
  ], 'Link-state protocols react to events: new LSAs flood immediately and SPF recalculates, so OSPF converges in seconds. LSAs are also refreshed every 30 minutes even without changes.'),
  Q('b3-os-42', 'IPC', 't3-ospf', 'Which IP protocol number identifies OSPF packets?', [
    ['89', true, 'OSPF runs directly over IP.'],
    ['6', false, 'TCP.'],
    ['17', false, 'UDP.'],
    ['88', false, 'EIGRP.'],
  ], 'OSPF does not use TCP or UDP. An ACL that should permit OSPF must permit protocol ospf (89), and a firewall between routers must allow it.'),
  Q('b3-os-43', 'IPC', 't3-ospf', 'R1\'s neighbor table shows R2 stuck in INIT. What does that mean?', [
    ['R1 hears R2\'s hellos but R2 does not list R1 in them, so traffic is one-way', true, 'Init means one direction only.'],
    ['The adjacency is full', false, 'Full is the final state.'],
    ['The MTUs differ', false, 'That stalls in ExStart.'],
    ['R2 is the DR', false, 'Roles come later.'],
  ], 'A hello lists every neighbor the sender has heard. In INIT, R1 receives R2\'s hellos but does not see its own RID in them: R2 is not receiving R1\'s hellos. Look for an ACL, a unidirectional link or a multicast problem.'),
  Q('b3-os-44', 'IPC', 't3-ospf', 'Which output confirms that R1 learned 192.168.3.0/24 from OSPF?', [
    ['O 192.168.3.0/24 [110/3] via 10.0.12.2', true, 'Code O, AD 110.'],
    ['C 192.168.3.0/24 is directly connected', false, 'Connected.'],
    ['S 192.168.3.0/24 [1/0] via 10.0.12.2', false, 'Static.'],
    ['L 192.168.3.1/32', false, 'Local.'],
  ], 'The code letter tells you the source. O with [110/x] is OSPF. If the route shows S instead, someone also configured a static route, which wins on AD and hides the OSPF one.', { console: true }),
  Q('b3-os-45', 'IPC', 't3-ospf', 'Which command shows R1\'s own router ID quickly?', [
    ['show ip protocols (or show ip ospf)', true, 'Both print the router ID.'],
    ['show ip ospf neighbor', false, 'Shows neighbors\' IDs.'],
    ['show version', false, 'No OSPF details.'],
    ['show ip route', false, 'No RID.'],
  ], 'show ip protocols shows "Router ID 1.1.1.1" for each OSPF process; show ip ospf prints it on the first line. Useful when checking for duplicates or after changing a loopback.', { console: true }),

  // ---------- t3-fhrp ----------
  Q('b3-fh-01', 'IPC', 't3-fhrp', 'What problem do first hop redundancy protocols solve?', [
    ['Hosts have one default gateway address; FHRP lets two routers share it so a router failure is invisible to hosts', true, 'A virtual gateway.'],
    ['They load-balance between ISPs', false, 'Not their main purpose.'],
    ['They prevent Layer 2 loops', false, 'That is STP.'],
    ['They assign IP addresses', false, 'That is DHCP.'],
  ], 'Hosts cannot fail over gateways on their own. HSRP, VRRP and GLBP give a virtual IP and virtual MAC that whichever router is active answers for, so hosts keep the same gateway setting.'),
  Q('b3-fh-02', 'IPC', 't3-fhrp', 'Which FHRP is a Cisco protocol using active and standby routers?', [
    ['HSRP', true, 'Hot Standby Router Protocol.'],
    ['VRRP', false, 'Open standard; master and backup.'],
    ['GLBP', false, 'Cisco, but uses AVG and AVF and load-balances.'],
    ['OSPF', false, 'A routing protocol.'],
  ], 'HSRP (Cisco): active and standby, priority 100 default, preemption off by default. VRRP (open standard): master and backup, preemption on. GLBP (Cisco): one AVG hands out up to four AVF MACs to balance hosts.'),
  Q('b3-fh-03', 'IPC', 't3-fhrp', 'From this output, which router is forwarding traffic for the virtual IP?', [
    ['This router (local), as Active with priority 110', true, 'State Active, Active local.'],
    ['10.1.1.3, the standby', false, 'Standby waits.'],
    ['10.1.1.254 itself', false, 'That is the virtual IP, not a router.'],
    ['Neither', false, 'Local is active.'],
  ], 'show standby brief shows each group: interface, group, priority, P if preemption is on, state, the active router (local means this one), the standby router and the virtual IP. Hosts use 10.1.1.254 as their gateway.', {
    exhibit: X(`
R1#show standby brief
                     P indicates configured to preempt.
Interface   Grp  Pri P State   Active          Standby         Virtual IP
Gi0/1       1    110 P Active  local           10.1.1.3        10.1.1.254`,
      ['show standby brief', 'cmd'], ['Gi0/1', 'iface'], [/(?<=1 {4})110/, 'key', 'Priority'], [/ P (?=Active)/, 'key', 'Preempt on'], [/Active(?= {2}local)/, 'ok', 'Active'], ['local', 'role', 'This router'], ['10.1.1.3', 'ip', 'Standby router'], ['10.1.1.254', 'gw', 'Virtual IP (gateway)']),
  }),
  Q('b3-fh-04', 'IPC', 't3-fhrp', 'What must hosts use as their default gateway in an HSRP group?', [
    ['The HSRP virtual IP address', true, 'Not either router\'s own address.'],
    ['The active router\'s interface address', false, 'Failover would break.'],
    ['The standby router\'s address', false, 'No.'],
    ['Any address in the subnet', false, 'It must be the virtual IP.'],
  ], 'Hosts send to the virtual IP and resolve it by ARP to the virtual MAC. Whichever router is active answers. Pointing hosts at a physical address defeats the redundancy.'),
  Q('b3-fh-05', 'IPC', 't3-fhrp', 'Which configuration makes R1 the preferred HSRP active router and lets it take the role back after recovering?', [
    ['standby 1 priority 110 and standby 1 preempt', true, 'Higher priority plus preemption.'],
    ['standby 1 priority 90', false, 'Lower than the default 100.'],
    ['standby 1 preempt only', false, 'Equal priorities fall back to the highest IP.'],
    ['standby 1 ip 10.1.1.1', false, 'That sets the virtual IP.'],
  ], 'Without preempt, a router with higher priority that comes back after a failure stays standby. Priority alone decides only at election time; preempt makes it act on the priority whenever it is higher.', { console: true }),
  Q('b3-fh-06', 'IPC', 't3-fhrp', 'What is the default HSRP priority and what breaks a tie?', [
    ['100; the highest interface IP address wins a tie', true, 'Defaults.'],
    ['1; the lowest MAC wins', false, 'No.'],
    ['255; the router ID wins', false, 'No.'],
    ['0; the first router up wins', false, 'No.'],
  ], 'HSRP priority ranges 0 to 255 with default 100. If priorities match, the router with the higher IP address on that interface becomes active.'),
  Q('b3-fh-07', 'IPC', 't3-fhrp', 'Which virtual MAC address does HSRP version 1 use for group 10?', [
    ['0000.0c07.ac0a', true, '0000.0c07.acXX with the group in hex.'],
    ['0000.5e00.010a', false, 'VRRP format.'],
    ['0000.0c9f.f00a', false, 'HSRP version 2 format.'],
    ['0007.b400.0a01', false, 'GLBP format.'],
  ], 'Virtual MACs encode the protocol and group: HSRPv1 0000.0c07.acXX, HSRPv2 0000.0c9f.fXXX, VRRP 0000.5e00.01XX, GLBP 0007.b400.XXYY. Recognizing them in an ARP table tells you which FHRP is running.'),
  Q('b3-fh-08', 'IPC', 't3-fhrp', 'Which FHRP is an open standard and preempts by default?', [
    ['VRRP', true, 'Master and backup, IETF standard.'],
    ['HSRP', false, 'Cisco, preemption off by default.'],
    ['GLBP', false, 'Cisco proprietary.'],
    ['CARP', false, 'Not a CCNA topic.'],
  ], 'Choose VRRP in mixed-vendor networks. It can even use an interface\'s own address as the virtual IP, in which case the router owning that address is master with priority 255.'),
  Q('b3-fh-09', 'IPC', 't3-fhrp', 'What does GLBP add that HSRP and VRRP lack?', [
    ['Load balancing across up to four gateways for one virtual IP', true, 'The AVG hands out different AVF MACs.'],
    ['Encryption', false, 'No.'],
    ['IPv6 support', false, 'Others support IPv6 too.'],
    ['Faster DR election', false, 'Unrelated.'],
  ], 'With HSRP or VRRP, only the active or master router forwards for a group. GLBP\'s active virtual gateway answers ARP requests with different virtual MACs, spreading hosts across several forwarders.'),
  Q('b3-fh-10', 'IPC', 't3-fhrp', 'Which command configures HSRP group 1 with virtual IP 10.1.1.254 on an interface?', [
    ['standby 1 ip 10.1.1.254', true, 'Interface command.'],
    ['hsrp 1 ip 10.1.1.254', false, 'Not valid.'],
    ['vrrp 1 ip 10.1.1.254', false, 'VRRP syntax.'],
    ['ip helper-address 10.1.1.254', false, 'DHCP relay.'],
  ], 'Each router in the group gets its own interface address and the same standby group number and virtual IP. Add priority and preempt on the preferred router, and verify with show standby brief.', { console: true }),
  Q('b3-fh-11', 'IPC', 't3-fhrp', 'What are the default HSRP hello and hold timers?', [
    ['3 seconds and 10 seconds', true, 'HSRP defaults.'],
    ['10 and 40 seconds', false, 'OSPF.'],
    ['1 and 3 seconds', false, 'VRRP advertisement default is 1 second, but not HSRP.'],
    ['2 and 20 seconds', false, 'STP.'],
  ], 'HSRP routers send hellos every 3 seconds; if the standby misses them for 10 seconds, it takes over. Timers can be lowered (standby 1 timers msec ...) for faster failover.'),
  Q('b3-fh-12', 'IPC', 't3-fhrp', 'Both routers in an HSRP group show State Active. What is the most likely cause?', [
    ['They cannot hear each other\'s hellos, often because they are in different VLANs or the link between them is broken', true, 'Split brain.'],
    ['Both have preempt', false, 'Preempt does not cause two actives.'],
    ['Both have priority 100', false, 'Ties are broken by IP.'],
    ['This is normal', false, 'Only one should be active.'],
  ], 'Two actives means each thinks the other is gone. Check that both interfaces are in the same VLAN and subnet, that the group numbers and versions match, and that nothing filters HSRP (UDP 1985 to 224.0.0.2 for v1).'),
  Q('b3-fh-13', 'IPC', 't3-fhrp', 'Which is the GLBP role that answers ARP requests for the virtual IP?', [
    ['AVG, the active virtual gateway', true, 'Hands out AVF MACs.'],
    ['AVF, an active virtual forwarder', false, 'Forwards traffic for its MAC.'],
    ['Master', false, 'VRRP.'],
    ['Standby', false, 'HSRP.'],
  ], 'One GLBP router is the AVG. Each of up to four routers is an AVF with its own virtual MAC, and the AVG replies to ARP with one of those MACs in turn (round robin by default).'),
  Q('b3-fh-14', 'IPC', 't3-fhrp', 'R1 (priority 110, preempt) failed and R2 became active. R1 is back. Without preempt on R1, what happens?', [
    ['R2 stays active; R1 becomes standby', true, 'Without preempt there is no takeover.'],
    ['R1 becomes active immediately', false, 'Only with preempt.'],
    ['Both become active', false, 'No.'],
    ['The group goes down', false, 'No.'],
  ], 'Preemption is what lets the preferred router reclaim the active role. Without it, the router that took over keeps the role until it fails, which can leave traffic on a less suitable path.'),
];
