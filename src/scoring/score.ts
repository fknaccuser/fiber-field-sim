/** Orchestrates the five scoring axes plus the decision replay into one report. Pure, deterministic. */
import type { SessionState } from '../session/types';
import type { ScoreReport } from './types';
import { computeAccuracy } from './accuracy';
import { computeEvidence } from './evidence';
import { computeEfficiency } from './efficiency';
import { computeServiceImpact } from './serviceImpact';
import { computeSafety } from './safety';
import { computeReplay } from './replay';
import { average } from './util';
import { buildDebrief } from './debrief';

export function scoreSession(state: SessionState): ScoreReport {
  if (!state.ended) throw new Error('scoreSession called on a session that has not ended');

  const accuracy = computeAccuracy(state);
  const evidence = computeEvidence(state, accuracy);
  const efficiency = computeEfficiency(state);
  const serviceImpact = computeServiceImpact(state);
  const safety = computeSafety(state);

  const trueFaults = state.initialWorld.appliedFaults.filter((f) => !f.isRedHerring);
  const replay = computeReplay(state, trueFaults);

  const axes: ScoreReport['axes'] = {
    diagnosticAccuracy: accuracy.score,
    evidenceQuality: evidence,
    efficiency: efficiency.score,
    serviceImpact,
    safetyCompliance: safety,
  };

  const total = safety.score === 0 ? 0 : average(Object.values(axes).map((a) => a.score));

  return {
    debrief: buildDebrief(state, accuracy),
    axes,
    total,
    endedBy: state.ended.by,
    overBudget: efficiency.overBudget,
    beatReference: efficiency.beatReference,
    matchedFaultIds: accuracy.matches.map((m) => m.fault.instanceId),
    falsePositiveClaims: accuracy.falsePositiveClaims.length,
    missedFaultIds: accuracy.missedFaults.map((f) => f.instanceId),
    replay,
  };
}
