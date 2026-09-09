import { describe, expect, it } from 'vitest';
import type { StoredSession } from './persistence';
import { competencyMap, computeStreak } from './progress';

function fixtureSession(overrides: Partial<StoredSession>): StoredSession {
  return {
    id: 'id',
    traineeId: 'trainee',
    scenarioId: 't1-dark-ont-vista-court',
    seed: 1,
    tier: 1,
    startedAt: '2026-01-01T10:00:00.000Z',
    endedAt: '2026-01-01T10:05:00.000Z',
    endedBy: 'diagnosis',
    simulatedSeconds: 300,
    scores: { diagnosticAccuracy: 100, evidenceQuality: 100, efficiency: 100, serviceImpact: 100, safetyCompliance: 100 },
    total: 100,
    faultDomains: ['cpe'],
    matchedFaultKinds: ['ont-unpowered'],
    missedFaultKinds: [],
    falsePositives: 0,
    actionCount: 3,
    log: [],
    report: null,
    schemaVersion: 1,
    ...overrides,
  };
}

describe('3. streak computation', () => {
  it('counts same-day multiples as one day', () => {
    const sessions = [
      fixtureSession({ id: 'a', endedAt: '2026-01-05T09:00:00.000Z' }),
      fixtureSession({ id: 'b', endedAt: '2026-01-05T18:00:00.000Z' }),
    ];
    const now = new Date(2026, 0, 5, 20, 0, 0);
    const { currentStreak, bestStreak } = computeStreak(sessions, now);
    expect(currentStreak).toBe(1);
    expect(bestStreak).toBe(1);
  });

  it('resets the current streak across a gap, but best streak remembers the longer run', () => {
    const sessions = [
      fixtureSession({ id: 'a', endedAt: '2026-01-01T10:00:00.000Z' }),
      fixtureSession({ id: 'b', endedAt: '2026-01-02T10:00:00.000Z' }),
      fixtureSession({ id: 'c', endedAt: '2026-01-03T10:00:00.000Z' }),
      // Gap: no session on Jan 4.
      fixtureSession({ id: 'd', endedAt: '2026-01-05T10:00:00.000Z' }),
    ];
    const now = new Date(2026, 0, 5, 20, 0, 0);
    const { currentStreak, bestStreak } = computeStreak(sessions, now);
    expect(currentStreak).toBe(1);
    expect(bestStreak).toBe(3);
  });

  it('is zero with no finished sessions', () => {
    expect(computeStreak([], new Date(2026, 0, 5))).toEqual({ currentStreak: 0, bestStreak: 0 });
  });
});

describe('3. competency map', () => {
  it('excludes a domain no session ever touched', () => {
    const sessions = [fixtureSession({ id: 'a', faultDomains: ['cpe'] }), fixtureSession({ id: 'b', faultDomains: ['optical'] })];
    const domains = competencyMap(sessions).map((d) => d.domain);
    expect(domains).toContain('cpe');
    expect(domains).toContain('optical');
    expect(domains).not.toContain('network');
    expect(domains).not.toContain('compliance');
  });

  it('averages accuracy/evidence over each domain\'s own last-10 window and ranks weakest first', () => {
    const sessions = [
      fixtureSession({ id: 'a', faultDomains: ['optical'], scores: { diagnosticAccuracy: 100, evidenceQuality: 100, efficiency: 100, serviceImpact: 100, safetyCompliance: 100 } }),
      fixtureSession({ id: 'b', faultDomains: ['network'], scores: { diagnosticAccuracy: 40, evidenceQuality: 40, efficiency: 100, serviceImpact: 100, safetyCompliance: 100 } }),
    ];
    const map = competencyMap(sessions);
    expect(map[0].domain).toBe('network');
    expect(map[0].accuracy).toBe(40);
    expect(map[1].domain).toBe('optical');
    expect(map[1].accuracy).toBe(100);
  });
});
