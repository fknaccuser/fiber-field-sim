import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE, effectiveHintPolicy, isRole, ROLE_ORDER, ROLE_POLICY, unlockedRoles } from './roles';

describe('role policy', () => {
  it('tightens monotonically from L1 to manager', () => {
    const seq = ROLE_ORDER.map((r) => ROLE_POLICY[r]);
    for (let i = 1; i < seq.length; i++) {
      const prev = seq[i - 1];
      const cur = seq[i];
      expect(cur.hints.max).toBeLessThanOrEqual(prev.hints.max);
      expect(cur.truckRollBudget).toBeLessThanOrEqual(prev.truckRollBudget);
      expect(cur.timeBudgetMultiplier).toBeLessThanOrEqual(prev.timeBudgetMultiplier);
      expect(cur.actionSoftCap).toBeLessThanOrEqual(prev.actionSoftCap);
      expect(cur.commsIntensity).toBeGreaterThanOrEqual(prev.commsIntensity);
      expect(cur.unlockAfterSessions).toBeGreaterThanOrEqual(prev.unlockAfterSessions);
    }
  });

  it('only the senior grades refuse a roll outright, and only they must answer comms', () => {
    expect(ROLE_POLICY.l1.truckRollHardCap).toBe(false);
    expect(ROLE_POLICY.l2.truckRollHardCap).toBe(false);
    expect(ROLE_POLICY.senior.truckRollHardCap).toBe(true);
    expect(ROLE_POLICY.manager.truckRollHardCap).toBe(true);
    expect(ROLE_POLICY.l1.mustAnswerComms).toBe(false);
    expect(ROLE_POLICY.l3.mustAnswerComms).toBe(true);
  });

  it('L1 and L2 get a step list; L3 and above do not', () => {
    expect(ROLE_POLICY.l1.guidance).toBe('guided');
    expect(ROLE_POLICY.l2.guidance).toBe('answers');
    expect(ROLE_POLICY.l3.guidance).toBe('confirms');
    expect(ROLE_POLICY.senior.guidance).toBe('none');
    expect(ROLE_POLICY.manager.guidance).toBe('none');
  });

  it('takes the stricter of role and tier for hints, so a junior role never softens a hard tier', () => {
    // Tier 5 allows nothing; picking L1 must not hand out unlimited hints.
    expect(effectiveHintPolicy('l1', { max: 0, cost: 0 })).toEqual({ max: 0, cost: 0 });
    // A senior role on a tier-1 scenario is tightened, not loosened.
    expect(effectiveHintPolicy('senior', { max: Infinity, cost: 0 })).toEqual({ max: 0, cost: 0 });
    // Where both allow hints, the harsher cost wins.
    expect(effectiveHintPolicy('l3', { max: 3, cost: 5 })).toEqual({ max: 2, cost: 10 });
  });

  it('unlocks by completed work without ever hard-gating', () => {
    const fresh = unlockedRoles(0);
    expect(fresh.l1).toBe(true);
    expect(fresh.manager).toBe(false);
    const veteran = unlockedRoles(30);
    expect(Object.values(veteran).every(Boolean)).toBe(true);
  });

  it('recognises its own role ids and nothing else', () => {
    expect(isRole('senior')).toBe(true);
    expect(isRole('l1')).toBe(true);
    expect(isRole('cto')).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(DEFAULT_ROLE)).toBe(true);
  });
});
