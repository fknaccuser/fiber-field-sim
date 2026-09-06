/**
 * Diagnostic accuracy: did the trainee name the fault and its location correctly. This
 * also produces the matched claim/fault pairs that evidence.ts scores next -- accuracy
 * and evidence both need the same matching, computed once here.
 */
import type { FaultInstance, FaultTarget } from '../world';
import type { DiagnosisClaim, SessionState } from '../session/types';
import type { AxisScore } from './types';
import { clamp, countNonRefusedHints, lastDiagnosis, sumHintCost } from './util';

export interface FaultMatch {
  claim: DiagnosisClaim;
  fault: FaultInstance;
}

export interface AccuracyResult {
  score: AxisScore;
  matches: FaultMatch[];
  falsePositiveClaims: DiagnosisClaim[];
  missedFaults: FaultInstance[];
}

function targetsMatch(a: FaultTarget, b: FaultTarget): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'fiber-span' && b.type === 'fiber-span') return a.spanId === b.spanId;
  if (a.type === 'device-interface' && b.type === 'device-interface') return a.deviceId === b.deviceId && a.interfaceId === b.interfaceId;
  if (a.type === 'device-global' && b.type === 'device-global') return a.deviceId === b.deviceId;
  if (a.type === 'site' && b.type === 'site') return a.nodeId === b.nodeId;
  return false;
}

function claimMatchesFault(claim: DiagnosisClaim, fault: FaultInstance, toleranceMeters: number): boolean {
  if (claim.faultKind !== fault.kind) return false;
  if (!targetsMatch(claim.target, fault.target)) return false;
  if (fault.target.type === 'fiber-span') {
    const params = fault.params;
    if (typeof params.positionMeters === 'number') {
      if (claim.positionMeters === undefined) return false;
      if (Math.abs(claim.positionMeters - params.positionMeters) > toleranceMeters) return false;
    }
    if (typeof params.tubeColor === 'string') {
      if (!claim.strand) return false;
      if (claim.strand.tubeColor !== params.tubeColor || claim.strand.fiberColor !== params.fiberColor) return false;
    }
  }
  return true;
}

/** Greedy one-to-one matching of claims to true faults, in claim order. */
export function matchClaims(
  claims: DiagnosisClaim[],
  trueFaults: FaultInstance[],
  toleranceMeters: number,
): { matches: FaultMatch[]; falsePositiveClaims: DiagnosisClaim[]; missedFaults: FaultInstance[] } {
  const usedInstanceIds = new Set<string>();
  const matches: FaultMatch[] = [];
  const falsePositiveClaims: DiagnosisClaim[] = [];

  for (const claim of claims) {
    const fault = trueFaults.find((f) => !usedInstanceIds.has(f.instanceId) && claimMatchesFault(claim, f, toleranceMeters));
    if (fault) {
      usedInstanceIds.add(fault.instanceId);
      matches.push({ claim, fault });
    } else {
      falsePositiveClaims.push(claim);
    }
  }

  const missedFaults = trueFaults.filter((f) => !usedInstanceIds.has(f.instanceId));
  return { matches, falsePositiveClaims, missedFaults };
}

export function computeAccuracy(state: SessionState): AccuracyResult {
  const diagnosis = lastDiagnosis(state);
  const trueFaults = state.initialWorld.appliedFaults.filter((f) => !f.isRedHerring);
  const tolerance = state.meta.positionToleranceMeters;
  const { matches, falsePositiveClaims, missedFaults } = matchClaims(diagnosis.claims, trueFaults, tolerance);
  const details: string[] = [];
  let score: number;

  const allOutOfScope = trueFaults.length > 0 && trueFaults.every((f) => f.outOfScope);

  if (trueFaults.length === 0) {
    if ((diagnosis.noFaultInScope || diagnosis.escalate) && diagnosis.claims.length === 0) {
      score = 100;
      details.push('Correctly found nothing wrong in scope.');
    } else {
      score = Math.max(0, 100 - 50 * diagnosis.claims.length);
      details.push(`No real fault existed in this scenario, but ${diagnosis.claims.length} claim(s) were made.`);
    }
  } else if (allOutOfScope && diagnosis.claims.length === 0 && diagnosis.escalate) {
    score = 60;
    details.push('Correctly escalated with no specific diagnosis on an issue outside field-tech authority.');
  } else {
    const TP = matches.length;
    const FP = falsePositiveClaims.length;
    const FN = missedFaults.length;
    score = 100 * clamp((TP - 0.5 * FP) / (TP + FN), 0, 1);
    details.push(`${TP} correct, ${FP} false positive(s), ${FN} missed.`);

    for (const m of matches) {
      if (m.fault.outOfScope && !diagnosis.escalate) {
        score -= 20;
        details.push(`Correctly found ${m.fault.kind} but it is outside field-tech authority and was not escalated.`);
      }
    }
  }

  const hintCost = sumHintCost(state);
  if (hintCost > 0) {
    score -= hintCost;
    details.push(`-${hintCost} for ${countNonRefusedHints(state)} hint(s) used.`);
  }

  score = clamp(score, 0, 100);
  return {
    score: { axis: 'diagnosticAccuracy', score, details },
    matches,
    falsePositiveClaims,
    missedFaults,
  };
}
