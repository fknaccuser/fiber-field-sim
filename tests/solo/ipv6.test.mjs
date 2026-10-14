import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, makeSwitch, makePc, makeDevice } from '../../src/solo/labs/world.js';
import { createSession, execute, runningConfig, prompt } from '../../src/solo/labs/ios.js';
import { parse6, format6, eui64, linkLocalOf, kind6, solicited, parsePrefix6 } from '../../src/solo/labs/ip6.js';
import { v6Of, ping6 } from '../../src/solo/labs/v6.js';

const G3 = ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2'];

// PC1 and PC3 behind SW1 on R1 Gi0/0, a /64 between R1 and R2, PC2 on R2 Gi0/1.
function net() {
  const devs = [makeDevice('R1', G3), makeDevice('R2', G3), makeSwitch('SW1'), makePc('PC1'), makePc('PC2'), makePc('PC3')];
  const L = (id, a, ai, b, bi) => ({ id, ends: [[a, ai], [b, bi]] });
  const world = makeWorld(devs, [
    L('a', 'PC1', 'FastEthernet0', 'SW1', 'FastEthernet0/1'), L('b', 'PC3', 'FastEthernet0', 'SW1', 'FastEthernet0/2'),
    L('c', 'SW1', 'GigabitEthernet0/1', 'R1', 'GigabitEthernet0/0'), L('d', 'R1', 'GigabitEthernet0/1', 'R2', 'GigabitEthernet0/0'),
    L('e', 'R2', 'GigabitEthernet0/1', 'PC2', 'FastEthernet0'),
  ]);
  const s = Object.fromEntries(devs.map(d => [d.id, createSession(world, d.id)]));
  const run = (d, ...lines) => lines.map(l => execute(s[d], l)).join('\n');
  run('R1', 'en', 'conf t', 'int g0/0', 'ipv6 address 2001:db8:acad:1::1/64', 'no sh', 'int g0/1', 'ipv6 address 2001:db8:acad:12::1/64', 'no sh', 'end');
  run('R2', 'en', 'conf t', 'int g0/0', 'ipv6 address 2001:db8:acad:12::2/64', 'no sh', 'int g0/1', 'ipv6 address 2001:db8:acad:2::1/64', 'no sh', 'end');
  return { world, run, s };
}
const ok = (out) => /Received = 4/.test(out);

test('IPv6 text: compression, EUI-64, link-local, kinds', () => {
  assert.equal(format6(parse6('2001:0DB8:0000:0000:0000:0000:0000:0001')), '2001:db8::1');
  assert.equal(format6(parse6('2001:db8:0:0:1:0:0:1')), '2001:db8::1:0:0:1', 'the first of two equal runs is the one compressed');
  assert.equal(format6(parse6('2001:db8:0:1:1:1:1:1')), '2001:db8:0:1:1:1:1:1', 'a single zero group stays');
  assert.equal(parse6('2001::db8::1'), null);
  assert.equal(parse6('10.0.0.1'), null);
  assert.equal(format6(eui64('0060.47ca.7b03'), true), '::260:47FF:FECA:7B03');
  assert.equal(format6(linkLocalOf('0060.47ca.7b03')), 'fe80::260:47ff:feca:7b03');
  assert.equal(kind6(parse6('fe80::1')), 'link-local');
  assert.equal(kind6(parse6('fd00::1')), 'unique local');
  assert.equal(kind6(parse6('2001:db8::1')), 'global unicast');
  assert.equal(kind6(parse6('ff02::1')), 'multicast');
  assert.equal(format6(solicited(parse6('2001:db8::abcd:1234'))), 'ff02::1:ffcd:1234');
  assert.deepEqual(parsePrefix6('2001:db8::/129'), null);
});

test('without ipv6 unicast-routing a router answers but does not forward', () => {
  const { run } = net();
  run('PC1', 'ipv6config 2001:db8:acad:1::10/64 2001:db8:acad:1::1');
  run('PC2', 'ipv6config 2001:db8:acad:2::10/64 2001:db8:acad:2::1');
  assert.ok(ok(run('PC1', 'ping 2001:db8:acad:1::1')), 'the gateway answers');
  assert.ok(!ok(run('PC1', 'ping 2001:db8:acad:2::10')));
  run('R1', 'conf t', 'ipv6 unicast-routing', 'ipv6 route ::/0 2001:db8:acad:12::2', 'end');
  run('R2', 'conf t', 'ipv6 unicast-routing', 'ipv6 route 2001:db8:acad:1::/64 2001:db8:acad:12::1', 'end');
  assert.ok(ok(run('PC1', 'ping 2001:db8:acad:2::10')));
  const tr = run('PC1', 'tracert 2001:db8:acad:2::10');
  assert.match(tr, /1 .*2001:db8:acad:1::1/);
  assert.match(tr, /2 .*2001:db8:acad:12::2/);
  assert.match(tr, /3 .*2001:db8:acad:2::10/);
});

test('SLAAC: a PC builds prefix + EUI-64 only from a router sending advertisements', () => {
  const { run, world } = net();
  const out = run('PC3', 'ipv6config auto');
  assert.match(out, /autoconfiguration failed/);
  run('R1', 'conf t', 'ipv6 unicast-routing', 'end');
  run('PC3', 'ipv6config auto');
  const mine = v6Of(world, 'PC3', 'FastEthernet0').addrs[0];
  assert.equal(format6(mine.addr), format6(parse6('2001:db8:acad:1::') | eui64(world.devices.PC3.mac)));
  const cfg = run('PC3', 'ipconfig');
  assert.match(cfg, /IPv6 Address[ .]+: 2001:db8:acad:1:/);
  assert.match(cfg, /Default Gateway[ .]+: fe80::/, 'the gateway is the router link-local');
  assert.ok(ok(run('PC3', 'ping 2001:db8:acad:1::1')));
});

test('show ipv6 interface brief, show ipv6 route, and the running config', () => {
  const { run, world } = net();
  run('R1', 'conf t', 'ipv6 unicast-routing', 'int g0/0', 'ipv6 address fe80::1 link-local', 'int g0/2', 'ipv6 address 2001:db8:acad:3::/64 eui-64', 'exit', 'ipv6 route 2001:db8:acad:2::/64 g0/1 fe80::2', 'ipv6 route ::/0 2001:db8:acad:12::2', 'end');
  const brief = run('R1', 'show ipv6 interface brief');
  assert.match(brief, /GigabitEthernet0\/0\s+\[up\/up\]\n {4}FE80::1\n {4}2001:DB8:ACAD:1::1/);
  assert.match(brief, /GigabitEthernet0\/2\s+\[administratively down\/down\]/);
  const rt = run('R1', 'show ipv6 route');
  assert.match(rt, /C   2001:DB8:ACAD:1::\/64 \[0\/0\]\n {5}via GigabitEthernet0\/0, directly connected/);
  assert.match(rt, /L   2001:DB8:ACAD:1::1\/128 \[0\/0\]/);
  assert.match(rt, /S   ::\/0 \[1\/0\]\n {5}via 2001:DB8:ACAD:12::2/);
  assert.match(rt, /S   2001:DB8:ACAD:2::\/64 \[1\/0\]\n {5}via FE80::2, GigabitEthernet0\/1/);
  const rc = runningConfig(world.devices.R1);
  assert.match(rc, /\nipv6 unicast-routing\n/);
  assert.match(rc, /interface GigabitEthernet0\/0\n no ip address\n ipv6 address FE80::1 link-local\n ipv6 address 2001:DB8:ACAD:1::1\/64/);
  assert.match(rc, / ipv6 address 2001:DB8:ACAD:3::\/64 eui-64/);
  assert.match(rc, /\nipv6 route ::\/0 2001:DB8:ACAD:12::2\n/);
  const ifo = run('R1', 'show ipv6 interface g0/0');
  assert.match(ifo, /link-local address is FE80::1/);
  assert.match(ifo, /FF02::2/, 'a routing router joins all-routers');
  assert.match(ifo, /FF02::1:FF00:1/);
});

test('IPv6 config errors read the way IOS writes them', () => {
  const { run } = net();
  assert.match(run('R1', 'conf t', 'ipv6 route 2001:db8::/32 fe80::2'), /Interface has to be specified/);
  assert.match(run('R1', 'int g0/2', 'ipv6 address 2001:db8:acad:1::5/64'), /overlaps with GigabitEthernet0\/0/);
  run('R1', 'no ipv6 address 2001:db8:acad:1::5/64', 'int g0/0', 'no ipv6 address 2001:db8:acad:1::1/64', 'end');
  assert.doesNotMatch(run('R1', 'show ipv6 interface brief'), /ACAD:1::1/);
});

test('router ping ipv6 and a link-local ping asks for the interface', () => {
  const { run, world, s } = net();
  assert.match(run('R1', 'ping 2001:db8:acad:12::2'), /!!!!!/);
  assert.match(run('R1', 'ping ipv6 2001:db8:acad:2::1'), /No valid route/);
  const ll = format6(v6Of(world, 'R2', 'GigabitEthernet0/0').ll);
  run('R1', `ping ${ll}`);
  assert.equal(prompt(s.R1), 'Output Interface: ');
  assert.match(run('R1', 'GigabitEthernet0/1'), /!!!!!/);
  assert.ok(!ping6(world, 'R1', parse6(ll), 'GigabitEthernet0/0').ok, 'that link-local is on the other wire');
});
