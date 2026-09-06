import { useState } from 'react';
import { travelTimeSeconds } from '../../session/location';
import type { UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import type { NodeKind } from '../../world';
import { Led } from '../components/Led';
import { Sheet } from '../components/Sheet';

function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600) % 24;
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const KIND_LABELS: Partial<Record<NodeKind, string>> = {
  olt: 'OLT',
  fdh: 'FDH',
  splitter: 'Splitters',
  'splice-closure': 'Closures',
  terminal: 'Terminals / NAPs',
  fat: 'FATs',
  ont: 'ONTs',
  'customer-premise': 'Customer premises',
  'network-device': 'Network devices',
  yard: 'Yard',
  pop: 'POP',
};

export function LocationBar({ ui, dispatch, toast }: { ui: UiSessionState; dispatch(intent: Intent): void; toast: string | null }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const currentNode = ui.world.topology.nodes.find((n) => n.id === ui.locationNodeId);
  const budgetSeconds = ui.meta.timeBudgetMinutes ? ui.meta.timeBudgetMinutes * 60 : null;
  const overBudget = budgetSeconds !== null && ui.clockSeconds > budgetSeconds;

  const grouped = new Map<NodeKind, typeof ui.world.topology.nodes>();
  for (const node of ui.world.topology.nodes) {
    if (node.id === ui.locationNodeId) continue;
    const list = grouped.get(node.kind) ?? [];
    list.push(node);
    grouped.set(node.kind, list);
  }

  return (
    <div className="bezel" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 12px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Led status="ok" label="On site" />
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            style={{ minHeight: 44, background: 'var(--panel-2)', border: '1px solid var(--bezel)', borderRadius: 6, color: 'var(--text)', padding: '4px 10px', fontSize: 13 }}
          >
            {currentNode?.label ?? ui.locationNodeId}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="mono" style={{ fontSize: 16, color: overBudget ? 'var(--led-warn)' : 'var(--text)' }}>
            {formatClock(ui.clockSeconds)}
          </span>
          {budgetSeconds !== null && (
            <span style={{ fontSize: 11, color: overBudget ? 'var(--led-warn)' : 'var(--muted)' }}>
              {overBudget ? 'Over budget' : `Budget ${ui.meta.timeBudgetMinutes} min`}
            </span>
          )}
        </div>
      </div>
      {overBudget && <div style={{ fontSize: 12, color: 'var(--led-warn)' }}>Over budget — efficiency is now 0. The session continues.</div>}
      {toast && <div style={{ fontSize: 12, color: 'var(--cursor-a)' }}>{toast}</div>}

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Truck roll">
        {Array.from(grouped.entries()).map(([kind, nodes]) => (
          <div key={kind} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{KIND_LABELS[kind] ?? kind}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'truck-roll', toNodeId: node.id });
                    setPickerOpen(false);
                  }}
                  style={{
                    minHeight: 44,
                    textAlign: 'left',
                    background: 'var(--panel-2)',
                    border: '1px solid var(--bezel)',
                    borderRadius: 6,
                    color: 'var(--text)',
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{node.label}</span>
                  <span className="mono" style={{ color: 'var(--muted)' }}>{Math.round(travelTimeSeconds(ui.meta, ui.locationNodeId, node.id) / 60)} min</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Sheet>
    </div>
  );
}
