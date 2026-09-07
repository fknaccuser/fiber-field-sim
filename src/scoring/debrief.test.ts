import { describe, expect, it } from 'vitest';
import { getScenario, instantiateScenario, listScenarios } from '../scenarios';
import { resolveProfileSet } from '../profiles';
import { startSession, perform } from '../session/runner';
import { computeAccuracy } from './accuracy';
import { buildDebrief } from './debrief';
import { scoreSession } from './score';
import type { Intent } from '../session/types';
import { ScenarioDefinitionSchema } from '../scenarios/schema';
import { validateScenario } from '../scenarios/validate';

function setup(id = 't1-dark-ont-vista-court') {
  const def = getScenario(id, 17);
  const { world, meta } = instantiateScenario(def, 17);
  return startSession(world, resolveProfileSet(def.profiles), meta);
}
function reference(id?: string) {
  let state = setup(id);
  for (const step of state.meta.referenceSolution.steps) state = perform(state, step).state;
  return state;
}

describe('teaching debrief', () => {
  it('cannot be built during a live session', () => {
    const state = setup();
    expect(() => buildDebrief(state, { score: { axis: 'diagnosticAccuracy', score: 0, details: [] }, matches: [], falsePositiveClaims: [], missedFaults: [] })).toThrow('only available');
  });
  it.each(listScenarios().map((s) => s.id))('%s explains a perfect reference run and its timing', (id) => {
    const state = reference(id);
    const report = scoreSession(state);
    expect(report.debrief?.verdict).toBe('correct');
    expect(report.debrief?.evidence.every((entry) => entry.status === 'cited')).toBe(true);
    expect(report.debrief?.walkthrough.every((step) => step.matchedActionId && step.why.trim())).toBe(true);
    expect(report.debrief?.walkthrough.reduce((sum, step) => sum + step.seconds, 0)).toBe(state.meta.referenceSolution.totalSeconds);
    expect(report.replay.steps.every((step) => step.classification === 'on-path')).toBe(true);
  });
  it('explains the missed fault and all reference checks after a wrong no-fault submission', () => {
    const state = perform(setup(), { type: 'diagnosis', diagnosis: { claims: [], noFaultInScope: true } }).state;
    const report = scoreSession(state).debrief!;
    expect(report.verdict).toBe('incorrect');
    expect(report.faults[0]).toMatchObject({ matched: false, label: 'ONT unpowered' });
    expect(report.faults[0].description.length).toBeGreaterThan(20);
    expect(report.walkthrough.slice(0, -1).every((s) => s.matchedActionId === null)).toBe(true);
    expect(report.evidence[0].status).toBe('missing');
  });
  it('separates a right answer with incomplete citations from sufficient observations', () => {
    let state = setup();
    const steps = state.meta.referenceSolution.steps;
    for (const step of steps.slice(0, -1)) state = perform(state, step).state;
    const submit = structuredClone(steps.at(-1)) as Extract<Intent, { type: 'diagnosis' }>;
    submit.diagnosis.claims.forEach((claim) => { claim.evidenceActionIds = []; });
    state = perform(state, submit).state;
    const report = scoreSession(state);
    expect(report.debrief?.verdict).toBe('correct');
    expect(report.debrief?.evidence[0].status).toBe('uncited');
    expect(report.debrief?.evidence[0].supportingActionIds).toEqual(['a0', 'a1']);
    expect(report.debrief?.evidence[0].explanation).toContain('diagnosis was right');
    expect(report.axes.evidenceQuality.score).toBe(60);
  });
  it('identifies a correct guess with no supporting observations', () => {
    const initial = setup();
    const submit = structuredClone(initial.meta.referenceSolution.steps.at(-1)) as Extract<Intent, { type: 'diagnosis' }>;
    submit.diagnosis.claims.forEach((claim) => { claim.evidenceActionIds = []; });
    const state = perform(initial, submit).state;
    const debrief = buildDebrief(state, computeAccuracy(state));
    expect(debrief.verdict).toBe('correct');
    expect(debrief.evidence[0].status).toBe('missing');
    expect(debrief.evidence[0].explanation).toContain('guess');
  });
  it.each([1, 2, 3, 4, 5, 6] as const)('keeps the full debrief at tier %i', (tier) => {
    const state = reference();
    state.meta.tier = tier;
    expect(scoreSession(state).debrief?.walkthrough).toHaveLength(3);
  });
});

describe('required reference rationales', () => {
  it.each(['missing', 'blank', 'short'] as const)('rejects %s rationale data in both load and validation paths', (kind) => {
    const def = structuredClone(getScenario('t1-dark-ont-vista-court'));
    if (kind === 'missing') delete (def.referenceSolution as { rationales?: string[] }).rationales;
    if (kind === 'blank') def.referenceSolution.rationales[0] = '   ';
    if (kind === 'short') def.referenceSolution.rationales.pop();
    expect(ScenarioDefinitionSchema.safeParse(def).success).toBe(false);
    expect(validateScenario(def).some((issue) => issue.code === 'E14')).toBe(true);
  });
  it.each([1, 2, 3, 4, 5])('generated tier %i carries a why for every step', (tier) => {
    const def = getScenario(`t${tier}-gen-drop-small`, 19);
    expect(def.referenceSolution.rationales).toHaveLength(def.referenceSolution.steps.length);
    expect(def.referenceSolution.rationales.every((why) => why.trim().length > 20)).toBe(true);
  });
});
