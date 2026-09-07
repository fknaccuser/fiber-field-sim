import type { UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { SoftKey } from '../components/SoftKey';
import { useViewportState } from '../viewport/viewportStore';
import { TopologyMap } from './TopologyMap';

const LEGEND: Array<[string, string]> = [
  ['#37d67a', 'You are here'],
  ['#5ab0ff', 'Tested'],
  ['#ff4d4d', 'Bad reading'],
  ['#ff9d00', 'Claimed'],
];

export function MapViewport({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const [selected, setSelected] = useViewportState<string | null>('map.selected', null);
  const node = selected ? ui.world.topology.nodes.find((n) => n.id === selected) ?? null : null;
  const here = selected === ui.locationNodeId;

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <TopologyMap ui={ui} selectedNodeId={selected} onSelectNode={setSelected} />
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 10, fontSize: 11, color: 'var(--muted)', pointerEvents: 'none' }}>
        {LEGEND.map(([color, label]) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>
      {node && (
        <div className="bezel" style={{ position: 'absolute', left: 8, right: 8, bottom: 8, padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{node.kind}</div>
          </div>
          <SoftKey label={here ? 'On site' : 'Roll truck here'} disabled={here} onClick={() => dispatch({ type: 'truck-roll', toNodeId: node.id })} />
        </div>
      )}
    </div>
  );
}
