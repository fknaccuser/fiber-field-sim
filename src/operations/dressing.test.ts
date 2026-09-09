import { describe, expect, it } from 'vitest';
import { judgeTray, MIN_SLACK_MM } from './tray';
import {
  buildTrayGeometry,
  capturedAnchors,
  circumradius,
  measureRoute,
  minBendRadius,
  pathLength,
  pathsCross,
  resample,
  seatedHolder,
  smoothPath,
  type Vec2,
} from './dressing';

const GEOM = buildTrayGeometry(12, 30);

/** An arc of the given radius, as a laid route would trace it. */
function arc(radiusMm: number, centre: Vec2, fromDeg = 0, toDeg = 180, steps = 60): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
    out.push({ x: centre.x + Math.cos(a) * radiusMm, z: centre.z + Math.sin(a) * radiusMm });
  }
  return out;
}

describe('the tray a closure actually contains', () => {
  it('takes its minimum radius from the closure, not from a constant here', () => {
    expect(buildTrayGeometry(12, 30).minBendRadiusMm).toBe(30);
    expect(buildTrayGeometry(24, 40).minBendRadiusMm).toBe(40);
  });

  it('gives every holder the closure says it has, plus an entry, fingers and two limiters', () => {
    const g = buildTrayGeometry(24, 30);
    expect(g.anchors.filter((a) => a.kind === 'holder')).toHaveLength(24);
    expect(g.anchors.filter((a) => a.kind === 'entry')).toHaveLength(1);
    expect(g.anchors.filter((a) => a.kind === 'limiter')).toHaveLength(2);
    expect(g.anchors.filter((a) => a.kind === 'finger').length).toBeGreaterThanOrEqual(4);
  });

  it('keeps every anchor inside the tray it belongs to', () => {
    const g = buildTrayGeometry(12, 30);
    for (const a of g.anchors) {
      expect(a.at.x).toBeGreaterThanOrEqual(0);
      expect(a.at.x).toBeLessThanOrEqual(g.lengthMm);
      expect(Math.abs(a.at.z)).toBeLessThanOrEqual(g.widthMm / 2);
    }
  });
});

describe('measuring a path', () => {
  it('adds up its length', () => {
    expect(pathLength([{ x: 0, z: 0 }, { x: 30, z: 40 }])).toBeCloseTo(50);
  });

  it('resamples to even spacing regardless of how fast the finger moved', () => {
    // Dense at the start, one long jump at the end -- what a real drag looks like.
    const ragged: Vec2[] = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 100, z: 0 }];
    const even = resample(ragged, 4);
    for (let i = 1; i < even.length - 1; i++) {
      expect(Math.hypot(even[i].x - even[i - 1].x, even[i].z - even[i - 1].z)).toBeCloseTo(4, 4);
    }
    expect(pathLength(even)).toBeCloseTo(100, 0);
  });

  it('keeps both ends when it smooths, because both ends are held', () => {
    const path: Vec2[] = [{ x: 0, z: 0 }, { x: 10, z: 8 }, { x: 20, z: -8 }, { x: 30, z: 0 }];
    const smoothed = smoothPath(path);
    expect(smoothed[0]).toEqual(path[0]);
    expect(smoothed.at(-1)).toEqual(path.at(-1));
    expect(smoothed).toHaveLength(path.length);
  });
});

describe('bend radius', () => {
  it('reads infinity on a straight run rather than an infinitely tight bend', () => {
    expect(circumradius({ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 })).toBe(Infinity);
    const straight = resample([{ x: 0, z: 0 }, { x: 200, z: 0 }], 4);
    expect(minBendRadius(straight)).toBe(Infinity);
  });

  it('recovers the radius of an arc it is given', () => {
    expect(circumradius({ x: -10, z: 0 }, { x: 0, z: 10 }, { x: 10, z: 0 })).toBeCloseTo(10);
    // Within a few percent: the measurement spans a chord, which slightly over-reads.
    expect(minBendRadius(arc(40, { x: 60, z: 0 }))).toBeGreaterThan(36);
    expect(minBendRadius(arc(40, { x: 60, z: 0 }))).toBeLessThan(46);
  });

  it('tells a legal stored bend from an illegal one', () => {
    const roundTheLimiter = minBendRadius(arc(40, { x: 60, z: 0 }));
    const cutTheCorner = minBendRadius(arc(12, { x: 60, z: 0 }));
    expect(roundTheLimiter).toBeGreaterThan(30);
    expect(cutTheCorner).toBeLessThan(30);
  });

  it('does not read a finger tremor as a broken fibre', () => {
    // A straight run with sub-millimetre wobble on it. Ribbon is stiff; it does not do this.
    const jittery: Vec2[] = [];
    for (let i = 0; i <= 200; i++) jittery.push({ x: i, z: (i % 2 === 0 ? 0.4 : -0.4) });
    expect(minBendRadius(jittery)).toBeGreaterThan(30);
  });
});

describe('crossing', () => {
  it('sees two routes that cross', () => {
    expect(pathsCross([{ x: 0, z: 0 }, { x: 100, z: 0 }], [{ x: 50, z: -50 }, { x: 50, z: 50 }])).toBe(true);
  });

  it('does not call two parallel routes a crossing', () => {
    expect(pathsCross([{ x: 0, z: 0 }, { x: 100, z: 0 }], [{ x: 0, z: 20 }, { x: 100, z: 20 }])).toBe(false);
  });
});

describe('what the tray captured', () => {
  it('picks up features in the order the ribbon met them', () => {
    const entry = GEOM.anchors.find((a) => a.id === 'entry')!;
    const finger = GEOM.anchors.find((a) => a.id === 'finger-n1')!;
    const route = [entry.at, finger.at];
    const kinds = capturedAnchors(route, GEOM).map((a) => a.kind);
    expect(kinds[0]).toBe('entry');
    expect(kinds).toContain('finger');
  });

  it('reports each feature once however long the ribbon lingers by it', () => {
    const entry = GEOM.anchors.find((a) => a.id === 'entry')!;
    const dawdle = Array.from({ length: 40 }, (_, i) => ({ x: entry.at.x + (i % 3), z: entry.at.z }));
    expect(capturedAnchors(dawdle, GEOM).filter((a) => a.id === 'entry')).toHaveLength(1);
  });

  it('does not capture a feature the ribbon went nowhere near', () => {
    const acrossTheTop = [{ x: 0, z: -60 }, { x: 240, z: -60 }];
    expect(capturedAnchors(acrossTheTop, GEOM).some((a) => a.kind === 'holder')).toBe(false);
  });
});

describe('a dressed ribbon, measured', () => {
  const entry = GEOM.anchors.find((a) => a.id === 'entry')!.at;
  const f1 = GEOM.anchors.find((a) => a.id === 'finger-n1')!.at;
  const f2 = GEOM.anchors.find((a) => a.id === 'finger-n2')!.at;
  const holder6 = GEOM.anchors.find((a) => a.id === 'holder-6')!.at;

  it('reads a route that came in through the slot, under the fingers, into a holder', () => {
    const laid = resample([entry, f1, f2, holder6], 3);
    const m = measureRoute(laid, GEOM);
    expect(m.viaEntry).toBe(true);
    expect(m.retained).toBe(true);
    expect(m.fingersUsed).toBeGreaterThanOrEqual(2);
    expect(m.holder).toBe(6);
  });

  it('knows when the ribbon came over the wall instead of through the slot', () => {
    const overTheWall = resample([{ x: 120, z: -65 }, f2, holder6], 3);
    expect(measureRoute(overTheWall, GEOM).viaEntry).toBe(false);
  });

  it('knows when nothing is holding it down', () => {
    const straightAcross = resample([entry, holder6], 3);
    const m = measureRoute(straightAcross, GEOM);
    expect(m.retained).toBe(false);
    expect(m.holder).toBe(6);
  });

  it('reports a route that ends loose in the tray as seated in no holder', () => {
    const nowhere = resample([entry, f1, { x: 200, z: -55 }], 3);
    expect(measureRoute(nowhere, GEOM).holder).toBeNull();
  });

  /** A stored loop: laps round the limiters, each just inside the last so it lies flat. */
  function storedLoop(laps = 3, from = 54, to = 40): Vec2[] {
    const out: Vec2[] = [];
    const steps = 120 * laps;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * laps * 2 * Math.PI;
      const r = from - (i / steps) * (from - to);
      out.push({ x: 120 + Math.cos(a) * r, z: Math.sin(a) * r * 0.85 });
    }
    return out;
  }

  it('rewards stored slack with length, which is the trade the tray actually makes', () => {
    const short = measureRoute(resample([entry, holder6], 3), GEOM);
    const looped = measureRoute(resample([entry, ...storedLoop(), holder6], 3), GEOM);
    expect(looped.slackMm).toBeGreaterThan(short.slackMm * 3);
    // Three laps round the limiters is what MIN_SLACK_MM costs you, and it fits: the tray
    // is sized for exactly this, which is why storing real slack is a discipline and not an
    // impossibility.
    expect(looped.slackMm).toBeGreaterThan(MIN_SLACK_MM);
  });

  it('keeps a generously laid loop inside the radius limit', () => {
    // The loop on its own, which is the part the limiters shape.
    expect(minBendRadius(resample(storedLoop(), 3))).toBeGreaterThan(30);
    // Wound tight enough to fit more laps in and it is a defect, however neat it looks.
    expect(minBendRadius(resample(storedLoop(3, 26, 18), 3))).toBeLessThan(30);
  });

  it('catches a sharp corner where a run meets a loop', () => {
    // Running the ribbon straight down the tray and then turning into the loop without
    // easing into it is a real way to ruin a dressing, and it is invisible once the lid is
    // on. The route reads as legal everywhere except the one corner, which is the point.
    const cornered = resample([entry, ...storedLoop(), holder6], 3);
    expect(minBendRadius(cornered)).toBeLessThan(30);
  });

  it('seats the sleeve where the ribbon ends, not wherever it was last dragged past', () => {
    // Holders sit about 12 mm apart, closer than a finger can resolve. Running the length of
    // the centre rail and stopping at holder 6 is holder 6, not holder 12.
    const alongTheRail = resample([entry, f1, { x: holder6.x, z: holder6.z }], 2);
    expect(seatedHolder(alongTheRail, GEOM)).toBe(6);
    // Ending clear of the rail is no holder at all.
    expect(seatedHolder([{ x: 200, z: -55 }], GEOM)).toBeNull();
  });
});

/**
 * The target has to be reachable.
 *
 * A bench nobody can pass teaches nothing except that the bench is broken, and it is very
 * easy to build one by accident here: the tray has to hold MIN_SLACK_MM of ribbon in laps
 * that never go inside the radius limit, while still reaching the entry slot, at least two
 * retention fingers and a holder. Those constraints fight each other, and whether they can
 * all be satisfied at once is a property of the numbers in `buildTrayGeometry` -- not
 * something to find out from a trainee.
 */
describe('a tray you can actually dress well', () => {
  const geom = buildTrayGeometry(24, 30);

  /**
   * The dressing a splicer would describe: in through the slot, straight down the channel it
   * opens onto, round the limiters twice, and out into a holder. No S-bends, because the
   * tray is built so none are needed.
   */
  function idealRoute(): Vec2[] {
    const entry = geom.anchors.find((a) => a.kind === 'entry')!.at;
    const r = Math.abs(entry.z);
    const west = geom.anchors.find((a) => a.id === 'limiter-w')!.at.x;
    const east = geom.anchors.find((a) => a.id === 'limiter-e')!.at.x;
    const out: Vec2[] = [];
    const line = (from: Vec2, to: Vec2, steps = 40) => {
      for (let i = 1; i <= steps; i++) out.push({ x: from.x + ((to.x - from.x) * i) / steps, z: from.z + ((to.z - from.z) * i) / steps });
    };
    const sweep = (cx: number, fromDeg: number, toDeg: number, steps = 36) => {
      for (let i = 1; i <= steps; i++) {
        const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
        out.push({ x: cx + Math.cos(a) * r, z: Math.sin(a) * r });
      }
    };

    out.push(entry);
    line(entry, { x: west, z: -r });
    for (let lap = 0; lap < 2; lap++) {
      line({ x: west, z: -r }, { x: east, z: -r });
      sweep(east, -90, 90);
      line({ x: east, z: r }, { x: west, z: r });
      sweep(west, 90, 270);
    }
    // Off the channel and round into the rail: one arc, the same radius as the limiters.
    const exitX = (west + east) / 2;
    line({ x: west, z: -r }, { x: exitX, z: -r });
    sweep(exitX, -90, 0);
    return out;
  }

  it('can be dressed to pass, with slack, radius, retention and a seat all at once', () => {
    const m = measureRoute(idealRoute(), geom);
    expect(m.viaEntry).toBe(true);
    expect(m.retained).toBe(true);
    expect(m.holder).not.toBeNull();
    expect(m.slackMm).toBeGreaterThanOrEqual(MIN_SLACK_MM);
    expect(m.bendRadiusMm).toBeGreaterThanOrEqual(30);
  });

  it('and that dressing is accepted by the judge, not merely measured favourably', () => {
    const m = measureRoute(idealRoute(), geom);
    const verdict = judgeTray(
      {
        id: 'TRAY-1',
        holders: 24,
        placements: [{ tube: 'blue', fibre: 1, holder: m.holder, bendRadiusMm: m.bendRadiusMm, slackMm: m.slackMm, crossesOthers: false, viaEntry: m.viaEntry, retained: m.retained }],
      },
      true,
      30,
    );
    expect(verdict.issues).toEqual([]);
    expect(verdict.accepted).toBe(true);
  });

  it('stays inside the tray it is dressed in', () => {
    for (const p of idealRoute()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(geom.lengthMm);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(geom.widthMm / 2);
    }
  });
});
