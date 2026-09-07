import type { UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { SoftKey } from '../components/SoftKey';
import { useViewportState } from '../viewport/viewportStore';
import { Blueprint } from './Blueprint';
import { ZOOM_LABEL, ZOOM_NOTE, ZOOM_ORDER, type ZoomLevel } from './sheet';

const LEGEND: Array<[string, string]> = [
  ['#34d399', 'You are here'],
  ['#00f0ff', 'Tested'],
  ['#ff4d5e', 'Bad reading'],
  ['#ff6b00', 'Claimed'],
];

export function MapViewport({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const [selected, setSelected] = useViewportState<string | null>('map.selected', null);
  const [level, setLevel] = useViewportState<ZoomLevel>('map.zoom', 'neighbourhood');
  const node = selected ? ui.world.topology.nodes.find((n) => n.id === selected) ?? null : null;
  const here = selected === ui.locationNodeId;

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <Blueprint ui={ui} level={level} selectedNodeId={selected} onSelectNode={setSelected} />

      {/* Sheet selector: the three drawings you would actually carry. */}
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
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

      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 56,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          fontSize: 10,
          color: 'var(--ink-soft)',
          pointerEvents: 'none',
          textAlign: 'right',
        }}
      >
        {LEGEND.map(([color, label]) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
            <span style={{ letterSpacing: 0.5 }}>{label}</span>
            <span style={{ width: 7, height: 7, background: color, display: 'inline-block' }} />
          </span>
        ))}
      </div>

      {node && (
        <div className="bezel" style={{ position: 'absolute', left: 8, right: 8, bottom: 8, padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="hud-title" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.label}
            </div>
            <div className="eyebrow" style={{ fontSize: 10 }}>
              {node.kind.replace(/-/g, ' ')}
            </div>
          </div>
          <SoftKey label={here ? 'On site' : 'Roll truck here'} disabled={here} onClick={() => dispatch({ type: 'truck-roll', toNodeId: node.id })} />
        </div>
      )}
    </div>
  );
}
