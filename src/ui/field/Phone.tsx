import { HINT_POLICY } from '../../session/costs';
import { availableReplies, pendingComms } from '../../session/comms';
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

  // Everything that has landed and still wants an answer. Blocking ones lead.
  const inbox = pendingComms(ui.commsEvents, ui.clockSeconds, ui.commsHandled).sort((a, b) => Number(b.blocking) - Number(a.blocking));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 8 }}>
      {inbox.length > 0 && (
        <>
          <div className="eyebrow" style={{ color: inbox.some((e) => e.blocking) ? 'var(--orange)' : 'var(--cyan)' }}>
            Inbox · {inbox.length} waiting
          </div>
          {inbox.map((event) => {
            const replies = availableReplies(event, ui.log);
            return (
              <div key={event.id} className={`bezel${event.blocking ? ' alert' : ''}`} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: event.blocking ? 'var(--orange)' : 'var(--cyan)' }}>
                    {event.kind.replace('-', ' ').toUpperCase()}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{event.fromName}</span>
                  {event.blocking && <span className="panel-badge alert">NEEDS AN ANSWER</span>}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink)' }}>{event.body}</div>
                {replies.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {replies.map((reply) => (
                      <button
                        key={reply.id}
                        type="button"
                        onClick={() => dispatch({ type: 'comms', eventId: event.id, replyId: reply.id, seconds: reply.seconds })}
                        style={{
                          minHeight: 44,
                          textAlign: 'left',
                          padding: '9px 11px',
                          borderRadius: 'var(--radius)',
                          border: '1px solid var(--cyan-line)',
                          background: 'rgba(0,240,255,0.05)',
                          color: 'var(--ink)',
                          fontFamily: 'var(--font-body)',
                          fontSize: 12.5,
                          lineHeight: 1.45,
                          cursor: 'pointer',
                        }}
                      >
                        {reply.text}
                        <span className="mono" style={{ display: 'block', fontSize: 9, letterSpacing: 1.2, color: 'var(--ink-faint)', marginTop: 3 }}>
                          COSTS {reply.seconds}S
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontStyle: 'italic' }}>Nothing to say yet — go and find something out.</div>
                )}
              </div>
            );
          })}
        </>
      )}

      <div className="eyebrow" style={{ color: 'var(--cyan)' }}>Customer reports</div>
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

      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{ui.meta.tier <= 2 ? 'Ask dispatch for the next question' : ui.meta.tier === 3 ? 'Ask dispatch to confirm your observations' : 'Ask a senior tech'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Chip disabled={hintsRemaining <= 0} onClick={() => dispatch({ type: 'hint' })}>
          {hintsRemaining <= 0 ? 'No hints left' : `Hint (${Number.isFinite(hintsRemaining) ? hintsRemaining : 'unlimited'} left, ${policy.cost} pts)`}
        </Chip>
      </div>
      {lastHintText && <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--muted)' }}>"{lastHintText}"</div>}
    </div>
  );
}
