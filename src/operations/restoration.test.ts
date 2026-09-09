import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '../world';
import {
  DAMAGE_REACH,
  damagedReachM,
  generateRestorationJob,
  judgeRestoration,
  removedLengthM,
  shouldRestoreFirst,
  type DamageReport,
  type RestorationPlan,
} from './restoration';

/** A dig-in with plenty of slack: a splice-through is the right answer here. */
function report(over: Partial<DamageReport> = {}): DamageReport {
  return {
    id: 'dmg-1',
    cause: 'dig-in',
    cableLabel: '48f backbone — Via Ladera',
    distanceM: 1420,
    visibleDamageM: 3,
    slackAM: 15,
    slackBM: 15,
    tubes: [
      { color: 'blue', circuits: 12, priority: 'critical', serves: 'the clinic on Antonio' },
      { color: 'orange', circuits: 20, priority: 'residential', serves: 'Camino Alto residential' },
      { color: 'green', circuits: 8, priority: 'business', serves: 'two business parks' },
    ],
    ...over,
  };
}

/** Past the damage, ends reach, checked, right tube first. */
const GOOD: RestorationPlan = {
  method: 'splice-through',
  cutBackM: 7,
  restoreFirst: 'blue',
  verifiedExposedFibre: true,
};

describe('how far the damage goes', () => {
  it('is further than you can see, for every cause', () => {
    for (const [, entry] of Object.entries(DAMAGE_REACH)) {
      expect(entry.reachM).toBeGreaterThan(0);
      expect(entry.why.length).toBeGreaterThan(20);
    }
  });

  it('is ordered by how far the mechanism actually carries', () => {
    // The ordering is the lesson; the magnitudes are flagged as inference in the module.
    expect(DAMAGE_REACH['water-ingress'].reachM).toBeGreaterThan(DAMAGE_REACH['dig-in'].reachM);
    expect(DAMAGE_REACH['dig-in'].reachM).toBeGreaterThan(DAMAGE_REACH['vehicle-strike'].reachM);
    expect(DAMAGE_REACH['vehicle-strike'].reachM).toBeGreaterThan(DAMAGE_REACH.rodent.reachM);
  });

  it('reads the reach off the cause, not off what is visible', () => {
    expect(damagedReachM(report({ cause: 'rodent', visibleDamageM: 30 }))).toBe(DAMAGE_REACH.rodent.reachM);
  });
});

describe('what a plan removes', () => {
  it('is the wrecked length plus both cut-backs', () => {
    expect(removedLengthM(report({ visibleDamageM: 3 }), { ...GOOD, cutBackM: 7 })).toBe(17);
  });
});

describe('a restoration that can be worked', () => {
  it('passes clean when it is past the damage, reaches, checked, and in the right order', () => {
    const verdict = judgeRestoration(report(), GOOD);
    expect(verdict.issues).toEqual([]);
    expect(verdict.accepted).toBe(true);
    expect(verdict.endsReach).toBe(true);
  });

  it('accepts an inserted section when the ends genuinely will not reach', () => {
    const tight = report({ slackAM: 4, slackBM: 4 });
    const verdict = judgeRestoration(tight, { ...GOOD, method: 'insert-section' });
    expect(verdict.issues).toEqual([]);
    expect(verdict.accepted).toBe(true);
    expect(verdict.endsReach).toBe(false);
  });
});

describe('the fault nobody finds for six months', () => {
  it('flags a cut-back that stops short of where the damage reaches', () => {
    const verdict = judgeRestoration(report(), { ...GOOD, cutBackM: 2 });
    const issue = verdict.issues.find((i) => i.code === 'spliced-onto-damaged-fibre');
    expect(issue?.severity).toBe('latent');
    expect(issue?.meters).toBeCloseTo(4);
    expect(verdict.accepted).toBe(false);
  });

  it('needs a much longer cut-back on water than on a rodent, for the same visible damage', () => {
    const wet = judgeRestoration(report({ cause: 'water-ingress' }), { ...GOOD, cutBackM: 7 });
    const chewed = judgeRestoration(report({ cause: 'rodent' }), { ...GOOD, cutBackM: 7 });
    expect(wet.latent).toBe(1);
    expect(chewed.latent).toBe(0);
  });

  it('turns skipping the check from a grumble into a blocker when the fibre is actually damaged', () => {
    const sound = judgeRestoration(report(), { ...GOOD, verifiedExposedFibre: false });
    expect(sound.issues.find((i) => i.code === 'unverified-exposed-fibre')?.severity).toBe('workmanship');

    const damaged = judgeRestoration(report(), { ...GOOD, cutBackM: 2, verifiedExposedFibre: false });
    expect(damaged.issues.find((i) => i.code === 'unverified-exposed-fibre')?.severity).toBe('blocking');
  });
});

describe('the fault that stops you on site', () => {
  it('flags a splice-through whose ends will not meet, and says by how much', () => {
    const tight = report({ slackAM: 4, slackBM: 4 });
    const verdict = judgeRestoration(tight, GOOD);
    const issue = verdict.issues.find((i) => i.code === 'ends-will-not-reach');
    expect(issue?.severity).toBe('blocking');
    // 3 m visible + 14 m cut back = 17 removed, against 8 m of slack.
    expect(issue?.meters).toBeCloseTo(9);
    expect(verdict.accepted).toBe(false);
  });

  it('flags a section inserted when the ends would have reached', () => {
    const verdict = judgeRestoration(report(), { ...GOOD, method: 'insert-section' });
    expect(verdict.issues.find((i) => i.code === 'unnecessary-section')?.severity).toBe('workmanship');
    // Costs hours, not the splice: the plan is still workable.
    expect(verdict.accepted).toBe(true);
  });

  it('does not also nag about over-cutting when there is slack to spare', () => {
    const verdict = judgeRestoration(report({ slackAM: 40, slackBM: 40 }), { ...GOOD, cutBackM: 25 });
    expect(verdict.issues.filter((i) => i.code === 'over-cut')).toHaveLength(0);
  });

  it('does nag when the over-cut is the reason the ends stopped reaching', () => {
    const verdict = judgeRestoration(report(), { ...GOOD, cutBackM: 25 });
    expect(verdict.issues.find((i) => i.code === 'over-cut')?.severity).toBe('workmanship');
    expect(verdict.endsReach).toBe(false);
  });
});

describe('who goes back first', () => {
  it('is the highest priority, and more circuits breaks a tie', () => {
    expect(shouldRestoreFirst(report()).color).toBe('blue');
    const twoCritical = report({
      tubes: [
        { color: 'blue', circuits: 8, priority: 'critical', serves: 'the school' },
        { color: 'orange', circuits: 24, priority: 'critical', serves: 'the clinic on Antonio' },
      ],
    });
    expect(shouldRestoreFirst(twoCritical).color).toBe('orange');
  });

  it('is workmanship, not a blocker: everything gets restored, the order decides who waits', () => {
    const verdict = judgeRestoration(report(), { ...GOOD, restoreFirst: 'orange' });
    expect(verdict.issues.find((i) => i.code === 'restored-out-of-order')?.severity).toBe('workmanship');
    expect(verdict.accepted).toBe(true);
  });
});

describe('generated callouts', () => {
  const job = (seed: number) => generateRestorationJob(seed, createRng(deriveSeed(seed, 'restoration')));

  it('are deterministic from the seed', () => {
    expect(job(11)).toEqual(job(11));
  });

  it('always admit a clean plan, so the answer is never "give up"', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { report: r } = job(seed);
      const reach = damagedReachM(r);
      const cutBackM = reach;
      const removed = r.visibleDamageM + cutBackM * 2;
      const verdict = judgeRestoration(r, {
        method: removed <= r.slackAM + r.slackBM ? 'splice-through' : 'insert-section',
        cutBackM,
        restoreFirst: shouldRestoreFirst(r).color,
        verifiedExposedFibre: true,
      });
      expect(verdict.issues).toEqual([]);
    }
  });

  it('deal both mornings: sometimes the ends reach and sometimes a section is the right call', () => {
    let reachable = 0;
    let sectioned = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { report: r } = job(seed);
      const removed = r.visibleDamageM + damagedReachM(r) * 2;
      if (removed <= r.slackAM + r.slackBM) reachable++;
      else sectioned++;
    }
    // Neither is rare enough to be a curiosity. A trainee who only ever sees one of them
    // learns a habit instead of a decision.
    expect(reachable).toBeGreaterThan(40);
    expect(sectioned).toBeGreaterThan(40);
  });

  it('always give the cable something critical on it, so the order question is a real one', () => {
    for (let seed = 1; seed <= 100; seed++) {
      expect(job(seed).report.tubes.some((t) => t.priority === 'critical')).toBe(true);
    }
  });
});

describe('the cable reads as one cable', () => {
  const job = (seed: number) => generateRestorationJob(seed, createRng(deriveSeed(seed, 'restoration')));

  it('never has two tubes claiming to feed the same thing', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const serves = job(seed).report.tubes.map((t) => t.serves);
      expect(new Set(serves).size).toBe(serves.length);
    }
  });

  it('describes each tube as the kind of thing its priority says it is', () => {
    // A tube marked CRITICAL that says it feeds a residential block teaches the trainee that
    // the label is arbitrary and the description is decoration -- and the whole restoration
    // order question is read off the description.
    const residential = ['Vista Court', 'Camino Alto', 'Paseo Vista', 'Via Ladera homes'];
    for (let seed = 1; seed <= 200; seed++) {
      for (const tube of job(seed).report.tubes) {
        const soundsResidential = residential.some((r) => tube.serves.includes(r));
        expect(soundsResidential).toBe(tube.priority === 'residential');
      }
    }
  });

  it('names the cable for its route, not for one thing hanging off it', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { report: r } = job(seed);
      for (const tube of r.tubes) expect(r.cableLabel).not.toContain(tube.serves);
    }
  });
});

describe('the summary reads like a sentence', () => {
  it('agrees its verb with its noun, at one and at more than one', () => {
    // "2 things that costs hours" survived a screenshot review once. It is one character and
    // it is the sort of thing nobody ever goes back for.
    const one = judgeRestoration(report(), { ...GOOD, restoreFirst: 'orange' });
    expect(one.summary).toContain('1 thing that costs hours');

    const several = judgeRestoration(report(), { ...GOOD, restoreFirst: 'orange', verifiedExposedFibre: false });
    expect(several.summary).toContain('2 things that cost hours');
  });

  it('leads with the latent fault when there is one, because it outranks everything else', () => {
    const verdict = judgeRestoration(report(), { ...GOOD, cutBackM: 0, restoreFirst: 'orange' });
    expect(verdict.summary).toContain('fail later');
  });
});
