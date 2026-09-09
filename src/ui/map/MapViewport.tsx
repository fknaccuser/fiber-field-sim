/**
 * The print, and everything you do from it.
 *
 * This is now the home of the session, so it has to answer three questions without the
 * trainee hunting: where am I, what else is out there, and how do I get to it. It used to
 * answer the last two only if you managed to tap a nine-pixel plan symbol — the roll-truck
 * control existed but was invisible until a lucky hit, and on a block sheet with two
 * symbols on it there was very little to hit.
 *
 * So there are two ways in now. The drawing, for people who read drawings, with tap targets
 * sized for a thumb; and the plant index, which lists everything the topology contains and
 * puts it under your finger on the tightest sheet. The index deliberately does *not* roll
 * the truck — it shows you where the thing is, and then the footer offers the roll. Finding
 * it and driving to it are two different decisions and the print is where the first one is
 * made.
 */
import type { UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import type { NodeKind } from '../../world';
import { Sheet } from '../components/Sheet';
import { SoftKey } from '../components/SoftKey';
import { kindLabel } from '../field/nodeLabels';
import { travelTimeSeconds } from '../../session/location';
import { useViewportState } from '../viewport/viewportStore';
import { Blueprint } from './Blueprint';
import { ZOOM_LABEL, ZOOM_NOTE, ZOOM_ORDER, type ZoomLevel } from './sheet';

const LEGEND: Array<[string, string]> = [
  ['#34d399', 'You are here'],
  ['#00f0ff', 'Tested'],
  ['#ff4d5e', 'Bad reading'],
  ['#ff6b00', 'Claimed'],
];

function minutesAway(ui: UiSessionState, nodeId: string): number {
  return Math.round(travelTimeSeconds(ui.meta, ui.locationNodeId, nodeId) / 60);
}

export function MapViewport({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const [selected, setSelected] = useViewportState<string | null>('map.selected', null);
  const [level, setLevel] = useViewportState<ZoomLevel>('map.zoom', 'neighbourhood');
  const [indexOpen, setIndexOpen] = useViewportState<boolean>('map.index', false);
  const [keyOpen, setKeyOpen] = useViewportState<boolean>('map.key', false);

  const node = selected ? ui.world.topology.nodes.find((n) => n.id === selected) ?? null : null;
  const here = ui.world.topology.nodes.find((n) => n.id === ui.locationNodeId) ?? null;
  const onSite = node !== null && node.id === ui.locationNodeId;

  // Everything in the plant, grouped the way it is grouped on a drawing legend.
  const grouped = new Map<NodeKind, typeof ui.world.topology.nodes>();
  for (const n of ui.world.topology.nodes) {
    const list = grouped.get(n.kind) ?? [];
    list.push(n);
    grouped.set(n.kind, list);
  }

  /** Put a node under the reader's finger: select it and drop to the sheet that frames it. */
  const locate = (nodeId: string) => {
    setSelected(nodeId);
    setLevel('site');
    setIndexOpen(false);
  };

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <Blueprint ui={ui} level={level} selectedNodeId={selected} onSelectNode={setSelected} />

      {/* Sheet selector: the three drawings you would actually carry. */}
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {ZOOM_ORDER.map((z) => (
            <button key={z} type="button" className={`hud-chip${z === level ? ' is-on' : ''}`} onClick={() => setLevel(z)}>
              {ZOOM_LABEL[z]}
            </button>
          ))}
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', paddingLeft: 2 }}>
          {ZOOM_NOTE[level]}
        </div>
      </div>

      {/* The key folds away. Four colour swatches permanently over the drawing is four
          things covering the thing you are trying to read. */}
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <button type="button" className={`hud-chip${keyOpen ? ' is-on' : ''}`} onClick={() => setKeyOpen(!keyOpen)} aria-expanded={keyOpen}>
          KEY
        </button>
        {keyOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: 'var(--ink-soft)', pointerEvents: 'none', textAlign: 'right' }}>
            {LEGEND.map(([color, label]) => (
              <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                <span style={{ letterSpacing: 0.5 }}>{label}</span>
                <span style={{ width: 7, height: 7, background: color, display: 'inline-block' }} />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* The footer is always there. Empty-handed it still tells you where you are standing
          and offers the index; with something selected it offers the roll. */}
      <div className="bezel" style={{ position: 'absolute', left: 8, right: 8, bottom: 8, padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="hud-title" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node ? node.label : here?.label ?? ui.locationNodeId}
          </div>
          <div className="eyebrow" style={{ fontSize: 10 }}>
            {node
              ? onSite
                ? `${kindLabel(node.kind)} · you are here`
                : `${kindLabel(node.kind)} · ${minutesAway(ui, node.id)} min away`
              : 'Parked here · tap a symbol to select'}
          </div>
        </div>
        {node && !onSite ? (
          <SoftKey label="Roll truck here" onClick={() => dispatch({ type: 'truck-roll', toNodeId: node.id })} />
        ) : (
          <SoftKey label="Plant index" tone="cyan" onClick={() => setIndexOpen(true)} />
        )}
      </div>

      <Sheet open={indexOpen} onClose={() => setIndexOpen(false)} title="Plant index">
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '0 0 12px' }}>
          Everything the records place on this drawing. Choosing one shows it on the site sheet — it does not move the truck.
        </p>
        {Array.from(grouped.entries()).map(([kind, nodes]) => (
          <div key={kind} style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 6 }}>
              {kindLabel(kind)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {nodes.map((n) => {
                const isHere = n.id === ui.locationNodeId;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => locate(n.id)}
                    style={{
                      minHeight: 44,
                      textAlign: 'left',
                      background: n.id === selected ? 'rgba(0,240,255,0.10)' : 'rgba(30,41,59,0.5)',
                      border: `1px solid ${isHere ? 'var(--led-ok)' : 'var(--cyan-line)'}`,
                      borderRadius: 'var(--radius)',
                      color: 'var(--ink)',
                      padding: '9px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      fontFamily: 'var(--font-body)',
                      fontSize: 12.5,
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
                    <span className="mono" style={{ color: isHere ? 'var(--led-ok)' : 'var(--orange)', flexShrink: 0, fontSize: 11 }}>
                      {isHere ? 'HERE' : `${minutesAway(ui, n.id)} MIN`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Sheet>
    </div>
  );
}
