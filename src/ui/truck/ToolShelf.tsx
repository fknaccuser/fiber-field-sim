/**
 * The back of the truck. Opening the utility body shows the shelf as it actually is: the
 * instruments you loaded, gaps where the ones you forgot should be, and the laptop with the
 * paperwork on it. Picking a tool up is what opens an instrument — there is no tab strip.
 */
import type { UiSessionState } from '../../session/runner';
import type { TabId } from '../field/navigation';
import { TOOL_ART } from './toolModels';
import { consumables, LAPTOP_APPS, shelfSlots } from './shelfState';

function Rail() {
  return <div aria-hidden style={{ height: 6, background: 'repeating-linear-gradient(90deg, #17222c 0 10px, #0e1720 10px 20px)', borderTop: '1px solid #22323f', borderBottom: '1px solid #060b10' }} />;
}

export function ToolShelf({ ui, onOpen }: { ui: UiSessionState; onOpen(tab: TabId): void }) {
  const slots = shelfSlots(ui.world.truckInventory);
  const stock = consumables(ui.world.truckInventory);
  const missing = slots.filter((s) => !s.present);
  // The morning itself, when it went wrong. `coaching` is already role-gated where it is
  // decided — junior grades are told the habit that prevents it, senior grades are not.
  const morning = ui.meta.readiness ?? null;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'linear-gradient(#0a121b, #060b10)' }}>
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

      <Rail />

      {/* Upper shelf: the instruments. */}
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
                background: present ? 'var(--panel)' : 'transparent',
                border: present ? undefined : '1px dashed #2a3a47',
                borderRadius: 2,
                color: 'var(--ink)',
                cursor: present ? 'pointer' : 'default',
                minHeight: 150,
              }}
            >
              <Art missing={!present} />
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

      <Rail />

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
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {stock.map((c) => (
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
  );
}
