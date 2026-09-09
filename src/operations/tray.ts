/**
 * Dressing the tray.
 *
 * A splice can read 0.02 dB and the job still be wrong. Dressing is what separates a
 * closure that someone can re-enter in five years from one that has to be cut out, and it
 * is judged almost entirely on things that cost nothing on the day: whether the slack is
 * real, whether the fibre followed the radius limiters, whether the sleeves are seated,
 * whether anyone can tell which fibre is which.
 *
 * The rules encoded here are the ones with physics behind them, not house preference:
 *
 *  - BEND RADIUS. Coated fibre stored in a tray has a minimum bend radius — 30 mm is the
 *    long-standing floor and it is what a tray's moulded limiters are shaped to. Inside it,
 *    light leaks through the cladding as macrobend loss, worse at 1550 nm than at 1310 nm.
 *    It is not a tidiness rule; it is an attenuation rule.
 *  - SLACK. Enough fibre to lift a splice out of the tray and re-work it on the bench.
 *    Without it the next technician has to cut and re-splice to gain length.
 *  - CAPACITY. A tray filled past its holder count means the lid presses on fibre, which is
 *    why the loss appears when you CLOSE the closure and vanishes when you open it again.
 *
 * The minimum radius is a parameter rather than a constant, because it is a property of the
 * closure you actually opened — a tray's moulded limiters are what enforce it. The catalog
 * supplies it; MIN_BEND_RADIUS_MM is only the fallback.
 *
 * Pure, so a tray can be judged without a renderer.
 */

/** Minimum stored bend radius for 250 µm coated fibre, in millimetres. */
export const MIN_BEND_RADIUS_MM = 30;

/** Slack that leaves the next technician able to work, in millimetres. */
export const MIN_SLACK_MM = 900;

/** Past this, the tray is full enough that the lid starts to matter. */
export const CROWDING_RATIO = 0.9;

export interface FibrePlacement {
  /** Which buffer tube this fibre came out of, for identification. */
  tube: string;
  /** Position in the tube's colour sequence, 1-based. */
  fibre: number;
  /** Splice holder this sleeve is seated in, 1-based. Null means it is loose in the tray. */
  holder: number | null;
  /** Tightest bend radius anywhere on this fibre's route, in millimetres. */
  bendRadiusMm: number;
  /** Stored slack, in millimetres. */
  slackMm: number;
  /** Whether the route crosses over another fibre rather than following its own path. */
  crossesOthers: boolean;
  /**
   * Came in through the tray's entry slot rather than over the wall.
   *
   * Optional, and true when absent, because a placement described in numbers rather than
   * dressed by hand has no wall to go over — this only becomes a question once somebody is
   * routing a ribbon on a model of the tray.
   */
  viaEntry?: boolean;
  /** Held down by the moulded retention fingers. Same reasoning as `viaEntry` for the default. */
  retained?: boolean;
}

export interface Tray {
  id: string;
  /** Splice holders the tray provides. */
  holders: number;
  placements: FibrePlacement[];
}

export type IssueSeverity =
  /** Costs loss now, or will fail acceptance. */
  | 'defect'
  /** Passes today, costs somebody else later. */
  | 'workmanship';

export interface TrayIssue {
  severity: IssueSeverity;
  code: string;
  /** Which fibre, where identifiable. */
  where: string;
  detail: string;
  /** Extra loss this introduces, dB, where it introduces any. */
  addedLossDb?: number;
}

function label(p: FibrePlacement): string {
  return `${p.tube} fibre ${p.fibre}`;
}

/**
 * Inspect a dressed tray.
 *
 * Severity is the point of the return value. A bend inside the radius is a *defect* — it
 * is attenuating right now and acceptance will catch it. An unlabelled tray is
 * *workmanship* — nothing measures worse today, and it will cost somebody a night shift in
 * three years. Collapsing those two into "issues" teaches a trainee that they are the same
 * kind of wrong, and they are not.
 */
export function inspectTray(tray: Tray, labelled: boolean, minBendRadiusMm: number = MIN_BEND_RADIUS_MM): TrayIssue[] {
  const issues: TrayIssue[] = [];

  for (const p of tray.placements) {
    if (p.bendRadiusMm < minBendRadiusMm) {
      // Tighter bends leak more; the model scales rather than flagging a flat penalty.
      const over = (minBendRadiusMm - p.bendRadiusMm) / minBendRadiusMm;
      issues.push({
        severity: 'defect',
        code: 'bend-radius',
        where: label(p),
        detail: `Routed at ${p.bendRadiusMm} mm against a ${minBendRadiusMm} mm minimum. Macrobend loss, and it will read worse at 1550 nm than at 1310 nm.`,
        addedLossDb: Math.round(over * 0.6 * 1000) / 1000,
      });
    }

    if (p.holder === null) {
      issues.push({
        severity: 'defect',
        code: 'unseated-sleeve',
        where: label(p),
        detail: 'Sleeve not seated in a holder. It will move when the closure is handled and the splice takes the strain.',
      });
    } else if (p.holder < 1 || p.holder > tray.holders) {
      issues.push({
        severity: 'defect',
        code: 'bad-holder',
        where: label(p),
        detail: `Holder ${p.holder} does not exist on this tray, which has ${tray.holders}.`,
      });
    }

    if (p.viaEntry === false) {
      issues.push({
        severity: 'defect',
        code: 'over-the-wall',
        where: label(p),
        detail: 'Routed over the tray wall instead of through the entry slot. The lid closes onto it: the loss appears when the closure is shut and vanishes when you open it to look.',
        addedLossDb: 0.14,
      });
    }

    if (p.retained === false) {
      issues.push({
        severity: 'defect',
        code: 'unretained',
        where: label(p),
        detail: 'Not run under the retention fingers. It lies right until somebody lifts the tray, and then the splice takes the strain instead of the moulding.',
      });
    }

    if (p.slackMm < MIN_SLACK_MM) {
      issues.push({
        severity: 'workmanship',
        code: 'insufficient-slack',
        where: label(p),
        detail: `${p.slackMm} mm of slack. The next re-entry cannot lift this splice out to work on it and will have to cut and re-splice for length.`,
      });
    }

    if (p.crossesOthers) {
      issues.push({
        severity: 'workmanship',
        code: 'crossed-route',
        where: label(p),
        detail: 'Route crosses other fibres. Nothing measures worse; tracing this circuit later means disturbing its neighbours.',
      });
    }
  }

  // Two fibres in one holder is a physical impossibility that a UI can still allow.
  const seen = new Map<number, string>();
  for (const p of tray.placements) {
    if (p.holder === null) continue;
    const prior = seen.get(p.holder);
    if (prior) {
      issues.push({
        severity: 'defect',
        code: 'double-booked-holder',
        where: `${prior} and ${label(p)}`,
        detail: `Both seated in holder ${p.holder}.`,
      });
    } else {
      seen.set(p.holder, label(p));
    }
  }

  if (tray.placements.length > tray.holders) {
    issues.push({
      severity: 'defect',
      code: 'over-capacity',
      where: tray.id,
      detail: `${tray.placements.length} splices in a ${tray.holders}-holder tray. The lid will press on fibre — loss appears when the closure is CLOSED and disappears when it is opened, which is maddening to chase.`,
      addedLossDb: 0.18,
    });
  } else if (tray.placements.length > tray.holders * CROWDING_RATIO) {
    issues.push({
      severity: 'workmanship',
      code: 'crowded',
      where: tray.id,
      detail: `${tray.placements.length} of ${tray.holders} holders used. It closes, but there is no room to work in here later.`,
    });
  }

  if (!labelled) {
    issues.push({
      severity: 'workmanship',
      code: 'unlabelled',
      where: tray.id,
      detail: 'Tray not labelled and assignments not recorded. Costs nothing today; costs hours on the next fault at this location.',
    });
  }

  return issues;
}

export interface TrayVerdict {
  /** Passes inspection: no defects. Workmanship issues do not block acceptance. */
  accepted: boolean;
  defects: number;
  workmanship: number;
  /** Total loss the dressing itself introduces, dB. */
  addedLossDb: number;
  issues: TrayIssue[];
  summary: string;
}

export function judgeTray(tray: Tray, labelled: boolean, minBendRadiusMm: number = MIN_BEND_RADIUS_MM): TrayVerdict {
  const issues = inspectTray(tray, labelled, minBendRadiusMm);
  const defects = issues.filter((i) => i.severity === 'defect');
  const workmanship = issues.filter((i) => i.severity === 'workmanship');
  const added = Math.round(issues.reduce((s, i) => s + (i.addedLossDb ?? 0), 0) * 1000) / 1000;

  let summary: string;
  if (defects.length > 0) {
    summary = `${defects.length} defect${defects.length === 1 ? '' : 's'} — this tray does not pass.`;
  } else if (workmanship.length > 0) {
    summary = `Passes. ${workmanship.length} workmanship item${workmanship.length === 1 ? '' : 's'} that the next technician will pay for.`;
  } else {
    summary = 'Clean tray. Someone can re-enter this in five years and work in it.';
  }

  return {
    accepted: defects.length === 0,
    defects: defects.length,
    workmanship: workmanship.length,
    addedLossDb: added,
    issues: issues,
    summary: summary,
  };
}

/** A correctly dressed placement, for tests and for showing a trainee the target. */
export function goodPlacement(tube: string, fibre: number, holder: number): FibrePlacement {
  return { tube: tube, fibre: fibre, holder: holder, bendRadiusMm: 40, slackMm: 1000, crossesOthers: false, viaEntry: true, retained: true };
}
