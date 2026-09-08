import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listBenchRuns, listSessions, type StoredSession } from '../store/persistence';
import { BENCH_LABEL, standings, type BenchRun } from '../../operations/benchRecord';
import { historyTrend } from '../store/progress';

function Sparkline({ points }: { points: number[] }) {
  if (points.length === 0) return null;
  const w = 120;
  const h = 28;
  const max = 100;
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - (p / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} role="img" aria-label="accuracy trend">
      <path d={path} stroke="var(--cursor-b)" strokeWidth={1.5} fill="none" />
    </svg>
  );
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Bench work sits in the same record as field work, because it is the same record: an hour
 * on the splice bench and an hour on a live fault both change what this trainee can do.
 */
function BenchHistory({ runs }: { runs: BenchRun[] }) {
  if (runs.length === 0) return null;
  const standing = standings(runs);

  return (
    <div className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Bench work ({runs.length})</div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {standing.map((st) => (
          <span key={st.domain} className="mono" style={{ fontSize: 11, letterSpacing: 1 }}>
            <span style={{ color: 'var(--muted)' }}>{st.domain.toUpperCase()} </span>
            <span style={{ color: st.average >= 85 ? 'var(--led-ok)' : st.average >= 60 ? 'var(--led-warn)' : 'var(--led-alarm)' }}>
              {st.average}
            </span>
            <span style={{ color: 'var(--noise)' }}> ({st.runs})</span>
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {runs.slice(0, 12).map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12, flexWrap: 'wrap' }}>
            <span className="mono" style={{ color: 'var(--noise)', fontSize: 10.5, minWidth: 128 }}>
              {new Date(r.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span style={{ minWidth: 108 }}>{BENCH_LABEL[r.kind]}</span>
            <span className="mono" style={{ color: r.score >= 85 ? 'var(--led-ok)' : r.score >= 60 ? 'var(--led-warn)' : 'var(--led-alarm)' }}>
              {r.score}/100
            </span>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>
              {r.passed ? 'accepted' : 'not accepted'}
              {r.mistakes.length > 0 ? ` · ${r.mistakes.length} issue${r.mistakes.length === 1 ? '' : 's'}` : ''}
              {r.seconds > 0 ? ` · ${mmss(r.seconds)}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function History() {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [benchRuns, setBenchRuns] = useState<BenchRun[]>([]);

  useEffect(() => {
    void listSessions({ limit: 200 }).then(setSessions);
    void listBenchRuns(60).then(setBenchRuns).catch(() => setBenchRuns([]));
  }, []);

  const trend = historyTrend(sessions);
  const finished = sessions.filter((s) => s.endedAt !== null);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>History</h1>

      <BenchHistory runs={benchRuns} />

      {Object.entries(trend).length > 0 && (
        <div className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Accuracy trend by domain (last 30)</div>
          {Object.entries(trend).map(([domain, points]) => (
            <div key={domain} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', width: 90 }}>{domain}</span>
              <Sparkline points={points!.map((p) => p.accuracy)} />
            </div>
          ))}
        </div>
      )}

      <table className="mono" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
            <th style={{ padding: '4px 8px' }}>Scenario</th>
            <th style={{ padding: '4px 8px' }}>Seed</th>
            <th style={{ padding: '4px 8px' }}>Started</th>
            <th style={{ padding: '4px 8px' }}>Total</th>
            <th style={{ padding: '4px 8px' }} />
          </tr>
        </thead>
        <tbody>
          {finished.map((s) => (
            <tr key={s.id} style={{ borderTop: '1px solid var(--grid)' }}>
              <td style={{ padding: '6px 8px' }}>{s.scenarioId}</td>
              <td style={{ padding: '6px 8px' }}>{s.seed}</td>
              <td style={{ padding: '6px 8px' }}>{new Date(s.startedAt).toLocaleString()}</td>
              <td style={{ padding: '6px 8px' }}>{s.total !== null ? Math.round(s.total) : '–'}</td>
              <td style={{ padding: '6px 8px' }}>
                <Link to={`/replay/${s.id}`} style={{ color: 'var(--cursor-b)' }}>
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
