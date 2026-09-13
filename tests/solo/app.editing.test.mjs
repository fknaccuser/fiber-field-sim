import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startConfigureSession,
  createInitialState,
  applyMissionActions,
  beginReconnect,
  chooseReconnectSource,
  cancelReconnect,
  confirmReconnect,
  recordTestEvent,
} from '../../src/solo/app.js';
import { runMissionTest } from '../../src/solo/devices.js';
import { testService } from '../../src/solo/forward.js';

function br() {
  return startConfigureSession(createInitialState(), 'BR');
}

// --- applyMissionActions ---

test('applyMissionActions applies a valid change and records a change event', () => {
  const state = br();
  const { state: next, result } = applyMissionActions(
    state,
    [{ type: 'setClientGateway', deviceId: 'PC1', gateway: '10.42.10.254' }],
    { deviceId: 'PC1' },
  );
  assert.equal(result.ok, true);
  assert.equal(next.mission.network.devices.find((d) => d.id === 'PC1').gateway, '10.42.10.254');
  assert.equal(next.mission.events.length, 1);
  assert.equal(next.mission.events[0].kind, 'change');
  assert.equal(next.mission.events[0].deviceId, 'PC1');
  assert.equal(next.mission.events[0].details.before.gateway, '10.42.10.1');
  assert.equal(next.mission.events[0].details.after.gateway, '10.42.10.254');
});

test('applyMissionActions rejects an invalid action and returns the original state unchanged', () => {
  const state = br();
  const { state: next, result } = applyMissionActions(state, [
    { type: 'setClientGateway', deviceId: 'PC1', gateway: 'not-an-ip' },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_IP');
  assert.equal(next, state);
  assert.equal(next.mission.events.length, 0);
});

test('applyMissionActions setting a valid but wrong gateway causes a real failed test afterward', () => {
  const state = br();
  const { state: next, result } = applyMissionActions(state, [
    { type: 'setClientGateway', deviceId: 'PC1', gateway: '10.42.10.254' },
  ]);
  assert.equal(result.ok, true);
  const service = testService(next.mission.network, 'PC1', next.mission.targetName);
  assert.equal(service.ok, false);
});

test('applyMissionActions is a no-op with zero actions', () => {
  const state = br();
  const { state: next, result } = applyMissionActions(state, []);
  assert.equal(result.ok, true);
  assert.equal(next, state);
});

// --- Reconnect flow ---

test('reconnect flow: begin, choose source, choose destination, confirm fixes a disconnected cable (P1)', () => {
  let state = br();
  state = applyMissionActions(state, [{ type: 'setLinkConnected', linkId: 'L1', connected: false }]).state;
  assert.equal(testService(state.mission.network, 'PC1', state.mission.targetName).ok, false);

  state = beginReconnect(state, 'L1');
  assert.deepEqual(state.reconnect, { linkId: 'L1', sourcePortId: null });

  state = chooseReconnectSource(state, 'PC1:eth0');
  assert.equal(state.reconnect.sourcePortId, 'PC1:eth0');

  const { state: reconnected, result } = confirmReconnect(state, 'SW1:Gi0/1');
  assert.equal(result.ok, true);
  assert.equal(reconnected.reconnect, null);
  assert.equal(reconnected.mission.network.links.find((l) => l.id === 'L1').connected, true);
  assert.equal(testService(reconnected.mission.network, 'PC1', reconnected.mission.targetName).ok, true);
});

test('reconnect to an already-occupied port is rejected and the reconnect flow stays open', () => {
  let state = br();
  state = beginReconnect(state, 'L2'); // PC2's cable
  state = chooseReconnectSource(state, 'PC2:eth0');
  const { state: next, result } = confirmReconnect(state, 'SW1:Gi0/1'); // occupied by L1
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PORT_ALREADY_USED');
  assert.notEqual(next.reconnect, null, 'reconnect flow is not silently cleared on failure');
});

test('cancelReconnect clears the flow without changing the network', () => {
  const state = br();
  const started = beginReconnect(state, 'L1');
  const cancelled = cancelReconnect(started);
  assert.equal(cancelled.reconnect, null);
  assert.deepEqual(cancelled.mission.network, state.mission.network);
});

test('confirmReconnect without a chosen source is rejected', () => {
  const state = beginReconnect(br(), 'L1');
  const { result } = confirmReconnect(state, 'SW1:Gi0/1');
  assert.equal(result.ok, false);
});

// --- Test events ---

test('recordTestEvent appends a test event with the real result', () => {
  let state = br();
  const result = runMissionTest(state.mission, 'pingGateway', 'PC1');
  state = recordTestEvent(state, 'pingGateway', 'PC1', result);
  assert.equal(state.mission.events.length, 1);
  assert.equal(state.mission.events[0].kind, 'test');
  assert.equal(state.mission.events[0].details.testKind, 'pingGateway');
  assert.equal(state.mission.events[0].details.result.ok, true);
});

test('GUI changes affect actual recorded tests: breaking then fixing the link changes the test outcome', () => {
  let state = br();
  const before = recordTestEvent(state, 'openPortal', 'PC1', runMissionTest(state.mission, 'openPortal', 'PC1'));
  assert.equal(before.mission.events[0].details.result.ok, true);

  state = applyMissionActions(state, [{ type: 'setLinkConnected', linkId: 'L1', connected: false }]).state;
  const after = recordTestEvent(state, 'openPortal', 'PC1', runMissionTest(state.mission, 'openPortal', 'PC1'));
  assert.equal(after.mission.events.at(-1).details.result.ok, false);
});
