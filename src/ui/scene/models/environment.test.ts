import { describe, expect, it } from 'vitest';
import { turfPatches } from './environment';

/** Total area of the returned rectangles. */
function area(rects: Array<[number, number, number, number]>): number {
  return rects.reduce((sum, [, , w, d]) => sum + w * d, 0);
}

function covers(rects: Array<[number, number, number, number]>, x: number, z: number): boolean {
  return rects.some(([cx, cz, w, d]) => Math.abs(x - cx) < w / 2 - 1e-9 && Math.abs(z - cz) < d / 2 - 1e-9);
}

describe('turfPatches', () => {
  it('returns the whole strip when there are no handholes', () => {
    const rects = turfPatches(0, 100, 6, 10, []);
    expect(rects).toHaveLength(1);
    expect(area(rects)).toBeCloseTo(400);
  });

  it('cuts a hole out of the strip without covering it', () => {
    const hole = { x: 50, halfW: 0.8, z: 8, halfD: 0.5 };
    const rects = turfPatches(0, 100, 6, 10, [hole]);
    expect(covers(rects, 50, 8)).toBe(false);
    // Everything else is still turf, including right beside and in front of the opening.
    expect(covers(rects, 20, 8)).toBe(true);
    expect(covers(rects, 80, 8)).toBe(true);
    expect(covers(rects, 50, 6.5)).toBe(true);
    expect(covers(rects, 50, 9.5)).toBe(true);
    expect(area(rects)).toBeCloseTo(400 - 1.6 * 1.0);
  });

  it('handles several handholes, including adjacent ones', () => {
    const holes = [
      { x: 10, halfW: 0.8, z: 8, halfD: 0.5 },
      { x: 60, halfW: 0.8, z: 8, halfD: 0.5 },
    ];
    const rects = turfPatches(0, 100, 6, 10, holes);
    for (const h of holes) expect(covers(rects, h.x, h.z)).toBe(false);
    expect(area(rects)).toBeCloseTo(400 - 2 * 1.6);
  });

  it('never emits a zero- or negative-sized patch', () => {
    const rects = turfPatches(0, 10, 6, 10, [{ x: 0, halfW: 0.8, z: 8, halfD: 2 }]);
    for (const [, , w, d] of rects) {
      expect(w).toBeGreaterThan(0);
      expect(d).toBeGreaterThan(0);
    }
  });
});
