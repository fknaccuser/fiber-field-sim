import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCase } from '../../src/solo/generate.js';
import { parameters } from '../../src/solo/seed.js';
import { walkthroughFor, checkBlank } from '../../src/solo/walkthrough.js';
import { guidedSteps, currentGuidedStep, guidedFix, guidedVerify, plainResult } from '../../src/solo/guide-steps.js';
import { isRecipeRepaired, selectDevice, recordTestEvent } from '../../src/solo/app.js';
import { evaluateCompletion } from '../../src/solo/grade.js';
import { runMissionTest } from '../../src/solo/devices.js';

function caseFor(recipeId) {
  for (let i = 0; i < 400; i += 1) {
    const code = `TF1-BR-1-${recipeId[0]}-gs${i}`;
    try {
      const params = parameters(code);
      if (params.recipes.length === 1 && params.recipes[0] === recipeId) return generateCase(code);
    } catch { /* keep looking */ }
  }
  throw new Error(`No case for ${recipeId}`);
}

const RECIPES = ['P1', 'P2', 'I1', 'I2', 'V1', 'V2', 'D1', 'D2'];

function stateFor(mission) {
  return { mission, selectedDeviceId: null, recentDevices: [], error: null, terminalSessions: {} };
}

test('every fault walks from the complaint to a passing completion', () => {
  for (const recipeId of RECIPES) {
    let state = stateFor(caseFor(recipeId));
    const acks = new Set();
    const at = () => currentGuidedStep(state.mission, acks)?.step.id;
    assert.equal(at(), 'intro', recipeId);
    acks.add('intro');
    assert.equal(at(), 'pick-client', recipeId);
    state = selectDevice(state, state.mission.targetClientId);
    assert.equal(at(), 'try-site', recipeId);
    state = recordTestEvent(state, 'openPortal', state.mission.targetClientId, runMissionTest(state.mission, 'openPortal', state.mission.targetClientId));
    assert.equal(at(), 'result', recipeId);
    acks.add('result');
    const steps = guidedSteps(state.mission);
    const pick = steps.find((s) => s.id === 'pick-fault-device');
    if (pick) {
      assert.equal(at(), 'pick-fault-device', recipeId);
      state = selectDevice(state, pick.target.id);
    }
    assert.equal(at(), 'look', recipeId);
    acks.add('look');
    assert.equal(at(), 'fix', recipeId);
    const { answer } = walkthroughFor(state.mission).steps[3].blank;
    assert.equal(checkBlank(state.mission, answer).ok, true, recipeId);
    const fixed = guidedFix(state, answer);
    assert.equal(fixed.result.ok, true, `${recipeId}: ${fixed.result.message}`);
    state = fixed.state;
    assert.equal(isRecipeRepaired(state.mission, recipeId), true, recipeId);
    assert.equal(at(), 'verify', recipeId);
    state = guidedVerify(state);
    assert.equal(at(), 'close', recipeId);
    const completion = evaluateCompletion(state.mission);
    assert.equal(completion.passed, true, `${recipeId}: ${completion.checks.filter((c) => !c.passed).map((c) => c.message).join(' | ')}`);
  }
});

test('read-only steps are skipped once later work is done', () => {
  let state = stateFor(caseFor('P1'));
  state = selectDevice(state, 'PC1');
  assert.equal(currentGuidedStep(state.mission, new Set()).step.id, 'try-site');
});

test('every result code has a plain explanation and unknown ones fall back', () => {
  assert.match(plainResult('LINK_DOWN'), /not connected/);
  assert.equal(plainResult('SOMETHING_NEW'), 'The website did not open.');
});
