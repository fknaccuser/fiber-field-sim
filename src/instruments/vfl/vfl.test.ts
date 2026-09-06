import { describe, expect, it } from 'vitest';
import { inspect } from './vfl';
import { createEmptyWorld } from '../../world';
import type { ActiveProfileSet } from '../../world';

const activeProfiles: ActiveProfileSet = {
  network: 'xgs-pon-default',
  oltVendor: 'olt-calix-e7-2',
  switchVendor: 'switch-cisco-ios',
  equipment: 'hexatronic-commscope-default',
  otdrInstrument: 'otdr-exfo-maxtester-730c',
  hostShell: 'host-windows',
  region: 'ca-south-oc-digalert',
};

describe('vfl.inspect', () => {
  it('reports a macrobend only when its 1550 nm loss is at least 0.3 dB', () => {
    const world = createEmptyWorld(1, activeProfiles);
    world.topology.nodes.push({ id: 'a', kind: 'terminal', label: 'A' }, { id: 'b', kind: 'terminal', label: 'B' });
    world.topology.spans.push({
      id: 'span',
      fromNodeId: 'a',
      toNodeId: 'b',
      lengthMeters: 500,
      events: [
        { id: 'weak', kind: 'macrobend', positionMeters: 100, lossDbByWavelength: { '1550': 0.1 } },
        { id: 'strong', kind: 'macrobend', positionMeters: 300, lossDbByWavelength: { '1550': 0.8 } },
      ],
    });
    const result = inspect(world, 'span', 'a');
    expect(result.leaks).toHaveLength(1);
    expect(result.leaks[0]).toEqual({ positionMeters: 300, kind: 'macrobend' });
  });

  it('measures position relative to whichever end the VFL is applied from', () => {
    const world = createEmptyWorld(2, activeProfiles);
    world.topology.nodes.push({ id: 'a', kind: 'terminal', label: 'A' }, { id: 'b', kind: 'terminal', label: 'B' });
    world.topology.spans.push({
      id: 'span',
      fromNodeId: 'a',
      toNodeId: 'b',
      lengthMeters: 500,
      events: [{ id: 'brk', kind: 'fiber-break', positionMeters: 100, lossDb: 60 }],
    });
    const fromA = inspect(world, 'span', 'a');
    const fromB = inspect(world, 'span', 'b');
    expect(fromA.leaks[0].positionMeters).toBe(100);
    expect(fromB.leaks[0].positionMeters).toBe(400);
  });

  it('ignores leak kinds outside its range', () => {
    const world = createEmptyWorld(3, activeProfiles);
    world.topology.nodes.push({ id: 'a', kind: 'terminal', label: 'A' }, { id: 'b', kind: 'terminal', label: 'B' });
    world.topology.spans.push({
      id: 'span',
      fromNodeId: 'a',
      toNodeId: 'b',
      lengthMeters: 6000,
      events: [{ id: 'far', kind: 'fiber-break', positionMeters: 5500, lossDb: 60 }],
    });
    const result = inspect(world, 'span', 'a');
    expect(result.leaks).toHaveLength(0);
  });
});
