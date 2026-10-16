import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SANDBOXES, sandboxById } from '../../src/solo/sandbox/networks.js';
import { buildWorld } from '../../src/solo/desk/grade.js';
import { createSession, execute } from '../../src/solo/labs/ios.js';

function open(id) {
  const net = sandboxById(id);
  const world = buildWorld(net);
  const s = Object.fromEntries(net.devices.map(d => [d.id, createSession(world, d.id)]));
  const run = (d, ...lines) => lines.map(l => execute(s[d], l)).join('\n');
  return { world, run };
}
const ok = (out) => /Received = 4/.test(out);

test('every sandbox builds, starts blank where it should, and lists things to try', () => {
  for (const n of SANDBOXES) {
    const w = buildWorld(n);
    assert.ok(n.tries.length >= 6, n.id);
    for (const d of n.devices.filter(x => x.kind !== 'pc' && !x.theirs)) assert.match(w.devices[d.id].config.hostname, /^(Router|Switch)$/, `${n.id} ${d.id} starts from the box`);
  }
  assert.deepEqual(SANDBOXES.map(n => n.level), [1, 2, 3, 4, 5], 'simplest first');
});

test('level 1, the way the engineer teaches it: VLANs, trunk, router on a stick, DHCP, ping across', () => {
  const { run } = open('sb-vlan-dhcp');
  run('SW1', 'en', 'conf t', 'hostname SW1', 'vlan 10', 'name SALES', 'vlan 20', 'name HR', 'exit',
    'interface range f0/1 - 2', 'switchport mode access', 'switchport access vlan 10', 'description SALES desks',
    'interface range f0/3 - 4', 'switchport mode access', 'switchport access vlan 20', 'description HR desks',
    'interface g0/1', 'description uplink to R1', 'switchport mode trunk', 'end');
  run('R1', 'en', 'conf t', 'hostname R1', 'interface g0/0', 'no shutdown',
    'interface g0/0.10', 'encapsulation dot1q 10', 'ip address 192.168.10.1 255.255.255.0',
    'interface g0/0.20', 'encapsulation dot1q 20', 'ip address 192.168.20.1 255.255.255.0', 'exit',
    'ip dhcp excluded-address 192.168.10.1 192.168.10.10', 'ip dhcp excluded-address 192.168.20.1 192.168.20.10',
    'ip dhcp pool SALES', 'network 192.168.10.0 255.255.255.0', 'default-router 192.168.10.1', 'exit',
    'ip dhcp pool HR', 'network 192.168.20.0 255.255.255.0', 'default-router 192.168.20.1', 'end');
  assert.match(run('PC1', 'ipconfig /renew'), /192\.168\.10\.11/);
  assert.match(run('PC3', 'ipconfig /renew'), /192\.168\.20\.11/);
  assert.ok(ok(run('PC1', 'ping 192.168.20.11')), 'across VLANs through R1');
  assert.match(run('SW1', 'show interfaces trunk'), /Gi0\/1/);
});

test('level 2: DNS on the server, then DHCP moved to the server behind a helper', () => {
  const { world, run } = open('sb-dns');
  run('SW1', 'en', 'conf t', 'vlan 10', 'vlan 20', 'vlan 99', 'exit', 'interface range f0/1 - 2', 'switchport mode access', 'switchport access vlan 10',
    'interface f0/3', 'switchport mode access', 'switchport access vlan 20', 'interface f0/24', 'switchport mode access', 'switchport access vlan 99', 'interface g0/1', 'switchport mode trunk', 'end');
  run('R1', 'en', 'conf t', 'interface g0/0', 'no shutdown',
    'interface g0/0.10', 'encapsulation dot1q 10', 'ip address 10.10.10.1 255.255.255.0', 'ip helper-address 10.10.99.10',
    'interface g0/0.99', 'encapsulation dot1q 99', 'ip address 10.10.99.1 255.255.255.0', 'end');
  run('SRV', 'ipconfig 10.10.99.10 255.255.255.0 10.10.99.1');
  const srv = world.devices.SRV.config.server;
  srv.dns.on = true;
  srv.dns.records['portal.office.lab'] = (10 << 24 | 10 << 16 | 99 << 8 | 10) >>> 0;
  srv.dhcp.on = true;
  srv.dhcp.pools = [{ name: 'serverPool', start: (10 << 24 | 10 << 16 | 10 << 8 | 100) >>> 0, mask: 0xffffff00, gateway: (10 << 24 | 10 << 16 | 10 << 8 | 1) >>> 0, dns: (10 << 24 | 10 << 16 | 99 << 8 | 10) >>> 0, max: 50 }];
  assert.match(run('PC1', 'ipconfig /renew'), /10\.10\.10\.100/);
  assert.match(run('PC1', 'nslookup portal.office.lab'), /Address: +10\.10\.99\.10/);
  assert.ok(ok(run('PC1', 'ping portal.office.lab')));
});
