import { describe, expect, it } from 'vitest';
import {
  ACCEPT_MAX_DB,
  ACCEPT_MEAN_DB,
  allMistakes,
  caseSeconds,
  elapsedSeconds,
  omitted,
  PHASES,
  PROCEDURE,
  spliceLoss,
  STEP_IDS,
  step,
  stepsInPhase,
  validateOrder,
  type StepId,
} from './ribbon';

/** The order a splicer working correctly moves in, setup through closeout. */
const CLEAN: StepId[] = [
  'set-splice-mode', 'arc-test', 'open-closure', 'anchor-cable', 'strip-tube', 'lay-out-ribbons',
  'stage-sleeves', 'strip-ribbon', 'clean-fibre', 'tap-separate', 'cleave', 'clean-vgrooves',
  'load-splicer', 'fuse', 'inspect-loss', 'inspect-weld', 'shrink-sleeve', 'cool-sleeve',
  'seat-in-tray', 'dress-slack', 'label', 'close-closure',
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
      expect(PHASES).toContain(s.phase);
    }
  });

  it('gives every mistake a consequence rather than just a name', () => {
    for (const m of allMistakes()) expect(m.consequence.length).toBeGreaterThan(30);
  });

  it('leaves no loss signature orphaned', () => {
    // A signature with no mistake behind it is one the UI can describe and the engine can
    // never produce. That happened once, when a rewrite dropped the only 'edges' defect and
    // left the bench claiming a shape it could not draw.
    const used = new Set(allMistakes().filter((m) => m.addedLossDb).map((m) => m.affects ?? 'all'));
    for (const signature of ['all', 'edges', 'scattered']) {
      expect(used.has(signature as never), `no mistake produces the "${signature}" signature`).toBe(true);
    }
  });

  it('throws on an unknown step rather than returning something plausible', () => {
    expect(() => step('not-a-step' as StepId)).toThrow(/unknown ribbon step/);
  });
});

describe('phases, because frequency is part of the lesson', () => {
  it('puts the arc test in setup, not in the per-ribbon loop', () => {
    // Arc testing every ribbon is as wrong as never arc testing.
    expect(step('arc-test').phase).toBe('setup');
    expect(step('cleave').phase).toBe('per-ribbon');
    expect(step('close-closure').phase).toBe('closeout');
  });

  it('every step belongs to exactly one phase, and every phase has steps', () => {
    const total = PHASES.reduce((n, p) => n + stepsInPhase(p).length, 0);
    expect(total).toBe(PROCEDURE.length);
    for (const p of PHASES) expect(stepsInPhase(p).length).toBeGreaterThan(0);
  });

  it('costs a real 432-to-432 case correctly: setup once, loop per ribbon, closeout per tray', () => {
    const setup = elapsedSeconds(stepsInPhase('setup').map((s) => s.id), []);
    const loop = elapsedSeconds(stepsInPhase('per-ribbon').map((s) => s.id), []);
    const close = elapsedSeconds(stepsInPhase('closeout').map((s) => s.id), []);
    // 36 ribbons, 12 to a tray = 3 trays.
    expect(caseSeconds(36, 12)).toBe(setup + 36 * loop + 3 * close);
  });

  it('a bigger case costs more, and the loop dominates it', () => {
    expect(caseSeconds(72, 12)).toBeGreaterThan(caseSeconds(36, 12));
  });
});

describe('order is judged on dependencies, not on list position', () => {
  it('accepts a correct-but-different order', () => {
    const swapped = CLEAN.slice();
    const li = swapped.indexOf('label');
    const di = swapped.indexOf('dress-slack');
    swapped[li] = 'dress-slack';
    swapped[di] = 'label';
    expect(validateOrder(swapped)).toEqual([]);
  });

  it('catches cleaving before the fibres were tapped apart', () => {
    const bad: StepId[] = ['set-splice-mode', 'arc-test', 'stage-sleeves', 'strip-ribbon', 'clean-fibre', 'cleave'];
    expect(validateOrder(bad).some((i) => i.step === 'cleave' && i.missing === 'tap-separate')).toBe(true);
  });

  it('catches splicing before the machine was ever arc tested', () => {
    const bad = CLEAN.filter((s) => s !== 'arc-test');
    expect(omitted(bad)).toContain('arc-test');
  });

  it('catches seating the tray before the sleeve had cooled', () => {
    const bad = CLEAN.filter((s) => s !== 'cool-sleeve');
    expect(validateOrder(bad).some((i) => i.step === 'seat-in-tray' && i.missing === 'cool-sleeve')).toBe(true);
  });

  it('reports what was skipped entirely', () => {
    const skipped = CLEAN.filter((s) => s !== 'clean-vgrooves' && s !== 'label');
    expect(omitted(skipped).sort()).toEqual(['clean-vgrooves', 'label']);
  });
});

describe('what the splicer reports', () => {
  it('is deterministic for a seed and a set of mistakes', () => {
    expect(spliceLoss(7, 12, [])).toEqual(spliceLoss(7, 12, []));
    expect(spliceLoss(7, 12, ['dull-blade'])).toEqual(spliceLoss(7, 12, ['dull-blade']));
  });

  it('reads in hundredths on a calibrated machine, one reading per fibre', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = spliceLoss(seed, 12, []);
      expect(r.lossDb).toHaveLength(12);
      expect(r.pass).toBe(true);
      expect(r.meanDb).toBeLessThanOrEqual(ACCEPT_MEAN_DB);
      expect(r.worstDb).toBeLessThanOrEqual(ACCEPT_MAX_DB);
    }
  });

  it('still varies fibre to fibre when everything was done right', () => {
    expect(new Set(spliceLoss(3, 12, []).lossDb).size).toBeGreaterThan(1);
  });

  it('an uncalibrated arc lifts the whole case, which is why it is a setup step', () => {
    const clean = spliceLoss(9, 12, []);
    const noArc = spliceLoss(9, 12, ['no-arc-test']);
    expect(noArc.meanDb).toBeGreaterThan(clean.meanDb);
    // Uniform, not scattered: every fibre carries it.
    const spread = Math.max(...noArc.lossDb) - Math.min(...noArc.lossDb);
    expect(spread).toBeLessThan(0.1);
  });

  it('fails the set when the bare fibre was never cleaned', () => {
    const r = spliceLoss(5, 12, ['skip-clean']);
    expect(r.pass).toBe(false);
    expect(r.failed.length).toBeGreaterThan(0);
  });

  it('an uneven glue matrix takes the OUTER fibres and leaves the middle alone', () => {
    const r = spliceLoss(11, 12, ['uneven-matrix']);
    const worstMiddle = Math.max(...r.lossDb.slice(1, -1));
    expect(r.lossDb[0]).toBeGreaterThan(worstMiddle);
    expect(r.lossDb[11]).toBeGreaterThan(worstMiddle);
    // The untouched middle is the diagnostic half of it.
    expect(worstMiddle).toBeLessThan(0.1);
  });

  it('a dull blade takes a scattered few, leaving the rest of the ribbon normal', () => {
    const r = spliceLoss(11, 12, ['dull-blade']);
    expect(Math.max(...r.lossDb) - Math.min(...r.lossDb)).toBeGreaterThan(0.15);
    expect(Math.min(...r.lossDb)).toBeLessThan(0.1);
  });

  it('contamination lifts the WHOLE set instead — the contrast that makes each readable', () => {
    const blade = spliceLoss(11, 12, ['dull-blade']);
    const dirt = spliceLoss(11, 12, ['skip-clean']);
    const spread = (a: { lossDb: number[] }) => Math.max(...a.lossDb) - Math.min(...a.lossDb);
    expect(spread(dirt)).toBeLessThan(spread(blade));
    expect(Math.min(...dirt.lossDb)).toBeGreaterThan(Math.min(...blade.lossDb));
  });

  it('stacks the cost of compounding mistakes', () => {
    const one = spliceLoss(9, 12, ['no-arc-test']);
    const two = spliceLoss(9, 12, ['no-arc-test', 'dirty-vgrooves']);
    expect(two.meanDb).toBeGreaterThan(one.meanDb);
  });
});

describe('the mistakes that cost time rather than loss', () => {
  it('charges rework only when the mistake actually forces it', () => {
    const clean = elapsedSeconds(CLEAN, []);
    expect(elapsedSeconds(CLEAN, ['no-sleeve'])).toBeGreaterThan(clean);
    // A missing label costs nothing today — that is precisely why it gets skipped.
    expect(elapsedSeconds(CLEAN, ['no-label'])).toBe(clean);
  });

  it('makes the sleeve mistakes expensive, because they are found after the fact', () => {
    const clean = elapsedSeconds(CLEAN, []);
    expect(elapsedSeconds(CLEAN, ['stowed-hot'])).toBeGreaterThan(clean + 500);
    expect(elapsedSeconds(CLEAN, ['pushed-sleeve-centre'])).toBeGreaterThan(clean + 500);
  });

  it('makes mismatching the two sides the most expensive mistake in the procedure', () => {
    const byId = Object.fromEntries(allMistakes().map((m) => [m.id, m]));
    expect(byId['mismatched-sides'].reworkSeconds).toBeGreaterThan(byId['no-sleeve'].reworkSeconds!);
  });

  it('knows that clamping a site-glued ribbon costs a re-glue and a wait', () => {
    const byId = Object.fromEntries(allMistakes().map((m) => [m.id, m]));
    expect(byId['overclamped-stripper'].rework).toBe(true);
    expect(byId['overclamped-stripper'].consequence).toMatch(/re-glue|dry/i);
  });
});
