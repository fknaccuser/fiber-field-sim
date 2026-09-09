import type { UiActionEvent, UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { SoftKey } from '../components/SoftKey';
import { HeldDevice } from '../instrument/HeldDevice';
import { useViewportState } from '../viewport/viewportStore';

export function Vfl({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const incident = ui.world.topology.spans.filter((s) => s.fromNodeId === ui.locationNodeId || s.toNodeId === ui.locationNodeId);
  const runs = ui.log.filter((a): a is Extract<UiActionEvent, { type: 'vfl' }> => a.type === 'vfl');
  const last = runs[runs.length - 1] ?? null;
  const [mode, setMode] = useViewportState<'continuous' | 'pulse'>('vfl.mode', 'continuous');
  const [selected, setSelected] = useViewportState<string | null>('vfl.span', null);
  const spanId = selected && incident.some((s) => s.id === selected) ? selected : incident[0]?.id ?? null;
  // A VFL has one job and no idle state: raised, it is emitting.
  const lit = true;

  return (
    <HeldDevice
      ui={ui}
      id="vfl"
      name="VFL"
      status={lit ? `650 nm · ${mode === 'pulse' ? '2 Hz' : 'continuous'}` : undefined}
      model="VL-7"
      form="pen"
      bootLines={['FiberOps VL-7', '650 nm visual fault locator', 'class 2 laser — do not view directly']}
      softKeys={[
        { label: 'CW', active: mode === 'continuous', onClick: () => setMode('continuous') },
        { label: '2 Hz', active: mode === 'pulse', onClick: () => setMode('pulse') },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: lit ? '#ff2d2d' : '#3a2020',
              boxShadow: lit ? '0 0 14px 4px rgba(255,45,45,0.75)' : 'none',
              animation: lit && mode === 'pulse' ? 'vflBlink 0.5s steps(1) infinite' : undefined,
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{lit ? `emitting 650 nm · ${mode === 'pulse' ? '2 Hz' : 'continuous'}` : 'laser off'}</span>
        </div>
        <style>{'@keyframes vflBlink{50%{opacity:0.15}}'}</style>

        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Fibers you can reach from here:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {incident.map((span) => (
            <button
              key={span.id}
              type="button"
              onClick={() => setSelected(span.id)}
              style={{
                minHeight: 38,
                textAlign: 'left',
                padding: '6px 10px',
                borderRadius: 6,
                border: `1px solid ${spanId === span.id ? 'var(--cursor-b)' : 'var(--bezel)'}`,
                background: spanId === span.id ? 'var(--panel-2)' : 'transparent',
                color: 'var(--text)',
                fontSize: 12,
              }}
            >
              {span.id} · {span.lengthMeters} m
            </button>
          ))}
          {incident.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No fiber at this location.</div>}
        </div>

        <SoftKey label="Trace this fiber" disabled={spanId === null} onClick={() => spanId && dispatch({ type: 'vfl', spanId, fromNodeId: ui.locationNodeId })} />

        {last && (
          <div className="bezel" style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{last.spanId}</div>
            {last.leaks.length === 0 ? (
              <div style={{ color: 'var(--led-ok)', fontSize: 12 }}>No red glow anywhere along the jacket.</div>
            ) : (
              last.leaks.map((leak, i) => (
                <div key={i} style={{ color: 'var(--led-alarm)', fontSize: 12 }}>
                  Red light bleeding through at ≈{leak.positionMeters.toFixed(0)} m ({leak.kind})
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </HeldDevice>
  );
}
