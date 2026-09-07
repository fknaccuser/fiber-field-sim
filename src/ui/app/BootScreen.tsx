import { useEffect, useState } from 'react';

/**
 * The moment the fiction starts. Held for a minimum beat even when the app is ready
 * sooner — booting instantly reads as a web page, and this is meant to read as equipment
 * coming up.
 */
const MIN_HOLD_MS = 900;

const LINES = ['LINKING OPTICAL PLANT MODEL', 'LOADING FAULT TAXONOMY', 'CALIBRATING INSTRUMENTS', 'DISPATCH UPLINK ESTABLISHED'];

export function useBootHold(minMs = MIN_HOLD_MS): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), minMs);
    return () => clearTimeout(t);
  }, [minMs]);
  return done;
}

export function BootScreen() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timers = LINES.map((_, i) => setTimeout(() => setStep(i + 1), (MIN_HOLD_MS / (LINES.length + 1)) * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        background: '#050b14',
        backgroundImage:
          'radial-gradient(ellipse 60% 45% at 82% 8%, rgba(0,240,255,0.13), transparent 70%), radial-gradient(ellipse 50% 40% at 10% 95%, rgba(255,107,0,0.07), transparent 70%)',
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className="mono"
        style={{
          fontSize: 12,
          letterSpacing: 4,
          textTransform: 'uppercase',
          color: 'var(--cyan)',
          textShadow: '0 0 18px rgba(0,240,255,0.6)',
        }}
      >
        Initializing field systems
        <span style={{ animation: 'pulseDot 1.1s ease-in-out infinite' }}>…</span>
      </div>

      {/* Boot log, printed a line at a time underneath. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 72, minWidth: 240 }}>
        {LINES.slice(0, step).map((line) => (
          <div key={line} className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--ink-faint)' }}>
            <span style={{ color: 'var(--green)' }}>OK</span> &nbsp;{line}
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', bottom: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="pulse-dot" style={{ width: 6, height: 6 }} />
        <span className="eyebrow" style={{ fontSize: 9, color: 'var(--ink-faint)' }}>
          FIBER//OPS FIELD SIMULATION ENGINE
        </span>
      </div>
    </div>
  );
}
