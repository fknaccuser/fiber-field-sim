import type { ActionEvent, Intent } from './types';

export type ObservedAction = ActionEvent extends infer A ? A extends { groundTruth: unknown } ? Omit<A, 'groundTruth'> : A : never;
const commandKey = (command: string) => command.trim().toLowerCase().replace(/\s+/g, ' ');

/** Match the action's request, never its result or the scenario's answer. */
export function stepKey(step: Intent | ObservedAction): string {
  switch (step.type) {
    case 'cli': return JSON.stringify(['cli', step.endpoint.kind, step.endpoint.kind === 'device' ? step.endpoint.deviceId : step.endpoint.hostId, commandKey(step.command)]);
    case 'otdr-shot': return JSON.stringify(['otdr-shot', step.access.accessNodeId, step.access.launchSpanId, step.access.strand?.tubeColor, step.access.strand?.fiberColor, step.settings.wavelengthNm]);
    case 'power-meter': return JSON.stringify(['power-meter', step.nodeId, step.wavelengthNm, step.strand?.tubeColor, step.strand?.fiberColor]);
    case 'scope': return JSON.stringify(['scope', step.spanId, step.eventId]);
    case 'vfl': return JSON.stringify(['vfl', step.spanId, step.fromNodeId]);
    case 'truck-roll': return JSON.stringify(['truck-roll', step.toNodeId]);
    case 'records': return JSON.stringify(['records', step.nodeId, step.spanId]);
    case 'noc-contact': return JSON.stringify(['noc-contact']);
    case 'excavate': return JSON.stringify(['excavate', step.nodeId, step.method, step.distanceFromMarksInches]);
    default: return step.type;
  }
}

export function completedAction(action: ObservedAction): boolean {
  return action.type !== 'refused'
    && !(action.type === 'cli' && !action.recognized)
    && !(action.type === 'hint' && action.refused)
    && !(action.type === 'otdr-shot' && action.violations.length > 0)
    && !(action.type === 'excavate' && action.strike);
}

/** One observation can complete at most one reference step. Working out of order is allowed. */
export function matchReferenceSteps(steps: Intent[], log: ObservedAction[]): Array<string | null> {
  const used = new Set<string>();
  return steps.map((step) => {
    const key = stepKey(step);
    const action = log.find((entry) => !used.has(entry.id) && completedAction(entry) && stepKey(entry) === key);
    if (!action) return null;
    used.add(action.id);
    return action.id;
  });
}
