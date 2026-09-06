import { describe, expect, it } from 'vitest';
import type { FaultInstance } from '../world';
import type { Diagnosis } from '../session/types';
import { computeAccuracy } from './accuracy';
import { action, emptyWorld, makeSession } from './testFixtures';

function fault(overrides: Partial<FaultInstance>): FaultInstance {
  return { instanceId: 'f1', kind: 'fusion-splice-degraded', target: { type: 'fiber-span', spanId: 's1' }, params: { positionMeters: 100 }, ...overrides };
}

function diagnosisSession(faults: FaultInstance[], diagnosis: Diagnosis, extraLog: ReturnType<typeof action>[] = []) {
  const world = emptyWorld();
  world.appliedFaults = faults;
  const log = [...extraLog, action('a-diag', extraLog.length, { type: 'diagnosis', diagnosis, durationSeconds: 0 })];
  return makeSession({ world, log });
}

describe('7. position tolerance', () => {
  it('correct kind, span, and position within tolerance scores 100', () => {
    const state = diagnosisSession(
      [fault({})],
      { claims: [{ faultKind: 'fusion-splice-degraded', target: { type: 'fiber-span', spanId: 's1' }, positionMeters: 105, evidenceActionIds: [] }] },
    );
    expect(computeAccuracy(state).score.score).toBe(100);
  });

  it('position off by tolerance+1 scores 0 (one false positive, one missed)', () => {
    const state = diagnosisSession(
      [fault({})],
      { claims: [{ faultKind: 'fusion-splice-degraded', target: { type: 'fiber-span', spanId: 's1' }, positionMeters: 111, evidenceActionIds: [] }] },
    );
    const result = computeAccuracy(state);
    expect(result.score.score).toBe(0);
    expect(result.matches).toHaveLength(0);
    expect(result.falsePositiveClaims).toHaveLength(1);
    expect(result.missedFaults).toHaveLength(1);
  });
});

describe('8. partial credit', () => {
  it('two true faults, one correct claim scores 50', () => {
    const state = diagnosisSession(
      [fault({ instanceId: 'f1' }), fault({ instanceId: 'f2', target: { type: 'fiber-span', spanId: 's2' }, params: { positionMeters: 200 } })],
      { claims: [{ faultKind: 'fusion-splice-degraded', target: { type: 'fiber-span', spanId: 's1' }, positionMeters: 100, evidenceActionIds: [] }] },
    );
    expect(computeAccuracy(state).score.score).toBe(50);
  });

  it('one correct plus one wrong claim on a single-fault world scores 50', () => {
    const state = diagnosisSession(
      [fault({})],
      {
        claims: [
          { faultKind: 'fusion-splice-degraded', target: { type: 'fiber-span', spanId: 's1' }, positionMeters: 100, evidenceActionIds: [] },
          { faultKind: 'macrobend', target: { type: 'fiber-span', spanId: 's9' }, evidenceActionIds: [] },
        ],
      },
    );
    expect(computeAccuracy(state).score.score).toBe(50);
  });
});

describe('9. red herrings and out-of-scope escalation', () => {
  it('claiming a red herring alongside the true fault scores 50', () => {
    const state = diagnosisSession(
      [fault({}), fault({ instanceId: 'herring', target: { type: 'fiber-span', spanId: 's-herring' }, isRedHerring: true, kind: 'connector-dirty' })],
      {
        claims: [
          { faultKind: 'fusion-splice-degraded', target: { type: 'fiber-span', spanId: 's1' }, positionMeters: 100, evidenceActionIds: [] },
          { faultKind: 'connector-dirty', target: { type: 'fiber-span', spanId: 's-herring' }, evidenceActionIds: [] },
        ],
      },
    );
    expect(computeAccuracy(state).score.score).toBe(50);
  });

  it('out-of-scope: correct claim + escalate = 100, correct claim without escalate = 80, escalate with no claim = 60', () => {
    const oosFault = fault({ kind: 'default-route-missing-or-wrong', target: { type: 'device-global', deviceId: 'dev-1' }, params: {}, outOfScope: true });
    const claim = { faultKind: 'default-route-missing-or-wrong', target: { type: 'device-global' as const, deviceId: 'dev-1' }, evidenceActionIds: [] };

    const withEscalate = diagnosisSession([oosFault], { claims: [claim], escalate: { reason: 'NOC issue', evidenceActionIds: [] } });
    expect(computeAccuracy(withEscalate).score.score).toBe(100);

    const withoutEscalate = diagnosisSession([oosFault], { claims: [claim] });
    expect(computeAccuracy(withoutEscalate).score.score).toBe(80);

    const escalateNoClaim = diagnosisSession([oosFault], { claims: [], escalate: { reason: 'NOC issue', evidenceActionIds: [] } });
    expect(computeAccuracy(escalateNoClaim).score.score).toBe(60);
  });
});

describe('10. empty true-fault world', () => {
  it('noFaultInScope with no claims scores 100', () => {
    const state = diagnosisSession([], { claims: [], noFaultInScope: true });
    expect(computeAccuracy(state).score.score).toBe(100);
  });

  it('one claim on a world with no real fault scores 50', () => {
    const state = diagnosisSession([], { claims: [{ faultKind: 'macrobend', target: { type: 'fiber-span', spanId: 's1' }, evidenceActionIds: [] }] });
    expect(computeAccuracy(state).score.score).toBe(50);
  });
});

describe('11. hints subtract their cost', () => {
  it('two tier-3 hints subtract 20 from the base score', () => {
    const hints = [
      action('a0', 0, { type: 'hint', level: 0, cost: 10, text: 'h0', refused: false, durationSeconds: 0 }),
      action('a1', 1, { type: 'hint', level: 1, cost: 10, text: 'h1', refused: false, durationSeconds: 0 }),
    ];
    const state = diagnosisSession([], { claims: [], noFaultInScope: true }, hints);
    expect(computeAccuracy(state).score.score).toBe(80);
  });
});
