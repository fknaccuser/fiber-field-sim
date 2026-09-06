/** Pure functions over stored sessions: streaks, the competency map, and history trends. Nothing here touches Dexie -- callers fetch rows via persistence.ts and pass them in. */
import type { FaultDomain } from '../../world';
import { average } from '../../scoring/util';
import type { StoredSession } from './persistence';

export interface StreakResult {
  currentStreak: number;
  bestStreak: number;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isNextCalendarDay(a: string, b: string): boolean {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = new Date(ay, am - 1, ad);
  const db = new Date(by, bm - 1, bd);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000) === 1;
}

/** Consecutive local-calendar days with >=1 finished session. `now` is injectable for tests. */
export function computeStreak(sessions: StoredSession[], now: Date = new Date()): StreakResult {
  const activeDays = Array.from(new Set(sessions.filter((s) => s.endedAt !== null).map((s) => localDateKey(new Date(s.endedAt!))))).sort();
  if (activeDays.length === 0) return { currentStreak: 0, bestStreak: 0 };

  let bestStreak = 1;
  let run = 1;
  for (let i = 1; i < activeDays.length; i++) {
    run = isNextCalendarDay(activeDays[i - 1], activeDays[i]) ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
  }

  const activeSet = new Set(activeDays);
  let currentStreak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (activeSet.has(localDateKey(cursor))) {
    currentStreak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { currentStreak, bestStreak };
}

const ALL_DOMAINS: FaultDomain[] = ['optical', 'network', 'compliance', 'cpe'];

export interface CompetencyDomain {
  domain: FaultDomain;
  accuracy: number;
  evidence: number;
  sessionCount: number;
  faultKinds: Record<string, { matched: number; missed: number }>;
  instrumentUsage: Record<string, number>;
}

function finishedByRecency(sessions: StoredSession[]): StoredSession[] {
  return [...sessions].filter((s) => s.endedAt !== null && s.scores !== null).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

/** Per fault-domain competency over each domain's own last 10 relevant sessions (not a shared global window). Weakest domain first; a domain no session ever touched is omitted entirely. */
export function competencyMap(sessions: StoredSession[]): CompetencyDomain[] {
  const finished = finishedByRecency(sessions);

  const domains = ALL_DOMAINS.map((domain): CompetencyDomain | null => {
    const relevant = finished.filter((s) => s.faultDomains.includes(domain)).slice(0, 10);
    if (relevant.length === 0) return null;

    const faultKinds: Record<string, { matched: number; missed: number }> = {};
    const instrumentUsage: Record<string, number> = {};
    for (const s of relevant) {
      for (const kind of s.matchedFaultKinds) (faultKinds[kind] ??= { matched: 0, missed: 0 }).matched++;
      for (const kind of s.missedFaultKinds) (faultKinds[kind] ??= { matched: 0, missed: 0 }).missed++;
      for (const action of s.log) {
        if (action.type === 'otdr-shot' || action.type === 'power-meter' || action.type === 'vfl' || action.type === 'scope' || action.type === 'cli') {
          instrumentUsage[action.type] = (instrumentUsage[action.type] ?? 0) + 1;
        }
      }
    }

    return {
      domain,
      accuracy: average(relevant.map((s) => s.scores!.diagnosticAccuracy)),
      evidence: average(relevant.map((s) => s.scores!.evidenceQuality)),
      sessionCount: relevant.length,
      faultKinds,
      instrumentUsage,
    };
  });

  return domains.filter((d): d is CompetencyDomain => d !== null).sort((a, b) => a.accuracy - b.accuracy);
}

export interface TrendPoint {
  date: string;
  accuracy: number;
}

/** Per-domain diagnosticAccuracy over the last 30 finished sessions, oldest first (sparkline order). */
export function historyTrend(sessions: StoredSession[]): Partial<Record<FaultDomain, TrendPoint[]>> {
  const finished = [...sessions]
    .filter((s) => s.endedAt !== null && s.scores !== null)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .slice(-30);

  const result: Partial<Record<FaultDomain, TrendPoint[]>> = {};
  for (const domain of ALL_DOMAINS) {
    const points = finished.filter((s) => s.faultDomains.includes(domain)).map((s) => ({ date: s.startedAt, accuracy: s.scores!.diagnosticAccuracy }));
    if (points.length > 0) result[domain] = points;
  }
  return result;
}
