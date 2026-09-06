import { useState } from 'react';
import type { UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { OtdrPanel } from '../otdr/OtdrPanel';
import { PowerMeter } from '../meters/PowerMeter';
import { Vfl } from '../meters/Vfl';
import { Scope } from '../meters/Scope';
import { Terminal } from '../terminal/Terminal';
import { Phone } from './Phone';
import { Records } from './Records';
import { Diagnose, type DiagnosePrefill } from './Diagnose';
import { Excavate, excavateAvailable } from './Excavate';

type TabId = 'otdr' | 'power-meter' | 'vfl' | 'scope' | 'terminal' | 'phone' | 'records' | 'diagnose' | 'excavate';

const BASE_TABS: Array<{ id: TabId; label: string }> = [
  { id: 'otdr', label: 'OTDR' },
  { id: 'power-meter', label: 'Power' },
  { id: 'vfl', label: 'VFL' },
  { id: 'scope', label: 'Scope' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'phone', label: 'Phone' },
  { id: 'records', label: 'Records' },
  { id: 'diagnose', label: 'Diagnose' },
];

export function InstrumentDock({
  ui,
  dispatch,
  initialTab = 'phone',
}: {
  ui: UiSessionState;
  dispatch(intent: Intent): void;
  initialTab?: TabId;
}) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [prefill, setPrefill] = useState<DiagnosePrefill | null>(null);

  const tabs = excavateAvailable(ui) ? [...BASE_TABS, { id: 'excavate' as const, label: 'Excavate' }] : BASE_TABS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tab === 'otdr' && (
          <OtdrPanel
            ui={ui}
            dispatch={dispatch}
            onSendToDiagnosis={(p) => {
              setPrefill(p);
              setTab('diagnose');
            }}
          />
        )}
        {tab === 'power-meter' && <PowerMeter ui={ui} dispatch={dispatch} />}
        {tab === 'vfl' && <Vfl ui={ui} dispatch={dispatch} />}
        {tab === 'scope' && <Scope ui={ui} dispatch={dispatch} />}
        {tab === 'terminal' && <Terminal ui={ui} dispatch={dispatch} />}
        {tab === 'phone' && <Phone ui={ui} dispatch={dispatch} />}
        {tab === 'records' && <Records ui={ui} dispatch={dispatch} />}
        {tab === 'diagnose' && <Diagnose ui={ui} dispatch={dispatch} prefill={prefill} />}
        {tab === 'excavate' && <Excavate ui={ui} dispatch={dispatch} />}
      </div>
      <div className="bezel" style={{ display: 'flex', overflowX: 'auto', flexShrink: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              flex: '1 0 auto',
              minHeight: 48,
              minWidth: 64,
              background: tab === t.id ? 'var(--panel-2)' : 'transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--muted)',
              border: 'none',
              borderTop: tab === t.id ? '2px solid var(--cursor-b)' : '2px solid transparent',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
