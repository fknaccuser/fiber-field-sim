import { describe, expect, it } from 'vitest';
import {
  distanceToPolyline,
  groundProjector,
  insideExtent,
  judgeLocate,
  MARK_TOLERANCE_M,
  pointToSegment,
  polylineLength,
  sampleAlong,
  signalAt,
  type LocateRequest,
  type Mark,
  type PlantRun,
} from './locate';

const EXTENT = { x: 0, y: 0, w: 100, h: 40 };

const REQUEST: LocateRequest = {
  ticketId: 'USA-482100',
  excavator: 'Vallejo Grading',
  workDescription: 'Trench for storm drain, 4 ft deep, across the parkway.',
  extent: EXTENT,
  digDate: new Date(2026, 4, 20),
  receivedAt: new Date(2026, 4, 14),
};

/** A straight main across the dig area, recorded where it actually is. */
function straightMain(): PlantRun {
  const line = [{ x: 0, y: 20 }, { x: 100, y: 20 }];
  return { id: 'main', label: 'Distribution main', kind: 'distribution', recorded: line, actual: line };
}

/** A lateral off the main that nobody remembers is there. */
function lateral(): PlantRun {
  const line = [{ x: 60, y: 20 }, { x: 60, y: 38 }];
  return { id: 'lat', label: 'Lateral to 214', kind: 'drop', recorded: line, actual: line };
}

function orange(points: Array<{ x: number; y: number }>, id = 'm1'): Mark {
  return { id, color: 'orange', points };
}

const ON_TIME = new Date(2026, 4, 16);

describe('geometry', () => {
  it('measures to the nearest point on a segment, not to its ends', () => {
    // Directly above the middle of a horizontal segment.
    expect(pointToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3);
    // Off the end: the answer is the distance to the endpoint, not to the infinite line.
    expect(pointToSegment({ x: 14, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(4);
  });

  it('handles a degenerate segment without dividing by zero', () => {
    expect(pointToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5);
  });

  it('measures to the nearest leg of a polyline', () => {
    const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(distanceToPolyline({ x: 12, y: 5 }, line)).toBeCloseTo(2);
    expect(distanceToPolyline({ x: 0, y: 0 }, [])).toBe(Infinity);
  });

  it('adds up a polyline', () => {
    expect(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 14 }])).toBeCloseTo(15);
  });

  it('samples at roughly the requested spacing and always keeps the last point', () => {
    const samples = sampleAlong([{ x: 0, y: 0 }, { x: 10, y: 0 }], 1);
    expect(samples.length).toBe(11);
    expect(samples.at(-1)).toEqual({ x: 10, y: 0 });
  });

  it('knows what is in the dig area', () => {
    expect(insideExtent({ x: 50, y: 20 }, EXTENT)).toBe(true);
    expect(insideExtent({ x: 50, y: 60 }, EXTENT)).toBe(false);
  });
});

describe('the locator', () => {
  it('peaks over the conductor and falls away either side', () => {
    const runs = [straightMain()];
    const over = signalAt({ x: 50, y: 20 }, runs);
    const beside = signalAt({ x: 50, y: 24 }, runs);
    const away = signalAt({ x: 50, y: 38 }, runs);
    expect(over).toBeCloseTo(1);
    expect(beside).toBeLessThan(over);
    expect(away).toBeLessThan(beside);
  });

  it('reads the nearest of several runs rather than summing them', () => {
    expect(signalAt({ x: 60, y: 30 }, [straightMain(), lateral()])).toBeCloseTo(1);
  });
});

describe('a locate that was done properly', () => {
  it('clears with no issues when everything in the area is marked where it is', () => {
    const runs = [straightMain(), lateral()];
    const marks = [orange([{ x: 0, y: 20 }, { x: 100, y: 20 }], 'm-main'), orange([{ x: 60, y: 20 }, { x: 60, y: 38 }], 'm-lat')];
    const verdict = judgeLocate(REQUEST, runs, marks, ON_TIME);
    expect(verdict.issues).toEqual([]);
    expect(verdict.accepted).toBe(true);
    expect(verdict.markedMeters).toBeCloseTo(verdict.plantMeters, 1);
  });

  it('tolerates a mark that wanders within tolerance of the cable', () => {
    const wobble = orange([{ x: 0, y: 20 }, { x: 50, y: 20 + MARK_TOLERANCE_M * 0.6 }, { x: 100, y: 20 }]);
    const verdict = judgeLocate(REQUEST, [straightMain()], [wobble], ON_TIME);
    expect(verdict.strikeRisks).toBe(0);
  });
});

describe('the ways a locate gets somebody cut', () => {
  it('flags a facility nobody swept for', () => {
    // The main is marked. The lateral was never found.
    const verdict = judgeLocate(REQUEST, [straightMain(), lateral()], [orange([{ x: 0, y: 20 }, { x: 100, y: 20 }])], ON_TIME);
    const missed = verdict.issues.find((i) => i.code === 'unmarked-facility');
    expect(missed?.where).toBe('Lateral to 214');
    expect(missed?.severity).toBe('strike-risk');
    expect(verdict.accepted).toBe(false);
  });

  it('names marking the print rather than the ground as its own failure', () => {
    // The records still show the old alignment; the cable was re-routed 12 m south.
    const rerouted: PlantRun = {
      id: 'main',
      label: 'Distribution main',
      kind: 'distribution',
      recorded: [{ x: 0, y: 8 }, { x: 100, y: 8 }],
      actual: [{ x: 0, y: 20 }, { x: 100, y: 20 }],
    };
    const tracedThePaper = orange([{ x: 0, y: 8 }, { x: 100, y: 8 }]);
    const verdict = judgeLocate(REQUEST, [rerouted], [tracedThePaper], ON_TIME);
    expect(verdict.issues.map((i) => i.code)).toContain('marked-the-record');
    // And it is not ALSO reported as a plain unmarked facility — one failure, one name.
    expect(verdict.issues.filter((i) => i.code === 'unmarked-facility')).toHaveLength(0);
  });

  it('flags paint with nothing under it', () => {
    const marks = [orange([{ x: 0, y: 20 }, { x: 100, y: 20 }], 'm-main'), orange([{ x: 0, y: 35 }, { x: 60, y: 35 }], 'm-invented')];
    const verdict = judgeLocate(REQUEST, [straightMain()], marks, ON_TIME);
    const stray = verdict.issues.find((i) => i.code === 'stray-mark');
    expect(stray?.where).toBe('m-invented');
    expect(stray?.severity).toBe('strike-risk');
  });

  it('does not call a short wobble a stray mark', () => {
    const verdict = judgeLocate(REQUEST, [straightMain()], [orange([{ x: 0, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 24 }])], ON_TIME);
    expect(verdict.issues.filter((i) => i.code === 'stray-mark')).toHaveLength(0);
  });

  it('rejects a ticket answered with no marks at all', () => {
    const verdict = judgeLocate(REQUEST, [straightMain()], [], ON_TIME);
    expect(verdict.issues.map((i) => i.code)).toContain('no-marks');
    expect(verdict.accepted).toBe(false);
  });

  it('counts paint laid after the dig date as no protection at all', () => {
    const good = [orange([{ x: 0, y: 20 }, { x: 100, y: 20 }])];
    const late = judgeLocate(REQUEST, [straightMain()], good, new Date(2026, 4, 21));
    expect(late.issues.map((i) => i.code)).toContain('late-response');
    expect(late.accepted).toBe(false);
    // The same marks on the day of the dig are in time.
    expect(judgeLocate(REQUEST, [straightMain()], good, new Date(2026, 4, 20)).accepted).toBe(true);
  });
});

describe('wrong colour', () => {
  it('is a defect, not a strike risk — the cable is marked, it is just claimed by somebody else', () => {
    const verdict = judgeLocate(REQUEST, [straightMain()], [{ id: 'm1', color: 'red', points: [{ x: 0, y: 20 }, { x: 100, y: 20 }] }], ON_TIME);
    const colour = verdict.issues.find((i) => i.code === 'wrong-colour');
    expect(colour?.severity).toBe('defect');
    // Red paint is not our marks, so the run still reads as unmarked.
    expect(verdict.issues.map((i) => i.code)).toContain('no-marks');
  });
});

describe('plant outside the dig area', () => {
  it('is not this ticket, and is not counted against the locate', () => {
    const elsewhere: PlantRun = {
      id: 'far', label: 'Feeder, next block', kind: 'feeder',
      recorded: [{ x: 0, y: 400 }, { x: 100, y: 400 }],
      actual: [{ x: 0, y: 400 }, { x: 100, y: 400 }],
    };
    const verdict = judgeLocate(REQUEST, [straightMain(), elsewhere], [orange([{ x: 0, y: 20 }, { x: 100, y: 20 }])], ON_TIME);
    expect(verdict.issues).toEqual([]);
    expect(verdict.accepted).toBe(true);
  });
});

describe('putting the ground on a page', () => {
  const extent = { x: 5, y: -3, w: 60, h: 44 };

  it('round-trips, which the first version of it did not', () => {
    const proj = groundProjector(extent, 8);
    for (const p of [{ x: 5, y: -3 }, { x: 35, y: 12 }, { x: 65, y: 41 }, { x: 20.5, y: 7.25 }]) {
      const page = proj.toPage(p);
      const back = proj.toWorld(page.x, page.y);
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('turns the drawing a quarter, so the street runs down the page', () => {
    const proj = groundProjector(extent, 8);
    // Moving ALONG the street (world x) moves DOWN the page.
    const a = proj.toPage({ x: 10, y: 0 });
    const b = proj.toPage({ x: 40, y: 0 });
    expect(b.y).toBeGreaterThan(a.y);
    expect(b.x).toBe(a.x);
    // The page is as wide as the street is deep, and as tall as the run is long.
    expect(proj.width).toBeCloseTo(44 * 8);
    expect(proj.height).toBeCloseTo(60 * 8);
  });

  it('puts the corner of the dig area at the corner of the page', () => {
    const proj = groundProjector(extent, 8);
    expect(proj.toPage({ x: extent.x, y: extent.y })).toEqual({ x: 0, y: 0 });
  });
});
