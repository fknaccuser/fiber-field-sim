// Console practice, part A: reading output, picking the command, finding
// the fault and knowing what comes next, across IOS, switching and routing.
// Each question is pinned to the branch whose skill it exercises.

import { Q, X } from './qb.js';

export const X_CONSOLE_A = [
  // ---------- what comes next: modes and prompts ----------
  Q('xc-next-01', 'IPC', 't3-ospf', 'You typed router ospf 1. Which prompt appears, and which command typically comes next?', [
    ['R1(config-router)#, then network or router-id', true, 'Router configuration mode.'],
    ['R1(config-if)#, then ip address', false, 'That is interface mode.'],
    ['R1(config-ospf)#, then area 0', false, 'IOS uses config-router.'],
    ['R1#, then show ip ospf', false, 'You are in configuration mode.'],
  ], 'Routing protocols have their own submode, config-router. From there you set router-id, network statements, passive-interface and default-information originate. Interface-level OSPF settings (cost, priority, ip ospf 1 area 0) go under the interface instead.', {
    exhibit: X(`
R1(config)#router ospf 1
R1(config-router)#`,
      ['R1(config)#', 'prompt'], ['router ospf 1', 'cmd'], ['R1(config-router)#', 'prompt', 'Prompt: routing protocol mode']),
  }),
  Q('xc-next-02', 'NA', 't2-vlans', 'After typing vlan 20, which command names the VLAN?', [
    ['name ENGINEERING', true, 'Valid in config-vlan.'],
    ['description ENGINEERING', false, 'Interfaces take descriptions; VLANs take names.'],
    ['vlan name ENGINEERING', false, 'Not valid here.'],
    ['hostname ENGINEERING', false, 'Global, and names the device.'],
  ], 'vlan 20 enters VLAN configuration mode (config-vlan). name sets the label shown in show vlan brief. exit or end leaves; the VLAN is created when you leave the submode.', {
    exhibit: X(`
SW1(config)#vlan 20
SW1(config-vlan)#`,
      ['SW1(config)#', 'prompt'], ['vlan 20', 'cmd'], ['SW1(config-vlan)#', 'prompt', 'Prompt: VLAN mode']),
  }),
  Q('xc-next-03', 'NA', 't2-vlans', 'What does this prompt tell you, and what will the next command affect?', [
    ['Interface range mode: the next command applies to Gi0/1 through Gi0/4 at once', true, 'config-if-range.'],
    ['Only Gi0/1 is selected', false, 'The range selects four ports.'],
    ['The ports were created', false, 'They already exist.'],
    ['VLAN configuration mode', false, 'That is config-vlan.'],
  ], 'interface range applies one set of commands to many ports, for example switchport mode access and switchport access vlan 10 on a whole bank. Ranges can include lists: g0/1 - 4 , g0/10.', {
    exhibit: X(`
SW1(config)#interface range g0/1 - 4
SW1(config-if-range)#`,
      ['SW1(config)#', 'prompt'], ['interface range g0/1 - 4', 'cmd'], ['SW1(config-if-range)#', 'prompt', 'Prompt: interface range mode']),
  }),
  Q('xc-next-04', 'IPS', 't4-dhcp-dns', 'You are at R1(dhcp-config)#. Which command defines the subnet the pool hands out?', [
    ['network 10.1.10.0 255.255.255.0', true, 'Pool network and mask.'],
    ['ip address 10.1.10.0 255.255.255.0', false, 'Interface command.'],
    ['subnet 10.1.10.0/24', false, 'Not IOS syntax.'],
    ['ip dhcp excluded-address 10.1.10.0', false, 'Global, and excludes addresses.'],
  ], 'Inside ip dhcp pool, use network, default-router, dns-server, domain-name and lease. Exclusions are global (ip dhcp excluded-address), outside the pool.', {
    exhibit: X(`
R1(config)#ip dhcp pool LAN
R1(dhcp-config)#`,
      ['R1(config)#', 'prompt'], ['ip dhcp pool LAN', 'cmd'], ['R1(dhcp-config)#', 'prompt', 'Prompt: DHCP pool mode']),
  }),
  Q('xc-next-05', 'SECF', 't5-acl', 'After ip access-list extended WEB-IN, which line belongs at this prompt?', [
    ['permit tcp any host 10.1.50.20 eq 443', true, 'An ACE in named extended ACL mode.'],
    ['access-list 100 permit tcp any any', false, 'Numbered syntax belongs in global mode.'],
    ['ip access-group WEB-IN in', false, 'Applied under the interface.'],
    ['network 10.1.50.0 0.0.0.255', false, 'A routing command.'],
  ], 'Named ACL modes are config-std-nacl and config-ext-nacl. Entries can be prefixed with sequence numbers to insert them. Apply the ACL afterwards under the interface with ip access-group.', {
    exhibit: X(`
R1(config)#ip access-list extended WEB-IN
R1(config-ext-nacl)#`,
      ['R1(config)#', 'prompt'], ['ip access-list extended WEB-IN', 'cmd'], ['R1(config-ext-nacl)#', 'prompt', 'Prompt: named extended ACL mode']),
  }),
  Q('xc-next-06', 'IPS', 't0-remote', 'You have generated RSA keys and created a local user. At this prompt, what finishes SSH-only access?', [
    ['login local, then transport input ssh', true, 'Check local users, allow only SSH.'],
    ['ip ssh version 2 only', false, 'Global, and the lines still need settings.'],
    ['password cisco and login', false, 'A shared line password.'],
    ['transport output ssh', false, 'Controls outbound sessions from the line.'],
  ], 'The VTY lines decide how remote sessions authenticate and which protocols they accept. With login local and transport input ssh, only SSH sessions with a valid local username get in.', {
    exhibit: X(`
R1(config)#line vty 0 15
R1(config-line)#`,
      ['R1(config)#', 'prompt'], ['line vty 0 15', 'cmd'], ['R1(config-line)#', 'prompt', 'Prompt: line mode']),
  }),
  Q('xc-next-07', 'IPC', 't3-ospf', 'You want OSPF hellos only on Gi0/0 and every other interface passive. Which two commands, in router ospf mode? (Choose two.)', [
    ['passive-interface default', true, 'Makes every interface passive.'],
    ['no passive-interface GigabitEthernet0/0', true, 'Re-enables hellos on the uplink.'],
    ['passive-interface GigabitEthernet0/0', false, 'That silences the uplink.'],
    ['network 0.0.0.0 0.0.0.0 area 0 passive', false, 'Not valid.'],
  ], 'On routers with many LAN interfaces, passive-interface default plus no passive-interface on the few transit links is safer: new interfaces start silent.', { console: true }),
  Q('xc-next-08', 'NA', 't2-etherchannel', 'After channel-group 1 mode active on the member ports, where do you configure the trunk?', [
    ['interface port-channel 1, then switchport mode trunk', true, 'Configure the logical interface.'],
    ['On each member port separately, differently', false, 'Members must match.'],
    ['vlan 1', false, 'VLAN mode.'],
    ['router ospf 1', false, 'Routing.'],
  ], 'Configuring the port-channel keeps members consistent: IOS copies the settings to them. A member that differs from the bundle is suspended.', {
    exhibit: X(`
SW1(config-if-range)#channel-group 1 mode active
Creating a port-channel interface Port-channel 1
SW1(config-if-range)#exit
SW1(config)#`,
      ['channel-group 1 mode active', 'cmd'], ['Creating a port-channel interface Port-channel 1', 'ok', 'Bundle created'], [/SW1\(config(-if-range)?\)#/, 'prompt']),
  }),
  Q('xc-next-09', 'NF', 't0-base', 'R1 is in global configuration. Which command sequence gives Gi0/1 the address 192.168.1.1/24 and turns it on?', [
    ['interface g0/1 / ip address 192.168.1.1 255.255.255.0 / no shutdown', true, 'Mode, address, enable.'],
    ['ip address 192.168.1.1 255.255.255.0 g0/1 / no shutdown', false, 'Addresses are set inside interface mode.'],
    ['interface g0/1 / ip address 192.168.1.1/24 / up', false, 'IOS IPv4 takes a dotted mask, and up is not a command.'],
    ['interface g0/1 / no shutdown / ip address 192.168.1.1', false, 'Mask missing.'],
  ], 'The pattern repeats everywhere: enter the object\'s mode, configure it, then enable it. Verify with do show ip interface brief.', { console: true }),
  Q('xc-next-10', 'IPC', 't3-fhrp', 'R1 is in interface configuration on Gi0/1 (10.1.1.2/24). Which commands make it the preferred HSRP router for gateway 10.1.1.254? (Choose two.)', [
    ['standby 1 ip 10.1.1.254 and standby 1 priority 110', true, 'Group, VIP and a higher priority.'],
    ['standby 1 preempt', true, 'Lets it reclaim the role.'],
    ['ip address 10.1.1.254 255.255.255.0', false, 'That would claim the VIP as the interface\'s own address.'],
    ['ip helper-address 10.1.1.254', false, 'DHCP relay.'],
  ], 'Both routers get standby 1 ip with the same VIP. The preferred one gets a higher priority and preempt so it returns to active after recovering.', { console: true }),

  // ---------- read the output ----------
  Q('xc-read-01', 'NF', 't0-inspect', 'Why is Gi0/3 down?', [
    ['It was err-disabled by a feature such as port security or BPDU Guard', true, 'The parenthesis names the state.'],
    ['Someone typed shutdown', false, 'That shows administratively down.'],
    ['The cable is unplugged', false, 'That shows down/down without err-disabled.'],
    ['The VLAN is missing', false, 'Not shown this way.'],
  ], 'err-disabled is the switch protecting itself. show interfaces status err-disabled names the reason. Fix the cause, then shutdown and no shutdown (or wait for errdisable recovery).', {
    exhibit: X(`
SW1#show interfaces gi0/3
GigabitEthernet0/3 is down, line protocol is down (err-disabled)`,
      ['show interfaces gi0/3', 'cmd'], ['GigabitEthernet0/3', 'iface'], ['(err-disabled)', 'fail', 'Shut by a protection feature']),
  }),
  Q('xc-read-02', 'NF', 't0-inspect', 'What does the asterisk in this clock output mean?', [
    ['The time is not authoritative: the router is not synchronized to NTP', true, 'Asterisk means not trusted.'],
    ['The router is the NTP master', false, 'No.'],
    ['Daylight saving time is active', false, 'No.'],
    ['The time is correct', false, 'It is not trusted, and 1993 is the factory default year.'],
  ], 'IOS prefixes the time with * when it is not authoritative and . when it was synchronized but has lost sync. A 1993 or 2002 date is the boot default; configure NTP.', {
    exhibit: X(`
R1#show clock
*00:41:07.512 UTC Mon Mar 1 1993`,
      ['show clock', 'cmd'], [/^\*/m, 'fail', 'Not synchronized'], ['Mon Mar 1 1993', 'fail', 'Factory default date']),
  }),
  Q('xc-read-03', 'NF', 't0-inspect', 'Which port connects to the printer according to this output?', [
    ['Gi0/3', true, 'The description says Printer-2F.'],
    ['Gi0/1', false, 'Labelled Uplink.'],
    ['Gi0/2', false, 'Labelled AP.'],
    ['Gi0/4', false, 'No description.'],
  ], 'show interfaces description lists each interface\'s status, protocol and description on one line, which is why good descriptions pay off when tracing a problem.', {
    exhibit: X(`
SW1#show interfaces description
Interface                      Status         Protocol Description
Gi0/1                          up             up       Uplink-DIST1-Gi1/0/5
Gi0/2                          up             up       AP-Lobby
Gi0/3                          up             up       Printer-2F
Gi0/4                          down           down`,
      ['show interfaces description', 'cmd'], [/^Gi0\/\d/m, 'iface'], ['Printer-2F', 'key', 'Description'], [/(?<=up {13})up/, 'ok', 'Up'], [/down {11}down/, 'fail', 'Down']),
  }),
  Q('xc-read-04', 'IPC', 't3-table', 'How will R1 forward traffic to 10.9.0.0/16?', [
    ['Across both next hops, load-balancing, because the two OSPF paths have equal cost', true, 'Two via lines, same metric.'],
    ['Only via 10.0.12.2', false, 'Both are installed.'],
    ['Only via 10.0.13.3', false, 'Both are installed.'],
    ['It drops it', false, 'A route exists.'],
  ], 'One prefix with two "via" lines and the same [110/x] means equal-cost multipath. CEF spreads flows across both next hops.', {
    exhibit: X(`
R1#show ip route 10.9.0.0
Routing entry for 10.9.0.0/16
  Known via "ospf 1", distance 110, metric 3, type intra area
  Routing Descriptor Blocks:
  * 10.0.12.2, from 2.2.2.2, 00:22:10 ago, via GigabitEthernet0/0
      Route metric is 3, traffic share count is 1
    10.0.13.3, from 3.3.3.3, 00:22:10 ago, via GigabitEthernet0/1
      Route metric is 3, traffic share count is 1`,
      ['show ip route 10.9.0.0', 'cmd'], ['10.9.0.0/16', 'ip', 'Destination prefix'], ['"ospf 1"', 'code', 'Source: OSPF'], ['distance 110', 'metric', 'AD'], [/metric( is)? 3/, 'metric', 'Metric'], [/10\.0\.1[23]\.[23](?=,)/, 'hop'], [/GigabitEthernet0\/[01]/, 'iface']),
  }),
  Q('xc-read-05', 'IPC', 't3-static', 'The primary WAN link has failed. What does this routing table show?', [
    ['The floating static default via 10.0.13.3 with AD 5 is now in use', true, '[5/0] marks the backup.'],
    ['The primary route is still active', false, 'It is gone.'],
    ['There is no default route', false, 'S* is present.'],
    ['OSPF is providing the default', false, 'Code is S.'],
  ], 'The [5/0] tells you this is the floating route: AD 5, not the default 1. When the primary link returns, the AD 1 route reinstalls and this one drops back out of the table.', {
    exhibit: X(`
R1#show ip route static
Gateway of last resort is 10.0.13.3 to network 0.0.0.0
S*    0.0.0.0/0 [5/0] via 10.0.13.3`,
      ['show ip route static', 'cmd'], ['Gateway of last resort is 10.0.13.3', 'gw', 'Gateway of last resort'], ['S*', 'code'], ['[5/0]', 'metric', 'AD 5: the backup'], [/via 10\.0\.13\.3/, 'hop']),
  }),
  Q('xc-read-06', 'IPC', 't3-forwarding', 'What does the M in this ping output tell you?', [
    ['The packet was too large to forward without fragmentation, and DF was set', true, 'Could not fragment.'],
    ['Success', false, 'That is !.'],
    ['Multicast reply', false, 'No.'],
    ['Timeout', false, 'That is a dot.'],
  ], 'M means "could not fragment": a router on the path has a smaller MTU and the packet had DF set. It is how you find MTU problems, often across tunnels. Lower the size until it succeeds to find the path MTU.', {
    exhibit: X(`
R1#ping 10.20.1.1 size 1500 df-bit
Sending 5, 1500-byte ICMP Echos to 10.20.1.1, timeout is 2 seconds:
Packet sent with the DF bit set
M.M.M
Success rate is 0 percent (0/5)`,
      ['ping 10.20.1.1 size 1500 df-bit', 'cmd'], ['10.20.1.1', 'ip'], ['M.M.M', 'fail', 'Could not fragment'], ['Packet sent with the DF bit set', 'key', 'DF set']),
  }),
  Q('xc-read-07', 'IPC', 't3-ospf', 'What does this debug output identify as the reason R1 and R2 are not neighbors?', [
    ['Mismatched hello parameters: R2 uses a 20-second dead interval, R1 uses 40', true, 'Dead R 20 C 40.'],
    ['Mismatched areas', false, 'The message is about hello parameters.'],
    ['Duplicate router IDs', false, 'Different message.'],
    ['MTU mismatch', false, 'Different symptom.'],
  ], 'In the debug, R means the value received from the neighbor and C the value configured locally. Matching ip ospf hello-interval and dead-interval on both sides fixes it.', {
    exhibit: X(`
R1#debug ip ospf hello
OSPF-1 HELLO Gi0/0: Rcv hello from 2.2.2.2 area 0 10.0.12.2
OSPF-1 HELLO Gi0/0: Mismatched hello parameters from 10.0.12.2
OSPF-1 HELLO Gi0/0: Dead R 20 C 40, Hello R 5 C 10`,
      ['debug ip ospf hello', 'cmd'], ['2.2.2.2', 'key', 'Neighbor router ID'], [/10\.0\.12\.2/, 'ip'], ['Mismatched hello parameters', 'fail', 'The problem'], [/Dead R 20 C 40, Hello R 5 C 10/, 'fail', 'Received versus configured']),
  }),
  Q('xc-read-08', 'IPC', 't3-ospf', 'Neighbor 2.2.2.2 has stayed in this state for ten minutes. What is the likely cause?', [
    ['An MTU mismatch on the link', true, 'Stuck in EXSTART.'],
    ['Wrong area', false, 'No neighbor would appear.'],
    ['Passive interface', false, 'No neighbor would appear.'],
    ['This is normal for a DROTHER', false, 'DROTHERs stay 2WAY, not EXSTART.'],
  ], 'EXSTART and EXCHANGE involve large database description packets. If one side\'s MTU is smaller, those packets are dropped and the neighbors never progress. Compare MTUs with show interfaces on both ends.', {
    exhibit: X(`
R1#show ip ospf neighbor
Neighbor ID     Pri   State           Dead Time   Address         Interface
2.2.2.2           1   EXSTART/DR      00:00:33    10.0.12.2       GigabitEthernet0/0`,
      ['show ip ospf neighbor', 'cmd'], ['2.2.2.2', 'key', 'Neighbor router ID'], ['EXSTART/DR', 'fail', 'Stuck in EXSTART'], ['10.0.12.2', 'ip'], ['GigabitEthernet0/0', 'iface']),
  }),
  Q('xc-read-09', 'IPC', 't3-fhrp', 'What does this HSRP output reveal?', [
    ['No standby router is heard, so there is no backup if R1 fails', true, 'Standby is unknown.'],
    ['R1 is standby', false, 'It is active.'],
    ['Preemption is enabled', false, 'No P flag.'],
    ['The virtual IP is wrong', false, 'Nothing indicates that.'],
  ], 'Standby "unknown" means the partner router is not sending hellos on this segment: it may be down, in another VLAN, or configured with a different group number. The gateway works but has no redundancy.', {
    exhibit: X(`
R1#show standby brief
Interface   Grp  Pri P State   Active          Standby         Virtual IP
Gi0/1       1    100   Active  local           unknown         10.1.1.254`,
      ['show standby brief', 'cmd'], ['Gi0/1', 'iface'], ['local', 'role', 'This router is active'], ['unknown', 'fail', 'No standby heard'], ['10.1.1.254', 'gw', 'Virtual IP']),
  }),
  Q('xc-read-10', 'NA', 't2-stp', 'Which switch is root for VLAN 1 according to this summary from SW1?', [
    ['SW1 itself', true, 'Root bridge for: VLAN0001.'],
    ['None', false, 'SW1 is root.'],
    ['The switch on Gi0/1', false, 'SW1 is root, so it has no root port.'],
    ['Cannot tell', false, 'The summary says so.'],
  ], 'show spanning-tree summary starts with "Switch is in rapid-pvst mode" and "Root bridge for:" listing the VLANs this switch is root for, plus which protection features are enabled globally.', {
    exhibit: X(`
SW1#show spanning-tree summary
Switch is in rapid-pvst mode
Root bridge for: VLAN0001, VLAN0010
EtherChannel misconfig guard            is enabled
Portfast Default                        is enabled
PortFast BPDU Guard Default             is enabled`,
      ['show spanning-tree summary', 'cmd'], ['rapid-pvst', 'key', 'STP mode'], [/VLAN0001, VLAN0010/, 'vlan', 'Root for these VLANs'], [/is enabled/, 'ok', 'Enabled']),
  }),
  Q('xc-read-11', 'NA', 't2-etherchannel', 'Why is Gi0/2 not carrying traffic in this bundle?', [
    ['It is suspended because its configuration does not match the other member', true, 'The s flag.'],
    ['It is the standby link by design', false, 'Suspended is an error state.'],
    ['It is a Layer 3 port', false, 'The bundle is Layer 2.'],
    ['It is working normally', false, '(s) is not normal.'],
  ], 'A suspended member usually differs in speed, duplex, access VLAN, trunk allowed list or native VLAN. Compare show running-config interface for Gi0/1 and Gi0/2 and make them match.', {
    exhibit: X(`
Group  Port-channel  Protocol    Ports
------+-------------+-----------+-----------------------------------------------
1      Po1(SU)         LACP      Gi0/1(P)    Gi0/2(s)`,
      ['Po1', 'iface', 'Port-channel'], ['(SU)', 'ok', 'Layer 2, in use'], ['Gi0/1(P)', 'ok', 'Bundled'], ['Gi0/2(s)', 'fail', 'Suspended']),
  }),
  Q('xc-read-12', 'NA', 't2-discovery', 'What useful mismatch does this CDP detail reveal?', [
    ['The neighbor uses native VLAN 99 and half duplex', true, 'Compare with the local side.'],
    ['The neighbor is a phone', false, 'Platform shows a switch.'],
    ['The neighbor has no IP address', false, 'One is listed.'],
    ['Nothing useful', false, 'Native VLAN and duplex are listed.'],
  ], 'CDP detail includes the neighbor\'s native VLAN and duplex, which is how CDP detects and logs native VLAN and duplex mismatches. If this switch uses native VLAN 1 and full duplex, both need fixing.', {
    exhibit: X(`
SW1#show cdp neighbors gi0/24 detail
Device ID: SW2
Entry address(es):
  IP address: 10.99.0.12
Platform: cisco WS-C2960X-48TS-L,  Capabilities: Switch IGMP
Interface: GigabitEthernet0/24,  Port ID (outgoing port): GigabitEthernet0/24
Native VLAN: 99
Duplex: half`,
      ['show cdp neighbors gi0/24 detail', 'cmd'], ['SW2', 'role', 'Neighbor'], ['10.99.0.12', 'ip', 'Neighbor management address'], [/GigabitEthernet0\/24/, 'iface'], ['Native VLAN: 99', 'vlan', 'Neighbor native VLAN'], ['Duplex: half', 'fail', 'Neighbor duplex']),
  }),
  Q('xc-read-13', 'NA', 't2-vlans', 'Which VLANs does this port use for data and for the phone?', [
    ['Data VLAN 10, voice VLAN 50', true, 'Access Mode VLAN and Voice VLAN lines.'],
    ['Data VLAN 50, voice VLAN 10', false, 'Reversed.'],
    ['It is a trunk carrying both', false, 'Operational mode is static access.'],
    ['Only VLAN 1', false, 'VLAN 10 is assigned.'],
  ], 'show interfaces switchport shows the administrative and operational mode, the access VLAN and the voice VLAN. The phone tags its traffic with the voice VLAN, and the PC behind it uses the access VLAN untagged.', {
    exhibit: X(`
SW1#show interfaces gi0/7 switchport
Administrative Mode: static access
Operational Mode: static access
Access Mode VLAN: 10 (STAFF)
Voice VLAN: 50 (VOICE)`,
      ['show interfaces gi0/7 switchport', 'cmd'], [/static access/, 'state', 'Access port'], ['10 (STAFF)', 'vlan', 'Data VLAN'], ['50 (VOICE)', 'vlan', 'Voice VLAN']),
  }),
  Q('xc-read-14', 'NA', 't2-trunks', 'What does this output tell you about the link on Gi0/24?', [
    ['It is not trunking: the port is in dynamic auto and the far side did not ask', true, 'not-trunking with mode auto.'],
    ['It is a working trunk', false, 'Status not-trunking.'],
    ['The native VLAN is mismatched', false, 'Not shown here.'],
    ['It is err-disabled', false, 'It shows not-trunking.'],
  ], 'Mode auto with status not-trunking is the classic auto plus auto result. Set switchport mode trunk on at least one side, preferably both, and disable negotiation.', {
    exhibit: X(`
SW1#show interfaces gi0/24 trunk
Port        Mode         Encapsulation  Status        Native vlan
Gi0/24      auto         802.1q         not-trunking  1`,
      ['show interfaces gi0/24 trunk', 'cmd'], ['Gi0/24', 'iface'], [/(?<=Gi0\/24 +)auto/, 'key', 'DTP mode'], ['not-trunking', 'fail', 'Not a trunk']),
  }),
  Q('xc-read-15', 'NF', 't1-ipv6', 'Which addresses does this Linux host have on eth0?', [
    ['A global 2001:db8:acad:10::25/64 and a link-local fe80 address', true, 'scope global and scope link.'],
    ['Only a link-local address', false, 'A global address is listed.'],
    ['Only IPv4', false, 'Both inet6 lines are IPv6.'],
    ['A multicast address', false, 'Not listed.'],
  ], 'ip -6 addr shows each IPv6 address with its prefix and scope. scope global is routable; scope link is the fe80 link-local address used for neighbor discovery.', {
    exhibit: X(`
$ ip -6 addr show eth0
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500
    inet6 2001:db8:acad:10::25/64 scope global dynamic
    inet6 fe80::250:56ff:fea1:b01/64 scope link`,
      ['ip -6 addr show eth0', 'cmd'], [/eth0(?=:)/, 'iface'], ['2001:db8:acad:10::25', 'ip', 'Global unicast'], ['fe80::250:56ff:fea1:b01', 'ip', 'Link-local'], [/\/64/, 'mask'], ['scope global', 'state'], ['scope link', 'state']),
  }),
  Q('xc-read-16', 'NF', 't1-client', 'Where does this Windows traceroute stop making progress?', [
    ['After the default gateway, 192.168.1.1: the next hop never answers', true, 'Hop 1 replies, then timeouts.'],
    ['At the PC itself', false, 'Hop 1 answered.'],
    ['At the destination', false, 'It never arrives.'],
    ['Nowhere', false, 'Timeouts follow hop 1.'],
  ], 'tracert is the Windows name; it sends ICMP echo with rising TTL. The gateway answers, so the LAN is fine. Look at the router\'s next hop, its routes, or the provider link beyond it.', {
    exhibit: X(`
C:\\>tracert 8.8.8.8
Tracing route to dns.google [8.8.8.8] over a maximum of 30 hops:
  1     1 ms    <1 ms    <1 ms  192.168.1.1
  2     *        *        *     Request timed out.
  3     *        *        *     Request timed out.`,
      ['tracert 8.8.8.8', 'cmd'], [/\[8\.8\.8\.8\]/, 'ip', 'Destination'], ['192.168.1.1', 'gw', 'Default gateway (hop 1)'], [/Request timed out\./, 'fail', 'No reply']),
  }),
  Q('xc-read-17', 'NA', 't2-wlc', 'Clients on the CORP WLAN receive addresses from the management subnet. Based on this output, why?', [
    ['CORP is mapped to the management interface instead of its client interface', true, 'Interface Name column.'],
    ['CORP is disabled', false, 'It is enabled.'],
    ['The SSID is hidden', false, 'Unrelated to addressing.'],
    ['The WLAN ID is wrong', false, 'IDs are labels.'],
  ], 'The WLAN-to-interface mapping decides which VLAN, and so which DHCP scope, clients land in. Edit the WLAN\'s General tab and choose the corp client interface.', {
    exhibit: X(`
(WLC) >show wlan summary
WLAN ID  WLAN Profile Name / SSID     Status    Interface Name
-------  ---------------------------  --------  --------------------
1        CORP / CORP                  Enabled   management
2        GUEST / GUEST                Enabled   guest-vlan30`,
      ['show wlan summary', 'cmd'], [/CORP \/ CORP|GUEST \/ GUEST/, 'key', 'Profile / SSID'], [/Enabled/, 'ok', 'Enabled'], ['management', 'fail', 'Wrong interface'], ['guest-vlan30', 'iface', 'Client interface']),
  }),
  Q('xc-read-18', 'NF', 't0-save', 'Is there enough room in flash for a new 120 MB image?', [
    ['No: only about 80 MB is free', true, 'bytes free is the number to read.'],
    ['Yes: the total is 256 MB', false, 'Free space matters, not total.'],
    ['Yes: the current image is only 160 MB', false, 'It still occupies space.'],
    ['Cannot tell', false, 'bytes free is shown.'],
  ], 'The last line of show flash: (or dir flash:) gives bytes total and bytes free. Delete old images or unused files first, then copy and verify the new image.', {
    exhibit: X(`
R1#show flash:
-#- --length-- -----date/time------ path
1    167838976 Mar 14 2026 09:12:40 c2900-universalk9-mz.SPA.157-3.M5.bin
2         2903 Oct 01 2026 18:05:11 backup-config.txt

256462848 bytes total (88618969 bytes free)`,
      ['show flash:', 'cmd'], ['c2900-universalk9-mz.SPA.157-3.M5.bin', 'state', 'Current image'], ['256462848 bytes total', 'count', 'Total'], ['88618969 bytes free', 'fail', 'Free space']),
  }),
  Q('xc-read-19', 'NF', 't0-save', 'What does this error tell you about the image copy?', [
    ['The router could not reach the TFTP server or the server did not answer', true, 'Timed out.'],
    ['The file does not exist on the server', false, 'That would be "No such file".'],
    ['Flash is full', false, 'Different error.'],
    ['The copy succeeded', false, 'It failed.'],
  ], 'A timeout means nothing came back: check that the router can ping 10.1.1.5, that the TFTP service is running and that firewalls permit UDP 69. "File not found" or "Permission denied" would point at the server\'s files instead.', {
    exhibit: X(`
R1#copy tftp://10.1.1.5/c2900-new.bin flash:
Destination filename [c2900-new.bin]?
Accessing tftp://10.1.1.5/c2900-new.bin...
%Error opening tftp://10.1.1.5/c2900-new.bin (Timed out)`,
      ['copy tftp://10.1.1.5/c2900-new.bin flash:', 'cmd'], [/10\.1\.1\.5/, 'ip', 'TFTP server'], ['(Timed out)', 'fail', 'No answer']),
  }),
  Q('xc-read-20', 'IPS', 't0-remote', 'Why is SSH not working on this router?', [
    ['No RSA keys exist, so SSH is disabled', true, 'The message says so.'],
    ['The VTY lines block SSH', false, 'SSH is disabled globally.'],
    ['SSH version 2 is enabled', false, 'It is disabled.'],
    ['The password is too short', false, 'Not indicated.'],
  ], 'SSH turns on automatically once RSA keys exist (and turns off if they are deleted). Set a hostname and domain name, then crypto key generate rsa modulus 2048, and add ip ssh version 2.', {
    exhibit: X(`
R1#show ip ssh
SSH Disabled - version 1.99
%Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).`,
      ['show ip ssh', 'cmd'], ['SSH Disabled - version 1.99', 'fail', 'SSH is off'], [/%Please create RSA keys to enable SSH/, 'fail', 'The reason']),
  }),

  // ---------- find the fault ----------
  Q('xc-fault-01', 'NA', 't2-vlans', 'PCs in VLAN 20 on SW1 cannot reach their gateway, the SVI on the Layer 3 switch. What is wrong?', [
    ['VLAN 20 is not allowed on the trunk between SW1 and the Layer 3 switch', true, 'Only 10 and 99 are allowed.'],
    ['The SVI needs a description', false, 'Optional.'],
    ['VLAN 20 needs a different subnet mask', false, 'Not indicated.'],
    ['The PCs need static ARP entries', false, 'No.'],
  ], 'Access VLAN, trunk allowed list, and SVI must line up end to end. Here the VLAN is dropped on the uplink. switchport trunk allowed vlan add 20 on both ends fixes it.', {
    exhibit: X(`
SW1#show interfaces trunk | begin allowed on
Port        Vlans allowed on trunk
Gi0/24      10,99
SW1#show vlan brief | include 20
20   ENGINEERING                      active    Gi0/5, Gi0/6`,
      [/show interfaces trunk \| begin allowed on|show vlan brief \| include 20/, 'cmd'], ['10,99', 'fail', 'VLAN 20 missing'], [/^20(?= )/m, 'vlan'], [/Gi0\/(5|6|24)/, 'iface']),
  }),
  Q('xc-fault-02', 'IPC', 't3-static', 'Hosts behind R1 cannot reach 172.16.0.0/16. What is wrong in R1\'s config?', [
    ['The next hop 10.0.21.2 is not on any connected subnet of R1', true, 'The route cannot resolve.'],
    ['Static routes need AD 110', false, 'Default 1 is fine.'],
    ['The mask should be a wildcard', false, 'Static routes use subnet masks.'],
    ['The route is fine', false, 'It is not installed.'],
  ], 'R1\'s link is 10.0.12.0/30, so R2 is 10.0.12.2. A typo (10.0.21.2) points at an address R1 cannot reach, so the route never installs. show ip route static confirms it is missing.', {
    exhibit: X(`
interface GigabitEthernet0/0
 ip address 10.0.12.1 255.255.255.252
ip route 172.16.0.0 255.255.0.0 10.0.21.2`,
      ['GigabitEthernet0/0', 'iface'], ['10.0.12.1', 'ip'], ['255.255.255.252', 'mask'], ['172.16.0.0 255.255.0.0', 'ip', 'Destination'], ['10.0.21.2', 'fail', 'Unreachable next hop']),
  }),
  Q('xc-fault-03', 'IPC', 't3-ospf', 'R1 and R2 are OSPF neighbors, but R2 never learns R1\'s LAN 192.168.1.0/24. What is wrong?', [
    ['R1\'s network statement uses 192.168.10.0, which does not match the LAN interface', true, 'Typo in the network.'],
    ['The LAN must not be passive', false, 'Passive LANs are still advertised.'],
    ['The area should be 1', false, 'All in area 0 is correct.'],
    ['R2 needs a static route', false, 'OSPF should advertise it.'],
  ], 'The network command enables OSPF on interfaces whose addresses match. 192.168.10.0 0.0.0.255 matches nothing on R1, so the LAN never joins OSPF. show ip ospf interface brief would not list Gi0/1.', {
    exhibit: X(`
interface GigabitEthernet0/1
 ip address 192.168.1.1 255.255.255.0
router ospf 1
 passive-interface GigabitEthernet0/1
 network 10.0.12.0 0.0.0.3 area 0
 network 192.168.10.0 0.0.0.255 area 0`,
      [/GigabitEthernet0\/1/, 'iface'], ['192.168.1.1', 'ip'], ['255.255.255.0', 'mask'], ['network 192.168.10.0 0.0.0.255 area 0', 'fail', 'Matches no interface'], ['network 10.0.12.0 0.0.0.3 area 0', 'ok', 'Matches the link']),
  }),
  Q('xc-fault-04', 'IPS', 't4-nat', 'Users on 10.1.2.0/24 cannot reach the internet, but users on 10.1.1.0/24 can. What is wrong?', [
    ['The NAT ACL only permits 10.1.1.0/24', true, 'The second LAN is never translated.'],
    ['The outside interface is wrong', false, '10.1.1.0 works.'],
    ['Overload is missing', false, 'It is present.'],
    ['The second LAN needs its own public address', false, 'PAT shares one.'],
  ], 'NAT only translates sources permitted by the ACL. Add access-list 1 permit 10.1.2.0 0.0.0.255 (or widen the wildcard) and clear translations.', {
    exhibit: X(`
access-list 1 permit 10.1.1.0 0.0.0.255
ip nat inside source list 1 interface GigabitEthernet0/1 overload
interface GigabitEthernet0/0.10
 ip address 10.1.1.1 255.255.255.0
 ip nat inside
interface GigabitEthernet0/0.20
 ip address 10.1.2.1 255.255.255.0
 ip nat inside`,
      ['access-list 1 permit 10.1.1.0 0.0.0.255', 'fail', 'Only one LAN permitted'], [/GigabitEthernet0\/0\.(10|20)|GigabitEthernet0\/1/, 'iface'], [/10\.1\.[12]\.1/, 'ip'], [/ip nat inside$/m, 'ok', 'Inside interface'], ['overload', 'key', 'PAT']),
  }),
  Q('xc-fault-05', 'SECF', 't5-acl', 'This ACL is applied inbound on the users\' interface. Users report that nothing works at all. Why?', [
    ['It has only deny lines, so the implicit deny blocks everything else', true, 'No permit statement.'],
    ['The wildcard is wrong', false, 'It matches the server host.'],
    ['ACLs cannot be inbound', false, 'They can.'],
    ['The server is down', false, 'All traffic is blocked.'],
  ], 'An ACL that only denies is a deny-all, because of the implicit deny any at the end. Add permit ip any any (or specific permits) after the deny.', {
    exhibit: X(`
ip access-list extended USERS-IN
 10 deny tcp 10.1.2.0 0.0.0.255 host 10.1.9.9 eq 22
interface GigabitEthernet0/0.20
 ip access-group USERS-IN in`,
      ['10 deny tcp 10.1.2.0 0.0.0.255 host 10.1.9.9 eq 22', 'fail', 'Only a deny'], ['ip access-group USERS-IN in', 'key', 'Applied inbound'], ['GigabitEthernet0/0.20', 'iface']),
  }),
  Q('xc-fault-06', 'IPS', 't4-dhcp-dns', 'VLAN 30 clients get no addresses. The server is 10.1.99.10. What is wrong?', [
    ['The helper address points at 10.1.99.1, not the server 10.1.99.10', true, 'A typo in the relay.'],
    ['Helpers belong on the server interface', false, 'They belong on the client gateway.'],
    ['VLAN 30 needs its own DHCP server', false, 'A relay is enough.'],
    ['The subinterface mask is wrong', false, 'It is fine.'],
  ], 'The helper forwards client broadcasts as unicast to the address you give it. Pointing it at the wrong host sends requests nowhere. Correct it to ip helper-address 10.1.99.10.', {
    exhibit: X(`
interface GigabitEthernet0/0.30
 encapsulation dot1Q 30
 ip address 10.1.30.1 255.255.255.0
 ip helper-address 10.1.99.1`,
      ['GigabitEthernet0/0.30', 'iface'], ['encapsulation dot1Q 30', 'vlan', 'VLAN tag'], ['10.1.30.1', 'gw', 'Client gateway'], ['ip helper-address 10.1.99.1', 'fail', 'Wrong server address']),
  }),
  Q('xc-fault-07', 'NA', 't2-stp', 'Users report the network slowing to a crawl after a cleaner plugged a cable between two wall jacks. Which output confirms the cause?', [
    ['Log messages of the same MAC flapping between ports and interfaces at near 100% load', true, 'A Layer 2 loop.'],
    ['show ip route', false, 'Routing is not the issue.'],
    ['show ntp status', false, 'Unrelated.'],
    ['show users', false, 'Unrelated.'],
  ], 'A cable between two access ports creates a loop if STP is disabled or those ports have PortFast without BPDU Guard. Broadcasts multiply and MACs flap. BPDU Guard on edge ports would have err-disabled one of the ports instantly.', {
    exhibit: X(`
%SW_MATM-4-MACFLAP_NOTIF: Host 0050.7966.6800 in vlan 10 is flapping between port Gi0/11 and port Gi0/12
SW1#show interfaces gi0/11 | include rate
  5 minute input rate 981230000 bits/sec, 812044 packets/sec`,
      ['%SW_MATM-4-MACFLAP_NOTIF', 'fail', 'MAC flapping'], ['0050.7966.6800', 'mac'], ['vlan 10', 'vlan'], [/Gi0\/1[12]/, 'iface'], ['981230000 bits/sec', 'fail', 'Link saturated']),
  }),
  Q('xc-fault-08', 'NF', 't1-ipv4', 'Hosts in this office cannot reach anything beyond their subnet. Which line in the router\'s LAN config is the problem?', [
    ['The mask /25 on the router puts hosts .130 to .200 outside its subnet', true, 'Router and hosts disagree on the mask.'],
    ['The description', false, 'Labels do nothing.'],
    ['no shutdown', false, 'It enables the interface.'],
    ['The interface name', false, 'Correct.'],
  ], 'Hosts use 192.168.5.0/24 with gateway .1, but the router uses 255.255.255.128, so it only considers .0 to .127 local. Replies to .130 and above go to the router\'s default route instead of the LAN. Match the mask on both.', {
    exhibit: X(`
interface GigabitEthernet0/1
 description Office LAN 192.168.5.0/24
 ip address 192.168.5.1 255.255.255.128
 no shutdown`,
      ['GigabitEthernet0/1', 'iface'], ['192.168.5.1', 'gw', 'Gateway'], ['255.255.255.128', 'fail', 'Mask does not match the hosts']),
  }),
  Q('xc-fault-09', 'IPC', 't3-fhrp', 'R1 and R2 both show themselves as HSRP active for group 1. Based on the config, why?', [
    ['They use different group numbers (1 and 2), so they are separate groups', true, 'Groups must match.'],
    ['Preempt is configured', false, 'Not the cause.'],
    ['Priorities are equal', false, 'Ties are broken, not doubled.'],
    ['The virtual IP is wrong', false, 'It is the same.'],
  ], 'Routers only cooperate if the group number (and version) match. With group 1 on R1 and group 2 on R2, each is alone and active. The duplicate virtual IP then causes ARP conflicts.', {
    exhibit: X(`
R1: standby 1 ip 10.1.1.254
R2: standby 2 ip 10.1.1.254`,
      [/R[12]:/, 'role', 'Router'], ['standby 1', 'key', 'Group 1'], ['standby 2', 'fail', 'Group 2'], [/10\.1\.1\.254/, 'gw', 'Virtual IP']),
  }),
  Q('xc-fault-10', 'NA', 't2-trunks', 'A new trunk between SW1 and SW2 passes VLAN 10 but VLAN 1 traffic ends up in VLAN 99 on SW2. Why?', [
    ['The native VLANs differ: 1 on SW1 and 99 on SW2', true, 'Untagged frames change VLAN.'],
    ['VLAN 1 is not allowed', false, 'Traffic is crossing.'],
    ['The trunk is in dynamic auto', false, 'It is trunking.'],
    ['STP is blocking VLAN 1', false, 'Traffic crosses.'],
  ], 'SW1 sends VLAN 1 untagged (its native); SW2 places untagged frames in its native VLAN, 99. CDP logs a native VLAN mismatch. Set the same native VLAN on both ends.', {
    exhibit: X(`
SW1#show interfaces trunk | include Gi0/24
Gi0/24      on           802.1q         trunking      1
SW2#show interfaces trunk | include Gi0/24
Gi0/24      on           802.1q         trunking      99`,
      [/SW[12]#/, 'prompt'], [/Gi0\/24(?= {6})/, 'iface'], [/trunking {6}1$/m, 'vlan', 'Native on SW1'], [/trunking {6}99/, 'fail', 'Native on SW2']),
  }),

  // ---------- pick the command ----------
  Q('xc-cmd-01', 'NA', 't2-stp', 'Which command shows which ports are blocking for VLAN 10?', [
    ['show spanning-tree vlan 10', true, 'Lists port roles and states.'],
    ['show vlan 10', false, 'VLAN membership only.'],
    ['show interfaces trunk', false, 'Trunk forwarding summary, less detail.'],
    ['show mac address-table vlan 10', false, 'MACs, not STP.'],
  ], 'show spanning-tree vlan N gives root information, this bridge\'s ID, and every port\'s role (Root, Desg, Altn), state (FWD, BLK) and cost.', { console: true }),
  Q('xc-cmd-02', 'NA', 't2-etherchannel', 'Which command shows every EtherChannel, its protocol and each member\'s state in one table?', [
    ['show etherchannel summary', true, 'Flags per bundle and member.'],
    ['show interfaces port-channel 1', false, 'One interface\'s details.'],
    ['show lacp sys-id', false, 'The LACP system ID.'],
    ['show cdp neighbors', false, 'Neighbors.'],
  ], 'Read the flags: (SU) Layer 2 in use, (RU) Layer 3 in use, (SD) down; members (P) bundled, (I) individual, (s) suspended, (D) down.', { console: true }),
  Q('xc-cmd-03', 'IPC', 't3-ospf', 'Which command shows the OSPF hello and dead timers on an interface?', [
    ['show ip ospf interface GigabitEthernet0/0', true, 'Timer intervals line.'],
    ['show ip ospf neighbor', false, 'Shows the dead timer counting down, not the configured intervals.'],
    ['show ip route ospf', false, 'Routes only.'],
    ['show running-config | include hello', false, 'Shows only non-default settings.'],
  ], 'show ip ospf interface lists area, cost, network type, DR and BDR, timers and neighbor counts for one interface: the first place to look when an adjacency will not form.', { console: true }),
  Q('xc-cmd-04', 'IPS', 't4-dhcp-dns', 'Which command shows how many addresses a DHCP pool has leased and whether it is running out?', [
    ['show ip dhcp pool', true, 'Total and leased address counts.'],
    ['show ip dhcp binding', false, 'Lists each lease.'],
    ['show ip interface brief', false, 'No DHCP data.'],
    ['show dhcp lease', false, 'Client-side on some platforms.'],
  ], 'show ip dhcp pool reports each pool\'s subnet, total addresses and leased addresses. A pool at its limit leaves new clients with APIPA addresses; shorten the lease or widen the subnet.', { console: true }),
  Q('xc-cmd-05', 'SECF', 't5-l2sec', 'Which command shows the secure MAC addresses learned on each port?', [
    ['show port-security address', true, 'Secure MAC table.'],
    ['show mac address-table dynamic', false, 'Dynamic entries, not specifically secure ones.'],
    ['show port-security', false, 'Summary per port.'],
    ['show arp', false, 'IP to MAC.'],
  ], 'show port-security gives a per-port summary (max, current, violations, action); show port-security address lists the actual secure MACs, sticky or not; show port-security interface X gives one port in detail.', { console: true }),
  Q('xc-cmd-06', 'IPS', 't4-ntp-log', 'Which command confirms whether the router has synchronized to an NTP server?', [
    ['show ntp status', true, 'Synchronized or not, stratum, reference.'],
    ['show clock detail', false, 'Shows the time source, less detail on sync.'],
    ['show ntp config', false, 'Not a standard command.'],
    ['show logging', false, 'Logs.'],
  ], 'show ntp status says "Clock is synchronized" or "unsynchronized" with stratum and reference. show ntp associations lists the servers and marks the chosen one with an asterisk.', { console: true }),
  Q('xc-cmd-07', 'NF', 't1-switching', 'Which command shows the MAC address learned on one specific port?', [
    ['show mac address-table interface gi0/5', true, 'Filters by port.'],
    ['show interfaces gi0/5', false, 'Shows the port\'s own MAC, not learned ones.'],
    ['show arp gi0/5', false, 'Not valid this way.'],
    ['show cdp neighbors gi0/5', false, 'Only CDP-speaking neighbors.'],
  ], 'The MAC table can be filtered by interface, VLAN or address. Finding which port a device is on: show mac address-table address 0050.7966.6800.', { console: true }),
  Q('xc-cmd-08', 'IPC', 't3-forwarding', 'Which command lists the router\'s ARP cache?', [
    ['show ip arp (or show arp)', true, 'IP to MAC mappings with age and interface.'],
    ['show mac address-table', false, 'Switch MAC table.'],
    ['show ip route', false, 'Routes.'],
    ['show cdp neighbors', false, 'Neighbors.'],
  ], 'show ip arp shows each entry\'s protocol, address, age in minutes, MAC, type and interface. An age of "-" marks the router\'s own interface addresses. clear ip arp flushes dynamic entries.', { console: true }),
  Q('xc-cmd-09', 'NA', 't2-vlans', 'Which command shows which VLAN each access port belongs to and whether it is connected, in one line per port?', [
    ['show interfaces status', true, 'Port, status, VLAN, duplex, speed.'],
    ['show ip interface brief', false, 'No VLAN column.'],
    ['show vlan id 10', false, 'One VLAN.'],
    ['show interfaces trunk', false, 'Trunks only.'],
  ], 'show interfaces status is the access switch workhorse: connected or notconnect, VLAN or "trunk", negotiated duplex and speed, and the description.', { console: true }),
  Q('xc-cmd-10', 'IPC', 't3-table', 'Which command shows which routing protocols are running, their router IDs, and their passive interfaces?', [
    ['show ip protocols', true, 'One-screen summary.'],
    ['show ip route summary', false, 'Route counts.'],
    ['show running-config | include router', false, 'Only the router lines.'],
    ['show ip ospf neighbor', false, 'Neighbors only.'],
  ], 'show ip protocols summarizes every routing process: IDs, networks, passive interfaces, information sources and administrative distance. It is quicker than reading the whole config.', { console: true }),
];
