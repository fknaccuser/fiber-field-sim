import { describe, expect, it } from 'vitest';
import { resolveRunRoute } from './routeResolution';

const exists = (id: string) => id === 't1-dark-ont-vista-court';

describe('5. /run/:scenarioId?seed=N resolution', () => {
  it('resolves a known scenario id and seed', () => {
    expect(resolveRunRoute('t1-dark-ont-vista-court', '5', exists)).toEqual({ ok: true, params: { scenarioId: 't1-dark-ont-vista-court', seed: 5 } });
  });

  it('picks a random seed when none is given', () => {
    const result = resolveRunRoute('t1-dark-ont-vista-court', null, exists);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number.isInteger(result.params.seed)).toBe(true);
      expect(result.params.seed).toBeGreaterThanOrEqual(1);
    }
  });

  it('an unknown scenario id fails to resolve', () => {
    const result = resolveRunRoute('not-a-real-scenario', '5', exists);
    expect(result).toEqual({ ok: false, error: 'Unknown scenario "not-a-real-scenario".' });
  });

  it('a non-numeric seed fails to resolve', () => {
    const result = resolveRunRoute('t1-dark-ont-vista-court', 'banana', exists);
    expect(result.ok).toBe(false);
  });
});
