/**
 * The rest of a job, once its plan is sound.
 *
 * Both the cut-in and the restoration end the same way: splice the set, dress the tray, prove
 * it. Neither of them needs its own copy of that list, and more to the point neither should
 * have its own idea of when a stage is finished.
 *
 * Stages tick off **recorded bench runs**, not a local flag. The work counts because it was
 * actually done, it counts whether you started it from here or wandered in from the board,
 * and there is no way to mark something complete by asserting it.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BenchKind, BenchRun } from '../../operations/benchRecord';
import { listBenchRuns } from '../store/persistence';

interface ChainStage {
  kind: BenchKind;
  to: string;
  title: string;
  why: string;
}

/**
 * Splice, dress, prove — what every closure job ends with, whatever opened it.
 *
 * Not a prop. Both jobs that use this chain end the same way, and a `stages` prop nobody
 * passes is a guess about a third job that does not exist yet. When one does, it can have one.
 */
const CLOSURE_STAGES: readonly ChainStage[] = [
  { kind: 'ribbon-splice', to: '/bench/run', title: 'Splice the set', why: 'Ribbonize from the tube and mass-fusion the fibres you planned for.' },
  { kind: 'tray-dress', to: '/bench/tray', title: 'Dress the tray', why: 'Route it so the next person can re-enter this closure and work in it.' },
  { kind: 'acceptance', to: '/bench/test', title: 'Prove it', why: 'Bidirectional acceptance before anybody signs it off.' },
];

export function JobChain({
  title,
  summary,
  committedAt,
  onNext,
  nextLabel,
}: {
  title: string;
  /** One line describing the plan that was committed, in the words it was decided in. */
  summary: string;
  /** ISO timestamp the plan was committed. Only runs after this count toward it. */
  committedAt: string;
  onNext(): void;
  nextLabel: string;
}) {
  const [runs, setRuns] = useState<BenchRun[]>([]);

  useEffect(() => {
    void listBenchRuns(60).then(setRuns);
  }, [committedAt]);

  return (
    <div className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="eyebrow" style={{ color: 'var(--cyan)' }}>{title}</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{summary}</div>
      {CLOSURE_STAGES.map((stage, i) => {
        const done = runs.some((r) => r.kind === stage.kind && r.at > committedAt);
        return (
          <div key={stage.to} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono" style={{ fontSize: 12, width: 20, color: done ? 'var(--led-ok)' : 'var(--ink-faint)' }}>{done ? '✓' : i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{stage.title}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{stage.why}</div>
            </div>
            <Link to={stage.to} className="hud-btn" style={{ textDecoration: 'none', flexShrink: 0 }}>Open →</Link>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
        Stages tick when a run of that kind is recorded, so the work counts because it was done — not because you came back here and said it was.
      </div>
      <button type="button" className="hud-btn hud-btn--cyan" onClick={onNext}>{nextLabel}</button>
    </div>
  );
}
