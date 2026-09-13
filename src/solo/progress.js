// Progress and recommendation (MASTER_DESIGN.md §9, S14.md). Pure: derives
// everything from the stored profile (DATA_CONTRACTS.md's counters/evidence/
// completedRuns) — no DOM, no fetch, no Date.now, no randomness.

import { RECOMMENDED_CODE } from './app.js';

export const FAMILIES = ['P', 'I', 'V', 'D'];

const MAX_TIER = 4;
const TIER_ADVANCE_CAUSES = 2;

function repairRunsForFamily(profile, family) {
  return profile.completedRuns.filter(
    (run) => run.mode === 'repair' && run.recipes.some((recipeId) => recipeId[0] === family),
  );
}

// Distinct causes counts recipe IDs that have at least one independent
// completion, never seed/run count (S14.md: "Count recipe IDs, not seed
// count, for distinct causes") — ten repeats of one cause is still one
// distinct cause, whether read from stored evidence or from completedRuns.
function distinctIndependentCauses(profile, family) {
  const evidence = profile.evidence[family] ?? {};
  return Object.keys(evidence).filter((recipeId) => evidence[recipeId] > 0);
}

function distinctIndependentCausesAtTier(profile, family, tier) {
  const causes = new Set();
  for (const run of profile.completedRuns) {
    if (run.mode !== 'repair' || run.assisted || run.tier !== tier) continue;
    for (const recipeId of run.recipes) {
      if (recipeId[0] === family) causes.add(recipeId);
    }
  }
  return causes;
}

function hasCompletedTier(profile, family, tier) {
  return profile.completedRuns.some(
    (run) => run.mode === 'repair' && run.tier === tier && run.recipes.some((recipeId) => recipeId[0] === family),
  );
}

// Per-family practice indicators (MASTER_DESIGN.md §9: "For each show
// completed runs, distinct causes solved, highest tier, independently solved
// causes and a recent history list"). Assisted completions are visible in
// `completed`/`assisted` but never counted toward `distinctCauses` or
// `independent` (S14.md acceptance: "Assisted success remains visible but is
// not independent evidence"). Configure-mode attempts never reach
// completedRuns as repair runs (app.js only records profile evidence for
// mode:"repair"), so they cannot inflate any of these counts.
export function familyStats(profile, family) {
  const runs = repairRunsForFamily(profile, family);
  let assisted = 0;
  let independent = 0;
  let highestTier = 0;
  let bestElapsedMs = null;
  for (const run of runs) {
    if (run.assisted) assisted += 1;
    else independent += 1;
    highestTier = Math.max(highestTier, run.tier ?? 0);
    if (bestElapsedMs == null || run.elapsedMs < bestElapsedMs) bestElapsedMs = run.elapsedMs;
  }
  return {
    family,
    completed: runs.length,
    assisted,
    independent,
    distinctCauses: distinctIndependentCauses(profile, family).length,
    highestTier,
    bestElapsedMs,
    recommendedTier: recommendedTier(profile, family),
  };
}

export function allFamilyStats(profile) {
  return FAMILIES.map((family) => familyStats(profile, family));
}

// Recommended tier for a single family (MASTER_DESIGN.md §5: "Recommended
// tier rises after two independently completed, different causes at the
// previous tier. Walkthrough completions permit recommendation of tier 2
// even though guided."). Guided tier1 needs only one completion, assisted or
// not, to unlock tier2; tiers 2 and 3 each need two distinct independently
// repaired causes at that tier before the next is suggested. All tiers stay
// manually reachable regardless of this value (the seed-entry field and the
// skill buttons never block a lower or higher tier).
export function recommendedTier(profile, family) {
  if (!hasCompletedTier(profile, family, 1)) return 1;
  if (distinctIndependentCausesAtTier(profile, family, 2).size < TIER_ADVANCE_CAUSES) return 2;
  if (distinctIndependentCausesAtTier(profile, family, 3).size < TIER_ADVANCE_CAUSES) return 3;
  return MAX_TIER;
}

// Home's recommended job suggests whichever family has the fewest completed
// repair runs (assisted or independent — S14.md: "least-practiced selected
// family"); ties resolve in P,I,V,D order, which the FAMILIES iteration
// order already guarantees with a strict less-than comparison.
export function leastPracticedFamily(profile) {
  let best = null;
  for (const family of FAMILIES) {
    const completed = repairRunsForFamily(profile, family).length;
    if (best == null || completed < best.completed) best = { family, completed };
  }
  return best.family;
}

// recommendMission(profile) -> {kind:"code", code} for the fixed first job
// (UI_AND_STORAGE.md: "Initial first job: TF1-HM-1-P-START"), or
// {kind:"family", family, tier} afterward. Tier 4 always means the mixed
// family (SCENARIOS.md: "tier 4 must use M"), so a family whose own
// recommended tier reaches 4 is surfaced as a mixed-challenge suggestion
// rather than a single-family tier4 (which the generator does not support).
export function recommendMission(profile) {
  if (profile.counters.runs === 0) {
    return { kind: 'code', code: RECOMMENDED_CODE };
  }
  const family = leastPracticedFamily(profile);
  const tier = recommendedTier(profile, family);
  return tier === MAX_TIER ? { kind: 'family', family: 'M', tier } : { kind: 'family', family, tier };
}
