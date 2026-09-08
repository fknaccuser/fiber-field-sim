/**
 * Local-only persistence (Dexie/IndexedDB). Sessions are append-only records: the same
 * row is updated in place while a session is in progress, never duplicated. Large blobs
 * (`SessionState.blobs`, OTDR trace samples) are never stored -- a replay re-runs `trace()`
 * deterministically from the world + settings, so re-deriving it is both cheap and exact.
 *
 * This module (like the rest of `ui/store`) is allowed to see a full, unredacted
 * `SessionState` -- computing `faultDomains`/`matchedFaultKinds` for the competency map
 * genuinely needs the true fault list. UI *components* never call this module directly;
 * only `sessionStore.ts` does.
 */
import Dexie, { type Table } from 'dexie';
import { FAULT_TAXONOMY_BY_ID } from '../../world';
import type { FaultDomain } from '../../world';
import { stripGroundTruth } from '../../session/runner';
import type { UiActionEvent } from '../../session/runner';
import type { SessionState } from '../../session/types';
import type { AxisName, ScoreReport } from '../../scoring/types';
import type { BenchRun } from '../../operations/benchRecord';

export interface StoredSession {
  id: string;
  traineeId: string;
  scenarioId: string;
  seed: number;
  tier: number;
  startedAt: string;
  endedAt: string | null;
  endedBy: 'diagnosis' | 'safety-strike' | null;
  simulatedSeconds: number;
  scores: Record<AxisName, number> | null;
  total: number | null;
  faultDomains: FaultDomain[];
  matchedFaultKinds: string[];
  missedFaultKinds: string[];
  falsePositives: number;
  actionCount: number;
  log: UiActionEvent[];
  report: ScoreReport | null;
  schemaVersion: 1;
}

export interface StoredSetting {
  key: string;
  value: unknown;
}

export interface PersonalBest {
  /** `${scenarioId}:${seed}` */
  key: string;
  sessionId: string;
  total: number;
  simulatedSeconds: number;
}

class FiberSimDb extends Dexie {
  sessions!: Table<StoredSession, string>;
  settings!: Table<StoredSetting, string>;
  personalBests!: Table<PersonalBest, string>;
  benchRuns!: Table<BenchRun, string>;
  constructor(name = 'fiber-sim') {
    super(name);
    this.version(1).stores({
      sessions: 'id, traineeId, scenarioId, seed, tier, startedAt, endedAt, total',
      settings: 'key',
      personalBests: 'key, total',
    });
    // v1 is left exactly as it shipped. Anyone already carrying history keeps it; Dexie
    // adds the new table on upgrade rather than rebuilding the database.
    this.version(2).stores({
      benchRuns: 'id, traineeId, kind, at, score',
    });
  }
}

let db = new FiberSimDb();

/** Test-only: point at a fresh, isolated database instead of the shared singleton. */
export function _useDatabase(name: string): void {
  db = new FiberSimDb(name);
}

export interface SessionIdentity {
  id: string;
  traineeId: string;
  startedAt: string;
}

function faultDomainsOf(session: SessionState): FaultDomain[] {
  const trueFaults = session.initialWorld.appliedFaults.filter((f) => !f.isRedHerring);
  const domains = new Set<FaultDomain>();
  for (const fault of trueFaults) {
    const domain = FAULT_TAXONOMY_BY_ID[fault.kind]?.domain;
    if (domain) domains.add(domain);
  }
  return Array.from(domains);
}

function matchedAndMissedKinds(session: SessionState, report: ScoreReport | null): { matched: string[]; missed: string[] } {
  if (!report) return { matched: [], missed: [] };
  const trueFaults = session.initialWorld.appliedFaults.filter((f) => !f.isRedHerring);
  const matched = trueFaults.filter((f) => report.matchedFaultIds.includes(f.instanceId)).map((f) => f.kind);
  const missed = trueFaults.filter((f) => report.missedFaultIds.includes(f.instanceId)).map((f) => f.kind);
  return { matched, missed };
}

function toStoredSession(identity: SessionIdentity, session: SessionState, report: ScoreReport | null): StoredSession {
  const { matched, missed } = matchedAndMissedKinds(session, report);
  return {
    id: identity.id,
    traineeId: identity.traineeId,
    scenarioId: session.meta.scenarioId,
    seed: session.meta.seed,
    tier: session.meta.tier,
    startedAt: identity.startedAt,
    endedAt: session.ended ? new Date().toISOString() : null,
    endedBy: session.ended?.by ?? null,
    simulatedSeconds: session.clockSeconds,
    scores: report ? (Object.fromEntries(Object.entries(report.axes).map(([axis, s]) => [axis, s.score])) as Record<AxisName, number>) : null,
    total: report?.total ?? null,
    faultDomains: faultDomainsOf(session),
    matchedFaultKinds: matched,
    missedFaultKinds: missed,
    falsePositives: report?.falsePositiveClaims ?? 0,
    actionCount: session.log.length,
    log: session.log.map(stripGroundTruth),
    report,
    schemaVersion: 1,
  };
}

/** Upserts the session's row and, if it just finished, the scenario+seed's personal best. */
export async function saveSession(identity: SessionIdentity, session: SessionState, report: ScoreReport | null): Promise<void> {
  const stored = toStoredSession(identity, session, report);
  await db.sessions.put(stored);

  if (report) {
    const key = `${session.meta.scenarioId}:${session.meta.seed}`;
    const existing = await db.personalBests.get(key);
    if (!existing || report.total > existing.total || (report.total === existing.total && session.clockSeconds < existing.simulatedSeconds)) {
      await db.personalBests.put({ key, sessionId: identity.id, total: report.total, simulatedSeconds: session.clockSeconds });
    }
  }
}

export async function getSession(id: string): Promise<StoredSession | undefined> {
  return db.sessions.get(id);
}

/** The most recently started session still in progress (no diagnosis/strike yet), if any -- powers Home's "Continue". */
export async function loadUnfinished(): Promise<StoredSession | undefined> {
  const all = await db.sessions.orderBy('startedAt').reverse().toArray();
  return all.find((s) => s.endedAt === null);
}

export interface SessionFilter {
  scenarioId?: string;
  tier?: number;
  limit?: number;
}

export async function listSessions(filter: SessionFilter = {}): Promise<StoredSession[]> {
  let results = await db.sessions.orderBy('startedAt').reverse().toArray();
  if (filter.scenarioId) results = results.filter((s) => s.scenarioId === filter.scenarioId);
  if (filter.tier !== undefined) results = results.filter((s) => s.tier === filter.tier);
  if (filter.limit !== undefined) results = results.slice(0, filter.limit);
  return results;
}

export async function getPersonalBest(scenarioId: string, seed: number): Promise<PersonalBest | undefined> {
  return db.personalBests.get(`${scenarioId}:${seed}`);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key);
  return row?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

/** The local trainee id, created once on first launch and reused thereafter. */
export async function getOrCreateTraineeId(): Promise<string> {
  const existing = await getSetting<string>('traineeId');
  if (existing) return existing;
  const id = crypto.randomUUID();
  await setSetting('traineeId', id);
  return id;
}

/**
 * Bench work is recorded against the same trainee as a field session, so practice and
 * performance sit in one history rather than two.
 */
export async function saveBenchRun(runRecord: BenchRun): Promise<void> {
  await db.benchRuns.put(runRecord);
}

/** Most recent first. */
export async function listBenchRuns(limit = 50): Promise<BenchRun[]> {
  const all = await db.benchRuns.toArray();
  return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
