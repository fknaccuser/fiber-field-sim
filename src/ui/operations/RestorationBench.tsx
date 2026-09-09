/**
 * A callout: something has hit the cable and it has to go back.
 *
 * The whole bench is one slider, and that is deliberate. How far you cut back is the decision
 * that decides this job, and it is pulled two ways at once — short of the damage and you
 * splice onto stressed glass that passes every test you can run today; far past it and the
 * ends will not reach, which you discover after the cable is cut.
 *
 * So the readouts either side of the slider are the two consequences, live, while you move
 * it. The reach of the damage is *not* shown as a number: that is what the callout is asking
 * you to work out, from the cause and from checking the fibre you exposed.
 *
 * `judgeRestoration` decides everything. This file collects a plan.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createRng, deriveSeed } from '../../world';
import {
  DAMAGE_REACH,
  generateRestorationJob,
  judgeRestoration,
  removedLengthM,
  type RestorationMethod,
  type RestorationPlan,
} from '../../operations/restoration';
import { BENCH_DOMAINS, scoreRestorationRun } from '../../operations/benchRecord';
import { getOrCreateTraineeId, saveBenchRun } from '../store/persistence';
import { JobChain } from './JobChain';
import { SoftKey } from '../components/SoftKey';
import { Chip } from '../components/Chip';

const PRIORITY_TONE: Record<string, string> = {
  critical: 'var(--red)',
  business: 'var(--orange)',
  residential: 'var(--ink-soft)',
};

const CAUSE_LABEL: Record<string, string> = {
  'dig-in': 'Dig-in',
  'water-ingress': 'Water ingress',
  'vehicle-strike': 'Vehicle strike',
  rodent: 'Rodent damage',
  gunshot: 'Gunshot',
};

/** How far back the slider goes. Past this and you are rebuilding the span, not repairing it. */
const MAX_CUT_BACK_M = 30;

export function RestorationBench() {
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 9999));
  const job = useMemo(() => generateRestorationJob(seed, createRng(deriveSeed(seed, 'restoration'))), [seed]);
  const { report, story } = job;

  const [method, setMethod] = useState<RestorationMethod>('splice-through');
  const [cutBackM, setCutBackM] = useState(2);
  const [restoreFirst, setRestoreFirst] = useState<string>(report.tubes[0].color);
  const [verified, setVerified] = useState(false);
  const [committedAt, setCommittedAt] = useState<string | null>(null);

  const plan: RestorationPlan = useMemo(
    () => ({ method, cutBackM, restoreFirst, verifiedExposedFibre: verified }),
    [method, cutBackM, restoreFirst, verified],
  );
  const verdict = useMemo(() => judgeRestoration(report, plan), [report, plan]);
  const removedM = removedLengthM(report, plan);
  const slack = report.slackAM + report.slackBM;

  const commit = async () => {
    const at = new Date().toISOString();
    setCommittedAt(at);
    const traineeId = await getOrCreateTraineeId();
    await saveBenchRun({
      id: `restore-${seed}-${Date.now()}`,
      traineeId,
      kind: 'restoration',
      at,
      seed,
      mistakes: verdict.issues.map((i) => i.code),
      omitted: [],
      // A callout is a whole shift by the time the span is back and tested.
      seconds: 6 * 60 * 60,
      passed: verdict.accepted,
      score: scoreRestorationRun(verdict),
      domains: BENCH_DOMAINS.restoration,
    });
  };

  const reset = () => {
    const next = 1 + Math.floor(Math.random() * 9999);
    setSeed(next);
    setMethod('splice-through');
    setCutBackM(2);
    setVerified(false);
    setCommittedAt(null);
  };

  // A new callout is a new cable, so the tube choice cannot survive it.
  const firstTube = report.tubes.some((t) => t.color === restoreFirst) ? restoreFirst : report.tubes[0].color;

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 620, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link to="/" style={{ fontSize: 12, color: 'var(--cyan)' }}>← Board</Link>
        <span className="eyebrow" style={{ color: 'var(--cyan)' }}>Emergency restoration</span>
      </div>

      {/* The callout, as it comes in. */}
      <div className="bezel alert" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: 1.4, color: 'var(--red)' }}>
          ⚠ {CAUSE_LABEL[report.cause].toUpperCase()} · {report.cableLabel.toUpperCase()}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>{story}</div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.1, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
          OTDR PUTS IT AT {report.distanceM} M<br />
          {report.visibleDamageM} M VISIBLY WRECKED<br />
          SLACK {report.slackAM} M THIS SIDE · {report.slackBM} M THE OTHER
        </div>
      </div>

      {/* The one decision. */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div className="eyebrow" style={{ color: 'var(--cyan)' }}>Cut back, each side</div>
          <div className="mono" style={{ fontSize: 15, color: 'var(--cyan)' }}>{cutBackM} m</div>
        </div>
        <input
          type="range"
          min={0}
          max={MAX_CUT_BACK_M}
          step={1}
          value={cutBackM}
          disabled={!!committedAt}
          onChange={(e) => setCutBackM(Number(e.target.value))}
          style={{ width: '100%', minHeight: 40 }}
          aria-label="Cut back distance each side, in metres"
        />
        {/* The two consequences, live. Neither of them is the answer — they are the pull. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: 'var(--ink-faint)' }}>CABLE REMOVED</div>
            <div style={{ fontSize: 12.5 }}>{removedM} m</div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: 'var(--ink-faint)' }}>ENDS REACH?</div>
            <div style={{ fontSize: 12.5, color: verdict.endsReach ? 'var(--led-ok)' : 'var(--red)' }}>
              {verdict.endsReach ? `yes, ${Math.round((slack - removedM) * 10) / 10} m spare` : `no, ${Math.round((removedM - slack) * 10) / 10} m short`}
            </div>
          </div>
        </div>
      </div>

      {/* What checking buys you. It is the only way to know, and it is not free. */}
      <label style={{ fontSize: 12.5, color: 'var(--ink)', display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.5 }}>
        <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} disabled={!!committedAt} style={{ marginTop: 3 }} />
        <span>
          Check the exposed fibre before splicing onto it
          <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>
            Twenty minutes. The only thing on this job that can tell you whether you cut back far enough.
          </span>
        </span>
      </label>

      <div>
        <div className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 6 }}>Method</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip active={method === 'splice-through'} onClick={() => !committedAt && setMethod('splice-through')}>Splice through</Chip>
          <Chip active={method === 'insert-section'} onClick={() => !committedAt && setMethod('insert-section')}>Insert a section</Chip>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5, lineHeight: 1.5 }}>
          {method === 'splice-through'
            ? 'Cut out the damage, pull both ends in, one closure. Only if they reach.'
            : 'Pull in a replacement length. Two closures and two sets of splices in this span, permanently.'}
        </div>
      </div>

      <div>
        <div className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 6 }}>Back first</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {report.tubes.map((t) => (
            <button
              key={t.color}
              type="button"
              onClick={() => !committedAt && setRestoreFirst(t.color)}
              style={{
                minHeight: 46, padding: '5px 10px', borderRadius: 6, textAlign: 'left',
                border: t.color === firstTube ? '2px solid var(--cyan)' : '1px solid var(--bezel)',
                background: 'transparent', color: 'var(--ink)', fontSize: 11.5,
              }}
            >
              <span style={{ display: 'block' }}>{t.color} · {t.circuits}</span>
              <span className="mono" style={{ fontSize: 9, letterSpacing: 1, color: PRIORITY_TONE[t.priority] }}>
                {t.priority.toUpperCase()} · {t.serves.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={`bezel${verdict.accepted ? '' : ' alert'}`} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: verdict.latent > 0 ? 'var(--red)' : verdict.accepted ? 'var(--led-ok)' : 'var(--orange)' }}>
          {verdict.summary}
        </div>
        {verdict.issues.map((issue, i) => (
          <div key={i} style={{ borderLeft: `2px solid ${issue.severity === 'latent' ? 'var(--red)' : issue.severity === 'blocking' ? 'var(--orange)' : 'var(--ink-faint)'}`, paddingLeft: 9 }}>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.3, color: issue.severity === 'latent' ? 'var(--red)' : 'var(--ink-soft)' }}>
              {issue.severity.toUpperCase()} · {issue.where.toUpperCase()}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{issue.detail}</div>
          </div>
        ))}
        {!committedAt && (
          <SoftKey
            label={verdict.accepted ? 'Work the restoration' : 'Plan is not ready'}
            disabled={!verdict.accepted}
            onClick={() => void commit()}
          />
        )}
      </div>

      {committedAt && (
        <>
          {/* Only after the plan is committed: what the damage actually was. A number handed
              over before the decision is not a lesson, it is the answer. */}
          <div className="bezel" style={{ padding: 12 }}>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.3, color: 'var(--ink-faint)' }}>WHAT THIS DAMAGE ACTUALLY REACHED</div>
            <div style={{ fontSize: 13, color: 'var(--cyan)', margin: '3px 0 5px' }}>about {DAMAGE_REACH[report.cause].reachM} m past what you could see</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{DAMAGE_REACH[report.cause].why}</div>
          </div>
          <JobChain
            title="Work the span"
            summary={`${method === 'splice-through' ? 'Splice through' : 'Insert a section'} on ${report.cableLabel}, ${cutBackM} m back each side, ${firstTube} tube first.`}
            committedAt={committedAt}
            onNext={reset}
            nextLabel="Next callout"
          />
        </>
      )}
    </div>
  );
}
