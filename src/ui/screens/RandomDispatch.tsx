import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FOCUS_BY_TIER, FOCUS_LABELS, generatedId, SIZE_LABELS } from '../../scenarios';
import type { GeneratorFocus, GeneratorSize, GeneratorTier } from '../../scenarios';
import { Chip } from '../components/Chip';
import { SoftKey } from '../components/SoftKey';

function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 999_999);
}

const TIER_BLURB: Record<GeneratorTier, string> = {
  1: 'Guided. One customer, one obvious cause, unlimited hints.',
  2: 'Single fault on a drop or at the OLT. Three hints.',
  3: 'Outside-plant or network fault with a red herring. Two hints.',
  4: 'Multi-customer outages, splice closures, misleading paperwork. One hint.',
  5: 'Nothing is what it looks like. No hints.',
};

/** Builds an unlimited supply of scenarios from three knobs and a seed; the id encodes the knobs so the run is shareable and resumable like any bundled scenario. */
export function RandomDispatch() {
  const navigate = useNavigate();
  const [tier, setTier] = useState<GeneratorTier>(2);
  const [focus, setFocus] = useState<GeneratorFocus>('any');
  const [size, setSize] = useState<GeneratorSize>('medium');
  const [seed, setSeed] = useState<number>(randomSeed());

  const focuses: GeneratorFocus[] = [...FOCUS_BY_TIER[tier], 'any'];
  const effectiveFocus = focuses.includes(focus) ? focus : 'any';
  const id = generatedId({ tier, focus: effectiveFocus, size });

  return (
    <div className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Random dispatch</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>A new plant, new addresses, and a new fault every time. Same code and seed replays the same job.</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Difficulty</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([1, 2, 3, 4, 5] as GeneratorTier[]).map((t) => (
            <Chip key={t} active={tier === t} onClick={() => setTier(t)}>
              Tier {t}
            </Chip>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{TIER_BLURB[tier]}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>What kind of trouble</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {focuses.map((f) => (
            <Chip key={f} active={effectiveFocus === f} onClick={() => setFocus(f)}>
              {FOCUS_LABELS[f]}
            </Chip>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Plant size</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['small', 'medium', 'large'] as GeneratorSize[]).map((s) => (
            <Chip key={s} active={size === s} onClick={() => setSize(s)}>
              {SIZE_LABELS[s]}
            </Chip>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--muted)' }}>Seed</label>
        <input
          type="number"
          value={seed}
          onChange={(e) => setSeed(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          style={{ width: 100, minHeight: 36, background: 'var(--panel-2)', border: '1px solid var(--bezel)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px' }}
        />
        <SoftKey label="Reroll" onClick={() => setSeed(randomSeed())} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
          {id}:{seed}
        </span>
      </div>

      <SoftKey label="Dispatch" active onClick={() => navigate(`/run/${id}?seed=${seed}`)} />
    </div>
  );
}
