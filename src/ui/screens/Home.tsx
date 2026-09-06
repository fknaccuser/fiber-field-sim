import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listScenarios } from '../../scenarios';
import { listSessions, loadUnfinished, type StoredSession } from '../store/persistence';
import { competencyMap, computeStreak } from '../store/progress';
import { AxisGauge } from '../components/AxisGauge';
import { SoftKey } from '../components/SoftKey';

export function Home() {
  const [unfinished, setUnfinished] = useState<StoredSession | null | undefined>(undefined);
  const [sessions, setSessions] = useState<StoredSession[]>([]);

  useEffect(() => {
    void loadUnfinished().then((s) => setUnfinished(s ?? null));
    void listSessions({ limit: 100 }).then(setSessions);
  }, []);

  const { currentStreak, bestStreak } = computeStreak(sessions);
  const competency = competencyMap(sessions);
  const scenarios = listScenarios();

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>Field Sim</h1>

      {unfinished && (
        <div className="bezel" style={{ padding: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>You have an unfinished session: {unfinished.scenarioId} (seed {unfinished.seed})</div>
          <Link to={`/run/${unfinished.scenarioId}?seed=${unfinished.seed}`}>
            <SoftKey label="Continue" />
          </Link>
        </div>
      )}

      <div className="bezel" style={{ padding: 12, display: 'flex', gap: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{currentStreak}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>day streak</div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{bestStreak}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>best streak</div>
        </div>
      </div>

      {competency.length > 0 && (
        <div className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Competency (weakest first)</div>
          {competency.map((c) => (
            <AxisGauge key={c.domain} label={c.domain} value={c.accuracy} detail={`evidence ${Math.round(c.evidence)} · ${c.sessionCount} session(s)`} />
          ))}
        </div>
      )}

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Scenarios</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {scenarios.map((s) => (
            <Link key={s.id} to={`/run/${s.id}`} style={{ textDecoration: 'none' }}>
              <div className="bezel" style={{ padding: 10, display: 'flex', justifyContent: 'space-between', color: 'var(--text)' }}>
                <span>{s.title}</span>
                <span style={{ color: 'var(--muted)' }}>Tier {s.tier}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <Link to="/scenarios">
        <SoftKey label="Browse scenarios" />
      </Link>
      <Link to="/history">
        <SoftKey label="History" />
      </Link>
    </div>
  );
}
