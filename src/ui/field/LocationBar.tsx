import { useState } from 'react';
import { travelTimeSeconds } from '../../session/location';
import type { UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import type { NodeKind } from '../../world';
import { Sheet } from '../components/Sheet';
import { conditionsLabel, shiftOf } from './conditions';
import { kindLabel } from './nodeLabels';

function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600) % 24;
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Decorative HUD telemetry across the header. Never scenario data. */
const TRACE_POINTS = '0,26 60,24 130,22 138,9 146,23 300,19 308,6 316,20 470,16 600,12 640,10 641,2 720,2';

function StatusLamp({ label, status }: { label: string; status: 'ok' | 'warn' | 'alarm' | 'idle' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span className={`pulse-dot ${status}`} />
      <span className="mono" style={{ fontSize: 8, letterSpacing: 2, color: 'var(--ink-soft)' }}>
        {label}
      </span>
    </div>
  );
}

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
        position: 'relative',
        background: 'rgba(10, 15, 29, 0.88)',
        backdropFilter: 'blur(14px) saturate(120%)',
        WebkitBackdropFilter: 'blur(14px) saturate(120%)',
        borderBottom: '1px solid var(--cyan-line)',
        boxShadow: '0 2px 28px rgba(0, 240, 255, 0.09)',
        padding: '10px 14px 0',
      }}
    >
      {/* Telemetry ribbon behind the header content. */}
      <svg viewBox="0 0 720 34" preserveAspectRatio="none" aria-hidden style={{ position: 'absolute', inset: 'auto 0 0 0', width: '100%', height: 34, opacity: 0.5 }}>
        <polyline points={TRACE_POINTS} fill="none" stroke="var(--cyan)" strokeWidth={5} opacity={0.16} style={{ filter: 'blur(3px)' }} />
        <polyline points={TRACE_POINTS} fill="none" stroke="var(--cyan)" strokeWidth={1.25} strokeDasharray={1400} style={{ animation: 'traceDraw 2.4s ease-out forwards' }} />
      </svg>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span className="pulse-dot" style={{ width: 6, height: 6 }} />
            FIBER//OPS · {region} · {shiftOf(ui.world.environment.timeOfDay)}
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="hud-title"
            title="Roll the truck somewhere else"
            style={{
              display: 'block',
              maxWidth: '100%',
              marginTop: 3,
              padding: 0,
              background: 'transparent',
              border: 'none',
              fontSize: 17,
              textAlign: 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {(currentNode?.label ?? ui.locationNodeId).toUpperCase()}
          </button>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.2, color: 'var(--ink-faint)', marginTop: 3 }}>
            TECH-0824 · {ui.meta.scenarioId.toUpperCase()} · SEED {ui.meta.seed}
          </div>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.2, color: 'var(--ink-soft)', marginTop: 2 }}>
            {conditionsLabel(ui.world.environment.timeOfDay, ui.world.environment.weather).toUpperCase()}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div
              className="mono"
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 3,
                color: overBudget ? 'var(--red)' : 'var(--cyan)',
                textShadow: `0 0 18px ${overBudget ? 'rgba(255,77,94,.55)' : 'rgba(0,240,255,.55)'}`,
              }}
            >
              {formatClock(ui.clockSeconds)}
            </div>
            {budgetSeconds !== null && (
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.5, color: overBudget ? 'var(--red)' : 'var(--ink-soft)' }}>
                {overBudget ? 'OVER BUDGET' : `BUDGET ${ui.meta.timeBudgetMinutes}M`}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 11, paddingTop: 3 }}>
            <StatusLamp label="LINK" status="ok" />
            <StatusLamp label="PON" status={overBudget ? 'warn' : 'ok'} />
          </div>
        </div>
      </div>

      <div style={{ height: 34 }} />

      {overBudget && (
        <div className="mono" style={{ position: 'relative', fontSize: 10, letterSpacing: 1, color: 'var(--red)', paddingBottom: 6 }}>
          OVER BUDGET — EFFICIENCY IS NOW 0. THE SESSION CONTINUES.
        </div>
      )}
      {toast && (
        <div className="mono" style={{ position: 'relative', fontSize: 11, color: 'var(--cyan)', paddingBottom: 6, textShadow: '0 0 12px rgba(0,240,255,.55)' }}>
          &gt; {toast}
        </div>
      )}

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Truck roll">
        {Array.from(grouped.entries()).map(([kind, nodes]) => (
          <div key={kind} style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 6 }}>
              {kindLabel(kind)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
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
                    background: 'rgba(30,41,59,0.5)',
                    border: '1px solid var(--cyan-line)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--ink)',
                    padding: '9px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    fontFamily: 'var(--font-body)',
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label}</span>
                  <span className="mono" style={{ color: 'var(--orange)', flexShrink: 0, fontSize: 11 }}>
                    {Math.round(travelTimeSeconds(ui.meta, ui.locationNodeId, node.id) / 60)} MIN
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Sheet>
    </div>
  );
}
