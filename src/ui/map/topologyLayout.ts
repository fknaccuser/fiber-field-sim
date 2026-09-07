import type { FiberSpan, NodeKind, TopologyNode } from '../../world';

export interface LaidOutNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** 0 at the upstream roots (OLT), increasing toward customers. -1 for nodes with no optical role (yard, POP). */
  depth: number;
  x: number;
  y: number;
  z: number;
}

export interface LaidOutSpan {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  lengthMeters: number;
}

export interface TopologyLayout {
  nodes: LaidOutNode[];
  spans: LaidOutSpan[];
  /** Extent along x, in scene units. */
  width: number;
  /** Extent along z, in scene units. */
  length: number;
}

export interface LayoutOptions {
  siblingGap: number;
  levelGap: number;
}

const DEFAULTS: LayoutOptions = { siblingGap: 1.6, levelGap: 2.4 };

/**
 * Tidy tree layout over the span graph: upstream (`fromNodeId`) is the parent, downstream
 * (`toNodeId`) the child. Every leaf takes one slot along x; each parent sits centered over
 * its children; depth maps to z. Purely topological -- nodes carry no coordinates.
 */
export function layoutTopology(nodes: TopologyNode[], spans: FiberSpan[], options: Partial<LayoutOptions> = {}): TopologyLayout {
  const { siblingGap, levelGap } = { ...DEFAULTS, ...options };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  const touched = new Set<string>();
  const laidOutSpans: LaidOutSpan[] = [];

  for (const s of spans) {
    if (!byId.has(s.fromNodeId) || !byId.has(s.toNodeId)) continue;
    touched.add(s.fromNodeId);
    touched.add(s.toNodeId);
    hasParent.add(s.toNodeId);
    children.set(s.fromNodeId, [...(children.get(s.fromNodeId) ?? []), s.toNodeId]);
    laidOutSpans.push({ id: s.id, fromNodeId: s.fromNodeId, toNodeId: s.toNodeId, lengthMeters: s.lengthMeters });
  }

  const placed = new Map<string, { depth: number; slot: number }>();
  const visiting = new Set<string>();
  let cursor = 0;
  let maxDepth = 0;

  function place(id: string, depth: number): { min: number; max: number } {
    const already = placed.get(id);
    if (already) return { min: already.slot, max: already.slot };
    visiting.add(id);
    maxDepth = Math.max(maxDepth, depth);
    let min = Infinity;
    let max = -Infinity;
    for (const kid of children.get(id) ?? []) {
      if (visiting.has(kid)) continue;
      const r = place(kid, depth + 1);
      min = Math.min(min, r.min);
      max = Math.max(max, r.max);
    }
    if (min === Infinity) {
      min = max = cursor;
      cursor += 1;
    }
    placed.set(id, { depth, slot: (min + max) / 2 });
    visiting.delete(id);
    return { min, max };
  }

  for (const n of nodes) {
    if (touched.has(n.id) && !hasParent.has(n.id)) {
      place(n.id, 0);
      cursor += 1;
    }
  }
  for (const n of nodes) {
    if (touched.has(n.id) && !placed.has(n.id)) {
      place(n.id, 0);
      cursor += 1;
    }
  }

  const isolated = nodes.filter((n) => !touched.has(n.id));
  const slots = Math.max(cursor - 1, isolated.length, 1);
  const centerSlot = (slots - 1) / 2;

  const laidOutNodes: LaidOutNode[] = [];
  for (const n of nodes) {
    const p = placed.get(n.id);
    if (!p) continue;
    laidOutNodes.push({ id: n.id, kind: n.kind, label: n.label, depth: p.depth, x: (p.slot - centerSlot) * siblingGap, y: 0, z: p.depth * levelGap });
  }
  isolated.forEach((n, i) => {
    const slot = isolated.length === 1 ? centerSlot : (i / (isolated.length - 1)) * (slots - 1);
    laidOutNodes.push({ id: n.id, kind: n.kind, label: n.label, depth: -1, x: (slot - centerSlot) * siblingGap, y: 0, z: -levelGap });
  });

  return {
    nodes: laidOutNodes,
    spans: laidOutSpans,
    width: slots * siblingGap,
    length: (maxDepth + (isolated.length > 0 ? 1 : 0)) * levelGap,
  };
}
