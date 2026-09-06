import { describe, expect, it } from 'vitest';
import type { WorldState } from '../world';
import { resolveProfileSet } from '../profiles';
import type { ProfileSet } from '../profiles';
import { startSession, perform } from '../session/runner';
import type { Intent, ScenarioMeta, SessionState } from '../session/types';
import { scoreSession } from '../scoring/score';
import { listScenarios, getScenario } from './registry';
import { instantiateScenario } from './loader';
import { validateScenario } from './validate';

function runSteps(world: WorldState, profiles: ProfileSet, meta: ScenarioMeta, steps: Intent[]): { state: SessionState; results: unknown[] } {
  let state = startSession(world, profiles, meta);
  const results: unknown[] = [];
  for (const step of steps) {
    const r = perform(state, step);
    state = r.state;
    results.push(r.result);
  }
  return { state, results };
}

describe('9. all three reference scenarios validate with zero errors', () => {
  it.each(listScenarios().map((s) => s.id))('%s has no validation errors', (id) => {
    const def = getScenario(id);
    const issues = validateScenario(def);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
  });
});

describe('10. t1-dark-ont-vista-court', () => {
  const def = getScenario('t1-dark-ont-vista-court');

  it('the reference run scores 100 on every axis, reads healthy power at the ONT, and shows offline on the OLT', () => {
    const { world, meta } = instantiateScenario(def, 1);
    const profiles = resolveProfileSet(def.profiles);
    const { state, results } = runSteps(world, profiles, meta, meta.referenceSolution.steps);

    const report = scoreSession(state);
    expect(report.axes.diagnosticAccuracy.score).toBe(100);
    expect(report.axes.evidenceQuality.score).toBe(100);
    expect(report.axes.safetyCompliance.score).toBe(100);
    expect(report.axes.efficiency.score).toBe(100);

    const powerMeterResult = results[1] as { type: string; dbm: number };
    expect(powerMeterResult.dbm).toBeGreaterThan(-15.8);
    expect(powerMeterResult.dbm).toBeLessThan(-15.0);

    const cliResult = results[0] as { type: string; result: { output: string[] } };
    expect(cliResult.result.output.some((line) => line.includes('offline'))).toBe(true);
  });
});

describe('11. t4-wrong-roll-closure-7', () => {
  const def = getScenario('t4-wrong-roll-closure-7');

  it('the reference run scores 100 on accuracy/evidence/safety, the OTDR ends unterminated with a strong reflection, the closure reads healthy power, and exactly four ONTs show los', () => {
    const { world, meta } = instantiateScenario(def, 1);
    const profiles = resolveProfileSet(def.profiles);
    const { state, results } = runSteps(world, profiles, meta, meta.referenceSolution.steps);

    const report = scoreSession(state);
    expect(report.axes.diagnosticAccuracy.score).toBe(100);
    expect(report.axes.evidenceQuality.score).toBe(100);
    expect(report.axes.safetyCompliance.score).toBe(100);

    const otdrStepIndex = meta.referenceSolution.steps.findIndex((s) => s.type === 'otdr-shot');
    const otdrResult = results[otdrStepIndex] as { type: string; result: { events: Array<{ kind: string; distanceMeters: number; reflectanceDb: number | null }> } };
    const endOfFiber = otdrResult.result.events.find((e) => e.kind === 'end-of-fiber')!;
    expect(endOfFiber).toBeDefined();
    expect(endOfFiber.reflectanceDb).not.toBeNull();
    expect(endOfFiber.reflectanceDb!).toBeLessThanOrEqual(-12);
    expect(endOfFiber.distanceMeters).toBeGreaterThan(3000);
    expect(endOfFiber.distanceMeters).toBeLessThan(3200);

    const cl7PowerStepIndex = meta.referenceSolution.steps.findIndex((s) => s.type === 'power-meter' && s.nodeId === 'cl-7');
    const cl7Power = results[cl7PowerStepIndex] as { type: string; dbm: number };
    expect(cl7Power.dbm).toBeGreaterThan(2);

    const ontStatusStepIndex = meta.referenceSolution.steps.findIndex((s) => s.type === 'cli');
    const ontStatus = results[ontStatusStepIndex] as { type: string; result: { output: string[] } };
    const losCount = ontStatus.result.output.filter((line) => line.includes('los')).length;
    expect(losCount).toBe(4);
  });

  it('citing only the FDH-B OTDR shot (not the closure power reading) scores evidence 30', () => {
    const { world, meta } = instantiateScenario(def, 1);
    const profiles = resolveProfileSet(def.profiles);
    const otdrStep = meta.referenceSolution.steps.find((s): s is Extract<Intent, { type: 'otdr-shot' }> => s.type === 'otdr-shot')!;

    const altSteps: Intent[] = [
      { type: 'truck-roll', toNodeId: otdrStep.access.accessNodeId },
      otdrStep,
      {
        type: 'diagnosis',
        diagnosis: {
          claims: [{ faultKind: 'wrong-tube-continuity', target: { type: 'fiber-span', spanId: 'sp-feeder-main' }, strand: { tubeColor: 'blue', fiberColor: 'orange' }, evidenceActionIds: ['a1'] }],
        },
      },
    ];
    const { state } = runSteps(world, profiles, meta, altSteps);
    const report = scoreSession(state);
    expect(report.axes.evidenceQuality.score).toBe(30);
  });
});

describe('12. t5-everyones-down-nothings-broken', () => {
  const def = getScenario('t5-everyones-down-nothings-broken');

  it('the reference run scores 100 on accuracy/evidence/safety with zero truck-rolls, and every ONT shows online', () => {
    const { world, meta } = instantiateScenario(def, 1);
    const profiles = resolveProfileSet(def.profiles);
    const { state, results } = runSteps(world, profiles, meta, meta.referenceSolution.steps);

    const report = scoreSession(state);
    expect(report.axes.diagnosticAccuracy.score).toBe(100);
    expect(report.axes.evidenceQuality.score).toBe(100);
    expect(report.axes.safetyCompliance.score).toBe(100);
    expect(state.log.some((a) => a.type === 'truck-roll')).toBe(false);

    const ontStatusStepIndex = meta.referenceSolution.steps.findIndex((s) => s.type === 'cli' && s.endpoint.kind === 'device');
    const ontStatus = results[ontStatusStepIndex] as { type: string; result: { output: string[] } };
    const onlineCount = ontStatus.result.output.filter((line) => line.includes('online')).length;
    expect(onlineCount).toBe(6);
  });

  it('adding an unnecessary truck-roll scores efficiency below 100', () => {
    const { world, meta } = instantiateScenario(def, 1);
    const profiles = resolveProfileSet(def.profiles);
    const withDetour: Intent[] = [{ type: 'truck-roll', toNodeId: 'fdh-a-spl1' }, ...meta.referenceSolution.steps];
    const { state } = runSteps(world, profiles, meta, withDetour);
    const report = scoreSession(state);
    expect(report.axes.efficiency.score).toBeLessThan(100);
  });

  it('claiming the red-herring transceiver fault instead of DNS scores accuracy 0, and an added transceiver check replays as unnecessary', () => {
    const { world, meta } = instantiateScenario(def, 1);
    const profiles = resolveProfileSet(def.profiles);
    const nonDiagnosisSteps = meta.referenceSolution.steps.filter((s) => s.type !== 'diagnosis');
    const transceiverCheck: Intent = { type: 'cli', endpoint: { kind: 'device', deviceId: 'olt-1-dev' }, command: 'show interfaces transceiver detail' };
    const altSteps: Intent[] = [
      ...nonDiagnosisSteps,
      transceiverCheck,
      {
        type: 'diagnosis',
        diagnosis: { claims: [{ faultKind: 'transceiver-rx-power-low', target: { type: 'device-interface', deviceId: 'olt-1-dev', interfaceId: 'TenGigabitEthernet1/2' }, evidenceActionIds: [] }] },
      },
    ];
    const { state } = runSteps(world, profiles, meta, altSteps);
    const report = scoreSession(state);
    expect(report.axes.diagnosticAccuracy.score).toBe(0);

    const transceiverActionId = state.log.find((a) => a.type === 'cli' && a.command === transceiverCheck.command)!.id;
    const replayStep = report.replay.steps.find((s) => s.actionId === transceiverActionId)!;
    expect(replayStep.classification).toBe('unnecessary');
  });

  it('claiming the DNS fault without escalating scores accuracy 80', () => {
    const { world, meta } = instantiateScenario(def, 1);
    const profiles = resolveProfileSet(def.profiles);
    const nonDiagnosisSteps = meta.referenceSolution.steps.filter((s) => s.type !== 'diagnosis');
    const referenceDiagnosis = meta.referenceSolution.steps.find((s): s is Extract<Intent, { type: 'diagnosis' }> => s.type === 'diagnosis')!;
    const altSteps: Intent[] = [...nonDiagnosisSteps, { type: 'diagnosis', diagnosis: { claims: referenceDiagnosis.diagnosis.claims } }];
    const { state } = runSteps(world, profiles, meta, altSteps);
    const report = scoreSession(state);
    expect(report.axes.diagnosticAccuracy.score).toBe(80);
  });
});

describe('13. listScenarios', () => {
  it('returns the three bundled scenario ids sorted by tier', () => {
    const summaries = listScenarios();
    expect(summaries.map((s) => s.id)).toEqual(['t1-dark-ont-vista-court', 't4-wrong-roll-closure-7', 't5-everyones-down-nothings-broken']);
    expect(summaries.map((s) => s.tier)).toEqual([1, 4, 5]);
  });
});
