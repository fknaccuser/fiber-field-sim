/**
 * Decision replay: classifies every logged action against the scenario's authored
 * reference solution, so item 6 can show the trainee where they diverged.
 */
import type { FaultInstance } from '../world';
import type { ActionEvent, Intent, SessionState } from '../session/types';
import type { Endpoint } from '../instruments/cli';
import { EVIDENCE_RULES, type EvidenceContext } from './evidenceRules';
import { matchReferenceSteps, stepKey } from '../session/stepMatching';
import type { DecisionReplay, ReplayStep } from './types';

function endpointKey(endpoint: Endpoint): string {
  return endpoint.kind === 'device' ? `device:${endpoint.deviceId}` : `host:${endpoint.hostId}`;
}

function hasViolation(action: ActionEvent): boolean {
  return (action.type === 'otdr-shot' && action.violations.length > 0) || (action.type === 'excavate' && action.strike);
}

/** Fault kinds this single action, on its own, supplies at least one evidence predicate for. */
function revealedFaultKinds(state: SessionState, action: ActionEvent, trueFaults: FaultInstance[]): string[] {
  return trueFaults
    .filter((fault) => {
      const sets = EVIDENCE_RULES[fault.kind];
      if (!sets) return false;
      const ctx: EvidenceContext = { world: state.initialWorld, profiles: state.profiles, actions: [action], fault };
      return sets.some((set) => set.some((pred) => pred(ctx)));
    })
    .map((fault) => fault.kind);
}

/** Labels are cosmetic (item 6 replay UI, never scored) -- fall back to the raw id rather than throwing when a hand-built test fixture or a stale reference step omits topology data. */
function nodeLabel(world: SessionState['initialWorld'], nodeId: string): string {
  return world.topology.nodes.find((n) => n.id === nodeId)?.label ?? nodeId;
}

function spanLabel(world: SessionState['initialWorld'], spanId: string): string {
  return world.topology.spans.find((s) => s.id === spanId)?.id ?? spanId;
}

function labelForIntent(world: SessionState['initialWorld'], intent: Intent): string {
  switch (intent.type) {
    case 'otdr-shot':
      return `OTDR from ${nodeLabel(world, intent.access.accessNodeId)} into ${spanLabel(world, intent.access.launchSpanId)} @${intent.settings.wavelengthNm}nm, ${intent.settings.pulseWidthNs}ns, ${intent.settings.averagingSeconds}s`;
    case 'power-meter':
      return `Power meter at ${nodeLabel(world, intent.nodeId)} @${intent.wavelengthNm}nm`;
    case 'clean-probe':
      return 'Clean the inspection probe tip';
    case 'vfl':
      return `VFL on ${spanLabel(world, intent.spanId)} from ${nodeLabel(world, intent.fromNodeId)}`;
    case 'scope':
      return `Inspection scope on ${spanLabel(world, intent.spanId)}`;
    case 'cli':
      return `CLI (${endpointKey(intent.endpoint)}): ${intent.command}`;
    case 'comms':
      return `Answered ${intent.eventId}`;
    case 'truck-roll':
      return `Truck roll to ${nodeLabel(world, intent.toNodeId)}`;
    case 'records':
      return `Records lookup${intent.nodeId ? ` at ${nodeLabel(world, intent.nodeId)}` : ''}${intent.spanId ? ` for ${spanLabel(world, intent.spanId)}` : ''}`;
    case 'customer-contact':
      return `Customer contact: ${intent.customerId}`;
    case 'hint':
      return 'Hint requested';
    case 'excavate':
      return `Excavate at ${nodeLabel(world, intent.nodeId)} (${intent.method})`;
    case 'diagnosis':
      return 'Diagnosis submitted';
  }
}

function labelForAction(world: SessionState['initialWorld'], action: ActionEvent): string {
  if (action.type === 'refused') return `Refused: ${action.reason}`;
  return labelForIntent(world, action as Intent);
}

export function computeReplay(state: SessionState, trueFaults: FaultInstance[]): DecisionReplay {
  const referenceSteps = state.meta.referenceSolution.steps;
  const matches = matchReferenceSteps(referenceSteps, state.log);
  
  const seenActionSignatures = new Set<string>();
  const steps: ReplayStep[] = [];
  let divergenceIndex: number | null = null;

  for (const action of state.log) {
    const sig = stepKey(action);
    let classification: ReplayStep['classification'];

    if (hasViolation(action)) {
      classification = 'violation';
    } else if (action.type === 'refused') {
      classification = 'refused';
    } else {
      const refIndex = matches.indexOf(action.id);
      if (refIndex !== -1) {

        classification = 'on-path';
      } else if (seenActionSignatures.has(sig)) {
        classification = 'redundant';
      } else if (revealedFaultKinds(state, action, trueFaults).length > 0) {
        classification = 'useful';
      } else {
        classification = 'unnecessary';
      }
    }

    seenActionSignatures.add(sig);
    if (divergenceIndex === null && classification !== 'on-path') divergenceIndex = action.index;

    steps.push({
      actionId: action.id,
      index: action.index,
      atSimSeconds: action.atSimSeconds,
      durationSeconds: action.durationSeconds,
      label: labelForAction(state.initialWorld, action),
      revealed: revealedFaultKinds(state, action, trueFaults),
      classification,
    });
  }

  const referencePath = referenceSteps.map((intent, idx) => {
    return { label: labelForIntent(state.initialWorld, intent), matchedActionId: matches[idx] };
  });

  const summary = buildSummary(state, steps, divergenceIndex, referencePath);

  return { steps, referencePath, divergenceIndex, summary };
}

function buildSummary(
  state: SessionState,
  steps: ReplayStep[],
  divergenceIndex: number | null,
  referencePath: DecisionReplay['referencePath'],
): string[] {
  const summary: string[] = [];
  const violations = steps.filter((s) => s.classification === 'violation').length;
  const usefulCount = steps.filter((s) => s.classification === 'useful' || s.classification === 'on-path').length;
  summary.push(`${usefulCount} of ${steps.length} action(s) contributed evidence toward the diagnosis.`);

  if (divergenceIndex !== null) {
    const step = steps.find((s) => s.index === divergenceIndex);
    const referenceNext = referencePath.find((r) => r.matchedActionId === null);
    summary.push(
      `First diverged at step ${divergenceIndex + 1} (${step?.label ?? 'unknown'})${referenceNext ? `; the reference solution instead did: ${referenceNext.label}.` : '.'}`,
    );
  } else {
    summary.push('Completed the reference checks; their order may differ.');
  }

  summary.push(`Took ${state.clockSeconds}s vs a ${state.meta.referenceSolution.totalSeconds}s reference.`);
  if (violations > 0) summary.push(`${violations} safety violation(s) occurred during the session.`);

  return summary.slice(0, 5);
}
