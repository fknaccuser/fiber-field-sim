/**
 * The night before, or the five minutes in the yard.
 *
 * Sits between accepting a work order and arriving on site. The point of the screen is the
 * squeeze: there are five things worth checking and you never have time for five, so you
 * are made to decide which one you can least afford to be wrong about — before you know
 * what the job is going to need.
 *
 * Skipping is one tap and is presented without judgement, because skipping the pre-trip is
 * what actually happens when you are late.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DEFAULT_ROLE, isRole, ROLE_POLICY } from '../../session/roles';
import type { ReadinessFault } from '../../session/readiness';
import { SoftKey } from '../components/SoftKey';
import { canCheckMore, checksAllowed, PREP_ITEMS, serializePrep, togglePrep } from './prepChecklist';

function CheckGlyph({ on }: { on: boolean }) {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x={1.5} y={1.5} width={17} height={17} rx={2} fill="none" stroke={on ? 'var(--green)' : 'var(--ink-faint)'} strokeWidth={1.4} />
      {on && <path d="M5 10.5 L8.5 14 L15 6.5" fill="none" stroke="var(--green)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

export function PreTrip() {
  const { scenarioId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roleParam = searchParams.get('role');
  const role = isRole(roleParam) ? roleParam : DEFAULT_ROLE;
  const seed = searchParams.get('seed') ?? '1';
  const allowed = checksAllowed(role);

  const [picked, setPicked] = useState<ReadinessFault[]>([]);
  const remaining = allowed - picked.length;

  const roll = (prepared: readonly ReadinessFault[]) => {
    const prep = serializePrep(prepared);
    navigate(`/run/${scenarioId}?seed=${seed}&role=${role}${prep ? `&prep=${prep}` : ''}`);
  };

  return (
    <div style={{ minHeight: '100%', overflowY: 'auto', padding: '18px 14px 28px', maxWidth: 760, margin: '0 auto' }}>
      <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span className="pulse-dot" style={{ background: 'var(--orange)' }} />
        Pre-trip · {ROLE_POLICY[role].displayName}
      </div>

      <h1 className="hud-title" style={{ fontSize: 'clamp(22px, 5.5vw, 34px)', lineHeight: 1.1, margin: '10px 0 0', letterSpacing: 2.5 }}>
        Check the truck.
      </h1>
      <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
        You are not going to get through all of it. Pick the {allowed === 1 ? 'one thing' : `${allowed} things`} you can least
        afford to be wrong about — you do not know yet what this job is going to need.
      </p>

      <div className="glass" style={{ margin: '14px 0 0', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="mono" style={{ fontSize: 22, color: remaining > 0 ? 'var(--cyan)' : 'var(--ink-faint)', minWidth: 26, textAlign: 'center' }}>
          {remaining}
        </span>
        <span className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-soft)' }}>
          {remaining === 1 ? 'CHECK LEFT' : 'CHECKS LEFT'} · {allowed} FOR THIS GRADE
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {PREP_ITEMS.map((item) => {
          const on = picked.includes(item.id);
          const locked = !on && !canCheckMore(picked, role);
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked((p) => togglePrep(p, item.id, role))}
              className={`bezel${on ? '' : ' flat'}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 11,
                padding: '12px 13px',
                textAlign: 'left',
                background: on ? 'rgba(52,211,153,0.06)' : 'transparent',
                color: 'var(--ink)',
                cursor: locked ? 'not-allowed' : 'pointer',
                opacity: locked ? 0.45 : 1,
              }}
            >
              <CheckGlyph on={on} />
              <span style={{ minWidth: 0 }}>
                <span className="mono" style={{ display: 'block', fontSize: 11, letterSpacing: 1.4, color: on ? 'var(--green)' : 'var(--cyan)' }}>
                  {item.label.toUpperCase()}
                </span>
                <span style={{ display: 'block', fontSize: 12.5, marginTop: 3, lineHeight: 1.45 }}>{item.action}</span>
                <span style={{ display: 'block', fontSize: 11.5, marginTop: 4, lineHeight: 1.45, color: 'var(--ink-soft)' }}>
                  {on ? 'Checked. This one will be right.' : item.consequence}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 18 }}>
        <SoftKey label="Roll out →" onClick={() => roll(picked)} />
        <button
          type="button"
          onClick={() => roll([])}
          className="mono"
          style={{ background: 'transparent', border: 'none', color: 'var(--ink-soft)', fontSize: 10.5, letterSpacing: 1.3, cursor: 'pointer', minHeight: 44 }}
        >
          SKIP IT — I&apos;M ALREADY LATE
        </button>
        <span style={{ flex: 1 }} />
        <Link to="/" className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-faint)', textDecoration: 'none' }}>
          ← BACK TO DISPATCH
        </Link>
      </div>

      <p className="mono" style={{ fontSize: 10, lineHeight: 1.7, color: 'var(--ink-faint)', marginTop: 16, letterSpacing: 0.6 }}>
        WHAT YOU DO NOT CHECK IS LEFT TO THE MORNING. IT WILL NEVER TAKE A TOOL THIS JOB
        ACTUALLY NEEDS — BUT IT CAN STILL COST YOU.
      </p>
    </div>
  );
}
