import { describe, expect, it } from 'vitest';
import { getScenario, instantiateScenario } from '../../scenarios';
import { layoutScene } from './sceneLayout';
import { poseFor } from './camera';
import { bearingOf, cardinalOf, formatBearing } from './compass';

function pose(position: [number, number, number], target: [number, number, number]) {
  return {
    position: { x: position[0], y: position[1], z: position[2] },
    target: { x: target[0], y: target[1], z: target[2] },
  };
}

describe('which way you are facing', () => {
  it('reads north where the world puts north', () => {
    // +z is across the street toward the houses; that is north.
    expect(bearingOf(pose([0, 1.7, 0], [0, 1.7, 10]))).toBeCloseTo(0, 6);
    expect(bearingOf(pose([0, 1.7, 0], [10, 1.7, 0]))).toBeCloseTo(90, 6);
    expect(bearingOf(pose([0, 1.7, 0], [0, 1.7, -10]))).toBeCloseTo(180, 6);
    expect(bearingOf(pose([0, 1.7, 0], [-10, 1.7, 0]))).toBeCloseTo(270, 6);
  });

  it('ignores height, so looking down at a handhole does not swing the needle', () => {
    const level = bearingOf(pose([0, 1.7, 0], [5, 1.7, 5]));
    const steep = bearingOf(pose([0, 3.0, 0], [5, -0.7, 5]));
    expect(steep).toBeCloseTo(level, 6);
  });

  it('does not spin on a straight-down view, where there is no heading to read', () => {
    expect(bearingOf(pose([4, 30, -2], [4, 0, -2]))).toBe(0);
  });

  it('always reports a bearing in range for every camera the app can produce', () => {
    const def = getScenario('t4-wrong-roll-closure-7');
    const { world } = instantiateScenario(def, 1);
    const layout = layoutScene(world.topology.nodes, world.topology.spans, world.hosts);
    const traced = world.topology.spans.slice(0, 2).map((s) => s.id);
    for (const mode of ['field', 'equipment', 'cutaway', 'overview', 'trace'] as const) {
      for (const focus of [null, ...layout.placements.slice(0, 6)]) {
        const b = bearingOf(poseFor(mode, layout, focus, traced));
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(360);
        expect(Number.isNaN(b)).toBe(false);
      }
    }
  });
});

describe('reading it out', () => {
  it('names the nearest point, wrapping past north correctly', () => {
    expect(cardinalOf(0)).toBe('N');
    expect(cardinalOf(44)).toBe('NE');
    expect(cardinalOf(90)).toBe('E');
    expect(cardinalOf(200)).toBe('S');
    expect(cardinalOf(350)).toBe('N');
    expect(cardinalOf(-10)).toBe('N');
  });

  it('reads out as three digits, the way it is called on the radio', () => {
    expect(formatBearing(7)).toBe('007°');
    expect(formatBearing(95.4)).toBe('095°');
    expect(formatBearing(271)).toBe('271°');
    expect(formatBearing(359.7)).toBe('000°');
  });
});
