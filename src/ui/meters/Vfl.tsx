import type { UiActionEvent, UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { Chip } from '../components/Chip';

export function Vfl({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const incident = ui.world.topology.spans.filter((s) => s.fromNodeId === ui.locationNodeId || s.toNodeId === ui.locationNodeId);
  const runs = ui.log.filter((a): a is Extract<UiActionEvent, { type: 'vfl' }> => a.type === 'vfl' && a.fromNodeId === ui.locationNodeId);
  const last = runs[runs.length - 1] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Visual fault locator -- launches a bright red laser down each fiber.</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {incident.map((span) => (
          <Chip key={span.id} onClick={() => dispatch({ type: 'vfl', spanId: span.id, fromNodeId: ui.locationNodeId })}>
            Test {span.id}
          </Chip>
        ))}
      </div>
      {last && (
        <div className="bezel" style={{ padding: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{last.spanId}</div>
          {last.leaks.length === 0 ? (
            <div style={{ color: 'var(--led-ok)' }}>No visible leak along the fiber.</div>
          ) : (
            last.leaks.map((leak, i) => (
              <div key={i} style={{ color: 'var(--led-alarm)' }}>
                ⚠ Leak visible at ≈{leak.positionMeters.toFixed(0)} m ({leak.kind})
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
