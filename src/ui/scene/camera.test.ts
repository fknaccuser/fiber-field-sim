import { describe, expect, it } from 'vitest';
import { getScenario, instantiateScenario } from '../../scenarios';
import { layoutScene } from './sceneLayout';
import { availableModes, EYE_HEIGHT, fieldPose, frame, overviewPose, poseFor, tracePose } from './camera';

function layoutFor(id: string, seed = 1) {
  const def = getScenario(id, seed);
  const { world } = instantiateScenario(def, seed);
  return layoutScene(world.topology.nodes, world.topology.spans, world.hosts);
}

describe('camera framing', () => {
  const layout = layoutFor('t1-dark-ont-vista-court');
  const nid = layout.placements.find((p) => p.kind === 'nid')!;
  const fdh = layout.placements.find((p) => p.kind === 'fdh')!;

  it('field view puts the camera at technician eye height', () => {
    expect(fieldPose(layout, null).position.y).toBe(EYE_HEIGHT);
    expect(fieldPose(layout, fdh).position.y).toBe(EYE_HEIGHT);
  });

  it('equipment view sits close to the object and looks at it', () => {
    const pose = frame(fdh, 'equipment');
    const dist = Math.hypot(pose.position.x - fdh.position.x, pose.position.z - fdh.position.z);
    expect(dist).toBeLessThan(4);
    expect(pose.target.x).toBe(fdh.position.x);
  });

  it('cutaway pulls in tighter than equipment view', () => {
    const eq = frame(nid, 'equipment');
    const cut = frame(nid, 'cutaway');
    const d = (p: { position: { x: number; z: number } }) => Math.hypot(p.position.x - nid.position.x, p.position.z - nid.position.z);
    expect(d(cut)).toBeLessThan(d(eq));
  });

  it('a wall-mounted NID is approached from the side the cover opens, not through the house', () => {
    const pose = frame(nid, 'equipment');
    expect(pose.position.x).toBeLessThan(nid.position.x);
  });

  it('overview frames the whole street from above', () => {
    const pose = overviewPose(layout);
    expect(pose.position.y).toBeGreaterThan(20);
    expect(pose.target.x).toBeGreaterThan(layout.street.xMin);
    expect(pose.target.x).toBeLessThan(layout.street.xMax);
  });

  it('trace view frames only the traced spans, and falls back to overview with none', () => {
    const drop = layout.routes.find((r) => r.kind === 'drop')!;
    const pose = tracePose(layout, [drop.spanId]);
    const xs = drop.points.map((p) => p.x);
    expect(pose.target.x).toBeGreaterThanOrEqual(Math.min(...xs) - 1);
    expect(pose.target.x).toBeLessThanOrEqual(Math.max(...xs) + 1);
    expect(tracePose(layout, [])).toEqual(overviewPose(layout));
  });

  it('offers cutaway only for openable equipment, and trace only with a shot', () => {
    expect(availableModes(null, false)).toEqual(['field', 'overview']);
    expect(availableModes(nid, false)).toContain('cutaway');
    expect(availableModes(nid, true)).toContain('trace');
    const house = layout.placements.find((p) => p.kind === 'house')!;
    expect(availableModes(house, false)).not.toContain('cutaway');
  });

  it('poseFor never returns NaN for any mode on any scenario', () => {
    for (const id of ['t1-dark-ont-vista-court', 't4-wrong-roll-closure-7', 't4-gen-plant-large']) {
      const l = layoutFor(id);
      for (const focus of [null, l.placements[0], l.placements[l.placements.length - 1]]) {
        for (const mode of ['field', 'equipment', 'cutaway', 'overview', 'trace'] as const) {
          const pose = poseFor(mode, l, focus, l.routes.slice(0, 2).map((r) => r.spanId));
          for (const v of [pose.position.x, pose.position.y, pose.position.z, pose.target.x, pose.target.y, pose.target.z]) {
            expect(Number.isFinite(v)).toBe(true);
          }
        }
      }
    }
  });
});
