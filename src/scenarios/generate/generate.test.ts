import { describe, expect, it } from 'vitest';
import { resolveProfileSet } from '../../profiles';
import { perform, startSession } from '../../session/runner';
import { scoreSession } from '../../scoring/score';
import { instantiateScenario } from '../loader';
import { validateScenario } from '../validate';
import { generateScenario } from './generate';
import { FOCUS_BY_TIER, generatedId, parseGeneratedId } from './params';
import type { GeneratorParams, GeneratorSize, GeneratorTier } from './params';

const SIZES: GeneratorSize[] = ['small', 'medium', 'large'];
const SEEDS = [1, 2, 3, 4, 5, 6];

const combos: GeneratorParams[] = [];
for (const tier of [1, 2, 3, 4, 5] as GeneratorTier[]) {
  for (const focus of [...FOCUS_BY_TIER[tier], 'any' as const]) {
    for (const size of SIZES) combos.push({ tier, focus, size });
  }
}

describe('generated scenario ids', () => {
  it('round-trip through the id encoding', () => {
    for (const c of combos) expect(parseGeneratedId(generatedId(c))).toEqual(c);
    expect(parseGeneratedId('t1-dark-ont-vista-court')).toBeNull();
    expect(parseGeneratedId('t9-gen-cpe-small')).toBeNull();
  });
});

describe('every generated combination validates with zero errors and a perfect reference run', () => {
  it.each(combos.flatMap((c) => SEEDS.map((seed) => [generatedId(c), seed, c] as const)))('%s seed %i', (_id, seed, params) => {
    const def = generateScenario(params, seed);
    const errors = validateScenario(def).filter((i) => i.severity === 'error');
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
  });
});

describe('determinism and variety', () => {
  it('the same params + seed produce byte-identical definitions', () => {
    const a = generateScenario({ tier: 3, focus: 'plant', size: 'medium' }, 42);
    const b = generateScenario({ tier: 3, focus: 'plant', size: 'medium' }, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds change the plant (addresses, lengths, fault placement)', () => {
    const a = generateScenario({ tier: 3, focus: 'plant', size: 'medium' }, 1);
    const b = generateScenario({ tier: 3, focus: 'plant', size: 'medium' }, 2);
    expect(JSON.stringify(a.topology)).not.toBe(JSON.stringify(b.topology));
  });

  it('"any" focus draws more than one fault kind across seeds at tier 4', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const def = generateScenario({ tier: 4, focus: 'any', size: 'medium' }, seed);
      for (const f of def.faults) if (!f.isRedHerring) kinds.add(f.kind);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it('a generated scenario plays end to end through the runner and scores the reference perfectly', () => {
    const def = generateScenario({ tier: 4, focus: 'plant', size: 'large' }, 7);
    const { world, meta } = instantiateScenario(def, 7);
    const profiles = resolveProfileSet(def.profiles);
    let state = startSession(world, profiles, meta);
    for (const step of meta.referenceSolution.steps) state = perform(state, step).state;
    const report = scoreSession(state);
    expect(report.axes.diagnosticAccuracy.score).toBe(100);
    expect(report.axes.evidenceQuality.score).toBe(100);
    expect(report.axes.safetyCompliance.score).toBe(100);
  });
});
