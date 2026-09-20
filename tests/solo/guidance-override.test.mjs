import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  guidanceLevel, earnedGuidanceLevel, guidanceOverride,
  trainingMode, showMeAvailable,
} from '../../src/solo/guidance.js';

const repair = { mode: 'repair', assisted: false, recipes: ['P1'] };
const novice = { completedRuns: [] };
const veteran = {
  completedRuns: Array.from({ length: 8 }, (_, i) => ({ ...repair, recipes: [['P1', 'I1', 'V1', 'D1'][i % 4]] })),
};

test('with no override the earned level still decides', () => {
  assert.equal(guidanceOverride(novice), null);
  assert.equal(guidanceLevel(novice), 'guided');
  assert.equal(guidanceLevel(veteran), 'independent');
});

test('an unrecognised override is ignored rather than trusted', () => {
  assert.equal(guidanceOverride({ ...novice, guidanceOverride: 'expert' }), null);
  assert.equal(guidanceLevel({ ...novice, guidanceOverride: 'expert' }), 'guided');
});

test('let me try drops the rails before they are earned', () => {
  const impatient = { ...novice, guidanceOverride: 'independent' };
  assert.equal(guidanceLevel(impatient), 'independent');
  assert.equal(trainingMode({ mode: 'repair', tier: 1 }, impatient), 'console');
});

test('help can be turned back on after it has been earned away', () => {
  const asking = { ...veteran, guidanceOverride: 'guided' };
  assert.equal(trainingMode({ mode: 'repair', tier: 1 }, veteran), 'console');
  assert.equal(trainingMode({ mode: 'repair', tier: 1 }, asking), 'guided');
});

test('the earned level keeps advancing underneath an override', () => {
  const asking = { ...veteran, guidanceOverride: 'guided' };
  assert.equal(guidanceLevel(asking), 'guided');
  assert.equal(earnedGuidanceLevel(asking), 'independent');
});

test('the tier-3 gate survives, and the escape hatch appears behind it', () => {
  assert.equal(trainingMode({ mode: 'repair', tier: 3 }, novice), 'console');
  assert.equal(showMeAvailable({ mode: 'repair', tier: 3 }, novice), true);
  assert.equal(showMeAvailable({ mode: 'repair', tier: 1 }, novice), false);
});

test('asking for help does not reopen the tier-3 gate', () => {
  const asking = { ...novice, guidanceOverride: 'guided' };
  assert.equal(trainingMode({ mode: 'repair', tier: 3 }, asking), 'console');
  assert.equal(showMeAvailable({ mode: 'repair', tier: 3 }, asking), true);
});
