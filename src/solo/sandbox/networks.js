// The sandbox: prebuilt networks to configure freely, nothing graded.
//
// Ordered simplest first. The first two are the lab a network engineer
// walks new people through: one router, one switch, PCs, then VLANs, a
// trunk, names and descriptions, DHCP with exclusions, router-on-a-stick
// subinterfaces and default gateways. Later ones add redundancy, routing
// between sites, and an internet edge with NAT and ACLs.
//
// Devices start blank, the way they come out of the box, except anything
// marked as someone else's (the ISP). Each network has a list of things to
// try, in the order they build on each other.

const G2 = ['GigabitEthernet0/0', 'GigabitEthernet0/1'];
const G3 = ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2'];
const NIC = 'FastEthernet0';
let seq = 0;
const L = (a, ai, b, bi) => ({ id: `x${seq += 1}`, ends: [[a, ai], [b, bi]] });

export const SANDBOXES = [
  {
    id: 'sb-vlan-dhcp',
    level: 1,
    title: 'One router, one switch, two VLANs',
    blurb: 'The first lab most people build: split a switch into VLANs, route between them on one cable, and hand out addresses.',
    devices: [
      { id: 'R1', kind: 'router', x: 50, y: 12, ports: G2 },
      { id: 'SW1', kind: 'switch', x: 50, y: 36 },
      { id: 'PC1', kind: 'pc', x: 14, y: 62, pc: { dhcp: true } }, { id: 'PC2', kind: 'pc', x: 38, y: 62, pc: { dhcp: true } },
      { id: 'PC3', kind: 'pc', x: 62, y: 62, pc: { dhcp: true } }, { id: 'PC4', kind: 'pc', x: 86, y: 62, pc: { dhcp: true } },
    ],
    links: [L('R1', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'), L('PC1', NIC, 'SW1', 'FastEthernet0/1'), L('PC2', NIC, 'SW1', 'FastEthernet0/2'), L('PC3', NIC, 'SW1', 'FastEthernet0/3'), L('PC4', NIC, 'SW1', 'FastEthernet0/4')],
    plan: ['VLAN 10 SALES: PC1, PC2 · 192.168.10.0/24', 'VLAN 20 HR: PC3, PC4 · 192.168.20.0/24', 'Gateways .1, first 10 addresses kept for gear'],
    tries: [
      ['Name the devices', 'hostname on R1 and SW1'],
      ['Create the VLANs', 'vlan 10, name SALES; vlan 20, name HR; then show vlan brief'],
      ['Put the PC ports in their VLANs', 'interface range f0/1 - 2, switchport mode access, switchport access vlan 10; same for f0/3 - 4 in 20'],
      ['Describe the ports', 'description on each port, so the next person knows what is plugged in'],
      ['Trunk the uplink', 'interface g0/1, switchport mode trunk; check with show interfaces trunk'],
      ['Bring up the router port', 'interface g0/0, no shutdown (the parent carries no address)'],
      ['Route between the VLANs', 'interface g0/0.10, encapsulation dot1q 10, ip address 192.168.10.1 255.255.255.0; then g0/0.20'],
      ['Keep addresses for gear', 'ip dhcp excluded-address 192.168.10.1 192.168.10.10, and the same for .20'],
      ['Build the DHCP pools', 'ip dhcp pool SALES: network, default-router, dns-server; then HR'],
      ['Get the PCs addresses', 'ipconfig /renew on each PC; show ip dhcp binding on R1'],
      ['Ping across VLANs', 'PC1 to PC3; tracert shows the trip through R1'],
      ['Save it', 'copy running-config startup-config on R1 and SW1'],
    ],
  },
  {
    id: 'sb-dns',
    level: 2,
    title: 'Add a server: DNS and names',
    blurb: 'The same office with a server. Give it a VLAN, publish names in its DNS, and have DHCP tell the PCs to use it.',
    devices: [
      { id: 'R1', kind: 'router', x: 50, y: 12, ports: G2 },
      { id: 'SW1', kind: 'switch', x: 50, y: 36 },
      { id: 'PC1', kind: 'pc', x: 14, y: 62, pc: { dhcp: true } }, { id: 'PC2', kind: 'pc', x: 38, y: 62, pc: { dhcp: true } },
      { id: 'PC3', kind: 'pc', x: 62, y: 62, pc: { dhcp: true } },
      { id: 'SRV', kind: 'pc', x: 86, y: 62, pc: { services: [80], server: { dns: { on: false, records: {} }, dhcp: { on: false, pools: [] } } } },
    ],
    links: [L('R1', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'), L('PC1', NIC, 'SW1', 'FastEthernet0/1'), L('PC2', NIC, 'SW1', 'FastEthernet0/2'), L('PC3', NIC, 'SW1', 'FastEthernet0/3'), L('SRV', NIC, 'SW1', 'FastEthernet0/24')],
    plan: ['VLAN 10 STAFF: PC1, PC2 · 10.10.10.0/24', 'VLAN 20 GUEST: PC3 · 10.10.20.0/24', 'VLAN 99 SERVERS: SRV · 10.10.99.0/24, SRV at .10', 'Names: portal.office.lab is SRV'],
    tries: [
      ['VLANs, ports and trunk', 'As in the first network: VLANs 10, 20 and 99, access ports, a trunk to R1'],
      ['Three subinterfaces', 'g0/0.10, .20 and .99, one gateway each'],
      ['Address the server by hand', 'On SRV: ipconfig 10.10.99.10 255.255.255.0 10.10.99.1'],
      ['Turn on DNS on the server', 'Open SRV\'s Services: turn DNS on, add portal.office.lab → 10.10.99.10'],
      ['Point DHCP at the DNS server', 'dns-server 10.10.99.10 in each pool on R1'],
      ['Renew and look a name up', 'ipconfig /renew, ipconfig /all shows the DNS server, then nslookup portal.office.lab'],
      ['Ping by name', 'ping portal.office.lab from PC1'],
      ['Move DHCP to the server', 'Turn R1\'s pools off (no ip dhcp pool), add a pool on SRV, and relay with ip helper-address 10.10.99.10 on each subinterface'],
    ],
  },
  {
    id: 'sb-campus',
    level: 3,
    title: 'A campus with redundant uplinks',
    blurb: 'Two distribution switches and two access switches, cabled with spare links. Spanning tree decides which ones carry traffic until you take charge of it.',
    devices: [
      { id: 'DIST1', kind: 'switch', x: 28, y: 12 }, { id: 'DIST2', kind: 'switch', x: 72, y: 12 },
      { id: 'ACC1', kind: 'switch', x: 28, y: 42 }, { id: 'ACC2', kind: 'switch', x: 72, y: 42 },
      { id: 'PC1', kind: 'pc', x: 12, y: 66, pc: { ip: '10.0.10.11', mask: '255.255.255.0' } }, { id: 'PC2', kind: 'pc', x: 42, y: 66, pc: { ip: '10.0.20.11', mask: '255.255.255.0' } },
      { id: 'PC3', kind: 'pc', x: 58, y: 66, pc: { ip: '10.0.10.12', mask: '255.255.255.0' } }, { id: 'PC4', kind: 'pc', x: 88, y: 66, pc: { ip: '10.0.20.12', mask: '255.255.255.0' } },
    ],
    links: [
      L('DIST1', 'GigabitEthernet0/1', 'DIST2', 'GigabitEthernet0/1'), L('DIST1', 'GigabitEthernet0/2', 'DIST2', 'GigabitEthernet0/2'),
      L('DIST1', 'FastEthernet0/23', 'ACC1', 'GigabitEthernet0/1'), L('DIST2', 'FastEthernet0/23', 'ACC1', 'GigabitEthernet0/2'),
      L('DIST1', 'FastEthernet0/24', 'ACC2', 'GigabitEthernet0/1'), L('DIST2', 'FastEthernet0/24', 'ACC2', 'GigabitEthernet0/2'),
      L('PC1', NIC, 'ACC1', 'FastEthernet0/1'), L('PC2', NIC, 'ACC1', 'FastEthernet0/2'), L('PC3', NIC, 'ACC2', 'FastEthernet0/1'), L('PC4', NIC, 'ACC2', 'FastEthernet0/2'),
    ],
    plan: ['VLAN 10 USERS: PC1, PC3', 'VLAN 20 VOICE-LAB: PC2, PC4', 'DIST1 should be root for VLAN 10, DIST2 for VLAN 20'],
    tries: [
      ['See what spanning tree chose', 'show spanning-tree on each switch: which switch is root, and which ports block?'],
      ['VLANs everywhere, trunks between switches', 'Same VLANs on all four; every switch-to-switch link a trunk'],
      ['Access ports for the PCs', 'Then ping PC1 to PC3 across the campus'],
      ['Take charge of the root', 'spanning-tree vlan 10 root primary on DIST1, vlan 20 on DIST2; see the blocked ports move'],
      ['Bundle the DIST links', 'channel-group 1 mode active on both DIST1 links and passive on DIST2; show etherchannel summary'],
      ['Speed up the edge', 'spanning-tree portfast and bpduguard enable on PC ports only'],
      ['Lock the desk ports', 'switchport port-security with sticky MACs on ACC1 f0/1'],
      ['Break it on purpose', 'Shut a DIST uplink and watch spanning tree unblock the spare'],
    ],
  },
  {
    id: 'sb-ospf',
    level: 4,
    title: 'Two sites and a headquarters on OSPF',
    blurb: 'Three routers in a triangle, each with its own LAN. Address the links, get OSPF talking, and decide which way traffic goes.',
    devices: [
      { id: 'HQ', kind: 'router', x: 50, y: 12, ports: G3 },
      { id: 'SITE1', kind: 'router', x: 20, y: 40, ports: G3 }, { id: 'SITE2', kind: 'router', x: 80, y: 40, ports: G3 },
      { id: 'SRV', kind: 'pc', x: 50, y: 36, pc: { ip: '172.16.0.10', mask: '255.255.255.0', gateway: '172.16.0.1', services: [80], server: { dns: { on: true, records: { 'intranet.corp.lab': '172.16.0.10' } }, dhcp: { on: false, pools: [] } } } },
      { id: 'PC1', kind: 'pc', x: 20, y: 66, pc: { ip: '172.16.1.10', mask: '255.255.255.0', gateway: '172.16.1.1' } },
      { id: 'PC2', kind: 'pc', x: 80, y: 66, pc: { ip: '172.16.2.10', mask: '255.255.255.0', gateway: '172.16.2.1' } },
    ],
    links: [L('HQ', 'GigabitEthernet0/0', 'SITE1', 'GigabitEthernet0/0'), L('HQ', 'GigabitEthernet0/1', 'SITE2', 'GigabitEthernet0/0'), L('SITE1', 'GigabitEthernet0/1', 'SITE2', 'GigabitEthernet0/1'),
      L('HQ', 'GigabitEthernet0/2', 'SRV', NIC), L('SITE1', 'GigabitEthernet0/2', 'PC1', NIC), L('SITE2', 'GigabitEthernet0/2', 'PC2', NIC)],
    plan: ['HQ LAN 172.16.0.0/24, SITE1 172.16.1.0/24, SITE2 172.16.2.0/24 (routers .1)', 'Links: HQ-SITE1 10.0.0.0/30, HQ-SITE2 10.0.0.4/30, SITE1-SITE2 10.0.0.8/30', 'PCs and SRV are addressed already'],
    tries: [
      ['Address every router interface', 'Use the plan; show ip interface brief until everything is up/up'],
      ['A static route first', 'On SITE1: ip route 172.16.0.0 255.255.255.0 10.0.0.1; ping SRV from PC1. Then remove it.'],
      ['Turn on OSPF', 'router ospf 1, router-id, network statements (or ip ospf 1 area 0 on each interface)'],
      ['Check the neighbors', 'show ip ospf neighbor: each router should list two, FULL'],
      ['Stop hellos on the LANs', 'passive-interface g0/2 on each router'],
      ['Steer the traffic', 'ip ospf cost on the SITE1-SITE2 link; show ip route on SITE1 to see the path change'],
      ['A backup route', 'A floating static to HQ\'s LAN with AD 130: it shows up only if OSPF loses the route'],
      ['Names across sites', 'Give PC1 the DNS server (ipconfig ... 172.16.0.10) and ping intranet.corp.lab'],
    ],
  },
  {
    id: 'sb-edge',
    level: 5,
    title: 'A branch on the internet',
    blurb: 'A branch with users and a server behind an edge router. The ISP is not yours; everything on your side is blank. Get the branch online, publish the server, and lock it down.',
    devices: [
      { id: 'EDGE', kind: 'router', x: 46, y: 14, ports: G3 },
      { id: 'ISP', kind: 'router', x: 86, y: 14, ports: G2, theirs: true },
      { id: 'WEB', kind: 'pc', x: 88, y: 42, pc: { ip: '198.51.100.80', mask: '255.255.255.0', gateway: '198.51.100.1', services: [80, 443] } },
      { id: 'SW1', kind: 'switch', x: 30, y: 38 },
      { id: 'SRV', kind: 'pc', x: 62, y: 42, pc: { ip: '10.20.50.10', mask: '255.255.255.0', gateway: '10.20.50.1', services: [22, 80, 443] } },
      { id: 'PC1', kind: 'pc', x: 14, y: 64, pc: { dhcp: true } }, { id: 'PC2', kind: 'pc', x: 40, y: 64, pc: { dhcp: true } },
    ],
    links: [L('EDGE', 'GigabitEthernet0/1', 'ISP', 'GigabitEthernet0/0'), L('ISP', 'GigabitEthernet0/1', 'WEB', NIC), L('EDGE', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'),
      L('EDGE', 'GigabitEthernet0/2', 'SRV', NIC), L('PC1', NIC, 'SW1', 'FastEthernet0/1'), L('PC2', NIC, 'SW1', 'FastEthernet0/2')],
    setup: { ISP: ['hostname ISP', 'interface g0/0', 'ip address 203.0.113.1 255.255.255.248', 'no shutdown', 'interface g0/1', 'ip address 198.51.100.1 255.255.255.0', 'no shutdown'] },
    plan: ['Users 10.20.10.0/24 on Gi0/0, server LAN 10.20.50.0/24 on Gi0/2 (SRV at .10)', 'WAN 203.0.113.0/29: ISP .1, EDGE .2, .3 to .6 spare', 'Test site on the internet: 198.51.100.80'],
    tries: [
      ['Address EDGE and add a default route', 'ip route 0.0.0.0 0.0.0.0 203.0.113.1'],
      ['DHCP for the users', 'Exclusions, a pool, ipconfig /renew on the PCs'],
      ['Why the internet does not work yet', 'Ping 198.51.100.80 from PC1: the ISP has no route back to 10.20.10.0'],
      ['PAT for the users', 'ip nat inside and outside on the right interfaces, an ACL for 10.20.10.0/24, ip nat inside source list 1 interface g0/1 overload'],
      ['Publish the server', 'ip nat inside source static 10.20.50.10 203.0.113.5; from WEB, telnet 203.0.113.5 80'],
      ['Protect the server', 'An extended ACL out on Gi0/2: web from anywhere, SSH only from PC1\'s subnet'],
      ['Watch the ACL work', 'show access-lists shows the matches climb as you test from each PC'],
      ['Manage EDGE over SSH only', 'domain name, RSA keys, a local user, transport input ssh'],
      ['Time and logs', 'ntp server and logging host pointing at SRV'],
    ],
  },
];

export const sandboxById = (id) => SANDBOXES.find(s => s.id === id) ?? null;
