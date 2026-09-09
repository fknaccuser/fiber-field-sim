/**
 * Building a new terminal onto a backbone that is already carrying service.
 *
 * The splice bench teaches the twenty-two steps and the tray bench teaches the dressing.
 * Neither of them covers the hour before anybody switches a splicer on, which is where the
 * outages come from: how you get into the cable, and which fibres out of it are yours.
 *
 * The cable is shown the way it is actually read — tube by tube, fibre by fibre, in colour
 * order, with what the records say each one carries. Everything the trainee needs is on the
 * screen. That is deliberate: this is not a memory test, it is a discipline test, and the
 * failure being trained out is not "I did not know", it is "I did not look".
 *
 * Judging is `judgeCutIn`, pure and tested. This file collects a plan and draws a cable.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createRng, deriveSeed } from '../../world';
import {
  COLOR_ORDER,
  generateCutInJob,
  judgeCutIn,
  liveFibres,
  tubeOf,
  type AccessMethod,
  type CutInPlan,
  type FibreStatus,
} from '../../operations/backbone';
import { JobChain } from './JobChain';
import { SoftKey } from '../components/SoftKey';
import { Chip } from '../components/Chip';

const FIBRE_HEX: Record<string, string> = {
  blue: '#3b82f6', orange: '#f97316', green: '#22c55e', brown: '#a16207',
  slate: '#94a3b8', white: '#e2e8f0', red: '#ef4444', black: '#334155',
  yellow: '#eab308', violet: '#a855f7', rose: '#fb7185', aqua: '#22d3ee',
};

const STATUS_MARK: Record<FibreStatus, string> = { live: '●', reserved: '◐', spare: '' };
const STATUS_WORD: Record<FibreStatus, string> = { live: 'in service', reserved: 'held', spare: 'spare' };

export function CutInBench() {
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 9999));
  const job = useMemo(() => generateCutInJob(seed, createRng(deriveSeed(seed, 'cut-in'))), [seed]);

  const [method, setMethod] = useState<AccessMethod>('mid-span-window');
  // Null means "whatever this cable opens on". Storing the choice rather than the resolved
  // colour is what lets a new job re-derive its own default instead of an effect reaching in
  // afterwards to correct a value that was only ever right for the previous cable.
  const [pickedTube, setPickedTube] = useState<string | null>(null);
  const tubeColor = pickedTube ?? job.cable.tubes[0].color;
  const [fibreColors, setFibreColors] = useState<string[]>([]);
  const [recorded, setRecorded] = useState(false);
  const [committedAt, setCommittedAt] = useState<string | null>(null);

  const plan: CutInPlan = useMemo(
    () => ({ method, tubeColor, fibreColors, recorded }),
    [method, tubeColor, fibreColors, recorded],
  );
  const verdict = useMemo(() => judgeCutIn(job.cable, job.terminal, plan), [job, plan]);
  const tube = tubeOf(job.cable, tubeColor);

  const toggleFibre = (color: string) => {
    if (committedAt) return;
    setFibreColors((prev) => (prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]));
  };

  const takeInOrder = () => setFibreColors(COLOR_ORDER.slice(0, job.terminal.ports));

  const reset = () => {
    setSeed(1 + Math.floor(Math.random() * 9999));
    setMethod('mid-span-window');
    setPickedTube(null);
    setFibreColors([]);
    setRecorded(false);
    setCommittedAt(null);
  };

  const live = liveFibres(job.cable).length;

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 620, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link to="/" style={{ fontSize: 12, color: 'var(--cyan)' }}>← Board</Link>
        <span className="eyebrow" style={{ color: 'var(--cyan)' }}>Backbone cut-in</span>
      </div>

      <div className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{job.terminal.label} · {job.terminal.ports} ports</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{job.cable.label}</div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: live > 0 ? 'var(--orange)' : 'var(--led-ok)' }}>
          {live > 0 ? `${live} LIVE CIRCUIT${live === 1 ? '' : 'S'} IN THIS CABLE` : 'NOTHING IN SERVICE IN THIS CABLE'}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          Records suggest the <strong>{job.suggestedTube}</strong> tube is free. Records are a place to start.
        </div>
      </div>

      {/* How you get in. */}
      <div>
        <div className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 6 }}>Access</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip active={method === 'mid-span-window'} onClick={() => !committedAt && setMethod('mid-span-window')}>Mid-span window</Chip>
          <Chip active={method === 'full-cut'} onClick={() => !committedAt && setMethod('full-cut')}>Full cut</Chip>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5, lineHeight: 1.5 }}>
          {method === 'mid-span-window'
            ? 'Open the sheath, bring out one tube, leave everything else up. Slower, and nobody notices you were here.'
            : 'Cut the cable through. Quicker on a dead cable; on a live one every circuit in it is down until the last splice is made.'}
        </div>
      </div>

      {/* The cable, tube by tube. */}
      <div>
        <div className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 6 }}>Buffer tubes</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {job.cable.tubes.map((t) => {
            const liveHere = t.fibres.filter((f) => f.status === 'live').length;
            return (
              <button
                key={t.color}
                type="button"
                onClick={() => { if (!committedAt) { setPickedTube(t.color); setFibreColors([]); } }}
                style={{
                  minHeight: 38, padding: '5px 10px', borderRadius: 6, fontSize: 11.5,
                  border: t.color === tubeColor ? '2px solid var(--cyan)' : '1px solid var(--bezel)',
                  background: 'transparent', color: 'var(--ink)',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ width: 11, height: 11, borderRadius: 6, background: FIBRE_HEX[t.color], border: '1px solid rgba(0,0,0,0.5)' }} />
                {t.color}
                <span className="mono" style={{ fontSize: 9.5, color: liveHere > 0 ? 'var(--orange)' : 'var(--ink-faint)' }}>
                  {liveHere > 0 ? `${liveHere} LIVE` : 'DARK'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* The fibres in the chosen tube. */}
      {tube && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <div className="eyebrow" style={{ color: 'var(--cyan)' }}>{tubeColor} tube · pick {job.terminal.ports}</div>
            <button type="button" onClick={takeInOrder} disabled={!!committedAt} style={{ background: 'none', border: 'none', color: 'var(--cyan)', fontSize: 11.5 }}>
              take the first {job.terminal.ports} in order
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 5, marginTop: 6 }}>
            {tube.fibres.map((f) => {
              const picked = fibreColors.includes(f.color);
              return (
                <button
                  key={f.color}
                  type="button"
                  onClick={() => toggleFibre(f.color)}
                  title={f.note}
                  style={{
                    minHeight: 42, padding: '5px 7px', borderRadius: 6, textAlign: 'left',
                    border: picked ? '2px solid var(--cyan)' : '1px solid var(--bezel)',
                    background: picked ? 'rgba(0,240,255,0.09)' : 'transparent',
                    color: 'var(--ink)', fontSize: 11,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: FIBRE_HEX[f.color], border: '1px solid rgba(0,0,0,0.5)', flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.color}</span>
                    <span className="mono" style={{ fontSize: 8.5, letterSpacing: 0.8, color: f.status === 'live' ? 'var(--red)' : f.status === 'reserved' ? 'var(--orange)' : 'var(--ink-faint)' }}>
                      {STATUS_MARK[f.status]} {STATUS_WORD[f.status].toUpperCase()}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={recorded} onChange={(e) => setRecorded(e.target.checked)} disabled={!!committedAt} />
        Assignment written into the records before splicing
      </label>

      {/* The plan, judged before anybody opens a splicer. */}
      <div className={`bezel${verdict.accepted ? '' : ' alert'}`} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: verdict.serviceAffecting > 0 ? 'var(--red)' : verdict.accepted ? 'var(--led-ok)' : 'var(--orange)' }}>
          {fibreColors.length === 0 ? 'No fibres picked yet.' : verdict.summary}
        </div>
        {verdict.issues.map((issue, i) => (
          <div key={i} style={{ borderLeft: `2px solid ${issue.severity === 'service-affecting' ? 'var(--red)' : issue.severity === 'defect' ? 'var(--orange)' : 'var(--ink-faint)'}`, paddingLeft: 9 }}>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.3, color: issue.severity === 'service-affecting' ? 'var(--red)' : 'var(--ink-soft)' }}>
              {issue.severity.replace(/-/g, ' ').toUpperCase()} · {issue.where.toUpperCase()}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{issue.detail}</div>
          </div>
        ))}
        {!committedAt && (
          <SoftKey
            label={verdict.accepted ? 'Commit the plan' : 'Plan is not ready'}
            disabled={!verdict.accepted || fibreColors.length === 0}
            onClick={() => setCommittedAt(new Date().toISOString())}
          />
        )}
      </div>

      {/* Only now does the rest of the job open. Planning is a gate, which is the point. */}
      {committedAt && (
        <JobChain
          title="Work the terminal"
          summary={`${method === 'mid-span-window' ? 'Mid-span window' : 'Full cut'} on the ${tubeColor} tube, ${fibreColors.join(', ')} to ${job.terminal.label}.`}
          committedAt={committedAt}
          onNext={reset}
          nextLabel="Next terminal"
        />
      )}
    </div>
  );
}
