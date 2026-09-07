import { useEffect } from 'react';
import type { UiActionEvent, UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { Chip } from '../components/Chip';
import { SoftKey } from '../components/SoftKey';
import { HeldDevice } from '../instrument/HeldDevice';
import { blocker, INITIAL_HELD, type HeldState } from '../instrument/deviceState';
import { EndFaceCanvas } from '../scope/EndFaceCanvas';
import { buildEndFaceModel, ZONE_LEGEND, ZONE_ORDER } from '../scope/endFaceModel';
import { useViewportState } from '../viewport/viewportStore';

const CONNECTOR_KINDS = new Set(['connector-upc', 'connector-apc', 'connector-dirty']);

interface Selection {
  spanId: string;
  eventId: string;
}

export function Scope({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const incident = ui.world.topology.spans.filter((s) => s.fromNodeId === ui.locationNodeId || s.toNodeId === ui.locationNodeId);
  const inspections = ui.log.filter((a): a is Extract<UiActionEvent, { type: 'scope' }> => a.type === 'scope');
  const [selected, setSelected] = useViewportState<Selection | null>('scope.selected', null);
  const [showZones, setShowZones] = useViewportState<boolean>('scope.zones', true);
  const [held, setHeld] = useViewportState<HeldState>('device.scope', INITIAL_HELD);
  // The probe is captive on this scope: there is no lead to land, only a tip cap to pull.
  const block = blocker(held, false);

  const connectors = incident.flatMap((span) => span.events.filter((e) => CONNECTOR_KINDS.has(e.kind)).map((ev) => ({ span, ev })));
  const current = selected ?? (connectors[0] ? { spanId: connectors[0].span.id, eventId: connectors[0].ev.id } : null);
  useEffect(() => { if (!selected && current) setSelected(current); }, [selected, current?.spanId, current?.eventId]);
  const reachable = current && connectors.some((c) => c.span.id === current.spanId && c.ev.id === current.eventId);
  const inspected = current ? [...inspections].reverse().find((a) => a.spanId === current.spanId && a.eventId === current.eventId) ?? null : null;
  const model = current && inspected ? buildEndFaceModel({ seed: ui.meta.seed, spanId: current.spanId, eventId: current.eventId, grade: inspected.grade, zones: inspected.zones }) : null;

  return (
    <HeldDevice
      ui={ui}
      dispatch={dispatch}
      state={held}
      name="Scope"
      status={inspected ? `Last: ${inspected.grade.toUpperCase()}` : undefined}
      model="FS-400"
      form="handheld"
      needsLead={false}
      onStateChange={setHeld}
      bootLines={['FiberOps FS-400', 'video inspection probe', 'IEC 61300-3-35 profile: SM-PC']}
      softKeys={[{ label: showZones ? 'Zones on' : 'Zones off', active: showZones, onClick: () => setShowZones((z) => !z) }]}
    >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Seat the probe tip on a connector, then inspect its end-face.</div>
      {connectors.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>No connectors at this location.</div>}
      {current && !reachable && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Showing the previous connector. Choose a connector at this location before inspecting.</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {connectors.map(({ span, ev }) => {
          const done = inspections.find((a) => a.spanId === span.id && a.eventId === ev.id);
          return (
            <Chip key={`${span.id}:${ev.id}`} active={current?.spanId === span.id && current.eventId === ev.id} onClick={() => setSelected({ spanId: span.id, eventId: ev.id })}>
              {span.id} · {ev.id} @{ev.positionMeters}m{done ? ` — ${done.grade.toUpperCase()}` : ''}
            </Chip>
          );
        })}
      </div>

      {current && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="bezel" style={{ padding: 12, position: 'relative' }}>
            <EndFaceCanvas model={model} showZones={showZones} size={300} />
            {!model && (
              <div style={{ position: 'absolute', inset: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13, textAlign: 'center', borderRadius: '50%', background: 'rgba(5,7,10,0.55)' }}>
                Not inspected yet
              </div>
            )}
            {model && (
              <div
                className="mono"
                style={{ position: 'absolute', top: 18, right: 18, padding: '4px 10px', borderRadius: 4, fontWeight: 700, fontSize: 14, letterSpacing: 1, color: '#0b0f14', background: model.grade === 'pass' ? 'var(--led-ok)' : 'var(--led-alarm)' }}
              >
                {model.grade.toUpperCase()}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220, flex: 1 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <SoftKey label={inspected ? 'Re-inspect' : 'Inspect'} disabled={block !== null || !reachable} onClick={() => dispatch({ type: 'scope', spanId: current.spanId, eventId: current.eventId })} />
              <SoftKey label={showZones ? 'Zones on' : 'Zones off'} active={showZones} onClick={() => setShowZones((z) => !z)} />
            </div>
            <table className="mono" style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 6px' }}>Zone</th>
                  <th style={{ padding: '4px 6px' }}>Found</th>
                  <th style={{ padding: '4px 6px' }}>Pass limit</th>
                </tr>
              </thead>
              <tbody>
                {ZONE_ORDER.map((zone) => {
                  const count = model ? model.zones[zone] : null;
                  const bad = model && ((zone === 'core' && count! > 0) || (zone === 'cladding' && count! > 5));
                  return (
                    <tr key={zone} style={{ borderTop: '1px solid var(--bezel)' }}>
                      <td style={{ padding: '4px 6px' }}>
                        {ZONE_LEGEND[zone].letter} · {ZONE_LEGEND[zone].label}
                      </td>
                      <td style={{ padding: '4px 6px', color: bad ? 'var(--led-alarm)' : 'var(--text)' }}>{count === null ? '—' : count}</td>
                      <td style={{ padding: '4px 6px', color: 'var(--muted)' }}>{ZONE_LEGEND[zone].limit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Bright specks are particles, thin lines are scratches, a soft haze is oil. Anything in the core fails the connector; clean and re-inspect before you trust an OTDR event here.</div>
          </div>
        </div>
      )}
    </div>
    </HeldDevice>
  );
}
