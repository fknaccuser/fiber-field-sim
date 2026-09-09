import { describe, expect, it } from 'vitest';
import { NOC_CONTACT_SECONDS, EXCAVATE_SECONDS, HINT_POLICY, HINT_SECONDS, POWER_METER_SECONDS, RECORDS_SECONDS, REFUSED_SECONDS, SCOPE_SECONDS, VFL_SECONDS } from './costs';

describe('cost constants', () => {
  it('match the architecture doc', () => {
    expect(POWER_METER_SECONDS).toBe(60);
    expect(VFL_SECONDS).toBe(120);
    expect(SCOPE_SECONDS).toBe(90);
    expect(RECORDS_SECONDS).toBe(60);
    expect(NOC_CONTACT_SECONDS).toBe(150);
    expect(HINT_SECONDS).toBe(0);
    expect(EXCAVATE_SECONDS).toBe(1800);
    expect(REFUSED_SECONDS).toBe(0);
  });
});

describe('HINT_POLICY', () => {
  it('decays by tier', () => {
    expect(HINT_POLICY[1]).toEqual({ max: Infinity, cost: 0 });
    expect(HINT_POLICY[2]).toEqual({ max: 3, cost: 5 });
    expect(HINT_POLICY[3]).toEqual({ max: 2, cost: 10 });
    expect(HINT_POLICY[4]).toEqual({ max: 1, cost: 15 });
    expect(HINT_POLICY[5]).toEqual({ max: 0, cost: 0 });
    expect(HINT_POLICY[6]).toEqual({ max: 0, cost: 0 });
  });
});
