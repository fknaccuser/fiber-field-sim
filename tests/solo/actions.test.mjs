import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../../src/solo/actions.js';
import { createHealthyLayout } from '../../src/solo/layouts.js';
import { testService, canReach } from '../../src/solo/forward.js';

function br() {
  return createHealthyLayout('BR', 42, 130);
}

// --- setLinkConnected ---

test('setLinkConnected: valid disconnect increments revision', () => {
  const network = br();
  const result = applyAction(network, { type: 'setLinkConnected', linkId: 'L1', connected: false });
  assert.equal(result.ok, true);
  assert.equal(result.state.revision, network.revision + 1);
  assert.equal(result.state.links.find((l) => l.id === 'L1').connected, false);
});

test('setLinkConnected: unknown link is rejected and state is unchanged', () => {
  const network = br();
  const result = applyAction(network, { type: 'setLinkConnected', linkId: 'nope', connected: false });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_ID');
  assert.deepEqual(result.state, network);
});

// --- moveCable ---

test('moveCable: valid move to a free port', () => {
  const network = br();
  const result = applyAction(network, { type: 'moveCable', linkId: 'L2', aPortId: 'PC2:eth0', bPortId: 'SW1:Gi0/3' });
  assert.equal(result.ok, true);
  const moved = result.state.links.find((l) => l.id === 'L2');
  assert.equal(moved.bPortId, 'SW1:Gi0/3');
});

test('moveCable: a move onto a port already used by another link is rejected unchanged', () => {
  const network = br();
  const result = applyAction(network, { type: 'moveCable', linkId: 'L2', aPortId: 'PC2:eth0', bPortId: 'SW1:Gi0/1' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PORT_ALREADY_USED');
  assert.deepEqual(result.state, network);
});

test('moveCable: a move that would close a physical loop is rejected', () => {
  const network = br();
  // SW1 and R1 are already connected via SW1-SW2-R1 (L3, L4). Add two free
  // ports and relocate L1 onto them: that wires SW1 directly to R1 a second
  // way, closing a loop, even though PC1's own connectivity is irrelevant to
  // what's being tested here.
  network.ports.push(
    { id: 'SW1:Gi0/5', deviceId: 'SW1', label: 'Gi0/5', adminUp: true, mode: 'access', accessVlan: 10, allowedVlans: [], nativeVlan: 1 },
    { id: 'R1:Gi0/2', deviceId: 'R1', label: 'Gi0/2', adminUp: true, mode: 'access', accessVlan: 10, allowedVlans: [], nativeVlan: 1 },
  );
  const result = applyAction(network, { type: 'moveCable', linkId: 'L1', aPortId: 'SW1:Gi0/5', bPortId: 'R1:Gi0/2' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CYCLE_DETECTED');
});

// --- setPortAdmin ---

test('setPortAdmin: shutdown breaks connectivity, no shutdown restores it', () => {
  const network = br();
  assert.equal(testService(network, 'PC1', 'portal.northline.test').ok, true);

  const down = applyAction(network, { type: 'setPortAdmin', portId: 'SW1:Gi0/1', adminUp: false });
  assert.equal(down.ok, true);
  assert.equal(testService(down.state, 'PC1', 'portal.northline.test').ok, false);

  const up = applyAction(down.state, { type: 'setPortAdmin', portId: 'SW1:Gi0/1', adminUp: true });
  assert.equal(up.ok, true);
  assert.equal(testService(up.state, 'PC1', 'portal.northline.test').ok, true);
});

test('setPortAdmin: unknown port is rejected', () => {
  const network = br();
  const result = applyAction(network, { type: 'setPortAdmin', portId: 'nope', adminUp: false });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_ID');
});

// --- setAccessVlan ---

test('setAccessVlan: valid change on an access port', () => {
  const network = br();
  const result = applyAction(network, { type: 'setAccessVlan', portId: 'SW1:Gi0/3', vlanId: 20 });
  assert.equal(result.ok, true);
  assert.equal(result.state.revision, network.revision + 1);
  assert.equal(result.state.ports.find((p) => p.id === 'SW1:Gi0/3').accessVlan, 20);
});

test('setAccessVlan: rejects a trunk port and an out-of-range VLAN', () => {
  const network = br();
  const wrongMode = applyAction(network, { type: 'setAccessVlan', portId: 'SW1:Gi0/24', vlanId: 10 });
  assert.equal(wrongMode.ok, false);
  assert.equal(wrongMode.code, 'PORT_MODE_MISMATCH');
  const outOfRange = applyAction(network, { type: 'setAccessVlan', portId: 'SW1:Gi0/1', vlanId: 5000 });
  assert.equal(outOfRange.ok, false);
  assert.equal(outOfRange.code, 'INVALID_VLAN');
});

// --- setTrunkAllowedVlans ---

test('setTrunkAllowedVlans: removing VLAN10 blocks PC1 while PC2 stays fine', () => {
  const network = br();
  const result = applyAction(network, { type: 'setTrunkAllowedVlans', portId: 'SW1:Gi0/24', vlans: [20] });
  assert.equal(result.ok, true);
  assert.equal(testService(result.state, 'PC1', 'portal.northline.test').ok, false);
  assert.equal(testService(result.state, 'PC2', 'portal.northline.test').ok, true);
});

test('setTrunkAllowedVlans: rejects an access port and a malformed VLAN list', () => {
  const network = br();
  const wrongMode = applyAction(network, { type: 'setTrunkAllowedVlans', portId: 'SW1:Gi0/1', vlans: [10] });
  assert.equal(wrongMode.ok, false);
  assert.equal(wrongMode.code, 'PORT_MODE_MISMATCH');
  const malformed = applyAction(network, { type: 'setTrunkAllowedVlans', portId: 'SW1:Gi0/24', vlans: [10, 99999] });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, 'INVALID_VLAN');
});

// --- setClientAddress ---

test('setClientAddress: a valid unused address in the intended subnet passes', () => {
  const network = br();
  const result = applyAction(network, { type: 'setClientAddress', deviceId: 'PC1', ip: '10.42.10.140', prefix: 24 });
  assert.equal(result.ok, true);
  assert.equal(testService(result.state, 'PC1', 'portal.northline.test').ok, true);
});

test('setClientAddress: rejects a malformed IP and a non-client target', () => {
  const network = br();
  const malformed = applyAction(network, { type: 'setClientAddress', deviceId: 'PC1', ip: 'nope', prefix: 24 });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, 'INVALID_IP');
  const wrongTarget = applyAction(network, { type: 'setClientAddress', deviceId: 'S1', ip: '10.42.30.60', prefix: 24 });
  assert.equal(wrongTarget.ok, false);
  assert.equal(wrongTarget.code, 'INVALID_TARGET');
});

// --- setClientGateway ---

test('setClientGateway: a wrong but syntactically valid gateway can be saved and diagnosed', () => {
  const network = br();
  const result = applyAction(network, { type: 'setClientGateway', deviceId: 'PC1', gateway: '10.42.10.254' });
  assert.equal(result.ok, true);
  assert.equal(result.state.devices.find((d) => d.id === 'PC1').gateway, '10.42.10.254');
  const service = testService(result.state, 'PC1', 'portal.northline.test');
  assert.equal(service.ok, false);
  assert.equal(service.code, 'DNS_UNREACHABLE');
  const direct = canReach(result.state, 'PC1', '10.42.30.53');
  assert.equal(direct.code, 'GATEWAY_UNREACHABLE');
});

test('setClientGateway: rejects a malformed gateway', () => {
  const network = br();
  const result = applyAction(network, { type: 'setClientGateway', deviceId: 'PC1', gateway: 'nope' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_IP');
});

// --- setClientDns ---

test('setClientDns: valid change to an unreachable resolver', () => {
  const network = br();
  const result = applyAction(network, { type: 'setClientDns', deviceId: 'PC1', dns: '10.42.30.54' });
  assert.equal(result.ok, true);
  assert.equal(testService(result.state, 'PC1', 'portal.northline.test').ok, false);
});

test('setClientDns: rejects a malformed DNS address', () => {
  const network = br();
  const result = applyAction(network, { type: 'setClientDns', deviceId: 'PC1', dns: 'nope' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_IP');
});

// --- setRouterSegmentAddress ---

test('setRouterSegmentAddress: valid change to the target LAN segment', () => {
  const network = br();
  const result = applyAction(network, {
    type: 'setRouterSegmentAddress',
    deviceId: 'R1',
    portId: 'R1:Gi0/0',
    vlanId: 10,
    ip: '10.42.10.2',
    prefix: 24,
  });
  assert.equal(result.ok, true);
  const segment = result.state.devices.find((d) => d.id === 'R1').routerSegments.find((s) => s.vlanId === 10);
  assert.equal(segment.ip, '10.42.10.2');
});

test('setRouterSegmentAddress: rejects an overlap with another segment', () => {
  const network = br();
  const result = applyAction(network, {
    type: 'setRouterSegmentAddress',
    deviceId: 'R1',
    portId: 'R1:Gi0/0',
    vlanId: 20,
    ip: '10.42.10.9',
    prefix: 24,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SEGMENT_OVERLAP');
});

// --- setDnsRecord ---

test('setDnsRecord: restoring the portal record fixes D2', () => {
  let network = br();
  network = applyAction(network, {
    type: 'setDnsRecord',
    serverId: 'S1',
    name: 'portal.northline.test',
    address: '10.42.30.80',
  }).state;
  assert.equal(testService(network, 'PC1', 'portal.northline.test').ok, false);
  const restored = applyAction(network, {
    type: 'setDnsRecord',
    serverId: 'S1',
    name: 'portal.northline.test',
    address: '10.42.30.53',
  });
  assert.equal(restored.ok, true);
  assert.equal(testService(restored.state, 'PC1', 'portal.northline.test').ok, true);
});

test('setDnsRecord: rejects an unknown record name', () => {
  const network = br();
  const result = applyAction(network, {
    type: 'setDnsRecord',
    serverId: 'S1',
    name: 'nowhere.example.test',
    address: '10.42.30.53',
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_ID');
});

// --- cross-cutting behavior ---

test('applying a no-op preserves revision', () => {
  const network = br();
  const result = applyAction(network, { type: 'setLinkConnected', linkId: 'L1', connected: true });
  assert.equal(result.ok, true);
  assert.equal(result.state.revision, network.revision);
});

test('an unknown action type is rejected and state is unchanged', () => {
  const network = br();
  const result = applyAction(network, { type: 'setWarpDrive', deviceId: 'PC1' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_ACTION');
  assert.deepEqual(result.state, network);
});

test('an unknown field on an otherwise valid action is rejected', () => {
  const network = br();
  const result = applyAction(network, { type: 'setLinkConnected', linkId: 'L1', connected: false, extra: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNKNOWN_FIELD');
});
