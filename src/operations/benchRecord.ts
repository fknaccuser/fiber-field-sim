/**
 * Bench work, recorded.
 *
 * Until now the benches were demos: you could splice a ribbon perfectly or wreck every
 * fibre in it and nothing persisted, nothing scored, nothing changed about your day. That
 * is the difference between a toy and a trainer — practice that leaves no trace teaches
 * only whoever happens to be watching.
 *
 * A run is scored on what it cost, not on whether it was survivable. Two things carry
 * weight, and they are weighted differently on purpose:
 *
 *  - Mistakes that force REWORK cost time, and time is the thing a technician is actually
 *    judged on across a week.
 *  - Mistakes that add LOSS cost quality, and quality is what comes back on the test set
 *    long after you have driven away.
 *
 * Skipping a step entirely is treated as its own thing rather than folded into either,
 * because "I did it badly" and "I did not do it" are different admissions.
 *
 * Pure: no storage, no React. Persistence lives in ui/store.
 */
import { allMistakes, PROCEDURE, type StepId } from './ribbon';
import type { TrayVerdict } from './tray';

export type BenchKind = 'ribbon-splice' | 'tray-dress';

export interface BenchRun {
  id: string;
  traineeId: string;
  kind: BenchKind;
  /** ISO timestamp. */
  at: string;
  seed: number;
  /** Mistake ids taken during the run. */
  mistakes: string[];
  /** Steps never performed at all. */
  omitted: string[];
  /** Simulated seconds, including any rework the mistakes forced. */
  seconds: number;
  /** Did the work meet its own acceptance? */
  passed: boolean;
  /** 0–100. */
  score: number;
  /** Competencies this run exercised. */
  domains: string[];
}

/** A skipped step is its own kind of failure, and costs more than a sloppy one. */
const OMISSION_COST = 7;

/**
 * Score a ribbon run.
 *
 * Rework is charged per minute lost rather than per mistake, so forgetting the sleeves —
 * seven minutes of cutting back — costs more than a wipe that was slightly too wet, which
 * is exactly the ordering a splicer would recognise.
 */
export function scoreSpliceRun(args: {
  mistakes: readonly string[];
  omitted: readonly StepId[];
  passed: boolean;
}): number {
  const byId = new Map(allMistakes().map((m) => [m.id, m]));
  let score = 100;

  for (const id of args.mistakes) {
    const m = byId.get(id);
    if (!m) continue;
    if (m.addedLossDb) score -= m.addedLossDb * 55;
    if (m.rework) score -= ((m.reworkSeconds ?? 0) / 60) * 1.1;
    // A mistake with neither is still a mistake — it costs somebody later.
    if (!m.addedLossDb && !m.rework) score -= 4;
  }

  score -= args.omitted.length * OMISSION_COST;
  if (!args.passed) score -= 18;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Score a dressed tray. Defects block acceptance; workmanship is charged, not fatal. */
export function scoreTrayRun(verdict: TrayVerdict): number {
  let score = 100;
  score -= verdict.defects * 16;
  score -= verdict.workmanship * 5;
  score -= verdict.addedLossDb * 50;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** The competencies each bench exercises, for the record to roll up. */
export const BENCH_DOMAINS: Record<BenchKind, string[]> = {
  'ribbon-splice': ['splicing', 'testing'],
  'tray-dress': ['splicing', 'records'],
};

export const BENCH_LABEL: Record<BenchKind, string> = {
  'ribbon-splice': 'Ribbon splice',
  'tray-dress': 'Tray dressing',
};

/** Steps in the procedure that a run never touched. */
export function omittedFrom(performed: readonly StepId[]): StepId[] {
  const done = new Set(performed);
  return PROCEDURE.map((s) => s.id).filter((id) => !done.has(id));
}

export interface DomainStanding {
  domain: string;
  runs: number;
  /** Mean score across runs that exercised this competency. */
  average: number;
}

/**
 * Where the trainee actually stands, weakest first.
 *
 * Deliberately reports the number of runs alongside the average: one bad tray is not a
 * competency problem, and a readout that cannot tell those apart will send somebody to
 * practise the wrong thing.
 */
export function standings(runs: readonly BenchRun[]): DomainStanding[] {
  const acc = new Map<string, { total: number; n: number }>();
  for (const r of runs) {
    for (const d of r.domains) {
      const e = acc.get(d) ?? { total: 0, n: 0 };
      e.total += r.score;
      e.n += 1;
      acc.set(d, e);
    }
  }
  return [...acc.entries()]
    .map(([domain, e]) => ({ domain, runs: e.n, average: Math.round(e.total / e.n) }))
    .sort((a, b) => a.average - b.average || b.runs - a.runs);
}

/** Best run of a kind, for the dispatch panel to have something to beat. */
export function bestRun(runs: readonly BenchRun[], kind: BenchKind): BenchRun | null {
  const of = runs.filter((r) => r.kind === kind);
  if (of.length === 0) return null;
  return of.reduce((best, r) => (r.score > best.score ? r : best));
}
