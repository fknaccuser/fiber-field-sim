import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  createInitialProfile,
  startConfigureSession,
  applyMissionActions,
  disconnectLink,
  beginReconnect,
  chooseReconnectSource,
  confirmReconnect,
  requestReset,
  cancelReset,
  confirmReset,
  setCompletionNote,
  completeRun,
} from '../../src/solo/app.js';
import { evaluateConfigureChecklist } from '../../src/solo/grade.js';

function configureState() {
  const state = { ...createInitialState(), profile: createInitialProfile(), screen: 'home' };
  return startConfigureSession(state, 'HM');
}

test('a fresh configure session starts healthy with requirements visible and passes its checklist', () => {
  const s = configureState();
  assert.equal(s.mission.mode, 'configure');
  assert.equal(s.mission.status, 'active');
  assert.ok(s.mission.requirements.targetSubnet);
  assert.ok(s.mission.requirements.protectedSubnet);
  const evaluation = evaluateConfigureChecklist(s.mission);
  assert.equal(evaluation.passed, true, JSON.stringify(evaluation.checks.filter((c) => !c.passed)));
});

test('disconnectLink unplugs a cable directly, without the full reconnect flow', () => {
  let s = configureState();
  const before = s.mission.network.links.find((l) => l.id === 'L1').connected;
  assert.equal(before, true);
  const { state: after, result } = disconnectLink(s, 'L1');
  assert.equal(result.ok, true);
  const link = after.mission.network.links.find((l) => l.id === 'L1');
  assert.equal(link.connected, false);
  // Breaking PC1's link now fails its checklist entry.
  const evaluation = evaluateConfigureChecklist(after.mission);
  assert.equal(evaluation.checks.find((c) => c.id === 'targetServicePasses').passed, false);
});

test('changing a supported field (client IP) breaks the checklist, and reconnecting/fixing restores it', () => {
  let s = configureState();
  s = applyMissionActions(s, [{ type: 'setClientAddress', deviceId: 'PC1', ip: '10.42.99.5', prefix: 24 }]).state;
  let evaluation = evaluateConfigureChecklist(s.mission);
  assert.equal(evaluation.checks.find((c) => c.id === 'targetInRequiredDepartment').passed, false);

  s = applyMissionActions(s, [{ type: 'setClientAddress', deviceId: 'PC1', ip: '10.42.10.55', prefix: 24 }]).state;
  evaluation = evaluateConfigureChecklist(s.mission);
  assert.equal(evaluation.passed, true, JSON.stringify(evaluation.checks.filter((c) => !c.passed)));
});

test('Reset requires confirmation and, once confirmed, restores the original healthy snapshot', () => {
  let s = configureState();
  s = disconnectLink(s, 'L1').state;
  s = applyMissionActions(s, [{ type: 'setClientAddress', deviceId: 'PC1', ip: '10.42.99.5', prefix: 24 }]).state;
  assert.equal(evaluateConfigureChecklist(s.mission).passed, false);

  // Requesting reset alone does not touch the network yet.
  const requested = requestReset(s);
  assert.equal(requested.pendingReset, true);
  assert.deepEqual(requested.mission.network, s.mission.network);

  // Cancelling leaves the broken network exactly as it was.
  const cancelled = cancelReset(requested);
  assert.equal(cancelled.pendingReset, false);
  assert.deepEqual(cancelled.mission.network, s.mission.network);

  // Confirming restores the initial healthy network and clears history.
  const reset = confirmReset(requested);
  assert.equal(reset.pendingReset, false);
  assert.deepEqual(reset.mission.network, reset.mission.initialNetwork);
  assert.deepEqual(reset.mission.events, []);
  assert.equal(reset.mission.status, 'active');
  assert.equal(evaluateConfigureChecklist(reset.mission).passed, true);
});

test('reconnecting a disconnected cable through the full flow restores service', () => {
  let s = configureState();
  s = disconnectLink(s, 'L1').state;
  s = beginReconnect(s, 'L1');
  s = chooseReconnectSource(s, 'PC1:eth0');
  const { state: after, result } = confirmReconnect(s, 'SW1:Gi0/1');
  assert.equal(result.ok, true);
  assert.equal(after.mission.network.links.find((l) => l.id === 'L1').connected, true);
});

test('a configure session can complete with documentation but awards no repair evidence', () => {
  let s = configureState();
  s = setCompletionNote(s, 'Verified both departments and portal access on the supplied network.');
  const { state: completed, result } = completeRun(s);
  assert.equal(result.ok, true);
  assert.equal(completed.mission.status, 'completed');
  assert.equal(completed.screen, 'debrief');
  // Repair progression does not change after a configure session.
  assert.deepEqual(completed.profile.counters, s.profile.counters);
  assert.deepEqual(completed.profile.evidence, s.profile.evidence);
  assert.deepEqual(completed.profile.completedRuns, s.profile.completedRuns);
});

test('a configure session can complete without any documentation at all', () => {
  const s = configureState(); // no note set
  const { result } = completeRun(s);
  assert.equal(result.ok, true, JSON.stringify(result.checks?.filter((c) => !c.passed)));
});

test('a configure session cannot complete while the checklist fails', () => {
  let s = configureState();
  s = disconnectLink(s, 'L1').state;
  const { state: after, result } = completeRun(s);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CHECKS_FAILED');
  assert.equal(after.mission.status, 'active');
});
