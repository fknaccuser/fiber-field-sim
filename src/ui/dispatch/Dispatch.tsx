/**
 * Morning dispatch. The front door: who you are, what the day looks like, and the board of
 * work orders you have been assigned. Everything on it is real — the queue resolves to
 * playable `scenarioId + seed` pairs, the streak and weakest domain come from your actual
 * training record, and stability is computed from what is still open.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listSessions, loadUnfinished, type StoredSession } from '../store/persistence';
import { competencyMap, computeStreak } from '../store/progress';
import { Panel, Readout } from '../components/Panel';
import { SoftKey } from '../components/SoftKey';
import { DEFAULT_ROLE, isRole, ROLE_ORDER, ROLE_POLICY, unlockedRoles, type Role } from '../../session/roles';
import { buildDay, committedMinutes, networkStability, SHIFT_MINUTES, type Priority, type WorkKind, type WorkOrder } from './day';

const DAY_SEED_KEY = 'fiberops.daySeed';
const STARTED_KEY = 'fiberops.dayStarted';
const ROLE_KEY = 'fiberops.role';

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function clockLabel(): string {
  return new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

const PRIORITY_TONE: Record<Priority, string> = { P1: 'var(--red)', P2: 'var(--orange)', P3: 'var(--cyan)' };

function KindGlyph({ kind }: { kind: WorkKind }) {
  const c = { fill: 'none', stroke: 'var(--cyan)', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <span
      style={{
        width: 42,
        height: 42,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 3,
        border: '1px solid var(--cyan-line)',
        background: 'rgba(0,240,255,0.06)',
      }}
    >
      <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden>
        {kind === 'plant' && (
          <>
            <path d="M3 17h18M6 17V9m12 8V9" {...c} />
            <path d="M4 9h16M8 9V6h8v3" {...c} />
          </>
        )}
        {kind === 'network' && (
          <>
            <rect x="3" y="4" width="18" height="12" rx="1.5" {...c} />
            <path d="M7 9l2.5 2L7 13M12 13h5" {...c} />
            <path d="M8 20h8" {...c} />
          </>
        )}
        {kind === 'customer' && (
          <>
            <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" {...c} />
            <path d="M10 20v-5h4v5" {...c} />
          </>
        )}
      </svg>
    </span>
  );
}

function OrderCard({ order, lead, done, onEnter }: { order: WorkOrder; lead: boolean; done: boolean; onEnter(): void }) {
  return (
    <div
      className={`bezel${lead && !done ? ' alert' : ''}`}
      style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, opacity: done ? 0.55 : 1 }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <KindGlyph kind={order.kind} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              className="mono"
              style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: '2px 7px', borderRadius: 2, color: PRIORITY_TONE[order.priority], border: `1px solid ${PRIORITY_TONE[order.priority]}` }}
            >
              {order.priority}
            </span>
            <span className="mono" style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>{order.ticket}</span>
            {done && <span className="panel-badge">CLOSED</span>}
          </div>
          <div className="hud-title" style={{ fontSize: 15, marginTop: 5, whiteSpace: 'normal' }}>{order.title}</div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: 'var(--cyan)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg viewBox="0 0 24 24" width={11} height={11} aria-hidden style={{ flexShrink: 0 }}>
              <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" fill="none" stroke="var(--cyan)" strokeWidth="2" />
              <circle cx="12" cy="10" r="2.4" fill="var(--cyan)" />
            </svg>
            {order.location}
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--cyan-line)' }} />
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-soft)' }}>{order.summary}</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>EST {order.estMinutes} MIN</span>
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>TIER {order.tier}</span>
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>SEED {order.seed}</span>
        <span style={{ flex: 1 }} />
        <SoftKey label={done ? 'Re-open →' : 'Enter field →'} tone={lead && !done ? 'orange' : 'cyan'} onClick={onEnter} />
      </div>
    </div>
  );
}

export function Dispatch() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [unfinished, setUnfinished] = useState<StoredSession | null>(null);
  const [daySeed, setDaySeed] = useState<number>(() => {
    const stored = Number(localStorage.getItem(DAY_SEED_KEY));
    if (Number.isInteger(stored) && stored > 0) return stored;
    const fresh = 1 + Math.floor(Math.random() * 999_999);
    localStorage.setItem(DAY_SEED_KEY, String(fresh));
    return fresh;
  });
  const [role, setRole] = useState<Role>(() => {
    const stored = localStorage.getItem(ROLE_KEY);
    return isRole(stored) ? stored : DEFAULT_ROLE;
  });
  const [started, setStarted] = useState(() => localStorage.getItem(STARTED_KEY) === String(localStorage.getItem(DAY_SEED_KEY)));

  useEffect(() => {
    void loadUnfinished().then((s) => setUnfinished(s ?? null));
    void listSessions({ limit: 200 }).then(setSessions);
  }, []);

  const day = useMemo(() => buildDay(daySeed), [daySeed]);
  const closed = useMemo(() => {
    const finished = new Set(sessions.filter((s) => s.endedAt).map((s) => `${s.scenarioId}:${s.seed}`));
    return day.orders.filter((o) => finished.has(`${o.scenarioId}:${o.seed}`)).map((o) => o.ticket);
  }, [sessions, day]);

  const { currentStreak, bestStreak } = computeStreak(sessions);
  const competency = competencyMap(sessions);
  const weakest = competency[0] ?? null;
  const unlocked_ = unlockedRoles(sessions.filter((x) => x.endedAt).length);
  const stability = networkStability(day, closed);
  const committed = committedMinutes(day);
  const leadTicket = day.orders.find((o) => !closed.includes(o.ticket))?.ticket ?? null;

  const startDay = () => {
    localStorage.setItem(STARTED_KEY, String(daySeed));
    setStarted(true);
  };
  const newDay = () => {
    const fresh = 1 + Math.floor(Math.random() * 999_999);
    localStorage.setItem(DAY_SEED_KEY, String(fresh));
    localStorage.removeItem(STARTED_KEY);
    setDaySeed(fresh);
    setStarted(false);
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* ---- Header ---- */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottom: '1px solid var(--cyan-line)' }}>
          <span style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 4, border: '1px solid var(--cyan)', background: 'rgba(0,240,255,0.08)', boxShadow: 'var(--glow-cyan)', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
              <polyline points="2,13 7,13 9,7 12,18 15,11 17,13 22,13" fill="none" stroke="var(--cyan)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="hud-title" style={{ fontSize: 18 }}>FIBER//OPS</div>
            <div className="eyebrow" style={{ color: 'var(--ink-faint)', fontSize: 9 }}>FIELD SIMULATION ENGINE</div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999, border: '1px solid var(--cyan-line)', background: 'rgba(0,240,255,0.05)' }}>
            <span className="pulse-dot" style={{ width: 7, height: 7 }} />
            <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--cyan)' }}>SOC-07 ONLINE</span>
          </span>
        </header>

        {/* ---- Hero ---- */}
        <div>
          <div className="eyebrow" style={{ color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg viewBox="0 0 24 24" width={13} height={13} aria-hidden>
              <path d="M5 14a7 7 0 0 1 14 0" fill="none" stroke="var(--cyan)" strokeWidth="1.8" />
              <path d="M8.5 16a3.5 3.5 0 0 1 7 0" fill="none" stroke="var(--cyan)" strokeWidth="1.8" />
              <circle cx="12" cy="18.5" r="1.6" fill="var(--cyan)" />
            </svg>
            MORNING DISPATCH // {clockLabel()}
          </div>
          <h1 className="hud-title" style={{ fontSize: 'clamp(26px, 6vw, 40px)', lineHeight: 1.08, margin: '12px 0 0', letterSpacing: 3 }}>
            Enter the field.
          </h1>
          <h1 className="hud-title" style={{ fontSize: 'clamp(26px, 6vw, 40px)', lineHeight: 1.08, margin: 0, letterSpacing: 3, color: 'var(--ink-soft)', textShadow: 'none' }}>
            Bring back evidence.
          </h1>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '14px 0 0', maxWidth: 620 }}>
            {todayLabel()} · South Orange County operations. Every reading is generated from the same plant, fault, and network models used for scoring.
          </p>
        </div>

        {/* ---- Resume, if a job is still open ---- */}
        {unfinished && (
          <Panel tone="alert" title="Shift interrupted" badge="IN PROGRESS">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="mono" style={{ fontSize: 12, color: 'var(--ink)' }}>{unfinished.scenarioId}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 3 }}>SEED {unfinished.seed} · {unfinished.actionCount} ACTIONS LOGGED</div>
              </div>
              <SoftKey label="Resume →" onClick={() => navigate(`/run/${unfinished.scenarioId}?seed=${unfinished.seed}&role=${role}`)} />
            </div>
          </Panel>
        )}

        {/* ---- Who you are today ---- */}
        <Panel title="Role for the shift" badge={ROLE_POLICY[role].displayName.toUpperCase()}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ROLE_ORDER.map((r) => {
              const unlocked = unlocked_[r];
              return (
                <button
                  key={r}
                  type="button"
                  className={`hud-chip${role === r ? ' is-on hud-chip--orange' : ''}`}
                  title={unlocked ? ROLE_POLICY[r].blurb : `Suggested after ${ROLE_POLICY[r].unlockAfterSessions} completed work orders`}
                  onClick={() => {
                    setRole(r);
                    localStorage.setItem(ROLE_KEY, r);
                  }}
                  style={unlocked ? undefined : { opacity: 0.5 }}
                >
                  {ROLE_POLICY[r].displayName.replace(' Technician', '').replace(' / NOC Lead', '')}
                  {!unlocked && ' ·'}
                </button>
              );
            })}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{ROLE_POLICY[role].blurb}</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
            {([
              ['HINTS', ROLE_POLICY[role].hints.max === Infinity ? 'unlimited' : String(ROLE_POLICY[role].hints.max)],
              ['TRUCK ROLLS', ROLE_POLICY[role].truckRollBudget === Infinity ? 'unlimited' : `${ROLE_POLICY[role].truckRollBudget}${ROLE_POLICY[role].truckRollHardCap ? ' hard cap' : ''}`],
              ['CLOCK', `${Math.round(ROLE_POLICY[role].timeBudgetMultiplier * 100)}%`],
              ['COMMS', ['quiet', 'light', 'busy', 'relentless'][ROLE_POLICY[role].commsIntensity]],
            ] as const).map(([k, v]) => (
              <span key={k} className="mono" style={{ fontSize: 9.5, letterSpacing: 1.2, color: 'var(--ink-faint)' }}>
                {k} <span style={{ color: 'var(--cyan)' }}>{v}</span>
              </span>
            ))}
          </div>
        </Panel>

        {/* ---- Shift card ---- */}
        <Panel
          tone={started ? 'default' : 'alert'}
          title={started ? day.character.tag : 'Shift not started'}
          badge={`DAY SEED ${daySeed}`}
          actions={started ? <button type="button" className="hud-chip" onClick={newDay}>New day</button> : undefined}
        >
          <div className="hud-title" style={{ fontSize: 16, marginBottom: 6, whiteSpace: 'normal' }}>
            {started ? day.character.headline : 'Your queue is waiting.'}
          </div>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
            {started ? day.character.blurb : 'Generate a seeded training day from validated field scenarios. Reloading returns you to the same shift.'}
          </p>
          {!started && (
            <div style={{ marginTop: 14 }}>
              <SoftKey label="▶  Start day" onClick={startDay} />
            </div>
          )}
        </Panel>

        {/* ---- Stat row ---- */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <Panel title="Work orders"><Readout label="CLOSED / ASSIGNED" value={started ? `${closed.length}/${day.orders.length}` : '0/0'} tone="cyan" detail={started ? `${Math.round((closed.length / day.orders.length) * 100)}% of shift queue closed` : 'Start dispatch to build queue'} /></Panel>
          <Panel title="Shift time"><Readout label="REMAINING" value={`${Math.floor(SHIFT_MINUTES / 60)}:00`} tone="amber" detail={started ? `${committed} min committed across the board` : 'Simulated shift time'} /></Panel>
          <Panel title="Plant health" tone={started && stability < 80 ? 'alert' : 'default'}>
            <Readout label="NETWORK STABILITY" value={`${started ? stability : 100}%`} tone={!started || stability >= 80 ? 'green' : stability >= 60 ? 'amber' : 'red'} detail={started && stability < 100 ? 'Active service risk requires attention' : 'Plant and services nominal'} />
          </Panel>
        </div>

        {/* ---- The board ---- */}
        {started && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="eyebrow" style={{ color: 'var(--cyan)' }}>Today&apos;s queue</span>
              <span style={{ flex: 1 }} />
              <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>{day.orders.length} ASSIGNED</span>
            </div>
            {day.orders.map((order) => (
              <OrderCard
                key={order.ticket}
                order={order}
                lead={order.ticket === leadTicket}
                done={closed.includes(order.ticket)}
                onEnter={() => navigate(`/run/${order.scenarioId}?seed=${order.seed}&role=${role}`)}
              />
            ))}
          </div>
        )}

        {/* ---- Training record ---- */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <Panel title="Current streak"><Readout label="CONSECUTIVE DAYS" value={currentStreak} unit={currentStreak === 1 ? 'day' : 'days'} tone="orange" detail={`Personal best · ${bestStreak} ${bestStreak === 1 ? 'day' : 'days'}`} /></Panel>
          <Panel title="Weakest domain">
            <div className="hud-title" style={{ fontSize: 17, whiteSpace: 'normal' }}>{weakest ? weakest.domain : 'No baseline'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 5 }}>
              {weakest ? `Accuracy ${Math.round(weakest.accuracy)} · evidence ${Math.round(weakest.evidence)} across ${weakest.sessionCount} session(s)` : 'Complete a work order to establish it'}
            </div>
          </Panel>
        </div>

        <Link to="/scenarios" style={{ textDecoration: 'none' }}>
          <Panel title="Scenario laboratory" badge="PRACTICE">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-soft)' }}>Practise a specific tier, focus or seed outside your dispatch queue.</span>
              <span className="mono" style={{ fontSize: 18, color: 'var(--cyan)' }}>›</span>
            </div>
          </Panel>
        </Link>

        <footer style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: '1px solid var(--cyan-line)' }}>
          <span className="pulse-dot" style={{ width: 6, height: 6 }} />
          <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>LOCAL-FIRST · OFFLINE READY</span>
          <span style={{ flex: 1 }} />
          <Link to="/history" className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--cyan)', textDecoration: 'none' }}>
            TRAINING RECORD ›
          </Link>
        </footer>
      </div>
    </div>
  );
}
