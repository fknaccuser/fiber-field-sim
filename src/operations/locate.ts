/**
 * The other end of the DigAlert.
 *
 * `digalert.ts` models the ticket *you* open before *you* break ground: notify, wait two
 * working days, then dig. That is the law and it is the rarer half of the job. The common
 * half — the one an outside-plant technician does constantly — runs the other direction: a
 * ticket lands because somebody else is excavating near your plant, and you go out and mark
 * your own facilities in orange before their dig date so their backhoe does not find your
 * backbone for you.
 *
 * The two are not variations of one task. Opening a ticket is planning; answering one is
 * locating, and locating is a field skill with its own way of going wrong.
 *
 * WHAT THIS TEACHES, in the order it costs money:
 *
 *  1. **You mark the cable, not the drawing.** The print is a record of where the cable was
 *     put. A re-route that never made it back to the as-builts is still in the ground, and a
 *     locator will find it where the paper does not. Marking the recorded line and going home
 *     produces a clean-looking ticket, a confident excavator, and a cut cable. This model
 *     therefore keeps `recorded` and `actual` as separate routes and judges only against
 *     `actual` — while naming it specifically when the marks followed the paper instead.
 *  2. **You sweep the whole area.** The main is the part you remember. The lateral into the
 *     building, the stub left for a future NAP, the drop crossing the parkway — those are
 *     what get hit, because nobody swept for them.
 *  3. **Colour is content.** Orange is communications. A locate painted in the wrong colour
 *     tells the excavator to be careful about somebody else's utility.
 *  4. **The date is not advisory.** Marks that go down after the dig date are not marks.
 *
 * ON THE TOLERANCE NUMBERS. `MARK_TOLERANCE_M` here is how close a trainee's traced mark has
 * to be to the cable for this trainer to count it as marked. It is a *drawing* tolerance and
 * it is deliberately generous, because a finger on a phone is standing in for a locator wand
 * and a can of paint. It is NOT the statutory tolerance zone — that is
 * `TOLERANCE_ZONE_INCHES` in `digalert.ts`, it is a rule about where an excavator may use
 * power equipment, and conflating the two would teach a technician a wrong figure to argue
 * with. They are different numbers about different things and they stay in different files.
 *
 * Pure geometry and pure judgement: no renderer, no storage, no randomness.
 */
import { LEGAL_BASIS } from './digalert';

export interface Point {
  x: number;
  y: number;
}

/** An axis-aligned area of proposed excavation, in metres. */
export interface DigExtent {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PlantKind = 'feeder' | 'distribution' | 'drop' | 'stub';

/**
 * One buried run.
 *
 * `recorded` is what the print draws. `actual` is where it is. On most runs they are the
 * same array; where they are not, that difference is the whole lesson.
 */
export interface PlantRun {
  id: string;
  label: string;
  kind: PlantKind;
  recorded: Point[];
  actual: Point[];
}

/** A stripe of paint the trainee laid down. */
export interface Mark {
  id: string;
  /** Paint colour, as named in `MARK_COLORS`. Yours is orange. */
  color: string;
  points: Point[];
}

export interface LocateRequest {
  ticketId: string;
  /** Who is digging, as the ticket names them. */
  excavator: string;
  /** What they say they are doing — sometimes the only warning that they will go deep. */
  workDescription: string;
  extent: DigExtent;
  /** The day their backhoe arrives. Marks after this are not marks. */
  digDate: Date;
  receivedAt: Date;
}

/** How close a traced mark has to be to the cable to count. See the header. */
export const MARK_TOLERANCE_M = 3;

/** Spacing for walking a route when measuring coverage, in metres. */
const SAMPLE_M = 0.5;

/** A stray shorter than this is a wobble in the tracing, not a mismark. */
const STRAY_MIN_M = 4;

/** Below this much unmarked run, it is a gap in the paint rather than an unmarked facility. */
const GAP_MIN_M = 2;

/** The colour communications plant is marked in. Anything else is somebody else's utility. */
export const TELECOM_MARK_COLOR = 'orange';

// --- Geometry ---------------------------------------------------------------------------

/** Shortest distance from a point to a line segment. */
export function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // Project onto the segment and clamp, so the nearest point is never off the end.
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Shortest distance from a point to a polyline. Infinite for a polyline with no segments. */
export function distanceToPolyline(p: Point, line: readonly Point[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return Math.hypot(p.x - line[0].x, p.y - line[0].y);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, pointToSegment(p, line[i - 1], line[i]));
  return best;
}

export function polylineLength(line: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
  return total;
}

export function insideExtent(p: Point, extent: DigExtent): boolean {
  return p.x >= extent.x && p.x <= extent.x + extent.w && p.y >= extent.y && p.y <= extent.y + extent.h;
}

/**
 * Walk a polyline at a fixed spacing.
 *
 * Coverage is measured by sampling rather than by clipping segments, because a polyline
 * can leave and re-enter the dig area and clipping that correctly is fiddly for no gain —
 * every sample carries the distance it stands for, so the lengths still add up.
 */
export function sampleAlong(line: readonly Point[], spacing = SAMPLE_M): Point[] {
  if (line.length === 0) return [];
  if (line.length === 1) return [line[0]];
  const out: Point[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  out.push(line[line.length - 1]);
  return out;
}

// --- The locator ------------------------------------------------------------------------

/**
 * What the receiver reads at a point, 0 to 1.
 *
 * A clean Gaussian falloff either side of the conductor, with no noise and no distortion.
 * That is a simplification and it is a deliberate one: coupling onto a parallel water main,
 * a bleed-over from a neighbouring pair, a null directly over a deep line — those are real
 * and each of them needs a model somebody has actually measured, not a plausible-looking
 * number. Inventing them would teach a trainee to distrust a reading for the wrong reason.
 *
 * So the wand here is honest and the difficulty is where it belongs: you still have to sweep
 * the whole area to find what is in it, and nothing tells you when you have found it all.
 */
export function signalAt(p: Point, runs: readonly PlantRun[], falloffM = 4): number {
  let best = 0;
  for (const run of runs) {
    const d = distanceToPolyline(p, run.actual);
    best = Math.max(best, Math.exp(-((d / falloffM) ** 2)));
  }
  return best;
}

// --- Judgement --------------------------------------------------------------------------

export type LocateSeverity =
  /** Somebody's backhoe finds your cable. The failure this whole task exists to prevent. */
  | 'strike-risk'
  /** Wrong, and it will be noticed, but it does not by itself put a cable at risk. */
  | 'defect'
  /** Passes today and costs somebody else time later. */
  | 'workmanship';

export interface LocateIssue {
  severity: LocateSeverity;
  code: string;
  where: string;
  detail: string;
  /** Metres of plant or paint this issue concerns, where that is meaningful. */
  meters?: number;
}

export interface LocateVerdict {
  /** No strike risks. Defects still fail the ticket; workmanship does not. */
  accepted: boolean;
  strikeRisks: number;
  defects: number;
  workmanship: number;
  /** Metres of plant inside the dig area, and how much of it got marked. */
  plantMeters: number;
  markedMeters: number;
  issues: LocateIssue[];
  summary: string;
}

function orangeMarks(marks: readonly Mark[]): Mark[] {
  return marks.filter((m) => m.color === TELECOM_MARK_COLOR);
}

/**
 * Judge a marked-up dig area.
 *
 * `respondedAt` is when the trainee cleared the ticket, which is what the date rule is
 * actually about — paint on the ground the morning after the backhoe arrives is a report,
 * not a locate.
 */
export function judgeLocate(
  request: LocateRequest,
  runs: readonly PlantRun[],
  marks: readonly Mark[],
  respondedAt: Date,
): LocateVerdict {
  const issues: LocateIssue[] = [];
  const ours = orangeMarks(marks);

  let plantMeters = 0;
  let markedMeters = 0;

  for (const run of runs) {
    const samples = sampleAlong(run.actual).filter((p) => insideExtent(p, request.extent));
    if (samples.length === 0) continue;

    // Each sample stands for one spacing of cable; the ends are worth half but at this
    // resolution that rounding is far below anything the verdict reports.
    const runMeters = samples.length * SAMPLE_M;
    plantMeters += runMeters;

    let coveredSamples = 0;
    let gapSamples = 0;
    let worstGapSamples = 0;
    for (const p of samples) {
      const covered = ours.some((m) => distanceToPolyline(p, m.points) <= MARK_TOLERANCE_M);
      if (covered) {
        coveredSamples++;
        worstGapSamples = Math.max(worstGapSamples, gapSamples);
        gapSamples = 0;
      } else {
        gapSamples++;
      }
    }
    worstGapSamples = Math.max(worstGapSamples, gapSamples);
    markedMeters += coveredSamples * SAMPLE_M;

    const unmarked = (samples.length - coveredSamples) * SAMPLE_M;
    const worstGap = worstGapSamples * SAMPLE_M;

    if (worstGap >= GAP_MIN_M) {
      // Marked against the paper rather than against the ground is its own diagnosis, and
      // saying so is the difference between "you missed a bit" and "you trusted the print".
      const followedRecord = ours.some((m) =>
        sampleAlong(m.points).some(
          (p) =>
            distanceToPolyline(p, run.recorded) <= MARK_TOLERANCE_M &&
            distanceToPolyline(p, run.actual) > MARK_TOLERANCE_M,
        ),
      );
      issues.push({
        severity: 'strike-risk',
        code: followedRecord ? 'marked-the-record' : 'unmarked-facility',
        where: run.label,
        meters: Math.round(unmarked * 10) / 10,
        detail: followedRecord
          ? `Marked where the print draws ${run.label}, not where it is. The records were never updated after it was re-routed, and the locator would have told you that in thirty seconds. An excavator digging to these marks digs into the cable.`
          : `${Math.round(unmarked)} m of ${run.label} inside the dig area carries no mark. Whatever is not painted is, as far as the excavator is concerned, not there.`,
      });
    } else if (unmarked > 0 && coveredSamples > 0) {
      issues.push({
        severity: 'workmanship',
        code: 'broken-marks',
        where: run.label,
        meters: Math.round(unmarked * 10) / 10,
        detail: 'Marks are intermittent along the run. It reads as two facilities with a space between them rather than one continuous line.',
      });
    }
  }

  // Paint that follows nothing. An excavator trusts these as much as the correct ones.
  for (const mark of ours) {
    const samples = sampleAlong(mark.points);
    if (samples.length === 0) continue;
    let stray = 0;
    let worstStray = 0;
    for (const p of samples) {
      const nearPlant = runs.some((run) => distanceToPolyline(p, run.actual) <= MARK_TOLERANCE_M);
      if (nearPlant) {
        worstStray = Math.max(worstStray, stray);
        stray = 0;
      } else {
        stray++;
      }
    }
    worstStray = Math.max(worstStray, stray) * SAMPLE_M;
    if (worstStray >= STRAY_MIN_M) {
      issues.push({
        severity: 'strike-risk',
        code: 'stray-mark',
        where: mark.id,
        meters: Math.round(worstStray * 10) / 10,
        detail: `${Math.round(worstStray)} m of paint with no facility under it. The excavator will hand-dig around nothing here and machine-dig confidently somewhere that matters.`,
      });
    }
  }

  for (const mark of marks) {
    if (mark.color === TELECOM_MARK_COLOR) continue;
    issues.push({
      severity: 'defect',
      code: 'wrong-colour',
      where: mark.id,
      detail: `Marked in ${mark.color}. Communications plant is orange; ${mark.color} tells the excavator this belongs to somebody else, and they will call somebody else about it.`,
    });
  }

  if (ours.length === 0) {
    issues.push({
      severity: 'strike-risk',
      code: 'no-marks',
      where: request.ticketId,
      detail: 'Ticket answered with no marks on the ground. If there genuinely is no plant here the ticket is cleared as "no conflict" — but there is plant here.',
    });
  }

  const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (dayOf(respondedAt) > dayOf(request.digDate)) {
    issues.push({
      severity: 'strike-risk',
      code: 'late-response',
      where: request.ticketId,
      detail: `Marked after the excavation date on the ticket. ${LEGAL_BASIS.statute} runs on dates, not on effort: paint that goes down after the backhoe arrives protected nothing.`,
    });
  }

  const strikeRisks = issues.filter((i) => i.severity === 'strike-risk').length;
  const defects = issues.filter((i) => i.severity === 'defect').length;
  const workmanship = issues.filter((i) => i.severity === 'workmanship').length;

  let summary: string;
  if (strikeRisks > 0) {
    summary = `${strikeRisks} strike risk${strikeRisks === 1 ? '' : 's'} — this ticket should not be cleared.`;
  } else if (defects > 0) {
    summary = `${defects} defect${defects === 1 ? '' : 's'}. Nothing is going to get cut, but this is not a locate anybody would sign.`;
  } else if (workmanship > 0) {
    summary = `Cleared. ${workmanship} thing${workmanship === 1 ? '' : 's'} a locator behind you would grumble about.`;
  } else {
    summary = 'Cleared. Every facility in the dig area is marked where it actually is.';
  }

  return {
    accepted: strikeRisks === 0 && defects === 0,
    strikeRisks,
    defects,
    workmanship,
    plantMeters: Math.round(plantMeters * 10) / 10,
    markedMeters: Math.round(markedMeters * 10) / 10,
    issues,
    summary,
  };
}

// --- Generating a ticket ------------------------------------------------------------------

/**
 * Build a locate job.
 *
 * Seeded, in the same spirit as the rest of the engine: a ticket number reproduces the same
 * street, the same plant and the same re-route, so two trainees can be sent the same job and
 * a run can be replayed.
 *
 * The generator's one editorial decision is how often the records are wrong. It is roughly
 * one job in three here. That is a guess and it is flagged as one — nobody has given this
 * project a figure for how often a re-route goes un-as-builted on this plant. What matters
 * for training is that it is common enough that sweeping is never optional and rare enough
 * that the trainee cannot just assume the print is lying.
 */
export interface LocateJob {
  request: LocateRequest;
  runs: PlantRun[];
  /** The street centreline, for the drawing to have somewhere to put the kerbs. */
  streetY: number;
}

const EXCAVATORS = [
  'Vallejo Grading',
  'Ramirez Underground',
  'SoCal Water District',
  'Pacific Site Services',
  'Delgado Paving',
];

const WORK = [
  'Trench for storm drain, 4 ft, crossing the parkway.',
  'Set two new power poles, auger to 6 ft.',
  'Replace water service to the property, open cut at the kerb.',
  'Sidewalk removal and replacement, saw cut to 8 in.',
  'Landscape and irrigation retrofit, trencher to 24 in.',
];

export function generateLocateJob(seed: number, today: Date, rng: { next(): number; int(a: number, b: number): number }): LocateJob {
  const streetY = 22;
  const extent: DigExtent = { x: 0, y: 0, w: 62, h: 44 };
  const runs: PlantRun[] = [];

  // The distribution main down the street. Sometimes it is not where the print says.
  const mainRecordedY = streetY + 6;
  const rerouted = rng.next() < 0.34;
  const mainActualY = rerouted ? mainRecordedY + (rng.next() < 0.5 ? -9 : 9) : mainRecordedY;
  runs.push({
    id: 'main',
    label: 'Distribution main',
    kind: 'distribution',
    recorded: [{ x: -10, y: mainRecordedY }, { x: 72, y: mainRecordedY }],
    actual: [{ x: -10, y: mainActualY }, { x: 72, y: mainActualY }],
  });

  // Drops off it. These are what get cut, because they are what nobody sweeps for.
  const drops = 1 + rng.int(0, 2);
  for (let i = 0; i < drops; i++) {
    const x = 8 + rng.int(0, 46);
    const line = [{ x, y: mainActualY }, { x, y: extent.h - 2 }];
    runs.push({
      id: `drop-${i}`,
      label: `Drop to ${100 + rng.int(1, 60) * 2}`,
      kind: 'drop',
      recorded: line,
      actual: line,
    });
  }

  // A stub left for a NAP that was never built. It is live plant, it is on nobody's mind,
  // and it is in the ground.
  if (rng.next() < 0.5) {
    const x = 10 + rng.int(0, 40);
    const line = [{ x, y: mainActualY }, { x: x + 14, y: mainActualY }, { x: x + 14, y: 6 }];
    runs.push({ id: 'stub', label: 'Abandoned-in-place stub', kind: 'stub', recorded: line, actual: line });
  }

  const digInDays = 3 + rng.int(0, 5);
  const digDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + digInDays);

  return {
    streetY,
    runs,
    request: {
      ticketId: `USA-${400000 + (seed % 99999)}`,
      excavator: EXCAVATORS[rng.int(0, EXCAVATORS.length - 1)],
      workDescription: WORK[rng.int(0, WORK.length - 1)],
      extent,
      digDate,
      receivedAt: today,
    },
  };
}

// --- Putting the ground on a page ---------------------------------------------------------

/**
 * Quarter-turned projection: the street runs down the page.
 *
 * A dig area is a long thin strip of frontage and a phone is a long thin screen the other
 * way up, so the drawing is rotated — page x is world y (across the street), page y is world
 * x (along it). Exactly the reason the print rotates its own sheets.
 *
 * This exists as a pure pair rather than as two expressions in a component because the first
 * version of it was not invertible: the forward transform rotated and the inverse did not, so
 * every stroke the trainee painted was laid down transposed. A round-trip is one assertion
 * and it would have caught that before it reached a screen.
 */
export interface GroundProjector {
  pxPerM: number;
  width: number;
  height: number;
  toPage(p: Point): Point;
  toWorld(x: number, y: number): Point;
}

export function groundProjector(extent: DigExtent, pxPerM: number): GroundProjector {
  return {
    pxPerM,
    width: extent.h * pxPerM,
    height: extent.w * pxPerM,
    toPage: (p) => ({ x: (p.y - extent.y) * pxPerM, y: (p.x - extent.x) * pxPerM }),
    toWorld: (x, y) => ({ x: y / pxPerM + extent.x, y: x / pxPerM + extent.y }),
  };
}
