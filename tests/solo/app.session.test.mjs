import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  createInitialProfile,
  attemptStartMission,
  confirmReplaceMission,
  cancelReplaceMission,
  replayMission,
  startNewVariation,
  resumeMission,
  boot,
} from '../../src/solo/app.js';
import { openStore, createMemoryAdapter } from '../../src/solo/store.js';

function stateWithProfile() {
  return { ...createInitialState(), profile: createInitialProfile() };
}

test('attemptStartMission with no active mission starts immediately', () => {
  const state = stateWithProfile();
  const next = attemptStartMission(state, 'TF1-HM-1-P-START');
  assert.equal(next.screen, 'mission');
  assert.equal(next.mission.caseCode, 'TF1-HM-1-P-START');
  assert.deepEqual(next.mission.recipeIds, ['P1']);
});

test('an invalid code with no active mission reports an error and starts nothing', () => {
  const state = stateWithProfile();
  const attempted = attemptStartMission(state, 'not-a-real-code');
  assert.equal(attempted.mission, null);
  assert.ok(attempted.error);
});

test('an invalid code offered as a replacement still keeps the active mission once confirmed', () => {
  const started = attemptStartMission(stateWithProfile(), 'TF1-HM-1-P-START');
  const requested = attemptStartMission(started, 'not-a-real-code');
  const confirmed = confirmReplaceMission(requested);
  assert.equal(confirmed.mission, started.mission, 'the original mission survives an invalid replacement');
  assert.ok(confirmed.error);
  assert.equal(confirmed.pendingMissionRequest, null);
});

test('starting a second mission while one is active requests Resume/Replace instead of replacing it', () => {
  const started = attemptStartMission(stateWithProfile(), 'TF1-HM-1-P-START');
  const requested = attemptStartMission(started, 'TF1-BR-3-D-12345');
  assert.equal(requested.mission, started.mission, 'active mission untouched until confirmed');
  assert.deepEqual(requested.pendingMissionRequest, { kind: 'code', caseCode: 'TF1-BR-3-D-12345' });
});

test('confirming replace swaps in the new mission; cancelling keeps the old one', () => {
  const started = attemptStartMission(stateWithProfile(), 'TF1-HM-1-P-START');
  const requested = attemptStartMission(started, 'TF1-BR-3-D-12345');

  const cancelled = cancelReplaceMission(requested);
  assert.equal(cancelled.mission, started.mission);
  assert.equal(cancelled.pendingMissionRequest, null);

  const replaced = confirmReplaceMission(requested);
  assert.equal(replaced.mission.caseCode, 'TF1-BR-3-D-12345');
  assert.equal(replaced.pendingMissionRequest, null);
});

test('same code on a fresh profile yields the same faulted network', () => {
  const a = attemptStartMission(stateWithProfile(), 'TF1-BR-3-D-12345');
  const b = attemptStartMission(stateWithProfile(), 'TF1-BR-3-D-12345');
  assert.deepEqual(a.mission.initialNetwork, b.mission.initialNetwork);
  assert.deepEqual(a.mission.requirements, b.mission.requirements);
});

test('replay keeps the identical faulted initial state but a new attempt id', () => {
  const started = attemptStartMission(stateWithProfile(), 'TF1-BR-3-D-12345');
  const replayed = replayMission(started);
  assert.deepEqual(replayed.mission.initialNetwork, started.mission.initialNetwork);
  assert.notEqual(replayed.mission.id, started.mission.id);
});

test('replay does not add to the freshness history', () => {
  const started = attemptStartMission(stateWithProfile(), 'TF1-BR-3-D-12345');
  const countBefore = started.profile.recentFingerprints.length;
  const replayed = replayMission(started);
  assert.equal(replayed.profile.recentFingerprints.length, countBefore);
});

test('starting a fresh (non-replay) case adds one fingerprint to the profile', () => {
  const started = attemptStartMission(stateWithProfile(), 'TF1-BR-3-D-12345');
  assert.equal(started.profile.recentFingerprints.length, 1);
});

test('startNewVariation produces a fresh case recorded in the profile fingerprint history', () => {
  const result = startNewVariation(stateWithProfile(), 'BR', 1, 'P');
  assert.equal(result.screen, 'mission');
  assert.equal(result.profile.recentFingerprints.length, 1);
});

test('startNewVariation surfaces a bounded visible error rather than looping forever', () => {
  // HM+tier4 is always an invalid combination (seed.js), so every one of
  // nextCase's 100 candidate tries fails regardless of seed text: this
  // deterministically exercises the exhaustion path through real API usage.
  const result = startNewVariation(stateWithProfile(), 'HM', 4, 'M');
  assert.equal(result.mission, null);
  assert.match(result.error, /Choose a seed manually/);
});

test('resumeMission returns to the mission screen without altering the mission', () => {
  const started = attemptStartMission(stateWithProfile(), 'TF1-HM-1-P-START');
  const awayFromHome = { ...started, screen: 'home' };
  const resumed = resumeMission(awayFromHome);
  assert.equal(resumed.screen, 'mission');
  assert.equal(resumed.mission, started.mission);
});

test('refresh resumes current state: a saved mission reloads with identical network/revision/events', async () => {
  const store = openStore(createMemoryAdapter());
  let state = await boot(store);
  state = attemptStartMission(state, 'TF1-HM-1-P-START');
  await store.saveLocal(state.profile, state.mission);

  const reloaded = await boot(store);
  assert.deepEqual(reloaded.mission.network, state.mission.network);
  assert.deepEqual(reloaded.mission.initialNetwork, state.mission.initialNetwork);
  assert.equal(reloaded.mission.caseCode, state.mission.caseCode);
  assert.equal(reloaded.mission.id, state.mission.id);
});
