/**
 * The phone as a thing you hold, not a tab you select.
 *
 * Same gesture language as the instruments — swipe down to lower it, tap to raise it — but
 * deliberately not built on `HeldDevice`: a phone has no dust cap, no launch lead and no
 * boot sequence, and inheriting that machinery would mean disabling most of it.
 *
 * The backdrop is static CSS on purpose. The POV reads perfectly well as "standing at the
 * kerb looking down at your phone", and painting it with a real scene would put a second
 * WebGL context on screen next to the world view.
 */
import { useRef, type PointerEvent, type ReactNode } from 'react';
import { useDockNavigation } from './dockNavigation';
import { isStowSwipe } from './navigation';
import { minutesOf } from '../scene/ambient';

/** Fallback only: the scenario's own time of day is used when it parses. */
const DEFAULT_START_MINUTES = 7 * 60 + 40;

/** The phone agrees with the sky. Simulated seconds run on from the scenario's clock. */
function clockAt(simSeconds: number, startMinutes: number): string {
  const total = startMinutes + Math.floor(simSeconds / 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function SignalBars() {
  return (
    <svg width={15} height={10} viewBox="0 0 15 10" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 4} y={9 - (i + 1) * 2.2} width={2.6} height={(i + 1) * 2.2} fill="var(--ink)" opacity={i < 3 ? 1 : 0.35} rx={0.6} />
      ))}
    </svg>
  );
}

function Battery({ pct }: { pct: number }) {
  return (
    <svg width={24} height={11} viewBox="0 0 24 11" aria-hidden="true">
      <rect x={0.5} y={0.5} width={20} height={10} rx={2.5} fill="none" stroke="var(--ink)" strokeWidth={1} opacity={0.6} />
      <rect x={22} y={3.5} width={1.6} height={4} rx={0.8} fill="var(--ink)" opacity={0.6} />
      <rect x={2} y={2} width={Math.max(1, 17 * (pct / 100))} height={7} rx={1.4} fill={pct < 20 ? 'var(--red)' : 'var(--green)'} />
    </svg>
  );
}

export function PhoneSlab({ clockSeconds, startTime, badge, children }: { clockSeconds: number; startTime: string; badge: number; children: ReactNode }) {
  const navigation = useDockNavigation();
  const startMinutes = minutesOf(startTime) ?? DEFAULT_START_MINUTES;
  const stowed = navigation.presentation === 'stowed';
  const swipe = useRef<{ x: number; y: number; time: number; id: number } | null>(null);

  // The battery drains across the shift. Cosmetic, but it is the kind of detail that makes
  // a prop feel like an object you have been carrying since seven.
  const battery = Math.max(8, Math.round(96 - clockSeconds / 240));

  const onPointerDown = (e: PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, time: Date.now(), id: e.pointerId };
  };
  const onPointerUp = (e: PointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== e.pointerId || stowed) return;
    if (isStowSwipe(e.clientX - start.x, e.clientY - start.y, Date.now() - start.time)) navigation.present('stowed');
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        // Standing at the kerb: sky glow above, asphalt below, the whole thing dimmed the
        // way a screen in daylight makes everything behind it read darker.
        background:
          'radial-gradient(120% 70% at 50% -10%, #16283a 0%, #0a1220 46%, #050b14 100%), linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.55) 100%)',
      }}
    >
      <div
        aria-hidden
        style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 40% at 50% 120%, rgba(0,240,255,0.07), transparent 70%)', pointerEvents: 'none' }}
      />

      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 0,
          width: 'min(100%, 420px)',
          height: 'calc(100% - 18px)',
          transform: `translateX(-50%) translateY(${stowed ? 'calc(100% - 54px)' : '0'})`,
          transition: 'transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '26px 26px 0 0',
          padding: '9px 9px 0',
          background: 'linear-gradient(#141c26, #0b1119)',
          border: '1px solid #223244',
          borderBottom: 'none',
          boxShadow: '0 -18px 44px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Earpiece and camera: the details that say "phone" before you read anything. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 12, flex: '0 0 auto' }}>
          <span aria-hidden style={{ width: 42, height: 4, borderRadius: 2, background: '#060b12', boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.9)' }} />
          <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: '#0a1a24', border: '1px solid #16303e' }} />
        </div>

        {/* Screen. */}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            marginTop: 7,
            borderRadius: '18px 18px 0 0',
            background: 'var(--void)',
            border: '1px solid #0c1622',
            borderBottom: 'none',
            overflow: 'hidden',
          }}
        >
          <div
            className="mono"
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 14px 4px',
              fontSize: 10,
              letterSpacing: 1,
              color: 'var(--ink-soft)',
              borderBottom: '1px solid rgba(127,212,232,0.08)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <SignalBars />
              FIBEROPS
            </span>
            <span style={{ color: 'var(--ink)', fontSize: 11 }}>{clockAt(clockSeconds, startMinutes)}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {battery}
              <Battery pct={battery} />
            </span>
          </div>

          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>{children}</div>

          {/* Home indicator: the second way down, for anyone who does not find the swipe. */}
          <button
            type="button"
            onClick={() => navigation.present(stowed ? 'raised' : 'stowed')}
            aria-label={stowed ? 'Raise the phone' : 'Lower the phone'}
            style={{ flex: '0 0 auto', background: 'transparent', border: 'none', padding: '7px 0 9px', cursor: 'pointer' }}
          >
            <span aria-hidden style={{ display: 'block', width: 108, height: 4, borderRadius: 2, margin: '0 auto', background: 'var(--ink-faint)' }} />
          </button>
        </div>
      </div>

      {/* Lowered: the top edge of the phone still shows, and the whole strip raises it. */}
      {stowed && (
        <button
          type="button"
          onClick={() => navigation.present('raised')}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 54,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: 16,
          }}
        >
          <span className="eyebrow" style={{ color: 'var(--cyan)' }}>
            Raise the phone{badge > 0 ? ` · ${badge} waiting` : ''}
          </span>
        </button>
      )}
    </div>
  );
}
