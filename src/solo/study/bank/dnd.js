// Drag-and-drop items: match, order, and sort into buckets. The exam uses
// all three shapes; each is graded all or nothing here, which is the safe
// assumption since Cisco does not publish how it scores them.

import { M, O, S } from './qb.js';

export const DND = [
  // ---------- Network Fundamentals ----------
  O('dd-nf-dora', 'NF', 't1-client', 'Put the DHCP exchange in order, from a client that just booted.', [
    'DHCPDISCOVER, broadcast from the client',
    'DHCPOFFER, from the server',
    'DHCPREQUEST, broadcast from the client',
    'DHCPACK, from the server',
  ], 'DORA: Discover, Offer, Request, Acknowledge. The Request is still a broadcast because more than one server may have offered, and the broadcast tells the others their offer was declined. A client that never sees the Offer ends up with a 169.254 address.'),
  O('dd-nf-tcp', 'NF', 't1-transport', 'Put the TCP connection setup in order.', [
    'Client sends SYN',
    'Server answers SYN-ACK',
    'Client sends ACK',
    'Data flows',
  ], 'The three-way handshake agrees on starting sequence numbers in both directions before any data moves. A capture that shows SYN after SYN with no SYN-ACK points at a filter or a closed port on the far side, not at routing.'),
  O('dd-nf-arp', 'NF', 't1-switching', 'PC1 pings PC2 on the same VLAN for the first time. Put what happens in order.', [
    'PC1 checks its ARP cache and finds no entry for PC2',
    'PC1 broadcasts an ARP request for PC2\'s IP address',
    'The switch floods the broadcast out every port in the VLAN',
    'PC2 answers with a unicast ARP reply',
    'PC1 sends the ICMP echo to PC2\'s MAC address',
  ], 'Before any IP packet can leave on Ethernet, the sender needs the destination MAC. The ARP request is a broadcast, so every host in the VLAN sees it; only the owner of the IP replies, and the reply is unicast. The first ping often loses its first echo for this reason.'),
  S('dd-nf-tcpudp', 'NF', 't1-transport', 'Sort each protocol by the transport it uses by default.', ['TCP', 'UDP'], [
    ['HTTP', 0], ['SSH', 0], ['Telnet', 0], ['TFTP', 1], ['SNMP', 1], ['Syslog', 1], ['DHCP', 1], ['SMTP', 0],
  ], 'TCP for anything that needs every byte in order and a session (web, remote shells, mail). UDP for small request-reply or fire-and-forget traffic where the application handles loss itself (TFTP, SNMP, syslog, DHCP). DNS uses both: UDP for most queries, TCP for zone transfers and large answers.'),
  M('dd-nf-ports', 'NF', 't1-transport', 'Match each protocol to its well-known port.', [
    ['SSH', '22'], ['Telnet', '23'], ['DNS', '53'], ['HTTP', '80'], ['HTTPS', '443'], ['SNMP', '161'],
  ], 'These six come up constantly on the exam in ACL questions: a line like "permit tcp any host 10.1.1.5 eq 22" only makes sense once 22 reads as SSH. TFTP is 69, NTP 123, syslog 514, and DHCP uses 67 for the server and 68 for the client.'),
  S('dd-nf-layers', 'NF', 't1-devices', 'Sort each item by the OSI layer it works at.', ['Layer 1', 'Layer 2', 'Layer 3'], [
    ['Hub', 0], ['Fiber patch cable', 0], ['Switch', 1], ['MAC address', 1], ['Frame', 1], ['Router', 2], ['IP address', 2], ['Packet', 2],
  ], 'Layer 1 moves bits and has no idea what they mean, which is why a hub repeats everything out every port. Layer 2 reads MAC addresses in frames, the switch\'s job. Layer 3 reads IP addresses in packets and chooses paths, the router\'s job.'),
  S('dd-nf-ipv4', 'NF', 't1-ipv4', 'Sort each address: private (RFC 1918) or public.', ['Private', 'Public'], [
    ['10.200.1.1', 0], ['172.20.5.9', 0], ['192.168.50.4', 0], ['172.32.0.1', 1], ['8.8.8.8', 1], ['192.169.1.1', 1],
  ], 'The private ranges are 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16. The trap is the middle one: /12 covers 172.16 through 172.31, so 172.32.0.1 is public. 192.169 is outside 192.168/16 for the same reason.'),
  S('dd-nf-ipv6', 'NF', 't1-ipv6', 'Sort each IPv6 address by its type.', ['Global unicast', 'Link-local', 'Unique local', 'Multicast'], [
    ['2001:db8:acad::1', 0], ['2600:1f18::10', 0], ['fe80::1', 1], ['fe80::2d0:97ff:fe12:3456', 1], ['fd00:1:2::5', 2], ['ff02::1', 3], ['ff02::2', 3],
  ], 'Global unicast is 2000::/3, so anything starting with 2 or 3. Link-local is fe80::/10 and never leaves its wire. Unique local is fc00::/7, used as fd00::/8, the IPv6 version of private space. Multicast starts with ff; ff02::1 is all nodes and ff02::2 all routers.'),
  M('dd-nf-cable', 'NF', 't1-physical', 'Match each cable to its typical use.', [
    ['Cat 6 UTP, straight-through', 'A PC to a switch port, up to 100 m'],
    ['Single-mode fiber', 'Building to building, many kilometres'],
    ['Multimode fiber', 'Inside a data center, a few hundred metres'],
    ['Console (rollover) cable', 'A laptop to a router\'s console port'],
  ], 'Copper twisted pair stops at 100 metres. Multimode fiber carries light in several paths, which spreads the signal, so it suits short runs; single-mode carries one path and goes much farther. Modern switches use Auto-MDIX, so a crossover is rarely needed between switches.'),

  // ---------- Network Access ----------
  M('dd-na-dtp', 'NA', 't2-trunks', 'Match each pair of switchport modes to the result on the link.', [
    ['dynamic auto + dynamic auto', 'Access, nobody asks'],
    ['dynamic auto + dynamic desirable', 'Trunk, desirable asks and auto agrees'],
    ['trunk + dynamic auto', 'Trunk, the trunk end sends DTP and auto agrees'],
    ['access + trunk', 'A mismatch: one side tags, the other does not'],
  ], 'DTP only forms a trunk when at least one side actively asks (desirable or trunk) and the other is willing. Two auto ports wait for each other forever and stay access. The exam favors hard-coding: switchport mode trunk with nonegotiate on uplinks, access on edge ports.'),
  O('dd-na-stp', 'NA', 't2-stp', 'Put 802.1D port states in the order a port moves through them on its way to forwarding.', [
    'Blocking', 'Listening', 'Learning', 'Forwarding',
  ], 'Blocking holds for up to 20 seconds of max age, then listening and learning take 15 seconds of forward delay each, so a plain 802.1D port can take 50 seconds to forward. PortFast skips straight to forwarding on edge ports, and Rapid PVST+ replaces the timers with a handshake.'),
  O('dd-na-root', 'NA', 't2-stp', 'Put the spanning tree root port tie-breakers in the order a switch applies them.', [
    'Lowest root path cost',
    'Lowest sender bridge ID',
    'Lowest sender port priority',
    'Lowest sender port number',
  ], 'Cost comes first, so a faster path wins. Only when two ports tie on cost does the switch look at who sent the BPDU, and only when two links reach the same neighbor does it look at that neighbor\'s port priority and then its port number.'),
  S('dd-na-ec', 'NA', 't2-etherchannel', 'Sort each channel-group mode by the protocol it uses.', ['LACP', 'PAgP', 'No negotiation'], [
    ['active', 0], ['passive', 0], ['desirable', 1], ['auto', 1], ['on', 2],
  ], 'LACP (802.3ad) is the standard: active asks, passive answers. PAgP is Cisco\'s: desirable asks, auto answers. on bundles without asking anything, so it only works against another on. Passive with passive, or auto with auto, never forms a bundle.'),
  M('dd-na-l2', 'NA', 't2-stp', 'Match each feature to the problem it solves.', [
    ['PortFast', 'A PC waits 30 seconds for its port to forward'],
    ['BPDU Guard', 'Someone plugs a switch into a desk port'],
    ['Root Guard', 'A new switch with a low priority takes over as root'],
    ['EtherChannel', 'Two uplinks, but spanning tree blocks one'],
  ], 'PortFast is about speed on edge ports. BPDU Guard err-disables an edge port that hears a BPDU. Root Guard lets a port carry BPDUs but refuses superior ones that would move the root. EtherChannel makes two links one logical link, so spanning tree has nothing to block.'),
  M('dd-na-wlan', 'NA', 't2-wlan-arch', 'Match each AP mode to what it does.', [
    ['Local', 'Serves clients, tunnels all traffic to the WLC'],
    ['FlexConnect', 'Switches traffic locally at a branch, keeps working if the WLC link drops'],
    ['Monitor', 'Serves no clients, scans for rogues and interference'],
    ['Sniffer', 'Captures frames on one channel and sends them to an analyzer'],
  ], 'Local mode is the default for a lightweight AP: data and control go over CAPWAP to the controller. FlexConnect is for branches across a WAN. Monitor and sniffer modes take the AP out of client service entirely, which is the trade-off the exam likes to test.'),
  S('dd-na-cdp', 'NA', 't2-discovery', 'Sort each statement: CDP, LLDP, or both.', ['CDP only', 'LLDP only', 'Both'], [
    ['Cisco proprietary', 0], ['On by default on Cisco IOS', 0], ['IEEE 802.1AB', 1], ['Needs "lldp run" to start on IOS', 1], ['Shows the neighbor\'s port and platform', 2], ['Works only between directly connected devices', 2],
  ], 'Both are Layer 2 neighbor discovery and never cross a router. CDP is Cisco\'s and runs out of the box; LLDP is the open standard and is off by default on IOS. In a mixed-vendor closet, LLDP is the one the other gear speaks.'),

  // ---------- IP Connectivity ----------
  M('dd-ipc-ad', 'IPC', 't3-table', 'Match each route source to its default administrative distance.', [
    ['Connected', '0'], ['Static', '1'], ['eBGP', '20'], ['EIGRP', '90'], ['OSPF', '110'], ['RIP', '120'],
  ], 'AD decides between sources that offer the same prefix: lower wins. That is why a floating static route sets an AD above the dynamic protocol\'s, like ip route ... 130 under OSPF, so it only installs when OSPF loses the route.'),
  O('dd-ipc-ospf', 'IPC', 't3-ospf', 'Put the OSPF neighbor states in order, from first contact to fully adjacent.', [
    'Down', 'Init', '2-Way', 'ExStart', 'Exchange', 'Loading', 'Full',
  ], 'Init means a hello arrived; 2-Way means the neighbor listed this router in its hello. DROther pairs on a broadcast segment stop at 2-Way, and that is normal. ExStart through Loading swap the database. A pair stuck in ExStart usually has an MTU mismatch.'),
  O('dd-ipc-lookup', 'IPC', 't3-forwarding', 'A router has several routes that could carry a packet. Put its decision in order.', [
    'Find every route whose prefix contains the destination',
    'Keep the longest prefix match',
    'Among equal prefixes from different sources, keep the lowest AD',
    'Among equal AD, keep the lowest metric',
  ], 'Longest match always comes first: a /28 static with AD 1 and a /24 OSPF route are not competing, because they are different prefixes. AD only breaks ties between sources offering the same prefix, and metric only between routes from the same source.'),
  M('dd-ipc-codes', 'IPC', 't3-table', 'Match each routing table code to its meaning.', [
    ['C', 'A directly connected network'], ['L', 'The router\'s own address, as a /32'], ['S', 'A static route'], ['S*', 'A static default route, the candidate default'], ['O', 'Learned by OSPF in the same area'], ['O IA', 'Learned by OSPF from another area'],
  ], 'Every interface with an address puts two lines in the table: C for the subnet and L for its own /32. The asterisk marks the candidate default, which becomes the gateway of last resort. O IA means the route was summarized across an area border.'),
  S('dd-ipc-fhrp', 'IPC', 't3-fhrp', 'Sort each statement by the first-hop redundancy protocol it describes.', ['HSRP', 'VRRP', 'GLBP'], [
    ['Cisco proprietary, active and standby routers', 0], ['Open standard, a master and backups', 1], ['Cisco proprietary, load balances across gateways', 2], ['Virtual MAC 0000.0c07.acXX in version 1', 0], ['Can use a real interface address as the virtual IP', 1],
  ], 'All three give hosts one gateway address that survives a router failure. HSRP and VRRP have one router forwarding at a time; GLBP hands different hosts different virtual MACs so several routers forward at once. VRRP is the one to pick in a mixed-vendor network.'),

  // ---------- IP Services ----------
  M('dd-ips-nat', 'IPS', 't4-nat', 'Match each NAT address term to what it is.', [
    ['Inside local', 'The private address a host uses on the LAN'],
    ['Inside global', 'The public address that host appears as outside'],
    ['Outside global', 'The real public address of the remote server'],
    ['Outside local', 'The remote server as seen from inside, usually the same as outside global'],
  ], 'Inside or outside says whose address it is; local or global says which side of the router it is seen from. show ip nat translations lists them in that order. With PAT, many inside locals share one inside global and are told apart by port.'),
  O('dd-ips-pat', 'IPS', 't4-nat', 'Put the steps of configuring PAT on a branch router in order.', [
    'Mark the LAN interface ip nat inside',
    'Mark the WAN interface ip nat outside',
    'Write an ACL that permits the inside subnet',
    'ip nat inside source list ACL interface WAN overload',
    'Verify with show ip nat translations',
  ], 'Order of typing does not change the result on a live router, but this order matches how the pieces depend on each other: the router must know which side is which, which sources to translate, and what to translate them to. An empty translation table usually means a swapped inside and outside.'),
  M('dd-ips-syslog', 'IPS', 't4-ntp-log', 'Match each syslog severity number to its name.', [
    ['0', 'Emergency'], ['1', 'Alert'], ['2', 'Critical'], ['3', 'Error'], ['4', 'Warning'], ['5', 'Notification'], ['6', 'Informational'], ['7', 'Debugging'],
  ], 'Lower is worse. A logging level includes everything at that level and below in number, so logging trap 4 sends warnings and everything more severe. The usual memory aid: Every Awesome Cisco Engineer Will Need Ice cream Daily.'),
  M('dd-ips-qos', 'IPS', 't4-qos', 'Match each QoS tool to what it does.', [
    ['Classification and marking', 'Sets DSCP at the edge so later devices can trust it'],
    ['Queuing', 'Decides which packets leave first when an interface is busy'],
    ['Policing', 'Drops or re-marks traffic above a rate'],
    ['Shaping', 'Buffers traffic above a rate and sends it later'],
  ], 'Marking happens once, near the source; every device after that acts on the mark. Policing and shaping both enforce a rate: policing cuts immediately, which suits a provider edge, and shaping smooths bursts, which suits a customer sending into that provider.'),
  M('dd-ips-snmp', 'IPS', 't4-snmp', 'Match each SNMP piece to its role.', [
    ['Manager (NMS)', 'Polls devices and receives their messages'],
    ['Agent', 'Software on the device that answers the manager'],
    ['MIB', 'The tree of variables the agent can report'],
    ['Trap', 'An unrequested alert from the agent'],
  ], 'The manager sends Get and Set; the agent answers from its MIB. Traps flow the other way without being asked. SNMPv3 is the version to pick because it adds authentication and encryption; v1 and v2c send the community string in clear text.'),
  S('dd-ips-dns', 'IPS', 't4-dhcp-dns', 'Sort each item: does it belong to DHCP or to DNS?', ['DHCP', 'DNS'], [
    ['ip helper-address', 0], ['default-router', 0], ['Lease', 0], ['A record', 1], ['nslookup', 1], ['Resolver', 1], ['excluded-address', 0], ['Port 53', 1],
  ], 'DHCP hands a host its addressing, including which DNS server to use. DNS turns names into addresses afterward. When a user says "the internet is down" but pings to an IP work, DNS is the suspect; when the PC has a 169.254 address, DHCP is.'),

  // ---------- Security Fundamentals ----------
  S('dd-sec-acl', 'SECF', 't5-acl', 'Sort each ACL by its type.', ['Standard', 'Extended'], [
    ['access-list 10 permit 10.1.1.0 0.0.0.255', 0], ['access-list 110 deny tcp any any eq 23', 1], ['access-list 1999 permit host 10.9.9.9', 0], ['access-list 2100 permit ip any any', 1], ['ip access-list standard MGMT', 0], ['ip access-list extended WEB', 1],
  ], 'Standard ACLs match only the source address; numbered ones are 1 to 99 and 1300 to 1999. Extended ACLs match protocol, source, destination and ports; numbered ones are 100 to 199 and 2000 to 2699. Place standard ACLs near the destination and extended near the source.'),
  O('dd-sec-ssh', 'SECF', 't0-remote', 'Put the steps to enable SSH on a new router in order.', [
    'hostname R1',
    'ip domain name example.com',
    'crypto key generate rsa modulus 2048',
    'username admin secret StrongPass1',
    'line vty 0 4, login local, transport input ssh',
  ], 'The RSA key is named from the hostname and domain, so IOS refuses to generate it until both exist. login local makes the VTY lines check the local user database, and transport input ssh turns Telnet off. ip ssh version 2 is worth adding too.'),
  M('dd-sec-threat', 'SECF', 't5-concepts', 'Match each term to its meaning.', [
    ['Vulnerability', 'A weakness that could be used against a system'],
    ['Exploit', 'The code or method that uses a weakness'],
    ['Threat', 'Someone or something that could cause harm'],
    ['Mitigation', 'A control that reduces the risk'],
  ], 'A threat uses an exploit against a vulnerability; mitigation closes or limits it. The exam tests these as vocabulary, often in a scenario: an unpatched IOS image is a vulnerability, a published attack script for it is an exploit, and patching it is the mitigation.'),
  S('dd-sec-aaa', 'SECF', 't5-aaa', 'Sort each statement: RADIUS or TACACS+?', ['RADIUS', 'TACACS+'], [
    ['Open standard', 0], ['Uses UDP', 0], ['Encrypts only the password', 0], ['Cisco proprietary', 1], ['Uses TCP port 49', 1], ['Encrypts the whole payload', 1], ['Separates authorization from authentication', 1],
  ], 'RADIUS combines authentication and authorization and is the usual choice for network access like 802.1X and VPN users. TACACS+ splits all three A\'s and can authorize each command, so it is the usual choice for administrators logging into network devices.'),
  M('dd-sec-wifi', 'SECF', 't5-wsec', 'Match each wireless security standard to its encryption.', [
    ['WEP', 'RC4, broken and not to be used'],
    ['WPA', 'TKIP, a stopgap on WEP-era hardware'],
    ['WPA2', 'AES-CCMP'],
    ['WPA3', 'AES, with SAE replacing the PSK handshake'],
  ], 'Each generation fixed the last one\'s weakness. WPA2 with AES is the floor for a new WLAN. WPA3 replaces the pre-shared key handshake with SAE, which resists offline password guessing even when the passphrase is weak.'),
  S('dd-sec-l2', 'SECF', 't5-l2sec', 'Sort each attack by the feature that stops it.', ['DHCP snooping', 'Dynamic ARP inspection', 'Port security'], [
    ['A rogue DHCP server hands out a fake gateway', 0], ['ARP poisoning to sit between a host and its gateway', 1], ['A user plugs in an unauthorized laptop', 2], ['MAC flooding to fill the CAM table', 2],
  ], 'DHCP snooping trusts server replies only on uplinks and builds a binding table. Dynamic ARP inspection checks ARP replies against that table, which is why it needs snooping first. Port security limits which and how many MAC addresses a port accepts.'),

  // ---------- Automation ----------
  M('dd-auto-rest', 'AUTO', 't6-rest', 'Match each HTTP method to the CRUD action it usually performs in a REST API.', [
    ['POST', 'Create'], ['GET', 'Read'], ['PUT', 'Update, replacing the whole resource'], ['DELETE', 'Delete'],
  ], 'REST maps the four CRUD actions onto HTTP methods. PATCH is a partial update, where PUT replaces the whole resource. A 200 or 201 response means success; 401 means not authenticated and 404 means the URL names nothing.'),
  M('dd-auto-codes', 'AUTO', 't6-rest', 'Match each HTTP status code to its meaning.', [
    ['200', 'OK'], ['201', 'Created'], ['401', 'Unauthorized, credentials missing or bad'], ['403', 'Forbidden, authenticated but not allowed'], ['404', 'Not found'], ['500', 'The server failed'],
  ], '2xx is success, 4xx means the request was wrong, 5xx means the server was. The 401 and 403 pair is the one people mix up: 401 is "who are you", 403 is "I know who you are and the answer is no".'),
  S('dd-auto-planes', 'AUTO', 't6-sdn', 'Sort each item by the plane it belongs to.', ['Data plane', 'Control plane', 'Management plane'], [
    ['Forwarding a frame out a port', 0], ['Applying an ACL to a packet', 0], ['OSPF building the routing table', 1], ['STP electing a root', 1], ['SSH to the device', 2], ['SNMP polling', 2],
  ], 'The data plane moves user traffic. The control plane decides how it should move: routing protocols, spanning tree, ARP. The management plane is how people and tools reach the device. SDN pulls the control plane into a central controller and leaves the data plane in the switches.'),
  S('dd-auto-cm', 'AUTO', 't6-config', 'Sort each statement by the tool it describes.', ['Ansible', 'Puppet', 'Chef'], [
    ['Agentless, pushes over SSH', 0], ['Playbooks written in YAML', 0], ['Agent pulls a manifest from a master', 1], ['Recipes and cookbooks written in Ruby', 2],
  ], 'Ansible needs nothing installed on the managed device, which is why it is the common choice for network gear. Puppet and Chef run an agent that pulls its desired state from a server. All three describe the end state and leave the steps to the tool.'),
  M('dd-auto-json', 'AUTO', 't6-json', 'Match each piece of JSON to its type.', [
    ['"GigabitEthernet0/1"', 'String'], ['1500', 'Number'], ['true', 'Boolean'], ['["10", "20", "30"]', 'Array'], ['{"vlan": 10}', 'Object'], ['null', 'Null'],
  ], 'Strings always take double quotes; numbers, true, false and null never do. Arrays are ordered lists in square brackets, objects are key-value pairs in braces with keys always quoted. A trailing comma or a single quote is the usual reason a JSON file fails to parse.'),
];
