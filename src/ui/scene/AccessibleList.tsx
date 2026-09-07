/**
 * The non-3D equivalent of the world view: every object the scene draws, as a grouped,
 * keyboard-navigable list with the same selection and the same actions. Also the fallback
 * on a device that cannot run WebGL.
 */
import type { UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { SoftKey } from '../components/SoftKey';
import type { Placement, SceneLayout } from './sceneLayout';

const GROUPS: Array<{ title: string; kinds: Placement['kind'][] }> = [
  { title: 'Central office', kinds: ['pop', 'device'] },
  { title: 'Cabinets', kinds: ['fdh', 'splitter'] },
  { title: 'Underground', kinds: ['handhole'] },
  { title: 'Terminals', kinds: ['pedestal'] },
  { title: 'Premises', kinds: ['house', 'nid', 'ont'] },
  { title: 'Yard', kinds: ['yard'] },
];

export function AccessibleList({ ui, layout, selectedId, onSelect, dispatch }: { ui: UiSessionState; layout: SceneLayout; selectedId: string | null; onSelect(id: string | null): void; dispatch(intent: Intent): void }) {
  return (
    <div style={{ padding: '44px 8px 8px', overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Every object in the 3D world, as a list. Same selection, same actions.</div>
      {GROUPS.map((group) => {
        const items = layout.placements.filter((p) => group.kinds.includes(p.kind));
        if (items.length === 0) return null;
        return (
          <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{group.title}</div>
            {items.map((p) => {
              const isSelected = selectedId === p.nodeId;
              const here = ui.locationNodeId === p.nodeId;
              const real = ui.world.topology.nodes.some((n) => n.id === p.nodeId);
              return (
                <div key={p.nodeId} className="bezel" style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 8, borderColor: isSelected ? 'var(--cursor-b)' : undefined }}>
                  <button type="button" onClick={() => onSelect(isSelected ? null : p.nodeId)} style={{ flex: 1, minHeight: 40, textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 13 }}>
                    {p.node.label}
                    {here && <span style={{ color: 'var(--led-ok)', fontSize: 11 }}> · here</span>}
                  </button>
                  {real && !here && <SoftKey label="Roll" onClick={() => dispatch({ type: 'truck-roll', toNodeId: p.nodeId })} />}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
