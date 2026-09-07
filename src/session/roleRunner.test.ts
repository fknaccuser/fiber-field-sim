import { describe, expect, it } from 'vitest';
import { getScenario, instantiateScenario } from '../scenarios';
import { resolveProfileSet } from '../profiles';
import { perform, startSession } from './runner';
import type { ScenarioMeta, SessionState } from './types';
import type { Role } from './roles';

function sessionAs(role: Role | undefined): SessionState {
  const def = getScenario('t4-wrong-roll-closure-7');
  const { world, meta } = instantiateScenario(def, 1);
  const withRole: ScenarioMeta = role ? { ...meta, role } : meta;
  return startSession(world, resolveProfileSet(def.profiles), withRole);
}

/** Somewhere other than where we are, so each roll is a real move. */
function elsewhere(state: SessionState, used: string[]): string {
  return state.world.topology.nodes.find((n) => n.id !== state.locationNodeId && !used.includes(n.id))!.id;
}

function rollRepeatedly(state: SessionState, times: number) {
  const used: string[] = [];
  const reasons: string[] = [];
  for (let i = 0; i < times; i++) {
    const to = elsewhere(state, used);
    used.push(to);
    const { state: next, result } = perform(state, { type: 'truck-roll', toNodeId: to });
    state = next;
    if (result.type === 'refused') reasons.push(result.reason);
  }
  return { state, reasons };
}

describe('role, applied by the runner', () => {
  it('a senior grade is refused a roll past its budget', () => {
    const { reasons } = rollRepeatedly(sessionAs('senior'), 4);
    // Budget is 2 with a hard cap, so the third and fourth attempts are refused.
    expect(reasons).toHaveLength(2);
    expect(reasons[0]).toMatch(/cannot justify another truck roll/i);
  });

  it('a junior grade is never refused, however far it wanders', () => {
    expect(rollRepeatedly(sessionAs('l1'), 6).reasons).toEqual([]);
    expect(rollRepeatedly(sessionAs('l2'), 6).reasons).toEqual([]);
  });

  it('a session with no role behaves exactly as it did before roles existed', () => {
    expect(rollRepeatedly(sessionAs(undefined), 6).reasons).toEqual([]);
  });

  it('hint allowance follows the stricter of role and tier', () => {
    // t4 is tier 4: one hint. A senior grade allows none, so the very first is refused.
    const senior = perform(sessionAs('senior'), { type: 'hint' });
    expect(senior.result.type === 'hint' && senior.result.text).toBeNull();

    // L1 does not soften tier 4 past its own single hint.
    let l1 = sessionAs('l1');
    const first = perform(l1, { type: 'hint' });
    l1 = first.state;
    expect(first.result.type === 'hint' && first.result.text).not.toBeNull();
    expect(perform(l1, { type: 'hint' }).result).toMatchObject({ type: 'hint', text: null });
  });
});
