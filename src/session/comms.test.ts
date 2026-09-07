import { describe, expect, it } from 'vitest';
import { getScenario, instantiateScenario } from '../scenarios';
import { resolveProfileSet } from '../profiles';
import { perform, startSession } from './runner';
import { availableReplies, canClaim, pendingComms, scheduleComms } from './comms';
import { ROLE_ORDER, ROLE_POLICY } from './roles';
import type { SessionState } from './types';

function world() {
  const def = getScenario('t4-wrong-roll-closure-7');
  const { world: w, meta } = instantiateScenario(def, 1);
  return { w, meta, profiles: resolveProfileSet(def.profiles) };
}

describe('comms scheduling', () => {
  const { w } = world();

  it('is silent for the junior grade and busier as the grade rises', () => {
    const counts = ROLE_ORDER.map((r) => scheduleComms(1, r, 90, w).length);
    expect(counts[0]).toBe(0);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
  });

  it('is deterministic and arrives in order, never in the first two minutes', () => {
    const a = scheduleComms(77, 'senior', 90, w);
    expect(JSON.stringify(a)).toBe(JSON.stringify(scheduleComms(77, 'senior', 90, w)));
    for (let i = 0; i < a.length; i++) {
      expect(a[i].atSimSeconds).toBeGreaterThanOrEqual(120);
      if (i > 0) expect(a[i].atSimSeconds).toBeGreaterThanOrEqual(a[i - 1].atSimSeconds);
    }
  });

  it('only the grades that must answer get blocking calls', () => {
    for (const role of ROLE_ORDER) {
      const blocking = scheduleComms(5, role, 90, w).filter((e) => e.blocking);
      if (!ROLE_POLICY[role].mustAnswerComms) expect(blocking).toHaveLength(0);
    }
  });

  it('delivers nothing before its time, then holds it until answered', () => {
    const events = scheduleComms(3, 'senior', 90, w);
    expect(pendingComms(events, 0, [])).toHaveLength(0);
    const first = events[0];
    expect(pendingComms(events, first.atSimSeconds, []).map((e) => e.id)).toContain(first.id);
    expect(pendingComms(events, first.atSimSeconds, [first.id]).map((e) => e.id)).not.toContain(first.id);
  });
});

describe('you cannot report what you have not seen', () => {
  const { w, meta, profiles } = world();

  it('gates every claim on the action log', () => {
    let state: SessionState = startSession(w, profiles, { ...meta, role: 'senior' });
    const status = state.commsEvents.find((e) => e.replies.some((r) => r.requires === 'saw-los'));
    expect(status, 'a senior day should carry at least one status request').toBeDefined();

    // Fresh session: only the honest "nothing yet" answer is on offer.
    expect(availableReplies(status!, state.log).every((r) => r.requires === 'none')).toBe(true);
    expect(canClaim('saw-los', state.log)).toBe(false);
    expect(canClaim('metered', state.log)).toBe(false);

    // Ask the OLT, and the LOS answer unlocks — because it is now true.
    state = perform(state, { type: 'cli', endpoint: { kind: 'device', deviceId: 'olt-1-dev' }, command: 'show ont status' }).state;
    expect(canClaim('saw-los', state.log)).toBe(true);
    expect(availableReplies(status!, state.log).some((r) => r.requires === 'saw-los')).toBe(true);
    // Still cannot claim a meter reading that was never taken.
    expect(canClaim('metered', state.log)).toBe(false);
  });
});

describe('answering costs you the clock', () => {
  const { w, meta, profiles } = world();

  it('logs the reply and advances the simulated clock', () => {
    const state = startSession(w, profiles, { ...meta, role: 'senior' });
    const event = state.commsEvents[0];
    const before = state.clockSeconds;
    const { state: after, result } = perform(state, { type: 'comms', eventId: event.id, replyId: event.replies[0]?.id ?? 'nothing', seconds: 45 });
    expect(result.type).toBe('comms');
    expect(after.clockSeconds).toBe(before + 45);
    expect(after.commsHandled).toContain(event.id);
    expect(after.log.at(-1)).toMatchObject({ type: 'comms', eventId: event.id });
  });

  it('refuses a second answer to the same message', () => {
    let state = startSession(w, profiles, { ...meta, role: 'senior' });
    const event = state.commsEvents[0];
    state = perform(state, { type: 'comms', eventId: event.id, replyId: 'nothing', seconds: 25 }).state;
    const again = perform(state, { type: 'comms', eventId: event.id, replyId: 'nothing', seconds: 25 });
    expect(again.result).toMatchObject({ type: 'refused' });
  });
});
