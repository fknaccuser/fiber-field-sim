import { describe, expect, it } from 'vitest';
import { computeEfficiency } from './efficiency';
import { baseMeta, emptyWorld, makeSession } from './testFixtures';

describe('16. efficiency scales with time relative to the reference', () => {
  it('a longer OTDR averaging time scores strictly lower than a shorter one', () => {
    const meta = baseMeta({ referenceSolution: { rationales: [], steps: [], totalSeconds: 400, affectedCustomerMinutes: 0 } });
    const fast = makeSession({ world: emptyWorld(), log: [], meta, clockSeconds: 300 + (15 + 20) });
    const slow = makeSession({ world: emptyWorld(), log: [], meta, clockSeconds: 300 + (180 + 20) });

    const fastResult = computeEfficiency(fast);
    const slowResult = computeEfficiency(slow);
    expect(slowResult.score.score).toBeLessThan(fastResult.score.score);
  });

  it('finishing faster than the reference scores 100 and sets beatReference', () => {
    const meta = baseMeta({ referenceSolution: { rationales: [], steps: [], totalSeconds: 400, affectedCustomerMinutes: 0 } });
    const state = makeSession({ world: emptyWorld(), log: [], meta, clockSeconds: 335 });
    const result = computeEfficiency(state);
    expect(result.score.score).toBe(100);
    expect(result.beatReference).toBe(true);
  });
});

describe('17. over time budget zeroes efficiency', () => {
  it('scores 0 and sets overBudget when actual exceeds the time budget', () => {
    const meta = baseMeta({ timeBudgetMinutes: 10, referenceSolution: { rationales: [], steps: [], totalSeconds: 400, affectedCustomerMinutes: 0 } });
    const state = makeSession({ world: emptyWorld(), log: [], meta, clockSeconds: 700 });
    const result = computeEfficiency(state);
    expect(result.score.score).toBe(0);
    expect(result.overBudget).toBe(true);
  });
});
