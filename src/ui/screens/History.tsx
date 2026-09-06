import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listSessions, type StoredSession } from '../store/persistence';
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

export function History() {
  const [sessions, setSessions] = useState<StoredSession[]>([]);

  useEffect(() => {
    void listSessions({ limit: 200 }).then(setSessions);
  }, []);

  const trend = historyTrend(sessions);
  const finished = sessions.filter((s) => s.endedAt !== null);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>History</h1>

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
