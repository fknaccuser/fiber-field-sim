import { describe, expect, it } from 'vitest';
import { pathLossDb, resolveTestPath } from './opticalPath';
import { AmbiguousPathError, StrandRequiredError } from './errors';
import { createEmptyWorld } from '../../world';
import type { ActiveProfileSet, WorldState } from '../../world';
import { loadDefaultProfileSet } from '../../profiles';

const profiles = loadDefaultProfileSet();
const activeProfiles: ActiveProfileSet = {
  network: 'xgs-pon-default',
  oltVendor: 'olt-calix-e7-2',
  switchVendor: 'switch-cisco-ios',
  equipment: 'hexatronic-commscope-default',
  otdrInstrument: 'otdr-exfo-maxtester-730c',
  region: 'ca-south-oc-digalert',
};

describe('pathLossDb', () => {
  it('sums fiber attenuation, a connector, and one 1x32 splitter at 1577 nm (mapped to the 1550 key)', () => {
    const world = createEmptyWorld(1, activeProfiles);
    world.topology.nodes.push(
      { id: 'olt', kind: 'olt', label: 'OLT' },
      { id: 'spl', kind: 'splitter', label: 'Splitter', attributes: { splitRatio: '1x32' } },
      { id: 'term', kind: 'terminal', label: 'Terminal' },
    );
    world.topology.spans.push(
      {
        id: 'feeder',
        fromNodeId: 'olt',
        toNodeId: 'spl',
        lengthMeters: 2000,
        events: [{ id: 'conn', kind: 'connector-upc', positionMeters: 0, lossDb: 0.3, reflectanceDb: -50 }],
      },
      { id: 'leg', fromNodeId: 'spl', toNodeId: 'term', lengthMeters: 1, events: [] },
    );

    const result = pathLossDb(world, profiles.network, 'olt', 'term', 1577);
    expect(result.broken).toBe(false);
    expect(result.lossDb).toBeCloseTo(0.42 + 17.5 + 0.3, 1);
  });

  it('is broken when a fiber-break sits upstream of the target', () => {
    const world = createEmptyWorld(2, activeProfiles);
    world.topology.nodes.push({ id: 'olt', kind: 'olt', label: 'OLT' }, { id: 'term', kind: 'terminal', label: 'Terminal' });
    world.topology.spans.push({
      id: 'feeder',
      fromNodeId: 'olt',
      toNodeId: 'term',
      lengthMeters: 500,
      events: [{ id: 'break', kind: 'fiber-break', positionMeters: 100, lossDb: 60 }],
    });

    const result = pathLossDb(world, profiles.network, 'olt', 'term', 1577);
    expect(result.broken).toBe(true);
  });

  it('is broken when the target is unreachable at all', () => {
    const world = createEmptyWorld(3, activeProfiles);
    world.topology.nodes.push({ id: 'a', kind: 'olt', label: 'A' }, { id: 'b', kind: 'terminal', label: 'B' });
    const result = pathLossDb(world, profiles.network, 'a', 'b', 1577);
    expect(result.broken).toBe(true);
  });
});

describe('resolveTestPath', () => {
  function twoForkWorld(): WorldState {
    const world = createEmptyWorld(4, activeProfiles);
    world.topology.nodes.push(
      { id: 'access', kind: 'terminal', label: 'Access' },
      { id: 'fork', kind: 'splice-closure', label: 'Fork' }, // not a splitter, no spliceMap
      { id: 'legA', kind: 'terminal', label: 'Leg A' },
      { id: 'legB', kind: 'terminal', label: 'Leg B' },
    );
    world.topology.spans.push(
      { id: 'in', fromNodeId: 'access', toNodeId: 'fork', lengthMeters: 100, events: [] },
      { id: 'outA', fromNodeId: 'fork', toNodeId: 'legA', lengthMeters: 50, events: [] },
      { id: 'outB', fromNodeId: 'fork', toNodeId: 'legB', lengthMeters: 50, events: [] },
    );
    return world;
  }

  it('throws AmbiguousPathError at a non-splitter node with two continuing spans and no splice map', () => {
    const world = twoForkWorld();
    expect(() => resolveTestPath(world, profiles.network, { accessNodeId: 'access', launchSpanId: 'in' })).toThrow(AmbiguousPathError);
  });

  it('resolves cleanly once a spliceMap entry disambiguates the fork', () => {
    const world = twoForkWorld();
    const fork = world.topology.nodes.find((n) => n.id === 'fork')!;
    fork.attributes = { spliceMap: [{ fromSpanId: 'in', toSpanId: 'outA' }] };
    const path = resolveTestPath(world, profiles.network, { accessNodeId: 'access', launchSpanId: 'in' });
    expect(path.spanIds).toEqual(['in', 'outA']);
  });

  it('throws StrandRequiredError when launching into a stranded span without a strand', () => {
    const world = createEmptyWorld(5, activeProfiles);
    world.topology.nodes.push({ id: 'a', kind: 'terminal', label: 'A' }, { id: 'b', kind: 'terminal', label: 'B' });
    world.topology.spans.push({
      id: 'stranded',
      fromNodeId: 'a',
      toNodeId: 'b',
      lengthMeters: 100,
      events: [],
      strands: [{ tubeColor: 'blue', fiberColor: 'orange', role: 'distribution' }],
    });
    expect(() => resolveTestPath(world, profiles.network, { accessNodeId: 'a', launchSpanId: 'stranded' })).toThrow(StrandRequiredError);
    expect(() =>
      resolveTestPath(world, profiles.network, { accessNodeId: 'a', launchSpanId: 'stranded', strand: { tubeColor: 'blue', fiberColor: 'orange' } }),
    ).not.toThrow();
  });

  it('branches into every leaving span at a splitter (superposition) when arriving from upstream', () => {
    const world = createEmptyWorld(6, activeProfiles);
    world.topology.nodes.push(
      { id: 'olt', kind: 'olt', label: 'OLT' },
      { id: 'spl', kind: 'splitter', label: 'Splitter', attributes: { splitRatio: '1x4' } },
      { id: 'l1', kind: 'terminal', label: 'L1' },
      { id: 'l2', kind: 'terminal', label: 'L2' },
    );
    world.topology.spans.push(
      { id: 'feeder', fromNodeId: 'olt', toNodeId: 'spl', lengthMeters: 500, events: [] },
      { id: 'leg1', fromNodeId: 'spl', toNodeId: 'l1', lengthMeters: 500, events: [] },
      { id: 'leg2', fromNodeId: 'spl', toNodeId: 'l2', lengthMeters: 600, events: [] },
    );
    const path = resolveTestPath(world, profiles.network, { accessNodeId: 'olt', launchSpanId: 'feeder' });
    expect(path.root.children.length).toBe(2);
    expect(path.root.nodeStepAtEnd).toEqual({ nodeId: 'spl', kind: 'splitter-node', lossDb: 7.2 });
  });
});
