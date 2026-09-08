/**
 * The splice bench.
 *
 * Works one ribbon through the whole procedure — setup, the twelve-step loop, closeout —
 * offering at every step the choice that is actually on the table: do it properly, or take
 * the shortcut that looks free at the time.
 *
 * The payoff is the trace at the fuse. Twelve fibres, twelve readings, drawn against the
 * acceptance lines — and because the model knows WHICH fibres each defect touches, the
 * shape of that chart is the diagnosis. Contamination lifts every bar together. A tired
 * blade spikes a scattered few. An uneven glue matrix takes the outer two and leaves the
 * middle alone. A trainee who learns to read those three shapes can tell which tool to pick
 * up without opening anything.
 *
 * Nothing here re-implements the rules: the steps, the mistakes, the losses and the timings
 * all come from operations/ribbon.ts, which was audited against an hour of the real job.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ACCEPT_MAX_DB,
  ACCEPT_MEAN_DB,
  elapsedSeconds,
  PHASES,
  PROCEDURE,
  spliceLoss,
  type Mistake,
  type Phase,
  type StepId,
} from '../../operations/ribbon';

const PHASE_LABEL: Record<Phase, string> = {
  setup: 'Setup · once a day',
  'per-ribbon': 'The loop · once per ribbon',
  closeout: 'Closeout · once per tray',
};

/**
 * The standard fibre colour order. Fibre 8 is black, and black on this ground is an
 * invisible bar — so it is lifted to the darkest slate that still reads as "the black one".
 * Every bar also carries a hairline outline, because a chart whose whole job is showing a
 * SHAPE cannot afford a column that disappears.
 */
const FIBRE_COLORS = [
  '#3b82f6', '#f97316', '#22c55e', '#a16207', '#94a3b8', '#e2e8f0',
  '#ef4444', '#454f63', '#eab308', '#a855f7', '#f472b6', '#22d3ee',
];

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Twelve readings against the two lines that decide them. */
function LossChart({ loss }: { loss: number[] }) {
  const worst = Math.max(...loss, ACCEPT_MAX_DB * 1.15);
  const top = Math.ceil(worst * 20) / 20;
  const H = 132;
  const y = (v: number) => H - (v / top) * H;

  return (
    <svg viewBox={`0 0 320 ${H + 30}`} style={{ width: '100%', height: 'auto' }} role="img"
         aria-label={`Twelve fibre losses, worst ${Math.max(...loss).toFixed(3)} dB`}>
      {/* acceptance lines — every label names a value the chart reaches */}
      <line x1="30" y1={y(ACCEPT_MAX_DB)} x2="318" y2={y(ACCEPT_MAX_DB)} stroke="var(--red)" strokeWidth="1" strokeDasharray="4 3" />
      <text x="28" y={y(ACCEPT_MAX_DB) + 3} textAnchor="end" fontSize="8" fill="var(--red)" fontFamily="var(--font-mono)">{ACCEPT_MAX_DB.toFixed(2)}</text>
      <line x1="30" y1={y(ACCEPT_MEAN_DB)} x2="318" y2={y(ACCEPT_MEAN_DB)} stroke="var(--amber)" strokeWidth="1" strokeDasharray="4 3" />
      <text x="28" y={y(ACCEPT_MEAN_DB) + 3} textAnchor="end" fontSize="8" fill="var(--amber)" fontFamily="var(--font-mono)">{ACCEPT_MEAN_DB.toFixed(2)}</text>
      <line x1="30" y1={H} x2="318" y2={H} stroke="var(--ink-faint)" strokeWidth="1" />
      <text x="28" y={H + 3} textAnchor="end" fontSize="8" fill="var(--ink-faint)" fontFamily="var(--font-mono)">0</text>

      {loss.map((v, i) => {
        const bw = 20;
        const x = 34 + i * 23.6;
        const over = v > ACCEPT_MAX_DB;
        return (
          <g key={i}>
            <rect x={x} y={y(v)} width={bw} height={H - y(v)}
                  fill={over ? 'var(--red)' : FIBRE_COLORS[i]} opacity={over ? 0.95 : 0.85}
                  stroke="rgba(226,241,255,0.35)" strokeWidth="0.6" />
            <text x={x + bw / 2} y={H + 12} textAnchor="middle" fontSize="7.5" fill="var(--ink-faint)" fontFamily="var(--font-mono)">{i + 1}</text>
            <text x={x + bw / 2} y={y(v) - 3} textAnchor="middle" fontSize="7" fill={over ? 'var(--red)' : 'var(--ink-soft)'} fontFamily="var(--font-mono)">
              {v.toFixed(2)}
            </text>
          </g>
        );
      })}
      <text x="174" y={H + 25} textAnchor="middle" fontSize="8" fill="var(--ink-faint)" fontFamily="var(--font-mono)" letterSpacing="1.4">
        FIBRE · dB ESTIMATED LOSS
      </text>
    </svg>
  );
}

export function SpliceBench() {
  const [seed] = useState(() => 1 + Math.floor(Math.random() * 9999));
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<StepId[]>([]);
  const [mistakes, setMistakes] = useState<string[]>([]);

  const finished = index >= PROCEDURE.length;
  const current = finished ? null : PROCEDURE[index];

  const outcome = useMemo(() => spliceLoss(seed, 12, mistakes), [seed, mistakes]);
  const spent = useMemo(() => elapsedSeconds(done, mistakes), [done, mistakes]);
  const readingsVisible = done.includes('inspect-loss');

  const chosen = useMemo(
    () => PROCEDURE.flatMap((s) => s.mistakes.filter((m) => mistakes.includes(m.id)).map((m) => ({ ...m, stepTitle: s.title }))),
    [mistakes],
  );

  const take = (id: StepId, mistake?: Mistake) => {
    setDone((d) => [...d, id]);
    if (mistake) setMistakes((m) => [...m, mistake.id]);
    setIndex((i) => i + 1);
  };

  const restart = () => { setIndex(0); setDone([]); setMistakes([]); };

  return (
    <div style={{ minHeight: '100%', padding: '18px 14px 40px', maxWidth: 1180, margin: '0 auto' }}>
      <div className="eyebrow">Bench · ribbon splicing</div>
      <h1 className="hud-title" style={{ fontSize: 'clamp(20px, 5vw, 30px)', margin: '10px 0 0', letterSpacing: 2 }}>
        Splice the ribbon.
      </h1>
      <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)', maxWidth: '64ch' }}>
        One 12-fibre ribbon out of a 432-to-432 butt splice. Every step offers what is really
        on the table — do it properly, or take the shortcut that costs nothing until it does.
        The readings at the end are the consequence of what you chose.
      </p>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0,1fr)', marginTop: 18 }}>

        {/* -------- the step -------- */}
        {current && (
          <section className="bezel" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="eyebrow" style={{ color: 'var(--orange)' }}>{PHASE_LABEL[current.phase]}</span>
              <span style={{ flex: 1 }} />
              <span className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-faint)' }}>
                STEP {index + 1} / {PROCEDURE.length} · {current.tool.toUpperCase()}
              </span>
            </div>

            <h2 className="hud-title" style={{ fontSize: 17, margin: '10px 0 0', whiteSpace: 'normal' }}>{current.title}</h2>
            <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)', maxWidth: '66ch' }}>{current.why}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              <button type="button" className="hud-btn hud-btn--cyan" style={{ textAlign: 'left' }}
                      onClick={() => take(current.id)}>
                ✓ Do it properly · {mmss(current.seconds)}
              </button>

              {current.mistakes.map((m) => (
                <button key={m.id} type="button" className="hud-btn" style={{ textAlign: 'left', borderColor: 'var(--line)' }}
                        onClick={() => take(current.id, m)}>
                  <span style={{ color: 'var(--amber)' }}>↷ {m.label}</span>
                  {m.rework && <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', marginLeft: 8 }}>+{mmss(m.reworkSeconds ?? 0)} REWORK</span>}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* -------- the readings -------- */}
        <section className="bezel" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="eyebrow" style={{ color: 'var(--cyan)' }}>Splicer readout</span>
            <span style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 10.5, letterSpacing: 1.3, color: 'var(--ink-soft)' }}>ON THE CLOCK {mmss(spent)}</span>
          </div>

          {readingsVisible ? (
            <>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '10px 0 6px' }}>
                <span className="mono" style={{ fontSize: 12, color: outcome.pass ? 'var(--green)' : 'var(--red)' }}>
                  {outcome.pass ? 'SET PASSES' : 'SET FAILS'}
                </span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>MEAN {outcome.meanDb.toFixed(3)} dB</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>WORST {outcome.worstDb.toFixed(3)} dB</span>
                {outcome.failed.length > 0 && (
                  <span className="mono" style={{ fontSize: 12, color: 'var(--red)' }}>
                    OVER LIMIT · FIBRE {outcome.failed.map((i) => i + 1).join(', ')}
                  </span>
                )}
              </div>
              <LossChart loss={outcome.lossDb} />
              <p className="mono" style={{ fontSize: 9.5, lineHeight: 1.7, color: 'var(--ink-faint)', letterSpacing: 0.6, margin: '4px 0 0' }}>
                THE SHAPE IS THE DIAGNOSIS. EVERY BAR UP TOGETHER IS CONTAMINATION OR A BAD ARC.
                A SCATTERED FEW IS THE CLEAVER BLADE. THE OUTER TWO ONLY IS AN UNEVEN GLUE MATRIX.
              </p>
            </>
          ) : (
            <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-faint)' }}>
              Nothing to read until the ribbon is fused and you look at the estimate. What you do
              before then is what the numbers will say.
            </p>
          )}
        </section>

        {/* -------- debrief -------- */}
        {finished && (
          <section className={`bezel${chosen.length === 0 ? '' : ' alert'}`} style={{ padding: 14 }}>
            <div className="eyebrow" style={{ color: chosen.length === 0 ? 'var(--green)' : 'var(--orange)' }}>
              Debrief
            </div>
            <h2 className="hud-title" style={{ fontSize: 16, margin: '8px 0 0' }}>
              {chosen.length === 0
                ? 'Clean ribbon, clean paperwork.'
                : `${chosen.length} shortcut${chosen.length === 1 ? '' : 's'} taken.`}
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-soft)' }}>
              {chosen.length === 0
                ? 'Every step done as it should be. Twelve fibres, no re-burns, and a tray someone can re-enter in five years.'
                : 'Each of these looked free at the moment you took it. Here is when you would actually find out.'}
            </p>

            {chosen.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 9 }}>
                {chosen.map((m) => (
                  <li key={m.id} style={{ borderLeft: `2px solid ${m.rework ? 'var(--red)' : 'var(--amber)'}`, paddingLeft: 10 }}>
                    <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: m.rework ? 'var(--red)' : 'var(--amber)' }}>
                      {m.stepTitle.toUpperCase()}
                      {m.addedLossDb ? ` · +${m.addedLossDb.toFixed(2)} dB` : ''}
                      {m.rework ? ` · +${mmss(m.reworkSeconds ?? 0)}` : ''}
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 2, color: 'var(--ink)' }}>{m.label}</div>
                    <div style={{ fontSize: 12, lineHeight: 1.5, marginTop: 2, color: 'var(--ink-soft)' }}>{m.consequence}</div>
                  </li>
                ))}
              </ul>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button type="button" className="hud-btn hud-btn--cyan" onClick={restart}>Run another ribbon</button>
              <Link to="/bench/tray" className="hud-btn" style={{ textDecoration: 'none' }}>Tray bench →</Link>
            </div>
          </section>
        )}

        {/* -------- progress rail -------- */}
        <section className="bezel" style={{ padding: 12 }}>
          <div className="eyebrow" style={{ color: 'var(--cyan)' }}>Procedure</div>
          <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
            {PHASES.map((phase) => (
              <div key={phase}>
                <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>
                  {PHASE_LABEL[phase].toUpperCase()}
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                  {PROCEDURE.filter((s) => s.phase === phase).map((s) => {
                    const isDone = done.includes(s.id);
                    const isNow = current?.id === s.id;
                    const slipped = s.mistakes.some((m) => mistakes.includes(m.id));
                    const tone = isNow ? 'var(--orange)' : slipped ? 'var(--amber)' : isDone ? 'var(--green)' : 'var(--ink-faint)';
                    return (
                      <span key={s.id} className="mono" title={s.title}
                            style={{ fontSize: 9.5, letterSpacing: 0.8, padding: '3px 7px', border: `1px solid ${tone}`, color: tone, opacity: isDone || isNow ? 1 : 0.5 }}>
                        {isDone ? (slipped ? '↷' : '✓') : isNow ? '▸' : '·'} {s.title.split(/[ —]/)[0]}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 18, flexWrap: 'wrap' }}>
        <Link to="/" className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-faint)', textDecoration: 'none' }}>
          ← BACK TO DISPATCH
        </Link>
        <span className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-faint)' }}>SEED {seed}</span>
      </div>
    </div>
  );
}
