// Tree 1, Network Fundamentals, part A: device roles, architectures, the
// physical layer and its faults, TCP and UDP, and client addressing on
// Windows, macOS and Linux.

import { Q, X } from './qb.js';

export const T1_A = [
  // ---------- t1-devices ----------
  Q('b1-dev-01', 'NF', 't1-devices', 'Which device forwards traffic between different IP subnets?', [
    ['A router', true, 'Routers make Layer 3 forwarding decisions between networks.'],
    ['A Layer 2 switch', false, 'An L2 switch forwards frames within one VLAN.'],
    ['An access point', false, 'An AP bridges wireless clients onto a LAN.'],
    ['A hub', false, 'A hub repeats bits to every port.'],
  ], 'Moving between subnets is a Layer 3 job: a router (or a Layer 3 switch) looks up the destination IP in its routing table and picks an exit. Switches and APs keep traffic inside one broadcast domain.'),
  Q('b1-dev-02', 'NF', 't1-devices', 'What does a next-generation firewall add over a traditional stateful firewall?', [
    ['Application awareness and integrated intrusion prevention', true, 'NGFWs inspect up to Layer 7 and often include IPS and URL filtering.'],
    ['Routing protocol support', false, 'Many firewalls route, but that is not what makes them next-gen.'],
    ['The ability to track sessions', false, 'Stateful firewalls already do that.'],
    ['Power over Ethernet', false, 'Unrelated to filtering.'],
  ], 'A stateful firewall tracks connections by addresses and ports. A next-generation firewall also identifies the application (not just port 443), applies user identity, and folds in IPS, URL filtering and malware inspection.'),
  Q('b1-dev-03', 'NF', 't1-devices', 'What is the main difference between an IDS and an IPS?', [
    ['An IPS sits inline and can drop traffic; an IDS watches a copy and alerts', true, 'Inline placement is what lets IPS block.'],
    ['An IDS blocks traffic; an IPS only alerts', false, 'Reversed.'],
    ['An IPS only works on wireless networks', false, 'IPS is media-independent.'],
    ['They are the same device with different names', false, 'Placement and action differ.'],
  ], 'An intrusion detection system receives mirrored traffic (a SPAN port or tap), so it can only alert. An intrusion prevention system is in the traffic path and drops packets that match attack signatures, at the cost of adding a point of failure.'),
  Q('b1-dev-04', 'NF', 't1-devices', 'What does a wireless LAN controller do in an enterprise network?', [
    ['Centrally manages lightweight access points: configuration, RF, roaming and security', true, 'APs take their settings from the WLC.'],
    ['Routes traffic between branch offices', false, 'That is a WAN router.'],
    ['Provides PoE to access points', false, 'The switch provides PoE.'],
    ['Replaces the access points', false, 'The APs still provide the radios.'],
  ], 'Lightweight APs join a WLC over CAPWAP and get their SSIDs, channels, power and security from it. One controller can manage hundreds of APs, which is the alternative to configuring each autonomous AP by hand.'),
  Q('b1-dev-05', 'NF', 't1-devices', 'Which two devices commonly receive power from a switch port using PoE? (Choose two.)', [
    ['IP phones', true, 'A classic PoE powered device.'],
    ['Wireless access points', true, 'Most enterprise APs run on PoE.'],
    ['Core routers', false, 'They use their own power supplies.'],
    ['Desktop PCs', false, 'Their power draw is far above PoE budgets.'],
  ], 'PoE sends DC power over the Ethernet pairs from power sourcing equipment (the switch) to powered devices: phones, APs, cameras and some IoT sensors. 802.3af gives up to 15.4 W per port, 802.3at (PoE+) 30 W and 802.3bt up to 60 to 90 W.'),
  Q('b1-dev-06', 'NF', 't1-devices', 'An access switch has a 370 W PoE budget. Twenty cameras each draw 15.4 W and twelve APs each draw 25 W. What happens?', [
    ['Some devices will not get power: the total, 608 W, exceeds the budget', true, '20 x 15.4 + 12 x 25 = 308 + 300 = 608 W.'],
    ['Everything powers up; PoE budget is per port only', false, 'There is also a total switch budget.'],
    ['The switch reboots', false, 'It denies power to ports past the budget.'],
    ['The devices share the power and all run at half', false, 'PoE does not split power that way.'],
  ], 'Every PoE switch has a per-port limit and a total budget. When requests exceed the budget, the switch denies power to the lowest-priority ports. show power inline lists the budget, the used power and each port\'s draw.'),
  Q('b1-dev-07', 'NF', 't1-devices', 'What does a Layer 3 switch do that a Layer 2 switch cannot?', [
    ['Route between VLANs using SVIs or routed ports', true, 'It combines switching with IP routing.'],
    ['Learn MAC addresses', false, 'Every switch does that.'],
    ['Separate collision domains', false, 'Every switch port is its own collision domain.'],
    ['Carry VLANs on a trunk', false, 'Layer 2 switches trunk too.'],
  ], 'A multilayer switch forwards frames like any switch and also routes packets in hardware. With ip routing enabled and an SVI per VLAN, it replaces router-on-a-stick for inter-VLAN routing at much higher speed.'),
  Q('b1-dev-08', 'NF', 't1-devices', 'Which statement describes an endpoint?', [
    ['A device at the edge that sends or receives traffic for a user or application, such as a laptop, phone or sensor', true, 'Endpoints are sources and destinations.'],
    ['A switch at the core of the network', false, 'Core switches are infrastructure.'],
    ['The last hop router on a WAN link', false, 'Routers are infrastructure.'],
    ['A cable terminator', false, 'Not a networking device role.'],
  ], 'Endpoints are where traffic starts and ends: PCs, phones, printers, cameras, IoT devices. Servers are endpoints that provide services. Infrastructure devices (switches, routers, firewalls, APs, controllers) carry traffic between them.'),
  Q('b1-dev-09', 'NF', 't1-devices', 'Which device keeps track of TCP sessions so that return traffic for a connection started inside is allowed back in?', [
    ['A stateful firewall', true, 'It records sessions in a state table.'],
    ['A standard ACL', false, 'A plain ACL has no memory of sessions.'],
    ['A Layer 2 switch', false, 'Switches do not track sessions.'],
    ['An access point', false, 'APs do not filter by session.'],
  ], 'A stateful firewall builds a table of connections leaving the trusted side and automatically permits the matching replies. A stateless ACL would need explicit rules for return traffic, which is harder to get right.'),
  Q('b1-dev-10', 'NF', 't1-devices', 'Match the role: which device would you use to provide services like DNS, DHCP and file shares to clients?', [
    ['A server', true, 'Servers provide services to clients.'],
    ['An IPS', false, 'An IPS inspects traffic.'],
    ['A WLC', false, 'A WLC manages APs.'],
    ['A Layer 2 switch', false, 'Switches forward frames.'],
  ], 'Servers run the services clients ask for. Some routers can also act as small DHCP or DNS servers, which is common in branch offices, but the role being filled is still the server role.'),
  Q('b1-dev-11', 'NF', 't1-devices', 'This command output is from an access switch. How much PoE budget is left?', [
    ['123.2 W', true, 'Remaining is printed directly.'],
    ['370.0 W', false, 'That is the total budget.'],
    ['246.8 W', false, 'That is what is in use.'],
    ['15.4 W', false, 'That is one port\'s draw.'],
  ], 'show power inline starts with the module summary: available, used and remaining watts. Below that each port lists Admin and Oper state, the power drawn and the device class. A port showing "faulty" or "power-deny" is where to look when a phone will not boot.', {
    exhibit: X(`
SW1#show power inline
Module   Available     Used     Remaining
          (Watts)     (Watts)    (Watts)
------   ---------   --------   ---------
1           370.0      246.8       123.2
Interface Admin  Oper       Power   Device              Class Max
                            (Watts)
--------- ------ ---------- ------- ------------------- ----- ----
Gi1/0/1   auto   on         15.4    IP Phone 8851       3     30.0
Gi1/0/2   auto   on         25.5    AIR-AP2802I         4     30.0
Gi1/0/3   auto   off        0.0     n/a                 n/a   30.0`,
      ['show power inline', 'cmd'], ['370.0', 'count', 'Total budget'], ['246.8', 'count', 'In use'], ['123.2', 'ok', 'Remaining'], [/Gi1\/0\/\d/, 'iface'], [/(?<=auto   )off/, 'fail', 'Not powered']),
  }),
  Q('b1-dev-12', 'NF', 't1-devices', 'What is a cloud-managed network device?', [
    ['A switch, AP or firewall configured and monitored from a vendor-hosted dashboard instead of locally', true, 'Meraki is the Cisco example.'],
    ['A virtual router running in a public cloud', false, 'That is a virtual appliance, a different idea.'],
    ['Any device with an IP address', false, 'Too broad.'],
    ['A device that uses DHCP', false, 'Unrelated.'],
  ], 'Cloud-managed devices (Cisco Meraki, for example) phone home to a hosted dashboard for configuration, monitoring and updates. The data plane stays local; only management goes to the cloud. The exam lists it under device management access.'),
  Q('b1-dev-13', 'NF', 't1-devices', 'A user\'s IP phone stays dark after being plugged in, while a laptop on the same port works. What is the most likely cause?', [
    ['The port is not supplying PoE, because PoE is disabled or the budget is exhausted', true, 'Data works but power does not.'],
    ['The VLAN is wrong', false, 'A wrong VLAN would not stop the phone powering on.'],
    ['The duplex is mismatched', false, 'That causes errors, not a dark device.'],
    ['DNS is down', false, 'DNS has nothing to do with power.'],
  ], 'A device that will not even power on is a PoE question before it is anything else. Check show power inline for the port: Oper off or power-deny means no power is supplied, either by configuration (power inline never) or because the budget ran out.'),
  Q('b1-dev-14', 'NF', 't1-devices', 'Which device would you place inline between the internet edge and the internal network to block known exploit traffic by signature?', [
    ['An IPS', true, 'Inline, signature-based blocking.'],
    ['An IDS', false, 'An IDS only alerts.'],
    ['A WLC', false, 'Manages wireless.'],
    ['A Layer 2 switch', false, 'No signature inspection.'],
  ], 'Blocking requires being in the path. An IPS compares traffic against signatures of known attacks and anomalies and drops what matches. Many next-generation firewalls include the IPS function in the same box.'),

  // ---------- t1-arch ----------
  Q('b1-arch-01', 'NF', 't1-arch', 'In a two-tier (collapsed core) campus design, which layers are combined?', [
    ['Distribution and core', true, 'Hence collapsed core.'],
    ['Access and distribution', false, 'Access stays separate for end devices.'],
    ['Access and core', false, 'Not the standard collapse.'],
    ['All three into one switch', false, 'That would be a single-tier design.'],
  ], 'Three-tier separates access (end devices), distribution (policy, routing between access blocks) and core (fast transport between distribution blocks). Smaller campuses merge core into distribution to save cost; that is the two-tier or collapsed-core design.'),
  Q('b1-arch-02', 'NF', 't1-arch', 'In a spine-leaf data center, how are switches connected?', [
    ['Every leaf connects to every spine; leaves do not connect to each other', true, 'Any two leaves are two hops apart.'],
    ['Every leaf connects to every other leaf', false, 'Leaves do not interconnect directly.'],
    ['Spines connect to each other in a ring', false, 'Spines do not interconnect.'],
    ['Each leaf connects to one spine', false, 'Every leaf connects to all spines.'],
  ], 'Spine-leaf gives every server the same path length: leaf, spine, leaf. Adding a spine adds bandwidth, adding a leaf adds ports. Servers and firewalls attach to leaves; nothing but leaves attaches to spines.'),
  Q('b1-arch-03', 'NF', 't1-arch', 'Which layer of the three-tier campus model do end-user PCs and phones connect to?', [
    ['Access', true, 'The edge layer for endpoints.'],
    ['Distribution', false, 'Aggregates access switches.'],
    ['Core', false, 'High-speed backbone.'],
    ['WAN', false, 'Not a campus tier.'],
  ], 'Access switches provide ports, PoE, VLAN assignment and port security for endpoints. Distribution switches aggregate them and apply policy, and the core connects distribution blocks as fast as possible with as little processing as possible.'),
  Q('b1-arch-04', 'NF', 't1-arch', 'What typically describes a SOHO network?', [
    ['One device acting as router, switch, firewall and wireless AP for a small site', true, 'The all-in-one home or small office router.'],
    ['A spine-leaf fabric', false, 'That is a data center design.'],
    ['A three-tier campus', false, 'Far larger than a small office.'],
    ['A dedicated MPLS core', false, 'A provider technology.'],
  ], 'Small office/home office networks usually hang off one consumer or small-business router that does NAT, DHCP, Wi-Fi, a few switch ports and a basic firewall, connected to a broadband provider.'),
  Q('b1-arch-05', 'NF', 't1-arch', 'Which cloud service model gives you virtual machines and networks while you manage the operating systems and applications?', [
    ['IaaS', true, 'Infrastructure as a Service.'],
    ['SaaS', false, 'The provider runs the whole application.'],
    ['PaaS', false, 'The provider also manages the OS and runtime.'],
    ['On-premises', false, 'That is your own data center.'],
  ], 'IaaS rents raw compute, storage and networking; you patch the OS. PaaS adds the runtime and you bring code. SaaS is a finished application such as email. The further up, the less you manage and the less you control.'),
  Q('b1-arch-06', 'NF', 't1-arch', 'What is a key benefit of a spine-leaf design over a traditional three-tier design in a data center?', [
    ['Predictable latency and easy horizontal scaling for east-west traffic', true, 'Every leaf is the same distance from every other.'],
    ['Fewer cables', false, 'It usually needs more.'],
    ['Spanning tree blocks fewer links', false, 'Spine-leaf fabrics usually avoid STP blocking by routing.'],
    ['It needs no routing', false, 'Most fabrics route at the leaf.'],
  ], 'Modern applications send most traffic server to server (east-west). Spine-leaf keeps those paths equal and short, and scales by adding spines or leaves without redesigning the core.'),
  Q('b1-arch-07', 'NF', 't1-arch', 'Which WAN connection type gives a dedicated, always-on link between two sites without sharing it with other customers?', [
    ['A leased line (point-to-point)', true, 'Dedicated capacity between two points.'],
    ['Broadband internet', false, 'Shared, best effort.'],
    ['A site-to-site VPN over the internet', false, 'Rides the shared internet.'],
    ['Wi-Fi', false, 'A LAN technology.'],
  ], 'Leased lines and Metro Ethernet circuits are private and predictable but cost more. Internet VPNs are cheaper but share capacity. MPLS sits between: a provider network that separates customers logically.'),
  Q('b1-arch-08', 'NF', 't1-arch', 'What does on-premises mean for a company\'s servers?', [
    ['They run in the company\'s own building or data center on hardware it owns or controls', true, 'As opposed to cloud.'],
    ['They run in a public cloud', false, 'That is off-premises.'],
    ['They are virtual machines', false, 'On-premises servers can be physical or virtual.'],
    ['They use private IP addresses', false, 'Address type is unrelated.'],
  ], 'On-premises means you own the space, power, cooling and hardware. Cloud moves those to a provider. Hybrid designs keep some workloads on-site and connect them to cloud resources, often over VPN or a dedicated interconnect.'),
  Q('b1-arch-09', 'NF', 't1-arch', 'Which layer in a three-tier design is the usual place for routing between VLANs and applying policy such as ACLs?', [
    ['Distribution', true, 'It aggregates access and enforces policy.'],
    ['Access', false, 'Access handles endpoints.'],
    ['Core', false, 'Core should forward fast with minimal policy.'],
    ['Physical', false, 'Not a design tier.'],
  ], 'The distribution layer is the boundary between Layer 2 access blocks and the routed core. Inter-VLAN routing, first hop redundancy, summarization and ACLs typically live there, leaving the core free to switch packets quickly.'),
  Q('b1-arch-10', 'NF', 't1-arch', 'What is a point-to-point topology?', [
    ['A link with exactly two devices, one at each end', true, 'Such as a serial WAN link or a fiber run.'],
    ['A shared segment with many devices', false, 'That is multiaccess.'],
    ['A star of devices around a switch', false, 'That is a star topology.'],
    ['A full mesh', false, 'Every node connected to every other.'],
  ], 'Point-to-point links have only two endpoints, so there is no MAC-based addressing problem to solve and OSPF does not elect a DR on them. Shared or multiaccess segments, such as Ethernet, can have many devices.'),
  Q('b1-arch-11', 'NF', 't1-arch', 'A company wants to run its email without owning any servers or software. Which cloud model fits?', [
    ['SaaS', true, 'The provider runs the whole application.'],
    ['IaaS', false, 'You would still install and run the email server.'],
    ['PaaS', false, 'You would still write or deploy the application.'],
    ['Colocation', false, 'You would still own the servers.'],
  ], 'Software as a Service is a finished application you subscribe to (hosted email, office suites, CRM). The provider handles infrastructure, OS, application and updates; you manage users and data.'),
  Q('b1-arch-12', 'NF', 't1-arch', 'In a hybrid cloud, what joins on-premises networks to the cloud provider?', [
    ['A site-to-site VPN or a dedicated private interconnect', true, 'Both are common.'],
    ['A crossover cable', false, 'Not across a WAN.'],
    ['DHCP relay', false, 'Unrelated.'],
    ['STP', false, 'Spanning tree is Layer 2 loop prevention.'],
  ], 'Most hybrid setups start with an IPsec VPN from the edge router or firewall to the provider\'s gateway, then move to a dedicated interconnect (such as a private circuit into the provider) when they need steady bandwidth and latency.'),

  // ---------- t1-physical ----------
  Q('b1-phy-01', 'NF', 't1-physical', 'What is the maximum length of a copper Ethernet run on Cat5e or Cat6 UTP?', [
    ['100 meters', true, 'The standard channel length.'],
    ['500 meters', false, 'Old thicknet coax.'],
    ['1 kilometer', false, 'Fiber distances.'],
    ['10 meters', false, 'Far shorter than allowed.'],
  ], 'Twisted-pair Ethernet is specified to 100 m end to end (90 m permanent link plus patch cords). Longer runs cause CRC errors and link flaps, and the fix is a switch closer to the users or fiber.'),
  Q('b1-phy-02', 'NF', 't1-physical', 'Which fiber type uses a narrow core and laser light for long distances?', [
    ['Single-mode fiber', true, 'About a 9 micron core.'],
    ['Multimode fiber', false, 'Wider core, shorter distances.'],
    ['Cat6a', false, 'Copper.'],
    ['Coax', false, 'Copper.'],
  ], 'Single-mode has a core of about 9 microns, so light travels in one path with little dispersion, reaching kilometers. Multimode cores are 50 or 62.5 microns; light takes many paths, which limits distance to hundreds of meters at high speeds.'),
  Q('b1-phy-03', 'NF', 't1-physical', 'Why would you choose fiber instead of copper between two buildings?', [
    ['Longer distances and immunity to electrical interference and ground differences', true, 'Fiber carries light, not current.'],
    ['It is cheaper per port', false, 'Fiber optics usually cost more.'],
    ['It provides PoE', false, 'Fiber carries no power.'],
    ['It is easier to terminate in the field', false, 'Fiber termination needs more skill and tools.'],
  ], 'Between buildings you face distances beyond 100 m, lightning and different ground potentials. Glass carries no current, so fiber avoids ground loops and EMI and reaches far beyond copper.'),
  Q('b1-phy-04', 'NF', 't1-physical', 'Both ends of this link are healthy except for one problem. What is it?', [
    ['A speed or duplex mismatch: one side shows full, the other half', true, 'The two ends disagree.'],
    ['A bad cable', false, 'No CRC errors on either side.'],
    ['A VLAN mismatch', false, 'VLANs do not show in these lines.'],
    ['Both ends are shut down', false, 'Both are up.'],
  ], 'When one side is hard-coded to full duplex and the other autonegotiates, the auto side cannot detect duplex and falls back to half. Symptoms: collisions and late collisions on the half side, CRC and runts on the full side, and slow transfers.', {
    exhibit: X(`
SW1#show interfaces gi0/7 | include duplex
  Full-duplex, 100Mb/s, media type is 10/100/1000BaseTX
SW2#show interfaces gi0/7 | include duplex
  Half-duplex, 100Mb/s, media type is 10/100/1000BaseTX`,
      [/SW\d#/, 'prompt'], [/show interfaces gi0\/7 \| include duplex/, 'cmd'], ['Full-duplex', 'ok', 'Full duplex'], ['Half-duplex', 'fail', 'Half duplex']),
  }),
  Q('b1-phy-05', 'NF', 't1-physical', 'What is the most common cause of a duplex mismatch?', [
    ['One side hard-coded to full duplex while the other is set to auto', true, 'Auto cannot detect duplex from a non-negotiating peer.'],
    ['Both sides set to auto', false, 'Auto on both ends negotiates correctly.'],
    ['Using fiber', false, 'Fiber links rarely run half duplex.'],
    ['A long cable', false, 'Length causes errors, not mismatched duplex.'],
  ], 'Autonegotiation needs both ends to take part. If one end is hard-set, the auto end detects the speed from the signal but cannot learn the duplex, so it assumes half. Either set both ends manually to the same values or leave both on auto.'),
  Q('b1-phy-06', 'NF', 't1-physical', 'An interface shows thousands of CRC errors and runts but no collisions. What is the first thing to check?', [
    ['The cable and connectors: damage, length or interference', true, 'Damaged frames point at Layer 1.'],
    ['The routing table', false, 'Routing does not corrupt frames.'],
    ['The VLAN configuration', false, 'VLANs do not cause CRC errors.'],
    ['DNS settings', false, 'Unrelated.'],
  ], 'CRC errors are frames whose checksum failed: bits were damaged on the wire. Swap the patch cord, test the run length, look for crushed cable or nearby electrical noise, and clear the counters to confirm the fix.'),
  Q('b1-phy-07', 'NF', 't1-physical', 'Which statement describes a shared medium compared with point-to-point?', [
    ['Several devices contend for the same medium, so collisions or contention control are needed', true, 'Hubs and wireless are shared.'],
    ['Each device gets a dedicated link to one other device', false, 'That is point-to-point.'],
    ['It can only carry IPv6', false, 'Unrelated to protocol version.'],
    ['It always uses fiber', false, 'Unrelated to media type.'],
  ], 'Hubs, old coax Ethernet and Wi-Fi are shared: only one device transmits at a time, using CSMA/CD (wired) or CSMA/CA (wireless). Switched full-duplex links are point-to-point, so there is no contention and collisions should be zero.'),
  Q('b1-phy-08', 'NF', 't1-physical', 'What are late collisions a symptom of on a switched network?', [
    ['A duplex mismatch, or a cable longer than the standard allows', true, 'They happen after the first 64 bytes.'],
    ['Normal traffic load', false, 'Collisions should not occur on full duplex.'],
    ['A VLAN mismatch', false, 'Unrelated.'],
    ['Too many MAC addresses', false, 'Unrelated.'],
  ], 'A late collision happens after the first 64 bytes of a frame, which on a correctly built network is impossible. On modern switched links they almost always mean duplex mismatch; on old hub networks they meant an over-long segment.'),
  Q('b1-phy-09', 'NF', 't1-physical', 'Which connector and fiber pairing is typical for a 10 km 10 Gb link between buildings?', [
    ['Single-mode fiber with an LR optic', true, 'LR is the long-reach, single-mode 10G standard.'],
    ['Multimode fiber with an SR optic', false, 'SR reaches a few hundred meters.'],
    ['Cat6a copper', false, 'Copper reaches 100 m.'],
    ['Twinax DAC', false, 'Direct attach cables reach a few meters.'],
  ], 'Optics are matched to fiber: SR (short reach) runs on multimode within a building, LR (long reach) runs about 10 km on single-mode, and ER goes further. Mixing single-mode optics with multimode cable, or the reverse, causes a dark or erroring link.'),
  Q('b1-phy-10', 'NF', 't1-physical', 'What does this output suggest about the cable run to the office upstairs?', [
    ['The run is damaged or too long: the link negotiated only 100 Mb/s and is logging CRC errors', true, 'A gigabit port falling back to 100 with errors points at the cabling.'],
    ['The switch is overloaded', false, 'Load does not cause CRC errors or a downshift.'],
    ['The port is in the wrong VLAN', false, 'VLANs do not affect speed or CRC.'],
    ['Everything is normal', false, 'CRC errors are not normal.'],
  ], 'Gigabit over copper needs all four pairs in good shape. A damaged pair often makes the link fall back to 100 Mb/s (which uses two pairs), and the remaining errors show as CRC. Test or replace the run.', {
    exhibit: X(`
Gi0/12 is up, line protocol is up
  Full-duplex, 100Mb/s, media type is 10/100/1000BaseTX
     812 input errors, 812 CRC, 0 frame, 0 overrun, 0 ignored`,
      ['Gi0/12', 'iface'], ['100Mb/s', 'fail', 'Fell back to 100'], ['812 input errors, 812 CRC', 'fail', 'Errors']),
  }),
  Q('b1-phy-11', 'NF', 't1-physical', 'Which statement about multimode fiber is true?', [
    ['It has a wider core than single-mode and is used for shorter runs, such as inside a building', true, '50 or 62.5 micron core.'],
    ['It is used for undersea cables', false, 'Those are single-mode.'],
    ['It carries electrical power', false, 'Fiber carries light only.'],
    ['It has a 9 micron core', false, 'That is single-mode.'],
  ], 'Multimode fiber and its optics are cheaper, which suits runs of a few hundred meters within buildings and data centers. Its wider core lets light take several paths (modes), which spreads pulses and limits distance.'),
  Q('b1-phy-12', 'NF', 't1-physical', 'An interface shows "input errors" climbing but every subcounter (CRC, frame, overrun, ignored) stays at zero except "giants". What does that indicate?', [
    ['Frames larger than the MTU are arriving, often from a jumbo-frame or MTU mismatch', true, 'Giants are oversized frames.'],
    ['A bad cable', false, 'That shows as CRC.'],
    ['Duplex mismatch', false, 'That shows collisions and runts.'],
    ['A routing loop', false, 'Loops do not create giant frames.'],
  ], 'Giants are frames over the maximum size; runts are under 64 bytes. Giants usually mean a neighbor is sending jumbo frames to a port with standard MTU. Match the MTU on both ends of the link.'),
  Q('b1-phy-13', 'NF', 't1-physical', 'Which cable type would a technician use from a PC\'s serial or USB port to a router\'s console port?', [
    ['A console (rollover) cable, or a USB console cable', true, 'Console access uses a rollover or USB-mini/USB-C cable.'],
    ['A straight-through Ethernet cable', false, 'That connects a PC to a switch.'],
    ['A crossover cable', false, 'That connects like devices on old ports without auto-MDIX.'],
    ['A fiber patch cord', false, 'Console ports are not fiber.'],
  ], 'Console cables are rollovers: pin 1 to 8, 2 to 7 and so on, usually with a DB-9 or USB adapter. Newer devices also offer a USB console port. The terminal settings are 9600 baud, 8 data bits, no parity, 1 stop bit, no flow control.'),
  Q('b1-phy-14', 'NF', 't1-physical', 'Why do modern switches rarely need crossover cables between them?', [
    ['Auto-MDIX detects the cable type and swaps transmit and receive pairs automatically', true, 'Auto-MDIX is standard on gigabit ports.'],
    ['Switches use fiber only', false, 'Most access links are copper.'],
    ['Crossover cables are banned by the standard', false, 'They are just usually unnecessary.'],
    ['STP handles it', false, 'STP prevents loops; it does not swap pairs.'],
  ], 'Like devices (switch to switch, PC to PC) used to need crossover cables. Auto-MDIX, standard on modern ports and required for gigabit, detects the wiring and adapts, so straight-through works everywhere.'),
  Q('b1-phy-15', 'NF', 't1-physical', 'A fiber uplink between two switches shows down/down after a move. Both optics are the same SR type. What should you check first?', [
    ['That the transmit and receive strands are not swapped, and the connectors are clean', true, 'Tx must land on Rx.'],
    ['The VLAN on the uplink', false, 'A VLAN cannot bring a link down.'],
    ['The OSPF area', false, 'Routing does not affect link state.'],
    ['The DNS server', false, 'Unrelated.'],
  ], 'A duplex fiber link needs each transmit strand to land on the other end\'s receive. After moves, rolled strands are the classic cause of a dark link; dirty connectors are next. Swap the pair at one end, and inspect and clean before reconnecting.'),
  Q('b1-phy-16', 'NF', 't1-physical', 'Which two symptoms point to a speed mismatch rather than a duplex mismatch? (Choose two.)', [
    ['The link stays down/down', true, 'Different speeds cannot form a link.'],
    ['The far side shows notconnect', true, 'No link at all.'],
    ['Late collisions on one side', false, 'That is duplex mismatch.'],
    ['A slow but working link', false, 'That is duplex mismatch.'],
  ], 'Speed mismatch usually means no link at all, because the two ends cannot even agree on signaling. Duplex mismatch gives a link that comes up and then performs badly, with collisions on one side and CRC errors on the other.'),

  // ---------- t1-transport ----------
  Q('b1-tcp-01', 'NF', 't1-transport', 'Which three flags make up the TCP three-way handshake, in order?', [
    ['SYN, SYN-ACK, ACK', true, 'Client SYN, server SYN-ACK, client ACK.'],
    ['ACK, SYN, FIN', false, 'FIN closes connections.'],
    ['SYN, ACK, FIN', false, 'FIN does not take part in setup.'],
    ['RST, SYN, ACK', false, 'RST aborts connections.'],
  ], 'The client sends SYN with its initial sequence number, the server answers SYN-ACK with its own and acknowledges the client\'s, and the client ACKs. Only then does data flow. A SYN with no SYN-ACK points at a firewall, a closed port or a routing problem.'),
  Q('b1-tcp-02', 'NF', 't1-transport', 'Which statements describe UDP? (Choose two.)', [
    ['It has no handshake and no acknowledgments', true, 'Connectionless.'],
    ['It suits live traffic such as voice, where late data is useless', true, 'Low overhead and no retransmission delay.'],
    ['It resends lost segments', false, 'That is TCP.'],
    ['It reorders data by sequence number', false, 'That is TCP.'],
  ], 'UDP adds ports and a checksum to IP and nothing else, so it is fast and light. Applications that need reliability over UDP build their own (QUIC, TFTP\'s lock-step ACKs); voice and video simply tolerate loss.'),
  Q('b1-tcp-03', 'NF', 't1-transport', 'Which protocol and port does HTTPS use by default?', [
    ['TCP 443', true, 'HTTP over TLS.'],
    ['TCP 80', false, 'Plain HTTP.'],
    ['UDP 53', false, 'DNS.'],
    ['TCP 22', false, 'SSH.'],
  ], 'Common ports to know: FTP 20/21, SSH 22, Telnet 23, SMTP 25, DNS 53, DHCP 67/68, TFTP 69, HTTP 80, NTP 123, SNMP 161/162, HTTPS 443, syslog 514. HTTP/3 also runs over UDP 443 using QUIC.'),
  Q('b1-tcp-04', 'NF', 't1-transport', 'What does TCP windowing control?', [
    ['How much data can be sent before waiting for an acknowledgment', true, 'Flow control.'],
    ['The order of the three-way handshake', false, 'Fixed by the protocol.'],
    ['The port number used', false, 'Ports identify applications.'],
    ['The IP TTL', false, 'IP sets TTL.'],
  ], 'The receiver advertises a window size; the sender keeps at most that much unacknowledged data in flight. A full receiver shrinks the window to slow the sender. Larger windows fill long, fast links better.'),
  Q('b1-tcp-05', 'NF', 't1-transport', 'Which applications use UDP? (Choose two.)', [
    ['TFTP', true, 'UDP 69.'],
    ['SNMP', true, 'UDP 161 and 162.'],
    ['SSH', false, 'TCP 22.'],
    ['HTTP', false, 'TCP 80.'],
  ], 'UDP: DNS queries, DHCP, TFTP, SNMP, NTP, syslog, RTP voice and video. TCP: HTTP(S), SSH, Telnet, FTP, SMTP and BGP. When an exam question asks "reliable", think TCP; "low overhead" or "live voice and video", think UDP.'),
  Q('b1-tcp-06', 'NF', 't1-transport', 'What happens when a TCP segment is lost?', [
    ['The sender notices the missing acknowledgment and retransmits it', true, 'Reliability through acknowledgments and timers.'],
    ['The data is gone; the application must notice', false, 'That is UDP behaviour.'],
    ['The router resends it', false, 'Routers do not retransmit TCP segments.'],
    ['The connection always resets', false, 'TCP recovers from ordinary loss.'],
  ], 'TCP numbers every byte. When acknowledgments stop advancing or duplicate ACKs arrive, the sender retransmits from the gap and shrinks its sending rate. That reliability is why TCP throughput drops sharply on lossy links.'),
  Q('b1-tcp-07', 'NF', 't1-transport', 'At which OSI layer do TCP and UDP operate?', [
    ['Layer 4, transport', true, 'They carry data between applications.'],
    ['Layer 3, network', false, 'That is IP.'],
    ['Layer 2, data link', false, 'That is Ethernet and MAC addressing.'],
    ['Layer 7, application', false, 'That is HTTP, DNS and so on.'],
  ], 'Each layer has its job and unit: Layer 2 frames between MACs, Layer 3 packets between IPs, Layer 4 segments (TCP) or datagrams (UDP) between ports, which identify the application.'),
  Q('b1-tcp-08', 'NF', 't1-transport', 'Which field lets one server run a web server and an SSH server on the same IP address?', [
    ['The destination port number', true, 'Ports separate applications.'],
    ['The MAC address', false, 'One MAC per interface.'],
    ['The TTL', false, 'Hop limit.'],
    ['The protocol field', false, 'That separates TCP from UDP, not apps.'],
  ], 'A socket is an IP address plus a protocol and port. Traffic to 10.1.1.10 TCP 443 reaches the web server and to TCP 22 reaches SSH. The client uses a random high source port so replies find their way back to the right program.'),
  Q('b1-tcp-09', 'NF', 't1-transport', 'Which TCP flag ends a connection gracefully?', [
    ['FIN', true, 'Each side sends FIN and ACKs the other\'s.'],
    ['RST', false, 'RST aborts immediately.'],
    ['SYN', false, 'Opens a connection.'],
    ['URG', false, 'Marks urgent data.'],
  ], 'A graceful close is a FIN from each side, each acknowledged. RST tears a connection down at once, and a RST in reply to a SYN means the port is closed, which is a useful troubleshooting clue.'),
  Q('b1-tcp-10', 'NF', 't1-transport', 'Which layer of the TCP/IP model maps to OSI Layers 5 through 7?', [
    ['Application', true, 'TCP/IP folds session, presentation and application together.'],
    ['Transport', false, 'That is OSI Layer 4.'],
    ['Internet', false, 'That is OSI Layer 3.'],
    ['Link', false, 'That is OSI Layers 1 and 2.'],
  ], 'TCP/IP layers: link (OSI 1 and 2), internet (3), transport (4) and application (5 to 7). Exam questions mostly use OSI numbers, so map both ways quickly.'),
  Q('b1-tcp-11', 'NF', 't1-transport', 'Put the encapsulation units in order from Layer 4 down to Layer 1.', [
    ['Segment, packet, frame, bits', true, 'Each layer wraps the one above.'],
    ['Packet, segment, frame, bits', false, 'Segments come before packets on the way down.'],
    ['Frame, packet, segment, bits', false, 'Reversed.'],
    ['Bits, frame, packet, segment', false, 'That is the order on the way up.'],
  ], 'Data leaving an application is segmented by TCP (or carried in a UDP datagram), wrapped in an IP packet, framed by Ethernet with MAC addresses and an FCS trailer, then sent as bits. Receiving devices unwrap in reverse.'),
  Q('b1-tcp-12', 'NF', 't1-transport', 'A firewall rule allows UDP 53 but not TCP 53. What will users notice?', [
    ['Most name lookups work, but large responses and zone transfers fail', true, 'DNS falls back to TCP for big answers.'],
    ['All DNS fails', false, 'Ordinary queries use UDP.'],
    ['Web browsing stops entirely', false, 'Only some lookups fail.'],
    ['Nothing; DNS never uses TCP', false, 'DNS uses TCP for large answers and transfers.'],
  ], 'DNS answers over 512 bytes (without EDNS) or that are truncated make the client retry over TCP 53, and zone transfers always use TCP. Blocking TCP 53 causes failures that look random because they hit only certain names.'),
  Q('b1-tcp-13', 'NF', 't1-transport', 'Which port numbers are well-known ports?', [
    ['0 to 1023', true, 'Assigned to standard services.'],
    ['1024 to 49151', false, 'Registered ports.'],
    ['49152 to 65535', false, 'Dynamic or ephemeral ports.'],
    ['1 to 100', false, 'Not the defined range.'],
  ], 'Servers listen on well-known (0 to 1023) or registered (1024 to 49151) ports. Clients pick ephemeral source ports, typically 49152 to 65535, which is why replies return to a high port.'),
  Q('b1-tcp-14', 'NF', 't1-transport', 'What does a TCP RST received immediately after sending a SYN to a server usually mean?', [
    ['Nothing is listening on that port, or a firewall actively rejected it', true, 'Closed ports answer with RST.'],
    ['The server is down', false, 'A down server sends nothing at all.'],
    ['The route is missing', false, 'You would see timeouts or ICMP unreachable.'],
    ['The handshake succeeded', false, 'Success is SYN-ACK.'],
  ], 'A RST is an answer: the host is reachable and replied that the port is closed. Silence (timeouts) means the packets are not getting there or are silently dropped. That difference tells you whether to look at the application or the network.'),
  Q('b1-tcp-15', 'NF', 't1-transport', 'Which protocols use TCP? (Choose two.)', [
    ['SSH', true, 'TCP 22.'],
    ['SMTP', true, 'TCP 25.'],
    ['NTP', false, 'UDP 123.'],
    ['Syslog', false, 'UDP 514 by default.'],
  ], 'Protocols that move files, mail, web pages and remote sessions need every byte, so they use TCP. Protocols that send small, frequent or time-sensitive messages, such as NTP, syslog, SNMP and voice, use UDP.'),
  Q('b1-tcp-16', 'NF', 't1-transport', 'Which device works at Layer 2, and which at Layer 3?', [
    ['Switch at Layer 2, router at Layer 3', true, 'MACs and IPs.'],
    ['Router at Layer 2, switch at Layer 3', false, 'Reversed.'],
    ['Both at Layer 1', false, 'Hubs and repeaters are Layer 1.'],
    ['Both at Layer 4', false, 'Firewalls inspect Layer 4, but these devices forward at 2 and 3.'],
  ], 'Hubs repeat bits (Layer 1), switches forward frames by MAC (Layer 2), routers forward packets by IP (Layer 3). Layer 3 switches do both, and firewalls also look at Layer 4 ports and beyond.'),

  // ---------- t1-client ----------
  Q('b1-cli-01', 'NF', 't1-client', 'What does this Windows output tell you?', [
    ['The PC never got a DHCP lease and gave itself an APIPA address', true, '169.254.x.x is self-assigned.'],
    ['The PC is configured correctly', false, 'There is no gateway and the address is link-local.'],
    ['The DNS server is down', false, 'No DNS server is even listed.'],
    ['The PC has a static address', false, 'DHCP Enabled says Yes.'],
  ], 'Windows assigns itself 169.254.0.0/16 when DHCP gets no answer. Look at the path to the DHCP server: is the port in the right VLAN, is the server up, does the router have an ip helper-address for this subnet?', {
    exhibit: X(`
C:\\>ipconfig /all
Ethernet adapter Ethernet0:
   DHCP Enabled. . . . . . . . . . . : Yes
   Autoconfiguration IPv4 Address. . : 169.254.37.112(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.0.0
   Default Gateway . . . . . . . . . :
   DNS Servers . . . . . . . . . . . :`,
      ['ipconfig /all', 'cmd'], ['DHCP Enabled. . . . . . . . . . . : Yes', 'key', 'DHCP is on'], ['169.254.37.112', 'fail', 'Self-assigned address'], ['255.255.0.0', 'mask'], [/Default Gateway . . . . . . . . . :/, 'gw', 'No gateway']),
  }),
  Q('b1-cli-02', 'NF', 't1-client', 'This PC can reach hosts on its own subnet but nothing else. What is wrong?', [
    ['The default gateway is in a different subnet from the PC', true, '192.168.10.1 is not in 192.168.1.0/24.'],
    ['The DNS server is wrong', false, 'DNS would not stop pings by IP.'],
    ['The mask is too large', false, '/24 matches the network.'],
    ['DHCP is disabled', false, 'Static addressing is fine.'],
  ], 'A host can only use a gateway it can ARP for, so the gateway must be in the host\'s own subnet. Here the PC is 192.168.1.50/24 and the gateway is 192.168.10.1, a different network. Correct the gateway (likely 192.168.1.1).', {
    exhibit: X(`
   IPv4 Address. . . . . . . . . . . : 192.168.1.50
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.10.1
   DNS Servers . . . . . . . . . . . : 192.168.1.10`,
      ['192.168.1.50', 'ip'], ['255.255.255.0', 'mask'], ['192.168.10.1', 'fail', 'Gateway in another subnet'], ['192.168.1.10', 'dns']),
  }),
  Q('b1-cli-03', 'NF', 't1-client', 'Which command shows the IP addresses of a Linux host\'s interfaces?', [
    ['ip addr', true, 'Also ip a; part of iproute2.'],
    ['ipconfig', false, 'That is Windows.'],
    ['show ip interface brief', false, 'That is Cisco IOS.'],
    ['netstat -r', false, 'That shows the routing table.'],
  ], 'Windows uses ipconfig (/all for detail), Linux uses ip addr and ip route (ifconfig on older systems), and macOS uses ifconfig plus networksetup or the System Settings pane. The exam expects you to read all three.'),
  Q('b1-cli-04', 'NF', 't1-client', 'What is this Linux host\'s default gateway?', [
    ['10.20.30.1', true, 'The default route\'s via address.'],
    ['10.20.30.0/24', false, 'That is the connected network.'],
    ['10.20.30.44', false, 'That is the host\'s own source address.'],
    ['eth0', false, 'That is the interface.'],
  ], 'On Linux, ip route shows the routing table: "default via" names the gateway, and "dev" the interface. The connected route for the local subnet is installed automatically from the address and prefix.', {
    exhibit: X(`
$ ip route
default via 10.20.30.1 dev eth0 proto dhcp metric 100
10.20.30.0/24 dev eth0 proto kernel scope link src 10.20.30.44`,
      ['ip route', 'cmd'], ['default via 10.20.30.1', 'gw'], ['10.20.30.0', 'ip', 'Local network'], ['/24', 'mask'], [/eth0/, 'iface'], ['10.20.30.44', 'ip', 'Host address']),
  }),
  Q('b1-cli-05', 'NF', 't1-client', 'Which Windows commands release and renew a DHCP address? (Choose two.)', [
    ['ipconfig /release', true, 'Gives the lease back.'],
    ['ipconfig /renew', true, 'Requests a new lease.'],
    ['ipconfig /flushdns', false, 'Clears the DNS cache.'],
    ['ipconfig /displaydns', false, 'Shows the DNS cache.'],
  ], 'Release then renew forces a fresh DORA exchange, which is the first thing to try after fixing a VLAN or DHCP scope. ipconfig /flushdns clears cached name lookups after a DNS record changes.'),
  Q('b1-cli-06', 'NF', 't1-client', 'A Mac user reports no network. In this output, what is the problem?', [
    ['en0 has only a self-assigned 169.254 address, so DHCP failed', true, 'macOS also self-assigns when DHCP fails.'],
    ['The MTU is too small', false, '1500 is standard.'],
    ['The interface is down', false, 'status: active.'],
    ['The MAC address is invalid', false, 'It is a valid MAC.'],
  ], 'macOS uses ifconfig: inet shows the IPv4 address and netmask (in hex, 0xffff0000 is /16), ether the MAC and status the link. A 169.254 address means DHCP got no answer, so check the VLAN and the DHCP server path.', {
    exhibit: X(`
$ ifconfig en0
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	ether a4:83:e7:12:34:56
	inet 169.254.81.20 netmask 0xffff0000 broadcast 169.254.255.255
	status: active`,
      ['ifconfig en0', 'cmd'], [/^en0/m, 'iface'], ['a4:83:e7:12:34:56', 'mac'], ['169.254.81.20', 'fail', 'Self-assigned address'], ['0xffff0000', 'mask'], ['status: active', 'ok', 'Link is up']),
  }),
  Q('b1-cli-07', 'NF', 't1-client', 'Which address must be in the same subnet as the host for off-subnet traffic to work?', [
    ['The default gateway', true, 'The host must ARP for it.'],
    ['The DNS server', false, 'DNS can be anywhere reachable.'],
    ['The DHCP server', false, 'A relay can forward to a remote server.'],
    ['The NTP server', false, 'Can be remote.'],
  ], 'The host sends off-subnet frames to the gateway\'s MAC, which it learns by ARP. ARP only works inside the subnet, so the gateway must live there. DNS, DHCP (with relay) and other servers can be anywhere routable.'),
  Q('b1-cli-08', 'NF', 't1-client', 'Which Windows command shows the host\'s routing table?', [
    ['route print', true, 'Also netstat -r.'],
    ['ipconfig /routes', false, 'Not a valid option.'],
    ['tracert', false, 'That traces a path.'],
    ['arp -a', false, 'That shows the ARP cache.'],
  ], 'route print lists the IPv4 and IPv6 routes, with 0.0.0.0 0.0.0.0 as the default route via the gateway. It helps when a VPN client or second NIC has added routes that steal traffic.'),
  Q('b1-cli-09', 'NF', 't1-client', 'This PC pings 10.1.5.1 (its gateway) and 8.8.8.8, but web browsing by name fails. What is the likely cause?', [
    ['The DNS server setting is wrong or the server is unreachable', true, 'IP connectivity works; name resolution does not.'],
    ['The gateway is wrong', false, 'The gateway answers.'],
    ['The cable is bad', false, 'Pings work.'],
    ['The subnet mask is wrong', false, 'Off-subnet pings work.'],
  ], 'When IP addresses work and names do not, look at DNS. nslookup example.com shows which server the PC asks and whether it answers. Here the DNS server, 10.1.5.250, would be the first thing to verify.', {
    exhibit: X(`
   IPv4 Address. . . . . . . . . . . : 10.1.5.37
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 10.1.5.1
   DNS Servers . . . . . . . . . . . : 10.1.5.250`,
      ['10.1.5.37', 'ip'], ['255.255.255.0', 'mask'], ['10.1.5.1', 'gw'], ['10.1.5.250', 'dns']),
  }),
  Q('b1-cli-10', 'NF', 't1-client', 'Which command on Windows tests name resolution directly against the configured DNS server?', [
    ['nslookup', true, 'Queries DNS and shows which server answered.'],
    ['ping -a', false, 'Resolves an IP to a name with a ping, less direct.'],
    ['tracert', false, 'Traces the path.'],
    ['arp -a', false, 'Shows MAC mappings.'],
  ], 'nslookup name prints the server it asked and the answer it got. A timeout points at reachability to the DNS server; "Non-existent domain" means the server answered but has no record.'),
  Q('b1-cli-11', 'NF', 't1-client', 'Which two values does a host need to reach a server on another subnet by IP address? (Choose two.)', [
    ['An IP address and mask in its own subnet', true, 'To know what is local.'],
    ['A default gateway', true, 'To send off-subnet traffic.'],
    ['A DNS server', false, 'Not needed when using an IP address.'],
    ['An NTP server', false, 'Time is unrelated to reachability.'],
  ], 'The host compares the destination with its own address and mask. If the destination is off-subnet, it sends the packet to the gateway\'s MAC. DNS only matters when you use names.'),
  Q('b1-cli-12', 'NF', 't1-client', 'Which entry in this Windows ARP cache is the default gateway, and what is its MAC?', [
    ['192.168.1.1 at 00-1a-2b-3c-4d-5e', true, 'The gateway is the router address on this subnet.'],
    ['192.168.1.255 at ff-ff-ff-ff-ff-ff', false, 'That is the broadcast entry.'],
    ['224.0.0.22 at 01-00-5e-00-00-16', false, 'That is a multicast group.'],
    ['192.168.1.50 at 00-50-56-aa-bb-cc', false, 'That is another host on the LAN.'],
  ], 'arp -a shows the IP-to-MAC mappings this host learned. The gateway entry is what every off-subnet frame is addressed to. A wrong or missing gateway entry, or two IPs with the same MAC, are classic clues to spoofing or duplicate addresses.', {
    exhibit: X(`
C:\\>arp -a
Interface: 192.168.1.37 --- 0x7
  Internet Address      Physical Address      Type
  192.168.1.1           00-1a-2b-3c-4d-5e     dynamic
  192.168.1.50          00-50-56-aa-bb-cc     dynamic
  192.168.1.255         ff-ff-ff-ff-ff-ff     static
  224.0.0.22            01-00-5e-00-00-16     static`,
      ['arp -a', 'cmd'], [/192\.168\.1\.1(?= )/, 'gw'], ['00-1a-2b-3c-4d-5e', 'mac', 'Gateway MAC'], [/192\.168\.1\.(37|50|255)/, 'ip'], [/[0-9a-f]{2}(-[0-9a-f]{2}){5}/, 'mac']),
  }),
];
