import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, makeSwitch, makePc, makeDevice, exchange } from '../../src/solo/labs/world.js';
import { createSession, execute } from '../../src/solo/labs/ios.js';
import { parseAce, aceMatches, aceText } from '../../src/solo/labs/services.js';
import { parseIp } from '../../src/solo/labs/ip4.js';

const G3 = ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2'];

// A branch: PCs behind SW1 and R1, a server on R1 Gi0/2, an ISP router
// with a web server behind it.
function branch() {
  const devs = [makeDevice('R1', G3), makeDevice('ISP', G3), makeSwitch('SW1'),
    makePc('PC1'), makePc('PC2', { ip: '10.1.10.50', mask: '255.255.255.0', gateway: '10.1.10.1' }),
    makePc('WEB', { ip: '198.51.100.80', mask: '255.255.255.0', gateway: '198.51.100.1', services: [80] }),
    makePc('SRV', { ip: '10.1.50.10', mask: '255.255.255.0', gateway: '10.1.50.1', services: [80, 22] })];
  const L = (id, a, ai, b, bi) => ({ id, ends: [[a, ai], [b, bi]] });
  const world = makeWorld(devs, [
    L('a', 'PC1', 'FastEthernet0', 'SW1', 'FastEthernet0/1'), L('b', 'PC2', 'FastEthernet0', 'SW1', 'FastEthernet0/2'),
    L('c', 'SW1', 'GigabitEthernet0/1', 'R1', 'GigabitEthernet0/0'), L('d', 'R1', 'GigabitEthernet0/1', 'ISP', 'GigabitEthernet0/0'),
    L('e', 'ISP', 'GigabitEthernet0/1', 'WEB', 'FastEthernet0'), L('f', 'R1', 'GigabitEthernet0/2', 'SRV', 'FastEthernet0'),
  ]);
  const s = Object.fromEntries(devs.map(d => [d.id, createSession(world, d.id)]));
  const run = (d, ...lines) => lines.map(l => execute(s[d], l)).join('\n');
  run('ISP', 'en', 'conf t', 'int g0/0', 'ip add 203.0.113.1 255.255.255.252', 'no sh', 'int g0/1', 'ip add 198.51.100.1 255.255.255.0', 'no sh', 'end');
  run('R1', 'en', 'conf t', 'int g0/0', 'ip add 10.1.10.1 255.255.255.0', 'no sh', 'int g0/1', 'ip add 203.0.113.2 255.255.255.252', 'no sh', 'int g0/2', 'ip add 10.1.50.1 255.255.255.0', 'no sh', 'exit', 'ip route 0.0.0.0 0.0.0.0 203.0.113.1');
  return { world, run };
}
const ok = (out) => /Received = 4/.test(out);

test('ACL entries parse, print back the way IOS writes them, and match packets', () => {
  const e = parseAce('extended', 'permit tcp 10.0.0.0 0.0.0.255 host 10.9.9.9 eq www');
  assert.equal(aceText('extended', e), 'tcp 10.0.0.0 0.0.0.255 host 10.9.9.9 eq www');
  assert.ok(aceMatches(e, { src: parseIp('10.0.0.7'), dst: parseIp('10.9.9.9'), proto: 'tcp', dport: 80 }));
  assert.ok(!aceMatches(e, { src: parseIp('10.0.0.7'), dst: parseIp('10.9.9.9'), proto: 'tcp', dport: 443 }));
  assert.ok(!aceMatches(e, { src: parseIp('10.0.1.7'), dst: parseIp('10.9.9.9'), proto: 'tcp', dport: 80 }));
  const st = parseAce('standard', 'deny 192.168.1.5');
  assert.equal(aceText('standard', st), '192.168.1.5', 'a bare address is a host in a standard ACL');
  assert.equal(parseAce('standard', 'permit tcp any any'), null);
});

test('DHCP: a local pool leases past the excluded range; a remote PC needs a helper', () => {
  const { run } = branch();
  run('R1', 'ip dhcp excluded-address 10.1.10.1 10.1.10.9', 'ip dhcp pool LAN', 'network 10.1.10.0 255.255.255.0', 'default-router 10.1.10.1', 'exit');
  const out = run('PC1', 'ipconfig /renew');
  assert.match(out, /IPv4 Address[ .]+: 10\.1\.10\.10/);
  assert.match(out, /Default Gateway[ .]+: 10\.1\.10\.1/);
  assert.match(run('R1', 'do show ip dhcp binding'), /10\.1\.10\.10 /);
  assert.ok(ok(run('PC1', 'ping 10.1.50.10')));
});

test('DHCP relay: without ip helper-address the PC falls back to 169.254', () => {
  const { run } = branch();
  run('ISP', 'conf t', 'ip dhcp pool BRANCH', 'network 10.1.10.0 255.255.255.0', 'default-router 10.1.10.1', 'exit', 'ip route 10.1.10.0 255.255.255.0 203.0.113.2');
  assert.match(run('PC1', 'ipconfig /renew'), /unable to contact your DHCP server/);
  assert.match(run('PC1', 'ipconfig'), /169\.254\./);
  run('R1', 'int g0/0', 'ip helper-address 203.0.113.1');
  assert.match(run('PC1', 'ipconfig /renew'), /10\.1\.10\.\d+/);
});

test('PAT: inside hosts reach the internet only once NAT is in place', () => {
  const { world, run } = branch();
  assert.ok(!ok(run('PC2', 'ping 198.51.100.80')), 'the ISP has no route back to 10.1.10.0');
  run('R1', 'int g0/0', 'ip nat inside', 'int g0/1', 'ip nat outside', 'exit', 'access-list 1 permit 10.1.10.0 0.0.0.255', 'ip nat inside source list 1 interface g0/1 overload');
  assert.ok(ok(run('PC2', 'ping 198.51.100.80')));
  assert.match(run('R1', 'do show ip nat translations'), /icmp 203\.0\.113\.2:\d+ +10\.1\.10\.50:\d+ +198\.51\.100\.80/);
  assert.ok(exchange(world, 'PC2', parseIp('198.51.100.80'), { proto: 'tcp', port: 80 }).ok);
  assert.ok(!exchange(world, 'PC2', parseIp('198.51.100.80'), { proto: 'tcp', port: 22 }).ok, 'nothing listens on 22');
});

test('static NAT publishes a server, and an outside ACL sees the public address', () => {
  const { run } = branch();
  run('R1', 'int g0/2', 'ip nat inside', 'int g0/1', 'ip nat outside', 'exit', 'ip nat inside source static 10.1.50.10 203.0.113.3');
  assert.match(run('WEB', 'telnet 203.0.113.3 80'), /Connected to 203\.0\.113\.3/);
  // Written against the inside address, the ACL never matches: the outside
  // interface checks it before NAT translates.
  run('R1', 'ip access-list extended IN', 'permit tcp any host 10.1.50.10 eq www', 'exit', 'int g0/1', 'ip access-group IN in');
  assert.match(run('WEB', 'telnet 203.0.113.3 80'), /Connect failed/);
  run('R1', 'ip access-list extended IN', 'no 10', '5 permit tcp any host 203.0.113.3 eq www', 'exit');
  assert.match(run('WEB', 'telnet 203.0.113.3 80'), /Connected/);
  assert.match(run('WEB', 'telnet 203.0.113.3 22'), /Connect failed/);
  assert.match(run('WEB', 'ping 203.0.113.3'), /Reply from 203\.0\.113\.2: Destination host unreachable/);
  assert.match(run('R1', 'do show access-lists IN'), /5 permit tcp any host 203\.0\.113\.3 eq www \(1 match\)/);
});

test('a standard ACL outbound toward a server, and the running config writes it all', () => {
  const { run } = branch();
  run('R1', 'access-list 10 deny host 10.1.10.50', 'access-list 10 permit any', 'int g0/2', 'ip access-group 10 out');
  assert.match(run('PC2', 'ping 10.1.50.10'), /Destination host unreachable/);
  const cfg = run('R1', 'do show running-config');
  assert.match(cfg, /access-list 10 deny 10\.1\.10\.50\naccess-list 10 permit any/);
  assert.match(cfg, /interface GigabitEthernet0\/2\n ip address 10\.1\.50\.1 255\.255\.255\.0\n ip access-group 10 out/);
  assert.match(run('R1', 'do show ip interface g0/2'), /Outgoing access list is 10/);
});
