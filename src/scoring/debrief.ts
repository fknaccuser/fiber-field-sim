import { FAULT_TAXONOMY_BY_ID, type FaultTarget } from '../world';
import type { DiagnosisClaim, SessionState } from '../session/types';
import { matchReferenceSteps } from '../session/stepMatching';
import { stepTitle } from '../session/teaching';
import { EVIDENCE_RULES } from './evidenceRules';
import type { AccuracyResult } from './accuracy';
import type { DebriefReport } from './types';
import { lastDiagnosis } from './util';

function location(state: SessionState, target: FaultTarget): string {
  switch (target.type) {
    case 'site': return state.initialWorld.topology.nodes.find((n) => n.id === target.nodeId)?.label ?? target.nodeId;
    case 'fiber-span': return target.spanId;
    case 'device-global': return state.initialWorld.devices.find((d) => d.id === target.deviceId)?.hostname ?? target.deviceId;
    case 'device-interface': return `${state.initialWorld.devices.find((d) => d.id === target.deviceId)?.hostname ?? target.deviceId} · ${target.interfaceId}`;
  }
}

function detail(params: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof params.positionMeters === 'number') parts.push(`${params.positionMeters.toFixed(1)} m along the span`);
  if (params.tubeColor && params.fiberColor) parts.push(`Strand ${params.tubeColor}/${params.fiberColor}`);
  if (params.actualTubeColor && params.actualFiberColor) parts.push(`Connected to ${params.actualTubeColor}/${params.actualFiberColor}`);
  if (params.ontId) parts.push(`ONT ${params.ontId}`);
  if (params.vlan) parts.push(`VLAN ${params.vlan}`);
  if (typeof params.rxPowerDbm === 'number') parts.push(`Receive level ${params.rxPowerDbm} dBm`);
  return parts.join(' · ');
}

function claimDetail(claim: DiagnosisClaim): string {
  return detail({ positionMeters: claim.positionMeters, ...claim.strand });
}

/** The only path that turns the scenario answer into learner-facing explanatory text. */
export function buildDebrief(state: SessionState, accuracy: AccuracyResult): DebriefReport {
  if (!state.ended) throw new Error('Debrief is only available after the session ends');
  const diagnosis = lastDiagnosis(state);
  const faults = state.initialWorld.appliedFaults.filter((f) => !f.isRedHerring);
  const matches = matchReferenceSteps(state.meta.referenceSolution.steps, state.log);
  const complete = accuracy.missedFaults.length === 0 && accuracy.falsePositiveClaims.length === 0
    && (!faults.some((f) => f.outOfScope) || !!diagnosis.escalate)
    && (faults.length > 0 || !!diagnosis.noFaultInScope || !!diagnosis.escalate);
  const escalationOnly = faults.length > 0 && faults.every((f) => f.outOfScope) && !!diagnosis.escalate && diagnosis.claims.length === 0;
  const verdict = complete ? 'correct' : escalationOnly ? 'escalated' : accuracy.matches.length ? 'partial' : 'incorrect';

  const evidence: DebriefReport['evidence'] = faults.map((fault) => {
    const sets = EVIDENCE_RULES[fault.kind] ?? [];
    const claim = accuracy.matches.find((m) => m.fault.instanceId === fault.instanceId)?.claim;
    const citedIds = claim?.evidenceActionIds ?? (fault.outOfScope ? diagnosis.escalate?.evidenceActionIds : undefined) ?? [];
    const cited = state.log.filter((a) => citedIds.includes(a.id));
    const context = (actions: SessionState['log']) => ({ world: state.initialWorld, profiles: state.profiles, actions, fault });
    const sufficient = (actions: SessionState['log']) => sets.some((set) => set.every((predicate) => predicate(context(actions))));
    const fullyCited = sufficient(cited);
    const observed = sufficient(state.log);
    const partlyCited = sets.some((set) => set.some((predicate) => predicate(context(cited))));
    const status = fullyCited ? 'cited' : observed ? 'uncited' : partlyCited ? 'partial' : 'missing';
    let support = [...(fullyCited ? cited : state.log)];
    if (fullyCited || observed) {
      // Reduce to a sufficient witness set: pairs of boundary measurements stay together.
      for (const action of [...support]) {
        const without = support.filter((a) => a.id !== action.id);
        if (sufficient(without)) support = without;
      }
    } else {
      support = support.filter((a) => sets.some((set) => set.some((predicate) => predicate(context([a])))));
    }
    return {
      faultId: fault.instanceId,
      label: FAULT_TAXONOMY_BY_ID[fault.kind]?.label ?? fault.kind,
      status,
      explanation: fullyCited ? 'Your cited observations satisfy the evidence rule.'
        : observed ? (claim ? 'Your diagnosis was right, but the citations did not prove it. The supporting observations were in your log.' : 'Your log contains supporting evidence, but you did not connect it to a correct claim.')
        : partlyCited ? 'Your citations provide part of the evidence. They do not establish the complete conclusion.'
        : 'The observations do not yet satisfy the evidence rule. A correct guess would still need proof.',
      supportingActionIds: support.map((a) => a.id),
      citedActionIds: citedIds,
    };
  });

  return {
    title: state.meta.title,
    verdict,
    verdictText: complete ? (faults.length ? 'You identified the problem.' : 'Your no-fault conclusion was correct.') : escalationOnly ? 'Escalation was appropriate. The specific cause still matters.' : accuracy.matches.length ? 'You found part of the problem.' : 'The evidence points to a different conclusion.',
    faults: faults.map((fault) => ({
      id: fault.instanceId,
      label: FAULT_TAXONOMY_BY_ID[fault.kind]?.label ?? fault.kind,
      description: FAULT_TAXONOMY_BY_ID[fault.kind]?.description ?? '',
      location: location(state, fault.target),
      detail: detail(fault.params),
      matched: accuracy.matches.some((m) => m.fault.instanceId === fault.instanceId),
      outOfScope: !!fault.outOfScope,
    })),
    claims: diagnosis.claims.map((claim) => ({ label: FAULT_TAXONOMY_BY_ID[claim.faultKind]?.label ?? claim.faultKind, location: location(state, claim.target), detail: claimDetail(claim), correct: accuracy.matches.some((m) => m.claim === claim) })),
    noFaultClaim: !!diagnosis.noFaultInScope,
    escalation: diagnosis.escalate?.reason ?? null,
    walkthrough: state.meta.referenceSolution.steps.map((step, index) => ({ index, title: stepTitle(step, state.initialWorld), why: state.meta.referenceSolution.rationales[index] ?? 'Review the observations supporting this step.', seconds: state.meta.referenceSolution.stepSeconds?.[index] ?? 0, matchedActionId: matches[index] })),
    evidence,
    practice: evidence.some((entry) => entry.status !== 'cited') ? 'Practise connecting each claim to the observations that establish it. Collecting evidence and citing evidence are separate skills.'
      : !complete ? 'Practise narrowing the location and checking your full diagnosis against every observation.'
      : state.meta.tier < 6 ? 'Repeat a different seed at a higher tier when ready. Use the same questions with less guidance.' : 'Repeat a different seed at this tier to practise applying the same questions to a new situation.',
  };
}
