/**
 * Plant layout: turns the topology into ground. Every placement and cable route is bound to
 * an actual node or span id -- there is no second topology for drawing. Pure and
 * deterministic (no React, no renderer) so it can be unit-tested and so the same plant
 * always draws the same.
 *
 * This is the only source of position in the session. The print reads it, the truck-roll
 * distances read it, and anything that comes later reads it too.
 *
 * Coordinates are metres-ish: x runs along the street, z across it (street centre at
 * z = 0, houses on the north side at larger z), y is up. Cable lengths are *not* to
 * scale (a 2 km feeder is drawn as a few tens of metres); the trace view maps OTDR
 * distances onto routes proportionally.
 */
import type { FiberSpan, HostConfig, NodeKind, TopologyNode } from '../../world';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type PlacementKind = 'pop' | 'fdh' | 'splitter' | 'handhole' | 'pedestal' | 'house' | 'nid' | 'ont' | 'yard' | 'device';

export interface Placement {
  nodeId: string;
  node: TopologyNode;
  kind: PlacementKind;
  position: Vec3;
  rotationY: number;
  /** For pedestal ports: the physical pedestal all ports of one NAP share. */
  groupId?: string;
  /** For pedestal ports: 1-based port number on the pedestal face. */
  portNo?: number;
  /** For a NID/ONT: the house it belongs to; for a splitter: its cabinet; for a house: its ONT. */
  parentNodeId?: string;
  /** Where cables physically enter/leave this object. */
  anchor: Vec3;
}

export type RouteKind = 'feeder' | 'distribution' | 'drop' | 'jumper';

export interface CableRoute {
  spanId: string;
  span: FiberSpan;
  kind: RouteKind;
  points: Vec3[];
  /** Cumulative polyline length at each point (scene units). */
  cumulative: number[];
}

export interface Lot {
  houseNodeId: string;
  x: number;
  width: number;
}

export interface SceneLayout {
  placements: Placement[];
  routes: CableRoute[];
  lots: Lot[];
  street: { xMin: number; xMax: number };
  /** Physical pedestals (one per NAP), with the terminal node ids that are its ports. */
  pedestals: Array<{ groupId: string; position: Vec3; portNodeIds: string[]; label: string }>;
}

export const STREET_HALF_WIDTH = 4;
export const SIDEWALK_Z: [number, number] = [4.5, 6.5];
export const PARKWAY_Z: [number, number] = [6.5, 9.5];
export const LOT_FRONT_Z = 9.5;
export const HOUSE_W = 11;
export const HOUSE_D = 9;
export const HOUSE_Z = 16.5;
export const LOT_W = 16;
export const TRENCH_Z = 8;
export const TRENCH_Y = -0.7;
export const POP_POS: Vec3 = { x: -42, y: 0, z: -18 };

function byId(nodes: TopologyNode[]): Map<string, TopologyNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

function upstreamSplitter(spans: FiberSpan[], nodes: Map<string, TopologyNode>, startId: string): string | null {
  const seen = new Set<string>();
  let cur = startId;
  while (!seen.has(cur)) {
    seen.add(cur);
    const node = nodes.get(cur);
    if (node?.kind === 'splitter' && cur !== startId) return cur;
    const up = spans.find((s) => s.toNodeId === cur);
    if (!up) return null;
    cur = up.fromNodeId;
  }
  return null;
}

function downstreamSplitter(spans: FiberSpan[], nodes: Map<string, TopologyNode>, startId: string): string | null {
  const seen = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const node = nodes.get(cur);
    if (node?.kind === 'splitter') return cur;
    for (const s of spans) if (s.fromNodeId === cur) queue.push(s.toNodeId);
  }
  return null;
}

/** The physical NAP a terminal-port node belongs to: an explicit `napId` attribute, else the "NAP X-n" prefix of its label, else itself. */
export function napGroupOf(node: TopologyNode): string {
  const attr = node.attributes?.napId;
  if (typeof attr === 'string') return attr;
  const m = /^(NAP\s+[A-Z]-?\d*)/i.exec(node.label);
  return m ? m[1].replace(/\s+/g, '-').toLowerCase() : node.id;
}

function hubLetter(node: TopologyNode): string | null {
  const m = /FDH\s+([A-Z])/i.exec(node.label);
  return m ? m[1].toUpperCase() : null;
}

export function layoutScene(nodes: TopologyNode[], spans: FiberSpan[], hosts: HostConfig[]): SceneLayout {
  const nodeMap = byId(nodes);
  const splitters = nodes.filter((n) => n.kind === 'splitter');
  const hubIds = splitters.length > 0 ? splitters.map((s) => s.id) : ['__nohub'];

  // ONT -> hub, premise <-> ONT.
  const ontToHub = new Map<string, string>();
  for (const n of nodes) {
    if (n.kind !== 'ont') continue;
    ontToHub.set(n.id, upstreamSplitter(spans, nodeMap, n.id) ?? hubIds[0]);
  }
  const ontToPremise = new Map<string, string>();
  for (const h of hosts) if (h.attachedOntNodeId) ontToPremise.set(h.attachedOntNodeId, h.premiseNodeId);
  const premises = nodes.filter((n) => n.kind === 'customer-premise');
  const unassignedPremises = premises.filter((p) => ![...ontToPremise.values()].includes(p.id));
  for (const n of nodes) {
    if (n.kind === 'ont' && !ontToPremise.has(n.id)) {
      const p = unassignedPremises.shift();
      if (p) ontToPremise.set(n.id, p.id);
    }
  }

  // Terminals -> hub via their upstream splitter; pedestal groups.
  const termToHub = new Map<string, string>();
  for (const n of nodes) {
    if (n.kind !== 'terminal' && n.kind !== 'fat') continue;
    termToHub.set(n.id, upstreamSplitter(spans, nodeMap, n.id) ?? hubIds[0]);
  }

  // Closures -> hub via the first splitter downstream.
  const closureToHub = new Map<string, string>();
  for (const n of nodes) {
    if (n.kind !== 'splice-closure') continue;
    closureToHub.set(n.id, downstreamSplitter(spans, nodeMap, n.id) ?? hubIds[0]);
  }

  // FDH cabinets -> splitter (cabinetNodeId attr, else letter match, else order).
  const cabinetOfSplitter = new Map<string, string>();
  const fdhs = nodes.filter((n) => n.kind === 'fdh');
  for (const s of splitters) {
    const explicit = fdhs.find((f) => s.attributes?.cabinetNodeId === f.id);
    const letter = hubLetter(s);
    const byLetter = fdhs.find((f) => hubLetter(f) === letter && letter !== null);
    const cab = explicit ?? byLetter ?? fdhs[splitters.indexOf(s)];
    if (cab) cabinetOfSplitter.set(s.id, cab.id);
  }

  const placements: Placement[] = [];
  const lots: Lot[] = [];
  const pedestals: SceneLayout['pedestals'] = [];
  const anchorOf = new Map<string, Vec3>();

  const place = (p: Placement) => {
    placements.push(p);
    anchorOf.set(p.nodeId, p.anchor);
  };

  // POP / OLT.
  const olt = nodes.find((n) => n.kind === 'olt');
  const pop = nodes.find((n) => n.kind === 'pop');
  if (pop) place({ nodeId: pop.id, node: pop, kind: 'pop', position: POP_POS, rotationY: 0, anchor: { x: POP_POS.x, y: 0.2, z: POP_POS.z } });
  if (olt) place({ nodeId: olt.id, node: olt, kind: 'pop', position: POP_POS, rotationY: 0, anchor: { x: POP_POS.x + 3, y: 0.3, z: POP_POS.z + 1 } });

  let x = 0;
  for (const hubId of hubIds) {
    const hubOnts = [...ontToHub.entries()].filter(([, h]) => h === hubId).map(([id]) => id);
    const houseCount = Math.max(hubOnts.length, 1);
    const x0 = x;
    const closures = [...closureToHub.entries()].filter(([, h]) => h === hubId).map(([id]) => id);
    let cx = x0 + 6;
    for (const cid of closures) {
      const node = nodeMap.get(cid)!;
      const pos = { x: cx, y: 0, z: TRENCH_Z };
      place({ nodeId: cid, node, kind: 'handhole', position: pos, rotationY: 0, anchor: { x: cx, y: -0.9, z: TRENCH_Z } });
      cx += 5;
    }
    const fdhX = cx + 4;
    const splitter = nodeMap.get(hubId);
    if (splitter) {
      const cabId = cabinetOfSplitter.get(hubId);
      const cabNode = cabId ? nodeMap.get(cabId) : undefined;
      const pos = { x: fdhX, y: 0, z: TRENCH_Z + 0.4 };
      if (cabNode) place({ nodeId: cabNode.id, node: cabNode, kind: 'fdh', position: pos, rotationY: 0, anchor: { x: fdhX, y: 0.1, z: pos.z } });
      place({ nodeId: hubId, node: splitter, kind: 'splitter', position: { x: fdhX, y: 0.8, z: pos.z }, rotationY: 0, parentNodeId: cabNode?.id, anchor: { x: fdhX, y: 0.1, z: pos.z } });
      if (!cabNode) place({ nodeId: `${hubId}__cabinet`, node: { id: `${hubId}__cabinet`, kind: 'fdh', label: splitter.label.replace(/Splitter.*$/i, 'cabinet') }, kind: 'fdh', position: pos, rotationY: 0, anchor: { x: fdhX, y: 0.1, z: pos.z } });
    }

    // Houses for this hub.
    const firstHouseX = fdhX + 14;
    hubOnts.forEach((ontId, i) => {
      const hx = firstHouseX + i * LOT_W;
      const ontNode = nodeMap.get(ontId)!;
      const premId = ontToPremise.get(ontId);
      const premNode = premId ? nodeMap.get(premId) : undefined;
      const houseNode: TopologyNode = premNode ?? { id: `${ontId}__house`, kind: 'customer-premise', label: ontNode.label.replace(/^ONT\s*[—-]\s*/, '') };
      place({ nodeId: houseNode.id, node: houseNode, kind: 'house', position: { x: hx, y: 0, z: HOUSE_Z }, rotationY: 0, parentNodeId: ontId, anchor: { x: hx, y: 0, z: HOUSE_Z } });
      lots.push({ houseNodeId: houseNode.id, x: hx, width: LOT_W });
      const wallX = hx - HOUSE_W / 2;
      const nidPos = { x: wallX - 0.08, y: 1.35, z: HOUSE_Z - 1.2 };
      place({ nodeId: `${ontId}__nid`, node: { id: `${ontId}__nid`, kind: 'terminal', label: `NID — ${houseNode.label}` }, kind: 'nid', position: nidPos, rotationY: -Math.PI / 2, parentNodeId: houseNode.id, anchor: { x: nidPos.x - 0.05, y: 1.1, z: nidPos.z } });
      const ontPos = { x: wallX + 0.12, y: 1.25, z: HOUSE_Z - 0.2 };
      place({ nodeId: ontId, node: ontNode, kind: 'ont', position: ontPos, rotationY: Math.PI / 2, parentNodeId: houseNode.id, anchor: { x: ontPos.x, y: 1.1, z: ontPos.z } });
    });

    // Pedestals: one per NAP group, in the parkway in front of its houses.
    const hubTerms = [...termToHub.entries()].filter(([, h]) => h === hubId).map(([id]) => nodeMap.get(id)!);
    const groups = new Map<string, TopologyNode[]>();
    for (const t of hubTerms) {
      const g = napGroupOf(t);
      groups.set(g, [...(groups.get(g) ?? []), t]);
    }
    let gi = 0;
    for (const [groupId, terms] of groups) {
      // Put the pedestal in front of the houses its drops serve.
      const servedHouseXs = terms
        .map((t) => spans.find((s) => s.fromNodeId === t.id))
        .map((drop) => (drop ? placements.find((p) => p.kind === 'house' && p.parentNodeId === drop.toNodeId)?.position.x : undefined))
        .filter((v): v is number => v !== undefined);
      const px = servedHouseXs.length > 0 ? servedHouseXs.reduce((a, b) => a + b, 0) / servedHouseXs.length - 4 : firstHouseX + gi * LOT_W - 4;
      const pos = { x: px, y: 0, z: TRENCH_Z - 0.6 };
      pedestals.push({ groupId, position: pos, portNodeIds: terms.map((t) => t.id), label: terms[0].label.replace(/,\s*port to.*$/i, '') });
      terms.forEach((t, k) => place({ nodeId: t.id, node: t, kind: 'pedestal', position: pos, rotationY: 0, groupId, portNo: typeof t.attributes?.portNo === 'number' ? (t.attributes.portNo as number) : k + 1, anchor: { x: px, y: -0.2, z: pos.z } }));
      gi++;
    }

    x = firstHouseX + houseCount * LOT_W + 4;
  }

  // Anything optical we have not placed yet (odd kinds) goes in a row past the last lot.
  let spareX = x + 6;
  for (const n of nodes) {
    if (anchorOf.has(n.id) || n.kind === 'customer-premise') continue;
    if (n.kind === 'yard') {
      const pos = { x: x + 18, y: 0, z: -18 };
      place({ nodeId: n.id, node: n, kind: 'yard', position: pos, rotationY: 0, anchor: pos });
      continue;
    }
    const kind: PlacementKind = n.kind === 'network-device' ? 'device' : n.kind === 'splice-closure' ? 'handhole' : 'pedestal';
    const pos = { x: spareX, y: 0, z: TRENCH_Z };
    place({ nodeId: n.id, node: n, kind, position: pos, rotationY: 0, anchor: { x: spareX, y: -0.2, z: TRENCH_Z } });
    spareX += 5;
  }

  const routes: CableRoute[] = spans.map((span) => buildRoute(span, nodeMap, anchorOf, placements));
  const xs = placements.map((p) => p.position.x);
  const street = { xMin: Math.min(POP_POS.x - 16, ...xs) - 10, xMax: Math.max(...xs, x) + 30 };
  return { placements, routes, lots, street, pedestals };
}

function routeKind(span: FiberSpan, nodes: Map<string, TopologyNode>): RouteKind {
  const from = nodes.get(span.fromNodeId)?.kind as NodeKind | undefined;
  const to = nodes.get(span.toNodeId)?.kind as NodeKind | undefined;
  if (to === 'ont') return 'drop';
  if (from === 'olt' || to === 'splitter' || from === 'splice-closure') return 'feeder';
  return 'distribution';
}

function buildRoute(span: FiberSpan, nodes: Map<string, TopologyNode>, anchorOf: Map<string, Vec3>, placements: Placement[]): CableRoute {
  const a = anchorOf.get(span.fromNodeId) ?? { x: 0, y: 0, z: TRENCH_Z };
  const b = anchorOf.get(span.toNodeId) ?? { x: 0, y: 0, z: TRENCH_Z };
  const kind = routeKind(span, nodes);
  const points: Vec3[] = [a];
  const push = (p: Vec3) => {
    const last = points[points.length - 1];
    if (Math.abs(last.x - p.x) > 1e-6 || Math.abs(last.y - p.y) > 1e-6 || Math.abs(last.z - p.z) > 1e-6) points.push(p);
  };
  push({ x: a.x, y: TRENCH_Y, z: a.z });
  push({ x: a.x, y: TRENCH_Y, z: TRENCH_Z });
  if (kind === 'drop') {
    const nid = placements.find((p) => p.kind === 'nid' && p.parentNodeId === placements.find((h) => h.kind === 'house' && h.parentNodeId === span.toNodeId)?.nodeId);
    const sideYardX = nid ? nid.position.x - 0.6 : b.x;
    push({ x: sideYardX, y: TRENCH_Y, z: TRENCH_Z });
    if (nid) {
      push({ x: sideYardX, y: TRENCH_Y, z: nid.position.z });
      push({ x: sideYardX, y: nid.anchor.y, z: nid.position.z });
      push(nid.anchor);
      push({ x: b.x, y: b.y, z: nid.position.z });
    }
    push(b);
  } else {
    push({ x: b.x, y: TRENCH_Y, z: TRENCH_Z });
    push({ x: b.x, y: TRENCH_Y, z: b.z });
    push(b);
  }
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z));
  }
  return { spanId: span.id, span, kind, points, cumulative };
}

/** The scene point a distance (metres along the real span, from its `fromNodeId` end) maps to, scaled proportionally onto the drawn route. */
export function pointAlongRoute(route: CableRoute, positionMeters: number): Vec3 {
  const total = route.cumulative[route.cumulative.length - 1];
  const t = Math.max(0, Math.min(1, positionMeters / Math.max(1, route.span.lengthMeters))) * total;
  for (let i = 1; i < route.points.length; i++) {
    if (t <= route.cumulative[i]) {
      const seg = route.cumulative[i] - route.cumulative[i - 1];
      const f = seg > 0 ? (t - route.cumulative[i - 1]) / seg : 0;
      const p = route.points[i - 1];
      const q = route.points[i];
      return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, z: p.z + (q.z - p.z) * f };
    }
  }
  return route.points[route.points.length - 1];
}
