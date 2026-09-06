import { describe, expect, it } from 'vitest';
import { getScenario } from './registry';
import { instantiateScenario } from './loader';

const t4 = getScenario('t4-wrong-roll-closure-7');

describe('2. determinism', () => {
  it('instantiating the same scenario at the same seed twice produces an identical world and meta', () => {
    const a = instantiateScenario(t4, 42);
    const b = instantiateScenario(t4, 42);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(a.meta).toEqual(b.meta);
  });

  it('a different seed changes the resolved feeder length, always within [1900, 2100]', () => {
    const lengths = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const { world } = instantiateScenario(t4, seed);
      const span = world.topology.spans.find((s) => s.id === 'sp-feeder-main')!;
      expect(span.lengthMeters).toBeGreaterThanOrEqual(1900);
      expect(span.lengthMeters).toBeLessThanOrEqual(2100);
      lengths.add(span.lengthMeters);
    }
    expect(lengths.size).toBeGreaterThanOrEqual(2);
  });
});
