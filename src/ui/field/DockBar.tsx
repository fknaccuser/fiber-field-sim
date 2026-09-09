/**
 * The dock. Three places a technician can be, not ten tabs: on the print, in the back of
 * the truck, or on the phone. Everything else is reached by picking something up off the
 * shelf.
 *
 * The print leads because the print is where the job is read. There used to be a fourth
 * slot, LOOK, holding a 3D street you could walk down; it was pretty and it was never how
 * the work got done, and losing it gave the drawing the whole screen.
 */
import type { TabId } from './navigation';
import { SHELF_TABS } from './navigation';

type Slot = { id: TabId; label: string; icon: 'map' | 'truck' | 'phone' };

const SLOTS: Slot[] = [
  { id: 'map', label: 'PRINT', icon: 'map' },
  { id: 'shelf', label: 'TRUCK', icon: 'truck' },
  { id: 'phone', label: 'PHONE', icon: 'phone' },
];

function Icon({ kind, lit }: { kind: Slot['icon']; lit: boolean }) {
  const stroke = lit ? 'var(--cyan)' : 'var(--ink-soft)';
  const common = { fill: 'none', stroke, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden style={{ filter: lit ? 'drop-shadow(0 0 6px rgba(59,232,216,.55))' : undefined }}>
      {kind === 'map' && (
        <>
          <path d="M3 6 L9 4 L15 6 L21 4 V18 L15 20 L9 18 L3 20 Z" {...common} />
          <path d="M9 4 V18 M15 6 V20" {...common} />
        </>
      )}
      {kind === 'truck' && (
        <>
          <path d="M2 7 H14 V16 H2 Z M14 10 H18 L22 13 V16 H14 Z" {...common} />
          <circle cx="7" cy="18" r="2" {...common} />
          <circle cx="17" cy="18" r="2" {...common} />
        </>
      )}
      {kind === 'phone' && (
        <>
          <rect x="6" y="2" width="12" height="20" rx="2.5" {...common} />
          <path d="M10.5 18.5 h3" {...common} />
        </>
      )}
    </svg>
  );
}

export function DockBar({ active, onGo, phoneBadge = 0 }: { active: TabId; onGo(id: TabId): void; phoneBadge?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexShrink: 0,
        background: '#0a1119',
        borderTop: '1px solid rgba(59,232,216,0.28)',
        boxShadow: '0 -1px 18px rgba(59,232,216,0.10)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {SLOTS.map((slot) => {
        // Anything you got to by opening the truck keeps the truck lit.
        const lit = slot.id === 'shelf' ? SHELF_TABS.includes(active) : active === slot.id;
        return (
          <button
            key={slot.id}
            type="button"
            onClick={() => onGo(slot.id)}
            aria-current={lit ? 'page' : undefined}
            style={{
              flex: 1,
              minHeight: 56,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              position: 'relative',
              background: lit ? 'rgba(59,232,216,0.07)' : 'transparent',
              border: 'none',
              borderTop: `2px solid ${lit ? 'var(--cyan)' : 'transparent'}`,
              color: lit ? 'var(--cyan)' : 'var(--ink-soft)',
              cursor: 'pointer',
            }}
          >
            <Icon kind={slot.icon} lit={lit} />
            <span style={{ fontFamily: 'var(--font-label)', fontSize: 9, letterSpacing: 2, fontWeight: 800 }}>{slot.label}</span>
            {slot.id === 'phone' && phoneBadge > 0 && (
              <span
                className="mono"
                style={{ position: 'absolute', top: 6, right: '50%', marginRight: -22, minWidth: 16, height: 16, lineHeight: '16px', textAlign: 'center', fontSize: 9, fontWeight: 800, borderRadius: 8, background: 'var(--orange)', color: '#2b1200' }}
              >
                {phoneBadge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
