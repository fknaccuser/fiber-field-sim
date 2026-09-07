import { useEffect, useRef } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { resolveRunRoute } from '../app/routeResolution';
import { scenarioExists } from '../../scenarios';
import { DEFAULT_ROLE, isRole } from '../../session/roles';
import { parsePrep } from '../prep/prepChecklist';
import type { PerformResult } from '../../session/runner';
import { loadUnfinished } from '../store/persistence';
import { resumeSession, useSessionStore } from '../store/sessionStore';
import { clearViewportState } from '../viewport/viewportStore';
import { LocationBar } from '../field/LocationBar';
import { InstrumentDock } from '../field/InstrumentDock';

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
    case 'customer-contact':
      return `Called ${result.report.customerId}`;
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
    void (async () => {
      const existing = await loadUnfinished();
      if (existing && existing.scenarioId === resolvedScenarioId && existing.seed === resolvedSeed) {
        const session = resumeSession(existing);
        store.restore(session, { id: existing.id, traineeId: existing.traineeId, startedAt: existing.startedAt });
      } else {
        const roleParam = searchParams.get('role');
        const role = isRole(roleParam) ? roleParam : DEFAULT_ROLE;
        store.start(resolvedScenarioId, resolvedSeed, role, parsePrep(searchParams.get('prep'), role));
      }
    })();
  }, [resolvedScenarioId, resolvedSeed, store.start, store.restore]);

  if (needsSeedRedirect) {
    return <Navigate to={`/run/${scenarioId}?seed=${pinnedSeedRef.current}`} replace />;
  }

  if (!resolution.ok) {
    return <Navigate to={`/scenarios?error=${encodeURIComponent(resolution.error)}`} replace />;
  }

  if (!store.ui) {
    return <div style={{ padding: 16, color: 'var(--muted)' }}>Loading scenario…</div>;
  }

  const toast = store.lastResult ? describeResult(store.lastResult) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <LocationBar ui={store.ui} dispatch={store.dispatch} toast={toast} />
      <InstrumentDock ui={store.ui} dispatch={store.dispatch} />
    </div>
  );
}
