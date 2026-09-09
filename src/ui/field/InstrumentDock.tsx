import { lazy, Suspense, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DockNavigation } from './dockNavigation';
import { DockBar } from './DockBar';
import { ToolShelf } from '../truck/ToolShelf';
import { presentTool, pushPlace, type DockPlace, type TabId, type ToolPresentation } from './navigation';
import type { UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { OtdrPanel } from '../otdr/OtdrPanel';
import { PowerMeter } from '../meters/PowerMeter';
import { Vfl } from '../meters/Vfl';
import { Scope } from '../meters/Scope';
import { Terminal } from '../terminal/Terminal';
import { ViewportHost, type ViewportDef } from '../viewport/ViewportHost';
import { useViewportState, writeViewportState } from '../viewport/viewportStore';
import { TeachingRail } from './TeachingRail';
import { Phone } from './Phone';
import { PhoneSlab } from './PhoneSlab';
import { LaptopShell } from './LaptopShell';
import { Records } from './Records';
import { Diagnose, type DiagnosePrefill } from './Diagnose';
import { Excavate, excavateAvailable } from './Excavate';
import { pendingComms } from '../../session/comms';

export type { TabId } from './navigation';

const MapViewport = lazy(() => import('../map/MapViewport').then((m) => ({ default: m.MapViewport })));

export function InstrumentDock({ ui, dispatch, initialTab = 'map' }: { ui: UiSessionState; dispatch(intent: Intent): void; initialTab?: TabId }) {
  const location = useLocation();
  const navigate = useNavigate();
  const runKey = `${ui.meta.scenarioId}:${ui.meta.seed}`;
  const entry = location.state?.fiberDock as { runKey: string; stack: DockPlace[] } | undefined;
  const stack = entry?.runKey === runKey && entry.stack.length ? entry.stack : [{ tab: initialTab, presentation: 'raised' } satisfies DockPlace];
  const place = stack[stack.length - 1]!;
  const tab = place.tab;
  const [, saveStack] = useViewportState<DockPlace[]>('dock.stack', stack);
  useEffect(() => saveStack(stack), [location.key]);
  const go = (next: DockPlace) => {
    const nextStack = pushPlace(stack, next);
    if (nextStack === stack) return;
    navigate(`${location.pathname}${location.search}`, { state: { ...location.state, fiberDock: { runKey, stack: nextStack } } });
  };
  const setTab = (id: TabId) => go({ tab: id, presentation: 'raised' });
  const present = (presentation: ToolPresentation) => {
    if (presentation === 'enlarged') { go({ tab, presentation }); return; }
    // Lowering/raising is a view change, so repeated gestures never lengthen Back.
    const nextStack = presentTool(stack, presentation);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: { ...location.state, fiberDock: { runKey, stack: nextStack } } });
  };
  const back = () => stack.length > 1 ? navigate(-1) : setTab('map');
  const [prefill, setPrefill] = useViewportState<DiagnosePrefill | null>('diagnose.prefill', null);
  // The badge counts what is actually waiting on an answer. Counting the NOC ticket rows
  // instead made it a constant, and a number that never changes is not a notification.
  const waiting = pendingComms(ui.commsEvents, ui.clockSeconds, ui.commsHandled).length;

  const viewports: Array<ViewportDef<TabId>> = [
    {
      id: 'map',
      // The print is SVG, so it costs nothing to leave mounted: it keeps its sheet and its
      // selection while you go and take a reading, and comes back exactly as you left it.
      label: 'Print',
      policy: 'keep-alive',
      render: () => (
        <Suspense fallback={<div style={{ padding: 16, color: 'var(--muted)' }}>Loading print…</div>}>
          <MapViewport ui={ui} dispatch={dispatch} />
        </Suspense>
      ),
    },
    { id: 'shelf', label: 'Tool shelf', policy: 'keep-alive', render: () => <ToolShelf ui={ui} dispatch={dispatch} onOpen={setTab} /> },
    {
      id: 'otdr',
      label: 'OTDR',
      policy: 'unmount',
      render: () => (
        <OtdrPanel
          ui={ui}
          dispatch={dispatch}
          onSendToDiagnosis={(p) => {
            setPrefill(p);
            setTab('diagnose');
          }}
        />
      ),
    },
    // Power, VFL and Scope each hold a 2D canvas while active (the scope's end face, the
    // meter's needle), so they unmount on the way out rather than idling in the DOM.
    { id: 'power-meter', label: 'Power', policy: 'unmount', render: () => <PowerMeter ui={ui} dispatch={dispatch} /> },
    { id: 'vfl', label: 'VFL', policy: 'unmount', render: () => <Vfl ui={ui} dispatch={dispatch} /> },
    { id: 'scope', label: 'Scope', policy: 'unmount', render: () => <Scope ui={ui} dispatch={dispatch} /> },
    // Console, records and the work order are three apps on one machine, so they share its
    // shell — open on the tailgate, rather than three unrelated tabs.
    {
      id: 'terminal',
      label: 'Terminal',
      policy: 'keep-alive',
      render: () => (
        <LaptopShell title="Console">
          <Terminal ui={ui} dispatch={dispatch} />
        </LaptopShell>
      ),
    },
    {
      id: 'phone',
      label: 'Phone',
      policy: 'keep-alive',
      // Held, not tabbed: a slab you raise and lower with the same gesture as the instruments.
      render: () => (
        <PhoneSlab clockSeconds={ui.clockSeconds} startTime={ui.world.environment.timeOfDay} badge={waiting}>
          <Phone ui={ui} dispatch={dispatch} />
        </PhoneSlab>
      ),
    },
    {
      id: 'records',
      label: 'Records',
      policy: 'keep-alive',
      render: () => (
        <LaptopShell title="Plant records">
          <Records ui={ui} dispatch={dispatch} />
        </LaptopShell>
      ),
    },
    {
      id: 'diagnose',
      label: 'Diagnose',
      policy: 'keep-alive',
      render: () => (
        <LaptopShell title="Work order">
          <Diagnose ui={ui} dispatch={dispatch} prefill={prefill} />
        </LaptopShell>
      ),
    },
  ];
  if (excavateAvailable(ui)) viewports.push({ id: 'excavate', label: 'Excavate', policy: 'keep-alive', render: () => <Excavate ui={ui} dispatch={dispatch} /> });

  return (
    <DockNavigation.Provider value={{ presentation: place.presentation, present, back }}>
      {(stack.length > 1 || tab !== 'map') && (
        <div className="dock-back"><button type="button" onClick={back}>← Back</button><span>{viewports.find((v) => v.id === tab)?.label}{place.presentation !== 'raised' ? ` · ${place.presentation}` : ''}</span></div>
      )}
      {/* Tier 1 and 2 guidance. "Show me where" puts the object under your finger on the
          print, on the tightest sheet, without moving the truck or spending simulated time. */}
      <TeachingRail
        ui={ui}
        onShow={(nodeId) => {
          writeViewportState('map.selected', nodeId);
          writeViewportState('map.zoom', 'site');
          setTab('map');
        }}
      />
      <ViewportHost<TabId> viewports={viewports} active={tab} onActivate={setTab} nav={<DockBar active={tab} onGo={setTab} phoneBadge={waiting} />} />
    </DockNavigation.Provider>
  );
}
