/**
 * Ribbon run — the splice bench as a job rather than a checklist.
 *
 * Twelve ribbons, six hours, and a machine that will not tell you what is wrong with it.
 * You read the evidence, pick an intervention, and pay for it in minutes either way. The
 * loss chart is the instrument, not decoration: its shape is the only thing distinguishing
 * a worn blade from an uncalibrated arc.
 *
 * Nothing on screen names a cause until the shift is over.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  applyIntervention,
  attemptSplice,
  CONDITION_LABEL,
  INTERVENTIONS,
  nextRibbon,
  pace,
  RUN_MAX_DB,
  RUN_MEAN_DB,
  SHIFT_SECONDS,
  startRun,
  type AttemptResult,
  type RunState,
} from '../../operations/spliceRun';
import { BENCH_DOMAINS } from '../../operations/benchRecord';
import { getOrCreateTraineeId, saveBenchRun } from '../store/persistence';

function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** The instrument. Reading its shape is the entire skill this bench trains. */
function Trace({ loss }: { loss: number[] }) {
  if (loss.length === 0) return null;
  const top = Math.max(0.3, Math.ceil(Math.max(...loss) * 20) / 20);
  const H = 108;
  const y = (v: number) => H - (v / top) * H;

  return (
    <svg viewBox={`0 0 320 ${H + 22}`} style={{ width: '100%', height: 'auto' }} role="img"
         aria-label={`Twelve fibre readings, worst ${Math.max(...loss).toFixed(3)} dB`}>
      <line x1="26" y1={y(RUN_MAX_DB)} x2="318" y2={y(RUN_MAX_DB)} stroke="var(--red)" strokeWidth="1" strokeDasharray="4 3" />
      <text x="24" y={y(RUN_MAX_DB) + 3} textAnchor="end" fontSize="7.5" fill="var(--red)" fontFamily="var(--font-mono)">{RUN_MAX_DB.toFixed(2)}</text>
      <line x1="26" y1={y(RUN_MEAN_DB)} x2="318" y2={y(RUN_MEAN_DB)} stroke="var(--amber)" strokeWidth="1" strokeDasharray="4 3" />
      <text x="24" y={y(RUN_MEAN_DB) + 3} textAnchor="end" fontSize="7.5" fill="var(--amber)" fontFamily="var(--font-mono)">{RUN_MEAN_DB.toFixed(2)}</text>
      <line x1="26" y1={H} x2="318" y2={H} stroke="var(--ink-faint)" strokeWidth="1" />
      {loss.map((v, i) => {
        const x = 30 + i * 24;
        const over = v > RUN_MAX_DB;
        return (
          <g key={i}>
            <rect x={x} y={y(v)} width={19} height={H - y(v)}
                  fill={over ? 'var(--red)' : 'var(--cyan)'} opacity={over ? 0.95 : 0.75}
                  stroke="rgba(226,241,255,0.3)" strokeWidth="0.6" />
            <text x={x + 9.5} y={H + 11} textAnchor="middle" fontSize="7" fill="var(--ink-faint)" fontFamily="var(--font-mono)">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function SpliceRun() {
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 9999));
  const [state, setState] = useState<RunState>(() => startRun(seed, 12));
  const [last, setLast] = useState<AttemptResult | null>(null);
  const [saved, setSaved] = useState(false);

  const over = state.finished || state.secondsLeft <= 0;
  const score = useMemo(
    () => Math.max(0, Math.min(100, Math.round((state.done / state.target) * 100))),
    [state.done, state.target],
  );

  const splice = () => {
    const { state: next, result } = attemptSplice(state);
    setLast(result);
    setState(result.completed && !next.finished ? nextRibbon(next) : next);
  };

  const act = (id: string) => {
    setState(applyIntervention(state, id));
    setLast(null);
  };

  const finish = () => {
    if (saved) return;
    setSaved(true);
    void (async () => {
      try {
        await saveBenchRun({
          id: crypto.randomUUID(),
          traineeId: await getOrCreateTraineeId(),
          kind: 'ribbon-splice',
          at: new Date().toISOString(),
          seed,
          mistakes: state.actions,
          omitted: [],
          seconds: SHIFT_SECONDS - state.secondsLeft,
          passed: state.done >= state.target,
          score,
          domains: BENCH_DOMAINS['ribbon-splice'],
        });
      } catch {
        // A bench that cannot write its record is still a usable bench.
      }
    })();
  };

  const again = () => {
    const s = 1 + Math.floor(Math.random() * 9999);
    setSeed(s); setState(startRun(s, 12)); setLast(null); setSaved(false);
  };

  if (over && !saved) finish();

  return (
    <div style={{ minHeight: '100%', padding: '18px 14px 40px', maxWidth: 1000, margin: '0 auto' }}>
      <div className="eyebrow">Bench · ribbon run</div>
      <h1 className="hud-title" style={{ fontSize: 'clamp(20px, 5vw, 30px)', margin: '10px 0 0', letterSpacing: 2 }}>
        Work the case.
      </h1>
      <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)', maxWidth: '64ch' }}>
        Twelve ribbons before the shift ends. The machine will not tell you what is wrong with
        it — the readings will. Every fix costs minutes whether or not it was the right one.
      </p>

      {/* ---------- the shift ---------- */}
      <section className="bezel" style={{ padding: 14, marginTop: 18, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <div>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>RIBBONS</div>
          <div className="readout" style={{ fontSize: 26, color: 'var(--cyan)', marginTop: 3 }}>
            {state.done}<span className="unit">/ {state.target}</span>
          </div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>SHIFT LEFT</div>
          <div className="readout" style={{ fontSize: 26, marginTop: 3, color: state.secondsLeft < 3600 ? 'var(--red)' : 'var(--ink)' }}>
            {clock(state.secondsLeft)}
          </div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>PACE</div>
          <div className="readout" style={{ fontSize: 26, marginTop: 3, color: 'var(--ink-soft)' }}>
            {pace(state)}<span className="unit">/hr</span>
          </div>
        </div>
        {state.attemptsOnRibbon > 0 && !over && (
          <div>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--amber)' }}>ATTEMPTS ON THIS ONE</div>
            <div className="readout" style={{ fontSize: 26, marginTop: 3, color: 'var(--amber)' }}>{state.attemptsOnRibbon}</div>
          </div>
        )}
      </section>

      {/* ---------- the machine ---------- */}
      {!over && (
        <section className="bezel" style={{ padding: 14, marginTop: 14 }}>
          <div className="eyebrow" style={{ color: 'var(--cyan)' }}>Splicer</div>

          {last ? (
            <>
              <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.5, color: last.completed ? 'var(--green)' : 'var(--red)' }}>
                {last.message}
              </p>
              {last.lossDb.length > 0 && <div style={{ marginTop: 10 }}><Trace loss={last.lossDb} /></div>}
              {last.lossDb.length === 0 && (
                <p className="mono" style={{ fontSize: 10.5, lineHeight: 1.7, color: 'var(--ink-faint)', marginTop: 8, letterSpacing: 0.6 }}>
                  NO READINGS — IT NEVER GOT AS FAR AS A SPLICE.
                </p>
              )}
            </>
          ) : (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ink-soft)' }}>
              Ribbon {state.done + 1} of {state.target} is in the machine.
            </p>
          )}

          {/*
            What YOU have done this shift — not what is wrong.
            Uniform loss across every fibre is genuinely ambiguous: the arc, or this ribbon
            is dirty. A technician resolves it by elimination, because they know whether
            they have already arc-tested. Withholding that turns deduction into guessing,
            which is how the bot ended up making eighteen identical attempts on one ribbon.
          */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
            {INTERVENTIONS.filter((iv) => iv.id !== 'retry').map((iv) => {
              const times = state.actions.filter((a) => a === iv.id).length;
              return (
                <span key={iv.id} className="mono"
                      style={{
                        fontSize: 9.5, letterSpacing: 1.1, padding: '2px 7px',
                        border: `1px solid ${times > 0 ? 'var(--green)' : 'var(--ink-faint)'}`,
                        color: times > 0 ? 'var(--green)' : 'var(--ink-faint)',
                      }}>
                  {times > 0 ? '✓' : '·'} {iv.label.replace(/^(Clean|Rotate|Run an|Re-prep) /, '').toUpperCase()}
                  {times > 1 ? ` ×${times}` : ''}
                </span>
              );
            })}
          </div>
          <p className="mono" style={{ fontSize: 9.5, lineHeight: 1.6, color: 'var(--ink-faint)', margin: '7px 0 0', letterSpacing: 0.5 }}>
            WHAT YOU HAVE DONE THIS SHIFT. IF THE ARC IS ALREADY TESTED AND EVERY FIBRE IS STILL HIGH,
            THE PROBLEM IS THE RIBBON IN FRONT OF YOU.
          </p>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" className="hud-btn hud-btn--cyan" onClick={splice}>
              {last && !last.completed ? 'Splice it again · 3:30' : 'Splice · 3:30'}
            </button>
          </div>
        </section>
      )}

      {/* ---------- what you can do about it ---------- */}
      {!over && (
        <section className="bezel" style={{ padding: 14, marginTop: 14 }}>
          <div className="eyebrow" style={{ color: 'var(--orange)' }}>Do something about it</div>
          <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
            {INTERVENTIONS.filter((i) => i.id !== 'retry').map((iv) => (
              <button key={iv.id} type="button" className="hud-btn"
                      style={{ textAlign: 'left', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}
                      onClick={() => act(iv.id)}>
                <span>{iv.label}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--amber)' }}>
                  −{Math.floor(iv.seconds / 60)}:{String(iv.seconds % 60).padStart(2, '0')}
                </span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{iv.hint}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---------- debrief ---------- */}
      {over && (
        <section className={`bezel${state.done >= state.target ? '' : ' alert'}`} style={{ padding: 14, marginTop: 14 }}>
          <div className="eyebrow" style={{ color: state.done >= state.target ? 'var(--green)' : 'var(--orange)' }}>
            End of shift
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <h2 className="hud-title" style={{ fontSize: 17, margin: 0 }}>
              {state.done >= state.target ? 'Case closed.' : `${state.done} of ${state.target} ribbons.`}
            </h2>
            <span style={{ flex: 1 }} />
            <span className="readout" style={{ fontSize: 30, color: score >= 85 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)' }}>
              {score}<span className="unit">/100</span>
            </span>
          </div>

          <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-soft)' }}>
            {state.conditions.length === 0
              ? 'You finished with the machine in good order.'
              : 'You finished the shift still fighting these:'}
          </p>

          {state.conditions.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 6 }}>
              {state.conditions.map((c) => (
                <li key={c} style={{ borderLeft: '2px solid var(--red)', paddingLeft: 10, fontSize: 12.5, color: 'var(--ink)' }}>
                  {CONDITION_LABEL[c]}
                </li>
              ))}
            </ul>
          )}

          <p className="mono" style={{ fontSize: 9.5, lineHeight: 1.75, color: 'var(--ink-faint)', letterSpacing: 0.6, marginTop: 14 }}>
            EVERY FIBRE UP TOGETHER — THE ARC, OR THIS RIBBON IS DIRTY. A SCATTERED FEW — THE BLADE.
            THE OUTER TWO ONLY — THE GLUE MATRIX. FIBRES BREAKING INSTEAD OF READING — THE CLEAVER PADS.
            THE MACHINE REFUSING ON OFFSET — THE V-GROOVES.
          </p>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" className="hud-btn hud-btn--cyan" onClick={again}>Another case</button>
            <Link to="/bench/test" className="hud-btn" style={{ textDecoration: 'none' }}>Acceptance bench →</Link>
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 18, flexWrap: 'wrap' }}>
        <Link to="/" className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-faint)', textDecoration: 'none' }}>
          ← BACK TO DISPATCH
        </Link>
        <Link to="/bench/splice" className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-faint)', textDecoration: 'none' }}>
          PROCEDURE WALKTHROUGH →
        </Link>
        <span className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-faint)' }}>SEED {seed}</span>
      </div>
    </div>
  );
}
