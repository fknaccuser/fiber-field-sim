/**
 * Dev-only harness for eyeballing the OTDR module before item 6 builds the real app
 * shell. Not linked from the normal app UI -- see main.tsx's `?dev=otdr` gate.
 */
import { useMemo, useState } from 'react';
import { createEmptyWorld } from '../../world';
import type { ActiveProfileSet, WorldState } from '../../world';
import { loadDefaultProfileSet } from '../../profiles';
import { trace } from '../../instruments/otdr';
import type { OtdrSettings, OtdrTraceResult } from '../../instruments/otdr/types';
import { defaultViewport, type Viewport } from '../../instruments/otdr/viewport';
import { OtdrTraceCanvas } from './../otdr/OtdrTraceCanvas';

const profiles = loadDefaultProfileSet();

const activeProfiles: ActiveProfileSet = {
  network: 'xgs-pon-default',
  oltVendor: 'olt-calix-e7-2',
  switchVendor: 'switch-cisco-ios',
  equipment: 'hexatronic-commscope-default',
  otdrInstrument: 'otdr-exfo-maxtester-730c',
  hostShell: 'host-windows',
  region: 'ca-south-oc-digalert',
};

function buildDemoWorld(): WorldState {
  const world = createEmptyWorld(1, activeProfiles);
  world.topology.nodes.push(
    { id: 'olt', kind: 'olt', label: 'OLT' },
    { id: 'spl', kind: 'splitter', label: 'Splitter 1x32', attributes: { splitRatio: '1x32' } },
    { id: 'term', kind: 'terminal', label: 'Terminal' },
  );
  world.topology.spans.push(
    {
      id: 'feeder',
      fromNodeId: 'olt',
      toNodeId: 'spl',
      lengthMeters: 2000,
      events: [{ id: 'c1', kind: 'connector-upc', positionMeters: 0, lossDb: 0.3, reflectanceDb: -50 }],
    },
    {
      id: 'leg',
      fromNodeId: 'spl',
      toNodeId: 'term',
      lengthMeters: 1000,
      events: [{ id: 'bend', kind: 'macrobend', positionMeters: 500, lossDbByWavelength: { '1310': 0.2, '1550': 1.5 } }],
    },
  );
  return world;
}

const theme = {
  background: '#0b0f14',
  grid: '#1f2a38',
  trace: '#ffb000',
  cursorA: '#3ddc97',
  cursorB: '#5ab0ff',
  marker: '#ff5c5c',
  text: '#d7dee8',
};

export function DevOtdrPreview() {
  const world = useMemo(() => buildDemoWorld(), []);
  const [settings, setSettings] = useState<OtdrSettings>({
    wavelengthNm: 1550,
    pulseWidthNs: 100,
    rangeMeters: 3500,
    iorSetting: profiles.network.iorDefault['1550']!,
    averagingSeconds: 30,
    launchCableMeters: 0,
    receiveCableMeters: 0,
  });
  const [cursors, setCursors] = useState({ a: 0, b: 500 });
  const [activeCursor, setActiveCursor] = useState<'a' | 'b'>('a');

  let result: OtdrTraceResult | null = null;
  let error: string | null = null;
  try {
    result = trace(world, profiles, { accessNodeId: 'olt', launchSpanId: 'feeder' }, settings);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const activeViewport = viewport ?? (result ? defaultViewport(result) : { xMinMeters: 0, xMaxMeters: settings.rangeMeters, yMinDb: -40, yMaxDb: 3 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: theme.background, color: theme.text, fontFamily: 'ui-monospace, monospace' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8, borderBottom: `1px solid ${theme.grid}` }}>
        <label>
          {'λ '}
          <select value={settings.wavelengthNm} onChange={(e) => setSettings((s) => ({ ...s, wavelengthNm: Number(e.target.value) }))}>
            {Array.from(new Set([...profiles.network.wavelengths.otdrTestWavelengthsNm, ...profiles.otdrInstrument.liveTestOutOfBandNm])).map((nm) => (
              <option key={nm} value={nm}>
                {nm} nm
              </option>
            ))}
          </select>
        </label>
        <label>
          {'pulse '}
          <select value={settings.pulseWidthNs} onChange={(e) => setSettings((s) => ({ ...s, pulseWidthNs: Number(e.target.value) }))}>
            {profiles.network.otdrPulseWidthsNs.map((ns) => (
              <option key={ns} value={ns}>
                {ns} ns
              </option>
            ))}
          </select>
        </label>
        <label>
          {'avg '}
          <select value={settings.averagingSeconds} onChange={(e) => setSettings((s) => ({ ...s, averagingSeconds: Number(e.target.value) }))}>
            {profiles.otdrInstrument.averagingSecondsOptions.map((s) => (
              <option key={s} value={s}>
                {s} s
              </option>
            ))}
          </select>
        </label>
        <label>
          {'range '}
          <input type="number" value={settings.rangeMeters} onChange={(e) => setSettings((s) => ({ ...s, rangeMeters: Number(e.target.value) }))} style={{ width: 80 }} />
        </label>
        <label>
          {'IOR '}
          <input
            type="number"
            step="0.0001"
            value={settings.iorSetting}
            onChange={(e) => setSettings((s) => ({ ...s, iorSetting: Number(e.target.value) }))}
            style={{ width: 80 }}
          />
        </label>
        <label>
          {'launch cable (m) '}
          <input type="number" value={settings.launchCableMeters} onChange={(e) => setSettings((s) => ({ ...s, launchCableMeters: Number(e.target.value) }))} style={{ width: 70 }} />
        </label>
        <button type="button" onClick={() => setActiveCursor((c) => (c === 'a' ? 'b' : 'a'))}>
          Active cursor: {activeCursor.toUpperCase()}
        </button>
      </div>

      {error && <div style={{ color: theme.marker, padding: 8 }}>{error}</div>}

      <div style={{ flex: 1, minHeight: 0 }}>
        <OtdrTraceCanvas
          result={result}
          viewport={activeViewport}
          cursors={cursors}
          activeCursor={activeCursor}
          showEventMarkers
          onCursorMove={(which, meters) => setCursors((c) => ({ ...c, [which]: meters }))}
          onViewportChange={setViewport}
          onEventSelect={() => {}}
          theme={theme}
        />
      </div>

      {result && (
        <div style={{ padding: 8, borderTop: `1px solid ${theme.grid}`, fontSize: 12, maxHeight: 160, overflow: 'auto' }}>
          <div>
            Noise floor: {result.noiseFloorDb.toFixed(1)} dB | Event DZ: {result.eventDeadZoneMeters.toFixed(1)} m | Atten. DZ: {result.attenuationDeadZoneMeters.toFixed(1)} m
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Kind</th>
                <th>Distance (m)</th>
                <th>Loss (dB)</th>
                <th>Reflectance (dB)</th>
                <th>Quality</th>
              </tr>
            </thead>
            <tbody>
              {result.events.map((ev) => (
                <tr key={ev.index}>
                  <td>{ev.index}</td>
                  <td>{ev.kind}</td>
                  <td>{ev.distanceMeters.toFixed(1)}</td>
                  <td>{ev.lossDb === null ? '-' : ev.lossDb.toFixed(2)}</td>
                  <td>{ev.reflectanceDb === null ? '-' : ev.reflectanceDb.toFixed(1)}</td>
                  <td>{ev.quality}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
