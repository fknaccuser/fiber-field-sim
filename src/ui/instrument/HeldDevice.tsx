/**
 * A field instrument held in the technician's hands, with the equipment they are standing
 * at visible behind it. The device has a real power key, a real dust cap and a real lead:
 * the instrument's own controls only become usable once those are in the right state, and
 * a measurement attempted before then is refused the way the hardware would refuse it.
 */
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import type { UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { useDockNavigation } from '../field/dockNavigation';
import { isStowSwipe } from '../field/navigation';
import { BLOCKER_TEXT, blocker, BOOT_MS, reduceHeld, type HeldAction, type HeldState } from './deviceState';

// three/R3F must not reach the main bundle: every instrument imports this file, but the
// scene behind the device only loads once one of them is actually on screen.
const SceneBackdrop = lazy(() => import('./SceneBackdrop').then((m) => ({ default: m.SceneBackdrop })));
const WorldViewport = lazy(() => import('../scene/WorldViewport').then((m) => ({ default: m.WorldViewport })));

const BACKDROP_FALLBACK = <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(#1b2530, #0b0f14)' }} />;

export type DeviceForm = 'tablet' | 'handheld' | 'pen';

export interface HeldDeviceProps {
  ui: UiSessionState;
  dispatch(intent: Intent): void;
  state: HeldState;
  name: string;
  status?: string;
  /** Shown on the device's own bezel. Original FiberOps branding, not a real manufacturer's. */
  model: string;
  form: DeviceForm;
  /** False for instruments with no removable lead (the inspection scope's probe is captive). */
  needsLead?: boolean;
  leadLabel?: string;
  /** Boot banner lines, printed one at a time like real firmware coming up. */
  bootLines?: string[];
  /** The instrument's own UI. Rendered inside the screen, only once the device is on. */
  children: ReactNode;
  /** Extra keys along the bottom bezel (wavelength, mode...) that are physical on the real device. */
  softKeys?: Array<{ label: string; active?: boolean; onClick(): void; disabled?: boolean }>;
  onStateChange(state: HeldState): void;
}

const BODY: Record<DeviceForm, { pad: number; radius: number; screenRadius: number; bumper: string }> = {
  tablet: { pad: 16, radius: 18, screenRadius: 6, bumper: '#f0a02a' },
  handheld: { pad: 20, radius: 22, screenRadius: 8, bumper: '#e2662a' },
  pen: { pad: 12, radius: 14, screenRadius: 6, bumper: '#3b7fd6' },
};

export function HeldDevice({ ui, dispatch, state, name, status, model, form, needsLead = true, leadLabel = 'launch jumper', bootLines, children, softKeys = [], onStateChange }: HeldDeviceProps) {
  const navigation = useDockNavigation();
  const stowed = navigation.presentation === 'stowed';
  const expanded = navigation.presentation === 'enlarged';
  const raiseRef = useRef<HTMLButtonElement>(null);
  const stowRef = useRef<HTMLButtonElement>(null);
  const previousStowed = useRef(stowed);
  const swipe = useRef<{ x: number; y: number; time: number; id: number } | null>(null);
  const [bootStep, setBootStep] = useState(0);
  const [refusal, setRefusal] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const act = (action: HeldAction) => {
    const next = reduceHeld(state, action);
    if (next === state && action === 'toggle-lead') setRefusal(state.capOn ? 'Take the dust cap off before you land a connector.' : null);
    if (next === state && action === 'toggle-cap') setRefusal('Pull the lead out before you cap the port.');
    onStateChange(next);
  };
  const latestAct = useRef(act);
  latestAct.current = act;

  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);
  useEffect(() => {
    if (stowed !== previousStowed.current) {
      (stowed ? raiseRef : stowRef).current?.focus();
      previousStowed.current = stowed;
    }
  }, [stowed, expanded]);

  const startSwipe = (event: PointerEvent<HTMLDivElement>) => {
    if (expanded) return;
    // Screen scrolling and optical-port controls retain their normal gestures.
    if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button, input, select, textarea, canvas, [data-device-screen]')) return;
    swipe.current = { x: event.clientX, y: event.clientY, time: event.timeStamp, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const endSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (start?.id === event.pointerId && isStowSwipe(event.clientX - start.x, event.clientY - start.y, event.timeStamp - start.time)) navigation.present('stowed');
  };

  // Boot sequence: the screen wakes, prints its banner, then hands over to the instrument UI.
  useEffect(() => {
    if (state.power !== 'booting') {
      setBootStep(0);
      return;
    }
    const lines = bootLines ?? [];
    const per = Math.max(120, BOOT_MS / Math.max(1, lines.length + 1));
    const timers = lines.map((_, i) => setTimeout(() => setBootStep(i + 1), per * (i + 1)));
    const done = setTimeout(() => latestAct.current('boot-finished'), BOOT_MS);
    return () => {
      for (const t of timers) clearTimeout(t);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.power]);

  useEffect(() => {
    if (!refusal) return;
    const t = setTimeout(() => setRefusal(null), 2600);
    return () => clearTimeout(t);
  }, [refusal]);

  const b = BODY[form];
  const block = blocker(state, needsLead);
  const capOpen = !state.capOn;

  // The power key is press-and-hold, like the real thing.
  const startHold = () => {
    if (holdTimer.current) return;
    held.current = false;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      latestAct.current('press-power');
    }, 550);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (!held.current && state.power === 'off') setRefusal('Press and hold the power key.');
    holdTimer.current = null;
  };

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden', background: '#0b0f14' }}>
      {!expanded && <Suspense fallback={BACKDROP_FALLBACK}>
        {stowed ? <div style={{ position: 'absolute', inset: '0 0 56px' }}><WorldViewport ui={ui} dispatch={dispatch} /></div> : <SceneBackdrop ui={ui} open={[]} />}
      </Suspense>}

      {/* The lead: a jumper running from the device's port off toward the equipment behind. */}
      {state.connected && !stowed && !expanded && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden>
          <path d="M50 30 C 46 18, 30 14, 14 8" fill="none" stroke="#0a0a0a" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          <path d="M50 30 C 46 18, 30 14, 14 8" fill="none" stroke="#e5c531" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
      )}

      <div
        className={`held-body${stowed ? ' is-stowed' : ''}${expanded ? ' is-expanded' : ''}`}
        inert={stowed}
        onPointerDown={startSwipe}
        onPointerUp={endSwipe}
        onPointerCancel={() => { swipe.current = null; }}
        style={{
          position: 'absolute',
          left: 6,
          right: 6,
          bottom: 6,
          top: 'clamp(40px, 20%, 150px)',
          borderRadius: b.radius,
          padding: b.pad,
          background: 'linear-gradient(#4a5058, #33383e 30%, #24282d)',
          boxShadow: '0 -10px 30px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.14)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div className="held-grip">
          <span aria-hidden>━</span>
          {!expanded && <button ref={stowRef} type="button" onClick={() => navigation.present('stowed')} aria-label={`Stow ${name}`}>⌄ Stow</button>}
          {expanded && <button type="button" onClick={navigation.back}>Back to device</button>}
        </div>
        {/* Rubber corner bumpers. */}
        {([[-6, -6], [-6, undefined], [undefined, -6], [undefined, undefined]] as const).map((_, i) => (
          <span
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              width: 26,
              height: 26,
              borderRadius: 10,
              background: b.bumper,
              opacity: 0.9,
              top: i < 2 ? -4 : undefined,
              bottom: i >= 2 ? -4 : undefined,
              left: i % 2 === 0 ? -4 : undefined,
              right: i % 2 === 1 ? -4 : undefined,
            }}
          />
        ))}

        {/* Top edge: brand, optical port, hinged dust cap, connector. */}
        <div className="held-ports" style={{ display: expanded ? 'none' : 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span className="mono" style={{ fontSize: 10, color: '#aab3bd', letterSpacing: 1 }}>
            FIBEROPS <span style={{ color: '#6e7883' }}>{model}</span>
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => act('toggle-cap')}
            title={capOpen ? 'Replace the dust cap' : 'Remove the dust cap'}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', padding: 0, minHeight: 34 }}
          >
            <svg width="34" height="26" viewBox="0 0 34 26" aria-hidden>
              <rect x="9" y="10" width="16" height="12" rx="2" fill="#15181c" stroke="#7c848d" strokeWidth="1" />
              <rect x="14" y="13" width="6" height="6" rx="1" fill={state.connected ? '#2fa64a' : '#0a0c0e'} />
              <g style={{ transition: 'transform 240ms', transform: capOpen ? 'rotate(-72deg)' : 'rotate(0deg)', transformOrigin: '25px 12px' }}>
                <rect x="8" y="7" width="18" height="7" rx="3" fill="#1f2429" stroke="#5c646d" strokeWidth="1" />
              </g>
            </svg>
            <span style={{ fontSize: 10, color: capOpen ? '#8a96a6' : '#f0a02a' }}>{capOpen ? 'port open' : 'cap on'}</span>
          </button>
          {needsLead && (
            <button
              type="button"
              onClick={() => act('toggle-lead')}
              style={{
                minHeight: 34,
                padding: '4px 9px',
                borderRadius: 6,
                border: `1px solid ${state.connected ? '#2fa64a' : '#5c646d'}`,
                background: state.connected ? 'rgba(47,166,74,0.16)' : 'transparent',
                color: state.connected ? '#7fe0a0' : '#aab3bd',
                fontSize: 10,
              }}
            >
              {state.connected ? `${leadLabel} in` : `connect ${leadLabel}`}
            </button>
          )}
        </div>

        {/* Screen. */}
        <div
          data-device-screen
          style={{
            flex: 1,
            minHeight: 0,
            borderRadius: b.screenRadius,
            border: '2px solid #14171b',
            background: state.power === 'off' ? '#0c0e11' : 'var(--bg)',
            boxShadow: state.power === 'on' ? 'inset 0 0 22px rgba(90,176,255,0.10)' : 'none',
            overflow: 'hidden',
            position: 'relative',
            transition: 'background 200ms',
          }}
        >
          {state.power === 'off' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a4048', fontSize: 12 }}>screen off</div>
          )}
          {state.power === 'booting' && (
            <div className="mono" style={{ padding: 12, color: 'var(--cursor-a)', fontSize: 11, lineHeight: 1.7 }}>
              {(bootLines ?? []).slice(0, bootStep).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <div style={{ color: 'var(--muted)' }}>_</div>
            </div>
          )}
          {state.power === 'on' && !stowed && (
            <div style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>
              {block && (
                <div style={{ padding: '6px 10px', background: 'rgba(255,157,0,0.12)', borderBottom: '1px solid rgba(255,157,0,0.35)', color: 'var(--led-warn)', fontSize: 11 }}>{BLOCKER_TEXT[block]}</div>
              )}
              {children}
            </div>
          )}
        </div>

        {/* Physical key row. */}
        <div style={{ display: expanded ? 'none' : 'flex', alignItems: 'center', gap: 6, flexShrink: 0, overflowX: 'auto' }}>
          <button
            type="button"
            onPointerDown={startHold}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
            onKeyDown={(event) => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); act('press-power'); } }}
            onBlur={endHold}
            aria-label="Power"
            style={{
              width: 42,
              height: 34,
              flexShrink: 0,
              borderRadius: 7,
              border: '1px solid #171a1e',
              background: 'linear-gradient(#3f454c, #2a2f34)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.5)',
              color: state.power === 'off' ? '#7b838c' : '#37d67a',
              fontSize: 15,
            }}
          >
            ⏻
          </button>
          {softKeys.map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={k.onClick}
              disabled={k.disabled || state.power !== 'on'}
              style={{
                minHeight: 34,
                flexShrink: 0,
                padding: '4px 10px',
                borderRadius: 7,
                border: '1px solid #171a1e',
                background: k.active ? 'linear-gradient(#5a636d, #3d444b)' : 'linear-gradient(#3f454c, #2a2f34)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                color: k.disabled || state.power !== 'on' ? '#5c646d' : '#d7dee8',
                fontSize: 11,
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {stowed && <button ref={raiseRef} type="button" className="held-raise" onClick={() => navigation.present('raised')} aria-label={`Raise ${name}`}>
        <span aria-hidden style={{ color: state.power === 'on' ? 'var(--led-ok)' : state.power === 'booting' ? 'var(--led-warn)' : 'var(--muted)' }}>●</span>
        <strong>⌃ {name}</strong><span>{state.power === 'on' ? status ?? (block ? BLOCKER_TEXT[block] : 'Ready') : state.power === 'booting' ? 'Booting…' : 'Off'}</span>
      </button>}

      {refusal && (
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 58, padding: '7px 10px', borderRadius: 6, background: 'rgba(255,77,77,0.92)', color: '#fff', fontSize: 12, textAlign: 'center' }} role="status">
          {refusal}
        </div>
      )}
    </div>
  );
}
