import type { UiActionEvent, UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { Chip } from '../components/Chip';

const CONNECTOR_KINDS = new Set(['connector-upc', 'connector-apc', 'connector-dirty']);

export function Scope({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const incident = ui.world.topology.spans.filter((s) => s.fromNodeId === ui.locationNodeId || s.toNodeId === ui.locationNodeId);
  const inspections = ui.log.filter((a): a is Extract<UiActionEvent, { type: 'scope' }> => a.type === 'scope');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Inspection scope -- pick a connector to inspect its end-face.</div>
      {incident.map((span) => {
        const connectors = span.events.filter((e) => CONNECTOR_KINDS.has(e.kind));
        if (connectors.length === 0) return null;
        return (
          <div key={span.id}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{span.id}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {connectors.map((ev) => {
                const inspected = inspections.find((a) => a.spanId === span.id && a.eventId === ev.id);
                return (
                  <Chip key={ev.id} active={!!inspected} onClick={() => dispatch({ type: 'scope', spanId: span.id, eventId: ev.id })}>
                    {ev.id} @{ev.positionMeters}m{inspected ? ` — ${inspected.grade.toUpperCase()}` : ''}
                  </Chip>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
