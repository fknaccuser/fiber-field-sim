/**
 * A field instrument held in the technician's hands.
 *
 * There used to be three gates in front of every reading: press and hold the power key,
 * swing the dust cap off the optical port, land a jumper on it. They were modelled
 * carefully and they taught nobody anything. A technician learns to take a cap off by
 * taking a cap off; tapping a picture of one only puts three taps between the trainee and
 * the measurement, every single time they pick the instrument up. The instrument is now on
 * and ready when you raise it, which is how it feels on a truck where the meter has been on
 * since seven in the morning.
 *
 * What survives is the boot banner, because it is not a gate. It prints the model and the
 * calibration date once per instrument per session — information a technician does read —
 * and then gets out of the way for the rest of the run.
 */
import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import type { UiSessionState } from '../../session/runner';
import { useDockNavigation } from '../field/dockNavigation';
import { isStowSwipe } from '../field/navigation';
import { useViewportState } from '../viewport/viewportStore';

export type DeviceForm = 'tablet' | 'handheld' | 'pen';

/** How long the banner sits on screen before the instrument's own UI takes over. */
export const BOOT_MS = 1400;

export interface HeldDeviceProps {
  ui: UiSessionState;
  /** Stable key for this instrument, so its banner plays once per session and not per raise. */
  id: string;
  name: string;
  status?: string;
  /** Shown on the device's own bezel. Original FiberOps branding, not a real manufacturer's. */
  model: string;
  form: DeviceForm;
  /** Boot banner lines, printed one at a time like real firmware coming up. */
  bootLines?: string[];
  /** The instrument's own UI. */
  children: ReactNode;
  /** Extra keys along the bottom bezel (wavelength, mode...) that are physical on the real device. */
  softKeys?: Array<{ label: string; active?: boolean; onClick(): void; disabled?: boolean }>;
}

const BODY: Record<DeviceForm, { pad: number; radius: number; screenRadius: number; bumper: string }> = {
  tablet: { pad: 16, radius: 18, screenRadius: 6, bumper: '#f0a02a' },
  handheld: { pad: 20, radius: 22, screenRadius: 8, bumper: '#e2662a' },
  pen: { pad: 12, radius: 14, screenRadius: 6, bumper: '#3b7fd6' },
};

/**
 * What is behind the instrument: the tailgate, and the name of the thing you are parked at.
 *
 * This was a live 3D render of the equipment. Rendering a street to sit behind a meter cost
 * a WebGL context and the whole plant-model layer to maintain, and every technician using
 * it already knows what a pedestal looks like. What they need to see is *which* one they
 * are standing at, because taking a good reading at the wrong location is the mistake this
 * screen can actually prevent.
 */
function Tailgate({ ui, big }: { ui: UiSessionState; big: boolean }) {
  const node = ui.world.topology.nodes.find((n) => n.id === ui.locationNodeId);
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(120% 80% at 50% 0%, #1e2731 0%, #141a21 45%, #0b0f14 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: big ? 40 : 14,
        gap: 4,
        overflow: 'hidden',
      }}
    >
      <span className="mono" style={{ fontSize: 9, letterSpacing: 2.5, color: 'rgba(127,212,232,0.35)' }}>
        STANDING AT
      </span>
      <span
        className="hud-title"
        style={{
          fontSize: big ? 17 : 13,
          color: 'rgba(127,212,232,0.7)',
          maxWidth: '86%',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {(node?.label ?? ui.locationNodeId).toUpperCase()}
      </span>
      {node && (
        <span className="mono" style={{ fontSize: 9, letterSpacing: 1.6, color: 'rgba(127,212,232,0.28)' }}>
          {node.kind.replace(/-/g, ' ').toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function HeldDevice({ ui, id, name, status, model, form, bootLines, children, softKeys = [] }: HeldDeviceProps) {
  const navigation = useDockNavigation();
  const stowed = navigation.presentation === 'stowed';
  const expanded = navigation.presentation === 'enlarged';
  const raiseRef = useRef<HTMLButtonElement>(null);
  const stowRef = useRef<HTMLButtonElement>(null);
  const previousStowed = useRef(stowed);
  const swipe = useRef<{ x: number; y: number; time: number; id: number } | null>(null);

  // Once per instrument per session. The banner is atmosphere the first time and an
  // obstacle every time after, so it is remembered in viewport state rather than replayed.
  const [booted, setBooted] = useViewportState<boolean>(`device.${id}.booted`, false);
  const [bootStep, setBootStep] = useState(0);

  useEffect(() => {
    if (stowed !== previousStowed.current) {
      (stowed ? raiseRef : stowRef).current?.focus();
      previousStowed.current = stowed;
    }
  }, [stowed, expanded]);

  const startSwipe = (event: PointerEvent<HTMLDivElement>) => {
    if (expanded) return;
    // Screen scrolling and the instrument's own controls retain their normal gestures.
    if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button, input, select, textarea, canvas, [data-device-screen]')) return;
    swipe.current = { x: event.clientX, y: event.clientY, time: event.timeStamp, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const endSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (start?.id === event.pointerId && isStowSwipe(event.clientX - start.x, event.clientY - start.y, event.timeStamp - start.time)) navigation.present('stowed');
  };

  // The banner prints itself and hands over. Nothing waits on the trainee.
  useEffect(() => {
    if (booted) return;
    const lines = bootLines ?? [];
    const per = Math.max(120, BOOT_MS / Math.max(1, lines.length + 1));
    const timers = lines.map((_, i) => setTimeout(() => setBootStep(i + 1), per * (i + 1)));
    const done = setTimeout(() => setBooted(true), BOOT_MS);
    return () => {
      for (const t of timers) clearTimeout(t);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted]);

  const b = BODY[form];

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden', background: '#0b0f14' }}>
      {!expanded && <Tailgate ui={ui} big={stowed} />}

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
          top: 'clamp(28px, 18%, 150px)',
          overflowY: 'auto',
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

        {/* Top edge: brand and model, the way it is silkscreened on the case. */}
        <div className="held-ports" style={{ display: expanded ? 'none' : 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span className="mono" style={{ fontSize: 10, color: '#aab3bd', letterSpacing: 1 }}>
            FIBEROPS <span style={{ color: '#6e7883' }}>{model}</span>
          </span>
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.4, color: booted ? '#37d67a' : '#f0a02a' }}>
            {booted ? 'READY' : 'BOOTING'}
          </span>
        </div>

        {/* Screen. */}
        <div
          data-device-screen
          style={{
            flex: '1 1 auto',
            minHeight: 180,
            borderRadius: b.screenRadius,
            border: '2px solid #14171b',
            background: 'var(--bg)',
            boxShadow: 'inset 0 0 22px rgba(90,176,255,0.10)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {!booted ? (
            <div className="mono" style={{ padding: 12, color: 'var(--cursor-a)', fontSize: 11, lineHeight: 1.7 }}>
              {(bootLines ?? []).slice(0, bootStep).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <div style={{ color: 'var(--muted)' }}>_</div>
            </div>
          ) : (
            !stowed && <div style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>{children}</div>
          )}
        </div>

        {/* Physical key row: the keys that change what the instrument measures. */}
        {softKeys.length > 0 && (
          <div style={{ display: expanded ? 'none' : 'flex', alignItems: 'center', gap: 6, flexShrink: 0, overflowX: 'auto' }}>
            {softKeys.map((k) => (
              <button
                key={k.label}
                type="button"
                onClick={k.onClick}
                disabled={k.disabled || !booted}
                style={{
                  minHeight: 34,
                  flexShrink: 0,
                  padding: '4px 10px',
                  borderRadius: 7,
                  border: '1px solid #171a1e',
                  background: k.active ? 'linear-gradient(#5a636d, #3d444b)' : 'linear-gradient(#3f454c, #2a2f34)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                  color: k.disabled || !booted ? '#5c646d' : '#d7dee8',
                  fontSize: 11,
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {stowed && <button ref={raiseRef} type="button" className="held-raise" onClick={() => navigation.present('raised')} aria-label={`Raise ${name}`}>
        <span aria-hidden style={{ color: booted ? 'var(--led-ok)' : 'var(--led-warn)' }}>●</span>
        <strong>⌃ {name}</strong><span>{booted ? status ?? 'Ready' : 'Booting…'}</span>
      </button>}
    </div>
  );
}
