import { describe, expect, it } from 'vitest';
import { getScenario, instantiateScenario, listScenarios } from '../../scenarios';
import { layoutScene, napGroupOf, pointAlongRoute, TRENCH_Y } from './layout';

function layoutFor(id: string, seed = 1) {
  const def = getScenario(id, seed);
  const { world } = instantiateScenario(def, seed);
  return { world, layout: layoutScene(world.topology.nodes, world.topology.spans, world.hosts) };
}

describe('layoutScene', () => {
  it.each([...listScenarios().map((s) => s.id), 't3-gen-plant-medium', 't4-gen-plant-large', 't5-gen-network-small'])('%s: every optical node is placed exactly once and every span has a route', (id) => {
    const { world, layout } = layoutFor(id);
    for (const node of world.topology.nodes) {
      if (node.kind === 'customer-premise') continue;
      expect(layout.placements.filter((p) => p.nodeId === node.id), node.id).toHaveLength(1);
    }
    expect(layout.routes.map((r) => r.spanId).sort()).toEqual(world.topology.spans.map((s) => s.id).sort());
    for (const r of layout.routes) expect(r.points.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every ONT a house, a NID on the house wall, and the ONT indoors behind that wall', () => {
    const { world, layout } = layoutFor('t4-wrong-roll-closure-7');
    for (const ont of world.topology.nodes.filter((n) => n.kind === 'ont')) {
      const ontP = layout.placements.find((p) => p.nodeId === ont.id)!;
      const house = layout.placements.find((p) => p.kind === 'house' && p.nodeId === ontP.parentNodeId)!;
      const nid = layout.placements.find((p) => p.kind === 'nid' && p.parentNodeId === house.nodeId)!;
      expect(house).toBeDefined();
      expect(nid.position.x).toBeLessThan(house.position.x);
      expect(ontP.position.x).toBeGreaterThan(nid.position.x);
      expect(ontP.position.x).toBeLessThan(house.position.x);
    }
  });

  it('groups terminal ports of the same NAP onto one pedestal', () => {
    const { layout } = layoutFor('t4-wrong-roll-closure-7');
    const b3 = layout.pedestals.find((p) => p.portNodeIds.includes('term-b-301'))!;
    expect(b3.portNodeIds).toEqual(expect.arrayContaining(['term-b-301', 'term-b-305']));
    expect(napGroupOf({ id: 'x', kind: 'terminal', label: 'NAP B-3, port to 301 Paseo Vista' })).toBe('nap-b-3');
  });

  it('routes run underground along the parkway trench and drops climb to the NID before the ONT', () => {
    const { layout } = layoutFor('t1-dark-ont-vista-court');
    const drop = layout.routes.find((r) => r.kind === 'drop')!;
    expect(drop.points.some((p) => Math.abs(p.y - TRENCH_Y) < 1e-6)).toBe(true);
    const nid = layout.placements.find((p) => p.kind === 'nid')!;
    expect(drop.points.some((p) => Math.abs(p.x - nid.anchor.x) < 1e-6 && Math.abs(p.z - nid.anchor.z) < 1e-6)).toBe(true);
    const mid = pointAlongRoute(drop, drop.span.lengthMeters / 2);
    expect(Number.isFinite(mid.x)).toBe(true);
    expect(pointAlongRoute(drop, 0)).toEqual(drop.points[0]);
  });

  it('is deterministic', () => {
    const a = layoutFor('t3-gen-plant-medium', 5).layout;
    const b = layoutFor('t3-gen-plant-medium', 5).layout;
    expect(JSON.stringify(a.placements.map((p) => [p.nodeId, p.position]))).toBe(JSON.stringify(b.placements.map((p) => [p.nodeId, p.position])));
  });
});
