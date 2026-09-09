import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '../world';
import { getScenario } from './registry';
import { instantiateScenario } from './loader';
import { resolveRandomization } from './randomize';

const t4 = getScenario('t4-wrong-roll-closure-7');

describe('3. red-herring pool picking', () => {
  it('is deterministic per seed and always picks exactly `pick` items, each flagged isRedHerring', () => {
    const a = resolveRandomization(t4, 5);
    const b = resolveRandomization(t4, 5);
    expect(a.redHerrings.map((f) => f.instanceId)).toEqual(b.redHerrings.map((f) => f.instanceId));
    expect(a.redHerrings).toHaveLength(t4.redHerringPool!.pick);
    for (const f of a.redHerrings) expect(f.isRedHerring).toBe(true);
  });
});

describe('4. customer phrasing selection', () => {
  it('matches an independently recomputed pick for cust-b-301 under seed 7', () => {
    const resolved = resolveRandomization(t4, 7);
    const report = t4.nocReports.find((r) => r.customerId === 'cust-b-301')!;
    const choices = [report.reportedSymptom, ...(report.phrasingVariants ?? [])];
    const expected = createRng(deriveSeed(7, 'scenario', 't4-wrong-roll-closure-7', 'report:cust-b-301')).pick(choices);
    expect(resolved.customerSymptoms.get('cust-b-301')).toBe(expected);
  });
});

describe('5. derived live-service', () => {
  it('marks sp-cl7-fdhc live, blue/blue live and blue/orange dead on the feeder, and green/brown never live', () => {
    const { world } = instantiateScenario(t4, 1);
    const fdhc = world.topology.spans.find((s) => s.id === 'sp-cl7-fdhc')!;
    expect(fdhc.liveService).toBe(true);

    const feeder = world.topology.spans.find((s) => s.id === 'sp-feeder-main')!;
    const strand = (tube: string, fiber: string) => feeder.strands!.find((s) => s.tubeColor === tube && s.fiberColor === fiber)!;
    expect(strand('blue', 'blue').live).toBe(true);
    expect(strand('blue', 'orange').live).toBe(false);
    expect(strand('blue', 'green').live).toBeFalsy();
    expect(strand('blue', 'brown').live).toBeFalsy();
  });
});
