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

/**
 * Carry an older row forward.
 *
 * The fifth axis was called `customerImpact` until it was renamed `serviceImpact`, and rows
 * written before that are already on trainees' devices. Reading one back unmigrated would
 * show a blank where their score used to be — the run happened, the number is right there,
 * and the training record would quietly lose it over a rename. So the old key is read and
 * carried across on the way out; nothing rewrites the stored row.
 */
export function migrateStored<T extends StoredSession | undefined>(session: T): T {
  if (!session?.scores) return session;
  const scores = session.scores as Record<string, number>;
  if ('serviceImpact' in scores || !('customerImpact' in scores)) return session;
  const { customerImpact, ...rest } = scores;
  return { ...session, scores: { ...rest, serviceImpact: customerImpact } as Record<AxisName, number> };
}

export async function getSession(id: string): Promise<StoredSession | undefined> {
  return migrateStored(await readOrEmpty(() => db.sessions.get(id), undefined));
}

/** The most recently started session still in progress (no diagnosis/strike yet), if any -- powers Home's "Continue". */
export async function loadUnfinished(): Promise<StoredSession | undefined> {
  const all = await readOrEmpty(() => db.sessions.orderBy('startedAt').reverse().toArray(), []);
  return migrateStored(all.find((s) => s.endedAt === null));
}

export interface SessionFilter {
  scenarioId?: string;
  tier?: number;
  limit?: number;
}

export async function listSessions(filter: SessionFilter = {}): Promise<StoredSession[]> {
  let results = await readOrEmpty(() => db.sessions.orderBy('startedAt').reverse().toArray(), []);
  if (filter.scenarioId) results = results.filter((s) => s.scenarioId === filter.scenarioId);
  if (filter.tier !== undefined) results = results.filter((s) => s.tier === filter.tier);
  if (filter.limit !== undefined) results = results.slice(0, filter.limit);
  return results.map((row) => migrateStored(row));
}

export async function getPersonalBest(scenarioId: string, seed: number): Promise<PersonalBest | undefined> {
  return readOrEmpty(() => db.personalBests.get(`${scenarioId}:${seed}`), undefined);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key);
  return row?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

/**
 * Somewhere to put a trainee id when there is nowhere to put it.
 *
 * IndexedDB is not always available: Safari and Firefox refuse it on `file://`, private
 * windows refuse it, and a browser set to block site data refuses it. That matters because
 * this app is deliberately runnable from a single file off a USB stick, which is exactly the
 * case where storage is least likely to work.
 *
 * A training record is worth having and it is not worth a bench refusing to finish over. So
 * the record degrades and the work does not: the run is scored and shown, and only the
 * writing-down is lost. Anything else would mean a trainee doing everything right and being
 * told the session failed, which teaches nothing except not to trust the tool.
 */
let ephemeralTraineeId: string | null = null;

/**
 * Read from the database, or hand back the empty answer.
 *
 * The write side already degrades (see below). Reads have to as well, and for a sharper
 * reason: a read runs while a screen is rendering, so a rejected one takes the screen with it.
 * The training record with nothing in it is a true and useful thing to show when there is no
 * database to read; a blank page where the record should be is not.
 */
async function readOrEmpty<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.warn('[persistence] could not read stored history; showing none.', error);
    return fallback;
  }
}

/** The local trainee id, created once on first launch and reused thereafter. */
export async function getOrCreateTraineeId(): Promise<string> {
  try {
    const existing = await getSetting<string>('traineeId');
    if (existing) return existing;
    const id = crypto.randomUUID();
    await setSetting('traineeId', id);
    return id;
  } catch (error) {
    console.warn('[persistence] no durable storage; this session is not being recorded.', error);
    ephemeralTraineeId ??= crypto.randomUUID();
    return ephemeralTraineeId;
  }
}

/**
 * Bench work is recorded against the same trainee as a field session, so practice and
 * performance sit in one history rather than two.
 *
 * Resolves either way. See `getOrCreateTraineeId` for why a failure here is a warning rather
 * than an error: the bench has already scored the run and shown the verdict by the time this
 * is called, and there is nothing useful for the trainee to do about a storage refusal.
 */
export async function saveBenchRun(runRecord: BenchRun): Promise<void> {
  try {
    await db.benchRuns.put(runRecord);
  } catch (error) {
    console.warn('[persistence] bench run not saved; storage is unavailable.', error);
  }
}

/** Most recent first. */
export async function listBenchRuns(limit = 50): Promise<BenchRun[]> {
  const all = await readOrEmpty(() => db.benchRuns.toArray(), []);
  return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
