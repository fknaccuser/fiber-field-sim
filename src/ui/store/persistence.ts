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
  traineeIdPromise = null;
  ephemeralTraineeId = null;
}

/** Test-only: the live database, so a test can make a table stop answering. */
export function _db(): FiberSimDb {
  return db;
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
  await settle(
    async () => {
      await db.sessions.put(stored);

      if (report) {
        const key = `${session.meta.scenarioId}:${session.meta.seed}`;
        const existing = await db.personalBests.get(key);
        if (!existing || report.total > existing.total || (report.total === existing.total && session.clockSeconds < existing.simulatedSeconds)) {
          await db.personalBests.put({ key, sessionId: identity.id, total: report.total, simulatedSeconds: session.clockSeconds });
        }
      }
    },
    undefined,
    'session not written; the score stands but the record does not',
  );
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
  // On the short deadline: the field session will not paint until this answers.
  const all = await settle(
    () => db.sessions.orderBy('startedAt').reverse().toArray(),
    [] as StoredSession[],
    'could not check for an unfinished run; starting fresh',
    BLOCKING_READ_TIMEOUT_MS,
  );
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
  return settle(read, fallback, 'could not read stored history; showing none');
}

/**
 * How long to wait for the database before deciding there isn't one.
 *
 * Long enough that a cold database on a busy phone is never cut off -- an open plus a
 * first read is tens of milliseconds warm and a few hundred on the worst hardware worth
 * supporting. Short enough that a trainee is not left looking at a spinner wondering
 * whether the app is broken, because from where they are standing it is.
 */
export const STORAGE_TIMEOUT_MS = 4000;

/**
 * The deadline for a read that a screen is waiting on.
 *
 * Much shorter, because the cost of the two outcomes is not symmetric. Waiting too long
 * shows a trainee a spinner on an app that is not coming back -- four seconds of that is
 * indistinguishable from broken, which is precisely the report that led here. Giving up
 * too early costs them the offer to resume a run they can start again in one tap. A resume
 * lookup against a database that works is a few milliseconds warm and well under a second
 * on the worst hardware worth supporting, so a second and a half is not a device being
 * slow. It is a device that is not going to answer.
 */
export const BLOCKING_READ_TIMEOUT_MS = 1500;

/** Test seam: run one call against a shorter deadline than a person would ever wait. */
let timeoutMs = STORAGE_TIMEOUT_MS;
export function _useStorageTimeout(ms: number): void {
  timeoutMs = ms;
}

/**
 * Run a database call, or give up on it.
 *
 * Every other guard in this module is a `try`/`catch`, and a `catch` is the wrong tool for
 * the failure that actually shipped. Storage does not only refuse -- sometimes it does not
 * answer. `indexedDB.open()` is specified to fire `blocked` and then simply wait, and in a
 * storage-restricted context (an in-app browser, a private window, a frame denied storage
 * access) the request can stay pending for the life of the page. Nothing rejects, so
 * nothing is caught, and any screen awaiting the call waits with it.
 *
 * That is not hypothetical: it is what put the field session on `Loading scenario...`
 * forever, on a deployed build, with an empty console -- because the session start was
 * behind an await on a resume lookup that never came back.
 *
 * So a deadline, not a `catch`. Whatever is stored is a convenience -- which run to resume,
 * which trainee id to file the record under. None of it is worth the app for. When the
 * database does not answer in time it is treated as empty, exactly as if it had refused,
 * and the session starts fresh.
 */
async function settle<T>(work: () => Promise<T>, fallback: T, what: string, deadlineMs?: number): Promise<T> {
  const ms = Math.min(deadlineMs ?? timeoutMs, timeoutMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`[persistence] storage did not answer in ${ms}ms; ${what}.`);
          resolve(fallback);
        }, ms);
      }),
    ]);
  } catch (error) {
    console.warn(`[persistence] ${what}.`, error);
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

/** The local trainee id, created once on first launch and reused thereafter. */
/**
 * Resolved once per page, then reused.
 *
 * Two reasons, and the second is the one that bit. Every bench and every session start
 * asked the database for the same unchanging string, which is wasteful but harmless. The
 * harm was that a *session start blocks on it* -- the world is already built and ready to
 * draw, and the screen was being held back for a lookup of an id that is not needed until
 * something is written down. On a database that never answers, that was four seconds of
 * `Loading scenario...` stacked on top of the resume lookup's own wait.
 *
 * Memoising collapses that to one lookup for the life of the page, and puts it on the
 * short deadline, because it is on the path to first paint.
 */
let traineeIdPromise: Promise<string> | null = null;

export async function getOrCreateTraineeId(): Promise<string> {
  traineeIdPromise ??= (async () => {
    const stored = await settle(
      async () => {
        const existing = await getSetting<string>('traineeId');
        if (existing) return existing;
        const id = crypto.randomUUID();
        await setSetting('traineeId', id);
        return id;
      },
      null,
      'no durable storage; this session is not being recorded',
      BLOCKING_READ_TIMEOUT_MS,
    );
    if (stored) return stored;
    ephemeralTraineeId ??= crypto.randomUUID();
    return ephemeralTraineeId;
  })();
  return traineeIdPromise;
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
  await settle(() => db.benchRuns.put(runRecord), undefined, 'bench run not saved; storage is unavailable');
}

/** Most recent first. */
export async function listBenchRuns(limit = 50): Promise<BenchRun[]> {
  const all = await readOrEmpty(() => db.benchRuns.toArray(), []);
  return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
