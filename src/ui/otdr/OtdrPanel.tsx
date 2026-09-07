import { useEffect, useMemo, useState } from 'react';
import type { DetectedEvent, OtdrSettings } from '../../instruments/otdr';
import { cursorReadout, defaultViewport, type Viewport } from '../../instruments/otdr/viewport';
import { distanceToSpanPosition } from '../../instruments/shared/opticalPath';
import type { WorldState } from '../../world';
import type { UiActionEvent, UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { SoftKey } from '../components/SoftKey';
import { HeldDevice } from '../instrument/HeldDevice';
import { useDockNavigation } from '../field/dockNavigation';
import { blocker, INITIAL_HELD, type HeldState } from '../instrument/deviceState';
import { useViewportState } from '../viewport/viewportStore';
import { AccessPicker, type AccessSelection } from './AccessPicker';
import { EventTable } from './EventTable';
import { OtdrControls } from './OtdrControls';
import { OtdrTraceCanvas } from './OtdrTraceCanvas';

const CANVAS_THEME = {
  background: 'var(--panel)',
  grid: '#1f2a38',
  trace: '#ffb000',
  cursorA: '#3ddc97',
  cursorB: '#5ab0ff',
  marker: '#ff5c5c',
  text: '#d7dee8',
};

function defaultSettings(network: UiSessionState['profiles']['network'], instrument: UiSessionState['profiles']['otdrInstrument']): OtdrSettings {
  const wavelengthNm = network.wavelengths.otdrTestWavelengthsNm[0] ?? 1550;
  const key = wavelengthNm <= 1400 ? '1310' : wavelengthNm <= 1600 ? '1550' : '1625';
  return {
    wavelengthNm,
    pulseWidthNs: Math.max(instrument.pulseWidthsNsRange.minNs, network.otdrPulseWidthsNs[0] ?? 100),
    rangeMeters: 5000,
    iorSetting: network.iorDefault[key] ?? 1.4682,
    averagingSeconds: instrument.averagingSecondsOptions[0] ?? 15,
    launchCableMeters: 0,
    receiveCableMeters: 0,
  };
}

export function OtdrPanel({
  ui,
  dispatch,
  onSendToDiagnosis,
}: {
  ui: UiSessionState;
  dispatch(intent: Intent): void;
  onSendToDiagnosis(prefill: { spanId: string; positionMeters: number }): void;
}) {
  const { network, otdrInstrument } = ui.profiles;
  const [settings, setSettings] = useViewportState<OtdrSettings>('otdr.settings', () => defaultSettings(network, otdrInstrument));
  const [access, setAccess] = useViewportState<AccessSelection | null>('otdr.access', null);
  const [cursors, setCursors] = useViewportState<{ a: number; b: number }>('otdr.cursors', { a: 0, b: 100 });
  const [activeCursor, setActiveCursor] = useViewportState<'a' | 'b'>('otdr.activeCursor', 'a');
  const [selectedEvent, setSelectedEvent] = useState<DetectedEvent | null>(null);
  const [viewport, setViewport] = useViewportState<Viewport | null>('otdr.viewport', null);
  const [acquiring, setAcquiring] = useState(false);
  // The trace can be blown up to the full viewport for analysis, then folded back into the
  // held device -- the same screen either way, so cursors and zoom survive the switch.
  const navigation = useDockNavigation();
  const expanded = navigation.presentation === 'enlarged';
  const setExpanded = (value: boolean) => value ? navigation.present('enlarged') : navigation.back();
  const [held, setHeld] = useViewportState<HeldState>('device.otdr', INITIAL_HELD);
  const block = blocker(held, true);

  const otdrActions = ui.log.filter((a): a is Extract<UiActionEvent, { type: 'otdr-shot' }> => a.type === 'otdr-shot');
  const lastAction = otdrActions[otdrActions.length - 1] ?? null;
  const blob = lastAction ? ui.blobs[lastAction.traceRef] : undefined;
  const result = !acquiring && blob && typeof blob === 'object' && 'samples' in blob ? blob : null;

  const activeViewport = useMemo(() => viewport ?? (result ? defaultViewport(result) : { xMinMeters: 0, xMaxMeters: settings.rangeMeters, yMinDb: -40, yMaxDb: 3 }), [viewport, result, settings.rangeMeters]);

  useEffect(() => {
    setViewport(null);
  }, [lastAction?.id]);

  const canStart = access !== null && !acquiring && block === null;

  const start = () => {
    if (!access) return;
    dispatch({ type: 'otdr-shot', access: { accessNodeId: ui.locationNodeId, launchSpanId: access.launchSpanId, strand: access.strand }, settings });
    setAcquiring(true);
    setSelectedEvent(null);
    window.setTimeout(() => setAcquiring(false), Math.min(settings.averagingSeconds, 3) * 1000);
  };

  const readout = result ? cursorReadout(result, cursors.a, cursors.b) : null;

  const sendEventToDiagnosis = (event: DetectedEvent) => {
    if (!access) return;
    const found = distanceToSpanPosition(
      // `ui.world` is a redacted WorldState (the answer key stripped); distanceToSpanPosition
      // only ever walks topology, so this is a safe structural cast.
      ui.world as WorldState,
      network,
      { accessNodeId: ui.locationNodeId, launchSpanId: access.launchSpanId, strand: access.strand },
      event.distanceMeters,
      settings.iorSetting,
      settings.wavelengthNm,
    );
    if (found) onSendToDiagnosis(found);
  };

  const screen = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', minHeight: 0, padding: expanded ? 0 : 8 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <AccessPicker locationNodeId={ui.locationNodeId} spans={ui.world.topology.spans} selection={access} onChange={setAccess} />
        <OtdrControls network={network} instrument={otdrInstrument} truckInventory={ui.world.truckInventory} settings={settings} onChange={setSettings} />
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 8 }}>
        <div style={{ flex: 1, minHeight: 220, position: 'relative' }} className="bezel">
          <OtdrTraceCanvas
            result={result}
            viewport={activeViewport}
            cursors={cursors}
            activeCursor={activeCursor}
            showEventMarkers
            onCursorMove={(which, meters) => setCursors((c) => ({ ...c, [which]: meters }))}
            onViewportChange={setViewport}
            onEventSelect={setSelectedEvent}
            theme={CANVAS_THEME}
          />
          {acquiring && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(11,15,20,0.6)', color: 'var(--trace)', fontSize: 13 }}>
              Acquiring trace…
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SoftKey label="Start" onClick={start} disabled={!canStart} />
          <SoftKey label={`Cursor ${activeCursor.toUpperCase()}`} onClick={() => setActiveCursor((c) => (c === 'a' ? 'b' : 'a'))} />
          <SoftKey label="Zoom out" onClick={() => setViewport(null)} />
          <SoftKey label={expanded ? 'Back to device' : 'Enlarge'} active={expanded} onClick={() => setExpanded(!expanded)} />
        </div>
      </div>

      {readout && (
        <div className="mono" style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>ΔL: {readout.deltaMeters.toFixed(1)} m</span>
          <span>Δdb: {readout.deltaDb.toFixed(2)} dB</span>
          <span>2-pt loss: {readout.twoPointLossDb.toFixed(2)} dB</span>
          {readout.slopeDbPerKm !== null && <span>Slope: {readout.slopeDbPerKm.toFixed(3)} dB/km</span>}
        </div>
      )}

      {result && (
        <>
          <EventTable events={result.events} selectedIndex={selectedEvent?.index ?? null} onSelect={setSelectedEvent} />
          {selectedEvent && (
            <SoftKey label={`Send event #${selectedEvent.index} to diagnosis`} onClick={() => sendEventToDiagnosis(selectedEvent)} />
          )}
        </>
      )}

      {lastAction && lastAction.violations.length > 0 && (
        <div style={{ color: 'var(--led-alarm)', fontSize: 12 }}>
          {lastAction.violations.map((v, i) => (
            <div key={i}>⚠ In-band test on live PON service ({v.wavelengthNm} nm).</div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <HeldDevice
      ui={ui}
      dispatch={dispatch}
      state={held}
      name="OTDR"
      status={acquiring ? 'Acquiring…' : lastAction ? 'Trace stored' : undefined}
      model="MX-730"
      form="tablet"
      leadLabel="launch cable"
      onStateChange={setHeld}
      bootLines={['FiberOps MX-730', 'OTDR / PON metro tester', 'laser class 1M', 'self-test ... pass']}
      softKeys={[
        { label: 'Start', onClick: start, disabled: !canStart },
        { label: `Cursor ${activeCursor.toUpperCase()}`, onClick: () => setActiveCursor((c) => (c === 'a' ? 'b' : 'a')) },
        { label: 'Enlarge', onClick: () => setExpanded(true) },
      ]}
    >
      {screen}
    </HeldDevice>
  );
}
