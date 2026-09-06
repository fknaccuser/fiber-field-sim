import { describe, expect, it } from 'vitest';
import { inspect, NotAConnectorError } from './inspectionScope';
import { createEmptyWorld } from '../../world';
import type { ActiveProfileSet } from '../../world';

const activeProfiles: ActiveProfileSet = {
  network: 'xgs-pon-default',
  oltVendor: 'olt-calix-e7-2',
  switchVendor: 'switch-cisco-ios',
  equipment: 'hexatronic-commscope-default',
  otdrInstrument: 'otdr-exfo-maxtester-730c',
  region: 'ca-south-oc-digalert',
};

describe('inspectionScope.inspect', () => {
  it('fails a dirty connector', () => {
    const world = createEmptyWorld(1, activeProfiles);
    world.topology.nodes.push({ id: 'a', kind: 'terminal', label: 'A' }, { id: 'b', kind: 'terminal', label: 'B' });
    world.topology.spans.push({
      id: 'span',
      fromNodeId: 'a',
      toNodeId: 'b',
      lengthMeters: 100,
      events: [{ id: 'dirty', kind: 'connector-dirty', positionMeters: 0, lossDb: 1.5, reflectanceDb: -20 }],
    });
    const result = inspect(world, 'span', 'dirty');
    expect(result.grade).toBe('fail');
    expect(result.zones.core).toBeGreaterThanOrEqual(1);
  });

  it('passes a clean APC connector', () => {
    const world = createEmptyWorld(2, activeProfiles);
    world.topology.nodes.push({ id: 'a', kind: 'terminal', label: 'A' }, { id: 'b', kind: 'terminal', label: 'B' });
    world.topology.spans.push({
      id: 'span',
      fromNodeId: 'a',
      toNodeId: 'b',
      lengthMeters: 100,
      events: [{ id: 'clean', kind: 'connector-apc', positionMeters: 0, lossDb: 0.25, reflectanceDb: -60 }],
    });
    const result = inspect(world, 'span', 'clean');
    expect(result.grade).toBe('pass');
    expect(result.zones.core).toBe(0);
  });

  it('throws NotAConnectorError for a non-connector event', () => {
    const world = createEmptyWorld(3, activeProfiles);
    world.topology.nodes.push({ id: 'a', kind: 'terminal', label: 'A' }, { id: 'b', kind: 'terminal', label: 'B' });
    world.topology.spans.push({
      id: 'span',
      fromNodeId: 'a',
      toNodeId: 'b',
      lengthMeters: 100,
      events: [{ id: 'splice', kind: 'fusion-splice', positionMeters: 0, lossDb: 0.05 }],
    });
    expect(() => inspect(world, 'span', 'splice')).toThrow(NotAConnectorError);
  });
});
