import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialProfile, setGuidanceOverride } from '../../src/solo/app.js';
import { guidanceLevel, trainingMode } from '../../src/solo/guidance.js';

function stateWith(profile) {
  return { profile, saveStatus: 'saved', error: null };
}

test('a new profile carries no override', () => {
  assert.equal(createInitialProfile().guidanceOverride, null);
  assert.equal(guidanceLevel(createInitialProfile()), 'guided');
});

test('setting an override marks the profile for saving', () => {
  const next = setGuidanceOverride(stateWith(createInitialProfile()), 'independent');
  assert.equal(next.profile.guidanceOverride, 'independent');
  assert.equal(next.saveStatus, 'saving');
});

test('clearing with null returns the trainee to their earned level', () => {
  const dropped = setGuidanceOverride(stateWith(createInitialProfile()), 'independent');
  assert.equal(trainingMode({ mode: 'repair', tier: 1 }, dropped.profile), 'console');
  const cleared = setGuidanceOverride(dropped, null);
  assert.equal(cleared.profile.guidanceOverride, null);
  assert.equal(trainingMode({ mode: 'repair', tier: 1 }, cleared.profile), 'guided');
});

test('a junk level is refused rather than stored', () => {
  const next = setGuidanceOverride(stateWith(createInitialProfile()), 'godmode');
  assert.equal(next.profile.guidanceOverride, null);
});

test('the override does not disturb the rest of the profile', () => {
  const before = createInitialProfile();
  const after = setGuidanceOverride(stateWith(before), 'coached').profile;
  for (const key of Object.keys(before)) {
    if (key === 'guidanceOverride') continue;
    assert.deepEqual(after[key], before[key], key);
  }
});
