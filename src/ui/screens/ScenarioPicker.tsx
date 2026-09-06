import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listScenarios } from '../../scenarios';
import { Chip } from '../components/Chip';
import { SoftKey } from '../components/SoftKey';

function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 999_999);
}

export function ScenarioPicker() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeError = searchParams.get('error');

  const [tier, setTier] = useState<number | null>(null);
  const [seed, setSeed] = useState<number>(randomSeed());
  const [shareCode, setShareCode] = useState('');

  const scenarios = listScenarios().filter((s) => tier === null || s.tier === tier);
  const tiers = Array.from(new Set(listScenarios().map((s) => s.tier))).sort((a, b) => a - b);

  const goShareCode = () => {
    const [id, seedPart] = shareCode.split(':');
    if (!id) return;
    navigate(`/run/${id}${seedPart ? `?seed=${seedPart}` : ''}`);
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>Scenarios</h1>
      {routeError && <div style={{ color: 'var(--led-alarm)', fontSize: 13 }}>{routeError}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip active={tier === null} onClick={() => setTier(null)}>
          All tiers
        </Chip>
        {tiers.map((t) => (
          <Chip key={t} active={tier === t} onClick={() => setTier(t)}>
            Tier {t}
          </Chip>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)' }}>Seed</label>
        <input
          type="number"
          value={seed}
          onChange={(e) => setSeed(Number(e.target.value))}
          style={{ width: 100, minHeight: 36, background: 'var(--panel-2)', border: '1px solid var(--bezel)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px' }}
        />
        <SoftKey label="Randomize" onClick={() => setSeed(randomSeed())} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => navigate(`/run/${s.id}?seed=${seed}`)}
            className="bezel"
            style={{ padding: 10, display: 'flex', justifyContent: 'space-between', color: 'var(--text)', textAlign: 'left' }}
          >
            <span>{s.title}</span>
            <span style={{ color: 'var(--muted)' }}>Tier {s.tier}</span>
          </button>
        ))}
      </div>

      <div className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Share code (scenarioId:seed)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={shareCode}
            onChange={(e) => setShareCode(e.target.value)}
            placeholder="t4-wrong-roll-closure-7:42"
            className="mono"
            style={{ flex: 1, minHeight: 36, background: 'var(--panel-2)', border: '1px solid var(--bezel)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px' }}
          />
          <SoftKey label="Go" onClick={goShareCode} />
        </div>
      </div>
    </div>
  );
}
