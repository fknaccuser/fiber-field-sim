/** Efficiency: time actually spent vs. the scenario's authored reference solution. */
import type { SessionState } from '../session/types';
import type { AxisScore } from './types';
import { clamp } from './util';

export interface EfficiencyResult {
  score: AxisScore;
  overBudget: boolean;
  beatReference: boolean;
}

export function computeEfficiency(state: SessionState): EfficiencyResult {
  const actual = state.clockSeconds;
  const ref = state.meta.referenceSolution.totalSeconds;
  const beatReference = actual < ref;
  const budgetSeconds = state.meta.timeBudgetMinutes !== undefined ? state.meta.timeBudgetMinutes * 60 : undefined;
  const overBudget = budgetSeconds !== undefined && actual > budgetSeconds;

  const details: string[] = [];
  let score: number;
  if (overBudget) {
    score = 0;
    details.push(`Over the ${state.meta.timeBudgetMinutes}-minute time budget (took ${Math.round(actual / 60)} min).`);
  } else {
    score = 100 * clamp(ref / actual, 0, 1);
    details.push(`${actual}s actual vs ${ref}s reference.`);
    if (beatReference) details.push('Beat the reference solution.');
  }

  const topCosts = [...state.log].sort((a, b) => b.durationSeconds - a.durationSeconds).slice(0, 3);
  for (const a of topCosts) {
    if (a.durationSeconds > 0) details.push(`${a.type}: ${a.durationSeconds}s`);
  }

  return { score: { axis: 'efficiency', score, details }, overBudget, beatReference };
}
