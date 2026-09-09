/**
 * The phone.
 *
 * It used to have a list of customers with a Call button beside each one, and that was the
 * wrong shape for this job. An outside-plant technician does not phone subscribers — the NOC
 * takes the reports, watches the ONTs drop off the PON, and hands over the picture. Infra
 * talks to NOC for outages and escalations, and to their own people for everything else.
 *
 * So there is one call to make, it costs one conversation, and it returns the whole alarm
 * list at once, red herrings included. NOC reports what it observed; deciding whether those
 * premises share an upstream path is still the trainee's work, and it is the work the old
 * per-customer calls were only pretending to be.
 */
import { availableReplies, pendingComms } from '../../session/comms';
import { HINT_POLICY, NOC_CONTACT_SECONDS } from '../../session/costs';
import type { UiActionEvent, UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { Chip } from '../components/Chip';
import { SoftKey } from '../components/SoftKey';

export function Phone({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const nocCalls = ui.log.filter((a): a is Extract<UiActionEvent, { type: 'noc-contact' }> => a.type === 'noc-contact');
  const latest = nocCalls[nocCalls.length - 1] ?? null;
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

      <div className="eyebrow" style={{ color: 'var(--cyan)' }}>Network Operations Centre</div>
      {latest ? (
        <div className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.4, color: 'var(--ink-faint)' }}>
            TICKET {latest.ticketId} · {latest.reports.length} PREMISE{latest.reports.length === 1 ? '' : 'S'} ON THE ALARM LIST
          </div>
          {latest.reports.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>NOC has nothing alarming on this ticket. Whatever is wrong, it is not taking anybody down.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {latest.reports.map((report) => (
                <div key={report.customerId} style={{ borderLeft: '2px solid var(--cyan-line)', paddingLeft: 9 }}>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--cyan)', letterSpacing: 0.8 }}>{report.customerId}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>{report.symptom}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
            NOC reports what it sees. Whether these share an upstream path is your call, not theirs.
          </div>
        </div>
      ) : (
        <div className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            NOC is holding the ticket. One call gets you the whole alarm list — who is down, and what was reported.
          </div>
          <SoftKey label={`Call NOC (${NOC_CONTACT_SECONDS}s)`} onClick={() => dispatch({ type: 'noc-contact' })} />
        </div>
      )}

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
