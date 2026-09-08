import { describe, expect, it } from 'vitest';
import {
  bestRun,
  BENCH_DOMAINS,
  omittedFrom,
  scoreSpliceRun,
  scoreTrayRun,
  standings,
  type BenchRun,
} from './benchRecord';
import { PROCEDURE, type StepId } from './ribbon';
import { goodPlacement, judgeTray, type Tray } from './tray';

const ALL: StepId[] = PROCEDURE.map((s) => s.id);

function run(over: Partial<BenchRun> = {}): BenchRun {
  return {
    id: 'r1', traineeId: 't', kind: 'ribbon-splice', at: '2026-09-07T10:00:00Z',
    seed: 1, mistakes: [], omitted: [], seconds: 600, passed: true, score: 90,
    domains: ['splicing', 'testing'], ...over,
  };
}

describe('scoring a ribbon run', () => {
  it('gives a clean run full marks', () => {
    expect(scoreSpliceRun({ mistakes: [], omitted: [], passed: true })).toBe(100);
  });

  it('charges rework by the time it costs, not by the count of mistakes', () => {
    // Forgetting the sleeves is seven minutes of cutting back; a wet wipe costs nothing.
    const sleeves = scoreSpliceRun({ mistakes: ['no-sleeve'], omitted: [], passed: true });
    const wipe = scoreSpliceRun({ mistakes: ['too-much-alcohol'], omitted: [], passed: true });
    expect(sleeves).toBeLessThan(wipe);
  });

  it('charges loss separately from time, because they are paid at different moments', () => {
    // skip-clean adds loss and forces no rework; it must still cost.
    expect(scoreSpliceRun({ mistakes: ['skip-clean'], omitted: [], passed: true })).toBeLessThan(100);
  });

  it('still penalises a mistake that neither reworks nor adds loss', () => {
    // Losing blue-up costs nobody anything today and everybody something later.
    expect(scoreSpliceRun({ mistakes: ['lost-blue-up'], omitted: [], passed: true })).toBeLessThan(100);
  });

  it('treats skipping a step as worse than doing it badly', () => {
    const badly = scoreSpliceRun({ mistakes: ['too-much-alcohol'], omitted: [], passed: true });
    const notAtAll = scoreSpliceRun({ mistakes: [], omitted: ['clean-fibre'], passed: true });
    expect(notAtAll).toBeLessThan(badly);
  });

  it('costs more again when the set does not pass', () => {
    const a = scoreSpliceRun({ mistakes: ['skip-clean'], omitted: [], passed: true });
    const b = scoreSpliceRun({ mistakes: ['skip-clean'], omitted: [], passed: false });
    expect(b).toBeLessThan(a);
  });

  it('never leaves the 0–100 range, however bad the run', () => {
    const every = PROCEDURE.flatMap((s) => s.mistakes.map((m) => m.id));
    const worst = scoreSpliceRun({ mistakes: every, omitted: ALL, passed: false });
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(worst).toBeLessThanOrEqual(100);
  });

  it('ignores a mistake id it does not recognise rather than throwing', () => {
    expect(scoreSpliceRun({ mistakes: ['not-a-real-mistake'], omitted: [], passed: true })).toBe(100);
  });
});

describe('scoring a tray', () => {
  const tray = (placements: Tray['placements'], holders = 12): Tray => ({ id: 't', holders, placements });

  it('gives a clean tray full marks', () => {
    const v = judgeTray(tray([goodPlacement('blue', 1, 1), goodPlacement('blue', 2, 2)]), true);
    expect(scoreTrayRun(v)).toBe(100);
  });

  it('charges a defect harder than a workmanship item', () => {
    const defect = judgeTray(tray([{ ...goodPlacement('blue', 1, 1), holder: null }]), true);
    const workmanship = judgeTray(tray([goodPlacement('blue', 1, 1)]), false);
    expect(scoreTrayRun(defect)).toBeLessThan(scoreTrayRun(workmanship));
  });

  it('stays inside 0–100 for a thoroughly wrecked tray', () => {
    const bad = Array.from({ length: 16 }, (_, i) => ({
      tube: 'blue', fibre: i + 1, holder: null, bendRadiusMm: 8, slackMm: 50, crossesOthers: true,
    }));
    const s = scoreTrayRun(judgeTray(tray(bad), false));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe('omissions', () => {
  it('reports nothing when the whole procedure was worked', () => {
    expect(omittedFrom(ALL)).toEqual([]);
  });

  it('names exactly what was skipped', () => {
    expect(omittedFrom(ALL.filter((s) => s !== 'arc-test'))).toEqual(['arc-test']);
  });
});

describe('where the trainee stands', () => {
  it('puts the weakest competency first', () => {
    const s = standings([
      run({ id: 'a', kind: 'ribbon-splice', score: 90, domains: ['splicing'] }),
      run({ id: 'b', kind: 'tray-dress', score: 40, domains: ['records'] }),
    ]);
    expect(s[0].domain).toBe('records');
  });

  it('averages across every run that touched a competency', () => {
    const s = standings([
      run({ id: 'a', score: 100, domains: ['splicing'] }),
      run({ id: 'b', score: 50, domains: ['splicing'] }),
    ]);
    expect(s[0]).toMatchObject({ domain: 'splicing', runs: 2, average: 75 });
  });

  it('reports how many runs a standing rests on, so one bad tray is not read as a weakness', () => {
    const s = standings([run({ id: 'a', score: 20, domains: ['records'] })]);
    expect(s[0].runs).toBe(1);
  });

  it('says nothing at all with no history', () => {
    expect(standings([])).toEqual([]);
  });
});

describe('personal best', () => {
  it('finds the best run of a kind', () => {
    const best = bestRun([
      run({ id: 'a', kind: 'ribbon-splice', score: 61 }),
      run({ id: 'b', kind: 'ribbon-splice', score: 88 }),
      run({ id: 'c', kind: 'tray-dress', score: 99 }),
    ], 'ribbon-splice');
    expect(best!.id).toBe('b');
  });

  it('returns nothing when that bench has never been run', () => {
    expect(bestRun([], 'tray-dress')).toBeNull();
  });
});

describe('the benches declare what they exercise', () => {
  it('maps every bench to real competencies', () => {
    for (const kind of ['ribbon-splice', 'tray-dress'] as const) {
      expect(BENCH_DOMAINS[kind].length).toBeGreaterThan(0);
    }
  });
});
