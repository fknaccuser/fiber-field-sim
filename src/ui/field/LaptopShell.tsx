/**
 * The laptop, open on the tailgate.
 *
 * The console, the plant records and the work order are not three tabs — they are three
 * things on one machine, and that machine is a physical object sitting on the back of the
 * truck. Wrapping them in the same shell is what makes "go and look it up on the laptop"
 * mean something.
 *
 * Depth is a single CSS perspective on the keyboard deck rather than any 3D: the lid stands
 * up, the deck lies down and away from you, and the truck bed shows around it. No GL
 * context, so this can sit behind any of the keep-alive viewports without competing with
 * the world scene.
 */
import { useEffect, useState, type ReactNode } from 'react';

/** Suggestion of a keyboard, not a working one — you type into the console, not into this. */
function Deck({ compact }: { compact: boolean }) {
  const rows = compact ? [12] : [13, 12, 11];
  return (
    <div
      aria-hidden
      style={{
        flex: '0 0 auto',
        transform: 'perspective(340px) rotateX(52deg)',
        transformOrigin: 'top center',
        background: 'linear-gradient(#1b242e, #0e151d)',
        borderTop: '1px solid #2c3a49',
        borderRadius: '0 0 10px 10px',
        padding: compact ? '7px 12px 10px' : '9px 12px 14px',
        boxShadow: 'inset 0 8px 18px rgba(0,0,0,0.55)',
      }}
    >
      {rows.map((count, r) => (
        <div key={r} style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: 3 }}>
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                maxWidth: 22,
                height: 7,
                borderRadius: 1.5,
                background: '#0a1119',
                boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.05)',
              }}
            />
          ))}
        </div>
      ))}
      {!compact && (
        <span style={{ display: 'block', width: 74, height: 16, margin: '5px auto 0', borderRadius: 2, background: '#111a23', border: '1px solid #22303d' }} />
      )}
    </div>
  );
}

export function LaptopShell({ title, children }: { title: string; children: ReactNode }) {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [open, setOpen] = useState(reduced);

  // Set directly, not inside requestAnimationFrame: rAF is throttled to zero in a document
  // that is not being rendered, which would leave the lid shut over the console.
  useEffect(() => setOpen(true), []);

  // On a short screen the deck is the first thing to go — the console matters more than
  // the prop around it.
  const compact = typeof window !== 'undefined' && window.innerHeight < 620;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        // The truck bed: ribbed liner, tailgate lip catching the light at the bottom.
        background:
          'linear-gradient(180deg, #070d14 0%, #0a121b 62%, #0d161f 100%), repeating-linear-gradient(90deg, rgba(255,255,255,0.012) 0 3px, transparent 3px 9px)',
        padding: '6px 6px 0',
      }}
    >
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          transformOrigin: 'bottom center',
          transform: open ? 'rotateX(0deg)' : 'perspective(900px) rotateX(-82deg)',
          opacity: open ? 1 : 0.2,
          transition: reduced ? undefined : 'transform 520ms cubic-bezier(0.25, 0.9, 0.3, 1), opacity 320ms ease-out',
          borderRadius: '9px 9px 0 0',
          padding: '8px 8px 0',
          background: 'linear-gradient(#1c2530, #10171f)',
          border: '1px solid #2c3a49',
          borderBottom: 'none',
          boxShadow: '0 -10px 30px rgba(0,0,0,0.5)',
        }}
      >
        {/* Lid top: webcam and the model on the bezel. */}
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 11 }}>
          <span aria-hidden style={{ width: 4, height: 4, borderRadius: '50%', background: '#0a1a24', border: '1px solid #1b3543' }} />
          <span className="mono" style={{ fontSize: 7.5, letterSpacing: 2, color: 'var(--ink-faint)' }}>
            FIBEROPS FO-BOOK
          </span>
        </div>

        {/* Screen. */}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            marginTop: 6,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--void)',
            border: '1px solid #0b1520',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <div
            className="mono"
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '5px 10px',
              fontSize: 9,
              letterSpacing: 1.5,
              color: 'var(--ink-soft)',
              borderBottom: '1px solid rgba(127,212,232,0.09)',
              background: 'rgba(10,15,29,0.7)',
            }}
          >
            <span className="pulse-dot" style={{ width: 6, height: 6, background: 'var(--green)' }} />
            {title.toUpperCase()}
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>{children}</div>
        </div>
      </div>

      <Deck compact={compact} />
    </div>
  );
}
