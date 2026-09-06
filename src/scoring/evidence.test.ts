import { describe, expect, it } from 'vitest';
import { FAULT_TAXONOMY } from '../world';
import type { FaultInstance } from '../world';
import type { ActionEvent, Diagnosis } from '../session/types';
import { computeAccuracy } from './accuracy';
import { computeEvidence } from './evidence';
import { EVIDENCE_RULES } from './evidenceRules';
import { action, emptyWorld, makeSession } from './testFixtures';

function otdrSettings(wavelengthNm: number) {
  return { wavelengthNm, pulseWidthNs: 100, rangeMeters: 2000, iorSetting: 1.4682, averagingSeconds: 15, launchCableMeters: 0, receiveCableMeters: 0 };
}

function macrobendShot(id: string, index: number, wavelengthNm: number): ActionEvent {
  return action(id, index, {
    type: 'otdr-shot',
    access: { accessNodeId: 'n1', launchSpanId: 's1' },
    settings: otdrSettings(wavelengthNm),
    events: [],
    violations: [],
    groundTruth: [{ eventId: 'f1', spanId: 's1', kind: 'macrobend', trueDistanceMeters: 100, displayDistanceMeters: 100, trueLossDb: 1.5, reflectanceDb: null, resolved: true, branchPath: [] }],
    pathSpanIds: ['s1'],
    traceRef: `trace:${index}`,
    durationSeconds: 35,
  });
}

function evidenceFor(fault: FaultInstance, diagnosis: Diagnosis, log: ActionEvent[]) {
  const world = emptyWorld();
  world.topology.spans.push({ id: 's1', fromNodeId: 'n0', toNodeId: 'closure-1', lengthMeters: 500, events: [] });
  world.appliedFaults = [fault];
  const fullLog = [...log, action('a-diag', log.length, { type: 'diagnosis', diagnosis, durationSeconds: 0 })];
  const state = makeSession({ world, log: fullLog });
  const accuracy = computeAccuracy(state);
  return computeEvidence(state, accuracy);
}

const macrobendFault: FaultInstance = { instanceId: 'f1', kind: 'macrobend', target: { type: 'fiber-span', spanId: 's1' }, params: { positionMeters: 100 } };
function macrobendClaim(evidenceActionIds: string[]) {
  return { faultKind: 'macrobend', target: { type: 'fiber-span' as const, spanId: 's1' }, positionMeters: 100, evidenceActionIds };
}

describe('12. macrobend evidence tiers', () => {
  it('correct claim, no evidence and an empty log scores 0', () => {
    const result = evidenceFor(macrobendFault, { claims: [macrobendClaim([])] }, []);
    expect(result.score).toBe(0);
  });

  it('two resolving shots (1310, 1550), uncited, scores 60', () => {
    const shots = [macrobendShot('s0', 0, 1310), macrobendShot('s1shot', 1, 1550)];
    const result = evidenceFor(macrobendFault, { claims: [macrobendClaim([])] }, shots);
    expect(result.score).toBe(60);
  });

  it('the same two shots, cited, scores 100', () => {
    const shots = [macrobendShot('s0', 0, 1310), macrobendShot('s1shot', 1, 1550)];
    const result = evidenceFor(macrobendFault, { claims: [macrobendClaim(['s0', 's1shot'])] }, shots);
    expect(result.score).toBe(100);
  });

  it('a single-wavelength shot, cited, scores 30', () => {
    const shots = [macrobendShot('s0', 0, 1310)];
    const result = evidenceFor(macrobendFault, { claims: [macrobendClaim(['s0'])] }, shots);
    expect(result.score).toBe(30);
  });
});

describe('13. dns-stale-record evidence', () => {
  const fault: FaultInstance = { instanceId: 'f1', kind: 'dns-stale-record', target: { type: 'device-global', deviceId: 'dev-1' }, params: { hostname: 'portal.isp.net', actualIp: '10.0.0.5', resolvedIp: '10.0.0.9' } };
  function claim(evidenceActionIds: string[]) {
    return { faultKind: 'dns-stale-record', target: { type: 'device-global' as const, deviceId: 'dev-1' }, evidenceActionIds };
  }
  const nslookup = action('c0', 0, {
    type: 'cli', endpoint: { kind: 'host', hostId: 'host-1' }, command: 'nslookup portal.isp.net', recognized: true, handlerId: 'host-nslookup',
    facts: [{ kind: 'dns-lookup', name: 'portal.isp.net', resolvedIp: '10.0.0.9', serverIp: '10.0.0.2', stale: true, serverHealth: null }],
    outputRef: 'out0', durationSeconds: 23,
  });
  const pingActual = action('c1', 1, {
    type: 'cli', endpoint: { kind: 'host', hostId: 'host-1' }, command: 'ping 10.0.0.5', recognized: true, handlerId: 'host-ping',
    facts: [{ kind: 'ping', target: '10.0.0.5', resolvedIp: '10.0.0.5', delivered: 4, sent: 4 }],
    outputRef: 'out1', durationSeconds: 23,
  });

  it('cited nslookup (stale) + cited ping to the actual IP (4/4) scores 100', () => {
    const result = evidenceFor(fault, { claims: [claim(['c0', 'c1'])] }, [nslookup, pingActual]);
    expect(result.score).toBe(100);
  });

  it('only the nslookup (cited, and the only action in the log) scores 30', () => {
    const result = evidenceFor(fault, { claims: [claim(['c0'])] }, [nslookup]);
    expect(result.score).toBe(30);
  });
});

describe('14. wrong-tube-continuity evidence', () => {
  const fault: FaultInstance = { instanceId: 'f1', kind: 'wrong-tube-continuity', target: { type: 'fiber-span', spanId: 's1' }, params: { tubeColor: 'blue', fiberColor: 'orange', rollType: 'wrong-tube' } };
  function claim(evidenceActionIds: string[]) {
    return { faultKind: 'wrong-tube-continuity', target: { type: 'fiber-span' as const, spanId: 's1' }, strand: { tubeColor: 'blue' as const, fiberColor: 'orange' as const }, evidenceActionIds };
  }
  const otdrUnterminated = action('o0', 0, {
    type: 'otdr-shot', access: { accessNodeId: 'n0', launchSpanId: 's1' }, settings: otdrSettings(1550),
    events: [{ index: 1, kind: 'end-of-fiber', distanceMeters: 500, lossDb: null, reflectanceDb: -14, cumulativeLossDb: 0.3, sectionAttenuationDbPerKm: null, quality: 'ok' }],
    violations: [],
    groundTruth: [{ eventId: null, spanId: 's1', kind: 'unterminated-end', trueDistanceMeters: 500, displayDistanceMeters: 500, trueLossDb: 60, reflectanceDb: null, resolved: true, branchPath: [] }],
    pathSpanIds: ['s1'], traceRef: 'trace:0', durationSeconds: 35,
  });
  const records = action('r0', 1, { type: 'records', nodeId: 'closure-1', recordIds: ['rec-1'], durationSeconds: 60 });

  it('cited unterminated-end OTDR at the closure + cited records scores 100', () => {
    const result = evidenceFor(fault, { claims: [claim(['o0', 'r0'])] }, [otdrUnterminated, records]);
    expect(result.score).toBe(100);
  });

  it('records alone (cited, and the only action in the log) scores 30', () => {
    const result = evidenceFor(fault, { claims: [claim(['r0'])] }, [records]);
    expect(result.score).toBe(30);
  });
});

describe('15. evidence rule coverage', () => {
  it('every fault taxonomy id has an EVIDENCE_RULES entry with at least one set', () => {
    for (const def of FAULT_TAXONOMY) {
      const sets = EVIDENCE_RULES[def.id];
      expect(sets, `missing EVIDENCE_RULES entry for "${def.id}"`).toBeDefined();
      expect(sets.length, `EVIDENCE_RULES["${def.id}"] has no sets`).toBeGreaterThan(0);
    }
  });
});
