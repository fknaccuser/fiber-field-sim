import { describe, expect, it } from 'vitest';
import { getScenario, instantiateScenario } from '../../scenarios';
import { layoutScene } from './layout';
import {
  fitFrame,
  formatMetres,
  frameFor,
  gridStep,
  isInside,
  planPoint,
  orientation,
  polylineMidpoint,
  rotatePoint,
  scaleBarMetres,
  sheetLabel,
  stackLabels,
  zoomIn,
  zoomOut,
  ZOOM_ORDER,
} from './sheet';

function scene(id = 't4-wrong-roll-closure-7') {
  const def = getScenario(id);
  const { world } = instantiateScenario(def, 1);
  return { world, layout: layoutScene(world.topology.nodes, world.topology.spans, world.hosts) };
}

describe('the sheet is the same ground as the world', () => {
  it('puts north up: the houses sit above the street on the page', () => {
    const { layout } = scene();
    const house = layout.placements.find((p) => p.kind === 'house');
    expect(house).toBeDefined();
    // World +z is across the street toward the premises; on paper that must be a smaller y.
    expect(planPoint(house!.position).y).toBeLessThan(planPoint({ x: 0, y: 0, z: 0 }).y);
  });

  it('carries world x through unchanged, so a distance on the sheet is a distance on the ground', () => {
    const a = planPoint({ x: -12, y: 3, z: 4 });
    const b = planPoint({ x: 8, y: 9, z: 4 });
    expect(b.x - a.x).toBe(20);
    expect(a.y).toBe(b.y);
  });
});

describe('framing', () => {
  it('always contains what the sheet is about', () => {
    const { layout } = scene();
    for (const p of layout.placements.slice(0, 12)) {
      expect(isInside(frameFor('site', layout, p.nodeId), planPoint(p.position))).toBe(true);
    }
  });

  it('the branch sheet contains every placement, including the POP the block sheet drops', () => {
    const { layout } = scene();
    const branch = frameFor('branch', layout, null);
    for (const p of layout.placements) expect(isInside(branch, planPoint(p.position))).toBe(true);

    const pop = layout.placements.find((p) => p.kind === 'pop');
    if (pop) expect(isInside(frameFor('neighbourhood', layout, null), planPoint(pop.position))).toBe(false);
  });

  it('each step out is a wider sheet than the one before it', () => {
    const { layout } = scene();
    const focus = layout.placements[0].nodeId;
    const areas = ZOOM_ORDER.map((z) => {
      const f = frameFor(z, layout, focus);
      return f.w * f.h;
    });
    for (let i = 1; i < areas.length; i++) expect(areas[i]).toBeGreaterThan(areas[i - 1]);
  });

  it('the branch sheet holds every metre of cable, not just the endpoints', () => {
    const { layout } = scene();
    const branch = frameFor('branch', layout, null);
    for (const route of layout.routes) for (const v of route.points) expect(isInside(branch, planPoint(v))).toBe(true);
  });
});

describe('fitting to the viewport', () => {
  it('only ever grows, so nothing framed can be cropped by the fit', () => {
    const frame = { x: -10, y: -10, w: 20, h: 20 };
    for (const aspect of [0.4, 0.8, 1, 1.6, 3]) {
      const fitted = fitFrame(frame, aspect);
      expect(fitted.w).toBeGreaterThanOrEqual(frame.w - 1e-9);
      expect(fitted.h).toBeGreaterThanOrEqual(frame.h - 1e-9);
      expect(fitted.w / fitted.h).toBeCloseTo(aspect, 6);
    }
  });

  it('keeps the centre, so fitting never slides the drawing off the subject', () => {
    const frame = { x: 4, y: -30, w: 12, h: 50 };
    const fitted = fitFrame(frame, 1.7);
    expect(fitted.x + fitted.w / 2).toBeCloseTo(frame.x + frame.w / 2, 6);
    expect(fitted.y + fitted.h / 2).toBeCloseTo(frame.y + frame.h / 2, 6);
  });

  it('survives a viewport that has not been measured yet', () => {
    const frame = { x: 0, y: 0, w: 20, h: 10 };
    expect(fitFrame(frame, 0).w).toBeGreaterThan(0);
    expect(fitFrame(frame, Number.NaN).h).toBeGreaterThan(0);
  });
});

describe('turning the sheet sideways', () => {
  const wide = { x: -200, y: -20, w: 400, h: 40 };

  it('turns a long street to run down a portrait page', () => {
    const o = orientation(wide, 375 / 800);
    expect(o.rotate).toBe(true);
    // The turned sheet is tall where the drawing was wide.
    expect(o.frame.w).toBe(wide.h);
    expect(o.frame.h).toBe(wide.w);
  });

  it('leaves a landscape page alone', () => {
    expect(orientation(wide, 1400 / 800).rotate).toBe(false);
  });

  it('leaves a roughly square drawing alone, which would only disorient the reader', () => {
    expect(orientation({ x: 0, y: 0, w: 100, h: 90 }, 375 / 800).rotate).toBe(false);
  });

  it('turns the drawing without losing any of it', () => {
    const { rotate, frame } = orientation(wide, 375 / 800);
    expect(rotate).toBe(true);
    for (const p of [
      { x: wide.x, y: wide.y },
      { x: wide.x + wide.w, y: wide.y },
      { x: wide.x, y: wide.y + wide.h },
      { x: wide.x + wide.w, y: wide.y + wide.h },
    ]) {
      expect(isInside(frame, rotatePoint(p), 1e-9)).toBe(true);
    }
  });
});

describe('drafting furniture', () => {
  it('scale bar is a round number that fits on the sheet', () => {
    for (const w of [12, 40, 130, 900, 4000]) {
      const bar = scaleBarMetres({ x: 0, y: 0, w, h: w });
      expect(bar).toBeLessThanOrEqual(w / 4 + 1e-9);
      expect(bar).toBeGreaterThan(0);
      expect(Number.isInteger(bar)).toBe(true);
    }
  });

  it('grid gets coarser as the sheet gets wider, never finer', () => {
    const steps = [30, 120, 600, 2400].map((w) => gridStep({ x: 0, y: 0, w, h: w }));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
  });

  it('hangs a cable label at the halfway point of the run, not the halfway point of the box', () => {
    // An L: the true midpoint by arc length is on the long leg, not at the corner.
    const mid = polylineMidpoint([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -10 },
      { x: 90, y: 0, z: -10 },
    ]);
    expect(mid.y).toBe(10);
    expect(mid.x).toBeCloseTo(40, 6);
  });

  it('letters every sheet with the designation, not the address', () => {
    const nap = 'NAP B-3, port to 301 Paseo Vista';
    // The site sheet used to print this in full, which is what made two symbols eleven
    // metres apart overprint into a smudge. The address lives in the footer card now.
    expect(sheetLabel(nap, 'site')).toBe('NAP B-3');
    expect(sheetLabel(nap, 'neighbourhood')).toBe('NAP B-3');
    expect(sheetLabel('Closure 7 — Antonio Pkwy @ Cow Camp', 'branch')).toBe('Closure 7');
    // A label with nothing to trim survives intact.
    expect(sheetLabel('FDH B Cabinet', 'branch')).toBe('FDH B Cabinet');
  });

  it('prints lengths the way the records print them', () => {
    expect(formatMetres(240)).toBe('240 m');
    expect(formatMetres(999)).toBe('999 m');
    expect(formatMetres(1840)).toBe('1.84 km');
  });
});

describe('paging between sheets', () => {
  it('stops at both ends instead of wrapping around', () => {
    expect(zoomIn('site')).toBeNull();
    expect(zoomOut('branch')).toBeNull();
    expect(zoomOut('site')).toBe('neighbourhood');
    expect(zoomIn('branch')).toBe('neighbourhood');
  });
});


describe('lettering that does not overprint', () => {
  it('leaves labels alone when nothing collides', () => {
    const input = [
      { key: 'a', x: 20, y: 20, text: 'FDH A' },
      { key: 'b', x: 200, y: 20, text: 'NAP A-1' },
      { key: 'c', x: 20, y: 200, text: 'CLOSURE A1' },
    ];
    expect(stackLabels(input)).toEqual(input);
  });

  it('pushes an overprinting label down a line', () => {
    // An ONT and the NID on the same wall land within a pixel of each other.
    const out = stackLabels([
      { key: 'ont', x: 100, y: 100, text: 'ONT' },
      { key: 'nid', x: 101, y: 101, text: 'NID' },
    ]);
    const ont = out.find((l) => l.key === 'ont')!;
    const nid = out.find((l) => l.key === 'nid')!;
    expect(ont.y).toBe(100);
    expect(nid.y).toBeGreaterThanOrEqual(ont.y + 10);
    // It moves down the page, never sideways: x is where the symbol is.
    expect(nid.x).toBe(101);
  });

  it('stacks a whole pile without any two sharing a line', () => {
    const out = stackLabels(
      Array.from({ length: 6 }, (_, i) => ({ key: `n${i}`, x: 50, y: 80 + i * 0.5, text: 'NAP A-1' })),
    );
    const ys = out.map((l) => l.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(10);
  });

  it('is deterministic: the same input always letters the same way', () => {
    const input = [
      { key: 'b', x: 100, y: 100, text: 'NID' },
      { key: 'a', x: 100, y: 100, text: 'ONT' },
    ];
    expect(stackLabels(input)).toEqual(stackLabels([...input].reverse()));
  });

  it('gives up rather than looping forever on a hopeless pile', () => {
    const out = stackLabels(Array.from({ length: 40 }, (_, i) => ({ key: `n${i}`, x: 0, y: 0, text: 'X' })));
    expect(out).toHaveLength(40);
    for (const label of out) expect(Number.isFinite(label.y)).toBe(true);
  });

  it('lets far-apart labels share a line', () => {
    const out = stackLabels([
      { key: 'a', x: 0, y: 50, text: 'FDH A' },
      { key: 'b', x: 400, y: 50, text: 'FDH B' },
    ]);
    expect(out.every((l) => l.y === 50)).toBe(true);
  });
});
