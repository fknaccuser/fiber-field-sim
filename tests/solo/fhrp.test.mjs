import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, makeSwitch, makePc, makeDevice, exchange } from '../../src/solo/labs/world.js';
import { createSession, execute, runningConfig } from '../../src/solo/labs/ios.js';
import { parseIp } from '../../src/solo/labs/ip4.js';

// Two routers on one user LAN through SW1, both uplinked to CORE.
function lan() {
  const G = ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2'];
  const devs = [makeDevice('R1', G), makeDevice('R2', G), makeDevice('CORE', G), makeSwitch('SW1'), makePc('PC1', { ip: '10.1.1.50', mask: '255.255.255.0', gateway: '10.1.1.254' }), makePc('NMS', { ip: '10.9.9.9', mask: '255.255.255.0', gateway: '10.9.9.1' })];
  const L = (id, a, ai, b, bi) => ({ id, ends: [[a, ai], [b, bi]] });
  const world = makeWorld(devs, [L('a', 'PC1', 'FastEthernet0', 'SW1', 'FastEthernet0/1'), L('b', 'R1', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'), L('c', 'R2', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/2'),
    L('d', 'R1', 'GigabitEthernet0/1', 'CORE', 'GigabitEthernet0/0'), L('e', 'R2', 'GigabitEthernet0/1', 'CORE', 'GigabitEthernet0/1'), L('f', 'CORE', 'GigabitEthernet0/2', 'NMS', 'FastEthernet0')]);
  const s = Object.fromEntries(devs.map(d => [d.id, createSession(world, d.id)]));
  const run = (d, ...lines) => lines.map(l => execute(s[d], l)).join('\n');
  run('R1', 'en', 'conf t', 'int g0/0', 'ip address 10.1.1.2 255.255.255.0', 'no sh', 'int g0/1', 'ip address 10.0.1.1 255.255.255.252', 'no sh', 'exit', 'ip route 10.9.9.0 255.255.255.0 10.0.1.2', 'end');
  run('R2', 'en', 'conf t', 'int g0/0', 'ip address 10.1.1.3 255.255.255.0', 'no sh', 'int g0/1', 'ip address 10.0.2.1 255.255.255.252', 'no sh', 'exit', 'ip route 10.9.9.0 255.255.255.0 10.0.2.2', 'end');
  run('CORE', 'en', 'conf t', 'int g0/0', 'ip address 10.0.1.2 255.255.255.252', 'no sh', 'int g0/1', 'ip address 10.0.2.2 255.255.255.252', 'no sh', 'int g0/2', 'ip address 10.9.9.1 255.255.255.0', 'no sh', 'exit',
    'ip route 10.1.1.0 255.255.255.0 10.0.1.1', 'ip route 10.1.1.0 255.255.255.0 10.0.2.1 5', 'end');
  return { world, run };
}
const ok = (out) => /Received = 4/.test(out);

test('HSRP: the virtual gateway works, the higher priority wins, and the standby takes over', () => {
  const { world, run } = lan();
  assert.ok(!ok(run('PC1', 'ping 10.1.1.254')), 'no virtual gateway yet');
  run('R1', 'conf t', 'int g0/0', 'standby 1 ip 10.1.1.254', 'standby 1 priority 110', 'standby 1 preempt', 'end');
  run('R2', 'conf t', 'int g0/0', 'standby 1 ip 10.1.1.254', 'end');
  assert.ok(ok(run('PC1', 'ping 10.1.1.254')));
  assert.ok(ok(run('PC1', 'ping 10.9.9.9')), 'traffic leaves through the virtual gateway');
  assert.match(run('R1', 'show standby brief'), /Gi0\/0 +1 +110 P Active +local +10\.1\.1\.3 +10\.1\.1\.254/);
  assert.match(run('R2', 'show standby brief'), /Gi0\/0 +1 +100 +Standby +10\.1\.1\.2 +local/);
  // R1 fails: both its interfaces go down, so CORE's backup route takes over too.
  run('R1', 'conf t', 'int g0/0', 'shutdown', 'int g0/1', 'shutdown', 'end');
  assert.equal(world.hsrpVip[parseIp('10.1.1.254')].device, 'R2', 'R2 takes over');
  assert.ok(ok(run('PC1', 'ping 10.9.9.9')), 'still works through R2');
  run('R1', 'conf t', 'int g0/0', 'no shutdown', 'int g0/1', 'no shutdown', 'end');
  assert.equal(world.hsrpVip[parseIp('10.1.1.254')].device, 'R1', 'R1 preempts back');
  run('R1', 'conf t', 'int g0/0', 'no standby 1 preempt', 'shutdown', 'no shutdown', 'end');
  assert.equal(world.hsrpVip[parseIp('10.1.1.254')].device, 'R2', 'without preempt, R2 keeps the job');
  assert.match(runningConfig(world.devices.R1), / standby 1 ip 10\.1\.1\.254\n standby 1 priority 110/);
});

test('SNMP: a community lets the NMS poll on UDP 161, and the config reads back', () => {
  const { world, run } = lan();
  assert.equal(exchange(world, 'NMS', parseIp('10.0.1.2'), { proto: 'udp', port: 161 }).ok, false);
  run('CORE', 'conf t', 'snmp-server community N0cRead ro', 'snmp-server location Rack 4', 'snmp-server contact noc@corp.lab', 'snmp-server host 10.9.9.9 version 2c N0cRead', 'snmp-server enable traps', 'end');
  assert.equal(exchange(world, 'NMS', parseIp('10.0.1.2'), { proto: 'udp', port: 161 }).ok, true);
  assert.match(run('CORE', 'show snmp'), /Location: Rack 4[\s\S]*Logging to 10\.9\.9\.9\.162/);
  assert.match(runningConfig(world.devices.CORE), /snmp-server community N0cRead RO\nsnmp-server location Rack 4\nsnmp-server contact noc@corp\.lab\nsnmp-server enable traps\nsnmp-server host 10\.9\.9\.9 version 2c N0cRead/);
});
