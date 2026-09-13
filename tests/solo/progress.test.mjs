import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialProfile } from '../../src/solo/app.js';
import {
  familyStats,
  allFamilyStats,
  recommendedTier,
  leastPracticedFamily,
  recommendMission,
} from '../../src/solo/progress.js';

// Mirrors app.js's completeRun profile update (DATA_CONTRACTS.md's counters/
// evidence/completedRuns transaction) without going through a full mission,
// so these tests exercise progress.js's own derivations in isolation.
function withRun(profile, { recipes, tier, assisted = false, elapsedMs = 60000, mode = 'repair' }) {
  const family = recipes.length > 1 ? 'M' : recipes[0][0];
  const run = {
    attemptId: `run-${profile.completedRuns.length + 1}`,
    caseCode: null,
    mode,
    recipes,
    tier,
    family,
    assisted,
    elapsedMs,
    completedAt: new Date(2026, 0, 1).toISOString(),
    selectedFindings: [],
    note: 'note',
  };
  let evidence = profile.evidence;
  let counters = profile.counters;
  if (mode === 'repair') {
    counters = {
      ...counters,
      runs: counters.runs + 1,
      assisted: counters.assisted + (assisted ? 1 : 0),
      independent: counters.independent + (assisted ? 0 : 1),
    };
    if (!assisted) {
      for (const recipeId of recipes) {
        const recipeFamily = recipeId[0];
        evidence = {
          ...evidence,
          [recipeFamily]: { ...evidence[recipeFamily], [recipeId]: (evidence[recipeFamily][recipeId] ?? 0) + 1 },
        };
      }
    }
  }
  return { ...profile, completedRuns: [run, ...profile.completedRuns], evidence, counters };
}

test('ten repeats of one cause do not become two distinct causes', () => {
  let profile = createInitialProfile();
  profile = withRun(profile, { recipes: ['P1'], tier: 1, assisted: false }); // unlocks tier2
  for (let i = 0; i < 10; i += 1) {
    profile = withRun(profile, { recipes: ['P1'], tier: 2, assisted: false });
  }
  const stats = familyStats(profile, 'P');
  assert.equal(stats.completed, 11);
  assert.equal(stats.distinctCauses, 1);
  // Tier2 needs two *distinct* independently repaired causes before tier3 is
  // suggested; ten repeats of the same one never satisfy that.
  assert.equal(recommendedTier(profile, 'P'), 2);
});

test('assisted success remains visible but is not independent evidence', () => {
  let profile = createInitialProfile();
  profile = withRun(profile, { recipes: ['V1'], tier: 1, assisted: true });
  const stats = familyStats(profile, 'V');
  assert.equal(stats.completed, 1);
  assert.equal(stats.assisted, 1);
  assert.equal(stats.independent, 0);
  assert.equal(stats.distinctCauses, 0);
  // Walkthrough (tier1) completion still unlocks tier2 even though assisted.
  assert.equal(recommendedTier(profile, 'V'), 2);
});

test('recommended tier rises only after two distinct independent causes at the current tier', () => {
  let profile = createInitialProfile();
  assert.equal(recommendedTier(profile, 'I'), 1);

  profile = withRun(profile, { recipes: ['I1'], tier: 1, assisted: false });
  assert.equal(recommendedTier(profile, 'I'), 2);

  profile = withRun(profile, { recipes: ['I1'], tier: 2, assisted: false });
  assert.equal(recommendedTier(profile, 'I'), 2, 'only one distinct cause so far at tier2');

  profile = withRun(profile, { recipes: ['I2'], tier: 2, assisted: false });
  assert.equal(recommendedTier(profile, 'I'), 3);

  profile = withRun(profile, { recipes: ['I1'], tier: 3, assisted: false });
  profile = withRun(profile, { recipes: ['I2'], tier: 3, assisted: false });
  assert.equal(recommendedTier(profile, 'I'), 4);
});

test('an assisted-only tier2/tier3 run never advances the recommended tier', () => {
  let profile = createInitialProfile();
  profile = withRun(profile, { recipes: ['D1'], tier: 1, assisted: false });
  profile = withRun(profile, { recipes: ['D1'], tier: 2, assisted: true });
  profile = withRun(profile, { recipes: ['D2'], tier: 2, assisted: true });
  assert.equal(recommendedTier(profile, 'D'), 2, 'assisted runs do not count toward the two-cause threshold');
});

test('a mixed (tier4) run contributes evidence to each of its recipes families', () => {
  let profile = createInitialProfile();
  profile = withRun(profile, { recipes: ['P1', 'V2'], tier: 4, assisted: false });
  assert.equal(familyStats(profile, 'P').completed, 1);
  assert.equal(familyStats(profile, 'V').completed, 1);
  assert.equal(familyStats(profile, 'P').distinctCauses, 1);
  assert.equal(familyStats(profile, 'V').distinctCauses, 1);
});

test('configure runs do not inflate repair counts', () => {
  let profile = createInitialProfile();
  profile = withRun(profile, { recipes: ['P1'], tier: null, assisted: false, mode: 'configure' });
  const stats = familyStats(profile, 'P');
  assert.equal(stats.completed, 0);
  assert.equal(stats.independent, 0);
  assert.equal(stats.distinctCauses, 0);
  assert.equal(recommendedTier(profile, 'P'), 1);
});

test('least practiced family ties resolve in P,I,V,D order', () => {
  const profile = createInitialProfile();
  assert.equal(leastPracticedFamily(profile), 'P');

  let uneven = createInitialProfile();
  uneven = withRun(uneven, { recipes: ['P1'], tier: 1, assisted: false });
  uneven = withRun(uneven, { recipes: ['I1'], tier: 1, assisted: false });
  // P and I both have one run; V and D have none and tie for least-practiced —
  // V comes first in P,I,V,D order.
  assert.equal(leastPracticedFamily(uneven), 'V');
});

test('recommendMission suggests the fixed first job until any run completes', () => {
  const profile = createInitialProfile();
  assert.deepEqual(recommendMission(profile), { kind: 'code', code: 'TF1-HM-1-P-START' });
});

test('recommendMission suggests the least-practiced family at its recommended tier afterward', () => {
  let profile = createInitialProfile();
  profile = withRun(profile, { recipes: ['P1'], tier: 1, assisted: false });
  const recommendation = recommendMission(profile);
  assert.equal(recommendation.kind, 'family');
  assert.equal(recommendation.family, 'I'); // least-practiced among I,V,D (all zero, I first)
  assert.equal(recommendation.tier, 1);
});

test('recommendMission surfaces Mixed once a family reaches tier4 (tier4 always uses family M)', () => {
  let profile = createInitialProfile();
  // Drive family V through tiers 1-3 so its own recommended tier reaches 4
  // (five runs total); give the other families more completed runs (six
  // repeats of the same cause each) so V is still the least-practiced by
  // completed-run count despite having advanced furthest.
  for (const family of ['P', 'I', 'D']) {
    for (let i = 0; i < 6; i += 1) {
      profile = withRun(profile, { recipes: [`${family}1`], tier: 1, assisted: false });
    }
  }
  profile = withRun(profile, { recipes: ['V1'], tier: 1, assisted: false });
  profile = withRun(profile, { recipes: ['V1'], tier: 2, assisted: false });
  profile = withRun(profile, { recipes: ['V2'], tier: 2, assisted: false });
  profile = withRun(profile, { recipes: ['V1'], tier: 3, assisted: false });
  profile = withRun(profile, { recipes: ['V2'], tier: 3, assisted: false });
  assert.equal(leastPracticedFamily(profile), 'V');
  assert.equal(recommendedTier(profile, 'V'), 4);
  assert.deepEqual(recommendMission(profile), { kind: 'family', family: 'M', tier: 4 });
});

test('restart preserves progress: recomputing from a serialized/reloaded profile is unchanged', () => {
  let profile = createInitialProfile();
  profile = withRun(profile, { recipes: ['D1'], tier: 1, assisted: false });
  profile = withRun(profile, { recipes: ['D1'], tier: 2, assisted: false });
  profile = withRun(profile, { recipes: ['D2'], tier: 2, assisted: false });
  const before = allFamilyStats(profile);
  const reloaded = JSON.parse(JSON.stringify(profile));
  const after = allFamilyStats(reloaded);
  assert.deepEqual(after, before);
  assert.equal(recommendedTier(reloaded, 'D'), recommendedTier(profile, 'D'));
});

test('allFamilyStats reports the four families in P,I,V,D order', () => {
  const stats = allFamilyStats(createInitialProfile());
  assert.deepEqual(stats.map((s) => s.family), ['P', 'I', 'V', 'D']);
});

test('bestElapsedMs tracks the fastest completion for a family, independent of assist status', () => {
  let profile = createInitialProfile();
  profile = withRun(profile, { recipes: ['P1'], tier: 1, assisted: false, elapsedMs: 90000 });
  profile = withRun(profile, { recipes: ['P2'], tier: 1, assisted: true, elapsedMs: 45000 });
  assert.equal(familyStats(profile, 'P').bestElapsedMs, 45000);
});
