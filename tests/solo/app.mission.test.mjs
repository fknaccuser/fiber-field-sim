import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  createConfigureAttempt,
  startConfigureSession,
  exitMission,
  selectDevice,
} from '../../src/solo/app.js';

test('createConfigureAttempt builds a configure-mode Attempt from a healthy layout', () => {
  const attempt = createConfigureAttempt('BR');
  assert.equal(attempt.mode, 'configure');
  assert.equal(attempt.status, 'active');
  assert.deepEqual(attempt.network, attempt.initialNetwork);
  assert.notEqual(attempt.network, attempt.initialNetwork, 'clones, not the same reference');
  assert.equal(attempt.requirements.targetSubnet, '10.42.10.0');
  assert.equal(attempt.requirements.protectedSubnet, '10.42.20.0');
  assert.equal(attempt.requirements.portalServerId, 'S1');
  assert.equal(typeof attempt.id, 'string');
  assert.equal(typeof attempt.startedAt, 'string');
});

test('startConfigureSession moves to the mission screen with a fresh selection', () => {
  const state = { ...createInitialState(), screen: 'home', selectedDeviceId: 'PC1', recentDevices: ['PC1'] };
  const next = startConfigureSession(state, 'HM');
  assert.equal(next.screen, 'mission');
  assert.equal(next.mission.mode, 'configure');
  assert.equal(next.mission.network.layoutId, 'HM');
  assert.equal(next.selectedDeviceId, null);
  assert.deepEqual(next.recentDevices, []);
});

test('startConfigureSession rejects an unknown layout', () => {
  const state = createInitialState();
  const next = startConfigureSession(state, 'NOPE');
  assert.equal(next, state);
});

test('exitMission returns to Home but keeps the mission resumable (current device and history intact)', () => {
  const started = startConfigureSession(createInitialState(), 'BR');
  const withSelection = selectDevice(started, 'PC1');
  // exitMission also pauses the elapsed-time timer (S12), which legitimately
  // produces a new mission object (updated elapsedMs); compare identity apart
  // from that field rather than the whole object's reference.
  const exited = exitMission(withSelection);
  assert.equal(exited.screen, 'home');
  assert.equal(exited.mission.id, withSelection.mission.id);
  assert.deepEqual(exited.mission.network, withSelection.mission.network);
  assert.equal(exited.selectedDeviceId, 'PC1');
  assert.deepEqual(exited.recentDevices, ['PC1']);
});

test('selectDevice is a no-op without an active mission', () => {
  const state = createInitialState();
  const next = selectDevice(state, 'PC1');
  assert.equal(next, state);
});

test('selectDevice rejects a device not present in the current network', () => {
  const started = startConfigureSession(createInitialState(), 'HM');
  const next = selectDevice(started, 'SW2'); // HM has no SW2
  assert.equal(next, started);
});

test('selectDevice tracks recent devices, most-recent-first, deduplicated, capped at 4', () => {
  let state = startConfigureSession(createInitialState(), 'OF');
  for (const id of ['PC1', 'PC2', 'SW1', 'SW2', 'R1', 'PC1']) {
    state = selectDevice(state, id);
  }
  assert.equal(state.selectedDeviceId, 'PC1');
  assert.deepEqual(state.recentDevices, ['PC1', 'R1', 'SW2', 'SW1']);
  assert.equal(state.recentDevices.length, 4);
});

test('every device in each layout is a valid selectDevice target', () => {
  for (const layoutId of ['HM', 'BR', 'OF']) {
    let state = startConfigureSession(createInitialState(), layoutId);
    for (const device of state.mission.network.devices) {
      state = selectDevice(state, device.id);
      assert.equal(state.selectedDeviceId, device.id, `${layoutId}/${device.id}`);
    }
  }
});
