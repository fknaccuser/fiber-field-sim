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

// three + R3F + drei are only ever needed by these two; keep them out of the main chunk.
const WorldViewport = lazy(() => import('../scene/WorldViewport').then((m) => ({ default: m.WorldViewport })));
const MapViewport = lazy(() => import('../map/MapViewport').then((m) => ({ default: m.MapViewport })));

export function InstrumentDock({ ui, dispatch, initialTab = 'world' }: { ui: UiSessionState; dispatch(intent: Intent): void; initialTab?: TabId }) {
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
  const back = () => stack.length > 1 ? navigate(-1) : setTab('world');
  const [prefill, setPrefill] = useViewportState<DiagnosePrefill | null>('diagnose.prefill', null);
  // The badge counts what is actually waiting on an answer. Counting the customer reports
  // instead made it a constant, and a number that never changes is not a notification.
  const waiting = pendingComms(ui.commsEvents, ui.clockSeconds, ui.commsHandled).length;

  const viewports: Array<ViewportDef<TabId>> = [
    {
      id: 'world',
      label: 'World',
      policy: 'unmount',
      render: () => (
        <Suspense fallback={<div style={{ padding: 16, color: 'var(--muted)' }}>Loading the plant…</div>}>
          <WorldViewport ui={ui} dispatch={dispatch} />
        </Suspense>
      ),
    },
    {
      id: 'map',
      // The print is SVG, not WebGL. It holds no GL context, so it can stay mounted and
      // keep its sheet, pan and selection while you go and take a reading.
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
    // Power, VFL and Scope each render the equipment behind the held device, so each owns a
    // WebGL context while active and must release it on the way out.
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
      {(stack.length > 1 || tab !== 'world') && (
        <div className="dock-back"><button type="button" onClick={back}>← Back</button><span>{viewports.find((v) => v.id === tab)?.label}{place.presentation !== 'raised' ? ` · ${place.presentation}` : ''}</span></div>
      )}
      {/* Tier 1 and 2 guidance. "Show me where" focuses the object in the world without
          moving the truck or spending simulated time. */}
      <TeachingRail
        ui={ui}
        onShow={(nodeId) => {
          writeViewportState('world.selected', nodeId);
          writeViewportState('world.mode', 'equipment');
          writeViewportState('world.card', true);
          writeViewportState('world.list', false);
          setTab('world');
        }}
      />
      <ViewportHost<TabId> viewports={viewports} active={tab} onActivate={setTab} nav={<DockBar active={tab} onGo={setTab} phoneBadge={waiting} />} />
    </DockNavigation.Provider>
  );
}
