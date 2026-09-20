import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCase } from '../../src/solo/generate.js';
import { parameters } from '../../src/solo/seed.js';
import { walkthroughFor, walkthroughPosition, checkBlank } from '../../src/solo/walkthrough.js';

// Find a real generated case whose only fault is the recipe we want.
function caseFor(recipeId, tier = 1) {
  for (let i = 0; i < 400; i += 1) {
    const code = `TF1-BR-${tier}-${recipeId[0]}-wt${i}`;
    try {
      const params = parameters(code);
      if (params.recipes.length === 1 && params.recipes[0] === recipeId) return generateCase(code);
    } catch { /* not a valid code, keep looking */ }
  }
  throw new Error(`No generated case found for ${recipeId}`);
}

const RECIPES = ['P1', 'P2', 'I1', 'I2', 'V1', 'V2', 'D1', 'D2'];

test('every fault recipe has a walkthrough ending in a blank', () => {
  for (const recipeId of RECIPES) {
    const mission = caseFor(recipeId);
    const walkthrough = walkthroughFor(mission);
    assert.equal(walkthrough.recipeId, recipeId, recipeId);
    assert.equal(walkthrough.steps.length, 4, recipeId);
    assert.ok(walkthrough.steps[3].blank.prompt, `${recipeId} has no prompt`);
    assert.ok(walkthrough.steps[3].blank.hint, `${recipeId} has no hint`);
  }
});

test('each blank accepts its own canonical answer', () => {
  for (const recipeId of RECIPES) {
    const mission = caseFor(recipeId);
    const { answer } = walkthroughFor(mission).steps[3].blank;
    assert.ok(answer, `${recipeId} has no canonical answer`);
    assert.equal(checkBlank(mission, answer).ok, true, `${recipeId} rejected its own answer ${answer}`);
  }
});

test('blanks reject a wrong value and say why', () => {
  for (const recipeId of RECIPES) {
    const mission = caseFor(recipeId);
    const result = checkBlank(mission, 'definitely-not-it');
    assert.equal(result.ok, false, recipeId);
    assert.ok(result.reason.length > 0, recipeId);
  }
  assert.equal(checkBlank(caseFor('I1'), '   ').reason, 'Enter a value.');
});

test('addressing blanks are derived from the case, not hardcoded', () => {
  const mission = caseFor('I2');
  const prefix = mission.requirements.targetSubnet.split('.').slice(0, 3).join('.');
  assert.equal(walkthroughFor(mission).steps[3].blank.answer, `${prefix}.1`);
  assert.equal(checkBlank(mission, '10.42.10.1').ok, prefix === '10.42.10');
});

test('a free host address is accepted and an occupied one is not', () => {
  const mission = caseFor('I1');
  const prefix = mission.requirements.targetSubnet.split('.').slice(0, 3).join('.');
  assert.equal(checkBlank(mission, `${prefix}.77`).ok, true);
  assert.equal(checkBlank(mission, `${prefix}.1`).ok, false, 'the router address must be refused');
  assert.equal(checkBlank(mission, `${prefix}.255`).ok, false, 'broadcast must be refused');
  assert.equal(checkBlank(mission, '10.99.99.5').ok, false, 'a foreign subnet must be refused');
});

test('the trunk blank refuses an answer that strands the other VLAN', () => {
  const mission = caseFor('V2');
  const { targetVlan, protectedVlan } = mission.requirements;
  assert.equal(checkBlank(mission, `${targetVlan},${protectedVlan}`).ok, true);
  assert.equal(checkBlank(mission, String(targetVlan)).ok, false);
});

test('position advances on recorded work, and holds at the blank', () => {
  const mission = caseFor('P1');
  assert.equal(walkthroughPosition(mission).index, 0);
  const inspected = { ...mission, events: [{ kind: 'inspection' }] };
  assert.equal(walkthroughPosition(inspected).index, 1);
  const tested = { ...mission, events: [{ kind: 'inspection' }, { kind: 'test' }] };
  assert.equal(walkthroughPosition(tested).index, 2);
  const changed = { ...mission, events: [{ kind: 'inspection' }, { kind: 'test' }, { kind: 'change' }] };
  assert.equal(walkthroughPosition(changed).index, 3);
  assert.equal(walkthroughPosition(changed).done, true);
});

test('non-repair missions get no walkthrough', () => {
  const mission = { ...caseFor('P1'), mode: 'configure' };
  assert.equal(walkthroughFor(mission), null);
  assert.equal(walkthroughPosition(mission), null);
});
