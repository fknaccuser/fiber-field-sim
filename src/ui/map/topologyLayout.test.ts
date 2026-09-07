import { describe, expect, it } from 'vitest';
import { getScenario, instantiateScenario } from '../../scenarios';
import type { FiberSpan, TopologyNode } from '../../world';
import { layoutTopology } from './topologyLayout';

const node = (id: string, kind: TopologyNode['kind'] = 'terminal'): TopologyNode => ({ id, kind, label: id });
const span = (id: string, from: string, to: string): FiberSpan => ({ id, fromNodeId: from, toNodeId: to, lengthMeters: 100, events: [] });

describe('layoutTopology', () => {
  it('centers a parent over its children and steps depth along z', () => {
    const layout = layoutTopology([node('olt', 'olt'), node('fdh', 'fdh'), node('a'), node('b'), node('c')], [span('s1', 'olt', 'fdh'), span('s2', 'fdh', 'a'), span('s3', 'fdh', 'b'), span('s4', 'fdh', 'c')]);
    const at = (id: string) => layout.nodes.find((n) => n.id === id)!;
    expect(at('olt').depth).toBe(0);
    expect(at('fdh').depth).toBe(1);
    expect(at('a').depth).toBe(2);
    expect(at('fdh').x).toBeCloseTo((at('a').x + at('c').x) / 2);
    expect(at('olt').x).toBeCloseTo(at('fdh').x);
    expect(at('a').z).toBeGreaterThan(at('fdh').z);
    expect(new Set(layout.nodes.map((n) => `${n.x},${n.z}`)).size).toBe(layout.nodes.length);
  });

  it('parks nodes with no spans (yard, POP) on their own row behind the roots', () => {
    const layout = layoutTopology([node('yard', 'yard'), node('olt', 'olt'), node('ont', 'ont')], [span('s1', 'olt', 'ont')]);
    const yard = layout.nodes.find((n) => n.id === 'yard')!;
    expect(yard.depth).toBe(-1);
    expect(yard.z).toBeLessThan(layout.nodes.find((n) => n.id === 'olt')!.z);
  });

  it('places every node of every reference scenario exactly once and keeps all spans', () => {
    for (const id of ['t1-dark-ont-vista-court', 't4-wrong-roll-closure-7', 't5-everyones-down-nothings-broken']) {
      const { world } = instantiateScenario(getScenario(id), 1);
      const layout = layoutTopology(world.topology.nodes, world.topology.spans);
      expect(layout.nodes.map((n) => n.id).sort()).toEqual(world.topology.nodes.map((n) => n.id).sort());
      expect(layout.spans).toHaveLength(world.topology.spans.length);
      for (const s of layout.spans) {
        const from = layout.nodes.find((n) => n.id === s.fromNodeId)!;
        const to = layout.nodes.find((n) => n.id === s.toNodeId)!;
        expect(to.depth).toBeGreaterThanOrEqual(from.depth);
      }
      expect(layoutTopology(world.topology.nodes, world.topology.spans)).toEqual(layout);
    }
  });

  it('survives a cycle without looping forever', () => {
    const layout = layoutTopology([node('a'), node('b')], [span('s1', 'a', 'b'), span('s2', 'b', 'a')]);
    expect(layout.nodes).toHaveLength(2);
  });
});
