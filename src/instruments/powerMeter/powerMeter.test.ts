import { describe, expect, it } from 'vitest';
import { read } from './powerMeter';
import { applyFault, createEmptyWorld } from '../../world';
import type { ActiveProfileSet, WorldState } from '../../world';
import { loadDefaultProfileSet } from '../../profiles';

const { network } = loadDefaultProfileSet();
const activeProfiles: ActiveProfileSet = {
  network: 'xgs-pon-default',
  oltVendor: 'olt-calix-e7-2',
  switchVendor: 'switch-cisco-ios',
  equipment: 'hexatronic-commscope-default',
  otdrInstrument: 'otdr-exfo-maxtester-730c',
  region: 'ca-south-oc-digalert',
};

function ontBehindSplitterWorld(seed: number): WorldState {
  const world = createEmptyWorld(seed, activeProfiles);
  world.topology.nodes.push(
    { id: 'olt', kind: 'olt', label: 'OLT' },
    { id: 'spl', kind: 'splitter', label: 'Splitter', attributes: { splitRatio: '1x32' } },
    { id: 'ont', kind: 'ont', label: 'ONT' },
  );
  world.topology.spans.push(
    { id: 'feeder', fromNodeId: 'olt', toNodeId: 'spl', lengthMeters: 2000, events: [{ id: 'c1', kind: 'connector-upc', positionMeters: 0, lossDb: 0.3, reflectanceDb: -50 }] },
    { id: 'drop', fromNodeId: 'spl', toNodeId: 'ont', lengthMeters: 20, events: [{ id: 'c2', kind: 'connector-upc', positionMeters: 0, lossDb: 0.3, reflectanceDb: -50 }] },
  );
  return world;
}

describe('power meter', () => {
  it('reads OLT Tx power minus fiber + splitter + connector losses', () => {
    const world = ontBehindSplitterWorld(1);
    const reading = read(world, network, 'ont', 1577);
    const expected = network.oltTxPowerDbm - (0.42 + 17.5 + 0.6);
    expect(reading.dbm).not.toBeNull();
    expect(Math.abs(reading.dbm! - expected)).toBeLessThan(0.3);
  });

  it('reads null when a break sits upstream', () => {
    const world = ontBehindSplitterWorld(2);
    world.topology.spans[0].events.push({ id: 'brk', kind: 'fiber-break', positionMeters: 500, lossDb: 60 });
    const reading = read(world, network, 'ont', 1577);
    expect(reading.dbm).toBeNull();
  });

  it("a fat-power-out-of-spec fault's override takes priority over the computed value", () => {
    let world = ontBehindSplitterWorld(3);
    world.topology.nodes.push({ id: 'fat-1', kind: 'fat', label: 'FAT' });
    world = applyFault(world, {
      instanceId: 'f1',
      kind: 'fat-power-out-of-spec',
      target: { type: 'site', nodeId: 'fat-1' },
      params: { measuredDbm: -3, direction: 'high' },
    });
    const reading = read(world, network, 'fat-1', 1577);
    expect(reading.dbm).toBe(-3);
  });
});
