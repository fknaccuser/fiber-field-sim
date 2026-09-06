/**
 * Evidence quality: not just "did you name the fault" but "did you prove it, and did you
 * cite the proof." Reuses the claim/fault matches accuracy.ts already computed.
 */
import type { FaultInstance } from '../world';
import type { SessionState } from '../session/types';
import type { AxisScore } from './types';
import type { AccuracyResult } from './accuracy';
import { EVIDENCE_RULES, type EvidenceContext, type EvidenceSet } from './evidenceRules';
import { average, lastDiagnosis } from './util';

const OPTICAL_ACTION_TYPES = new Set(['otdr-shot', 'power-meter', 'vfl', 'scope']);

function setSatisfied(set: EvidenceSet, ctx: EvidenceContext): boolean {
  return set.every((pred) => pred(ctx));
}

function anyPredicateSatisfied(sets: EvidenceSet[], ctx: EvidenceContext): boolean {
  return sets.some((set) => set.some((pred) => pred(ctx)));
}

/** 1.0 cited-only / 0.6 anywhere in the log / 0.3 partially cited / 0 otherwise. */
function scoreFaultEvidence(state: SessionState, fault: FaultInstance, citedActionIds: string[]): number {
  const sets = EVIDENCE_RULES[fault.kind];
  if (!sets || sets.length === 0) return 0;

  const citedActions = state.log.filter((a) => citedActionIds.includes(a.id));
  const citedCtx: EvidenceContext = { world: state.initialWorld, profiles: state.profiles, actions: citedActions, fault };
  const fullCtx: EvidenceContext = { world: state.initialWorld, profiles: state.profiles, actions: state.log, fault };

  if (sets.some((set) => setSatisfied(set, citedCtx))) return 1.0;
  if (sets.some((set) => setSatisfied(set, fullCtx))) return 0.6;
  if (anyPredicateSatisfied(sets, citedCtx)) return 0.3;
  return 0;
}

export function computeEvidence(state: SessionState, accuracy: AccuracyResult): AxisScore {
  const diagnosis = lastDiagnosis(state);
  const trueFaults = state.initialWorld.appliedFaults.filter((f) => !f.isRedHerring);
  const details: string[] = [];

  if (trueFaults.length === 0) {
    if ((diagnosis.noFaultInScope || diagnosis.escalate) && diagnosis.claims.length === 0) {
      const hasOptical = state.log.some((a) => OPTICAL_ACTION_TYPES.has(a.type));
      const hasLogical = state.log.some((a) => a.type === 'cli');
      const score = hasOptical && hasLogical ? 100 : 50;
      details.push(
        hasOptical && hasLogical
          ? 'Confirmed nothing wrong with both an optical and a logical check.'
          : 'Confirmed nothing wrong, but only checked one domain (optical or logical).',
      );
      return { axis: 'evidenceQuality', score, details };
    }
    details.push('No real fault existed and the diagnosis was not a clean "nothing in scope" call.');
    return { axis: 'evidenceQuality', score: 0, details };
  }

  const allOutOfScope = trueFaults.every((f) => f.outOfScope);
  if (allOutOfScope && diagnosis.claims.length === 0 && diagnosis.escalate) {
    const citedIds = diagnosis.escalate.evidenceActionIds;
    const scores = trueFaults.map((f) => scoreFaultEvidence(state, f, citedIds));
    const score = 100 * average(scores);
    details.push(`Escalation evidence checked against ${trueFaults.length} out-of-scope fault(s).`);
    return { axis: 'evidenceQuality', score, details };
  }

  if (accuracy.matches.length === 0) {
    details.push('No correct diagnosis to evaluate evidence against.');
    return { axis: 'evidenceQuality', score: 0, details };
  }

  const perClaimScores = accuracy.matches.map((m) => {
    const tier = scoreFaultEvidence(state, m.fault, m.claim.evidenceActionIds);
    details.push(`${m.fault.kind}: evidence tier ${tier}.`);
    return tier;
  });
  const score = 100 * average(perClaimScores);
  return { axis: 'evidenceQuality', score, details };
}
