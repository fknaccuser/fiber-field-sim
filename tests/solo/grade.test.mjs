import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCompletion, summarizeRun } from '../../src/solo/grade.js';
import {
  attemptStartMission,
  createInitialState,
  createInitialProfile,
  selectDevice,
  toggleFinding,
  setCompletionNote,
  completeRun,
} from '../../src/solo/app.js';
import { applyMissionActions } from '../../src/solo/app.js';
import { runMissionTest } from '../../src/solo/devices.js';
import { recordTestEvent } from '../../src/solo/app.js';

function stateWithProfile() {
  return { ...createInitialState(), profile: createInitialProfile() };
}

function startP1() {
  return attemptStartMission(stateWithProfile(), 'TF1-HM-1-P-START'); // P1
}

function repairP1(state) {
  return applyMissionActions(state, [{ type: 'setLinkConnected', linkId: 'L1', connected: true }]).state;
}

function loggedCheckProtected(state) {
  const result = runMissionTest(state.mission, 'checkProtected', state.mission.protectedClientId);
  return recordTestEvent(state, 'checkProtected', state.mission.protectedClientId, result);
}

function loggedOpenPortal(state, deviceId = state.mission.targetClientId) {
  const result = runMissionTest(state.mission, 'openPortal', deviceId);
  return recordTestEvent(state, 'openPortal', deviceId, result);
}

function withGenuineFinding(state) {
  const withSelection = selectDevice(state, state.mission.targetClientId);
  const inspectionEvent = withSelection.mission.events.find((e) => e.kind === 'inspection');
  return toggleFinding(withSelection, inspectionEvent.id);
}

function fullyValidSubmission(state) {
  let s = repairP1(state);
  s = loggedOpenPortal(s);
  s = loggedCheckProtected(s);
  s = withGenuineFinding(s);
  s = setCompletionNote(s, 'Reconnected the workstation cable and verified portal access from both workstations.');
  return s;
}

test('a fully valid submission passes every check', () => {
  const s = fullyValidSubmission(startP1());
  const evaluation = evaluateCompletion(s.mission);
  assert.equal(evaluation.passed, true, JSON.stringify(evaluation.checks.filter((c) => !c.passed)));
});

test('target-only repair cannot complete (protected still broken)', () => {
  // Manually break the protected client's own path without touching the target.
  let s = startP1();
  s = repairP1(s);
  s = applyMissionActions(s, [{ type: 'setPortAdmin', portId: 'SW1:Gi0/2', adminUp: false }]).state;
  s = loggedOpenPortal(s);
  s = withGenuineFinding(s);
  s = setCompletionNote(s, 'Fixed only the target workstation cable.');
  const evaluation = evaluateCompletion(s.mission);
  assert.equal(evaluation.passed, false);
  const protectedCheck = evaluation.checks.find((c) => c.id === 'protectedServicePasses');
  assert.equal(protectedCheck.passed, false);
});

test('old successful tests after a new config change cannot complete', () => {
  let s = startP1();
  s = repairP1(s);
  s = loggedOpenPortal(s); // passes at this revision
  s = loggedCheckProtected(s);
  s = withGenuineFinding(s);
  s = setCompletionNote(s, 'Reconnected the cable and re-verified access for both workstations.');
  // Now make a further, unrelated config change that bumps the revision (an
  // unused switch port — no functional effect, but a real accepted change).
  const before = s.mission.network.revision;
  s = applyMissionActions(s, [{ type: 'setPortAdmin', portId: 'SW1:Gi0/3', adminUp: false }]).state;
  assert.notEqual(s.mission.network.revision, before, 'sanity: the revision actually moved');
  const evaluation = evaluateCompletion(s.mission);
  assert.equal(evaluation.passed, false);
  const targetVerified = evaluation.checks.find((c) => c.id === 'targetVerifiedAtCurrentRevision');
  assert.equal(targetVerified.passed, false, 'the stale test no longer counts at the new revision');
});

test('an alternate valid target IP can pass', () => {
  let s = startP1();
  s = repairP1(s);
  // Move the target to a different, still-valid unused host in its own subnet.
  s = applyMissionActions(s, [{ type: 'setClientAddress', deviceId: 'PC1', ip: '10.196.10.145', prefix: 24 }]).state;
  s = loggedOpenPortal(s);
  s = loggedCheckProtected(s);
  s = withGenuineFinding(s);
  s = setCompletionNote(s, 'Reconnected the cable, reassigned a valid address, verified both workstations.');
  const evaluation = evaluateCompletion(s.mission);
  assert.equal(evaluation.passed, true, JSON.stringify(evaluation.checks.filter((c) => !c.passed)));
});

test('moving the target client into the protected department cannot pass', () => {
  let s = startP1();
  s = repairP1(s);
  // Move PC1 onto the protected department's VLAN/subnet to "pass" by cheating.
  s = applyMissionActions(s, [
    { type: 'setAccessVlan', portId: 'SW1:Gi0/1', vlanId: s.mission.requirements.protectedVlan },
    { type: 'setClientAddress', deviceId: 'PC1', ip: '10.196.20.140', prefix: 24 },
    { type: 'setClientGateway', deviceId: 'PC1', gateway: s.mission.network.devices.find((d) => d.kind === 'router').routerSegments.find((seg) => seg.vlanId === s.mission.requirements.protectedVlan).ip },
  ]).state;
  s = loggedOpenPortal(s);
  s = loggedCheckProtected(s);
  s = withGenuineFinding(s);
  s = setCompletionNote(s, 'Moved the workstation to the other VLAN to get it working.');
  const evaluation = evaluateCompletion(s.mission);
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.checks.find((c) => c.id === 'targetInRequiredDepartment').passed, false);
});

test('a blank note cannot pass', () => {
  let s = startP1();
  s = repairP1(s);
  s = loggedOpenPortal(s);
  s = loggedCheckProtected(s);
  s = withGenuineFinding(s);
  s = setCompletionNote(s, '   ');
  const evaluation = evaluateCompletion(s.mission);
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.checks.find((c) => c.id === 'completionNoteLength').passed, false);
});

test('a fabricated finding id (not a captured event) is rejected', () => {
  let s = startP1();
  s = repairP1(s);
  s = loggedOpenPortal(s);
  s = loggedCheckProtected(s);
  s = toggleFinding(s, 'not-a-real-event-id');
  s = setCompletionNote(s, 'Reconnected the cable and verified both workstations are working.');
  const evaluation = evaluateCompletion(s.mission);
  assert.equal(evaluation.checks.find((c) => c.id === 'selectedGenuineFinding').passed, false);
});

test('completeRun freezes the run, updates profile counters/evidence, and rejects a repeat', () => {
  let s = fullyValidSubmission(startP1());
  const { state: completed, result } = completeRun(s);
  assert.equal(result.ok, true);
  assert.equal(completed.mission.status, 'completed');
  assert.equal(completed.screen, 'debrief');
  assert.equal(completed.profile.counters.runs, 1);
  assert.equal(completed.profile.counters.independent, 1);
  assert.equal(completed.profile.evidence.P.P1, 1);
  assert.equal(completed.profile.completedRuns.length, 1);
  assert.equal(completed.profile.completedRuns[0].caseCode, 'TF1-HM-1-P-START');

  const { result: secondAttempt } = completeRun(completed);
  assert.equal(secondAttempt.ok, false);
  assert.equal(secondAttempt.code, 'ALREADY_COMPLETED');
});

test('an assisted completion does not add independent evidence', () => {
  let s = fullyValidSubmission(startP1());
  s = { ...s, mission: { ...s.mission, assisted: true } };
  const { state: completed } = completeRun(s);
  assert.equal(completed.profile.counters.assisted, 1);
  assert.equal(completed.profile.counters.independent, 0);
  assert.equal(completed.profile.evidence.P.P1 ?? 0, 0);
});

test('completeRun rejects when checks fail, without touching the mission', () => {
  const s = startP1(); // nothing repaired yet
  const before = s.mission;
  const { state: after, result } = completeRun(s);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CHECKS_FAILED');
  assert.equal(after.mission, before);
});

test('summarizeRun produces the documented RunSummary shape', () => {
  const s = fullyValidSubmission(startP1());
  const summary = summarizeRun(s.mission, '2026-01-01T00:00:00.000Z');
  assert.equal(summary.attemptId, s.mission.id);
  assert.equal(summary.caseCode, 'TF1-HM-1-P-START');
  assert.deepEqual(summary.recipes, ['P1']);
  assert.equal(summary.family, 'P');
  assert.equal(summary.tier, 1);
  assert.equal(summary.completedAt, '2026-01-01T00:00:00.000Z');
  assert.ok(Object.isFrozen(summary));
});
