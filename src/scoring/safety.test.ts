import { describe, expect, it } from 'vitest';
import type { FaultInstance } from '../world';
import { computeSafety } from './safety';
import { scoreSession } from './score';
import { action, emptyWorld, makeSession } from './testFixtures';

function otdrSettings(wavelengthNm: number) {
  return { wavelengthNm, pulseWidthNs: 100, rangeMeters: 2000, iorSetting: 1.4682, averagingSeconds: 15, launchCableMeters: 0, receiveCableMeters: 0 };
}

describe('19. a safety strike dominates the total even with a perfect diagnosis', () => {
  it('safetyCompliance is 0, total is 0, endedBy is safety-strike, and accuracy is still reported', () => {
    const fault: FaultInstance = { instanceId: 'f1', kind: 'fusion-splice-degraded', target: { type: 'fiber-span', spanId: 's1' }, params: { positionMeters: 100 } };
    const claim = { faultKind: 'fusion-splice-degraded', target: { type: 'fiber-span' as const, spanId: 's1' }, positionMeters: 100, evidenceActionIds: [] };
    const excavate = action('e0', 0, { type: 'excavate', nodeId: 'dig-1', method: 'machine' as const, distanceFromMarksInches: 10, strike: true, durationSeconds: 1800 });
    const diagnosis = action('d0', 1, { type: 'diagnosis', diagnosis: { claims: [claim] }, durationSeconds: 0 });

    const world = emptyWorld();
    world.appliedFaults = [fault];
    const state = makeSession({ world, log: [excavate, diagnosis], endedBy: 'safety-strike', clockSeconds: 1800 });

    const report = scoreSession(state);
    expect(report.axes.safetyCompliance.score).toBe(0);
    expect(report.total).toBe(0);
    expect(report.endedBy).toBe('safety-strike');
    expect(report.axes.diagnosticAccuracy.score).toBe(100);
  });
});

describe('20. in-band live-PON test violations', () => {
  it('two violations subtract 25 each, scoring 50', () => {
    const shot = (id: string, index: number) =>
      action(id, index, {
        type: 'otdr-shot',
        access: { accessNodeId: 'n1', launchSpanId: 's1' },
        settings: otdrSettings(1550),
        events: [],
        violations: [{ kind: 'in-band-test-on-live-pon', wavelengthNm: 1550, liveSpanIds: ['s1'] }],
        groundTruth: [],
        pathSpanIds: ['s1'],
        traceRef: `trace:${index}`,
        durationSeconds: 35,
      });
    const diagnosis = action('d0', 2, { type: 'diagnosis', diagnosis: { claims: [], noFaultInScope: true }, durationSeconds: 0 });

    const state = makeSession({ world: emptyWorld(), log: [shot('s0', 0), shot('s1shot', 1), diagnosis] });
    const result = computeSafety(state);
    expect(result.score).toBe(50);
  });
});
