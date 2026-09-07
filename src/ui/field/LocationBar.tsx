import { useState } from 'react';
import { travelTimeSeconds } from '../../session/location';
import type { UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import type { NodeKind } from '../../world';
import { Sheet } from '../components/Sheet';

function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600) % 24;
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The shift you are on, from the scenario's authored time of day. */
function shiftOf(timeOfDay: string): string {
  const hour = Number(timeOfDay.split(':')[0]);
  if (!Number.isFinite(hour)) return 'DAY SHIFT';
  if (hour < 6) return 'NIGHT SHIFT';
  if (hour < 12) return 'DAY SHIFT';
  if (hour < 18) return 'SWING SHIFT';
  return 'NIGHT SHIFT';
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

/** A stylised OTDR trace across the header — decorative, never scenario data. */
const TRACE_POINTS = '0,8 70,10 138,12 146,3 154,13 300,17 308,7 316,18 470,21 600,25 640,27 641,37 720,37';

export function LocationBar({ ui, dispatch, toast }: { ui: UiSessionState; dispatch(intent: Intent): void; toast: string | null }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const currentNode = ui.world.topology.nodes.find((n) => n.id === ui.locationNodeId);
  const budgetSeconds = ui.meta.timeBudgetMinutes ? ui.meta.timeBudgetMinutes * 60 : null;
  const overBudget = budgetSeconds !== null && ui.clockSeconds > budgetSeconds;
  const region = ui.profiles.region.oneCallCenterName?.includes('South') ? 'SOCAL DISTRICT' : 'DISTRICT';

  const grouped = new Map<NodeKind, typeof ui.world.topology.nodes>();
  for (const node of ui.world.topology.nodes) {
    if (node.id === ui.locationNodeId) continue;
    const list = grouped.get(node.kind) ?? [];
    list.push(node);
    grouped.set(node.kind, list);
  }

  return (
    <div
      style={{
        flexShrink: 0,
        background: '#0a1119',
        borderBottom: '1px solid rgba(59,232,216,0.35)',
        boxShadow: '0 1px 18px rgba(59,232,216,0.12)',
        padding: '10px 12px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">
            PACIFIC FIBER CO. — {region} · {shiftOf(ui.world.environment.timeOfDay)}
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="hud-title"
            title="Roll the truck somewhere else"
            style={{
              display: 'block',
              maxWidth: '100%',
              marginTop: 2,
              padding: 0,
              background: 'transparent',
              border: 'none',
              fontSize: 16,
              textAlign: 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {(currentNode?.label ?? ui.locationNodeId).toUpperCase()}
          </button>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: 'var(--ink-soft)', marginTop: 2 }}>
            TECH #0824 · {ui.meta.scenarioId.toUpperCase()} · SEED {ui.meta.seed}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 19, fontWeight: 800, letterSpacing: 2, color: overBudget ? 'var(--red)' : 'var(--amber)', textShadow: `0 0 12px ${overBudget ? 'rgba(255,77,94,.45)' : 'rgba(255,176,32,.4)'}` }}>
              {formatClock(ui.clockSeconds)}
            </div>
            {budgetSeconds !== null && (
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.5, color: overBudget ? 'var(--red)' : 'var(--ink-soft)' }}>
                {overBudget ? 'OVER BUDGET' : `BUDGET ${ui.meta.timeBudgetMinutes}M`}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            {(['LINK', 'ACT'] as const).map((l) => (
              <div key={l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--green)',
                    boxShadow: '0 0 8px var(--green)',
                    animation: l === 'ACT' ? 'fsBlink 1s steps(2) infinite' : undefined,
                  }}
                />
                <span className="mono" style={{ fontSize: 8, letterSpacing: 2, color: 'var(--ink-soft)' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <svg viewBox="0 0 720 40" preserveAspectRatio="none" aria-hidden style={{ display: 'block', width: '100%', height: 30, marginTop: 4 }}>
        <polyline points={TRACE_POINTS} fill="none" stroke="var(--cyan)" strokeWidth={4} opacity={0.22} style={{ filter: 'blur(2px)' }} />
        <polyline points={TRACE_POINTS} fill="none" stroke="var(--cyan)" strokeWidth={1.5} strokeDasharray={1400} style={{ animation: 'fsDraw 2.2s ease-out forwards' }} />
      </svg>
      <style>{'@keyframes fsBlink{50%{opacity:.12}}@keyframes fsDraw{from{stroke-dashoffset:1400}to{stroke-dashoffset:0}}@media (prefers-reduced-motion:reduce){svg polyline{animation:none!important;stroke-dashoffset:0!important}}'}</style>

      {overBudget && <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: 'var(--red)', paddingBottom: 6 }}>OVER BUDGET — EFFICIENCY IS NOW 0. THE SESSION CONTINUES.</div>}
      {toast && <div className="mono" style={{ fontSize: 11, letterSpacing: 0.5, color: 'var(--cyan)', paddingBottom: 6, textShadow: '0 0 10px rgba(59,232,216,.5)' }}>&gt; {toast}</div>}

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Truck roll">
        {Array.from(grouped.entries()).map(([kind, nodes]) => (
          <div key={kind} style={{ marginBottom: 12 }}>
            <div className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 6 }}>{KIND_LABELS[kind] ?? kind}</div>
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
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                    borderRadius: 2,
                    color: 'var(--ink)',
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    fontFamily: 'var(--font-label)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label}</span>
                  <span style={{ color: 'var(--amber)', flexShrink: 0 }}>{Math.round(travelTimeSeconds(ui.meta, ui.locationNodeId, node.id) / 60)} MIN</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Sheet>
    </div>
  );
}
