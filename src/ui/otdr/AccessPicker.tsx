import type { FiberSpan, FiberTubeColor, TopologyNode } from '../../world';
import { Chip } from '../components/Chip';

export interface AccessSelection {
  launchSpanId: string;
  strand?: { tubeColor: FiberTubeColor; fiberColor: FiberTubeColor };
}

/** Every incident span at the trainee's current location, with strand chips for stranded cables. Access is always *from where you're standing* -- there is no separate node picker. */
export function AccessPicker({
  locationNodeId,
  spans,
  selection,
  onChange,
}: {
  locationNodeId: string;
  spans: FiberSpan[];
  selection: AccessSelection | null;
  onChange(selection: AccessSelection): void;
}) {
  const incident = spans.filter((s) => s.fromNodeId === locationNodeId || s.toNodeId === locationNodeId);
  const selectedSpan = incident.find((s) => s.id === selection?.launchSpanId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Launch into</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {incident.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>No fiber here.</span>}
        {incident.map((span) => (
          <Chip key={span.id} active={span.id === selection?.launchSpanId} onClick={() => onChange({ launchSpanId: span.id })}>
            {span.id}
          </Chip>
        ))}
      </div>
      {selectedSpan?.strands && selectedSpan.strands.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Strand</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selectedSpan.strands.map((strand) => {
              const active = selection?.strand?.tubeColor === strand.tubeColor && selection?.strand?.fiberColor === strand.fiberColor;
              return (
                <Chip key={`${strand.tubeColor}-${strand.fiberColor}`} active={active} onClick={() => onChange({ launchSpanId: selectedSpan.id, strand: { tubeColor: strand.tubeColor, fiberColor: strand.fiberColor } })}>
                  {strand.tubeColor}/{strand.fiberColor}
                </Chip>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function nodeLabel(nodes: TopologyNode[], nodeId: string): string {
  return nodes.find((n) => n.id === nodeId)?.label ?? nodeId;
}
