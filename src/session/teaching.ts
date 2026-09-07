import type { WorldState } from '../world';
import type { Intent, ScenarioMeta } from './types';
import { matchReferenceSteps, type ObservedAction } from './stepMatching';

export interface TeachingStep {
  index: number;
  title: string;
  question: string;
  targetNodeId?: string;
  completedActionId: string | null;
}

type TeachingWorld = Pick<WorldState, 'topology' | 'devices' | 'hosts' | 'customerReports'>;

export function stepTarget(step: Intent, world: TeachingWorld): string | undefined {
  switch (step.type) {
    case 'truck-roll': return step.toNodeId;
    case 'otdr-shot': return step.access.accessNodeId;
    case 'power-meter': case 'excavate': return step.nodeId;
    case 'scope': return world.topology.spans.find((s) => s.id === step.spanId)?.toNodeId;
    case 'vfl': return step.fromNodeId;
    case 'records': return step.nodeId ?? world.topology.spans.find((s) => s.id === step.spanId)?.toNodeId;
    case 'customer-contact': return world.customerReports.find((r) => r.customerId === step.customerId)?.premiseNodeId;
    case 'cli': {
      const endpoint = step.endpoint;
      return endpoint.kind === 'device' ? world.devices.find((d) => d.id === endpoint.deviceId)?.topologyNodeId : world.hosts.find((h) => h.id === endpoint.hostId)?.premiseNodeId;
    }
    default: return undefined;
  }
}

const METHOD: Record<Intent['type'], string> = {
  'customer-contact': 'Establish the scope of the reported problem.',
  'truck-roll': 'Move to the next accessible test boundary.',
  'power-meter': 'Establish whether usable light reaches the test boundary.',
  'otdr-shot': 'Locate loss and reflection events along the path.',
  'clean-probe': 'Clean the probe tip so the scope shows the connector, not the tip.',
  scope: 'Check the condition of the connector face.',
  vfl: 'Check continuity along the selected fiber.',
  cli: 'Compare network and service state with your observations.',
  comms: 'Answer the message.',
  records: 'Establish the documented path and work history.',
  hint: 'Ask for help choosing the next check.',
  excavate: 'Verify the work area before exposing the cable.',
  diagnosis: 'Submit your conclusion with the observations that support it.',
};

export function stepTitle(step: Intent, world: TeachingWorld): string {
  const target = stepTarget(step, world);
  const node = world.topology.nodes.find((n) => n.id === target)?.label ?? target ?? '';
  switch (step.type) {
    case 'cli': return `Run “${step.command}” on ${step.endpoint.kind === 'device' ? step.endpoint.deviceId : step.endpoint.hostId}.`;
    case 'power-meter': return `Measure optical power at ${node} (${step.wavelengthNm} nm)${step.strand ? `, ${step.strand.tubeColor}/${step.strand.fiberColor}` : ''}.`;
    case 'otdr-shot': return `Run an OTDR trace from ${node} into ${step.access.launchSpanId} (${step.settings.wavelengthNm} nm).`;
    case 'scope': return `Inspect the connector on ${step.spanId} at ${node}.`;
    case 'vfl': return `Trace ${step.spanId} with the VFL from ${node}.`;
    case 'truck-roll': return `Roll to ${node}.`;
    case 'records': return `Read the plant records${node ? ` for ${node}` : ''}.`;
    case 'customer-contact': return `Call ${step.customerId}${node ? ` at ${node}` : ''}.`;
    default: return METHOD[step.type];
  }
}

/** Project the method at the trusted boundary. Never expose reference intents or claims. */
export function buildTeachingSteps(meta: ScenarioMeta, world: TeachingWorld, log: ObservedAction[]): TeachingStep[] {
  if (meta.tier > 2) return [];
  const matches = matchReferenceSteps(meta.referenceSolution.steps, log);
  return meta.referenceSolution.steps.map((step, index) => ({
    index,
    title: meta.tier === 1 ? stepTitle(step, world) : METHOD[step.type],
    question: meta.referenceSolution.rationales[index],
    targetNodeId: meta.tier === 1 ? stepTarget(step, world) : undefined,
    completedActionId: matches[index],
  }));
}

export function dispatchAdvice(meta: ScenarioMeta, world: TeachingWorld, log: ObservedAction[], level: number): string | null {
  if (meta.tier <= 2) {
    const next = buildTeachingSteps(meta, world, log).find((step) => !step.completedActionId);
    return next ? `${next.title} ${next.question}` : 'Your reference checks are complete. Review the evidence supporting your conclusion.';
  }
  if (meta.tier === 3) {
    const observations = log.flatMap((action) => {
      if (action.type === 'power-meter') return [`You measured ${action.dbm === null ? 'no light' : `${action.dbm.toFixed(2)} dBm`} at ${action.nodeId}.`];
      if (action.type === 'scope') return [`Your inspection of ${action.spanId} graded ${action.grade}.`];
      if (action.type === 'cli' && action.recognized) return [`You ran “${action.command}”; its output is in your terminal history.`];
      if (action.type === 'otdr-shot') return [`You recorded ${action.events.length} trace events from ${action.access.accessNodeId}.`];
      return [];
    });
    return observations.slice(-2).join(' ') || 'You have not recorded an instrument observation yet.';
  }
  return meta.hints[level] ?? null;
}
