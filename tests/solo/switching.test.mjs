import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, makeSwitch, makePc, makeDevice, routingTable, neighbors, l2Of } from '../../src/solo/labs/world.js';
import { createSession, execute, prompt, complete } from '../../src/solo/labs/ios.js';
import { operMode, memberFlag, parseVlanList, formatVlanList } from '../../src/solo/labs/switching.js';

const pc = (id, ip, gw = null) => makePc(id, { ip, mask: '255.255.255.0', gateway: gw });
const cable = (id, a, b) => ({ id, ends: [a, b] });

function lab(devices, links) {
  const world = makeWorld(devices, links);
  const s = Object.fromEntries(devices.map(d => [d.id, createSession(world, d.id)]));
  const run = (d, ...lines) => lines.map(l => execute(s[d], l)).join('\n');
  return { world, s, run };
}

// Two switches, a PC on each, and a router hanging off SW1.
function campus() {
  return lab([
    makeSwitch('SW1', { mac: '0019.e800.0001' }), makeSwitch('SW2', { mac: '0019.e800.0002' }),
    pc('PC1', '10.0.10.11', '10.0.10.1'), pc('PC2', '10.0.10.12', '10.0.10.1'), pc('PC3', '10.0.20.11', '10.0.20.1'),
    makeDevice('R1', ['GigabitEthernet0/0', 'GigabitEthernet0/1']),
  ], [
    cable('p1', ['PC1', 'FastEthernet0'], ['SW1', 'FastEthernet0/1']),
    cable('p2', ['PC2', 'FastEthernet0'], ['SW2', 'FastEthernet0/1']),
    cable('p3', ['PC3', 'FastEthernet0'], ['SW2', 'FastEthernet0/2']),
    cable('u1', ['SW1', 'GigabitEthernet0/1'], ['SW2', 'GigabitEthernet0/1']),
    cable('u2', ['SW1', 'GigabitEthernet0/2'], ['SW2', 'GigabitEthernet0/2']),
    cable('r', ['R1', 'GigabitEthernet0/0'], ['SW1', 'FastEthernet0/24']),
  ]);
}

const pinged = (out) => /Received = 4/.test(out);

test('vlan lists parse and print the way IOS writes them', () => {
  assert.deepEqual(parseVlanList('10,20,30-32'), [10, 20, 30, 31, 32]);
  assert.equal(parseVlanList('10-5'), null);
  assert.equal(formatVlanList([1, 10, 20, 21, 22, 30]), '1,10,20-22,30');
  assert.equal(formatVlanList(null), '1-4094');
  assert.equal(formatVlanList([]), 'none');
});

test('a switch out of the box: everything in VLAN 1, every port up, PCs talk', () => {
  const { s, run } = campus();
  assert.equal(prompt(s.SW1), 'Switch>');
  assert.equal(prompt(s.PC1), 'C:\\>');
  assert.ok(pinged(run('PC1', 'ping 10.0.10.12')));
  // Two dynamic auto ends never trunk.
  assert.equal(run('SW1', 'enable', 'show interfaces trunk').trim(), '');
});

test('DTP: trunk on one end turns a dynamic auto end into a trunk; nonegotiate does not', () => {
  const { world, run } = campus();
  run('SW1', 'enable', 'conf t', 'int g0/1', 'switchport mode trunk');
  assert.equal(operMode(world, 'SW2', 'GigabitEthernet0/1'), 'trunk');
  run('SW1', 'switchport nonegotiate');
  assert.equal(operMode(world, 'SW2', 'GigabitEthernet0/1'), 'access');
  assert.match(run('SW1', 'switchport mode dynamic desirable'), /Conflict between 'nonegotiate' and 'dynamic'/);
});

test('VLANs split broadcast domains and a trunk carries them', () => {
  const { run } = campus();
  run('SW1', 'enable', 'conf t', 'vlan 10', 'name SALES', 'int f0/1', 'switchport mode access', 'switchport access vlan 10');
  assert.ok(!pinged(run('PC1', 'ping 10.0.10.12')), 'PC2 is still in VLAN 1');
  const made = run('SW2', 'enable', 'conf t', 'int f0/1', 'switchport mode access', 'switchport access vlan 10');
  assert.match(made, /Access VLAN does not exist. Creating vlan 10/);
  assert.ok(!pinged(run('PC1', 'ping 10.0.10.12')), 'no trunk yet');
  run('SW1', 'int g0/1', 'switchport mode trunk', 'switchport trunk allowed vlan 20');
  assert.ok(!pinged(run('PC1', 'ping 10.0.10.12')), 'VLAN 10 is not allowed on the trunk');
  run('SW1', 'switchport trunk allowed vlan add 10');
  assert.ok(pinged(run('PC1', 'ping 10.0.10.12')));
  assert.match(run('SW1', 'do show vlan brief'), /10 {3}SALES {28}active {4}Fa0\/1/);
});

test('router on a stick routes between VLANs', () => {
  const { s, run } = campus();
  run('SW1', 'enable', 'conf t', 'vlan 10,20', 'int f0/1', 'sw mode acc', 'sw acc vlan 10', 'int f0/24', 'sw mode trunk', 'int g0/1', 'sw mode trunk');
  run('SW2', 'enable', 'conf t', 'vlan 10,20', 'int f0/1', 'sw mode acc', 'sw acc vlan 10', 'int f0/2', 'sw mode acc', 'sw acc vlan 20');
  assert.match(run('R1', 'enable', 'conf t', 'int g0/0.10', 'ip address 10.0.10.1 255.255.255.0'), /only allowed if that\nsubinterface is already configured/);
  assert.equal(prompt(s.R1), 'R1(config-subif)#'.replace('R1', 'Router'));
  run('R1', 'encapsulation dot1q 10', 'ip address 10.0.10.1 255.255.255.0', 'int g0/0.20', 'encapsulation dot1q 20', 'ip address 10.0.20.1 255.255.255.0', 'int g0/0', 'no shutdown');
  assert.ok(pinged(run('PC1', 'ping 10.0.20.11')));
  const tr = run('PC1', 'tracert 10.0.20.11');
  assert.match(tr, /1 +0 ms +0 ms +0 ms +10\.0\.10\.1\n +2 +0 ms +0 ms +0 ms +10\.0\.20\.11/);
  assert.match(run('R1', 'do show run | section 0/0.10'), /encapsulation dot1Q 10\n ip address 10.0.10.1 255.255.255.0/);
});

test('spanning tree blocks one of two parallel links, and the root moves with priority', () => {
  const { world, run } = campus();
  const stp = () => l2Of(world).stp;
  assert.equal(stp().SW1[1].rootId, 'SW1', 'lowest MAC wins with equal priorities');
  assert.ok(stp().SW2[1].ports['GigabitEthernet0/1']);
  assert.equal(stp().SW2[1].ports['GigabitEthernet0/2'].role, 'Altn');
  assert.equal(stp().SW2[1].ports['GigabitEthernet0/1'].role, 'Root');
  run('SW2', 'enable', 'conf t', 'spanning-tree vlan 1 root primary');
  assert.equal(stp().SW1[1].rootId, 'SW2');
  assert.equal(stp().SW1[1].ports['GigabitEthernet0/2'].state, 'BLK');
  assert.match(run('SW2', 'spanning-tree vlan 1 priority 100'), /increments of 4096/);
  assert.match(run('SW2', 'do show spanning-tree'), /This bridge is the root/);
});

test('EtherChannel: LACP active with passive bundles; on with active does not', () => {
  const { world, run } = campus();
  assert.match(run('SW1', 'enable', 'conf t', 'int range g0/1 - 2', 'channel-group 1 mode active'), /Creating a port-channel interface Port-channel 1/);
  assert.equal(memberFlag(world, 'SW1', 'GigabitEthernet0/1'), 'I');
  run('SW2', 'enable', 'conf t', 'int range g0/1 - 2', 'channel-group 1 mode on');
  assert.notEqual(memberFlag(world, 'SW1', 'GigabitEthernet0/1'), 'P');
  run('SW2', 'no channel-group', 'channel-group 1 mode passive');
  assert.equal(memberFlag(world, 'SW1', 'GigabitEthernet0/1'), 'P');
  assert.match(run('SW1', 'do show etherchannel summary'), /1 +Po1\(SU\) +LACP +Gi0\/1\(P\) +Gi0\/2\(P\)/);
  // One logical link: nothing left to block.
  assert.ok(!Object.values(l2Of(world).stp.SW2[1].ports).some(p => p.state === 'BLK'));
  run('SW1', 'int po1', 'switchport mode trunk');
  assert.match(run('SW1', 'do show run | section Gi'), /interface GigabitEthernet0\/1\n switchport mode trunk\n channel-group 1 mode active/);
});

test('BPDU Guard err-disables a PortFast port that hears a switch; shut and no shut recovers', () => {
  const { world, run } = campus();
  const out = run('SW2', 'enable', 'conf t', 'int g0/2', 'spanning-tree portfast', 'spanning-tree bpduguard enable');
  assert.match(out, /%Warning: portfast should only be enabled/);
  assert.match(out, /BLOCK_BPDUGUARD/);
  assert.equal(world.devices.SW2.err['GigabitEthernet0/2'], 'bpduguard');
  run('SW2', 'no spanning-tree bpduguard', 'shutdown', 'no shutdown');
  assert.equal(world.devices.SW2.err['GigabitEthernet0/2'], undefined);
});

test('port security: dynamic ports are refused, a second MAC on a max-1 port shuts it, sticky learns', () => {
  const { world, run } = lab([makeSwitch('SW1'), pc('PC1', '10.0.1.11'), pc('PC2', '10.0.1.12'), pc('PC3', '10.0.1.13')], [
    cable('a', ['PC1', 'FastEthernet0'], ['SW1', 'FastEthernet0/1']),
    { id: 'hub', segment: true, ends: [['PC2', 'FastEthernet0'], ['PC3', 'FastEthernet0'], ['SW1', 'FastEthernet0/2']] },
  ]);
  run('SW1', 'enable', 'conf t', 'int f0/1');
  assert.match(run('SW1', 'switchport port-security'), /is a dynamic port/);
  run('SW1', 'switchport mode access', 'switchport port-security', 'switchport port-security mac-address sticky');
  assert.match(run('SW1', 'do show run | include sticky 0050'), /switchport port-security mac-address sticky 0050\./);
  const out = run('SW1', 'int f0/2', 'switchport mode access', 'switchport port-security');
  assert.match(out, /psecure-violation/);
  assert.equal(world.devices.SW1.err['FastEthernet0/2'], 'psecure-violation');
  assert.ok(!pinged(run('PC2', 'ping 10.0.1.11')));
  run('SW1', 'switchport port-security maximum 2', 'shutdown', 'no shutdown');
  assert.ok(pinged(run('PC2', 'ping 10.0.1.11')));
  assert.match(run('SW1', 'do show port-security'), /Fa0\/2 +2 +2 +1 +Shutdown/);
});

test('a switch is a host: its SVI needs a forwarding port and a default gateway', () => {
  const { run } = campus();
  run('R1', 'enable', 'conf t', 'int g0/0', 'ip address 10.0.1.1 255.255.255.0', 'no shutdown');
  run('SW1', 'enable', 'conf t', 'int vlan 1', 'ip address 10.0.1.2 255.255.255.0');
  assert.ok(!/!!!!!/.test(run('SW1', 'do ping 10.0.1.1')), 'Vlan1 starts shut');
  run('SW1', 'no shutdown');
  assert.match(run('SW1', 'do ping 10.0.1.1'), /!!!!!/);
  assert.match(run('SW1', 'do show ip route'), /Default gateway is not set/);
  run('SW1', 'exit', 'ip default-gateway 10.0.1.1');
  assert.match(run('SW1', 'do show ip route'), /Default gateway is 10.0.1.1/);
  assert.match(run('SW1', 'router ospf 1'), /Invalid input/);
});

test('CDP sees switches and routers, not PCs; LLDP needs lldp run on both ends', () => {
  const { run } = campus();
  run('R1', 'enable', 'conf t', 'hostname R1', 'int g0/0', 'no shutdown');
  run('SW2', 'enable', 'conf t', 'hostname SW2');
  const cdp = run('SW1', 'enable', 'show cdp neighbors');
  assert.match(cdp, /R1 +Fas 0\/24 .*R B S I +CISCO2911 +Gig 0\/0/);
  assert.match(cdp, /SW2 +Gig 0\/1/);
  assert.match(cdp, /Total cdp entries displayed : 3/);
  assert.match(run('SW1', 'show lldp neighbors'), /LLDP is not enabled/);
  run('SW1', 'conf t', 'lldp run', 'end');
  run('SW2', 'lldp run');
  assert.match(run('SW1', 'show lldp neighbors'), /SW2 +Gi0\/1 +120 +B +Gi0\/1/);
});

test('the MAC table fills from traffic and clears on demand', () => {
  const { run } = campus();
  const empty = run('SW1', 'enable', 'show mac address-table dynamic');
  assert.match(empty, /Total Mac Addresses for this criterion: 0/);
  run('PC1', 'ping 10.0.10.12');
  const full = run('SW1', 'show mac address-table dynamic');
  assert.match(full, /1 +0050\.\S+ +DYNAMIC +Fa0\/1/);
  assert.match(full, /1 +0050\.\S+ +DYNAMIC +Gi0\/1/);
  run('SW1', 'clear mac address-table dynamic');
  assert.match(run('SW1', 'show mac address-table dynamic'), /criterion: 0/);
});

test('OSPF forms across a switch, and the router sees the switch as nothing but wire', () => {
  const { world, run } = lab([
    makeSwitch('SW1'), makeDevice('R1', ['GigabitEthernet0/0']), makeDevice('R2', ['GigabitEthernet0/0']),
  ], [cable('a', ['R1', 'GigabitEthernet0/0'], ['SW1', 'FastEthernet0/1']), cable('b', ['R2', 'GigabitEthernet0/0'], ['SW1', 'FastEthernet0/2'])]);
  for (const [r, ip] of [['R1', '10.0.0.1'], ['R2', '10.0.0.2']]) {
    run(r, 'enable', 'conf t', 'int g0/0', `ip address ${ip} 255.255.255.0`, 'no shut', 'int lo0', `ip address ${ip.replace('10.0.0', '1.1.1')} 255.255.255.255`, 'router ospf 1', 'network 0.0.0.0 255.255.255.255 area 0');
  }
  assert.equal(neighbors(world, 'R1').length, 1);
  assert.equal(neighbors(world, 'R1')[0].state, 'FULL');
  assert.ok(routingTable(world, 'R1').some(r => r.type === 'ospf' && r.len === 32));
  run('SW1', 'enable', 'conf t', 'int f0/2', 'switchport access vlan 20');
  assert.equal(neighbors(world, 'R1').length, 0, 'R2 moved into another VLAN');
});

test('interface range, Tab and ? know the switch commands', () => {
  const { s, run } = campus();
  run('SW1', 'enable', 'conf t', 'interface range fa0/1 - 4, g0/1');
  assert.equal(prompt(s.SW1), 'Switch(config-if-range)#');
  run('SW1', 'switchport mode access', 'switchport access vlan 30');
  assert.match(run('SW1', 'do show vlan brief'), /30 {3}VLAN0030 {25}active {4}Fa0\/1, Fa0\/2, Fa0\/3, Fa0\/4,\n {48}Gi0\/1/);
  assert.equal(complete(s.SW1, 'switchport port-s'), 'switchport port-security ');
  assert.match(run('SW1', 'switchport port-security violation ?'), /protect\n {2}restrict\n {2}shutdown/);
  assert.match(run('SW1', 'router ospf 1'), /Invalid input/);
});

test('speed and duplex: auto meets auto at full, auto meets hard-set at half, hard-set speeds that differ stay down', async () => {
  const { negotiate } = await import('../../src/solo/labs/switching.js');
  const { world, run } = campus();
  let n = negotiate(world, 'SW1', 'FastEthernet0/1');
  assert.deepEqual([n.speed, n.duplex, n.mismatch], [100, 'full', false]);
  assert.match(run('SW1', 'enable', 'show interfaces status'), /Fa0\/1 .*a-full +a-100/);
  run('SW1', 'configure terminal', 'interface f0/1', 'speed 100', 'duplex full', 'end');
  n = negotiate(world, 'SW1', 'FastEthernet0/1');
  assert.deepEqual([n.speed, n.duplex, n.peerDuplex, n.mismatch], [100, 'full', 'half', true], 'the PC on auto falls back to half');
  assert.match(run('SW1', 'show interfaces status'), /Fa0\/1 .*full +100 /);
  assert.match(run('SW1', 'show interfaces f0/1'), /Full-duplex, 100Mb\/s[\s\S]* [1-9]\d* CRC/);
  assert.match(run('SW1', 'show running-config'), /interface FastEthernet0\/1\n speed 100\n duplex full/);
  run('SW1', 'configure terminal', 'interface g0/1', 'speed 100', 'duplex full', 'end');
  run('SW2', 'enable', 'configure terminal', 'interface g0/1', 'speed 10', 'duplex full', 'end');
  assert.match(run('SW1', 'show interfaces status'), /Gi0\/1 .*notconnect/, 'two hard-set speeds that differ never come up');
  assert.match(run('SW1', 'configure terminal', 'interface f0/2', 'speed 1000'), /Invalid input/, 'a Fast Ethernet port has no gigabit');
});
