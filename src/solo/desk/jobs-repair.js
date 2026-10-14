// Repair tickets for the Field desk: a working network with one fault in
// it, reported the way users report things ("desk 3 has no network since
// the furniture move"). The work is to find it and fix only it: the grader
// checks that the symptom is gone, that everything else still works, and
// charges for any configuration the fix did not need.
//
// make(seed, { fault }) picks the fault from the seed unless one is named,
// so the skill map can ask for a ticket that exercises a given branch.

import { rngOf, int, pick, sample, privateBase, subnetIn, addHost } from '../study/gen/kit.js';
import { exchange, requestDhcp, l2Of } from '../labs/world.js';
import { memberFlag, negotiate } from '../labs/switching.js';
import { parseIp } from '../labs/ip4.js';
import { cloneWorld } from './grade.js';
import { IPV6_REPAIRS } from './jobs-ipv6.js';

const ip = parseIp;
const NIC = 'FastEthernet0';
const M24 = '255.255.255.0';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const ifRe = (...names) => new RegExp(`^interface (${names.map(esc).join('|')})\\|`);
const globalRe = (prefix) => new RegExp(`^global\\|${esc(prefix)}`);
const tryIt = (w, fn) => fn(cloneWorld(w));
const reachOn = (w, d, dst, opts) => exchange(w, d, ip(dst), opts).ok;
const reach = (w, d, dst, opts = {}) => tryIt(w, c => reachOn(c, d, dst, opts));
const renewReach = (w, pc, dst, opts = {}) => tryIt(w, c => {
  const r = requestDhcp(c, pc);
  if (!r.ok) return false;
  const conf = c.devices[pc].config;
  conf.interfaces.FastEthernet0.ip = r.ip;
  conf.interfaces.FastEthernet0.mask = (0xffffffff << (32 - r.len)) >>> 0;
  conf.gateway = r.router;
  return reachOn(c, pc, dst, opts);
});

let linkSeq = 0;
const L = (a, ai, b, bi) => ({ id: `f${linkSeq += 1}`, ends: [[a, ai], [b, bi]] });
const nets = (rnd, n) => {
  const out = [];
  while (out.length < n) { const x = subnetIn(rnd, privateBase(rnd), 24); if (!out.includes(x)) out.push(x); }
  return out;
};
const SITES = ['Harbor Clinic', 'Elm Street Branch', 'Northgate Office', 'Mesa Warehouse', 'Riverside Annex', 'Pine Ridge School', 'Lakeview Dental', 'Canyon Library', 'Bayside Depot', 'Cedar Hall'];
const CALLERS = ['the front desk', 'the office manager', 'a nurse at station 2', 'the warehouse lead', 'the help desk', 'a teacher in room 14'];
const VLAN_NAMES = ['SALES', 'ENG', 'HR', 'FINANCE', 'STAFF', 'CLINIC', 'OPS', 'LAB'];

function ticket(rnd, kind) {
  return { number: `INC${int(rnd, 100000, 999999)}`, site: pick(rnd, SITES), requester: pick(rnd, CALLERS), priority: pick(rnd, ['P1', 'P2', 'P2', 'P3']), kind };
}

// ------------------------------------------------------------ a branch office
function branchNet(rnd) {
  const rtr = pick(rnd, ['BR-RTR', 'R1', 'EDGE1', 'SITE-RTR']);
  const [va, vb] = sample(rnd, [10, 20, 30, 40, 50, 60], 2).sort((a, b) => a - b);
  const [na, nb] = sample(rnd, VLAN_NAMES, 2);
  const [netA, netB, srvNet] = nets(rnd, 3);
  const wan = `10.254.${int(rnd, 0, 250)}.0`;
  const web = `198.51.100.${int(rnd, 10, 200)}`;
  return { rtr, va, vb, na, nb, netA, netB, srvNet, gwA: addHost(netA, 1), gwB: addHost(netB, 1), isp: addHost(wan, 1), out: addHost(wan, 2), wan, web, srv: addHost(srvNet, 10) };
}

// The healthy branch, as setup lines. A fault swaps or adds lines.
function branchSetup(n, fault) {
  const f = (id) => fault.id === id;
  const psec = f('psec')
    ? ['switchport port-security mac-address sticky 0050.79aa.0001', 'switchport port-security mac-address sticky', 'switchport port-security']
    : ['switchport port-security', 'switchport port-security mac-address sticky'];
  return {
    ISP: ['hostname ISP', 'interface g0/0', `ip address ${n.isp} 255.255.255.252`, 'no shutdown', 'interface g0/1', 'ip address 198.51.100.1 255.255.255.0', 'no shutdown'],
    SW1: ['hostname SW1', `vlan ${n.va}`, `name ${n.na}`, `vlan ${n.vb}`, `name ${n.nb}`,
      'interface g0/1', 'switchport mode trunk', `switchport trunk allowed vlan ${f('trunk-pruned') ? n.va : `${n.va},${n.vb}`}`,
      'interface f0/1', 'switchport mode access', `switchport access vlan ${f('wrong-vlan') ? n.vb : n.va}`, ...psec,
      'interface f0/2', 'switchport mode access', `switchport access vlan ${n.vb}`, ...(f('duplex') ? ['speed 100', 'duplex full'] : []),
      'interface f0/3', 'switchport mode access', `switchport access vlan ${n.va}`, ...(f('port-shut') ? ['shutdown'] : [])],
    [n.rtr]: [`hostname ${n.rtr}`, 'ip domain name branch.lan', 'crypto key generate rsa modulus 1024', 'username admin secret Adm1n!pass', 'line vty 0 4', 'login local', `transport input ${f('ssh-telnet') ? 'telnet' : 'ssh'}`, 'exit',
      'interface g0/0', 'no shutdown',
      `interface g0/0.${n.va}`, `encapsulation dot1q ${n.va}`, `ip address ${n.gwA} ${M24}`, `ip nat ${f('nat-swapped') ? 'outside' : 'inside'}`,
      `interface g0/0.${n.vb}`, `encapsulation dot1q ${n.vb}`, `ip address ${n.gwB} ${M24}`, `ip nat ${f('nat-swapped') ? 'outside' : 'inside'}`,
      'interface g0/1', `ip address ${n.out} 255.255.255.252`, 'no shutdown', `ip nat ${f('nat-swapped') ? 'inside' : 'outside'}`,
      'interface g0/2', `ip address ${addHost(n.srvNet, 1)} ${M24}`, 'no shutdown', `ip access-group SRV-PROTECT ${f('acl-direction') ? 'in' : 'out'}`, 'exit',
      ...(f('no-default') ? [] : [`ip route 0.0.0.0 0.0.0.0 ${f('bad-nexthop') ? '198.51.100.1' : n.isp}`]),
      `access-list 1 permit ${n.netA} 0.0.0.255`, ...(f('nat-acl') ? [] : [`access-list 1 permit ${n.netB} 0.0.0.255`]),
      'ip nat inside source list 1 interface g0/1 overload',
      'ip access-list extended SRV-PROTECT', `permit tcp any host ${n.srv} eq www`, `permit tcp ${n.netA} 0.0.0.255 host ${n.srv} eq 22`, 'permit icmp any any', 'exit',
      `ip dhcp excluded-address ${n.gwA} ${addHost(n.netA, 9)}`, `ip dhcp pool ${n.na}`, `network ${n.netA} ${M24}`, `default-router ${f('dhcp-gw') ? addHost(n.netA, 254) : n.gwA}`, 'dns-server 1.1.1.1', 'exit'],
    PC3: ['ipconfig /renew'],
  };
}

const BRANCH_FAULTS = [
  { id: 'wrong-vlan', lights: ['t2-vlans'], says: 'PC1 at desk 1 lost everything after facilities moved the furniture. Everyone else is fine.',
    symptom: (n) => ({ text: 'PC1 reaches the web again', check: (w) => reach(w, 'PC1', n.web, { proto: 'tcp', port: 80 }) }),
    owns: () => ({ SW1: [ifRe('FastEthernet0/1')] }), fix: (n) => ({ SW1: ['enable', 'configure terminal', 'interface f0/1', `switchport access vlan ${n.va}`] }),
    hint: 'Compare desk 1\'s port with its neighbors in show vlan brief, or show interfaces status.' },
  { id: 'port-shut', lights: ['t1-physical', 't0-base'], says: 'The PC at desk 3 says it cannot contact a DHCP server and shows a 169.254 address.',
    symptom: (n) => ({ text: 'PC3 gets an address and reaches the web', check: (w) => renewReach(w, 'PC3', n.web, { proto: 'tcp', port: 80 }) }),
    owns: () => ({ SW1: [ifRe('FastEthernet0/3')], PC3: [/^pc\|/] }), fix: () => ({ SW1: ['enable', 'configure terminal', 'interface f0/3', 'no shutdown'], PC3: ['ipconfig /renew'] }),
    hint: 'A 169.254 address means no DHCP answer at all. Start at the port: show interfaces status on SW1.' },
  { id: 'trunk-pruned', lights: ['t2-trunks'], says: 'Everyone on PC2\'s side of the office has been offline since last night\'s change window. The other side is fine.',
    symptom: (n) => ({ text: 'PC2 reaches the web again', check: (w) => reach(w, 'PC2', n.web, { proto: 'tcp', port: 80 }) }),
    owns: () => ({ SW1: [ifRe('GigabitEthernet0/1')] }), fix: (n) => ({ SW1: ['enable', 'configure terminal', 'interface g0/1', `switchport trunk allowed vlan add ${n.vb}`] }),
    hint: 'One VLAN down, one up, same switch: look at what the uplink carries. show interfaces trunk.' },
  { id: 'psec', lights: ['t5-l2sec'], says: 'Desk 1 got a new PC this morning. The old one worked; the new one has no network at all.',
    symptom: (n) => ({ text: 'PC1 reaches the web again', check: (w) => reach(w, 'PC1', n.web, { proto: 'tcp', port: 80 }) }),
    owns: () => ({ SW1: [ifRe('FastEthernet0/1')] }), fix: () => ({ SW1: ['enable', 'configure terminal', 'interface f0/1', 'no switchport port-security mac-address sticky 0050.79aa.0001', 'shutdown', 'no shutdown'] }),
    hint: 'show port-security interface f0/1: the sticky address is the old PC\'s. Remove it, then bounce the port.' },
  { id: 'duplex', lights: ['t1-physical'], says: 'PC2 is on the network, but everything is painfully slow: file copies crawl and video calls freeze. It started after someone "fixed" its switch port.',
    symptom: () => ({ text: 'PC2\'s port runs without a duplex mismatch', check: (w) => { const x = negotiate(w, 'SW1', 'FastEthernet0/2'); return Boolean(x?.ok) && !x.mismatch; } }),
    owns: () => ({ SW1: [ifRe('FastEthernet0/2')] }), fix: () => ({ SW1: ['enable', 'configure terminal', 'interface f0/2', 'speed auto', 'duplex auto'] }),
    hint: 'show interfaces status on SW1: one port shows hard-set speed and duplex. show interfaces f0/2 shows CRC errors and runts piling up. A PC on auto facing a hard-set port falls back to half duplex.' },
  { id: 'pc-gateway', lights: ['t1-client'], says: 'PC2 can reach the printer on its floor but no websites and not the intranet.',
    symptom: (n) => ({ text: 'PC2 reaches the web again', check: (w) => reach(w, 'PC2', n.web, { proto: 'tcp', port: 80 }) }),
    owns: () => ({ PC2: [/^pc\|/] }), fix: (n) => ({ PC2: [`ipconfig ${addHost(n.netB, 20)} ${M24} ${n.gwB}`] }),
    hint: 'Local works, remote does not: check what the PC thinks its gateway is. ipconfig on PC2.' },
  { id: 'pc-mask', lights: ['t1-ipv4'], says: 'PC1 reaches nothing outside its own little corner since IT re-imaged it.',
    symptom: (n) => ({ text: 'PC1 reaches the web again', check: (w) => reach(w, 'PC1', n.web, { proto: 'tcp', port: 80 }) }),
    owns: () => ({ PC1: [/^pc\|/] }), fix: (n) => ({ PC1: [`ipconfig ${addHost(n.netA, 20)} ${M24} ${n.gwA}`] }),
    hint: 'Read ipconfig on PC1 closely: is the gateway inside the subnet its mask describes?' },
  { id: 'no-default', lights: ['t3-static'], says: 'Nobody can open any website. The intranet server still works.',
    symptom: (n) => ({ text: 'Both VLANs reach the web again', check: (w) => reach(w, 'PC1', n.web, { proto: 'tcp', port: 80 }) && reach(w, 'PC2', n.web, { proto: 'tcp', port: 80 }) }),
    owns: () => ({}), ownsFn: (n) => ({ [n.rtr]: [globalRe('ip route 0.0.0.0')] }), fix: (n) => ({ [n.rtr]: ['enable', 'configure terminal', `ip route 0.0.0.0 0.0.0.0 ${n.isp}`] }),
    hint: 'Internal works and the internet does not: what does the router do with traffic it has no specific route for? show ip route.' },
  { id: 'bad-nexthop', lights: ['t3-static', 't3-forwarding'], says: 'After the router was swapped last night, no website loads. Internal traffic is fine.',
    symptom: (n) => ({ text: 'Both VLANs reach the web again', check: (w) => reach(w, 'PC1', n.web, { proto: 'tcp', port: 80 }) && reach(w, 'PC2', n.web, { proto: 'tcp', port: 80 }) }),
    owns: () => ({}), ownsFn: (n) => ({ [n.rtr]: [globalRe('ip route 0.0.0.0')] }), fix: (n) => ({ [n.rtr]: ['enable', 'configure terminal', 'no ip route 0.0.0.0 0.0.0.0 198.51.100.1', `ip route 0.0.0.0 0.0.0.0 ${n.isp}`] }),
    hint: 'show running-config has a default route, but show ip route has no gateway of last resort. A static route only installs if its next hop is reachable.' },
  { id: 'nat-swapped', lights: ['t4-nat'], says: 'Since the WAN cutover nobody reaches websites. Internal traffic works.',
    symptom: (n) => ({ text: 'Both VLANs reach the web again', check: (w) => reach(w, 'PC1', n.web, { proto: 'tcp', port: 80 }) && reach(w, 'PC2', n.web, { proto: 'tcp', port: 80 }) }),
    owns: () => ({}), ownsFn: (n) => ({ [n.rtr]: [ifRe('GigabitEthernet0/1', `GigabitEthernet0/0.${n.va}`, `GigabitEthernet0/0.${n.vb}`)] }),
    fix: (n) => ({ [n.rtr]: ['enable', 'configure terminal', `interface g0/0.${n.va}`, 'ip nat inside', `interface g0/0.${n.vb}`, 'ip nat inside', 'interface g0/1', 'ip nat outside'] }),
    hint: 'show ip nat translations stays empty. Which interfaces does show ip interface call inside and outside?' },
  { id: 'nat-acl', lights: ['t4-nat', 't5-acl'], says: `PC2's side of the office can't reach any websites. PC1's side can.`,
    symptom: (n) => ({ text: 'PC2 reaches the web again', check: (w) => reach(w, 'PC2', n.web, { proto: 'tcp', port: 80 }) }),
    owns: () => ({}), ownsFn: () => ({}), ownsAny: true, fix: (n) => ({ [n.rtr]: ['enable', 'configure terminal', `access-list 1 permit ${n.netB} 0.0.0.255`] }),
    hint: 'NAT only translates sources its ACL permits. show access-lists 1, then compare with both LAN subnets.' },
  { id: 'dhcp-gw', lights: ['t4-dhcp-dns'], says: 'PCs that picked up a new lease today (desk 3) can\'t reach websites. PCs with fixed addresses are fine.',
    symptom: (n) => ({ text: 'A PC that renews now reaches the web', check: (w) => renewReach(w, 'PC3', n.web, { proto: 'tcp', port: 80 }) }),
    owns: () => ({ PC3: [/^pc\|/] }), ownsFn: () => ({}), poolFix: true,
    fix: (n) => ({ [n.rtr]: ['enable', 'configure terminal', `ip dhcp pool ${n.na}`, `default-router ${n.gwA}`], PC3: ['ipconfig /renew'] }),
    hint: 'ipconfig on PC3: the address looks right, the gateway does not. Where does a DHCP client get its gateway?' },
  { id: 'acl-direction', lights: ['t5-acl'], says: 'Since last night\'s security change the intranet site times out. Ping to the server still works.',
    symptom: (n) => ({ text: 'Both VLANs open the intranet site again', check: (w) => reach(w, 'PC1', n.srv, { proto: 'tcp', port: 80 }) && reach(w, 'PC2', n.srv, { proto: 'tcp', port: 80 }) }),
    owns: () => ({}), ownsFn: () => ({}), ownsSrv: true,
    fix: () => ({ R: ['enable', 'configure terminal', 'interface g0/2', 'no ip access-group SRV-PROTECT in', 'ip access-group SRV-PROTECT out'] }),
    hint: 'show ip interface g0/2 says which way the ACL faces. Read its lines as if you were a packet going the other way.' },
  { id: 'ssh-telnet', lights: ['t0-remote'], says: 'SSH to the branch router is refused. Policy forbids Telnet, so nobody can manage it.',
    symptom: (n) => ({ text: 'SSH to the router works and Telnet does not', check: (w) => reach(w, 'PC1', n.gwA, { proto: 'tcp', port: 22 }) && !reach(w, 'PC1', n.gwA, { proto: 'tcp', port: 23 }) }),
    owns: () => ({}), ownsFn: (n) => ({ [n.rtr]: [/^line vty/] }), fix: () => ({ R: ['enable', 'configure terminal', 'line vty 0 4', 'transport input ssh'] }),
    hint: 'show running-config | section line vty.' },
];

// ------------------------------------------------------------ two switches
function campusSetup(n, fault) {
  const f = (id) => fault.id === id;
  const vlans = [`vlan ${n.va}`, `name ${n.na}`, `vlan ${n.vb}`, `name ${n.nb}`];
  const desks = ['interface f0/1', 'switchport mode access', `switchport access vlan ${n.va}`, 'interface f0/2', 'switchport mode access', `switchport access vlan ${n.vb}`];
  const uplink = (mode) => ['interface range g0/1 - 2', 'switchport mode trunk', `switchport trunk allowed vlan ${n.va},${n.vb}`, `channel-group 1 mode ${mode}`];
  return {
    DIST: ['hostname DIST', ...vlans, ...desks, ...uplink('active'),
      ...(f('access-uplink') ? ['interface port-channel 1', 'switchport mode access'] : []),
      ...(f('vlan-missing') ? ['exit', `no vlan ${n.vb}`] : [])],
    ACC: ['hostname ACC', ...vlans, ...desks, ...uplink(f('ec-mode') ? 'on' : 'passive'),
      ...(f('ec-mismatch') ? ['interface g0/2', `switchport trunk allowed vlan ${n.va}`] : []),
      ...(f('bpdu-uplink') ? ['interface range g0/1 - 2', 'spanning-tree portfast', 'spanning-tree bpduguard enable'] : [])],
  };
}

const crosses = (w, n) => reach(w, 'PC1', addHost(n.netA, 12)) && reach(w, 'PC2', addHost(n.netB, 12));
const bundled = (w) => ['GigabitEthernet0/1', 'GigabitEthernet0/2'].every(p => memberFlag(w, 'ACC', p) === 'P' && memberFlag(w, 'DIST', p) === 'P');

const CAMPUS_FAULTS = [
  { id: 'ec-mode', lights: ['t2-etherchannel'], says: 'Monitoring says the uplink between DIST and ACC has run at half capacity since ACC was replaced.',
    symptom: () => ({ text: 'Both uplinks bundled on both switches', check: bundled }),
    owns: () => ({ ACC: [ifRe('GigabitEthernet0/1', 'GigabitEthernet0/2', 'Port-channel1')] }),
    fix: () => ({ ACC: ['enable', 'configure terminal', 'interface range g0/1 - 2', 'no channel-group', 'channel-group 1 mode passive'] }),
    hint: 'show etherchannel summary on both. on does not speak LACP, and active needs a partner that does.' },
  { id: 'ec-mismatch', lights: ['t2-etherchannel', 't2-trunks'], says: 'One of the two uplinks shows up but carries nothing, and the bundle is degraded.',
    symptom: () => ({ text: 'Both uplinks bundled on both switches', check: bundled }),
    owns: () => ({ ACC: [ifRe('GigabitEthernet0/2')] }),
    fix: (n) => ({ ACC: ['enable', 'configure terminal', 'interface g0/2', `switchport trunk allowed vlan ${n.va},${n.vb}`] }),
    hint: 'An (s) in show etherchannel summary means suspended: that member\'s settings differ from the Port-channel\'s. Compare them in the running config.' },
  { id: 'bpdu-uplink', lights: ['t2-stp'], says: 'Everything on ACC went dark right after someone "hardened" its ports.',
    symptom: (n) => ({ text: 'ACC\'s desks reach DIST\'s again', check: (w) => crosses(w, n) }),
    owns: () => ({ ACC: [ifRe('GigabitEthernet0/1', 'GigabitEthernet0/2', 'Port-channel1')] }),
    fix: () => ({ ACC: ['enable', 'configure terminal', 'interface range g0/1 - 2', 'no spanning-tree bpduguard', 'no spanning-tree portfast', 'shutdown', 'no shutdown'] }),
    hint: 'show interfaces status shows err-disabled. BPDU Guard belongs on host ports; on an uplink it shuts the port the moment the other switch speaks.' },
  { id: 'access-uplink', lights: ['t2-trunks'], says: 'Nothing crosses between DIST and ACC since DIST was swapped this morning.',
    symptom: (n) => ({ text: 'Desks reach the other switch again, in both VLANs', check: (w) => crosses(w, n) }),
    owns: () => ({ DIST: [ifRe('GigabitEthernet0/1', 'GigabitEthernet0/2', 'Port-channel1')] }),
    fix: () => ({ DIST: ['enable', 'configure terminal', 'interface port-channel 1', 'switchport mode trunk'] }),
    hint: 'show interfaces trunk on each end. One side is not trunking.' },
  { id: 'vlan-missing', lights: ['t2-vlans'], says: `Users on DIST in one VLAN lost everything after someone tidied up the VLAN list.`,
    symptom: (n) => ({ text: 'Both VLANs work end to end again', check: (w) => crosses(w, n) }),
    owns: () => ({ DIST: [/^vlan\|/] }),
    fix: (n) => ({ DIST: ['enable', 'configure terminal', `vlan ${n.vb}`, `name ${n.nb}`] }),
    hint: 'show vlan brief on DIST. An access port in a VLAN that does not exist is inactive.' },
];


// ------------------------------------------------------------ OSPF between sites
// HQ in the middle, two branches on point links, everything in area 0 with
// interface-mode OSPF. Each fault is one way an adjacency or a route goes
// missing.
function ospfSetup(n, fault) {
  const f = (id) => fault.id === id;
  const hq = ['hostname HQ', 'router ospf 1', 'router-id 1.1.1.1', 'passive-interface g0/2', 'exit',
    'interface g0/0', `ip address ${n.t1h} 255.255.255.252`, 'ip ospf 1 area 0', 'no shutdown',
    'interface g0/1', `ip address ${n.t2h} 255.255.255.252`, 'ip ospf 1 area 0', 'no shutdown',
    'interface g0/2', `ip address ${n.gwS} ${M24}`, 'ip ospf 1 area 0', 'no shutdown'];
  const br1 = ['hostname BR1', 'router ospf 1', 'router-id 2.2.2.2', 'passive-interface g0/1', ...(f('passive-transit') ? ['passive-interface g0/0'] : []), 'exit',
    'interface g0/0', `ip address ${n.t1b} ${f('mask-mismatch') ? '255.255.255.248' : '255.255.255.252'}`, 'ip ospf 1 area 0', 'no shutdown',
    'interface g0/1', `ip address ${n.gwA} ${M24}`, ...(f('lan-missing') ? [] : ['ip ospf 1 area 0']), 'no shutdown'];
  const br2 = ['hostname BR2', 'router ospf 1', `router-id ${f('dup-rid') ? '1.1.1.1' : '3.3.3.3'}`, 'passive-interface g0/1', 'exit',
    'interface g0/0', `ip address ${n.t2b} 255.255.255.252`, `ip ospf 1 area ${f('area-mismatch') ? n.wrongArea : 0}`, ...(f('type-mismatch') ? ['ip ospf network point-to-point'] : []), 'no shutdown',
    'interface g0/1', `ip address ${n.gwB} ${M24}`, 'ip ospf 1 area 0', 'no shutdown'];
  return { HQ: hq, BR1: br1, BR2: br2 };
}

const reachSrv = (w, n, pc) => reach(w, pc, n.srv, { proto: 'tcp', port: 80 });

const OSPF_FAULTS = [
  { id: 'area-mismatch', lights: ['t3-ospf'], says: 'The BR2 office lost the intranet after last night\'s routing change. BR1 is fine.',
    symptom: (n) => ({ text: 'BR2\'s users reach the intranet again', check: (w) => reachSrv(w, n, 'PC2') }),
    owns: () => ({ BR2: [ifRe('GigabitEthernet0/0')] }), fix: () => ({ BR2: ['enable', 'configure terminal', 'interface g0/0', 'ip ospf 1 area 0'] }),
    hint: 'show ip ospf neighbor on HQ: BR2 is missing. show ip ospf interface brief on both ends of that link and compare the Area column.' },
  { id: 'passive-transit', lights: ['t3-ospf', 't0-inspect'], says: 'BR1 can\'t reach anything at HQ since someone "secured" its OSPF.',
    symptom: (n) => ({ text: 'BR1\'s users reach the intranet again', check: (w) => reachSrv(w, n, 'PC1') }),
    owns: () => ({ BR1: [/^router ospf/] }), fix: () => ({ BR1: ['enable', 'configure terminal', 'router ospf 1', 'no passive-interface g0/0'] }),
    hint: 'A passive interface still advertises its subnet but sends no hellos, so no neighbor forms on it. show ip protocols on BR1 lists the passive interfaces.' },
  { id: 'lan-missing', lights: ['t3-ospf', 't3-forwarding'], says: 'Nobody at HQ or BR2 can reach the BR1 office. BR1\'s own users can still browse the intranet.',
    symptom: (n) => ({ text: 'HQ and BR2 reach BR1\'s LAN again', check: (w) => reach(w, 'PC2', addHost(n.netA, 20)) && reachSrv(w, n, 'PC1') }),
    owns: () => ({ BR1: [ifRe('GigabitEthernet0/1')] }), fix: () => ({ BR1: ['enable', 'configure terminal', 'interface g0/1', 'ip ospf 1 area 0'] }),
    hint: 'show ip route on HQ: there is no O route for BR1\'s LAN. Which interfaces does BR1 run OSPF on? show ip ospf interface brief.' },
  { id: 'dup-rid', lights: ['t3-ospf'], says: 'BR2 went dark after its router was replaced from a config template. BR1 is fine.',
    symptom: (n) => ({ text: 'BR2\'s users reach the intranet again', check: (w) => reachSrv(w, n, 'PC2') }),
    owns: () => ({ BR2: [/^router ospf/] }), fix: () => ({ BR2: ['enable', 'configure terminal', 'router ospf 1', 'router-id 3.3.3.3', 'end', 'clear ip ospf process', 'yes'] }),
    hint: 'show ip ospf on HQ and BR2, or show ip protocols: compare the router IDs. Two routers with one ID never become neighbors. A new router-id needs clear ip ospf process.' },
  { id: 'mask-mismatch', lights: ['t3-ospf', 't1-ipv4'], says: 'BR1 dropped off the network after its WAN interface was re-addressed.',
    symptom: (n) => ({ text: 'BR1\'s users reach the intranet again', check: (w) => reachSrv(w, n, 'PC1') }),
    owns: () => ({ BR1: [ifRe('GigabitEthernet0/0')] }), fix: (n) => ({ BR1: ['enable', 'configure terminal', 'interface g0/0', `ip address ${n.t1b} 255.255.255.252`] }),
    hint: 'OSPF neighbors must agree on the subnet mask. show ip interface brief and show running-config interface g0/0 on both ends of the link.' },
  { id: 'type-mismatch', lights: ['t3-ospf'], says: 'BR2 lost its routes after someone tuned OSPF on its WAN link.',
    symptom: (n) => ({ text: 'BR2\'s users reach the intranet again', check: (w) => reachSrv(w, n, 'PC2') }),
    owns: () => ({ BR2: [ifRe('GigabitEthernet0/0')] }), fix: () => ({ BR2: ['enable', 'configure terminal', 'interface g0/0', 'no ip ospf network point-to-point'] }),
    hint: 'show ip ospf interface brief on both ends: one side says P2P, the other DR or BDR. The network type has to match.' },
];

function finish(order, fault, n, extra) {
  const sym = fault.symptom(n);
  const owns = { ...fault.owns(n), ...(fault.ownsFn ? fault.ownsFn(n) : {}) };
  if (fault.ownsAny) owns[n.rtr] = [globalRe('access-list 1 ')];
  if (fault.poolFix) owns[n.rtr] = [/^ip dhcp pool /];
  if (fault.ownsSrv) owns[n.rtr] = [ifRe('GigabitEthernet0/2')];
  const fix = Object.fromEntries(Object.entries(fault.fix(n)).map(([d, lines]) => [d === 'R' ? n.rtr : d, lines]));
  return {
    ...order, ...extra, fault: fault.id, lights: fault.lights,
    summary: `Reported by ${order.requester}: "${fault.says}"`,
    requirements: [{ id: 'fix', text: sym.text, device: Object.keys(fix)[0], check: sym.check, owns, hint: fault.hint, show: fix }],
  };
}

export const REPAIR_TEMPLATES = [
  {
    kind: 'repair-branch',
    title: 'Trouble ticket: branch office',
    minutes: 12,
    faults: BRANCH_FAULTS,
    lights: [...new Set(BRANCH_FAULTS.flatMap(f => f.lights))],
    make(seed, { fault = null } = {}) {
      const rnd = rngOf(seed);
      const t = ticket(rnd, this.kind);
      const flt = BRANCH_FAULTS.find(f => f.id === fault) ?? pick(rnd, BRANCH_FAULTS);
      const n = branchNet(rnd);
      const setup = branchSetup(n, flt);
      const pc1 = { ip: addHost(n.netA, 20), mask: flt.id === 'pc-mask' ? '255.255.255.252' : M24, gateway: n.gwA };
      const pc2 = { ip: addHost(n.netB, 20), mask: M24, gateway: flt.id === 'pc-gateway' ? addHost(n.netB, 254) : n.gwB };
      return finish({ ...t, title: this.title, minutes: this.minutes, start: n.rtr }, flt, n, {
        devices: [
          { id: n.rtr, kind: 'router', x: 50, y: 12 }, { id: 'SW1', kind: 'switch', x: 26, y: 36 }, { id: 'ISP', kind: 'router', x: 86, y: 12 },
          { id: 'WEB', kind: 'pc', x: 88, y: 40, pc: { ip: n.web, mask: M24, gateway: '198.51.100.1', services: [80, 443] } },
          { id: 'SRV', kind: 'pc', x: 62, y: 40, pc: { ip: n.srv, mask: M24, gateway: addHost(n.srvNet, 1), services: [80, 22] } },
          { id: 'PC1', kind: 'pc', x: 9, y: 64, pc: pc1 }, { id: 'PC2', kind: 'pc', x: 27, y: 64, pc: pc2 }, { id: 'PC3', kind: 'pc', x: 45, y: 64, pc: { dhcp: true } },
        ],
        links: [L(n.rtr, 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'), L(n.rtr, 'GigabitEthernet0/1', 'ISP', 'GigabitEthernet0/0'), L('ISP', 'GigabitEthernet0/1', 'WEB', NIC),
          L(n.rtr, 'GigabitEthernet0/2', 'SRV', NIC), L('PC1', NIC, 'SW1', 'FastEthernet0/1'), L('PC2', NIC, 'SW1', 'FastEthernet0/2'), L('PC3', NIC, 'SW1', 'FastEthernet0/3')],
        setup, saved: [],
        notes: [`${n.na}: VLAN ${n.va}, ${n.netA}/24 (PC1; PC3 by DHCP)`, `${n.nb}: VLAN ${n.vb}, ${n.netB}/24 (PC2)`, `Intranet server ${n.srv}`, `Internet test site ${n.web}`, 'Router login: admin / Adm1n!pass'],
        tests: [
          { id: 'webA', text: `${n.na} reaches the web`, check: (w) => reach(w, 'PC1', n.web, { proto: 'tcp', port: 80 }) },
          { id: 'webB', text: `${n.nb} reaches the web`, check: (w) => reach(w, 'PC2', n.web, { proto: 'tcp', port: 80 }) },
          { id: 'dhcp', text: 'A DHCP client gets an address and reaches the web', check: (w) => renewReach(w, 'PC3', n.web, { proto: 'tcp', port: 80 }) },
          { id: 'intranet', text: 'The intranet site opens from both VLANs', check: (w) => reach(w, 'PC1', n.srv, { proto: 'tcp', port: 80 }) && reach(w, 'PC2', n.srv, { proto: 'tcp', port: 80 }) },
          { id: 'links', text: 'Every SW1 port negotiates cleanly, with no duplex mismatch', check: (w) => ['FastEthernet0/1', 'FastEthernet0/2', 'FastEthernet0/3', 'GigabitEthernet0/1'].every(p => !negotiate(w, 'SW1', p)?.mismatch) },
          { id: 'ssh', text: `The router takes SSH and refuses Telnet`, check: (w) => reach(w, 'PC1', n.gwA, { proto: 'tcp', port: 22 }) && !reach(w, 'PC1', n.gwA, { proto: 'tcp', port: 23 }) },
        ],
      });
    },
  },
  {
    kind: 'repair-campus',
    title: 'Trouble ticket: switch uplink',
    minutes: 10,
    faults: CAMPUS_FAULTS,
    lights: [...new Set(CAMPUS_FAULTS.flatMap(f => f.lights))],
    make(seed, { fault = null } = {}) {
      const rnd = rngOf(seed);
      const t = ticket(rnd, this.kind);
      const flt = CAMPUS_FAULTS.find(f => f.id === fault) ?? pick(rnd, CAMPUS_FAULTS);
      const [va, vb] = sample(rnd, [10, 20, 30, 40, 50, 60], 2).sort((a, b) => a - b);
      const [na, nb] = sample(rnd, VLAN_NAMES, 2);
      const [netA, netB] = nets(rnd, 2);
      const n = { va, vb, na, nb, netA, netB };
      const pc = (net, k) => ({ ip: addHost(net, k), mask: M24 });
      return finish({ ...t, title: this.title, minutes: this.minutes, start: 'ACC' }, flt, n, {
        devices: [
          { id: 'DIST', kind: 'switch', x: 50, y: 12 }, { id: 'ACC', kind: 'switch', x: 50, y: 42 },
          { id: 'PC1', kind: 'pc', x: 24, y: 62, pc: pc(netA, 11) }, { id: 'PC2', kind: 'pc', x: 76, y: 62, pc: pc(netB, 11) },
          { id: 'PC3', kind: 'pc', x: 20, y: 14, pc: pc(netA, 12) }, { id: 'PC4', kind: 'pc', x: 80, y: 14, pc: pc(netB, 12) },
        ],
        macs: { DIST: '0019.e8f0.0001', ACC: '0019.e8f0.0002' },
        links: [L('DIST', 'GigabitEthernet0/1', 'ACC', 'GigabitEthernet0/1'), L('DIST', 'GigabitEthernet0/2', 'ACC', 'GigabitEthernet0/2'),
          L('PC1', NIC, 'ACC', 'FastEthernet0/1'), L('PC2', NIC, 'ACC', 'FastEthernet0/2'), L('PC3', NIC, 'DIST', 'FastEthernet0/1'), L('PC4', NIC, 'DIST', 'FastEthernet0/2')],
        setup: campusSetup(n, flt), saved: [],
        notes: [`${na}: VLAN ${va} (PC1 on ACC, PC3 on DIST)`, `${nb}: VLAN ${vb} (PC2 on ACC, PC4 on DIST)`, 'Uplink standard: LACP channel 1, trunk, both VLANs'],
        tests: [
          { id: 'cross', text: 'Both VLANs work between the switches', check: (w) => crosses(w, n) },
          { id: 'bundle', text: 'Both uplinks are bundled', check: bundled },
          { id: 'stp', text: 'Nothing is blocked between DIST and ACC', check: (w) => !Object.values(l2Of(w).stp.ACC ?? {}).some(v => Object.values(v.ports).some(p => p.state === 'BLK')) },
        ],
      });
    },
  },
  {
    kind: 'repair-ospf',
    title: 'Trouble ticket: OSPF between sites',
    minutes: 12,
    faults: OSPF_FAULTS,
    lights: [...new Set(OSPF_FAULTS.flatMap(f => f.lights))],
    make(seed, { fault = null } = {}) {
      const rnd = rngOf(seed);
      const t = ticket(rnd, this.kind);
      const flt = OSPF_FAULTS.find(f => f.id === fault) ?? pick(rnd, OSPF_FAULTS);
      const [netA, netB, srvNet] = nets(rnd, 3);
      const x = int(rnd, 1, 250);
      const n = { netA, netB, srvNet, gwA: addHost(netA, 1), gwB: addHost(netB, 1), gwS: addHost(srvNet, 1), srv: addHost(srvNet, 10),
        t1h: `10.254.${x}.1`, t1b: `10.254.${x}.2`, t2h: `10.254.${x}.5`, t2b: `10.254.${x}.6`, wrongArea: pick(rnd, [1, 2, 10]), rtr: 'HQ' };
      return finish({ ...t, title: this.title, minutes: this.minutes, start: 'HQ' }, flt, n, {
        devices: [
          { id: 'HQ', kind: 'router', x: 50, y: 14 }, { id: 'BR1', kind: 'router', x: 20, y: 42 }, { id: 'BR2', kind: 'router', x: 80, y: 42 },
          { id: 'SRV', kind: 'pc', x: 50, y: 44, pc: { ip: n.srv, mask: M24, gateway: n.gwS, services: [80] } },
          { id: 'PC1', kind: 'pc', x: 20, y: 66, pc: { ip: addHost(netA, 20), mask: M24, gateway: n.gwA } },
          { id: 'PC2', kind: 'pc', x: 80, y: 66, pc: { ip: addHost(netB, 20), mask: M24, gateway: n.gwB } },
        ],
        links: [L('HQ', 'GigabitEthernet0/0', 'BR1', 'GigabitEthernet0/0'), L('HQ', 'GigabitEthernet0/1', 'BR2', 'GigabitEthernet0/0'), L('HQ', 'GigabitEthernet0/2', 'SRV', NIC),
          L('BR1', 'GigabitEthernet0/1', 'PC1', NIC), L('BR2', 'GigabitEthernet0/1', 'PC2', NIC)],
        setup: ospfSetup(n, flt), saved: [],
        notes: [`HQ–BR1 ${n.t1h.replace(/\.1$/, '.0')}/30, HQ–BR2 ${n.t2h.replace(/\.5$/, '.4')}/30`, `BR1 LAN ${netA}/24 (PC1), BR2 LAN ${netB}/24 (PC2)`, `Intranet server ${n.srv} at HQ`, 'Standard: OSPF process 1, area 0 everywhere, router IDs 1.1.1.1, 2.2.2.2, 3.3.3.3, LANs passive'],
        tests: [
          { id: 'br1', text: 'BR1 reaches the intranet', check: (w) => reachSrv(w, n, 'PC1') },
          { id: 'br2', text: 'BR2 reaches the intranet', check: (w) => reachSrv(w, n, 'PC2') },
          { id: 'cross', text: 'The two branches reach each other', check: (w) => reach(w, 'PC1', addHost(netB, 20)) },
        ],
      });
    },
  },
];

REPAIR_TEMPLATES.push(...IPV6_REPAIRS);

// Which branches a repair ticket can light, and a seed and fault for one.
export function repairFor(branchId, seed) {
  for (const t of REPAIR_TEMPLATES) {
    const faults = t.faults.filter(f => f.lights.includes(branchId));
    if (faults.length) return { kind: t.kind, seed, fault: faults[seed % faults.length].id };
  }
  return null;
}
