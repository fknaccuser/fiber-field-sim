/**
 * Decision replay: classifies every logged action against the scenario's authored
 * reference solution, so item 6 can show the trainee where they diverged.
 */
import type { FaultInstance } from '../world';
import type { ActionEvent, Intent, SessionState, StrandRef } from '../session/types';
import type { Endpoint } from '../instruments/cli';
import { EVIDENCE_RULES, type EvidenceContext } from './evidenceRules';
import type { DecisionReplay, ReplayStep } from './types';

function endpointKey(endpoint: Endpoint): string {
  return endpoint.kind === 'device' ? `device:${endpoint.deviceId}` : `host:${endpoint.hostId}`;
}

function strandKey(strand?: StrandRef): string {
  return strand ? `${strand.tubeColor}/${strand.fiberColor}` : '';
}

function cliSignature(endpoint: Endpoint, handlerId: string | null | undefined, command: string): string {
  const key = endpointKey(endpoint);
  if (handlerId) return `cli|${key}|${handlerId}`;
  const tokens = command.trim().split(/\s+/).slice(0, 2).join(' ');
  return `cli|${key}|${tokens}`;
}

function intentSignature(intent: Intent): string {
  switch (intent.type) {
    case 'otdr-shot':
      return `otdr-shot|${intent.access.accessNodeId}|${intent.access.launchSpanId}|${intent.settings.wavelengthNm}|${strandKey(intent.access.strand)}`;
    case 'power-meter':
      return `power-meter|${intent.nodeId}|${strandKey(intent.strand)}`;
    case 'vfl':
      return `vfl|${intent.spanId}`;
    case 'scope':
      return `scope|${intent.eventId}`;
    case 'cli':
      return cliSignature(intent.endpoint, undefined, intent.command);
    case 'truck-roll':
      return `truck-roll|${intent.toNodeId}`;
    case 'records':
      return `records|${intent.nodeId ?? ''}|${intent.spanId ?? ''}`;
    case 'customer-contact':
      return `customer-contact|${intent.customerId}`;
    case 'hint':
      return 'hint';
    case 'excavate':
      return 'excavate';
    case 'diagnosis':
      return 'diagnosis';
  }
}

function actionSignature(action: ActionEvent): string {
  switch (action.type) {
    case 'otdr-shot':
      return `otdr-shot|${action.access.accessNodeId}|${action.access.launchSpanId}|${action.settings.wavelengthNm}|${strandKey(action.access.strand)}`;
    case 'power-meter':
      return `power-meter|${action.nodeId}|${strandKey(action.strand)}`;
    case 'vfl':
      return `vfl|${action.spanId}`;
    case 'scope':
      return `scope|${action.eventId}`;
    case 'cli':
      return cliSignature(action.endpoint, action.handlerId, action.command);
    case 'truck-roll':
      return `truck-roll|${action.toNodeId}`;
    case 'records':
      return `records|${action.nodeId ?? ''}|${action.spanId ?? ''}`;
    case 'customer-contact':
      return `customer-contact|${action.customerId}`;
    case 'hint':
      return 'hint';
    case 'excavate':
      return 'excavate';
    case 'diagnosis':
      return 'diagnosis';
    case 'refused':
      return 'refused';
  }
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
    case 'vfl':
      return `VFL on ${spanLabel(world, intent.spanId)} from ${nodeLabel(world, intent.fromNodeId)}`;
    case 'scope':
      return `Inspection scope on ${spanLabel(world, intent.spanId)}`;
    case 'cli':
      return `CLI (${endpointKey(intent.endpoint)}): ${intent.command}`;
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
  const referenceSignatures = referenceSteps.map(intentSignature);
  const matchedReferenceIndices = new Set<number>();
  const seenActionSignatures = new Set<string>();
  const steps: ReplayStep[] = [];
  let divergenceIndex: number | null = null;

  for (const action of state.log) {
    const sig = actionSignature(action);
    let classification: ReplayStep['classification'];

    if (hasViolation(action)) {
      classification = 'violation';
    } else if (action.type === 'refused') {
      classification = 'refused';
    } else {
      const refIndex = referenceSignatures.findIndex((refSig, idx) => refSig === sig && !matchedReferenceIndices.has(idx));
      if (refIndex !== -1) {
        matchedReferenceIndices.add(refIndex);
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
    const sig = referenceSignatures[idx];
    const match = state.log.find((a) => actionSignature(a) === sig);
    return { label: labelForIntent(state.initialWorld, intent), matchedActionId: match?.id ?? null };
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
    summary.push('Followed the reference solution\'s path exactly.');
  }

  summary.push(`Took ${state.clockSeconds}s vs a ${state.meta.referenceSolution.totalSeconds}s reference.`);
  if (violations > 0) summary.push(`${violations} safety violation(s) occurred during the session.`);

  return summary.slice(0, 5);
}
