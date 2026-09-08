import { describe, expect, it } from 'vitest';
import {
  ACCEPT_MAX_DB,
  ACCEPT_MEAN_DB,
  allMistakes,
  elapsedSeconds,
  omitted,
  PROCEDURE,
  spliceLoss,
  STEP_IDS,
  step,
  validateOrder,
  type StepId,
} from './ribbon';

/** The order a technician who does everything right would work in. */
const CLEAN: StepId[] = [
  'stage-sleeves', 'open-closure', 'anchor-cable', 'strip-tube', 'clean-fibres',
  'ribbonize', 'heat-strip', 'clean-bare', 'cleave', 'load-splicer', 'fuse',
  'inspect-loss', 'shrink-sleeve', 'route-tray', 'dress-slack', 'label', 'close-closure',
];

describe('the procedure itself', () => {
  it('is internally consistent: every dependency is a real step', () => {
    for (const s of PROCEDURE) {
      for (const dep of s.after) expect(STEP_IDS).toContain(dep);
    }
  });

  it('has no circular dependencies — the clean order satisfies every one of them', () => {
    expect(validateOrder(CLEAN)).toEqual([]);
    expect(omitted(CLEAN)).toEqual([]);
  });

  it('explains why every step exists, because that is the part being taught', () => {
    for (const s of PROCEDURE) {
      expect(s.why.length).toBeGreaterThan(40);
      expect(s.title.length).toBeGreaterThan(3);
    }
  });

  it('gives every mistake a consequence rather than just a name', () => {
    for (const m of allMistakes()) {
      expect(m.consequence.length).toBeGreaterThan(30);
      // A mistake must do something: cost loss, or force rework, or both.
      expect(m.rework || typeof m.addedLossDb === 'number' || m.consequence.length > 0).toBe(true);
    }
  });

  it('throws on an unknown step rather than returning something plausible', () => {
    expect(() => step('not-a-step' as StepId)).toThrow(/unknown ribbon step/);
  });
});

describe('order is judged on dependencies, not on list position', () => {
  it('accepts a correct-but-different order', () => {
    // Labelling before dressing the slack is fine: neither depends on the other.
    const swapped = CLEAN.slice();
    const li = swapped.indexOf('label');
    const di = swapped.indexOf('dress-slack');
    swapped[li] = 'dress-slack';
    swapped[di] = 'label';
    expect(validateOrder(swapped)).toEqual([]);
  });

  it('catches stripping before the fibres were ribbonized', () => {
    const bad: StepId[] = ['stage-sleeves', 'open-closure', 'anchor-cable', 'strip-tube', 'clean-fibres', 'heat-strip'];
    const issues = validateOrder(bad);
    expect(issues.some((i) => i.step === 'heat-strip' && i.missing === 'ribbonize')).toBe(true);
  });

  it('catches closing the closure before the slack is dressed', () => {
    const bad = CLEAN.filter((s) => s !== 'dress-slack');
    expect(validateOrder(bad).some((i) => i.step === 'close-closure' && i.missing === 'dress-slack')).toBe(true);
  });

  it('reports what was skipped entirely', () => {
    const skipped = CLEAN.filter((s) => s !== 'clean-bare' && s !== 'label');
    expect(omitted(skipped).sort()).toEqual(['clean-bare', 'label']);
  });
});

describe('what the splicer reports', () => {
  it('is deterministic for a seed and a set of mistakes', () => {
    expect(spliceLoss(7, 12, [])).toEqual(spliceLoss(7, 12, []));
    expect(spliceLoss(7, 12, ['dull-blade'])).toEqual(spliceLoss(7, 12, ['dull-blade']));
  });

  it('passes a clean job, and reports one reading per fibre', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = spliceLoss(seed, 12, []);
      expect(r.lossDb).toHaveLength(12);
      expect(r.pass).toBe(true);
      expect(r.meanDb).toBeLessThanOrEqual(ACCEPT_MEAN_DB);
      expect(r.worstDb).toBeLessThanOrEqual(ACCEPT_MAX_DB);
    }
  });

  it('still varies fibre to fibre when everything was done right', () => {
    // One good reading proves nothing about the set — that is the lesson.
    const r = spliceLoss(3, 12, []);
    expect(new Set(r.lossDb).size).toBeGreaterThan(1);
  });

  it('fails the set when the bare fibre was never cleaned', () => {
    const r = spliceLoss(5, 12, ['skip-clean']);
    expect(r.pass).toBe(false);
    expect(r.failed.length).toBeGreaterThan(0);
  });

  it('an uneven glue matrix hurts the EDGES of the ribbon, which is how you identify it', () => {
    const r = spliceLoss(11, 12, ['uneven-matrix']);
    const worstMiddle = Math.max(...r.lossDb.slice(1, -1));
    expect(r.lossDb[0]).toBeGreaterThan(worstMiddle);
    expect(r.lossDb[11]).toBeGreaterThan(worstMiddle);
    // and the middle of the ribbon is untouched, which is the diagnostic half of it
    expect(worstMiddle).toBeLessThan(0.1);
  });

  it('a dull blade takes a scattered few, leaving the rest of the ribbon normal', () => {
    // The signature: within one set, some fibres sit at the clean baseline and some are
    // clearly elevated. That gap is what says "blade", not "contamination".
    const r = spliceLoss(11, 12, ['dull-blade']);
    const lo = Math.min(...r.lossDb);
    const hi = Math.max(...r.lossDb);
    expect(hi - lo).toBeGreaterThan(0.15);
    expect(lo).toBeLessThan(0.1);
  });

  it('contamination lifts the WHOLE set instead — the contrast that makes each readable', () => {
    const blade = spliceLoss(11, 12, ['dull-blade']);
    const dirt = spliceLoss(11, 12, ['skip-clean']);
    const spread = (a: { lossDb: number[] }) => Math.max(...a.lossDb) - Math.min(...a.lossDb);
    // Dirt raises every fibre together, so its spread stays tight; the blade's does not.
    expect(spread(dirt)).toBeLessThan(spread(blade));
    expect(Math.min(...dirt.lossDb)).toBeGreaterThan(Math.min(...blade.lossDb));
  });

  it('stacks the cost of compounding mistakes', () => {
    const one = spliceLoss(9, 12, ['gel-left']);
    const two = spliceLoss(9, 12, ['gel-left', 'dirty-grooves']);
    expect(two.meanDb).toBeGreaterThan(one.meanDb);
  });
});

describe('time on the job', () => {
  it('adds up the clean run', () => {
    expect(elapsedSeconds(CLEAN, [])).toBeGreaterThan(0);
  });

  it('charges for rework only when the mistake actually forces it', () => {
    const clean = elapsedSeconds(CLEAN, []);
    // Forgetting the sleeves means cutting the splice out and starting the fibre again.
    expect(elapsedSeconds(CLEAN, ['no-sleeve'])).toBeGreaterThan(clean);
    // A missing label costs nothing today — that is precisely why it gets skipped.
    expect(elapsedSeconds(CLEAN, ['no-label'])).toBe(clean);
  });
});
