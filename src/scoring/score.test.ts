import { describe, expect, it } from 'vitest';
import type { FaultInstance } from '../world';
import { scoreSession } from './score';
import { action, emptyWorld, makeSession } from './testFixtures';

describe('scoreSession', () => {
  it('is deterministic -- scoring the same state twice produces an identical report', () => {
    const fault: FaultInstance = { instanceId: 'f1', kind: 'fusion-splice-degraded', target: { type: 'fiber-span', spanId: 's1' }, params: { positionMeters: 100 } };
    const claim = { faultKind: 'fusion-splice-degraded', target: { type: 'fiber-span' as const, spanId: 's1' }, positionMeters: 100, evidenceActionIds: [] };
    const diagnosis = action('d0', 0, { type: 'diagnosis', diagnosis: { claims: [claim] }, durationSeconds: 0 });

    const world = emptyWorld();
    world.appliedFaults = [fault];
    const state = makeSession({ world, log: [diagnosis], clockSeconds: 300 });

    expect(scoreSession(state)).toEqual(scoreSession(state));
  });
});
