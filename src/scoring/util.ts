import type { ActionEvent, Diagnosis, SessionState } from '../session/types';

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** The diagnosis submitted to end this session (the last 'diagnosis' action in the log). */
export function lastDiagnosis(state: SessionState): Diagnosis {
  for (let i = state.log.length - 1; i >= 0; i--) {
    const action = state.log[i];
    if (action.type === 'diagnosis') return action.diagnosis;
  }
  throw new Error('scoreSession called on a session with no diagnosis action in its log');
}

export function hintActions(state: SessionState): Extract<ActionEvent, { type: 'hint' }>[] {
  return state.log.filter((a): a is Extract<ActionEvent, { type: 'hint' }> => a.type === 'hint');
}

/** Sum of cost for hints actually taken (not refused). */
export function sumHintCost(state: SessionState): number {
  return hintActions(state)
    .filter((h) => !h.refused)
    .reduce((sum, h) => sum + h.cost, 0);
}

export function countNonRefusedHints(state: SessionState): number {
  return hintActions(state).filter((h) => !h.refused).length;
}
