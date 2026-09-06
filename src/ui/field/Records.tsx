import { useState } from 'react';
import type { UiActionEvent, UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { Chip } from '../components/Chip';

export function Records({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const [lastQuery, setLastQuery] = useState<{ nodeId?: string; spanId?: string } | null>(null);
  const lookups = ui.log.filter((a): a is Extract<UiActionEvent, { type: 'records' }> => a.type === 'records');

  const shownIds = new Set(lookups.flatMap((l) => l.recordIds));
  const shownRecords = ui.world.plantRecords.filter((r) => shownIds.has(r.id));

  const query = (nodeId?: string, spanId?: string) => {
    setLastQuery({ nodeId, spanId });
    dispatch({ type: 'records', nodeId, spanId });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Look up records by node</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ui.world.topology.nodes.map((n) => (
          <Chip key={n.id} active={lastQuery?.nodeId === n.id} onClick={() => query(n.id, undefined)}>
            {n.label}
          </Chip>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Look up records by span</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ui.world.topology.spans.map((s) => (
          <Chip key={s.id} active={lastQuery?.spanId === s.id} onClick={() => query(undefined, s.id)}>
            {s.id}
          </Chip>
        ))}
      </div>

      {shownRecords.length > 0 && (
        <div className="mono bezel" style={{ padding: 12, background: '#e8e4d8', color: '#20242b', fontSize: 12 }}>
          {shownRecords.map((r) => (
            <div key={r.id} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>
                {r.title} — {r.kind} ({r.date})
              </div>
              {r.lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ))}
        </div>
      )}
      {lastQuery && shownRecords.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No records found there.</div>}
    </div>
  );
}
