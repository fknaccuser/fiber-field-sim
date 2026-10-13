// Tree 2, Network Access, part A: VLANs and inter-VLAN routing, trunks,
// CDP and LLDP, and EtherChannel.

import { Q, X } from './qb.js';

export const T2_A = [
  // ---------- t2-vlans ----------
  Q('b2-vlan-01', 'NA', 't2-vlans', 'Which commands put Gi0/5 into VLAN 30 as an access port? (Choose two.)', [
    ['switchport mode access', true, 'Fixes the port as an access port.'],
    ['switchport access vlan 30', true, 'Assigns the VLAN.'],
    ['switchport trunk native vlan 30', false, 'That is for trunks.'],
    ['vlan 30 interface gi0/5', false, 'Not valid syntax.'],
  ], 'Under the interface: switchport mode access stops DTP from turning it into a trunk, and switchport access vlan 30 assigns the VLAN. If VLAN 30 does not exist yet, IOS creates it and says so.', { console: true }),
  Q('b2-vlan-02', 'NA', 't2-vlans', 'Which ports are in VLAN 20?', [
    ['Gi0/3 and Gi0/4', true, 'They are listed on the VLAN 20 row.'],
    ['Gi0/1 and Gi0/2', false, 'Those are in VLAN 10.'],
    ['Gi0/24', false, 'Trunk ports do not appear in show vlan brief.'],
    ['All ports', false, 'Each row lists its own ports.'],
  ], 'show vlan brief lists each VLAN with its name, status and access ports. Trunk ports are missing on purpose; check show interfaces trunk for them. A VLAN missing from this list means it was never created on this switch.', {
    exhibit: X(`
SW1#show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
1    default                          active    Gi0/5, Gi0/6
10   SALES                            active    Gi0/1, Gi0/2
20   ENGINEERING                      active    Gi0/3, Gi0/4
99   MGMT                             active`,
      ['show vlan brief', 'cmd'], [/^(1|10|20|99)(?= )/m, 'vlan'], [/Gi0\/\d/, 'iface'], [/active/, 'state']),
  }),
  Q('b2-vlan-03', 'NA', 't2-vlans', 'A PC in VLAN 10 cannot reach a PC in VLAN 20 on the same switch. What is needed?', [
    ['A router or Layer 3 switch to route between the VLANs', true, 'VLANs are separate subnets.'],
    ['A trunk between the two ports', false, 'Both are on one switch; a trunk does not route.'],
    ['Putting both PCs in VLAN 1', false, 'That defeats the segmentation.'],
    ['Turning off STP', false, 'Unrelated.'],
  ], 'Each VLAN is its own broadcast domain and IP subnet. Traffic between them needs a Layer 3 hop: router-on-a-stick, an SVI on a Layer 3 switch, or separate router interfaces.'),
  Q('b2-vlan-04', 'NA', 't2-vlans', 'Which configuration lets an IP phone use VLAN 50 while the PC behind it uses VLAN 10 on the same port?', [
    ['switchport access vlan 10 and switchport voice vlan 50', true, 'The phone tags voice; the PC stays untagged.'],
    ['switchport mode trunk', false, 'Works technically but is not the standard phone setup.'],
    ['switchport access vlan 50 only', false, 'The PC would land in the voice VLAN.'],
    ['Two IP addresses on the port', false, 'Switch ports do not take addresses.'],
  ], 'The voice VLAN feature tells the phone (by CDP or LLDP-MED) which VLAN to tag its own traffic with, while the PC\'s frames pass through the phone untagged into the access VLAN. Each gets its own subnet and QoS treatment.', { console: true }),
  Q('b2-vlan-05', 'NA', 't2-vlans', 'Which router-on-a-stick subinterface configuration is correct for VLAN 10?', [
    ['interface g0/0.10, encapsulation dot1Q 10, ip address 10.1.10.1 255.255.255.0', true, 'Tag first, then address.'],
    ['interface g0/0.10, ip address 10.1.10.1 255.255.255.0', false, 'No encapsulation; IOS refuses the address.'],
    ['interface vlan 10, encapsulation dot1Q 10', false, 'That mixes SVI and subinterface syntax.'],
    ['interface g0/0, switchport access vlan 10', false, 'Routers do not use switchport commands.'],
  ], 'Each subinterface handles one VLAN: encapsulation dot1Q sets the tag it accepts and sends, and the address becomes that VLAN\'s gateway. The switch port facing the router must be a trunk carrying those VLANs.', { console: true }),
  Q('b2-vlan-06', 'NA', 't2-vlans', 'An SVI on a Layer 3 switch shows down/down. Which condition would cause this?', [
    ['No port in that VLAN is up and forwarding', true, 'An SVI needs at least one active port in its VLAN.'],
    ['ip routing is disabled', false, 'The SVI could still be up/up.'],
    ['The SVI has no description', false, 'Descriptions are optional.'],
    ['The VLAN name is missing', false, 'Names are optional.'],
  ], 'An SVI comes up when the VLAN exists, the SVI is not shut down, and at least one access or trunk port carrying that VLAN is up and in STP forwarding. A VLAN with no active ports keeps its SVI down.'),
  Q('b2-vlan-07', 'NA', 't2-vlans', 'Which global command lets a Layer 3 switch route between its SVIs?', [
    ['ip routing', true, 'Off by default on many switch models.'],
    ['ipv6 unicast-routing', false, 'IPv6 only.'],
    ['router ospf 1', false, 'A routing protocol, not routing itself.'],
    ['switchport', false, 'Makes a port Layer 2.'],
  ], 'Without ip routing a multilayer switch treats SVIs as management interfaces only and uses ip default-gateway. With it, the switch routes between all its SVIs and routed ports.', { console: true }),
  Q('b2-vlan-08', 'NA', 't2-vlans', 'Why is it best practice to move user traffic off VLAN 1?', [
    ['VLAN 1 is the default for every port and carries control traffic, so it is a common attack target', true, 'Separating it reduces risk.'],
    ['VLAN 1 is slower', false, 'Speed is the same.'],
    ['VLAN 1 cannot be trunked', false, 'It can.'],
    ['VLAN 1 cannot have an SVI', false, 'It can.'],
  ], 'Every port starts in VLAN 1 and CDP, DTP and VTP traffic use it. Assign users to purpose-built VLANs, use a separate management VLAN, change the native VLAN to an unused one, and shut unused ports into a parking VLAN.'),
  Q('b2-vlan-09', 'NA', 't2-vlans', 'What does this message mean?', [
    ['VLAN 30 did not exist, so the switch created it', true, 'An informational message.'],
    ['The command failed', false, 'The port is assigned.'],
    ['VLAN 30 is reserved', false, 'Only 1002 to 1005 are reserved.'],
    ['The port is now a trunk', false, 'It is an access port.'],
  ], 'Assigning an access port to a VLAN that does not exist creates it with a default name (VLAN0030). It is good practice to create and name VLANs first with vlan 30 and name, so the list is intentional.', {
    exhibit: X(`
SW1(config-if)#switchport access vlan 30
% Access VLAN does not exist. Creating vlan 30`,
      ['SW1(config-if)#', 'prompt'], ['switchport access vlan 30', 'cmd'], [/vlan 30$/m, 'vlan'], ['% Access VLAN does not exist.', 'key', 'Informational message']),
  }),
  Q('b2-vlan-10', 'NA', 't2-vlans', 'Which VLAN range is the normal range on Cisco switches?', [
    ['1 to 1005', true, 'Normal range, stored in vlan.dat.'],
    ['1 to 4094', false, 'That includes the extended range.'],
    ['1006 to 4094', false, 'That is the extended range.'],
    ['0 to 4095', false, '0 and 4095 are reserved.'],
  ], 'VLANs 1 to 1005 are normal range (1002 to 1005 are reserved legacy VLANs), and 1006 to 4094 are extended. A 12-bit 802.1Q field allows 4096 values, with 0 and 4095 reserved.'),
  Q('b2-vlan-11', 'NA', 't2-vlans', 'Where are VLANs stored on a Catalyst switch, so that erasing startup-config does not remove them?', [
    ['In flash:vlan.dat', true, 'Delete it too for a full reset.'],
    ['In NVRAM with startup-config', false, 'They are kept separately.'],
    ['In RAM only', false, 'They survive reloads.'],
    ['On the VTP server only', false, 'Every switch keeps its own copy.'],
  ], 'Normal-range VLANs live in vlan.dat on flash. To wipe a switch completely: erase startup-config, delete flash:vlan.dat, and reload.'),
  Q('b2-vlan-12', 'NA', 't2-vlans', 'PCs on VLAN 10 cannot reach their gateway on the router. The router config is shown. What is wrong?', [
    ['The subinterface tags VLAN 100 instead of VLAN 10', true, 'encapsulation must match the VLAN.'],
    ['The IP address mask is wrong', false, '/24 is fine for this subnet.'],
    ['Subinterfaces cannot have descriptions', false, 'They can.'],
    ['The physical interface needs an IP address', false, 'The parent stays unaddressed in router-on-a-stick.'],
  ], 'The subinterface number is only a label; the encapsulation dot1Q value decides which VLAN tag it handles. Here g0/0.10 is listening for VLAN 100 frames, so VLAN 10 traffic has no gateway.', {
    exhibit: X(`
interface GigabitEthernet0/0.10
 description Gateway for VLAN 10
 encapsulation dot1Q 100
 ip address 10.1.10.1 255.255.255.0`,
      ['interface GigabitEthernet0/0.10', 'iface'], ['encapsulation dot1Q 100', 'fail', 'Wrong VLAN tag'], ['10.1.10.1', 'gw', 'Gateway for VLAN 10'], ['255.255.255.0', 'mask']),
  }),
  Q('b2-vlan-13', 'NA', 't2-vlans', 'What is a good practice for unused switch ports?', [
    ['Shut them down and assign them to an unused parking VLAN', true, 'Nothing can plug in and land on a live VLAN.'],
    ['Leave them in VLAN 1', false, 'That invites misuse.'],
    ['Make them trunks', false, 'That exposes every VLAN.'],
    ['Give them IP addresses', false, 'Layer 2 ports do not take addresses.'],
  ], 'An open, live port on a user VLAN is an invitation. Shutting unused ports and moving them to a VLAN with no gateway means a plugged-in device gets nothing until someone deliberately enables the port.'),
  Q('b2-vlan-14', 'NA', 't2-vlans', 'Which command creates VLAN 40 and names it GUEST?', [
    ['vlan 40, then name GUEST', true, 'From global configuration.'],
    ['vlan name 40 GUEST', false, 'Not valid syntax.'],
    ['interface vlan 40, then name GUEST', false, 'That creates an SVI.'],
    ['switchport vlan 40 GUEST', false, 'Not valid.'],
  ], 'vlan 40 enters VLAN configuration mode (config-vlan) and name sets the label. interface vlan 40 is something else: a Layer 3 SVI for that VLAN.', { console: true }),
  Q('b2-vlan-15', 'NA', 't2-vlans', 'Which inter-VLAN routing method scales best in a campus distribution layer?', [
    ['SVIs on a Layer 3 switch', true, 'Hardware routing, no single trunk bottleneck.'],
    ['Router-on-a-stick', false, 'All VLANs share one router link.'],
    ['One router interface per VLAN', false, 'Runs out of ports quickly.'],
    ['Bridging the VLANs', false, 'That merges them.'],
  ], 'Router-on-a-stick is cheap and fine for small sites, but every inter-VLAN packet crosses one trunk twice. SVIs on a multilayer switch route in hardware at line rate, which is why distribution layers use them.'),
  Q('b2-vlan-16', 'NA', 't2-vlans', 'Which output confirms the SVI for VLAN 10 is ready to route?', [
    ['Vlan10 is up, line protocol is up, with its IP address', true, 'up/up with an address.'],
    ['Vlan10 is administratively down', false, 'Shut down.'],
    ['Vlan10 is down, line protocol is down', false, 'No active ports in the VLAN.'],
    ['VLAN 10 listed in show vlan brief', false, 'That shows the VLAN exists, not the SVI.'],
  ], 'Check the SVI with show ip interface brief or show interfaces vlan 10. up/up means the VLAN exists, has at least one forwarding port, and the SVI is not shut. Then the switch can route for that subnet if ip routing is on.', { console: true }),
  Q('b2-vlan-17', 'NA', 't2-vlans', 'Which native VLAN subinterface configuration handles untagged frames on a router-on-a-stick trunk?', [
    ['encapsulation dot1Q 99 native', true, 'The native keyword maps untagged frames to this subinterface.'],
    ['encapsulation dot1Q 99 untagged', false, 'Not valid.'],
    ['switchport trunk native vlan 99', false, 'A switch command.'],
    ['encapsulation native 99', false, 'Not valid.'],
  ], 'The switch sends the native VLAN untagged. On the router, the subinterface for that VLAN takes encapsulation dot1Q 99 native (or the address goes on the physical interface). Both ends must agree on which VLAN is native.', { console: true }),
  Q('b2-vlan-18', 'NA', 't2-vlans', 'A user moved desks and now gets an address from the wrong subnet. What most likely happened?', [
    ['The new desk\'s switch port is in a different VLAN', true, 'The VLAN decides the subnet.'],
    ['The PC kept its old lease', false, 'It received a new address from the wrong subnet.'],
    ['DNS changed', false, 'DNS does not assign addresses.'],
    ['The cable is too long', false, 'That causes errors, not a different subnet.'],
  ], 'DHCP hands out addresses for whatever subnet the request arrives in, and the access VLAN decides that. Check show interfaces status or show vlan brief for the new port and set switchport access vlan to the user\'s VLAN.'),
  Q('b2-vlan-19', 'NA', 't2-vlans', 'What does switchport mode access do that switchport access vlan alone does not?', [
    ['Stops the port from negotiating a trunk with DTP', true, 'The port is fixed as access.'],
    ['Assigns the VLAN', false, 'That is switchport access vlan.'],
    ['Enables PortFast', false, 'A separate command.'],
    ['Turns the port on', false, 'That is no shutdown.'],
  ], 'Without switchport mode access a port may sit in a dynamic DTP mode and could become a trunk if a neighbor asks. Hard-setting access ports is both a stability and a security practice (it blocks switch spoofing).'),
  Q('b2-vlan-20', 'NA', 't2-vlans', 'How many broadcast domains does a switch with VLANs 1, 10, 20 and 30 in use have?', [
    ['Four', true, 'One per VLAN.'],
    ['One', false, 'VLANs split broadcast domains.'],
    ['Twenty-four', false, 'That would be one per port.'],
    ['Two', false, 'Each VLAN counts.'],
  ], 'Each VLAN is its own broadcast domain, no matter how many ports are in it. A router or Layer 3 switch is needed to pass traffic between them, and broadcasts never cross that boundary.'),
  Q('b2-vlan-21', 'NA', 't2-vlans', 'Which statement about VLANs spanning multiple switches is true?', [
    ['The VLAN must exist on every switch it crosses, and every link between them must carry it', true, 'Creation and trunk allowance on each hop.'],
    ['Creating it on one switch is enough', false, 'Each switch needs it (VTP is not on the v1.1 blueprint).'],
    ['Each switch must use a different VLAN ID', false, 'The ID must match end to end.'],
    ['A router is needed between switches', false, 'Trunks carry VLANs between switches.'],
  ], 'A VLAN is an end-to-end Layer 2 domain. If any switch in the path lacks it, or any trunk in the path does not allow it, the VLAN is split and hosts on either side cannot reach each other.'),
  Q('b2-vlan-22', 'NA', 't2-vlans', 'Which switch output shows that Gi0/8 is not assigned the VLAN the user needs (VLAN 10)?', [
    ['Gi0/8 listed under VLAN 1 default', true, 'It was never moved out of VLAN 1.'],
    ['VLAN 10 active with Gi0/1 and Gi0/2', false, 'Shows other ports.'],
    ['VLAN 99 with no ports', false, 'Unrelated.'],
    ['VLAN 1 status active', false, 'Status alone tells nothing about Gi0/8.'],
  ], 'Ports nobody has configured stay in VLAN 1. When a user cannot reach their subnet, find the port in show vlan brief first: if it is listed under default, assign it with switchport access vlan.', {
    exhibit: X(`
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
1    default                          active    Gi0/7, Gi0/8
10   STAFF                            active    Gi0/1, Gi0/2
99   MGMT                             active`,
      [/^(1|10|99)(?= )/m, 'vlan'], ['Gi0/8', 'fail', 'User port still in VLAN 1'], [/Gi0\/[127]/, 'iface']),
  }),

  // ---------- t2-trunks ----------
  Q('b2-trk-01', 'NA', 't2-trunks', 'Which VLANs can cross this trunk?', [
    ['10, 20 and 99', true, 'Listed under Vlans allowed on trunk.'],
    ['1 to 4094', false, 'The allowed list was pruned.'],
    ['Only 99', false, '99 is the native VLAN, and others are allowed too.'],
    ['Only 10', false, 'The list has three VLANs.'],
  ], 'show interfaces trunk has four blocks: mode and native VLAN; VLANs allowed; VLANs allowed and active (they exist on this switch); and VLANs forwarding in STP. A VLAN must appear in all of them to pass.', {
    exhibit: X(`
SW1#show interfaces trunk
Port        Mode         Encapsulation  Status        Native vlan
Gi0/24      on           802.1q         trunking      99

Port        Vlans allowed on trunk
Gi0/24      10,20,99

Port        Vlans allowed and active in management domain
Gi0/24      10,20,99

Port        Vlans in spanning tree forwarding state and not pruned
Gi0/24      10,20,99`,
      ['show interfaces trunk', 'cmd'], [/Gi0\/24/, 'iface'], ['trunking', 'ok', 'Trunk is up'], [/(?<=trunking {6})99/, 'vlan', 'Native VLAN'], [/10,20,99/, 'vlan', 'Allowed VLANs']),
  }),
  Q('b2-trk-02', 'NA', 't2-trunks', 'Users in VLAN 30 on SW2 cannot reach VLAN 30 on SW1. Based on this output from SW1, why?', [
    ['VLAN 30 is not in the trunk\'s allowed list', true, 'Only 10 and 20 are allowed.'],
    ['The trunk is down', false, 'It shows trunking.'],
    ['The native VLAN is wrong', false, 'Native VLAN does not block 30.'],
    ['VLAN 30 needs a router', false, 'Same VLAN, so no routing is needed.'],
  ], 'A VLAN missing from switchport trunk allowed vlan is dropped on that link. Add it with switchport trunk allowed vlan add 30; typing the list without add replaces it and can cut off other VLANs.', {
    exhibit: X(`
Port        Mode         Encapsulation  Status        Native vlan
Gi0/24      on           802.1q         trunking      1

Port        Vlans allowed on trunk
Gi0/24      10,20`,
      [/Gi0\/24/, 'iface'], ['trunking', 'ok', 'Trunk is up'], ['10,20', 'fail', 'VLAN 30 missing']),
  }),
  Q('b2-trk-03', 'NA', 't2-trunks', 'Which command adds VLAN 30 to a trunk without removing the VLANs already allowed?', [
    ['switchport trunk allowed vlan add 30', true, 'add appends.'],
    ['switchport trunk allowed vlan 30', false, 'Replaces the whole list with only 30.'],
    ['switchport trunk vlan 30', false, 'Not valid.'],
    ['switchport access vlan 30', false, 'For access ports.'],
  ], 'The allowed list keywords are add, remove, except, all and none. Forgetting add is a classic outage: the trunk suddenly carries only the one VLAN you typed.', { console: true }),
  Q('b2-trk-04', 'NA', 't2-trunks', 'What does this log message point to, and what is the risk?', [
    ['The native VLANs differ on the two ends; untagged traffic leaks between VLAN 1 and VLAN 99', true, 'Native VLAN mismatch.'],
    ['CDP is disabled on SW2', false, 'CDP is working; it found the mismatch.'],
    ['The trunk is down', false, 'The message is about native VLANs.'],
    ['VLAN 99 does not exist', false, 'It is configured as native on SW2.'],
  ], 'Each end sends its native VLAN untagged and puts untagged frames it receives into its own native VLAN. With 1 on one side and 99 on the other, frames silently move between VLANs. Set switchport trunk native vlan to the same value on both ends.', {
    exhibit: X(`
%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on GigabitEthernet0/24 (1), with SW2 GigabitEthernet0/24 (99).`,
      ['%CDP-4-NATIVE_VLAN_MISMATCH', 'fail', 'The problem'], [/GigabitEthernet0\/24/, 'iface'], ['(1)', 'vlan', 'Native on SW1'], ['(99)', 'vlan', 'Native on SW2']),
  }),
  Q('b2-trk-05', 'NA', 't2-trunks', 'Two switch ports are both left in dynamic auto mode. What happens on the link?', [
    ['It stays an access link; neither side asks to trunk', true, 'auto only responds.'],
    ['It becomes a trunk', false, 'One side must be desirable or trunk.'],
    ['The link goes err-disabled', false, 'No error occurs.'],
    ['It becomes an EtherChannel', false, 'Unrelated.'],
  ], 'DTP: dynamic auto waits to be asked, dynamic desirable asks. auto plus auto never trunks; desirable plus auto or desirable trunks; trunk plus auto trunks. Best practice is to set switchport mode trunk or access explicitly and disable DTP with switchport nonegotiate.'),
  Q('b2-trk-06', 'NA', 't2-trunks', 'How many bytes does an 802.1Q tag add to a frame, and how many bits hold the VLAN ID?', [
    ['4 bytes; 12 bits', true, 'TPID 0x8100, PCP, DEI and a 12-bit VID.'],
    ['2 bytes; 8 bits', false, 'Too small for 4094 VLANs.'],
    ['26 bytes; 10 bits', false, 'ISL added 30 bytes; not 802.1Q.'],
    ['4 bytes; 16 bits', false, 'The VID is 12 bits.'],
  ], 'The 802.1Q tag is inserted after the source MAC: 2 bytes of TPID (0x8100) and 2 bytes of tag control info (3-bit priority, 1-bit DEI, 12-bit VLAN ID). The 3 priority bits carry CoS for QoS.'),
  Q('b2-trk-07', 'NA', 't2-trunks', 'Which command on a switch that supports both ISL and 802.1Q must come before switchport mode trunk?', [
    ['switchport trunk encapsulation dot1q', true, 'Otherwise IOS rejects mode trunk on auto encapsulation.'],
    ['switchport nonegotiate', false, 'Optional, and can follow.'],
    ['spanning-tree portfast trunk', false, 'Optional.'],
    ['no switchport', false, 'That makes the port Layer 3.'],
  ], 'On older switches the trunk encapsulation defaults to negotiate, and IOS refuses switchport mode trunk with "An interface whose trunk encapsulation is Auto can not be configured to trunk mode". Set dot1q first. Many newer switches support only 802.1Q and lack the command.', { console: true }),
  Q('b2-trk-08', 'NA', 't2-trunks', 'Which pair of DTP modes forms a trunk?', [
    ['dynamic desirable on one side, dynamic auto on the other', true, 'Desirable asks, auto agrees.'],
    ['dynamic auto on both sides', false, 'Nobody asks.'],
    ['access on one side, trunk on the other', false, 'A mismatch; it does not trunk properly.'],
    ['nonegotiate on both sides in auto', false, 'nonegotiate turns DTP off, so auto cannot form a trunk.'],
  ], 'A trunk forms when at least one side is trunk or desirable and the other is trunk, desirable or auto. Access on either side, or auto on both, leaves an access link. Hard-setting both ends avoids surprises.'),
  Q('b2-trk-09', 'NA', 't2-trunks', 'What security attack does setting the native VLAN to an unused VLAN help prevent?', [
    ['VLAN hopping by double tagging', true, 'An attacker\'s outer tag matching the native VLAN is stripped.'],
    ['MAC flooding', false, 'Port security addresses that.'],
    ['DHCP starvation', false, 'Port security and snooping address that.'],
    ['ARP spoofing', false, 'DAI addresses that.'],
  ], 'In double tagging, an attacker on the native VLAN sends a frame with two tags. The first switch strips the outer (native) tag and forwards the inner one onto a trunk, landing it in the target VLAN. An unused native VLAN, and no hosts on it, removes the opening.'),
  Q('b2-trk-10', 'NA', 't2-trunks', 'Which mode does this output show for the port, and why is the link not trunking?', [
    ['The local port is dynamic auto and so is the other side', true, 'auto plus auto stays access.'],
    ['The port is shut down', false, 'Status says not-trunking, not down.'],
    ['The encapsulation is ISL', false, 'It shows 802.1q.'],
    ['The native VLAN is mismatched', false, 'Native VLAN does not stop trunk formation.'],
  ], 'show interfaces gi0/1 switchport shows Administrative Mode (what you set) and Operational Mode (what it negotiated). dynamic auto with an operational static access means nobody asked to trunk. Set switchport mode trunk on at least one side, ideally both.', {
    exhibit: X(`
SW1#show interfaces gi0/1 switchport
Name: Gi0/1
Switchport: Enabled
Administrative Mode: dynamic auto
Operational Mode: static access
Administrative Trunking Encapsulation: dot1q
Negotiation of Trunking: On
Access Mode VLAN: 1 (default)`,
      ['show interfaces gi0/1 switchport', 'cmd'], ['Administrative Mode: dynamic auto', 'key', 'What is configured'], ['Operational Mode: static access', 'fail', 'Not trunking'], ['1 (default)', 'vlan']),
  }),
  Q('b2-trk-11', 'NA', 't2-trunks', 'A trunk shows VLAN 40 in "Vlans allowed on trunk" but not in "Vlans allowed and active in management domain". What is wrong?', [
    ['VLAN 40 does not exist on this switch', true, 'Allowed but never created.'],
    ['VLAN 40 is pruned by STP', false, 'That would show in the last block.'],
    ['The trunk is down', false, 'Other VLANs are active.'],
    ['VLAN 40 is the native VLAN', false, 'Unrelated.'],
  ], 'Allowing a VLAN on a trunk does not create it. The "allowed and active" block only lists VLANs that exist locally. Create it with vlan 40 and it appears.'),
  Q('b2-trk-12', 'NA', 't2-trunks', 'What happens to an untagged frame received on an 802.1Q trunk?', [
    ['It is placed in the trunk\'s native VLAN', true, 'Untagged means native.'],
    ['It is dropped', false, 'Native VLAN traffic is untagged by design.'],
    ['It goes to VLAN 4095', false, 'Reserved.'],
    ['It is flooded to every VLAN', false, 'It belongs to one VLAN.'],
  ], 'The native VLAN is the one exception to tagging on an 802.1Q trunk: sent untagged, and untagged arrivals land in it. That is why both ends must agree on it.'),
  Q('b2-trk-13', 'NA', 't2-trunks', 'Which command removes VLAN 1 from a trunk\'s allowed list?', [
    ['switchport trunk allowed vlan remove 1', true, 'Removes just that VLAN.'],
    ['no vlan 1', false, 'VLAN 1 cannot be deleted.'],
    ['switchport trunk native vlan 1', false, 'Sets the native VLAN.'],
    ['switchport trunk allowed vlan none', false, 'Removes every VLAN.'],
  ], 'Pruning unused VLANs from trunks, VLAN 1 included, limits how far broadcasts and attacks travel. Control protocols such as CDP and STP BPDUs still run on the link.', { console: true }),
  Q('b2-trk-14', 'NA', 't2-trunks', 'Which statement describes a trunk link?', [
    ['A link that carries frames from several VLANs, tagged so the receiver can tell them apart', true, 'The definition.'],
    ['A link that belongs to a single VLAN', false, 'That is an access link.'],
    ['A routed link between two routers', false, 'That is Layer 3.'],
    ['A bundle of links', false, 'That is EtherChannel.'],
  ], 'Trunks connect switches to switches, routers (router-on-a-stick), virtualization hosts and WLCs. Access links connect end devices that belong to one VLAN.'),
  Q('b2-trk-15', 'NA', 't2-trunks', 'Which pair of settings must match on both ends of a trunk for it to work cleanly? (Choose two.)', [
    ['Native VLAN', true, 'Mismatch leaks traffic.'],
    ['Allowed VLAN lists, for the VLANs that must pass', true, 'Each side must allow them.'],
    ['Port descriptions', false, 'Labels only.'],
    ['PortFast', false, 'Not used on trunks to switches.'],
  ], 'Each end decides independently what it will accept, so a VLAN must be allowed on both, and the native VLAN must match. Encapsulation must also agree (802.1Q in practice).'),
  Q('b2-trk-16', 'NA', 't2-trunks', 'Which command turns DTP off on a trunk port?', [
    ['switchport nonegotiate', true, 'Stops sending DTP frames.'],
    ['no switchport', false, 'Makes it a routed port.'],
    ['switchport mode access', false, 'Turns the trunk into an access port.'],
    ['no cdp enable', false, 'Turns off CDP.'],
  ], 'switchport nonegotiate keeps the port a trunk but stops DTP messages, removing a switch-spoofing path. It requires the port to be hard-set to trunk or access first.', { console: true }),
  Q('b2-trk-17', 'NA', 't2-trunks', 'Which configuration builds a trunk on Gi0/24 carrying only VLANs 10 and 20, with native VLAN 99?', [
    ['switchport mode trunk / switchport trunk allowed vlan 10,20,99 / switchport trunk native vlan 99', true, 'Allow the native VLAN too.'],
    ['switchport mode trunk / switchport access vlan 10,20', false, 'access vlan takes one VLAN and applies to access ports.'],
    ['switchport trunk native vlan 10,20,99', false, 'One native VLAN only.'],
    ['switchport mode access / switchport trunk allowed vlan 10,20', false, 'An access port ignores trunk settings.'],
  ], 'Set the mode, then the allowed list, then the native VLAN. Including the native VLAN in the allowed list keeps untagged control traffic flowing. Match all three on the far switch.', { console: true }),
  Q('b2-trk-18', 'NA', 't2-trunks', 'What does "Vlans in spanning tree forwarding state and not pruned" leaving out VLAN 20 most likely mean?', [
    ['STP is blocking this trunk for VLAN 20', true, 'Another path is forwarding for that VLAN.'],
    ['VLAN 20 is not allowed', false, 'It would be missing from the allowed block.'],
    ['VLAN 20 does not exist', false, 'It would be missing from the active block.'],
    ['The trunk is down', false, 'Other VLANs forward.'],
  ], 'Read the four blocks top down to find where a VLAN disappears: allowed, then exists, then forwarding. Missing only from the last block is normal when STP blocks that VLAN on this link because a better path exists.'),

  // ---------- t2-discovery ----------
  Q('b2-cdp-01', 'NA', 't2-discovery', 'From this output, which port on SW2 connects to R1?', [
    ['Gig 0/24', true, 'Port ID is the neighbor\'s port.'],
    ['Gig 0/1', false, 'That is R1\'s local interface.'],
    ['150', false, 'That is the holdtime.'],
    ['ISR4321', false, 'That is the platform.'],
  ], 'Read show cdp neighbors from your own side: Local Intrfce is your port, Port ID is theirs. Capability letters show the role (R router, S switch, I IGMP). Holdtime counts down from 180 seconds and resets with each CDP message.', {
    exhibit: X(`
R1#show cdp neighbors
Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge
                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone
Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID
SW2              Gig 0/1           150             S I    WS-C2960X Gig 0/24
R2               Gig 0/0           171             R B    ISR4321   Gig 0/0/0`,
      ['show cdp neighbors', 'cmd'], [/^(SW2|R2)(?= )/m, 'role', 'Neighbor name'], [/(?<=^\w+ +)Gig 0\/\d/m, 'iface', 'Local interface'], [/Gig 0\/24|Gig 0\/0\/0/, 'iface', 'Neighbor\'s port'], [/(150|171)(?= )/, 'count', 'Holdtime']),
  }),
  Q('b2-cdp-02', 'NA', 't2-discovery', 'Which command shows a CDP neighbor\'s IP address and software version?', [
    ['show cdp neighbors detail', true, 'Adds addresses and version.'],
    ['show cdp neighbors', false, 'The summary lacks addresses.'],
    ['show cdp interface', false, 'Shows CDP settings per interface.'],
    ['show ip arp', false, 'Shows IP-to-MAC, not neighbor details.'],
  ], 'show cdp neighbors detail (or show cdp entry *) lists each neighbor\'s management address, platform, IOS version, native VLAN and duplex. It is the fastest way to find the IP of the device at the other end of a cable.', { console: true }),
  Q('b2-cdp-03', 'NA', 't2-discovery', 'What are the default CDP timers?', [
    ['Sent every 60 seconds, holdtime 180 seconds', true, 'Cisco defaults.'],
    ['Every 30 seconds, holdtime 120 seconds', false, 'Those are LLDP defaults.'],
    ['Every 10 seconds, holdtime 40 seconds', false, 'Those resemble OSPF hello and dead.'],
    ['Every 2 seconds, holdtime 20 seconds', false, 'Those resemble STP timers.'],
  ], 'CDP advertises every 60 seconds and neighbors keep the entry for 180 seconds. LLDP defaults are 30 and 120. Tuned with cdp timer and cdp holdtime, or lldp timer and lldp holdtime.'),
  Q('b2-cdp-04', 'NA', 't2-discovery', 'Which command enables LLDP globally on a Cisco switch?', [
    ['lldp run', true, 'LLDP is off by default on many IOS devices.'],
    ['cdp run', false, 'That enables CDP.'],
    ['lldp enable', false, 'Not the global command.'],
    ['feature lldp', false, 'NX-OS syntax.'],
  ], 'LLDP is the IEEE 802.1AB standard, so it works with non-Cisco neighbors. lldp run enables it globally; per interface, lldp transmit and lldp receive control each direction. show lldp neighbors lists what it found.', { console: true }),
  Q('b2-cdp-05', 'NA', 't2-discovery', 'Why might an administrator disable CDP on internet-facing interfaces?', [
    ['CDP reveals device model, IOS version and addresses to anyone on the link', true, 'Information leakage.'],
    ['CDP uses a lot of bandwidth', false, 'Its traffic is tiny.'],
    ['CDP breaks routing', false, 'It does not interact with routing.'],
    ['CDP is required only on trunks', false, 'Unrelated.'],
  ], 'CDP is handy inside the network but gives an attacker a free inventory. Turn it off per interface with no cdp enable on edges facing providers or untrusted users, or globally with no cdp run.'),
  Q('b2-cdp-06', 'NA', 't2-discovery', 'At which layer does CDP operate, allowing it to work before any IP address is configured?', [
    ['Layer 2', true, 'Sent as multicast frames.'],
    ['Layer 3', false, 'It does not need IP.'],
    ['Layer 4', false, 'It does not use TCP or UDP.'],
    ['Layer 7', false, 'Not an application protocol in that sense.'],
  ], 'CDP and LLDP are data link protocols sent to a multicast MAC, so they discover neighbors even on a link with no IP configuration. They are not forwarded by switches, so you only ever see directly connected devices.'),
  Q('b2-cdp-07', 'NA', 't2-discovery', 'What is the LLDP neighbor in this output, and on which of its ports?', [
    ['A switch named core-sw1, on its port Te1/0/1', true, 'Port ID is the neighbor\'s port.'],
    ['A router named Gi1/0/48', false, 'That is the local interface.'],
    ['A phone on port 120', false, '120 is the holdtime.'],
    ['Nothing; LLDP is off', false, 'A neighbor is listed.'],
  ], 'show lldp neighbors uses the same idea as CDP: Device ID, local interface, holdtime, capabilities (B bridge, R router, T telephone, W WLAN AP) and the neighbor\'s Port ID.', {
    exhibit: X(`
SW3#show lldp neighbors
Capability codes:
    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device
    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other
Device ID           Local Intf     Hold-time  Capability      Port ID
core-sw1            Gi1/0/48       120        B,R             Te1/0/1`,
      ['show lldp neighbors', 'cmd'], [/^core-sw1/m, 'role', 'Neighbor name'], ['Gi1/0/48', 'iface', 'Local interface'], ['Te1/0/1', 'iface', 'Neighbor\'s port'], [/(?<= {7})120(?= )/, 'count', 'Holdtime'], [/B,R/, 'role', 'Capabilities']),
  }),
  Q('b2-cdp-08', 'NA', 't2-discovery', 'Which command disables CDP on one interface only?', [
    ['no cdp enable', true, 'Interface level.'],
    ['no cdp run', false, 'That is global.'],
    ['cdp disable', false, 'Not valid.'],
    ['shutdown', false, 'That disables the interface.'],
  ], 'no cdp run turns CDP off for the whole device; no cdp enable under an interface stops it there only. The LLDP equivalents are no lldp run globally and no lldp transmit / no lldp receive per interface.', { console: true }),
  Q('b2-cdp-09', 'NA', 't2-discovery', 'Which discovery protocol would you use in a network that mixes Cisco and other vendors\' switches?', [
    ['LLDP', true, 'An open IEEE standard.'],
    ['CDP', false, 'Cisco proprietary.'],
    ['DTP', false, 'Trunk negotiation.'],
    ['VTP', false, 'VLAN propagation.'],
  ], 'CDP is Cisco only. LLDP (802.1AB) is understood by every major vendor and by many IP phones through LLDP-MED, which can also hand phones their voice VLAN.'),
  Q('b2-cdp-10', 'NA', 't2-discovery', 'You are documenting an unlabelled closet. Which steps find what each switch port connects to? (Choose two.)', [
    ['show cdp neighbors or show lldp neighbors on each switch', true, 'Names and ports of infrastructure neighbors.'],
    ['show mac address-table to find end devices per port', true, 'Endpoints rarely run CDP.'],
    ['show ip route', false, 'Lists networks, not cables.'],
    ['show running-config | include hostname', false, 'Only names this switch.'],
  ], 'CDP and LLDP map switch to switch, router, AP and phone links with exact port names. End devices usually do not speak them, so the MAC table (combined with ARP on the gateway) identifies what sits on access ports.'),
  Q('b2-cdp-11', 'NA', 't2-discovery', 'What does a CDP neighbor\'s holdtime reaching zero mean?', [
    ['No CDP message arrived in time, so the neighbor entry is removed', true, 'The neighbor is gone or the link is broken.'],
    ['The neighbor rebooted successfully', false, 'A reboot would refresh the entry later.'],
    ['CDP is working normally', false, 'Normally it resets before zero.'],
    ['The interface is err-disabled', false, 'Not by itself.'],
  ], 'Holdtime counts down and resets to 180 on every CDP message. If it reaches zero the entry disappears, which means the neighbor stopped sending (down, disconnected, or CDP disabled on its side).'),
  Q('b2-cdp-12', 'NA', 't2-discovery', 'Which piece of information appears in show cdp neighbors detail but not in the summary?', [
    ['The neighbor\'s IP address', true, 'Entry address(es).'],
    ['The neighbor\'s device ID', false, 'In both.'],
    ['The local interface', false, 'In both.'],
    ['The holdtime', false, 'In both.'],
  ], 'The detail view adds management address, full platform, IOS version, native VLAN and duplex. Native VLAN and duplex there are how CDP spots mismatches and logs warnings about them.'),

  // ---------- t2-etherchannel ----------
  Q('b2-ec-01', 'NA', 't2-etherchannel', 'Which LACP mode pairs will form an EtherChannel? (Choose two.)', [
    ['active and passive', true, 'Active initiates.'],
    ['active and active', true, 'Both initiate.'],
    ['passive and passive', false, 'Nobody initiates.'],
    ['active and desirable', false, 'Desirable is PAgP; protocols must match.'],
  ], 'LACP: active sends LACP packets, passive only answers. At least one side must be active. PAgP works the same way with desirable and auto. on forces the bundle with no protocol and only works with on at the other end.'),
  Q('b2-ec-02', 'NA', 't2-etherchannel', 'Which configuration bundles Gi0/1 and Gi0/2 into port-channel 1 using LACP?', [
    ['interface range g0/1 - 2, channel-group 1 mode active', true, 'Active is LACP.'],
    ['interface range g0/1 - 2, channel-group 1 mode desirable', false, 'Desirable is PAgP.'],
    ['interface port-channel 1, members g0/1 g0/2', false, 'Not valid syntax.'],
    ['interface range g0/1 - 2, channel-protocol pagp', false, 'Wrong protocol, and no group.'],
  ], 'Configure the members, not the port-channel: channel-group creates Port-channel1 automatically. Then configure trunking on the port-channel interface, and the settings propagate to the members.', { console: true }),
  Q('b2-ec-03', 'NA', 't2-etherchannel', 'What does this output say about port-channel 1?', [
    ['It is a Layer 2 bundle in use, with Gi0/1 and Gi0/2 bundled using LACP', true, 'SU and (P) flags.'],
    ['It is down', false, 'SU means in use.'],
    ['It is a Layer 3 bundle', false, 'S means Layer 2; R would be Layer 3.'],
    ['It uses PAgP', false, 'The protocol column says LACP.'],
  ], 'In show etherchannel summary, the port-channel flags give layer and state (S Layer 2, R Layer 3, U in use, D down), and each member\'s flag shows its state: P bundled, I stand-alone, s suspended, D down.', {
    exhibit: X(`
SW1#show etherchannel summary
Flags:  D - down        P - bundled in port-channel
        I - stand-alone s - suspended
        R - Layer3      S - Layer2
        U - in use      N - not in use, no aggregation
Group  Port-channel  Protocol    Ports
------+-------------+-----------+-----------------------------------------------
1      Po1(SU)         LACP      Gi0/1(P)    Gi0/2(P)`,
      ['show etherchannel summary', 'cmd'], ['Po1', 'iface', 'Port-channel'], ['(SU)', 'ok', 'Layer 2, in use'], [/Gi0\/[12]/, 'iface'], [/\(P\)/, 'ok', 'Bundled'], ['LACP', 'key', 'Protocol']),
  }),
  Q('b2-ec-04', 'NA', 't2-etherchannel', 'Gi0/2 shows (I) in show etherchannel summary while Gi0/1 shows (P). What does that mean?', [
    ['Gi0/2 is stand-alone: it did not join the bundle, often due to a mismatch or no LACP partner', true, 'I means individual.'],
    ['Gi0/2 is the primary link', false, 'There is no primary.'],
    ['Gi0/2 is bundled in a Layer 3 channel', false, 'That would be P with R on the channel.'],
    ['Gi0/2 is administratively down', false, 'That would be D.'],
  ], 'A member that will not bundle usually differs from the others (speed, duplex, access VLAN, trunk allowed list, native VLAN), or the far side is not running LACP on that port. Compare show run for the members and check the far end.'),
  Q('b2-ec-05', 'NA', 't2-etherchannel', 'Which settings must match on every member port of an EtherChannel? (Choose two.)', [
    ['Speed and duplex', true, 'Members must be identical physically.'],
    ['Switchport mode and VLAN settings (access VLAN or trunk allowed and native VLANs)', true, 'Layer 2 settings must match.'],
    ['Interface descriptions', false, 'Labels may differ.'],
    ['CDP status', false, 'Not required to match.'],
  ], 'The bundle behaves like one port, so its members must look identical: same speed and duplex, same mode, same VLANs. A member that differs is suspended or stays stand-alone.'),
  Q('b2-ec-06', 'NA', 't2-etherchannel', 'How does an EtherChannel spread traffic over its links?', [
    ['Per flow, by hashing addresses (such as source and destination IP or MAC), so one flow uses one link', true, 'Keeps frames of a flow in order.'],
    ['Per packet, round robin', false, 'That would reorder frames.'],
    ['All traffic on the first link until it is full', false, 'Not how hashing works.'],
    ['By VLAN number only', false, 'VLAN is not the standard hash input.'],
  ], 'A hash of fields such as src-dst-ip picks the member link for each flow. One big flow cannot go faster than one link. show etherchannel load-balance shows the method and port-channel load-balance changes it.'),
  Q('b2-ec-07', 'NA', 't2-etherchannel', 'How does spanning tree treat an EtherChannel?', [
    ['As a single logical link, so no member port is blocked', true, 'That is a key benefit.'],
    ['As separate links, blocking all but one', false, 'That is what happens without the bundle.'],
    ['STP is disabled on EtherChannels', false, 'STP still runs on the port-channel.'],
    ['Each member is a root port', false, 'The port-channel gets one role.'],
  ], 'Without EtherChannel, STP would block all but one of the parallel links. Bundled, they appear as Po1 with one cost and role, so all members forward and add bandwidth and redundancy.'),
  Q('b2-ec-08', 'NA', 't2-etherchannel', 'Which commands create a Layer 3 EtherChannel with an IP address? (Choose two.)', [
    ['no switchport on the member ports and the port-channel', true, 'Makes them routed ports.'],
    ['ip address on interface port-channel 1', true, 'The address goes on the logical interface.'],
    ['switchport mode trunk on the port-channel', false, 'That is Layer 2.'],
    ['An IP address on each member port', false, 'Members carry no addresses.'],
  ], 'For a routed bundle, make the members routed with no switchport before (or while) adding channel-group, then put the address on interface port-channel N, which must also be no switchport. show etherchannel summary shows the channel as (RU).', { console: true }),
  Q('b2-ec-09', 'NA', 't2-etherchannel', 'What is the maximum number of active links in one EtherChannel on Catalyst switches?', [
    ['8', true, 'LACP can hold 8 more in standby.'],
    ['2', false, 'Too few.'],
    ['4', false, 'Too few.'],
    ['16 active', false, '16 members, but only 8 active.'],
  ], 'Up to 8 ports actively forward in a bundle. LACP can configure up to 16 members with 8 active and 8 standby that take over if an active one fails.'),
  Q('b2-ec-10', 'NA', 't2-etherchannel', 'One side of a planned EtherChannel uses mode on and the other uses mode active. What happens?', [
    ['The channel does not form properly, because on sends no LACP and active expects LACP', true, 'on only pairs with on.'],
    ['It forms an LACP channel', false, 'on does not speak LACP.'],
    ['It forms a PAgP channel', false, 'Neither side uses PAgP.'],
    ['It forms and load-balances per packet', false, 'No.'],
  ], 'mode on bundles unconditionally without negotiation, so it must be on at both ends. Mixing on with LACP or PAgP leaves ports stand-alone or, worse, creates a loop where one side bundles and the other does not.'),
  Q('b2-ec-11', 'NA', 't2-etherchannel', 'Which PAgP mode actively asks the other side to form a channel?', [
    ['desirable', true, 'PAgP initiator.'],
    ['auto', false, 'PAgP responder.'],
    ['active', false, 'LACP.'],
    ['passive', false, 'LACP.'],
  ], 'PAgP (Cisco only) uses desirable and auto, LACP (IEEE 802.3ad, now 802.1AX) uses active and passive. The exam topic emphasises LACP; know PAgP mode names so you can rule them out.'),
  Q('b2-ec-12', 'NA', 't2-etherchannel', 'Which command shows the LACP partner\'s details for each member port?', [
    ['show lacp neighbor', true, 'Lists the partner system and port details.'],
    ['show cdp neighbors', false, 'CDP, not LACP.'],
    ['show interfaces trunk', false, 'Trunk status.'],
    ['show spanning-tree', false, 'STP state.'],
  ], 'show lacp neighbor shows the partner\'s system ID, port number and flags for each member. If a member lists no partner, the far side is not running LACP on that port.', { console: true }),
  Q('b2-ec-13', 'NA', 't2-etherchannel', 'Why is this port-channel down?', [
    ['Both sides are in LACP passive mode, so neither starts negotiation', true, 'passive plus passive never forms.'],
    ['The ports are in different VLANs', false, 'No VLAN information is shown.'],
    ['LACP is not supported on Gigabit ports', false, 'It is.'],
    ['Too many member ports', false, 'Two is well under the limit.'],
  ], 'Each member shows (I) and the port-channel (SD): down. With passive at both ends nobody sends the first LACP packet. Change one side to active.', {
    exhibit: X(`
SW1#show run | include channel-group
 channel-group 1 mode passive
 channel-group 1 mode passive
SW2#show run | include channel-group
 channel-group 1 mode passive
 channel-group 1 mode passive
SW1#show etherchannel summary | begin Group
Group  Port-channel  Protocol    Ports
------+-------------+-----------+-----------------------------------------------
1      Po1(SD)         LACP      Gi0/1(I)    Gi0/2(I)`,
      [/SW\d#/, 'prompt'], [/mode passive/, 'fail', 'Passive on both ends'], ['(SD)', 'fail', 'Layer 2, down'], [/\(I\)/, 'fail', 'Stand-alone'], [/Gi0\/[12]/, 'iface'], ['Po1', 'iface', 'Port-channel']),
  }),
  Q('b2-ec-14', 'NA', 't2-etherchannel', 'Which load-balancing method spreads traffic from many clients to one server most evenly?', [
    ['src-ip or src-dst-ip, because client source addresses vary', true, 'Varied inputs give varied hashes.'],
    ['dst-ip', false, 'Every packet has the same destination, so one link carries everything.'],
    ['dst-mac', false, 'The same problem with the server or gateway MAC.'],
    ['Round robin', false, 'Not offered.'],
  ], 'Pick hash inputs that vary in your traffic. Many clients to one server: hash on source or both. One client pulling from many servers: hash on destination or both. src-dst-ip is a good general default.'),
  Q('b2-ec-15', 'NA', 't2-etherchannel', 'On which interface should you configure trunking for an EtherChannel trunk?', [
    ['On the port-channel interface; members inherit it', true, 'Configure the logical interface.'],
    ['Only on the first member port', false, 'Members would mismatch.'],
    ['On the VLAN interface', false, 'SVIs are Layer 3.'],
    ['On the console line', false, 'Unrelated.'],
  ], 'After channel-group creates Port-channel1, configure switchport mode trunk and the allowed and native VLANs under interface port-channel 1. IOS pushes those settings to the members so they stay consistent.', { console: true }),
  Q('b2-ec-16', 'NA', 't2-etherchannel', 'Which two benefits does EtherChannel provide? (Choose two.)', [
    ['More bandwidth between two switches', true, 'Up to 8 links combined.'],
    ['Redundancy: the bundle stays up if a member fails', true, 'Traffic rehashes to the remaining links.'],
    ['Encryption of inter-switch traffic', false, 'Not a feature of EtherChannel.'],
    ['Routing between VLANs', false, 'That needs Layer 3.'],
  ], 'A member failure only removes that link\'s capacity; flows rehash onto the others in well under a second, without waiting for STP to reconverge, because the logical link never went down.'),
];
