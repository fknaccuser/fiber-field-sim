import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainDevice, explainPort, parseInterface, explainConcept, explainCable, explainTest } from '../../src/solo/mentor.js';

test('devices are explained by role name first, then fall back to kind', () => {
  const named = explainDevice({ name: 'Access switch', kind: 'switch' });
  assert.equal(named.title, 'Access Switch');
  assert.equal(named.tag, 'Layer 2');
  assert.match(named.plain, /power strip|plugs into/i);

  const distribution = explainDevice({ name: 'Distribution switch', kind: 'switch' });
  assert.equal(distribution.tag, 'Layer 3');

  // A site-/label-prefixed display name still resolves to the base role.
  const prefixed = explainDevice({ name: 'site: Access switch', kind: 'switch' });
  assert.equal(prefixed.title, 'Access Switch');
  const gateway = explainDevice({ name: 'Customer: Gateway', kind: 'router' });
  assert.equal(gateway.title, 'Gateway Router');

  // Unknown name → generic kind explanation, never empty.
  const generic = explainDevice({ name: 'Spare gizmo', kind: 'router' });
  assert.equal(generic.title, 'Router');
  assert.ok(generic.plain.length > 20);
});

test('interface labels parse into media family, speed, and slot/port numbers', () => {
  assert.deepEqual(parseInterface('Gi0/0'), { label: 'Gi0/0', family: 'GigabitEthernet', speed: '1 Gbps', numbers: [0, 0] });
  assert.deepEqual(parseInterface('Gi0/0/0').numbers, [0, 0, 0]);
  assert.equal(parseInterface('Te1/1').speed, '10 Gbps');
  assert.equal(parseInterface('eth0').family, 'Ethernet');
});

test('a port explanation reflects up/down state and access-vs-trunk role', () => {
  const access = explainPort({ label: 'Gi0/1', adminUp: true, mode: 'access', accessVlan: 10 }, { name: 'Access switch' });
  assert.match(access.status, /Up/);
  assert.match(access.status, /1 Gbps/);
  assert.match(access.note, /access port/i);
  assert.match(access.note, /VLAN 10/);

  const trunk = explainPort({ label: 'Gi0/24', adminUp: false, mode: 'trunk', allowedVlans: [10, 20] }, { name: 'Access switch' });
  assert.match(trunk.status, /Administratively down/);
  assert.match(trunk.note, /trunk port/i);
  assert.match(trunk.note, /10, 20/);
  // Two-number labels read slot/port; three-number labels read slot/module/port.
  assert.match(trunk.plain, /Slot 0, Port 24/);
  const threeNum = explainPort({ label: 'Gi0/0/0', adminUp: true, mode: 'routed' }, { name: 'Gateway' });
  assert.match(threeNum.plain, /Slot 0, Module 0, Port 0/);

  const nic = explainPort({ label: 'eth0', adminUp: true, mode: 'routed' }, { name: 'Customer workstation' });
  assert.match(nic.plain, /network card/i);
});

test('core concepts have plain-language explanations', () => {
  assert.match(explainConcept('vlan').plain, /virtual networks|VLAN/i);
  assert.match(explainConcept('gateway').plain, /way out|router/i);
  assert.equal(explainConcept('nonsense'), null);
});

test('console, command builder, findings and tests concepts are explained', () => {
  for (const key of ['console', 'commandBuilder', 'findings', 'tests']) {
    const c = explainConcept(key);
    assert.ok(c && c.title && c.plain.length > 20, `${key} concept`);
  }
});

test('a cable explanation names its endpoints and reflects connection state', () => {
  const up = explainCable({ connected: true }, { aName: 'Access switch', bName: 'Gateway' });
  assert.match(up.plain, /Access switch/);
  assert.match(up.plain, /Gateway/);
  assert.match(up.tag, /up/);
  assert.match(up.note, /higher up|not the cable/i);

  const down = explainCable({ connected: false }, {});
  assert.match(down.title, /Disconnected/);
  assert.match(down.tag, /down/);
  assert.match(down.note, /DOWN|reconnect/);
});

test('each verification test button has its own plain-language meaning', () => {
  for (const id of ['pingGateway', 'pingServer', 'resolvePortal', 'openPortal', 'checkProtected']) {
    const t = explainTest(id);
    assert.ok(t && t.title.startsWith('Test:') && t.plain.length > 20, `${id} test`);
  }
  assert.match(explainTest('openPortal').plain, /end-to-end|user cares|all/i);
  assert.equal(explainTest('unknown'), null);
});
