/**
 * The construction and maintenance board.
 *
 * The fault queue above it is the bad day. This is the rest of the week — splices, hub
 * builds, dressing, testing, and calling in locates for work that has not started yet.
 *
 * The board's real job is triage, not decoration. Every card answers one question before
 * you drive anywhere: can this start today, and if not, which of the three things is
 * stopping it — the kit, your grade, or a locate that has not been served. Finding the
 * second blocker after you have driven out is the wasted roll the whole simulator exists to
 * prevent, so all three are shown together.
 *
 * Where a job has a bench behind it, the card opens it. Where it does not, the card says so
 * rather than offering a button that goes nowhere.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  buildConstructionDay,
  readiness,
  STANDARD_RIG,
  type JobKind,
  type WorkOrder,
} from '../../operations/dispatch';
import { canExcavate, LEGAL_BASIS } from '../../operations/digalert';
import type { Role } from '../../session/roles';
import { BENCH_LABEL, standings, type BenchRun } from '../../operations/benchRecord';
import { listBenchRuns } from '../store/persistence';

/** Jobs that have somewhere to go. Everything else is honest about not being built yet. */
const BENCH: Partial<Record<JobKind, { to: string; label: string }>> = {
  'ribbon-splice': { to: '/bench/run', label: 'Work the case →' },
  'closure-dress': { to: '/bench/tray', label: 'Open the case →' },
  'acceptance-test': { to: '/bench/test', label: 'Open the acceptance bench →' },
  'locate-mark': { to: '/bench/locate', label: 'Answer the ticket →' },
};

const KIND_TAG: Record<JobKind, string> = {
  'ribbon-splice': 'SPLICE',
  'closure-dress': 'DRESS',
  'fdh-build': 'BUILD',
  'idf-build': 'BUILD',
  'pop-equipment': 'TURN-UP',
  'acceptance-test': 'TEST',
  'locate-request': 'PLAN',
  'locate-mark': 'LOCATE',
  outage: 'OUTAGE',
};

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** The locate, stated the way a crew would say it out loud. */
function LocateChip({ order, now }: { order: WorkOrder; now: Date }) {
  if (!order.breaksGround) return null;
  const dig = canExcavate(order.locate, now);

  const tone =
    dig.status === 'valid' ? 'var(--green)' : dig.status === 'waiting' ? 'var(--amber)' : 'var(--red)';
  const text =
    dig.status === 'valid' ? `${order.locate?.id} · VALID`
    : dig.status === 'waiting' ? `${order.locate?.id} · ${dig.daysToWait}D TO GO`
    : dig.status === 'expired' ? `${order.locate?.id} · EXPIRED`
    : 'NO LOCATE TICKET';

  return (
    <span className="mono"
          style={{ fontSize: 9.5, letterSpacing: 1.3, color: tone, border: `1px solid ${tone}`, padding: '2px 7px' }}>
      ⚑ {text}
    </span>
  );
}

function Card({ order, role, now }: { order: WorkOrder; role: Role; now: Date }) {
  const r = readiness(order, role, STANDARD_RIG, now);
  const bench = BENCH[order.kind];

  return (
    <div className={`bezel${r.ready ? '' : ' flat'}`} style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="mono"
              style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: '2px 7px', color: 'var(--cyan)', border: '1px solid var(--cyan-line)' }}>
          {KIND_TAG[order.kind]}
        </span>
        <span className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-faint)' }}>{order.ticket}</span>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--ink-soft)' }}>{hhmm(order.minutes)}</span>
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.3, color: 'var(--ink-faint)' }}>{order.minRole.toUpperCase()}+</span>
      </div>

      <div>
        <div className="hud-title" style={{ fontSize: 14, whiteSpace: 'normal' }}>{order.title}</div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: 'var(--cyan)', marginTop: 4 }}>
          {order.location.toUpperCase()}
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-soft)' }}>{order.brief}</p>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <LocateChip order={order} now={now} />
        {r.ready ? (
          <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.4, color: 'var(--green)', border: '1px solid var(--green)', padding: '2px 7px' }}>
            ✓ READY TO ROLL
          </span>
        ) : (
          r.blocked.map((b) => (
            <span key={b} className="mono"
                  style={{ fontSize: 9.5, letterSpacing: 1.4, color: 'var(--red)', border: '1px solid var(--red)', padding: '2px 7px' }}>
              ✕ {b.toUpperCase()}
            </span>
          ))
        )}
      </div>

      {!r.ready && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 5 }}>
          {r.reasons.map((reason, i) => (
            <li key={i} style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink-soft)', borderLeft: '2px solid var(--red)', paddingLeft: 9 }}>
              {reason}
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
        {bench ? (
          <Link to={bench.to} className="hud-btn" style={{ textDecoration: 'none', display: 'inline-block' }}>
            {bench.label}
          </Link>
        ) : (
          <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.2, color: 'var(--ink-faint)' }}>
            BENCH NOT BUILT YET — ENGINE ONLY
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Bench work, folded back into the day.
 *
 * The point of recording practice is that it changes what dispatch can tell you about
 * yourself. The weakest standing is shown with the number of runs behind it, because one
 * bad tray is not a competency problem and a readout that cannot say so sends people to
 * practise the wrong thing.
 */
function BenchRecord() {
  const [runs, setRuns] = useState<BenchRun[] | null>(null);

  useEffect(() => {
    let alive = true;
    void listBenchRuns(50).then((r) => { if (alive) setRuns(r); }).catch(() => { if (alive) setRuns([]); });
    return () => { alive = false; };
  }, []);

  if (runs === null || runs.length === 0) return null;

  const weakest = standings(runs)[0];
  const last = runs[0];

  return (
    <div className="bezel" style={{ padding: '11px 13px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
      <div>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>BENCH RUNS LOGGED</div>
        <div className="readout" style={{ fontSize: 22, color: 'var(--cyan)', marginTop: 3 }}>{runs.length}</div>
      </div>
      <div>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>LAST</div>
        <div style={{ fontSize: 12.5, marginTop: 4 }}>
          {BENCH_LABEL[last.kind]} · <span style={{ color: last.score >= 85 ? 'var(--green)' : last.score >= 60 ? 'var(--amber)' : 'var(--red)' }}>{last.score}/100</span>
        </div>
      </div>
      {weakest && (
        <div>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>WEAKEST AT THE BENCH</div>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>
            {weakest.domain} · {weakest.average}/100
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}> ({weakest.runs} run{weakest.runs === 1 ? '' : 's'})</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConstructionBoard({ daySeed, role }: { daySeed: number; role: Role }) {
  // Pinned once so the board does not re-roll or re-date itself on every render.
  const now = useMemo(() => new Date(), []);
  const orders = useMemo(() => buildConstructionDay(daySeed, now, 4), [daySeed, now]);

  const blocked = orders.filter((o) => !readiness(o, role, STANDARD_RIG, now).ready).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="eyebrow" style={{ color: 'var(--orange)' }}>Construction &amp; maintenance</span>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: blocked > 0 ? 'var(--red)' : 'var(--ink-faint)' }}>
          {blocked > 0 ? `${blocked} OF ${orders.length} BLOCKED` : `${orders.length} READY`}
        </span>
      </div>

      <BenchRecord />

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {orders.map((o) => <Card key={o.ticket} order={o} role={role} now={now} />)}
      </div>

      <p className="mono" style={{ fontSize: 9.5, lineHeight: 1.75, color: 'var(--ink-faint)', letterSpacing: 0.6, margin: '2px 0 0' }}>
        BLOCKERS ARE SHOWN TOGETHER, NOT ONE AT A TIME — FINDING THE SECOND ONE AFTER YOU HAVE DRIVEN OUT IS THE WASTED ROLL.
        EXCAVATION IS GATED ON {LEGAL_BASIS.statute.toUpperCase()}: {LEGAL_BASIS.noticeWorkingDays} WORKING DAYS OF NOTICE, {LEGAL_BASIS.ticketLifeDays}-DAY TICKET.
      </p>
    </div>
  );
}
