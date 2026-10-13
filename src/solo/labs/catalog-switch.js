// The switching labs: Do work orders on switches and PCs, built on the same
// IOS engine as the router labs. Each starts from a believable state (a box
// fresh from the factory, a flat network, a closet nobody labeled) and
// checks itself as the configuration lands.

import { makeDevice, makeSwitch, makePc, makeWorld, interfaceState, save, freshElections, l2Of } from './world.js';
import { createSession, execute, normalizeInterface } from './ios.js';
import { operMode, memberFlag } from './switching.js';
import { parseIp } from './ip4.js';

const G3 = ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2'];
const ip = parseIp;
const L = (id, a, ai, b, bi) => ({ id, ends: [[a, ai], [b, bi]] });
const NIC = 'FastEthernet0';

function build({ devices, links, switches = [], pcs = {}, macs = {}, setup = {}, saved = [] }) {
  const make = (id) => (switches.includes(id) ? makeSwitch(id, { mac: macs[id] ?? null })
    : pcs[id] ? makePc(id, pcs[id]) : makeDevice(id, G3));
  const world = makeWorld(devices.map(make), links);
  for (const [id, lines] of Object.entries(setup)) {
    const s = createSession(world, id);
    for (const l of ['enable', 'configure terminal', ...lines, 'end']) execute(s, l);
  }
  for (const id of saved) save(world, id);
  freshElections(world);
  world.seq = 0;
  world.learned = {};
  return world;
}

const pc = (addr, gateway = null) => ({ ip: addr, mask: '255.255.255.0', gateway });

// ---------- checks ----------
const dev = (c, d) => c.world.devices[d].config;
const port = (c, d, n) => dev(c, d).interfaces[n];
const sw = (c, d, n) => port(c, d, n)?.sw;
const isUp = (c, d, n) => interfaceState(c.world, d, n).up;
const events = (c, d) => c.events.filter(e => !d || e.device === d);
const ran = (c, d, key, after = 0) => events(c, d).some(e => e.kind === 'command' && e.key === key && e.seq > after);
const lastSeq = (c, pred) => Math.max(0, ...c.events.filter(pred).map(e => e.seq));
const pinged = (c, d, dst, after = 0) => events(c, d).some(e => e.kind === 'ping' && e.ok && e.dst === ip(dst) && e.seq > after);
const pingFailed = (c, d, dst, after = 0) => events(c, d).some(e => e.kind === 'ping' && !e.ok && e.dst === ip(dst) && e.seq > after);
const traced = (c, d, dst) => events(c, d).some(e => e.kind === 'trace' && e.ok && e.dst === ip(dst));
const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
const isPort = (want) => (text) => normalizeInterface(String(text ?? '').trim()) === want;
const says = (...ok) => (text) => ok.includes(String(text ?? '').trim().toLowerCase());
const range = (a, b, prefix = 'FastEthernet0/') => Array.from({ length: b - a + 1 }, (_, k) => `${prefix}${a + k}`);

export const SWITCH_LABS = [
  // ---------------------------------------------------------------- first switch
  {
    id: 'sw-first-boot',
    title: 'Rack a new access switch',
    lights: ['t5-access', 't0-base'],
    story: 'A new access switch is racked in the closet and patched to the branch router on its Gi0/1. It is exactly as it left the box: no name, no passwords, no address. Make it manageable, then save it.',
    start: 'ACC1',
    devices: ['ACC1', 'R1'],
    links: [L('up', 'ACC1', 'GigabitEthernet0/1', 'R1', 'GigabitEthernet0/0')],
    topology: 'ACC1 Gi0/1 ── Gi0/0 R1 (10.20.1.1/24)',
    build() {
      return build({ devices: this.devices, links: this.links, switches: ['ACC1'], setup: { R1: ['hostname R1', 'interface g0/0', 'ip address 10.20.1.1 255.255.255.0', 'no shutdown'] }, saved: ['R1'] });
    },
    goals: [
      { id: 'hostname', text: 'Name the switch ACC1', check: (c) => dev(c, 'ACC1').hostname === 'ACC1',
        hint: 'hostname, in global configuration. The prompt changes as soon as it takes.', show: { ACC1: ['enable', 'configure terminal', 'hostname ACC1'] } },
      { id: 'secret', text: 'Protect privileged mode with an enable secret', check: (c) => Boolean(dev(c, 'ACC1').enableSecret),
        hint: 'enable secret, not enable password: the secret is stored hashed.', show: { ACC1: ['enable secret Cl0set!'] } },
      { id: 'console', text: 'Require a password on the console', check: (c) => Boolean(dev(c, 'ACC1').lines.con.password) && dev(c, 'ACC1').lines.con.login === 'line',
        hint: 'line console 0, then password, then login. Without login, the password is never asked for.', show: { ACC1: ['line console 0', 'password C0nsole!', 'login'] } },
      { id: 'vty', text: 'Require a password on all 16 VTY lines', check: (c) => Boolean(dev(c, 'ACC1').lines.vty.password) && ['line', 'local'].includes(dev(c, 'ACC1').lines.vty.login),
        hint: 'A switch has 16 VTY lines, 0 to 15. Configure them all at once.', show: { ACC1: ['line vty 0 15', 'password Vty!pass', 'login'] } },
      { id: 'mgmt', text: 'Give VLAN 1 the management address 10.20.1.2/24 and bring it up', check: (c) => port(c, 'ACC1', 'Vlan1').ip === ip('10.20.1.2') && port(c, 'ACC1', 'Vlan1').mask === ip('255.255.255.0') && isUp(c, 'ACC1', 'Vlan1'),
        hint: 'A layer 2 switch has no routed ports. Its address lives on a VLAN interface, an SVI. Vlan1 ships shut down, like a router port.', show: { ACC1: ['interface vlan 1', 'ip address 10.20.1.2 255.255.255.0', 'no shutdown'] } },
      { id: 'gateway', text: 'Point the switch at R1 (10.20.1.1) as its default gateway', check: (c) => dev(c, 'ACC1').defaultGateway === ip('10.20.1.1'),
        hint: 'A switch that does not route needs ip default-gateway, the same idea as a PC\'s gateway. It is a global command.', show: { ACC1: ['exit', 'ip default-gateway 10.20.1.1'] } },
      { id: 'ping', text: 'Ping R1 from the switch', check: (c) => pinged(c, 'ACC1', '10.20.1.1'),
        hint: 'From configuration mode, put do in front of ping.', show: { ACC1: ['do ping 10.20.1.1'] } },
      { id: 'save', text: 'Save the configuration', check: (c) => c.world.devices.ACC1.startup?.hostname === 'ACC1' && Boolean(c.world.devices.ACC1.startup?.defaultGateway),
        hint: 'copy running-config startup-config from privileged EXEC, then Enter to accept the file name.', show: { ACC1: ['end', 'copy running-config startup-config', ''] } },
    ],
  },

  // ---------------------------------------------------------------- MAC learning
  {
    id: 'sw-mac-table',
    title: 'Watch a switch learn',
    lights: ['t1-switching'],
    story: 'SW1 has just booted. Every port is in VLAN 1 and nothing has talked yet. Watch its MAC address table fill as traffic flows, then use the table to find which port a PC is on.',
    start: 'SW1',
    devices: ['SW1', 'PC1', 'PC2', 'PC3'],
    links: [L('p1', 'PC1', NIC, 'SW1', 'FastEthernet0/3'), L('p2', 'PC2', NIC, 'SW1', 'FastEthernet0/7'), L('p3', 'PC3', NIC, 'SW1', 'FastEthernet0/12')],
    topology: 'PC1, PC2 and PC3 on SW1 (which ports? the table will say). 192.168.5.11, .12, .13 /24',
    build() {
      return build({ devices: this.devices, links: this.links, switches: ['SW1'], pcs: { PC1: pc('192.168.5.11'), PC2: pc('192.168.5.12'), PC3: pc('192.168.5.13') }, setup: { SW1: ['hostname SW1'] } });
    },
    goals: [
      { id: 'empty', text: 'Look at SW1\'s MAC address table before anyone talks', check: (c) => ran(c, 'SW1', 'show mac address-table'),
        hint: 'show mac address-table, from privileged EXEC. Only the switch\'s own CPU entries are there yet.', show: { SW1: ['enable', 'show mac address-table'] } },
      { id: 'talk', text: 'From PC1, ping PC2 at 192.168.5.12', check: (c) => pinged(c, 'PC1', '192.168.5.12'),
        hint: 'Open PC1\'s tab and ping from its command prompt.', show: { PC1: ['ping 192.168.5.12'] } },
      { id: 'again', text: 'Look at the table again', check: (c) => ran(c, 'SW1', 'show mac address-table', lastSeq(c, e => e.kind === 'ping' && e.ok)),
        hint: 'Same command on SW1. Two dynamic entries now: one for each PC that sent a frame.', show: { SW1: ['show mac address-table'] } },
      { id: 'mac', text: 'Find PC2\'s own MAC address on PC2', check: (c) => ran(c, 'PC2', 'ipconfig'),
        hint: 'ipconfig /all shows the Physical Address. Windows writes it 00-50-79-..., Cisco writes the same digits as 0050.79xx.xxxx.', show: { PC2: ['ipconfig /all'] } },
      { id: 'where', text: 'Which SW1 port is PC2 on?', ask: 'Port, like Fa0/1', check: (c) => isPort('FastEthernet0/7')(c.answers.where),
        hint: 'Match PC2\'s MAC to a line in the table. The Ports column is your answer.', show: { SW1: ['show mac address-table'] } },
      { id: 'pc3', text: 'PC3 is not in the table. Make it talk: ping PC1 from PC3', check: (c) => pinged(c, 'PC3', '192.168.5.11'),
        hint: 'A switch learns a MAC from the source address of frames it receives. PC3 has sent nothing yet.', show: { PC3: ['ping 192.168.5.11'] } },
      { id: 'clear', text: 'Clear the learned entries and confirm the table is empty again', check: (c) => {
        const cleared = lastSeq(c, e => e.device === 'SW1' && e.kind === 'clear-mac');
        return cleared > 0 && ran(c, 'SW1', 'show mac address-table', cleared);
      }, hint: 'clear mac address-table dynamic, then look again.', show: { SW1: ['clear mac address-table dynamic', 'show mac address-table'] } },
    ],
  },

  // ---------------------------------------------------------------- VLANs
  {
    id: 'sw-vlans',
    title: 'Carve the VLANs',
    lights: ['t2-vlans'],
    story: 'Sales (PC1, PC2) and Engineering (PC3, PC4) share one flat switch, so every broadcast from one team reaches the other. Split them into two VLANs. The PCs keep their addresses for now: in production each VLAN gets its own subnet, but one shared subnet makes the cut easy to see.',
    start: 'SW1',
    devices: ['SW1', 'PC1', 'PC2', 'PC3', 'PC4'],
    links: [1, 2, 3, 4].map(n => L(`p${n}`, `PC${n}`, NIC, 'SW1', `FastEthernet0/${n}`)),
    topology: 'PC1 Fa0/1, PC2 Fa0/2 (Sales) · PC3 Fa0/3, PC4 Fa0/4 (Engineering) · all 10.0.10.x/24',
    build() {
      return build({ devices: this.devices, links: this.links, switches: ['SW1'], pcs: { PC1: pc('10.0.10.11'), PC2: pc('10.0.10.12'), PC3: pc('10.0.10.13'), PC4: pc('10.0.10.14') }, setup: { SW1: ['hostname SW1'] } });
    },
    goals: [
      { id: 'create', text: 'Create VLAN 10 named SALES and VLAN 20 named ENG', check: (c) => dev(c, 'SW1').vlans[10]?.name === 'SALES' && dev(c, 'SW1').vlans[20]?.name === 'ENG',
        hint: 'vlan 10 enters VLAN configuration; name SALES names it. Then the same for 20.', show: { SW1: ['enable', 'configure terminal', 'vlan 10', 'name SALES', 'vlan 20', 'name ENG'] } },
      { id: 'sales', text: 'Make Fa0/1 and Fa0/2 access ports in VLAN 10', check: (c) => ['FastEthernet0/1', 'FastEthernet0/2'].every(n => sw(c, 'SW1', n).mode === 'access' && sw(c, 'SW1', n).access === 10),
        hint: 'interface range does both ports at once. switchport mode access fixes the port as an access port; switchport access vlan picks the VLAN.', show: { SW1: ['interface range f0/1 - 2', 'switchport mode access', 'switchport access vlan 10'] } },
      { id: 'eng', text: 'Make Fa0/3 and Fa0/4 access ports in VLAN 20', check: (c) => ['FastEthernet0/3', 'FastEthernet0/4'].every(n => sw(c, 'SW1', n).mode === 'access' && sw(c, 'SW1', n).access === 20),
        hint: 'Same pattern, other range, other VLAN.', show: { SW1: ['interface range f0/3 - 4', 'switchport mode access', 'switchport access vlan 20'] } },
      { id: 'verify', text: 'Check the result with show vlan brief', check: (c) => ['FastEthernet0/3', 'FastEthernet0/4'].every(n => sw(c, 'SW1', n).access === 20) && ran(c, 'SW1', 'show vlan brief', lastSeq(c, e => e.key === 'switchport access vlan')),
        hint: 'From configuration mode, do show vlan brief.', show: { SW1: ['do show vlan brief'] } },
      { id: 'inside', text: 'From PC1, ping PC2 (same VLAN): it should work', check: (c) => pinged(c, 'PC1', '10.0.10.12', lastSeq(c, e => e.key === 'switchport access vlan')),
        hint: 'Same VLAN, same switch: one broadcast domain.', show: { PC1: ['ping 10.0.10.12'] } },
      { id: 'across', text: 'From PC1, ping PC3 (other VLAN): it should fail', check: (c) => pingFailed(c, 'PC1', '10.0.10.13', lastSeq(c, e => e.key === 'switchport access vlan')),
        hint: 'Same subnet, different VLAN. The ARP broadcast for PC3 never leaves VLAN 10.', show: { PC1: ['ping 10.0.10.13'] } },
    ],
  },

  // ---------------------------------------------------------------- trunks
  {
    id: 'sw-trunk',
    title: 'Trunk between two switches',
    lights: ['t2-trunks'],
    story: 'SALES (10) and ENG (20) exist on both switches and every PC is in the right VLAN, but PC1 cannot reach PC2 on the other switch. The cable between the switches is still on its factory setting.',
    start: 'SW1',
    devices: ['SW1', 'SW2', 'PC1', 'PC2', 'PC3', 'PC4'],
    links: [
      L('up', 'SW1', 'GigabitEthernet0/1', 'SW2', 'GigabitEthernet0/1'),
      L('p1', 'PC1', NIC, 'SW1', 'FastEthernet0/1'), L('p3', 'PC3', NIC, 'SW1', 'FastEthernet0/2'),
      L('p2', 'PC2', NIC, 'SW2', 'FastEthernet0/1'), L('p4', 'PC4', NIC, 'SW2', 'FastEthernet0/2'),
    ],
    topology: 'SW1 Gi0/1 ── Gi0/1 SW2 · VLAN 10: PC1 (SW1), PC2 (SW2) 10.0.10.x · VLAN 20: PC3 (SW1), PC4 (SW2) 10.0.20.x',
    build() {
      const base = ['vlan 10', 'name SALES', 'vlan 20', 'name ENG', 'interface f0/1', 'switchport mode access', 'switchport access vlan 10', 'interface f0/2', 'switchport mode access', 'switchport access vlan 20'];
      return build({ devices: this.devices, links: this.links, switches: ['SW1', 'SW2'], macs: { SW1: '0019.e811.0001', SW2: '0019.e811.0002' },
        pcs: { PC1: pc('10.0.10.11'), PC2: pc('10.0.10.12'), PC3: pc('10.0.20.11'), PC4: pc('10.0.20.12') },
        setup: { SW1: ['hostname SW1', ...base], SW2: ['hostname SW2', ...base] } });
    },
    goals: [
      { id: 'look', text: 'See what DTP made of the uplink: show interfaces g0/1 switchport on SW1', check: (c) => ran(c, 'SW1', 'show interfaces switchport'),
        hint: 'The Operational Mode line is what the port ended up as.', show: { SW1: ['enable', 'show interfaces g0/1 switchport'] } },
      { id: 'mode', text: 'What is Gi0/1\'s operational mode right now?', ask: 'Copy it from the output', check: (c) => says('static access', 'access')(c.answers.mode),
        hint: 'Two dynamic auto ports each wait for the other to ask. Neither asks, so the link stays an access link in VLAN 1.', show: { SW1: ['show interfaces g0/1 switchport'] } },
      { id: 'trunk1', text: 'Make SW1 Gi0/1 a trunk', check: (c) => sw(c, 'SW1', 'GigabitEthernet0/1').mode === 'trunk',
        hint: 'switchport mode trunk on the interface.', show: { SW1: ['configure terminal', 'interface g0/1', 'switchport mode trunk'] } },
      { id: 'dtp', text: 'On SW2, check whether its side trunked on its own', check: (c) => ran(c, 'SW2', 'show interfaces trunk') && operMode(c.world, 'SW2', 'GigabitEthernet0/1') === 'trunk',
        hint: 'show interfaces trunk on SW2. A trunk port sends DTP, and dynamic auto answers it.', show: { SW2: ['enable', 'show interfaces trunk'] } },
      { id: 'trunk2', text: 'Make SW2 Gi0/1 a trunk too, so it does not depend on DTP', check: (c) => sw(c, 'SW2', 'GigabitEthernet0/1').mode === 'trunk',
        hint: 'Static on both ends is the safe build.', show: { SW2: ['configure terminal', 'interface g0/1', 'switchport mode trunk'] } },
      { id: 'allowed', text: 'Allow only VLANs 10 and 20 on the trunk, both ends', check: (c) => ['SW1', 'SW2'].every(d => sameList(sw(c, d, 'GigabitEthernet0/1').allowed, [10, 20])),
        hint: 'switchport trunk allowed vlan 10,20 replaces the list. Do it on each switch.', show: { SW1: ['switchport trunk allowed vlan 10,20'], SW2: ['switchport trunk allowed vlan 10,20'] } },
      { id: 'native', text: 'Move the native VLAN to 99 on both ends (create VLAN 99 first)', check: (c) => ['SW1', 'SW2'].every(d => dev(c, d).vlans[99] && sw(c, d, 'GigabitEthernet0/1').native === 99),
        hint: 'Do both ends. In between, CDP logs a native VLAN mismatch: that is the warning you would chase on a live network.', show: { SW1: ['vlan 99', 'name NATIVE', 'interface g0/1', 'switchport trunk native vlan 99'], SW2: ['vlan 99', 'name NATIVE', 'interface g0/1', 'switchport trunk native vlan 99'] } },
      { id: 'ping', text: 'From PC1 ping PC2, and from PC3 ping PC4', check: (c) => pinged(c, 'PC1', '10.0.10.12') && pinged(c, 'PC3', '10.0.20.12'),
        hint: 'Each pair is in one VLAN on two switches. The trunk carries both.', show: { PC1: ['ping 10.0.10.12'], PC3: ['ping 10.0.20.12'] } },
      { id: 'add', text: 'Engineering wants VLAN 30 on the trunk too. Add it on both ends without dropping 10 and 20', check: (c) => ['SW1', 'SW2'].every(d => sameList(sw(c, d, 'GigabitEthernet0/1').allowed, [10, 20, 30])),
        hint: 'switchport trunk allowed vlan 30 would replace the list and cut off Sales and Engineering. The add keyword appends.', show: { SW1: ['interface g0/1', 'switchport trunk allowed vlan add 30'], SW2: ['interface g0/1', 'switchport trunk allowed vlan add 30'] } },
    ],
  },

  // ---------------------------------------------------------------- router on a stick
  {
    id: 'sw-roas',
    title: 'Route between VLANs on one cable',
    lights: ['t2-trunks', 't3-table'],
    story: 'Sales (VLAN 10) and Engineering (VLAN 20) are split on SW1 and cannot reach each other. R1 has a single cable to SW1. Make that one cable carry both VLANs and give R1 a gateway address in each: router on a stick.',
    start: 'SW1',
    devices: ['SW1', 'R1', 'PC1', 'PC2'],
    links: [L('stick', 'R1', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'), L('p1', 'PC1', NIC, 'SW1', 'FastEthernet0/1'), L('p2', 'PC2', NIC, 'SW1', 'FastEthernet0/2')],
    topology: 'R1 Gi0/0 ── Gi0/1 SW1 · PC1 Fa0/1 VLAN 10 (10.0.10.11, gw .1) · PC2 Fa0/2 VLAN 20 (10.0.20.11, gw .1)',
    build() {
      return build({ devices: this.devices, links: this.links, switches: ['SW1'], pcs: { PC1: pc('10.0.10.11', '10.0.10.1'), PC2: pc('10.0.20.11', '10.0.20.1') },
        setup: { SW1: ['hostname SW1', 'vlan 10', 'name SALES', 'vlan 20', 'name ENG', 'interface f0/1', 'switchport mode access', 'switchport access vlan 10', 'interface f0/2', 'switchport mode access', 'switchport access vlan 20'], R1: ['hostname R1'] } });
    },
    goals: [
      { id: 'trunk', text: 'Make SW1 Gi0/1, toward R1, a trunk', check: (c) => sw(c, 'SW1', 'GigabitEthernet0/1').mode === 'trunk',
        hint: 'A router does not speak DTP, so the switch end has to be a trunk by configuration.', show: { SW1: ['enable', 'configure terminal', 'interface g0/1', 'switchport mode trunk'] } },
      { id: 'up', text: 'Bring up R1 Gi0/0', check: (c) => isUp(c, 'R1', 'GigabitEthernet0/0'),
        hint: 'The physical interface needs no address, just no shutdown. Subinterfaces inherit its state.', show: { R1: ['enable', 'configure terminal', 'interface g0/0', 'no shutdown'] } },
      { id: 'sub10', text: 'Create Gi0/0.10 for VLAN 10 with 10.0.10.1/24', check: (c) => port(c, 'R1', 'GigabitEthernet0/0.10')?.encap?.vlan === 10 && port(c, 'R1', 'GigabitEthernet0/0.10').ip === ip('10.0.10.1'),
        hint: 'interface g0/0.10, then encapsulation dot1q 10 before the address. IOS refuses the address until the subinterface knows its VLAN.', show: { R1: ['interface g0/0.10', 'encapsulation dot1q 10', 'ip address 10.0.10.1 255.255.255.0'] } },
      { id: 'sub20', text: 'Create Gi0/0.20 for VLAN 20 with 10.0.20.1/24', check: (c) => port(c, 'R1', 'GigabitEthernet0/0.20')?.encap?.vlan === 20 && port(c, 'R1', 'GigabitEthernet0/0.20').ip === ip('10.0.20.1'),
        hint: 'The subinterface number does not have to match the VLAN, but matching keeps it readable. The encapsulation line is what counts.', show: { R1: ['interface g0/0.20', 'encapsulation dot1q 20', 'ip address 10.0.20.1 255.255.255.0'] } },
      { id: 'table', text: 'Check R1\'s routing table: a connected route for each VLAN', check: (c) => ran(c, 'R1', 'show ip route', lastSeq(c, e => e.device === 'R1' && e.key === 'ip address')),
        hint: 'do show ip route. Each subinterface brings a C and an L line.', show: { R1: ['do show ip route'] } },
      { id: 'ping', text: 'From PC1, ping PC2 across the router', check: (c) => pinged(c, 'PC1', '10.0.20.11'),
        hint: 'PC1 sends to its gateway, 10.0.10.1, tagged VLAN 10 on the trunk; R1 routes it out .20, tagged VLAN 20.', show: { PC1: ['ping 10.0.20.11'] } },
      { id: 'trace', text: 'tracert from PC1 to PC2: R1 shows as the one hop between', check: (c) => traced(c, 'PC1', '10.0.20.11'),
        hint: 'tracert on a Windows prompt, traceroute on IOS.', show: { PC1: ['tracert 10.0.20.11'] } },
    ],
  },

  // ---------------------------------------------------------------- EtherChannel
  {
    id: 'sw-etherchannel',
    title: 'Bundle the uplinks',
    lights: ['t2-etherchannel'],
    story: 'SW1 and SW2 are joined by two trunks, but spanning tree blocks one of them to stop a loop, so half the bandwidth sits idle. Bundle both links into one LACP EtherChannel so both carry traffic.',
    start: 'SW2',
    devices: ['SW1', 'SW2', 'PC1', 'PC2'],
    links: [
      L('u1', 'SW1', 'GigabitEthernet0/1', 'SW2', 'GigabitEthernet0/1'), L('u2', 'SW1', 'GigabitEthernet0/2', 'SW2', 'GigabitEthernet0/2'),
      L('p1', 'PC1', NIC, 'SW1', 'FastEthernet0/1'), L('p2', 'PC2', NIC, 'SW2', 'FastEthernet0/1'),
    ],
    topology: 'SW1 Gi0/1 ══ Gi0/1 SW2 and Gi0/2 ══ Gi0/2 (two trunks) · PC1 on SW1, PC2 on SW2, 10.0.1.x/24',
    build() {
      const up = ['interface range g0/1 - 2', 'switchport mode trunk'];
      return build({ devices: this.devices, links: this.links, switches: ['SW1', 'SW2'], macs: { SW1: '0019.e822.0001', SW2: '0019.e822.0002' },
        pcs: { PC1: pc('10.0.1.11'), PC2: pc('10.0.1.12') }, setup: { SW1: ['hostname SW1', ...up], SW2: ['hostname SW2', ...up] } });
    },
    goals: [
      { id: 'look', text: 'Show spanning tree on SW2', check: (c) => ran(c, 'SW2', 'show spanning-tree'),
        hint: 'show spanning-tree lists each port\'s role and state.', show: { SW2: ['enable', 'show spanning-tree'] } },
      { id: 'blocked', text: 'Which SW2 port is blocking?', ask: 'Port, like Gi0/1', check: (c) => isPort('GigabitEthernet0/2')(c.answers.blocked),
        hint: 'Look for Altn BLK in the table.', show: { SW2: ['show spanning-tree'] } },
      { id: 'sw1', text: 'On SW1, put Gi0/1 and Gi0/2 in channel group 1 with LACP active', check: (c) => ['GigabitEthernet0/1', 'GigabitEthernet0/2'].every(n => sw(c, 'SW1', n).channel?.group === 1 && sw(c, 'SW1', n).channel.mode === 'active'),
        hint: 'interface range g0/1 - 2, then channel-group 1 mode active. IOS creates Port-channel 1 for you.', show: { SW1: ['enable', 'configure terminal', 'interface range g0/1 - 2', 'channel-group 1 mode active'] } },
      { id: 'sw2', text: 'On SW2, the same group with LACP passive', check: (c) => ['GigabitEthernet0/1', 'GigabitEthernet0/2'].every(n => sw(c, 'SW2', n).channel?.group === 1 && sw(c, 'SW2', n).channel.mode === 'passive'),
        hint: 'Passive answers LACP but never starts it. Active on one end is enough.', show: { SW2: ['configure terminal', 'interface range g0/1 - 2', 'channel-group 1 mode passive'] } },
      { id: 'bundled', text: 'Confirm both ports are bundled: (P) in show etherchannel summary', check: (c) => ['GigabitEthernet0/1', 'GigabitEthernet0/2'].every(n => memberFlag(c.world, 'SW1', n) === 'P') && ran(c, 'SW1', 'show etherchannel summary'),
        hint: 'P means bundled; I means stand-alone (no LACP partner); s means suspended (settings do not match).', show: { SW1: ['do show etherchannel summary'] } },
      { id: 'stp', text: 'Show spanning tree on SW2 again: one Po1 port, nothing blocked', check: (c) => {
        const after = lastSeq(c, e => e.key === 'channel-group');
        const ports = Object.values(l2Of(c.world).stp.SW2?.[1]?.ports ?? {});
        return ran(c, 'SW2', 'show spanning-tree', after) && ports.length > 0 && !ports.some(p => p.state === 'BLK');
      }, hint: 'Spanning tree sees the bundle as one link, so there is no loop to break.', show: { SW2: ['do show spanning-tree'] } },
      { id: 'ping', text: 'From PC1 ping PC2 across the bundle', check: (c) => pinged(c, 'PC1', '10.0.1.12', lastSeq(c, e => e.key === 'channel-group')),
        hint: 'Traffic is shared across both member links now.', show: { PC1: ['ping 10.0.1.12'] } },
    ],
  },

  // ---------------------------------------------------------------- spanning tree
  {
    id: 'sw-stp',
    title: 'Put the root bridge where it belongs',
    lights: ['t2-stp'],
    story: 'Nobody set spanning-tree priorities, so the switch with the lowest MAC address won the root election: ACC1, an access switch in a closet. Traffic between the two distribution switches now detours through it. Make DIST1 the root, DIST2 the backup, and tidy the edge.',
    start: 'DIST1',
    devices: ['DIST1', 'DIST2', 'ACC1', 'PC1'],
    links: [
      L('d1d2', 'DIST1', 'GigabitEthernet0/1', 'DIST2', 'GigabitEthernet0/1'),
      L('d1a', 'DIST1', 'GigabitEthernet0/2', 'ACC1', 'GigabitEthernet0/1'),
      L('d2a', 'DIST2', 'GigabitEthernet0/2', 'ACC1', 'GigabitEthernet0/2'),
      L('p1', 'PC1', NIC, 'ACC1', 'FastEthernet0/1'),
    ],
    topology: 'Triangle: DIST1 Gi0/1 ── Gi0/1 DIST2 · DIST1 Gi0/2 ── Gi0/1 ACC1 · DIST2 Gi0/2 ── Gi0/2 ACC1 · PC1 on ACC1 Fa0/1',
    build() {
      const trunks = ['interface range g0/1 - 2', 'switchport mode trunk'];
      return build({ devices: this.devices, links: this.links, switches: ['DIST1', 'DIST2', 'ACC1'],
        macs: { ACC1: '0019.e833.0001', DIST2: '0019.e833.0002', DIST1: '0019.e833.0003' }, pcs: { PC1: pc('10.0.1.11') },
        setup: { DIST1: ['hostname DIST1', ...trunks], DIST2: ['hostname DIST2', ...trunks], ACC1: ['hostname ACC1', ...trunks, 'interface f0/1', 'switchport mode access'] } });
    },
    goals: [
      { id: 'look', text: 'Show spanning tree on DIST1', check: (c) => ran(c, 'DIST1', 'show spanning-tree'),
        hint: 'The Root ID block is the root bridge; the Bridge ID block is DIST1 itself.', show: { DIST1: ['enable', 'show spanning-tree'] } },
      { id: 'who', text: 'Which switch is the root bridge right now?', ask: 'Hostname', check: (c) => says('acc1')(c.answers.who),
        hint: 'DIST1\'s root port, and the root\'s MAC, both point at the switch on Gi0/2. The topology says who that is.', show: { DIST1: ['show spanning-tree'] } },
      { id: 'primary', text: 'Make DIST1 the root bridge for VLAN 1', check: (c) => l2Of(c.world).stp.DIST1?.[1]?.rootId === 'DIST1',
        hint: 'spanning-tree vlan 1 root primary sets a priority low enough to win (24576, or lower if needed).', show: { DIST1: ['configure terminal', 'spanning-tree vlan 1 root primary'] } },
      { id: 'secondary', text: 'Make DIST2 the backup root', check: (c) => (dev(c, 'DIST2').stp.prio[1] ?? 32768) < 32768 && l2Of(c.world).stp.DIST1?.[1]?.rootId === 'DIST1',
        hint: 'root secondary sets 28672: lower than the default, higher than the root.', show: { DIST2: ['enable', 'configure terminal', 'spanning-tree vlan 1 root secondary'] } },
      { id: 'blocked', text: 'Which port blocks now? (switch and port)', ask: 'Like DIST2 Gi0/1', check: (c) => {
        const a = String(c.answers.blocked ?? '').trim();
        const m = /^(\S+)\s+(.+)$/.exec(a);
        return Boolean(m) && m[1].toLowerCase() === 'acc1' && normalizeInterface(m[2]) === 'GigabitEthernet0/2';
      }, hint: 'Check ACC1 and DIST2. On the DIST2 to ACC1 link both ends are 4 from the root; the lower bridge ID, DIST2, wins that link, so ACC1\'s end blocks.', show: { ACC1: ['enable', 'show spanning-tree'] } },
      { id: 'rapid', text: 'Switch all three to Rapid PVST+', check: (c) => ['DIST1', 'DIST2', 'ACC1'].every(d => dev(c, d).stp.mode === 'rapid-pvst'),
        hint: 'spanning-tree mode rapid-pvst, in global configuration on each switch.', show: { DIST1: ['spanning-tree mode rapid-pvst'], DIST2: ['spanning-tree mode rapid-pvst'], ACC1: ['enable', 'configure terminal', 'spanning-tree mode rapid-pvst'] } },
      { id: 'edge', text: 'On ACC1, make Fa0/1 (PC1) an edge port with BPDU Guard', check: (c) => sw(c, 'ACC1', 'FastEthernet0/1').portfast && sw(c, 'ACC1', 'FastEthernet0/1').bpduguard === 'enable',
        hint: 'PortFast skips listening and learning on a host port; BPDU Guard shuts the port if a switch ever shows up there.', show: { ACC1: ['interface f0/1', 'spanning-tree portfast', 'spanning-tree bpduguard enable'] } },
    ],
  },

  // ---------------------------------------------------------------- port security
  {
    id: 'sw-portsec',
    title: 'Lock down the edge ports',
    lights: ['t5-l2sec'],
    story: 'Policy says one device per desk port. PC1 sits on Fa0/1. Under the desk on Fa0/2 someone plugged in a small unmanaged switch with two PCs behind it. Lock the ports down, watch what port security does to Fa0/2, then deal with it.',
    start: 'SW1',
    devices: ['SW1', 'PC1', 'PC2', 'PC3'],
    links: [L('p1', 'PC1', NIC, 'SW1', 'FastEthernet0/1'), { id: 'desk', segment: true, ends: [['PC2', NIC], ['PC3', NIC], ['SW1', 'FastEthernet0/2']] }],
    topology: 'PC1 ── Fa0/1 SW1 · SW1 Fa0/2 ── desk switch ── PC2, PC3 · VLAN 10, 10.0.10.x/24',
    build() {
      return build({ devices: this.devices, links: this.links, switches: ['SW1'], pcs: { PC1: pc('10.0.10.11'), PC2: pc('10.0.10.12'), PC3: pc('10.0.10.13') },
        setup: { SW1: ['hostname SW1', 'vlan 10', 'name STAFF', 'interface range f0/1 - 2', 'switchport mode access', 'switchport access vlan 10'] } });
    },
    goals: [
      { id: 'psec1', text: 'Turn on port security on Fa0/1 and let it learn PC1\'s MAC as sticky', check: (c) => sw(c, 'SW1', 'FastEthernet0/1').psec.on && sw(c, 'SW1', 'FastEthernet0/1').psec.sticky,
        hint: 'switchport port-security turns it on (default: 1 MAC, shut down on violation). mac-address sticky writes what it learns into the running config.', show: { SW1: ['enable', 'configure terminal', 'interface f0/1', 'switchport port-security', 'switchport port-security mac-address sticky'] } },
      { id: 'see', text: 'Find the sticky MAC in the running config', check: (c) => ran(c, 'SW1', 'show running-config', lastSeq(c, e => e.key === 'switchport port-security mac-address sticky')),
        hint: 'do show running-config, under interface FastEthernet0/1.', show: { SW1: ['do show running-config'] } },
      { id: 'psec2', text: 'Turn on port security on Fa0/2 the same way', check: (c) => sw(c, 'SW1', 'FastEthernet0/2').psec.on,
        hint: 'Enter Fa0/2 and enable it. Watch the console.', show: { SW1: ['interface f0/2', 'switchport port-security'] } },
      { id: 'state', text: 'What state is Fa0/2 in now?', ask: 'Status word', check: (c) => says('err-disabled', 'errdisabled', 'err disabled')(c.answers.state),
        hint: 'show interfaces status has a Status column.', show: { SW1: ['do show interfaces status'] } },
      { id: 'fix', text: 'Both PCs are approved. Allow 2 MACs on Fa0/2 and bring the port back', check: (c) => sw(c, 'SW1', 'FastEthernet0/2').psec.max >= 2 && isUp(c, 'SW1', 'FastEthernet0/2'),
        hint: 'Raising the maximum does not revive an err-disabled port. It needs shutdown, then no shutdown.', show: { SW1: ['switchport port-security maximum 2', 'shutdown', 'no shutdown'] } },
      { id: 'ping', text: 'From PC2, ping PC1', check: (c) => pinged(c, 'PC2', '10.0.10.11'),
        hint: 'Both MACs on Fa0/2 are within the limit now.', show: { PC2: ['ping 10.0.10.11'] } },
      { id: 'park', text: 'Park every unused port: Fa0/3 to Fa0/24 into VLAN 999 named PARKING, shut down', check: (c) => dev(c, 'SW1').vlans[999]?.name === 'PARKING' && range(3, 24).every(n => sw(c, 'SW1', n).access === 999 && port(c, 'SW1', n).shutdown),
        hint: 'Create the VLAN, then one interface range for all 22 ports: access mode, VLAN 999, shutdown.', show: { SW1: ['vlan 999', 'name PARKING', 'interface range f0/3 - 24', 'switchport mode access', 'switchport access vlan 999', 'shutdown'] } },
      { id: 'verify', text: 'Review it with show port-security', check: (c) => ran(c, 'SW1', 'show port-security', lastSeq(c, e => e.key === 'switchport port-security maximum')),
        hint: 'One line per secure port: max, current, violations, action.', show: { SW1: ['do show port-security'] } },
    ],
  },

  // ---------------------------------------------------------------- CDP and LLDP
  {
    id: 'sw-cdp',
    title: 'Map the closet with CDP and LLDP',
    lights: ['t2-discovery'],
    story: 'You inherited a closet with no labels. From CORE, work out what is plugged in where without touching a cable. Then turn on LLDP for the monitoring tool, and stop CORE advertising itself to EDGE, which the ISP manages.',
    start: 'CORE',
    devices: ['CORE', 'SW2', 'SW3', 'EDGE'],
    links: [
      L('a', 'CORE', 'GigabitEthernet0/1', 'SW2', 'GigabitEthernet0/2'),
      L('b', 'CORE', 'GigabitEthernet0/2', 'SW3', 'GigabitEthernet0/1'),
      L('c', 'CORE', 'FastEthernet0/24', 'EDGE', 'GigabitEthernet0/0'),
    ],
    topology: 'CORE, three neighbors, no labels. Find them.',
    build() {
      return build({ devices: this.devices, links: this.links, switches: ['CORE', 'SW2', 'SW3'],
        setup: { CORE: ['hostname CORE', 'interface vlan 1', 'ip address 172.16.0.2 255.255.255.0', 'no shutdown'], SW2: ['hostname SW2'], SW3: ['hostname SW3'], EDGE: ['hostname EDGE', 'interface g0/0', 'ip address 172.16.0.1 255.255.255.0', 'no shutdown'] } });
    },
    goals: [
      { id: 'look', text: 'List CORE\'s neighbors', check: (c) => ran(c, 'CORE', 'show cdp neighbors'),
        hint: 'show cdp neighbors. CDP is on by default on Cisco gear.', show: { CORE: ['enable', 'show cdp neighbors'] } },
      { id: 'edgeport', text: 'Which CORE port leads to EDGE?', ask: 'Port, like Gi0/1', check: (c) => isPort('FastEthernet0/24')(c.answers.edgeport),
        hint: 'Local Intrfce is CORE\'s port; Port ID is the neighbor\'s.', show: { CORE: ['show cdp neighbors'] } },
      { id: 'sw3port', text: 'Which of SW3\'s own ports is CORE plugged into?', ask: 'Port, like Gi0/1', check: (c) => isPort('GigabitEthernet0/1')(c.answers.sw3port),
        hint: 'This time it is the Port ID column: the port on the neighbor\'s side.', show: { CORE: ['show cdp neighbors'] } },
      { id: 'edgeip', text: 'What is EDGE\'s IP address? Get it from CDP, without logging in to EDGE', ask: 'Address', check: (c) => String(c.answers.edgeip ?? '').trim() === '172.16.0.1',
        hint: 'show cdp neighbors detail lists each neighbor\'s address.', show: { CORE: ['show cdp neighbors detail'] } },
      { id: 'lldp', text: 'Turn on LLDP on CORE and SW2', check: (c) => dev(c, 'CORE').lldp && dev(c, 'SW2').lldp,
        hint: 'LLDP is the open standard, off by default on Cisco gear. lldp run, in global configuration, on both ends.', show: { CORE: ['configure terminal', 'lldp run'], SW2: ['enable', 'configure terminal', 'lldp run'] } },
      { id: 'lldpsee', text: 'See SW2 in show lldp neighbors on CORE', check: (c) => ran(c, 'CORE', 'show lldp neighbors', lastSeq(c, e => e.key === 'lldp run')) && dev(c, 'SW2').lldp,
        hint: 'Only neighbors that also run LLDP show up.', show: { CORE: ['do show lldp neighbors'] } },
      { id: 'nocdp', text: 'Stop CDP on the port toward EDGE only', check: (c) => port(c, 'CORE', 'FastEthernet0/24').cdp === false && dev(c, 'CORE').cdp !== false,
        hint: 'no cdp enable on that one interface. no cdp run would stop it everywhere.', show: { CORE: ['interface f0/24', 'no cdp enable'] } },
    ],
  },

  // ---------------------------------------------------------------- a PC by hand
  {
    id: 'pc-addressing',
    title: 'Address a PC by hand',
    lights: ['t1-client'],
    story: 'A new desk PC, PC1, has no address and DHCP is down today. Set it by hand: 192.168.50.30/24, gateway R1 at 192.168.50.1. Then prove it reaches its neighbor, its gateway, and the server at 198.51.100.10 behind R1.',
    start: 'PC1',
    devices: ['PC1', 'PC2', 'SW1', 'R1'],
    links: [L('p1', 'PC1', NIC, 'SW1', 'FastEthernet0/5'), L('p2', 'PC2', NIC, 'SW1', 'FastEthernet0/6'), L('gw', 'R1', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1')],
    topology: 'PC1 Fa0/5, PC2 Fa0/6 (192.168.50.20) ── SW1 ── R1 Gi0/0 (192.168.50.1) · server 198.51.100.10 behind R1',
    build() {
      return build({ devices: this.devices, links: this.links, switches: ['SW1'], pcs: { PC1: { ip: null, mask: null }, PC2: pc('192.168.50.20', '192.168.50.1') },
        setup: { SW1: ['hostname SW1'], R1: ['hostname R1', 'interface g0/0', 'ip address 192.168.50.1 255.255.255.0', 'no shutdown', 'interface loopback 0', 'ip address 198.51.100.10 255.255.255.255'] } });
    },
    goals: [
      { id: 'look', text: 'Check PC1\'s settings', check: (c) => ran(c, 'PC1', 'ipconfig'),
        hint: 'ipconfig shows address, mask and gateway.', show: { PC1: ['ipconfig'] } },
      { id: 'set', text: 'Give PC1 192.168.50.30/24 with gateway 192.168.50.1', check: (c) => {
        const d = c.world.devices.PC1.config;
        return d.interfaces.FastEthernet0.ip === ip('192.168.50.30') && d.interfaces.FastEthernet0.mask === ip('255.255.255.0') && d.gateway === ip('192.168.50.1');
      }, hint: 'This prompt takes ipconfig ADDRESS MASK GATEWAY. On Windows you would use the adapter settings or netsh.', show: { PC1: ['ipconfig 192.168.50.30 255.255.255.0 192.168.50.1'] } },
      { id: 'local', text: 'Ping PC2 on the same subnet', check: (c) => pinged(c, 'PC1', '192.168.50.20'),
        hint: 'Same subnet: PC1 ARPs for PC2 directly. No gateway involved.', show: { PC1: ['ping 192.168.50.20'] } },
      { id: 'gateway', text: 'Ping the gateway', check: (c) => pinged(c, 'PC1', '192.168.50.1'),
        hint: 'If this fails, nothing off the subnet will work either.', show: { PC1: ['ping 192.168.50.1'] } },
      { id: 'far', text: 'Ping the server at 198.51.100.10', check: (c) => pinged(c, 'PC1', '198.51.100.10'),
        hint: 'Off the subnet: PC1 sends it to the gateway\'s MAC and R1 takes it from there.', show: { PC1: ['ping 198.51.100.10'] } },
      { id: 'trace', text: 'tracert to the server: the first hop is the gateway', check: (c) => traced(c, 'PC1', '198.51.100.10'),
        hint: 'Each line of tracert is one router on the way.', show: { PC1: ['tracert 198.51.100.10'] } },
    ],
  },
];
