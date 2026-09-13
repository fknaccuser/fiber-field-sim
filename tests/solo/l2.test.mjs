import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkUsable, layer2Reachable } from '../../src/solo/forward.js';
import { createHealthyLayout } from '../../src/solo/layouts.js';

const PC1 = { deviceId: 'PC1', portId: 'PC1:eth0', vlanId: null };
const PC2 = { deviceId: 'PC2', portId: 'PC2:eth0', vlanId: null };
const R1_VLAN10 = { deviceId: 'R1', portId: 'R1:Gi0/0', vlanId: 10 };
const R1_VLAN20 = { deviceId: 'R1', portId: 'R1:Gi0/0', vlanId: 20 };

function br() {
  return createHealthyLayout('BR', 42, 130);
}

test('linkUsable is true for a healthy connected link', () => {
  const network = br();
  assert.equal(linkUsable(network, 'L1'), true);
});

test('linkUsable is false when the link is disconnected', () => {
  const network = br();
  network.links.find((l) => l.id === 'L1').connected = false;
  assert.equal(linkUsable(network, 'L1'), false);
});

test('linkUsable is false when either end is administratively down', () => {
  const network = br();
  network.ports.find((p) => p.id === 'SW1:Gi0/1').adminUp = false;
  assert.equal(linkUsable(network, 'L1'), false);
});

test('linkUsable is false when either device is unpowered', () => {
  const network = br();
  network.devices.find((d) => d.id === 'SW1').powered = false;
  assert.equal(linkUsable(network, 'L1'), false);
});

test('a healthy PC1 reaches the router VLAN10 segment over L2', () => {
  const network = br();
  assert.equal(layer2Reachable(network, PC1, R1_VLAN10), true);
});

test('a healthy PC2 reaches the router VLAN20 segment over L2', () => {
  const network = br();
  assert.equal(layer2Reachable(network, PC2, R1_VLAN20), true);
});

test('P1: a disconnected target cable blocks the L2 path', () => {
  const network = br();
  network.links.find((l) => l.id === 'L1').connected = false;
  assert.equal(layer2Reachable(network, PC1, R1_VLAN10), false);
});

test('P2: an administratively shut target switch port blocks the L2 path', () => {
  const network = br();
  network.ports.find((p) => p.id === 'SW1:Gi0/1').adminUp = false;
  assert.equal(layer2Reachable(network, PC1, R1_VLAN10), false);
});

test('V1: an access VLAN mismatch blocks the L2 path to the intended segment', () => {
  const network = br();
  network.ports.find((p) => p.id === 'SW1:Gi0/1').accessVlan = 20;
  assert.equal(layer2Reachable(network, PC1, R1_VLAN10), false);
});

test('V2: removing trunk VLAN10 blocks its LAN path while VLAN20 stays usable', () => {
  const network = br();
  const trunkPort = network.ports.find((p) => p.id === 'SW1:Gi0/24');
  trunkPort.allowedVlans = trunkPort.allowedVlans.filter((v) => v !== 10);
  assert.equal(layer2Reachable(network, PC1, R1_VLAN10), false);
  assert.equal(layer2Reachable(network, PC2, R1_VLAN20), true);
});

test('layer2Reachable is false when the source port itself does not exist', () => {
  const network = br();
  assert.equal(layer2Reachable(network, { deviceId: 'PC1', portId: 'nope', vlanId: null }, R1_VLAN10), false);
});
