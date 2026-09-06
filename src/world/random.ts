/**
 * Deterministic randomness for the simulation. Every seeded stream in the app derives
 * from `deriveSeed(worldSeed, ...labels)` feeding `createRng()`, so the same world seed
 * always reproduces the same OTDR noise, scenario randomization, and CLI-derived jitter,
 * independent of call order between unrelated sub-systems.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal via Box-Muller (caches the second value). */
  nextGaussian(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

/** mulberry32: fast, small-state, good-enough-for-simulation PRNG. Same seed -> identical sequence in Node and every evergreen browser (32-bit integer math only). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  let cachedGaussian: number | null = null;

  function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    nextGaussian(): number {
      if (cachedGaussian !== null) {
        const g = cachedGaussian;
        cachedGaussian = null;
        return g;
      }
      // Box-Muller transform; guard against u1 === 0 (log(0)).
      let u1 = next();
      if (u1 === 0) u1 = Number.EPSILON;
      const u2 = next();
      const r = Math.sqrt(-2 * Math.log(u1));
      const z0 = r * Math.cos(2 * Math.PI * u2);
      const z1 = r * Math.sin(2 * Math.PI * u2);
      cachedGaussian = z1;
      return z0;
    },
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Rng.pick: items is empty');
      return items[Math.floor(next() * items.length) % items.length];
    },
  };
}

/** FNV-1a 32-bit hash over `${baseSeed}|${labels.join('|')}`, returned as an unsigned 32-bit int suitable for createRng. */
export function deriveSeed(baseSeed: number, ...labels: string[]): number {
  const str = `${baseSeed}|${labels.join('|')}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
