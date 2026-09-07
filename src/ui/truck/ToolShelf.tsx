/**
 * The back of the truck. Opening the utility body shows the shelf as it actually is: the
 * instruments you loaded, gaps where the ones you forgot should be, and the laptop with the
 * paperwork on it. Picking a tool up is what opens an instrument — there is no tab strip.
 */
import { useEffect, useState } from 'react';
import type { UiSessionState } from '../../session/runner';
import type { TabId } from '../field/navigation';
import { TOOL_ART } from './toolModels';
import { consumables, LAPTOP_APPS, shelfSlots } from './shelfState';

/** A shelf edge with real thickness: lit top lip, dark underside, extruded front rail. */
function Rail({ label }: { label?: string }) {
  return (
    <div aria-hidden style={{ position: 'relative', height: 13, flexShrink: 0 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(#2b3a49 0 1px, #1b2836 1px 5px, #0d151e 5px 9px, #060b12 9px 100%)',
          boxShadow: '0 5px 12px rgba(0,0,0,0.55)',
        }}
      />
      <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 5, background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 11px, transparent 11px 22px)' }} />
      {label && (
        <span
          className="mono"
          style={{ position: 'absolute', right: 10, top: 1, fontSize: 8, letterSpacing: 1.6, color: 'rgba(127,212,232,0.45)' }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * The roll-up door, and the interior lights coming up behind it.
 *
 * Runs once on arrival. Honours prefers-reduced-motion by simply not being there — the
 * shelf is fully usable the instant it mounts either way, because the door never blocks
 * pointer events.
 */
function RollUpDoor() {
  const [open, setOpen] = useState(false);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Not gated on requestAnimationFrame: rAF is throttled to zero in a document that is not
  // being rendered, which would leave the door shut over the shelf until the tab came back.
  // The effect runs after the closed state has painted, so the transition still plays.
  useEffect(() => setOpen(true), []);

  if (reduced) return null;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 3,
        pointerEvents: 'none',
        // Slats roll up out of frame; the last of the daylight goes with them.
        background: 'repeating-linear-gradient(180deg, #1a242e 0 7px, #101820 7px 9px, #232f3a 9px 16px)',
        borderBottom: '2px solid #05090e',
        transformOrigin: 'top',
        transform: open ? 'translateY(-101%)' : 'translateY(0)',
        transition: 'transform 620ms cubic-bezier(0.35, 0, 0.2, 1)',
      }}
    />
  );
}

/** A tool sitting in its cutout: foam wall, shadowed recess, and a gap you can read. */
function Cutout({ children, empty }: { children: React.ReactNode; empty: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 7,
        padding: 7,
        background: empty
          ? 'radial-gradient(120% 100% at 50% 0%, #070d14, #04080d)'
          : 'radial-gradient(120% 100% at 50% 0%, #141d27, #0a1119)',
        boxShadow: empty
          ? 'inset 0 3px 10px rgba(0,0,0,0.95), inset 0 0 0 1px rgba(255,90,110,0.14)'
          : 'inset 0 2px 7px rgba(0,0,0,0.75), inset 0 0 0 1px rgba(127,212,232,0.07)',
      }}
    >
      {children}
    </div>
  );
}

/** Fibre reel on its spindle, standing on the lower shelf. */
function Reel({ metres }: { metres: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <svg width={44} height={44} viewBox="-22 -22 44 44" aria-hidden="true">
        <circle cx={0} cy={0} r={20} fill="none" stroke="#22323f" strokeWidth={2} />
        <circle cx={0} cy={0} r={19} fill="none" stroke="rgba(127,212,232,0.10)" strokeWidth={1} />
        {/* Wound fibre: tighter rings toward the hub. */}
        {[15.5, 13.5, 11.5, 9.5, 7.5].map((r) => (
          <circle key={r} cx={0} cy={0} r={r} fill="none" stroke="var(--cyan)" strokeWidth={0.7} opacity={0.30} />
        ))}
        <circle cx={0} cy={0} r={5} fill="#0a1119" stroke="#2b3a49" strokeWidth={1.5} />
        <circle cx={0} cy={0} r={1.6} fill="#2b3a49" />
      </svg>
      <div>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: 1, color: 'var(--cyan)' }}>LAUNCH REEL</div>
        <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: 'var(--ink-soft)' }}>{metres.toUpperCase()}</div>
      </div>
    </div>
  );
}

export function ToolShelf({ ui, onOpen }: { ui: UiSessionState; onOpen(tab: TabId): void }) {
  const slots = shelfSlots(ui.world.truckInventory);
  const stock = consumables(ui.world.truckInventory);
  // The reel is a physical object on the shelf, not a chip in a row.
  const reel = stock.find((c) => c.label === 'Launch reel' && c.present) ?? null;
  const missing = slots.filter((s) => !s.present);
  // The morning itself, when it went wrong. `coaching` is already role-gated where it is
  // decided — junior grades are told the habit that prevents it, senior grades are not.
  const morning = ui.meta.readiness ?? null;

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden', background: '#04080d' }}>
      <RollUpDoor />
      {/* Interior lights: a strip along the top lip of the body, falling off with depth. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(140% 62% at 50% -8%, rgba(180,225,255,0.13), rgba(10,18,27,0.35) 52%, rgba(4,8,13,0.9) 100%)',
          animation: 'lightsUp 700ms ease-out 220ms both',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: '12px 12px 6px' }}>
        <div className="eyebrow">SERVICE BODY · DRIVER SIDE</div>
        <div className="hud-title" style={{ fontSize: 15, marginTop: 2 }}>TOOL SHELF</div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: 'var(--ink-soft)', marginTop: 3 }}>
          {slots.filter((s) => s.present).length}/{slots.length} INSTRUMENTS LOADED
          {missing.length > 0 && <span style={{ color: 'var(--red)' }}> · {missing.map((m) => m.tool.name.toUpperCase()).join(', ')} NOT ON THE TRUCK</span>}
        </div>
        {morning?.fault && (
          <div className="bezel alert" style={{ marginTop: 10, padding: '9px 11px' }}>
            <div className="eyebrow" style={{ color: 'var(--orange)' }}>This morning</div>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink)' }}>{morning.headline}</p>
            {morning.coaching && (
              <p style={{ margin: '7px 0 0', fontSize: 12, lineHeight: 1.55, color: 'var(--ink-soft)' }}>
                Happens to everyone. {morning.coaching}
              </p>
            )}
          </div>
        )}
      </div>

      <Rail label="UPPER SHELF" />

      {/* Upper shelf: the instruments, each in its cutout. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, padding: 10 }}>
        {slots.map(({ tool, present }) => {
          const Art = TOOL_ART[tool.id];
          return (
            <button
              key={tool.id}
              type="button"
              disabled={!present}
              onClick={() => onOpen(tool.opens)}
              title={present ? `Pick up the ${tool.name}` : `${tool.name} is not on the truck`}
              className={present ? 'bezel' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: 10,
                textAlign: 'left',
                background: present ? 'linear-gradient(#111a24, #0a1018)' : 'transparent',
                border: present ? undefined : '1px dashed #2a3a47',
                borderRadius: 2,
                color: 'var(--ink)',
                cursor: present ? 'pointer' : 'default',
                minHeight: 150,
              }}
            >
              <Cutout empty={!present}>
                <Art missing={!present} />
              </Cutout>
              <div style={{ marginTop: 'auto' }}>
                <div className="mono" style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: present ? 'var(--cyan)' : '#33465a' }}>
                  {tool.name.toUpperCase()}
                </div>
                <div className="mono" style={{ fontSize: 9, letterSpacing: 1.5, color: 'var(--ink-soft)' }}>
                  {present ? `FIBEROPS ${tool.model}` : 'EMPTY SLOT'}
                </div>
                <div style={{ fontSize: 10.5, color: present ? 'var(--ink-soft)' : '#33465a', marginTop: 4, lineHeight: 1.4 }}>
                  {present ? tool.blurb : 'You did not load this before you left the yard.'}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <Rail label="LOWER SHELF" />

      {/* Lower shelf: what lives on the laptop, and consumables. */}
      <div style={{ padding: 10 }}>
        <div className="eyebrow" style={{ color: 'var(--cyan)' }}>ON THE LAPTOP</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
          {LAPTOP_APPS.map((app) => (
            <button
              key={app.opens}
              type="button"
              onClick={() => onOpen(app.opens)}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                minHeight: 44,
                padding: '8px 11px',
                textAlign: 'left',
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 2,
                color: 'var(--ink)',
              }}
            >
              <span className="mono" style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: 'var(--cyan)', flexShrink: 0 }}>{app.label.toUpperCase()}</span>
              <span style={{ fontSize: 10.5, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.blurb}</span>
            </button>
          ))}
        </div>

        <div className="eyebrow" style={{ color: 'var(--cyan)', marginTop: 14 }}>CONSUMABLES</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {reel && <Reel metres={reel.detail} />}
          {stock.filter((c) => c.label !== 'Launch reel' || !reel).map((c) => (
            <div
              key={c.label}
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: 1,
                padding: '7px 10px',
                border: `1px solid ${c.present ? 'var(--line)' : 'var(--red)'}`,
                borderRadius: 2,
                color: c.present ? 'var(--ink-soft)' : 'var(--red)',
              }}
            >
              {c.label.toUpperCase()} · {c.detail.toUpperCase()}
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
