import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCase } from '../../src/solo/generate.js';
import { parameters } from '../../src/solo/seed.js';
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

const pickRight = (step) => {
  const right = step.choices.filter((c) => c.ok);
  assert.equal(right.length, 1, `${step.id} needs exactly one right choice`);
  for (const c of step.choices.filter((x) => !x.ok)) assert.ok(c.why && c.why.length > 20, `${step.id} trap "${c.text}" needs a why`);
  return right[0];
};

test('every fault walks from the complaint to a passing completion by picking', () => {
  for (const recipeId of RECIPES) {
    let state = stateFor(caseFor(recipeId));
    const acks = new Set();
    const at = () => currentGuidedStep(state.mission, acks)?.step;
    assert.equal(at().id, 'pick-client', recipeId);
    state = selectDevice(state, state.mission.targetClientId);
    assert.equal(at().id, 'try-site', recipeId);
    state = recordTestEvent(state, 'openPortal', state.mission.targetClientId, runMissionTest(state.mission, 'openPortal', state.mission.targetClientId));

    const think = at();
    assert.equal(think.id, 'think', recipeId);
    assert.equal(think.news.ok, false, `${recipeId} should report the failed test`);
    assert.equal(think.choices.length, 4, recipeId);
    pickRight(think);
    acks.add('think');

    const pick = guidedSteps(state.mission).find((s) => s.id === 'pick-fault-device');
    if (pick) {
      assert.equal(at().id, 'pick-fault-device', recipeId);
      state = selectDevice(state, pick.target.id);
    }
    const fix = at();
    assert.equal(fix.id, 'fix', recipeId);
    assert.equal(fix.choices.length, 4, recipeId);
    const fixed = guidedFix(state, pickRight(fix).value);
    assert.equal(fixed.result.ok, true, `${recipeId}: ${fixed.result.message}`);
    state = fixed.state;
    assert.equal(isRecipeRepaired(state.mission, recipeId), true, recipeId);
    assert.equal(at().id, 'verify', recipeId);
    state = guidedVerify(state);

    const teach = at();
    assert.equal(teach.id, 'teach', recipeId);
    assert.equal(pickRight(teach).value, recipeId, recipeId);
    acks.add('teach');
    assert.equal(at().id, 'close', recipeId);
    const completion = evaluateCompletion(state.mission);
    assert.equal(completion.passed, true, `${recipeId}: ${completion.checks.filter((c) => !c.passed).map((c) => c.message).join(' | ')}`);
  }
});

test('the think question points at the right area for each fault', () => {
  const area = { P: 'physical', I: 'addressing', V: 'vlan', D: 'dns' };
  for (const recipeId of RECIPES) {
    let state = stateFor(caseFor(recipeId));
    state = recordTestEvent(state, 'openPortal', state.mission.targetClientId, runMissionTest(state.mission, 'openPortal', state.mission.targetClientId));
    const think = guidedSteps(state.mission).find((s) => s.id === 'think');
    assert.equal(think.choices.find((c) => c.ok).value, area[recipeId[0]], recipeId);
  }
});

test('the choice order is fixed per ticket and the right answer is not always first', () => {
  const firsts = new Set();
  for (const recipeId of RECIPES) {
    const mission = caseFor(recipeId);
    const a = guidedSteps(mission).find((s) => s.id === 'fix').choices.map((c) => c.text);
    const b = guidedSteps(mission).find((s) => s.id === 'fix').choices.map((c) => c.text);
    assert.deepEqual(a, b, recipeId);
    firsts.add(guidedSteps(mission).find((s) => s.id === 'fix').choices[0].ok);
  }
  assert.equal(firsts.size, 2, 'the right fix should not always sit in the same place');
});

test('a first ticket is seven steps: act, think, fix, check, explain, close', () => {
  let state = stateFor(caseFor('P1'));
  state = recordTestEvent(state, 'openPortal', state.mission.targetClientId, runMissionTest(state.mission, 'openPortal', state.mission.targetClientId));
  assert.deepEqual(guidedSteps(state.mission).map((s) => s.id), ['pick-client', 'try-site', 'think', 'fix', 'verify', 'teach', 'close']);
});

test('every result code has a plain explanation and unknown ones fall back', () => {
  assert.match(plainResult('LINK_DOWN'), /not connected/);
  assert.equal(plainResult('SOMETHING_NEW'), 'the website did not open');
});
