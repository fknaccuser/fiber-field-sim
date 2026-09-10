import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { getScenario, instantiateScenario } from '../../scenarios';
import { resolveProfileSet } from '../../profiles';
import { perform, startSession, stripGroundTruth } from '../../session/runner';
import { resumeSession } from './sessionStore';
import type { StoredSession } from './persistence';

/**
 * A row written by a build that shipped before `customer-contact` was renamed `noc-contact`.
 *
 * This is not a hypothetical. Rows like it are on the devices of everyone who used the site
 * before the rename, and a resume replays them through today's runner. The switch that maps
 * a stored action back to an intent was exhaustive over *today's* union, which TypeScript is
 * happy to prove and which says nothing at all about data written by yesterday's build: the
 * old name matched no case, the switch returned `undefined`, and the runner read `.type` off
 * it. On the deployed site that was `undefined is not an object (evaluating 'r.type')`, and
 * the app would not open at all for anyone carrying such a row.
 */
function legacyRow(): StoredSession {
  const scenarioId = 't1-dark-ont-vista-court';
  const seed = 7;
  return {
    id: 'legacy-1',
    traineeId: 'tester',
    scenarioId,
    seed,
    tier: 1,
    startedAt: new Date().toISOString(),
    endedAt: null,
    endedBy: null,
    simulatedSeconds: 0,
    scores: null,
    total: null,
    faultDomains: [],
    matchedFaultKinds: [],
    missedFaultKinds: [],
    falsePositives: 0,
    actionCount: 1,
    log: [{ type: 'customer-contact', durationSeconds: 180 }] as unknown as StoredSession['log'],
    report: null,
    schemaVersion: 1,
  };
}

describe('resuming a run recorded before the NOC rename', () => {
  it('replays the old action instead of throwing on it', () => {
    expect(() => resumeSession(legacyRow())).not.toThrow();
  });

  it('carries it forward as the NOC contact it became, not as nothing', () => {
    const state = resumeSession(legacyRow());
    const fresh = (() => {
      const def = getScenario('t1-dark-ont-vista-court', 7);
      const { world, meta } = instantiateScenario(def, 7);
      return startSession(world, resolveProfileSet(def.profiles), meta);
    })();
    // The contact happened, so the clock has to have moved. A silently dropped action would
    // resume the trainee into a run where the time they spent never existed.
    expect(state.clockSeconds).toBeGreaterThan(fresh.clockSeconds);
  });

  it('survives an action type that no longer exists at all', () => {
    const row = legacyRow();
    row.log = [{ type: 'send-carrier-pigeon' }] as unknown as StoredSession['log'];
    expect(() => resumeSession(row)).not.toThrow();
  });

  it('survives a refusal whose refused intent is itself a legacy one', () => {
    const row = legacyRow();
    row.log = [{ type: 'refused', intent: { type: 'customer-contact' } }] as unknown as StoredSession['log'];
    expect(() => resumeSession(row)).not.toThrow();
  });
});

describe('the round trip this build writes for itself', () => {
  /**
   * The guard the rename slipped through.
   *
   * Every action this build records has to be replayable *by this build*, or a resume
   * silently drops it and a trainee comes back to a run that has forgotten what they did.
   * Nothing checked that, because writing and replaying live in different files and the
   * compiler is satisfied by each on its own. This runs a whole reference solution through
   * the recorder and back through the replayer and fails if a single action goes missing --
   * so the next time an action is renamed, this is what says so, rather than a deployed
   * site telling someone about `r.type`.
   */
  it('replays every action it recorded, dropping none of them', () => {
    // The richest reference solution in the library, and one that includes the very action
    // whose rename caused this: a NOC contact.
    const scenarioId = 't4-wrong-roll-closure-7';
    const seed = 3;
    const def = getScenario(scenarioId, seed);
    const { world, meta } = instantiateScenario(def, seed);
    const profiles = resolveProfileSet(def.profiles);

    let live = startSession(world, profiles, meta);
    for (const step of meta.referenceSolution.steps) live = perform(live, step).state;
    expect(live.log.length).toBeGreaterThanOrEqual(10);

    const skipped: unknown[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation((...args) => { skipped.push(args[0]); });
    const replayed = resumeSession({ ...legacyRow(), scenarioId, seed, log: live.log.map(stripGroundTruth) });
    warn.mockRestore();

    expect(skipped).toEqual([]);
    expect(replayed.log.length).toBe(live.log.length);
    // Same seed, same steps, same clock -- a resumed run has to be the run they left.
    expect(replayed.clockSeconds).toBe(live.clockSeconds);
  });
});
