import { describe, expect, it } from 'vitest';
import { getScenario, instantiateScenario } from '../scenarios';
import { applyReadiness, readinessFor, toolsRequiredBy } from './readiness';
import { ROLE_ORDER } from './roles';
import type { Intent } from './types';

const FULL = ['otdr', 'power-meter', 'vfl', 'inspection-scope', 'launch-cable-500m', 'laptop', 'cleaning-kit'];

function refSteps(id: string, seed = 1): Intent[] {
  const def = getScenario(id, seed);
  return instantiateScenario(def, seed).meta.referenceSolution.steps;
}

describe('morning readiness', () => {
  it('is deterministic for a given seed and grade', () => {
    const steps = refSteps('t4-wrong-roll-closure-7');
    for (let seed = 1; seed <= 20; seed++) {
      expect(readinessFor(seed, 'l1', steps)).toEqual(readinessFor(seed, 'l1', steps));
    }
  });

  it('NEVER removes a tool the job actually needs, at any grade or seed', () => {
    for (const id of ['t1-dark-ont-vista-court', 't4-wrong-roll-closure-7', 't5-everyones-down-nothings-broken', 't3-gen-drop-medium']) {
      const steps = refSteps(id);
      const required = toolsRequiredBy(steps);
      for (const role of ROLE_ORDER) {
        for (let seed = 1; seed <= 60; seed++) {
          const r = readinessFor(seed, role, steps);
          for (const removed of r.removes) expect(required.has(removed)).toBe(false);
        }
      }
    }
  });

  it('goes wrong sometimes and not always', () => {
    const steps = refSteps('t5-everyones-down-nothings-broken');
    const outcomes = Array.from({ length: 120 }, (_, i) => readinessFor(i + 1, 'l1', steps).fault);
    expect(outcomes.some((f) => f !== null)).toBe(true);
    expect(outcomes.some((f) => f === null)).toBe(true);
  });

  it('coaches the junior grades and says nothing to the senior ones', () => {
    const steps = refSteps('t5-everyones-down-nothings-broken');
    for (let seed = 1; seed <= 200; seed++) {
      for (const role of ROLE_ORDER) {
        const r = readinessFor(seed, role, steps);
        if (!r.fault) continue;
        if (role === 'l1' || role === 'l2') expect(r.coaching).toBeTruthy();
        else expect(r.coaching).toBeNull();
      }
    }
  });

  it('strips only what it names, leaving the rest of the kit alone', () => {
    expect(applyReadiness(FULL, { fault: 'forgot-vfl', removes: ['vfl'], headline: '', coaching: null })).not.toContain('vfl');
    expect(applyReadiness(FULL, { fault: 'forgot-vfl', removes: ['vfl'], headline: '', coaching: null })).toHaveLength(FULL.length - 1);
    expect(applyReadiness(FULL, { fault: null, removes: [], headline: '', coaching: null })).toEqual(FULL);
  });

  it('reads the required kit straight off the reference solution', () => {
    const needed = toolsRequiredBy(refSteps('t4-wrong-roll-closure-7'));
    expect(needed.has('otdr')).toBe(true);
    expect(needed.has('power-meter')).toBe(true);
  });
});
