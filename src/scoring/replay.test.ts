import { describe, expect, it } from 'vitest';
import type { Intent } from '../session/types';
import { computeReplay } from './replay';
import { action, baseMeta, emptyWorld, makeSession } from './testFixtures';

function otdrSettings(wavelengthNm: number) {
  return { wavelengthNm, pulseWidthNs: 100, rangeMeters: 2000, iorSetting: 1.4682, averagingSeconds: 15, launchCableMeters: 0, receiveCableMeters: 0 };
}

const otdrIntent: Extract<Intent, { type: 'otdr-shot' }> = { type: 'otdr-shot', access: { accessNodeId: 'n2', launchSpanId: 's1' }, settings: otdrSettings(1550) };
const referenceSteps: Intent[] = [{ type: 'truck-roll', toNodeId: 'n2' }, otdrIntent];

function truckRollAction(id: string, index: number) {
  return action(id, index, { type: 'truck-roll' as const, fromNodeId: 'n1', toNodeId: 'n2', durationSeconds: 300 });
}

function otdrAction(id: string, index: number) {
  return action(id, index, {
    type: 'otdr-shot' as const,
    access: otdrIntent.access,
    settings: otdrIntent.settings,
    events: [],
    violations: [],
    groundTruth: [],
    pathSpanIds: ['s1'],
    traceRef: `trace:${index}`,
    durationSeconds: 35,
  });
}

function showVlanAction(id: string, index: number) {
  return action(id, index, {
    type: 'cli' as const,
    endpoint: { kind: 'device' as const, deviceId: 'sw-1' },
    command: 'show vlan brief',
    recognized: true,
    handlerId: 'show-vlan-brief',
    facts: [],
    outputRef: `out:${index}`,
    durationSeconds: 23,
  });
}

describe('21. decision replay', () => {
  it('following the reference exactly marks every step on-path with no divergence', () => {
    const meta = baseMeta({ referenceSolution: { rationales: ["Reach the test boundary.", "Measure the optical path."], steps: referenceSteps, totalSeconds: 335, affectedCustomerMinutes: 0 } });
    const state = makeSession({ world: emptyWorld(), meta, log: [truckRollAction('a0', 0), otdrAction('a1', 1)] });
    const replay = computeReplay(state, []);
    expect(replay.steps.map((s) => s.classification)).toEqual(['on-path', 'on-path']);
    expect(replay.divergenceIndex).toBeNull();
  });

  it('an unrelated command inserted at step 2 is unnecessary and sets divergenceIndex to 1', () => {
    const meta = baseMeta({ referenceSolution: { rationales: ["Reach the test boundary.", "Measure the optical path."], steps: referenceSteps, totalSeconds: 335, affectedCustomerMinutes: 0 } });
    const state = makeSession({ world: emptyWorld(), meta, log: [truckRollAction('a0', 0), showVlanAction('a1', 1), otdrAction('a2', 2)] });
    const replay = computeReplay(state, []);
    expect(replay.steps[1].classification).toBe('unnecessary');
    expect(replay.divergenceIndex).toBe(1);
  });

  it('repeating an OTDR shot with identical settings is redundant', () => {
    const meta = baseMeta({ referenceSolution: { rationales: ["Reach the test boundary.", "Measure the optical path."], steps: referenceSteps, totalSeconds: 335, affectedCustomerMinutes: 0 } });
    const state = makeSession({ world: emptyWorld(), meta, log: [truckRollAction('a0', 0), otdrAction('a1', 1), otdrAction('a2', 2)] });
    const replay = computeReplay(state, []);
    expect(replay.steps.map((s) => s.classification)).toEqual(['on-path', 'on-path', 'redundant']);
  });
});
