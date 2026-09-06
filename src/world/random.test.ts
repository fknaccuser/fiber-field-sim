import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from './random';

describe('createRng', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('nextGaussian has approximately mean 0 and stdev 1 over 10k samples', () => {
    const rng = createRng(42);
    const n = 10000;
    const samples = Array.from({ length: n }, () => rng.nextGaussian());
    const mean = samples.reduce((a, b) => a + b, 0) / n;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const stdev = Math.sqrt(variance);
    expect(mean).toBeGreaterThan(-0.05);
    expect(mean).toBeLessThan(0.05);
    expect(stdev).toBeGreaterThan(0.95);
    expect(stdev).toBeLessThan(1.05);
  });

  it('int(min,max) stays in range inclusive', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = rng.int(3, 8);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(8);
    }
  });

  it('pick returns only items from the array', () => {
    const rng = createRng(9);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(rng.pick(items));
    }
  });
});

describe('deriveSeed', () => {
  it('different labels produce different seeds', () => {
    const s1 = deriveSeed(1, 'otdr', 'node-1');
    const s2 = deriveSeed(1, 'otdr', 'node-2');
    expect(s1).not.toBe(s2);
  });

  it('is deterministic for the same inputs', () => {
    expect(deriveSeed(1, 'a', 'b')).toBe(deriveSeed(1, 'a', 'b'));
  });

  it('different base seeds produce different derived seeds', () => {
    expect(deriveSeed(1, 'x')).not.toBe(deriveSeed(2, 'x'));
  });
});
