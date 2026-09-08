/**
 * The tray bench.
 *
 * Dressing is the part of the job that is judged by eye, so it has to be *done* by eye. The
 * drawing is not an illustration of the model — it is rendered from the same placements the
 * inspector reads, so a route that looks tight is tight, and the verdict beside it is
 * talking about the shape you can see.
 *
 * The two decisions per fibre are the two that decide a tray: does it go round the radius
 * limiter or straight across, and is there real slack stored or just enough to reach. Both
 * are cheap to get right and expensive to get wrong, which is exactly why they get skipped.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  judgeTray,
  MIN_BEND_RADIUS_MM,
  MIN_SLACK_MM,
  type FibrePlacement,
  type Tray,
} from '../../operations/tray';
import { DEFAULT_PROFILE } from '../../operations/acceptance';
import { BENCH_DOMAINS, scoreTrayRun } from '../../operations/benchRecord';
import { getOrCreateTraineeId, saveBenchRun } from '../store/persistence';

/** Standard buffer-tube colour order, which is also the order fibres are worked. */
const TUBE_ORDER = ['blue', 'orange', 'green', 'brown', 'slate', 'white'] as const;
const TUBE_HEX: Record<string, string> = {
  blue: '#3b82f6', orange: '#f97316', green: '#22c55e',
  brown: '#a16207', slate: '#94a3b8', white: '#e2e8f0',
};

const HOLDERS = 6;

/** A fibre as the bench holds it: the two real choices, plus where it is seated. */
interface Row {
  tube: string;
  fibre: number;
  holder: number | null;
  viaLimiter: boolean;
  coiledSlack: boolean;
}

function toPlacement(r: Row): FibrePlacement {
  return {
    tube: r.tube,
    fibre: r.fibre,
    holder: r.holder,
    // Routing round the limiter is what keeps the radius legal; straight across a tray of
    // this size forces roughly half the minimum.
    bendRadiusMm: r.viaLimiter ? 42 : 16,
    slackMm: r.coiledSlack ? 1050 : 380,
    crossesOthers: !r.viaLimiter,
  };
}

const START: Row[] = TUBE_ORDER.slice(0, 4).map((t, i) => ({
  tube: t, fibre: i + 1, holder: i + 1, viaLimiter: true, coiledSlack: true,
}));

export function TrayBench() {
  const [rows, setRows] = useState<Row[]>(START);
  const [labelled, setLabelled] = useState(true);

  const tray: Tray = useMemo(
    () => ({ id: 'TRAY-1', holders: HOLDERS, placements: rows.map(toPlacement) }),
    [rows],
  );
  const verdict = useMemo(() => judgeTray(tray, labelled), [tray, labelled]);

  // A tray has no natural finish the way a ribbon does — you stop when you are satisfied —
  // so the trainee signs it off explicitly. That is also what happens on a real job.
  const [signedOff, setSignedOff] = useState<number | null>(null);
  const score = useMemo(() => scoreTrayRun(verdict), [verdict]);

  const signOff = () => {
    setSignedOff(score);
    void (async () => {
      try {
        await saveBenchRun({
          id: crypto.randomUUID(),
          traineeId: await getOrCreateTraineeId(),
          kind: 'tray-dress',
          at: new Date().toISOString(),
          seed: 0,
          mistakes: verdict.issues.map((i) => i.code),
          omitted: [],
          seconds: 0,
          passed: verdict.accepted,
          score,
          domains: BENCH_DOMAINS['tray-dress'],
        });
      } catch {
        // A bench that cannot write its record is still a usable bench.
      }
    })();
  };

  const set = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div style={{ minHeight: '100%', padding: '18px 14px 40px', maxWidth: 1100, margin: '0 auto' }}>
      <div className="eyebrow">Bench · splice tray dressing</div>
      <h1 className="hud-title" style={{ fontSize: 'clamp(20px, 5vw, 30px)', margin: '10px 0 0', letterSpacing: 2 }}>
        Dress the tray.
      </h1>
      <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)', maxWidth: '62ch' }}>
        Two choices per fibre. Route it round the radius limiter or straight across the tray,
        and store real slack or just enough to reach. Everything the inspector says is about
        the shape drawn below — there is nothing behind the curtain.
      </p>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr', marginTop: 18 }}>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0,1fr)' }}>

          {/* ---------- the tray ---------- */}
          <section className="bezel" style={{ padding: 12 }}>
            <div className="eyebrow" style={{ color: 'var(--cyan)' }}>Tray 1 · {HOLDERS} holders</div>
            <svg viewBox="0 0 520 300" style={{ width: '100%', height: 'auto', marginTop: 8 }} role="img"
                 aria-label={`Splice tray with ${rows.length} fibres routed. ${verdict.summary}`}>
              {/* tray body */}
              <rect x="10" y="10" width="500" height="280" rx="10" fill="rgba(127,212,232,0.03)" stroke="var(--ink-faint)" strokeWidth="1.5" />
              {/* radius limiters: the moulded curves fibre is meant to follow */}
              <circle cx="95" cy="80" r="46" fill="none" stroke="var(--ink-faint)" strokeWidth="1" strokeDasharray="4 4" />
              <circle cx="95" cy="220" r="46" fill="none" stroke="var(--ink-faint)" strokeWidth="1" strokeDasharray="4 4" />
              <text x="95" y="84" textAnchor="middle" fontSize="8" fill="var(--ink-faint)" fontFamily="var(--font-mono)">LIMITER</text>

              {/* holder rail */}
              <rect x="228" y="40" width="64" height="230" rx="4" fill="rgba(0,0,0,0.25)" stroke="var(--ink-faint)" strokeWidth="1" />
              {Array.from({ length: HOLDERS }, (_, h) => (
                <g key={h}>
                  <rect x="236" y={50 + h * 35} width="48" height="22" rx="2" fill="rgba(127,212,232,0.05)" stroke="var(--ink-faint)" strokeWidth="0.8" />
                  <text x="260" y={65 + h * 35} textAnchor="middle" fontSize="8" fill="var(--ink-faint)" fontFamily="var(--font-mono)">{h + 1}</text>
                </g>
              ))}

              {/* The fibres, drawn from the same placements the inspector reads.
                  Routes nest around the limiter rather than converging on a point, because
                  that nesting IS what dressed fibre looks like — parallel, never crossing,
                  each one liftable without disturbing its neighbours. */}
              {rows.map((r, idx) => {
                if (r.holder === null) return null;
                const entryY = 58 + idx * 34;
                const holderY = 61 + (r.holder - 1) * 35;
                const hex = TUBE_HEX[r.tube] ?? '#7fd4e8';
                const tight = !r.viaLimiter;
                const upper = holderY < 150;
                // Nest each route a little further out than the one before it.
                const nest = idx * 7;

                const path = r.viaLimiter
                  // Sweep out around the limiter and back into the holder: one continuous
                  // curve, no corners, radius held wide the whole way.
                  ? `M 28 ${entryY} C ${70 - nest} ${entryY}, ${58 + nest} ${upper ? 44 - nest : 256 + nest}, ${132 + nest} ${upper ? 52 - nest : 248 + nest} C ${190 + nest} ${upper ? 60 - nest : 240 + nest}, 206 ${holderY}, 228 ${holderY}`
                  // Straight across and a hard dogleg into the holder — the tight corner is
                  // the whole point, so it is drawn as a corner.
                  : `M 28 ${entryY} L 168 ${entryY} L 186 ${holderY} L 228 ${holderY}`;

                // Slack lives out at the limiter, clear of the rail and of other coils.
                const coilX = 96 + idx * 9;
                const coilY = upper ? 96 + idx * 4 : 208 - idx * 4;

                return (
                  <g key={`${r.tube}-${r.fibre}`}>
                    <path d={path} fill="none" stroke={hex} strokeWidth={tight ? 2.4 : 2}
                          strokeLinecap="round" strokeLinejoin="round"
                          strokeDasharray={tight ? '7 4' : undefined} opacity={tight ? 1 : 0.95} />
                    {r.coiledSlack && (
                      <circle cx={coilX} cy={coilY} r={15 + idx} fill="none" stroke={hex} strokeWidth="1.4" opacity="0.55" />
                    )}
                    {tight && (
                      <circle cx="168" cy={entryY} r="8" fill="none" stroke="var(--red)" strokeWidth="1.8">
                        <title>Bend inside the {MIN_BEND_RADIUS_MM} mm minimum</title>
                      </circle>
                    )}
                    <circle cx="28" cy={entryY} r="3.5" fill={hex} />
                    <text x="15" y={entryY + 3} fontSize="8" fill="var(--ink-faint)"
                          fontFamily="var(--font-mono)" textAnchor="middle">{r.fibre}</text>
                  </g>
                );
              })}
            </svg>
          </section>

          {/* ---------- controls ---------- */}
          <section className="bezel" style={{ padding: 12 }}>
            <div className="eyebrow" style={{ color: 'var(--cyan)' }}>Routing</div>
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {rows.map((r, i) => (
                <div key={`${r.tube}-${r.fibre}`}
                     style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', border: '1px solid var(--line)' }}>
                  <span style={{ width: 10, height: 10, background: TUBE_HEX[r.tube], flexShrink: 0 }} />
                  <span className="mono" style={{ fontSize: 11, letterSpacing: 1, minWidth: 96 }}>
                    {r.tube.toUpperCase()} {r.fibre}
                  </span>

                  <label className="mono" style={{ fontSize: 10, letterSpacing: 1, color: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    HOLDER
                    <select value={r.holder ?? ''} onChange={(e) => set(i, { holder: e.target.value === '' ? null : Number(e.target.value) })}
                            style={{ background: 'var(--bg-panel)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '4px 6px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      <option value="">loose</option>
                      {Array.from({ length: HOLDERS }, (_, h) => <option key={h} value={h + 1}>{h + 1}</option>)}
                    </select>
                  </label>

                  <button type="button" className={`hud-chip${r.viaLimiter ? ' is-on' : ''}`} aria-pressed={r.viaLimiter}
                          onClick={() => set(i, { viaLimiter: !r.viaLimiter })}>
                    {r.viaLimiter ? 'Round the limiter' : 'Straight across'}
                  </button>

                  <button type="button" className={`hud-chip${r.coiledSlack ? ' is-on' : ''}`} aria-pressed={r.coiledSlack}
                          onClick={() => set(i, { coiledSlack: !r.coiledSlack })}>
                    {r.coiledSlack ? 'Slack coiled' : 'Just reaches'}
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" className={`hud-chip${labelled ? ' is-on' : ''}`} aria-pressed={labelled}
                      onClick={() => setLabelled(!labelled)}>
                {labelled ? 'Tray labelled' : 'Not labelled'}
              </button>
              <button type="button" className="hud-btn" onClick={() => { setSignedOff(null); setRows(START.map((r) => ({ ...r }))); }}>Reset</button>
          <button type="button" className="hud-btn hud-btn--cyan" onClick={signOff}>
            {signedOff === null ? 'Sign the tray off' : `Signed off · ${signedOff}/100`}
          </button>
              <button type="button" className="hud-btn"
                      onClick={() => setRows((p) => p.map((r) => ({ ...r, viaLimiter: false, coiledSlack: false })))}>
                Rush it
              </button>
            </div>
          </section>
        </div>

        {/* ---------- verdict ---------- */}
        <section className={`bezel${verdict.accepted ? '' : ' alert'}`} style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="hud-title" style={{ fontSize: 16, color: verdict.accepted ? 'var(--green)' : 'var(--red)' }}>
              {verdict.accepted ? 'ACCEPTED' : 'NOT ACCEPTED'}
            </span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
              {verdict.defects} defect{verdict.defects === 1 ? '' : 's'} · {verdict.workmanship} workmanship
            </span>
            <span style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 11, color: verdict.addedLossDb > 0 ? 'var(--amber)' : 'var(--ink-faint)' }}>
              DRESSING ADDS {verdict.addedLossDb.toFixed(3)} dB
            </span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55 }}>{verdict.summary}</p>

          {verdict.issues.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 8 }}>
              {verdict.issues.map((iss, n) => (
                <li key={n} style={{ borderLeft: `2px solid ${iss.severity === 'defect' ? 'var(--red)' : 'var(--amber)'}`, paddingLeft: 10 }}>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: 1.3, color: iss.severity === 'defect' ? 'var(--red)' : 'var(--amber)' }}>
                    {iss.severity === 'defect' ? 'DEFECT' : 'WORKMANSHIP'} · {iss.where.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 2, color: 'var(--ink-soft)' }}>{iss.detail}</div>
                </li>
              ))}
            </ul>
          )}

          <p className="mono" style={{ fontSize: 10, lineHeight: 1.7, color: 'var(--ink-faint)', marginTop: 14, letterSpacing: 0.5 }}>
            DEFECTS BLOCK ACCEPTANCE. WORKMANSHIP DOES NOT — IT IS CHARGED TO WHOEVER OPENS THIS NEXT.
            MINIMUM BEND RADIUS {MIN_BEND_RADIUS_MM} MM · WORKABLE SLACK {MIN_SLACK_MM} MM · JUDGED AGAINST {DEFAULT_PROFILE.name.toUpperCase()}
          </p>
        </section>
      </div>

      <div style={{ marginTop: 18 }}>
        <Link to="/" className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-faint)', textDecoration: 'none' }}>
          ← BACK TO DISPATCH
        </Link>
      </div>
    </div>
  );
}
