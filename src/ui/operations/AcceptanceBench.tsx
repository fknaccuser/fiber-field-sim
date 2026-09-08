/**
 * The acceptance bench.
 *
 * One lesson, delivered the only way it lands: by letting you get it wrong first.
 *
 * You are shown a link shot from one end and asked to call each splice — pass or fail —
 * exactly as a technician would standing at the launch with one trace on the screen. Then
 * you shoot the far end, and the averages come in. Some of the splices you accepted were
 * over the limit. Some you were about to cut out were fine all along.
 *
 * That gap is not a trick. An OTDR does not measure splice loss, it infers it from a step
 * in the backscatter, and two fibres spliced together rarely scatter identically — so one
 * direction reads low by exactly as much as the other reads high. The gainers make it
 * undeniable: a negative loss is a reading no splice can physically produce.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  bidirectionalLoss,
  DEFAULT_PROFILE,
  generateLink,
  judgeSplice,
  type Verdict,
} from '../../operations/acceptance';

type Call = 'pass' | 'fail';

const VERDICT_TONE: Record<Verdict, string> = {
  pass: 'var(--green)',
  marginal: 'var(--amber)',
  fail: 'var(--red)',
  unproven: 'var(--ink-soft)',
};

export function AcceptanceBench() {
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 9999));
  const link = useMemo(() => generateLink(seed, 6), [seed]);
  const [calls, setCalls] = useState<Record<string, Call>>({});
  const [revealed, setRevealed] = useState(false);

  const profile = DEFAULT_PROFILE;
  const allCalled = link.every((e) => calls[e.id]);

  const results = useMemo(
    () =>
      link.map((e) => {
        const truth = judgeSplice(e.aToBDb, profile, e.bToADb);
        const trueLoss = bidirectionalLoss(e.aToBDb, e.bToADb);
        const shouldPass = truth.verdict === 'pass' || truth.verdict === 'marginal';
        const called = calls[e.id];
        return {
          event: e,
          trueLoss,
          truth,
          shouldPass,
          called,
          wrong: called ? (called === 'pass') !== shouldPass : false,
        };
      }),
    [link, calls, profile],
  );

  const wrong = results.filter((r) => r.wrong);
  const acceptedBad = wrong.filter((r) => r.called === 'pass');
  const rejectedGood = wrong.filter((r) => r.called === 'fail');

  const reset = () => {
    setSeed(1 + Math.floor(Math.random() * 9999));
    setCalls({});
    setRevealed(false);
  };

  return (
    <div style={{ minHeight: '100%', padding: '18px 14px 40px', maxWidth: 1000, margin: '0 auto' }}>
      <div className="eyebrow">Bench · acceptance testing</div>
      <h1 className="hud-title" style={{ fontSize: 'clamp(20px, 5vw, 30px)', margin: '10px 0 0', letterSpacing: 2 }}>
        Call the link.
      </h1>
      <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)', maxWidth: '64ch' }}>
        Six splices, shot from the launch end only — one trace, the way it looks when you are
        standing there. Call each one, then shoot the far end and see what the averages say.
      </p>

      <section className="bezel" style={{ padding: 14, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span className="eyebrow" style={{ color: 'var(--cyan)' }}>
            {revealed ? 'Both directions' : 'A → B only'}
          </span>
          <span style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 10, letterSpacing: 1.3, color: 'var(--ink-faint)' }}>
            {profile.name.toUpperCase()} · ≤{profile.spliceMaxDb.toFixed(2)} dB
          </span>
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {results.map(({ event, trueLoss, truth, called, wrong: isWrong }) => (
            <div key={event.id}
                 style={{
                   display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                   padding: '10px 12px',
                   border: `1px solid ${revealed && isWrong ? 'var(--red)' : 'var(--line)'}`,
                   background: revealed && isWrong ? 'rgba(255,77,94,0.06)' : 'transparent',
                 }}>
              <span className="mono" style={{ fontSize: 11, letterSpacing: 1, color: 'var(--ink-soft)', minWidth: 108 }}>
                {event.label} · {event.distanceKm.toFixed(2)} km
              </span>

              <span className="mono" style={{ fontSize: 15, minWidth: 96, color: event.gainer ? 'var(--amber)' : 'var(--ink)' }}>
                {event.aToBDb >= 0 ? '' : '−'}{Math.abs(event.aToBDb).toFixed(3)}
                <span style={{ fontSize: 9, color: 'var(--ink-faint)', marginLeft: 4 }}>A→B</span>
              </span>

              {revealed && (
                <>
                  <span className="mono" style={{ fontSize: 15, minWidth: 96, color: 'var(--ink)' }}>
                    {event.bToADb.toFixed(3)}
                    <span style={{ fontSize: 9, color: 'var(--ink-faint)', marginLeft: 4 }}>B→A</span>
                  </span>
                  <span className="mono" style={{ fontSize: 15, minWidth: 110, color: VERDICT_TONE[truth.verdict] }}>
                    {trueLoss.toFixed(3)}
                    <span style={{ fontSize: 9, marginLeft: 5 }}>{truth.verdict.toUpperCase()}</span>
                  </span>
                </>
              )}

              <span style={{ flex: 1 }} />

              {!revealed ? (
                <span style={{ display: 'flex', gap: 6 }}>
                  {(['pass', 'fail'] as const).map((c) => (
                    <button key={c} type="button" aria-pressed={called === c}
                            className={`hud-chip${called === c ? ' is-on' : ''}`}
                            onClick={() => setCalls((p) => ({ ...p, [event.id]: c }))}>
                      {c === 'pass' ? 'Accept' : 'Cut it out'}
                    </button>
                  ))}
                </span>
              ) : (
                <span className="mono" style={{ fontSize: 10, letterSpacing: 1.3, color: isWrong ? 'var(--red)' : 'var(--green)' }}>
                  {isWrong
                    ? called === 'pass' ? '✕ YOU ACCEPTED THIS' : '✕ YOU WOULD HAVE CUT THIS OUT'
                    : '✓ CALLED RIGHT'}
                </span>
              )}
            </div>
          ))}
        </div>

        {!revealed && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="hud-btn hud-btn--cyan" disabled={!allCalled} onClick={() => setRevealed(true)}>
              Shoot from the far end →
            </button>
            {!allCalled && (
              <span className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--ink-faint)' }}>
                CALL ALL SIX FIRST
              </span>
            )}
          </div>
        )}
      </section>

      {revealed && (
        <section className={`bezel${wrong.length === 0 ? '' : ' alert'}`} style={{ padding: 14, marginTop: 14 }}>
          <div className="eyebrow" style={{ color: wrong.length === 0 ? 'var(--green)' : 'var(--orange)' }}>
            What one direction cost you
          </div>
          <h2 className="hud-title" style={{ fontSize: 16, margin: '8px 0 0' }}>
            {wrong.length === 0
              ? 'Every call held up.'
              : `${wrong.length} of ${link.length} calls were wrong.`}
          </h2>

          <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-soft)', maxWidth: '66ch' }}>
            {wrong.length === 0
              ? 'This link happened not to punish you. It often will — the mismatch that makes one direction lie is a property of the fibre, not of your technique.'
              : 'An OTDR infers loss from a step in the backscatter, and two fibres rarely scatter identically. One direction reads low by exactly as much as the other reads high.'}
          </p>

          {acceptedBad.length > 0 && (
            <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--ink)' }}>
              <strong style={{ color: 'var(--red)' }}>You signed off {acceptedBad.length} splice{acceptedBad.length === 1 ? '' : 's'} that {acceptedBad.length === 1 ? 'is' : 'are'} over the limit.</strong>{' '}
              That is the one that comes back — on someone else's test set, months later, with your name on the as-built.
            </p>
          )}
          {rejectedGood.length > 0 && (
            <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--ink)' }}>
              <strong style={{ color: 'var(--amber)' }}>You would have cut out {rejectedGood.length} good splice{rejectedGood.length === 1 ? '' : 's'}.</strong>{' '}
              Cheaper than the other mistake, but it is still an hour each and a tray opened for nothing.
            </p>
          )}

          <p className="mono" style={{ fontSize: 9.5, lineHeight: 1.75, color: 'var(--ink-faint)', letterSpacing: 0.6, marginTop: 14 }}>
            A NEGATIVE READING IS A GAINER — NO SPLICE PRODUCES GAIN. IT IS BACKSCATTER MISMATCH, AND IT IS THE PROOF
            THAT ONE DIRECTION IS NOT A MEASUREMENT. TRUE LOSS IS THE MEAN OF THE TWO.
          </p>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" className="hud-btn hud-btn--cyan" onClick={reset}>Another link</button>
            <Link to="/bench/splice" className="hud-btn" style={{ textDecoration: 'none' }}>Splice bench →</Link>
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 18, flexWrap: 'wrap' }}>
        <Link to="/" className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-faint)', textDecoration: 'none' }}>
          ← BACK TO DISPATCH
        </Link>
        <span className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-faint)' }}>SEED {seed}</span>
      </div>
    </div>
  );
}
