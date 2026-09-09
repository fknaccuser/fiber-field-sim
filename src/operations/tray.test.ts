import { describe, expect, it } from 'vitest';
import {
  goodPlacement,
  inspectTray,
  judgeTray,
  MIN_BEND_RADIUS_MM,
  MIN_SLACK_MM,
  type FibrePlacement,
  type Tray,
} from './tray';

function tray(placements: FibrePlacement[], holders = 12): Tray {
  return { id: 'tray-1', holders: holders, placements: placements };
}

const CLEAN = tray([
  goodPlacement('blue', 1, 1),
  goodPlacement('blue', 2, 2),
  goodPlacement('blue', 3, 3),
]);

describe('a tray dressed properly', () => {
  it('raises nothing at all', () => {
    expect(inspectTray(CLEAN, true)).toEqual([]);
  });

  it('is accepted, and says why that matters', () => {
    const v = judgeTray(CLEAN, true);
    expect(v.accepted).toBe(true);
    expect(v.defects).toBe(0);
    expect(v.addedLossDb).toBe(0);
    expect(v.summary).toMatch(/re-enter this in five years/i);
  });
});

describe('bend radius is an attenuation rule, not a tidiness rule', () => {
  it('flags a bend inside the minimum as a defect that costs loss', () => {
    const t = tray([{ ...goodPlacement('blue', 1, 1), bendRadiusMm: 15 }]);
    const issues = inspectTray(t, true);
    const bend = issues.find((i) => i.code === 'bend-radius');
    expect(bend).toBeDefined();
    expect(bend!.severity).toBe('defect');
    expect(bend!.addedLossDb).toBeGreaterThan(0);
  });

  it('names the wavelength signature, since that is how it gets found', () => {
    const t = tray([{ ...goodPlacement('blue', 1, 1), bendRadiusMm: 20 }]);
    expect(inspectTray(t, true)[0].detail).toMatch(/1550/);
  });

  it('costs more the tighter it gets', () => {
    const loose = judgeTray(tray([{ ...goodPlacement('blue', 1, 1), bendRadiusMm: 25 }]), true);
    const tight = judgeTray(tray([{ ...goodPlacement('blue', 1, 1), bendRadiusMm: 10 }]), true);
    expect(tight.addedLossDb).toBeGreaterThan(loose.addedLossDb);
  });

  it('accepts exactly the minimum', () => {
    const t = tray([{ ...goodPlacement('blue', 1, 1), bendRadiusMm: MIN_BEND_RADIUS_MM }]);
    expect(inspectTray(t, true)).toEqual([]);
  });
});

describe('defect versus workmanship — the distinction the trainee has to feel', () => {
  it('treats missing slack as workmanship: it passes today and costs later', () => {
    const t = tray([{ ...goodPlacement('blue', 1, 1), slackMm: MIN_SLACK_MM - 400 }]);
    const v = judgeTray(t, true);
    expect(v.accepted).toBe(true);
    expect(v.workmanship).toBe(1);
    expect(v.issues[0].detail).toMatch(/cut and re-splice/i);
  });

  it('treats an unseated sleeve as a defect: it will not survive handling', () => {
    const t = tray([{ ...goodPlacement('blue', 1, 1), holder: null }]);
    const v = judgeTray(t, true);
    expect(v.accepted).toBe(false);
    expect(v.issues[0].severity).toBe('defect');
  });

  it('treats crossed routes as workmanship, and says nothing measures worse', () => {
    const t = tray([{ ...goodPlacement('blue', 1, 1), crossesOthers: true }]);
    const issue = inspectTray(t, true)[0];
    expect(issue.severity).toBe('workmanship');
    expect(issue.detail).toMatch(/nothing measures worse/i);
  });

  it('flags an unlabelled tray as workmanship with an honest cost', () => {
    const v = judgeTray(CLEAN, false);
    expect(v.accepted).toBe(true);
    expect(v.issues.some((i) => i.code === 'unlabelled')).toBe(true);
    expect(v.summary).toMatch(/next technician will pay/i);
  });
});

describe('the tray as a physical object', () => {
  it('catches two sleeves booked into one holder', () => {
    const t = tray([goodPlacement('blue', 1, 3), goodPlacement('blue', 2, 3)]);
    const dup = inspectTray(t, true).find((i) => i.code === 'double-booked-holder');
    expect(dup).toBeDefined();
    expect(dup!.severity).toBe('defect');
  });

  it('catches a holder that does not exist on this tray', () => {
    const t = tray([goodPlacement('blue', 1, 99)], 12);
    expect(inspectTray(t, true).some((i) => i.code === 'bad-holder')).toBe(true);
  });

  it('over-capacity explains the closed-lid signature, which is the maddening one', () => {
    const many = Array.from({ length: 14 }, (_, i) => goodPlacement('blue', i + 1, i + 1));
    const v = judgeTray(tray(many, 12), true);
    const over = v.issues.find((i) => i.code === 'over-capacity');
    expect(over).toBeDefined();
    expect(over!.detail).toMatch(/when the closure is CLOSED/);
    expect(v.accepted).toBe(false);
  });

  it('warns about a crowded-but-legal tray without failing it', () => {
    const many = Array.from({ length: 11 }, (_, i) => goodPlacement('blue', i + 1, i + 1));
    const v = judgeTray(tray(many, 12), true);
    expect(v.accepted).toBe(true);
    expect(v.issues.some((i) => i.code === 'crowded')).toBe(true);
  });
});

describe('the verdict', () => {
  it('totals the loss the dressing itself introduces', () => {
    const t = tray([
      { ...goodPlacement('blue', 1, 1), bendRadiusMm: 15 },
      { ...goodPlacement('blue', 2, 2), bendRadiusMm: 15 },
    ]);
    const v = judgeTray(t, true);
    expect(v.addedLossDb).toBeGreaterThan(0);
    expect(v.defects).toBe(2);
  });

  it('reports every distinct problem rather than stopping at the first', () => {
    const t = tray([{ tube: 'blue', fibre: 1, holder: null, bendRadiusMm: 12, slackMm: 100, crossesOthers: true }]);
    const codes = inspectTray(t, false).map((i) => i.code).sort();
    expect(codes).toEqual(['bend-radius', 'crossed-route', 'insufficient-slack', 'unlabelled', 'unseated-sleeve']);
  });
});

describe('what a hand-dressed route adds', () => {
  const base = { id: 'TRAY-1', holders: 12 };

  it('treats a ribbon over the wall as a defect that only shows with the lid on', () => {
    const tray = { ...base, placements: [{ ...goodPlacement('blue', 1, 1), viaEntry: false }] };
    const verdict = judgeTray(tray, true);
    const issue = verdict.issues.find((i) => i.code === 'over-the-wall');
    expect(issue?.severity).toBe('defect');
    expect(verdict.addedLossDb).toBeGreaterThan(0);
    expect(verdict.accepted).toBe(false);
  });

  it('treats a ribbon nothing is holding down as a defect, the same as an unseated sleeve', () => {
    const tray = { ...base, placements: [{ ...goodPlacement('blue', 1, 1), retained: false }] };
    const verdict = judgeTray(tray, true);
    expect(verdict.issues.find((i) => i.code === 'unretained')?.severity).toBe('defect');
    // It costs nothing today: the strain arrives when somebody lifts the tray.
    expect(verdict.addedLossDb).toBe(0);
  });

  it('says nothing about either when the placement never described them', () => {
    // A placement given as plain numbers has no wall to go over. Absent must not read as bad.
    const numeric = { tube: 'blue', fibre: 1, holder: 1, bendRadiusMm: 40, slackMm: 1000, crossesOthers: false };
    const verdict = judgeTray({ ...base, placements: [numeric] }, true);
    expect(verdict.issues).toEqual([]);
    expect(verdict.accepted).toBe(true);
  });
});
