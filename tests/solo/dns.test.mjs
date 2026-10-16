import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, makeSwitch, makePc, makeDevice } from '../../src/solo/labs/world.js';
import { createSession, execute } from '../../src/solo/labs/ios.js';

// R1 routes between a user LAN (through SW1) and a server LAN with SRV.
function lab({ dhcpOnServer = true } = {}) {
  const srv = makePc('SRV', { ip: '10.1.50.10', mask: '255.255.255.0', gateway: '10.1.50.1', services: [80], server: {
    dns: { on: true, records: { 'portal.lab': '10.1.50.10', 'printer.lab': '10.1.10.40' } },
    dhcp: { on: dhcpOnServer, pools: [{ name: 'USERS', start: '10.1.10.100', mask: '255.255.255.0', gateway: '10.1.10.1', dns: '10.1.50.10', max: 50 }] },
  } });
  const devs = [makeDevice('R1', ['GigabitEthernet0/0', 'GigabitEthernet0/1']), makeSwitch('SW1'), makePc('PC1', { dhcp: true }), makePc('PC2', { ip: '10.1.10.20', mask: '255.255.255.0', gateway: '10.1.10.1' }), srv];
  const L = (id, a, ai, b, bi) => ({ id, ends: [[a, ai], [b, bi]] });
  const world = makeWorld(devs, [L('a', 'PC1', 'FastEthernet0', 'SW1', 'FastEthernet0/1'), L('b', 'PC2', 'FastEthernet0', 'SW1', 'FastEthernet0/2'),
    L('c', 'SW1', 'GigabitEthernet0/1', 'R1', 'GigabitEthernet0/0'), L('d', 'R1', 'GigabitEthernet0/1', 'SRV', 'FastEthernet0')]);
  const s = Object.fromEntries(devs.map(d => [d.id, createSession(world, d.id)]));
  const run = (d, ...lines) => lines.map(l => execute(s[d], l)).join('\n');
  run('R1', 'en', 'conf t', 'int g0/0', 'ip address 10.1.10.1 255.255.255.0', 'no sh', 'int g0/1', 'ip address 10.1.50.1 255.255.255.0', 'no sh', 'end');
  return { world, run };
}

test('a server hands out addresses through a helper, starting at its pool start', () => {
  const { run } = lab();
  assert.match(run('PC1', 'ipconfig /renew'), /unable to contact your DHCP server/, 'no relay yet');
  run('R1', 'conf t', 'int g0/0', 'ip helper-address 10.1.50.10', 'end');
  const out = run('PC1', 'ipconfig /renew');
  assert.match(out, /IPv4 Address[ .]+: 10\.1\.10\.100/);
  assert.match(out, /Default Gateway[ .]+: 10\.1\.10\.1/);
  assert.match(run('PC1', 'ipconfig /all'), /DNS Servers[ .]+: 10\.1\.50\.10/);
});

test('nslookup and ping by name go through the DNS server', () => {
  const { run } = lab();
  assert.match(run('PC2', 'nslookup portal.lab'), /can't find portal\.lab: No response from server|Default servers are not available/, 'no DNS server set');
  run('PC2', 'ipconfig 10.1.10.20 255.255.255.0 10.1.10.1 10.1.50.10');
  assert.match(run('PC2', 'nslookup portal.lab'), /Name: +portal\.lab\nAddress: +10\.1\.50\.10/);
  assert.match(run('PC2', 'nslookup PORTAL.LAB'), /Address: +10\.1\.50\.10/, 'names match without case');
  assert.match(run('PC2', 'nslookup intranet.lab'), /Non-existent domain/);
  assert.match(run('PC2', 'ping portal.lab'), /Pinging portal\.lab \[10\.1\.50\.10\][\s\S]*Received = 4/);
  assert.match(run('PC2', 'ping nowhere.lab'), /could not find host nowhere\.lab/);
  assert.match(run('PC2', 'telnet portal.lab 80'), /Connected to portal\.lab on port 80/);
  run('R1', 'conf t', 'int g0/1', 'shutdown', 'end');
  assert.match(run('PC2', 'nslookup portal.lab'), /timed-out/, 'an unreachable server times out');
});
