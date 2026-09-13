import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateNetwork, cloneNetwork } from '../../src/solo/model.js';
import { createHealthyLayout, deriveRequirements } from '../../src/solo/layouts.js';

test('BR has six devices and five links, and validates', () => {
  const br = createHealthyLayout('BR', 42, 130);
  assert.equal(br.devices.length, 6);
  assert.equal(br.links.length, 5);
  assert.deepEqual(validateNetwork(br), { ok: true });
});

test('BR at x=42, host=130 reproduces the supplied golden fixture', () => {
  const br = createHealthyLayout('BR', 42, 130);
  const pc1 = br.devices.find((d) => d.id === 'PC1');
  assert.equal(pc1.ip, '10.42.10.130');
  const pc2 = br.devices.find((d) => d.id === 'PC2');
  assert.equal(pc2.ip, '10.42.20.20');
  const router = br.devices.find((d) => d.id === 'R1');
  assert.deepEqual(
    router.routerSegments.map((s) => s.ip),
    ['10.42.10.1', '10.42.20.1', '10.42.30.1'],
  );
  assert.equal(br.dnsRecords[0].address, '10.42.30.53');
});

test('HM has five devices and validates', () => {
  const hm = createHealthyLayout('HM', 7, 135);
  assert.equal(hm.devices.length, 5);
  assert.equal(hm.devices.some((d) => d.id === 'SW2'), false);
  assert.deepEqual(validateNetwork(hm), { ok: true });
});

test('OF has seven devices and validates', () => {
  const of_ = createHealthyLayout('OF', 99, 140);
  assert.equal(of_.devices.length, 7);
  assert.ok(of_.devices.some((d) => d.id === 'PC3'));
  const pc3 = of_.devices.find((d) => d.id === 'PC3');
  assert.equal(pc3.ip, '10.99.10.150');
  assert.deepEqual(validateNetwork(of_), { ok: true });
});

test('createHealthyLayout substitutes x into every 10.X.*.* address', () => {
  const br = createHealthyLayout('BR', 17, 130);
  assert.equal(br.devices.find((d) => d.id === 'S1').ip, '10.17.30.53');
  assert.equal(br.dnsRecords[0].address, '10.17.30.53');
});

test('changing the clone never changes the source', () => {
  const source = createHealthyLayout('BR', 42, 130);
  const clone = cloneNetwork(source);
  clone.devices[0].ip = '10.42.10.200';
  clone.links.push({ id: 'bogus', aPortId: 'x', bPortId: 'y', connected: false });
  clone.revision = 999;
  assert.notEqual(source.devices[0].ip, '10.42.10.200');
  assert.equal(source.links.length, 5);
  assert.equal(source.revision, 0);
});

test('wrong gateway is valid structure', () => {
  const network = createHealthyLayout('BR', 42, 130);
  network.devices.find((d) => d.id === 'PC1').gateway = '10.42.10.254';
  assert.deepEqual(validateNetwork(network), { ok: true });
});

test('missing device ID is invalid', () => {
  const network = createHealthyLayout('BR', 42, 130);
  delete network.devices[0].id;
  const result = validateNetwork(network);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'MISSING_ID');
});

test('a duplicate device id is invalid', () => {
  const network = createHealthyLayout('BR', 42, 130);
  network.devices[1].id = network.devices[0].id;
  const result = validateNetwork(network);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DUPLICATE_ID');
});

test('a link referencing an unknown port is invalid', () => {
  const network = createHealthyLayout('BR', 42, 130);
  network.links[0].bPortId = 'NoSuchPort';
  const result = validateNetwork(network);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_PORT_REF');
});

test('a port referencing an unknown device is invalid', () => {
  const network = createHealthyLayout('BR', 42, 130);
  network.ports[0].deviceId = 'NoSuchDevice';
  const result = validateNetwork(network);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_DEVICE_REF');
});

test('a second router is invalid (single-router limit)', () => {
  const network = createHealthyLayout('BR', 42, 130);
  const secondRouter = { ...network.devices.find((d) => d.id === 'R1'), id: 'R2' };
  network.devices.push(secondRouter);
  const result = validateNetwork(network);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'MULTIPLE_ROUTERS');
});

test('a link closing a physical loop is rejected (cycle rejection)', () => {
  const network = createHealthyLayout('BR', 42, 130);
  // R1:Gi0/1 <-> S1:eth0 already exists (L5); add a second path S1 back to SW1
  // by reusing S1's only port is not possible without a free port, so wire a
  // fresh pair of ports across an already-connected pair of devices instead.
  network.ports.push(
    { id: 'SW1:Gi0/5', deviceId: 'SW1', label: 'Gi0/5', adminUp: true, mode: 'access', accessVlan: 10, allowedVlans: [], nativeVlan: 1 },
    { id: 'R1:Gi0/2', deviceId: 'R1', label: 'Gi0/2', adminUp: true, mode: 'access', accessVlan: 10, allowedVlans: [], nativeVlan: 1 },
  );
  network.links.push({ id: 'Lcycle', aPortId: 'SW1:Gi0/5', bPortId: 'R1:Gi0/2', connected: true });
  const result = validateNetwork(network);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CYCLE_DETECTED');
});

test('a router segment overlapping another segment is rejected', () => {
  const network = createHealthyLayout('BR', 42, 130);
  const router = network.devices.find((d) => d.id === 'R1');
  router.routerSegments[1].ip = '10.42.10.5'; // same /24 as the first segment
  const result = validateNetwork(network);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SEGMENT_OVERLAP');
});

test('a malformed IPv4 address is invalid', () => {
  const network = createHealthyLayout('BR', 42, 130);
  network.devices.find((d) => d.id === 'PC1').ip = 'not-an-ip';
  const result = validateNetwork(network);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_IP');
});

test('a .255 host address on a /24 is invalid', () => {
  const network = createHealthyLayout('BR', 42, 130);
  network.devices.find((d) => d.id === 'PC1').ip = '10.42.10.255';
  const result = validateNetwork(network);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'HOST_RESERVED');
});

test('createHealthyLayout rejects an out-of-range x or host', () => {
  assert.throws(() => createHealthyLayout('BR', 0, 130));
  assert.throws(() => createHealthyLayout('BR', 42, 129));
  assert.throws(() => createHealthyLayout('WX', 42, 130));
});

test('deriveRequirements reads VLANs from the switch access port, not the ignored client-port field', () => {
  // Regression: a client's own port is always "routed" with an ignored
  // accessVlan (ENGINE_RULES.md's binding clarifications) copied verbatim
  // from the golden fixture, which happens to read 10 for both PC1 and PC2 —
  // masking a bug where protectedVlan silently read as 10 instead of 20.
  for (const layoutId of ['HM', 'BR', 'OF']) {
    const network = createHealthyLayout(layoutId, 33, 140);
    const requirements = deriveRequirements(network);
    assert.equal(requirements.targetVlan, 10, layoutId);
    assert.equal(requirements.protectedVlan, 20, layoutId);
  }
});
