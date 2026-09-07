import { describe, expect, it } from 'vitest';
import { getScenario, instantiateScenario } from '../scenarios';
import { resolveProfileSet } from '../profiles';
import { perform, redactForUi, startSession } from './runner';
import { buildTeachingSteps, dispatchAdvice } from './teaching';
import { matchReferenceSteps, stepKey } from './stepMatching';
import type { Intent, ScenarioMeta } from './types';
import { action } from '../scoring/testFixtures';

function setup(tier: ScenarioMeta['tier'] = 1) {
  const def = getScenario('t1-dark-ont-vista-court');
  const { world, meta } = instantiateScenario(def, 1);
  meta.tier = tier;
  return startSession(world, resolveProfileSet(def.profiles), meta);
}

describe('tiered teaching projection', () => {
  it('shows detailed questions at tier 1 but strips the reference answer and unused hints', () => {
    const ui = redactForUi(setup());
    expect(ui.teachingSteps[0].title).toContain('show ont status');
    expect(ui.teachingSteps[0].targetNodeId).toBeTruthy();
    expect(ui.meta).not.toHaveProperty('referenceSolution');
    expect(ui.meta).not.toHaveProperty('hints');
    expect(JSON.stringify(ui.teachingSteps)).not.toContain('ont-unpowered');
    expect(ui.teachingSteps.every((s) => s.question.length > 20)).toBe(true);
  });
  it('shows method only at tier 2, with no command or target locator', () => {
    const state = setup(2);
    const steps = buildTeachingSteps(state.meta, state.world, []);
    expect(steps[0].title).not.toContain('show ont status');
    expect(steps.every((step) => !step.targetNodeId)).toBe(true);
  });
  it.each([3, 4, 5, 6] as const)('has no live reference rail at tier %i', (tier) => {
    expect(redactForUi(setup(tier)).teachingSteps).toEqual([]);
  });
  it('ticks real completed checks and updates the next dispatch question', () => {
    let state = setup();
    state = perform(state, state.meta.referenceSolution.steps[0]).state;
    const ui = redactForUi(state);
    expect(ui.teachingSteps.map((s) => s.completedActionId)).toEqual(['a0', null, null]);
    expect(dispatchAdvice(state.meta, state.world, state.log, 20)).toContain('Measure optical power');
  });
  it('tier 1 dispatch remains available beyond the authored hint count', () => {
    let state = setup();
    for (let i = 0; i < 8; i++) state = perform(state, { type: 'hint' }).state;
    expect(state.hintsUsed).toBe(8);
    expect(state.log.every((a) => a.type === 'hint' && !a.refused && a.cost === 0)).toBe(true);
  });
  it('tier 3 dispatch confirms recorded observations without revealing the next check', () => {
    let state = setup(3);
    expect(dispatchAdvice(state.meta, state.world, state.log, 0)).toContain('not recorded');
    state = perform(state, state.meta.referenceSolution.steps[0]).state;
    const advice = dispatchAdvice(state.meta, state.world, state.log, 0)!;
    expect(advice).toContain('You ran');
    expect(advice).not.toContain('Measure optical power');
    for (let i = 0; i < 3; i++) state = perform(state, { type: 'hint' }).state;
    expect(state.hintsUsed).toBe(2);
    expect(state.log.at(-1)).toMatchObject({ refused: true, text: '' });
  });
  it.each([5, 6] as const)('tier %i refused hints cannot leak their text through the log', (tier) => {
    const state = perform(setup(tier), { type: 'hint' }).state;
    expect(state.hintsUsed).toBe(0);
    expect(state.log[0]).toMatchObject({ refused: true, text: '' });
  });
});

describe('reference check matching', () => {
  const cli: Intent = { type: 'cli', endpoint: { kind: 'host', hostId: 'pc' }, command: 'ping 1.1.1.1' };
  const observed = (id: string, command = cli.command, recognized = true) => action(id, 0, { ...cli, command, recognized, handlerId: 'ping', facts: [], outputRef: id, durationSeconds: 20 });
  it('distinguishes arguments sharing one CLI handler', () => {
    expect(matchReferenceSteps([cli], [observed('a0', 'ping 8.8.8.8')])).toEqual([null]);
    expect(matchReferenceSteps([cli], [observed('a0', ' PING   1.1.1.1 ')])).toEqual(['a0']);
  });
  it('does not tick unrecognized commands or consume an observation twice', () => {
    expect(matchReferenceSteps([cli], [observed('a0', cli.command, false)])).toEqual([null]);
    expect(matchReferenceSteps([cli, cli], [observed('a0')])).toEqual(['a0', null]);
  });
  it('accepts work out of order and keeps endpoint identity canonical', () => {
    const other = { ...cli, command: 'ping 8.8.8.8' };
    expect(matchReferenceSteps([cli, other], [observed('a0', other.command), observed('a1')])).toEqual(['a1', 'a0']);
    expect(stepKey(cli)).toBe(stepKey({ ...cli, endpoint: { hostId: 'pc', kind: 'host' } }));
  });
  it('distinguishes wavelengths and same-named events on different spans', () => {
    expect(stepKey({ type: 'power-meter', nodeId: 'n', wavelengthNm: 1310 })).not.toBe(stepKey({ type: 'power-meter', nodeId: 'n', wavelengthNm: 1550 }));
    expect(stepKey({ type: 'scope', spanId: 's1', eventId: 'end' })).not.toBe(stepKey({ type: 'scope', spanId: 's2', eventId: 'end' }));
  });
});
