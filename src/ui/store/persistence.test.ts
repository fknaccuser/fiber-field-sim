import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getScenario, instantiateScenario } from '../../scenarios';
import { resolveProfileSet } from '../../profiles';
import { startSession, perform } from '../../session/runner';
import type { SessionState } from '../../session/types';
import { _useDatabase, getOrCreateTraineeId, getPersonalBest, getSession, loadUnfinished, migrateStored, saveBenchRun, saveSession, type StoredSession } from './persistence';

function runReference(seed = 1): { session: SessionState; report: import('../../scoring/types').ScoreReport } {
  const def = getScenario('t1-dark-ont-vista-court');
  const { world, meta } = instantiateScenario(def, seed);
  const profiles = resolveProfileSet(def.profiles);
  let state = startSession(world, profiles, meta);
  let report: import('../../scoring/types').ScoreReport | null = null;
  for (const step of meta.referenceSolution.steps) {
    const r = perform(state, step);
    state = r.state;
    if (r.result.type === 'diagnosis') report = r.result.report;
  }
  return { session: state, report: report! };
}

describe('2. saveSession / getSession round-trip', () => {
  it('round-trips a finished t1 session', async () => {
    _useDatabase('persistence-test-1');
    const { session, report } = runReference();
    const identity = { id: 'session-1', traineeId: 'trainee-1', startedAt: '2026-01-01T10:00:00.000Z' };
    await saveSession(identity, session, report);

    const stored = await getSession('session-1');
    expect(stored).toBeDefined();
    const { id: _id, ...withoutId } = stored!;
    expect(withoutId).toEqual({
      traineeId: 'trainee-1',
      scenarioId: 't1-dark-ont-vista-court',
      seed: 1,
      tier: 1,
      startedAt: '2026-01-01T10:00:00.000Z',
      endedAt: withoutId.endedAt,
      endedBy: 'diagnosis',
      simulatedSeconds: session.clockSeconds,
      scores: {
        diagnosticAccuracy: report.axes.diagnosticAccuracy.score,
        evidenceQuality: report.axes.evidenceQuality.score,
        efficiency: report.axes.efficiency.score,
        serviceImpact: report.axes.serviceImpact.score,
        safetyCompliance: report.axes.safetyCompliance.score,
      },
      total: report.total,
      faultDomains: ['cpe'],
      matchedFaultKinds: ['ont-unpowered'],
      missedFaultKinds: [],
      falsePositives: 0,
      actionCount: session.log.length,
      log: withoutId.log,
      report,
      schemaVersion: 1,
    });
    expect(typeof withoutId.endedAt).toBe('string');
    expect(withoutId.log.every((a) => a.type !== 'otdr-shot' || !('groundTruth' in a))).toBe(true);
  });
});

describe('loadUnfinished', () => {
  it('returns the most recent in-progress session', async () => {
    _useDatabase('persistence-test-2');
    const { session } = runReference();

    const finishedIdentity = { id: 'finished-1', traineeId: 'trainee-1', startedAt: '2026-01-01T09:00:00.000Z' };
    await saveSession(finishedIdentity, session, null);
    // Simulate an in-progress session: not ended.
    const def = getScenario('t1-dark-ont-vista-court');
    const { world, meta } = instantiateScenario(def, 2);
    const profiles = resolveProfileSet(def.profiles);
    const inProgress = startSession(world, profiles, meta);
    const inProgressIdentity = { id: 'in-progress-1', traineeId: 'trainee-1', startedAt: '2026-01-01T11:00:00.000Z' };
    await saveSession(inProgressIdentity, inProgress, null);

    const unfinished = await loadUnfinished();
    expect(unfinished?.id).toBe('in-progress-1');
    expect(unfinished?.endedAt).toBeNull();
  });
});

describe('personalBests upsert', () => {
  it('keeps the higher total, and the lower time on a tie', async () => {
    _useDatabase('persistence-test-3');
    const { session, report } = runReference();
    const scenarioId = session.meta.scenarioId;
    const seed = session.meta.seed;

    await saveSession({ id: 's1', traineeId: 't1', startedAt: '2026-01-01T00:00:00.000Z' }, session, { ...report, total: 50 });
    let best = await getPersonalBest(scenarioId, seed);
    expect(best?.total).toBe(50);

    // A worse run should not overwrite the best.
    await saveSession({ id: 's2', traineeId: 't1', startedAt: '2026-01-02T00:00:00.000Z' }, session, { ...report, total: 20 });
    best = await getPersonalBest(scenarioId, seed);
    expect(best?.total).toBe(50);
    expect(best?.sessionId).toBe('s1');

    // A better run should overwrite it.
    await saveSession({ id: 's3', traineeId: 't1', startedAt: '2026-01-03T00:00:00.000Z' }, session, { ...report, total: 80 });
    best = await getPersonalBest(scenarioId, seed);
    expect(best?.total).toBe(80);
    expect(best?.sessionId).toBe('s3');
  });
});

describe('carrying an older row forward', () => {
  it('reads a pre-rename customerImpact score as serviceImpact', () => {
    const legacy = {
      scores: { diagnosticAccuracy: 90, evidenceQuality: 80, efficiency: 70, customerImpact: 60, safetyCompliance: 100 },
    } as unknown as StoredSession;
    const migrated = migrateStored(legacy)!;
    expect(migrated.scores).toEqual({ diagnosticAccuracy: 90, evidenceQuality: 80, efficiency: 70, serviceImpact: 60, safetyCompliance: 100 });
    // The old key does not survive alongside the new one, or the record has two fifth axes.
    expect('customerImpact' in migrated.scores!).toBe(false);
  });

  it('leaves a current row exactly as it is', () => {
    const current = {
      scores: { diagnosticAccuracy: 90, evidenceQuality: 80, efficiency: 70, serviceImpact: 60, safetyCompliance: 100 },
    } as unknown as StoredSession;
    expect(migrateStored(current)).toBe(current);
  });

  it('passes through a row with no scores and an absent row', () => {
    const unscored = { scores: null } as unknown as StoredSession;
    expect(migrateStored(unscored)).toBe(unscored);
    expect(migrateStored(undefined)).toBeUndefined();
  });
});

describe('when there is nowhere to write', () => {
  it('still hands back a trainee id, and the same one twice', async () => {
    // Safari and Firefox refuse IndexedDB on file://, and this app is deliberately runnable
    // as a single file off a USB stick. A bench must not fail because the record cannot.
    const broken = { settings: { get: () => Promise.reject(new Error('storage disabled')) } };
    _useDatabase(broken as never);
    const first = await getOrCreateTraineeId();
    const second = await getOrCreateTraineeId();
    expect(first).toMatch(/[0-9a-f-]{36}/);
    expect(second).toBe(first);
  });

  it('resolves rather than rejecting when a bench run cannot be stored', async () => {
    const broken = { benchRuns: { put: () => Promise.reject(new Error('storage disabled')) } };
    _useDatabase(broken as never);
    await expect(saveBenchRun({
      id: 'r1', traineeId: 't1', kind: 'tray-dress', at: new Date().toISOString(), seed: 1,
      mistakes: [], omitted: [], seconds: 60, passed: true, score: 100, domains: ['splicing'],
    })).resolves.toBeUndefined();
  });
});
