import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { resolveRunRoute } from '../app/routeResolution';
import { scenarioExists } from '../../scenarios';
import { DEFAULT_ROLE, isRole } from '../../session/roles';
import { parsePrep } from '../prep/prepChecklist';
import type { PerformResult } from '../../session/runner';
import { getOrCreateTraineeId, loadUnfinished } from '../store/persistence';
import { resumeSession, useSessionStore } from '../store/sessionStore';
import { clearViewportState } from '../viewport/viewportStore';
import { LocationBar } from '../field/LocationBar';
import { InstrumentDock } from '../field/InstrumentDock';

/**
 * How long the waiting screen waits before admitting something is wrong.
 *
 * Well past every deadline underneath it (a blocked storage read gives up in 1.5s), so a
 * device that is merely slow is never accused. Short enough that a trainee is not left
 * guessing.
 */
const WATCHDOG_MS = 8000;

function describeResult(result: PerformResult): string {
  switch (result.type) {
    case 'otdr-shot':
      return `OTDR: ${result.result.events.length} event(s), ${result.result.simulatedSecondsElapsed}s`;
    case 'power-meter':
      return `Power meter: ${result.dbm === null ? 'no signal' : `${result.dbm.toFixed(1)} dBm`}`;
    case 'comms':
      return 'Replied';
    case 'clean-probe':
      return result.cleaned ? 'Probe tip cleaned' : (result.reason ?? 'Nothing to clean');
    case 'vfl':
      return `VFL: ${result.leaks.length} leak(s) found`;
    case 'scope':
      return `Scope: ${result.grade.toUpperCase()}`;
    case 'cli':
      return result.result.recognized ? 'CLI: command executed' : 'CLI: syntax error';
    case 'truck-roll':
      return 'Truck rolled';
    case 'records':
      return `Records: ${result.records.length} found`;
    case 'noc-contact':
      return `NOC: ${result.reports.length} premise(s) on the ticket`;
    case 'hint':
      return result.text ? 'Hint received' : 'No hint available';
    case 'excavate':
      return result.strike ? '⚠ Locate strike!' : 'Dig complete, no strike';
    case 'diagnosis':
      return `Diagnosis submitted — total ${Math.round(result.report.total)}`;
    case 'refused':
      return `Refused: ${result.reason}`;
  }
}

export function FieldSession() {
  const { scenarioId } = useParams();
  const [searchParams] = useSearchParams();
  const store = useSessionStore();
  const startedKeyRef = useRef<string | null>(null);
  // This screen used to have exactly two states: started, and waiting. Waiting had no way
  // out, so anything that stopped the start from finishing left `Loading scenario...` on
  // the screen for good -- which is what a storage call that never settled did on a
  // deployed build. The deadline in `persistence` is the fix for that particular hang;
  // this is the guard that keeps the *next* one from looking identical.
  const [startFailed, setStartFailed] = useState<string | null>(null);
  // A last resort, for a cause nobody has thought of yet. Every known way this screen could
  // stall now has a deadline behind it, but "known" is doing a lot of work in that sentence:
  // the stall that shipped was a promise that never settled, and there is no reason to think
  // it is the only one. So the waiting state itself is on a clock. If the session has not
  // arrived long after any honest slow path would have finished, the screen says so and
  // offers a way out, rather than spinning and letting the trainee decide the app is broken.
  const [tooLong, setTooLong] = useState(false);
  // `resolveRunRoute` picks a fresh random seed on every call when the URL has none --
  // calling it directly in render would repick (and restart the session) on every
  // render. Pin one seed the first time this component instance ever runs with no seed
  // present; if the URL is missing one, redirect to one that carries it explicitly, so
  // every later render (and a reload) reads the same, stable seed instead.
  const pinnedSeedRef = useRef<number | null>(null);
  if (pinnedSeedRef.current === null) pinnedSeedRef.current = 1 + Math.floor(Math.random() * 999_999);

  const seedParam = searchParams.get('seed');
  const needsSeedRedirect = seedParam === null && !!scenarioId;

  const resolution = resolveRunRoute(scenarioId, seedParam ?? String(pinnedSeedRef.current), scenarioExists);
  const resolvedScenarioId = !needsSeedRedirect && resolution.ok ? resolution.params.scenarioId : null;
  const resolvedSeed = !needsSeedRedirect && resolution.ok ? resolution.params.seed : null;

  useEffect(() => {
    if (resolvedScenarioId === null || resolvedSeed === null) return;
    const key = `${resolvedScenarioId}:${resolvedSeed}`;
    if (startedKeyRef.current === key) return;
    startedKeyRef.current = key;
    clearViewportState();
    const startFresh = () => {
      const roleParam = searchParams.get('role');
      const role = isRole(roleParam) ? roleParam : DEFAULT_ROLE;
      store.start(resolvedScenarioId, resolvedSeed, role, parsePrep(searchParams.get('prep'), role));
    };
    void (async () => {
      try {
        // Warm the trainee id alongside the resume lookup rather than after it. `start`
        // awaits the same (memoised) promise, so kicking it off here means the two storage
        // calls overlap instead of stacking their deadlines back to back.
        void getOrCreateTraineeId();
        // Resuming is a convenience. Failing to look it up is not a reason to have no
        // session, so a bad lookup falls through to a fresh one rather than stopping here.
        let existing: Awaited<ReturnType<typeof loadUnfinished>>;
        try {
          existing = await loadUnfinished();
        } catch (error) {
          console.warn('[session] could not check for an unfinished run; starting fresh.', error);
          existing = undefined;
        }
        if (existing && existing.scenarioId === resolvedScenarioId && existing.seed === resolvedSeed) {
          const session = resumeSession(existing);
          store.restore(session, { id: existing.id, traineeId: existing.traineeId, startedAt: existing.startedAt });
        } else {
          startFresh();
        }
      } catch (error) {
        // Building the world is the one thing here with no fallback worth inventing. Say
        // so, on the screen, instead of spinning.
        console.error('[session] could not start the scenario.', error);
        setStartFailed(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [resolvedScenarioId, resolvedSeed, store.start, store.restore]);

  const waiting = !store.ui && startFailed === null && resolvedScenarioId !== null;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setTooLong(true), WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  if (needsSeedRedirect) {
    return <Navigate to={`/run/${scenarioId}?seed=${pinnedSeedRef.current}`} replace />;
  }

  if (!resolution.ok) {
    return <Navigate to={`/scenarios?error=${encodeURIComponent(resolution.error)}`} replace />;
  }

  if (startFailed !== null) {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ color: 'var(--orange)', fontWeight: 600 }}>This scenario would not start.</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.6 }}>{startFailed}</div>
        <a href="/scenarios" style={{ fontSize: 13, color: 'var(--cyan)' }}>← Pick another scenario</a>
      </div>
    );
  }

  if (!store.ui) {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ color: 'var(--muted)' }}>Loading scenario…</div>
        {tooLong && (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--orange)', lineHeight: 1.6 }}>
              This is taking longer than it should. The scenario itself is built into the app, so
              this is not a slow download — something on this device is not answering.
            </div>
            <a href={`/run/${scenarioId}?seed=${resolvedSeed}`} style={{ fontSize: 13, color: 'var(--cyan)' }}>
              Reload this run
            </a>
            <a href="/scenarios" style={{ fontSize: 13, color: 'var(--cyan)' }}>← Pick another scenario</a>
          </>
        )}
      </div>
    );
  }

  const toast = store.lastResult ? describeResult(store.lastResult) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <LocationBar ui={store.ui} dispatch={store.dispatch} toast={toast} />
      <InstrumentDock ui={store.ui} dispatch={store.dispatch} />
    </div>
  );
}
