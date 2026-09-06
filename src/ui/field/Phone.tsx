import { HINT_POLICY } from '../../session/costs';
import type { UiActionEvent, UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { Chip } from '../components/Chip';
import { SoftKey } from '../components/SoftKey';

export function Phone({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const calls = ui.log.filter((a): a is Extract<UiActionEvent, { type: 'customer-contact' }> => a.type === 'customer-contact');
  const hints = ui.log.filter((a): a is Extract<UiActionEvent, { type: 'hint' }> => a.type === 'hint');
  const policy = HINT_POLICY[ui.meta.tier];
  const hintsRemaining = Number.isFinite(policy.max) ? Math.max(0, policy.max - ui.hintsUsed) : Infinity;
  const lastHintText = [...hints].reverse().find((h) => !h.refused)?.text ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>Customer reports</div>
      {ui.world.customerReports.map((report) => {
        const called = calls.find((c) => c.customerId === report.customerId);
        return (
          <div key={report.customerId} className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{report.customerId}</div>
            {called ? (
              <div style={{ fontSize: 13 }}>{called.symptom}</div>
            ) : (
              <SoftKey label="Call" onClick={() => dispatch({ type: 'customer-contact', customerId: report.customerId })} />
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Hint a senior tech</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Chip disabled={hintsRemaining <= 0} onClick={() => dispatch({ type: 'hint' })}>
          {hintsRemaining <= 0 ? 'No hints left' : `Hint (${hintsRemaining} left, ${policy.cost} pts)`}
        </Chip>
      </div>
      {lastHintText && <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--muted)' }}>"{lastHintText}"</div>}
    </div>
  );
}
