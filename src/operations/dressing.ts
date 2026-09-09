/**
 * Dressing, as geometry.
 *
 * `tray.ts` judges a dressed tray from numbers — bend radius, slack, which holder, does it
 * cross. This module is where those numbers come from when the trainee dresses a tray by
 * hand instead of typing them: it takes the path a finger actually dragged and measures it.
 *
 * The division matters and it is deliberate. The 3D bench is an *input device*. It decides
 * nothing. Every verdict still comes out of `judgeTray`, which is pure, older than this file
 * and tested on its own — so a rendering bug can make the bench feel wrong but cannot make
 * it grade wrong, and the physics stays in one place.
 *
 * COORDINATES. Tray-local millimetres, seen from above: `x` runs the long way (the entry
 * slot is at x = 0), `z` runs across. Everything a tray does to a fibre happens in that
 * plane, so the route is planar and the third dimension is presentation. Holding it flat is
 * what makes the whole thing testable without a renderer.
 *
 * WHY THE PATH IS SMOOTHED BEFORE IT IS MEASURED. A finger on glass jitters, and raw
 * curvature on a jittery polyline reads as a 2 mm bend radius every few samples — which
 * would fail every tray ever dressed, including a perfect one. Ribbon does not reproduce a
 * tremor: it is a stiff flat object and it takes the smooth path through the points you
 * pushed it past. Smoothing is modelling the ribbon, not forgiving the trainee.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export type AnchorKind =
  /** The slot in the tray wall the ribbon comes in through. Over the wall instead and the lid bears on it. */
  | 'entry'
  /** Moulded retention tabs. The ribbon goes under them; that is what holds the dressing when the case is handled. */
  | 'finger'
  /** The moulded radius limiters. Routing around them is what keeps the stored bend legal. */
  | 'limiter'
  /** A splice holder in the centre rail. */
  | 'holder';

export interface Anchor {
  id: string;
  kind: AnchorKind;
  at: Vec2;
  /** Holders and fingers are numbered; the number is what the verdict names. */
  index?: number;
}

export interface TrayGeometry {
  /** Overall tray, in millimetres. */
  lengthMm: number;
  widthMm: number;
  /** What the moulded limiters enforce. Comes from the closure catalog, never invented here. */
  minBendRadiusMm: number;
  holders: number;
  anchors: Anchor[];
}

/** How near the finger has to pass for a feature to capture the ribbon, in millimetres. */
export const CAPTURE_MM = 16;

/**
 * Build the tray a given closure actually contains.
 *
 * Sizes are the ordinary proportions of a splice tray rather than any one manufacturer's
 * drawing — a tray is about twice as long as it is wide, the limiters sit inboard of the
 * ends, and the holders run down the middle. The one number that is NOT invented here is the
 * minimum bend radius, which is a property of the closure you opened and comes from the
 * catalog. Anything else in this file is shape, and shape is not a specification.
 */
export function buildTrayGeometry(holders: number, minBendRadiusMm: number): TrayGeometry {
  const lengthMm = 240;
  const widthMm = 130;
  const anchors: Anchor[] = [];

  /**
   * The entry slot is offset to the channel, not centred on the end wall.
   *
   * This started out in the middle and the tray was quietly impossible to dress well: a
   * ribbon entering on the centreline has to S-bend across to the routing channel within the
   * width of the tray, and that S is tighter than the radius limit however carefully it is
   * laid. Real trays put the slot where the ribbon is going, so it comes in already running
   * the right way. The old centred slot was not a harder version of the task, it was an
   * unpassable one, which is a different thing and worse.
   */
  const channelZ = widthMm / 2 - 22;
  anchors.push({ id: 'entry', kind: 'entry', at: { x: 0, z: -channelZ } });

  // Retention fingers along both routing channels, clear of the limiters.
  const fingerX = [55, 120, 185];
  fingerX.forEach((x, i) => {
    anchors.push({ id: `finger-n${i + 1}`, kind: 'finger', index: i + 1, at: { x, z: -widthMm / 2 + 12 } });
    anchors.push({ id: `finger-s${i + 1}`, kind: 'finger', index: i + 1, at: { x, z: widthMm / 2 - 12 } });
  });

  // The limiters. Their radius is the tray's minimum, which is the point of them: follow the
  // moulding and the stored bend is legal without anybody measuring anything.
  anchors.push({ id: 'limiter-w', kind: 'limiter', at: { x: minBendRadiusMm + 14, z: 0 } });
  anchors.push({ id: 'limiter-e', kind: 'limiter', at: { x: lengthMm - minBendRadiusMm - 14, z: 0 } });

  // Splice holders down the centre rail.
  const first = 70;
  const span = lengthMm - first - 40;
  for (let i = 0; i < holders; i++) {
    const t = holders === 1 ? 0.5 : i / (holders - 1);
    anchors.push({ id: `holder-${i + 1}`, kind: 'holder', index: i + 1, at: { x: first + span * t, z: 0 } });
  }

  return { lengthMm, widthMm, minBendRadiusMm, holders, anchors };
}

// --- Measuring a laid route ---------------------------------------------------------------

export function pathLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return total;
}

/**
 * Resample a path at a fixed step.
 *
 * A drag produces points wherever the browser happened to fire, which is dense when the
 * finger is slow and sparse when it is fast. Curvature measured on that is measuring the
 * trainee's hand speed. Even spacing measures the shape.
 */
export function resample(points: readonly Vec2[], stepMm = 4): Vec2[] {
  if (points.length < 2) return [...points];
  const out: Vec2[] = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (seg === 0) continue;
    let travelled = stepMm - carry;
    while (travelled <= seg) {
      const t = travelled / seg;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      travelled += stepMm;
    }
    carry = seg - (travelled - stepMm);
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.z - tail.z) > stepMm / 2) out.push(last);
  return out;
}

/** Moving average. See the header: this models the ribbon's stiffness, not the trainee's aim. */
export function smoothPath(points: readonly Vec2[], window = 3): Vec2[] {
  if (points.length <= 2 || window < 1) return [...points];
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    // The ends are held by the entry slot and the holder, so they are not averaged away.
    if (i === 0 || i === points.length - 1) {
      out.push(points[i]);
      continue;
    }
    const lo = Math.max(0, i - window);
    const hi = Math.min(points.length - 1, i + window);
    let sx = 0;
    let sz = 0;
    for (let k = lo; k <= hi; k++) {
      sx += points[k].x;
      sz += points[k].z;
    }
    out.push({ x: sx / (hi - lo + 1), z: sz / (hi - lo + 1) });
  }
  return out;
}

/**
 * Radius of the circle through three points. Infinity when they are collinear — a straight
 * run has no bend and must not read as an infinitely tight one.
 */
export function circumradius(a: Vec2, b: Vec2, c: Vec2): number {
  const ab = Math.hypot(b.x - a.x, b.z - a.z);
  const bc = Math.hypot(c.x - b.x, c.z - b.z);
  const ca = Math.hypot(a.x - c.x, a.z - c.z);
  if (ab === 0 || bc === 0 || ca === 0) return Infinity;
  // Twice the triangle's area, by the cross product.
  const cross = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
  if (cross === 0) return Infinity;
  return (ab * bc * ca) / (2 * cross);
}

/**
 * The tightest bend anywhere along a laid route, in millimetres.
 *
 * Measured on a resampled, smoothed path and over a span rather than between adjacent
 * samples: a bend radius is a property of an arc, and three points 4 mm apart describe the
 * noise floor, not the arc.
 */
export function minBendRadius(points: readonly Vec2[], spanMm = 12, stepMm = 4): number {
  const path = smoothPath(resample(points, stepMm));
  const step = Math.max(1, Math.round(spanMm / stepMm));
  if (path.length < 2 * step + 1) return Infinity;
  let tightest = Infinity;
  for (let i = step; i < path.length - step; i++) {
    tightest = Math.min(tightest, circumradius(path[i - step], path[i], path[i + step]));
  }
  return tightest;
}

/** Do two laid routes cross? Tracing a circuit later means disturbing whatever it crosses. */
export function pathsCross(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (segmentsCross(a[i - 1], a[i], b[j - 1], b[j])) return true;
    }
  }
  return false;
}

function orient(p: Vec2, q: Vec2, r: Vec2): number {
  const v = (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0;
}

function segmentsCross(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  return d1 !== d2 && d3 !== d4;
}

/** Which features the route passed close enough to be captured by, in the order it met them. */
export function capturedAnchors(points: readonly Vec2[], geometry: TrayGeometry, captureMm = CAPTURE_MM): Anchor[] {
  const seen: Anchor[] = [];
  for (const p of resample(points, 2)) {
    for (const anchor of geometry.anchors) {
      if (Math.hypot(p.x - anchor.at.x, p.z - anchor.at.z) > captureMm) continue;
      if (seen[seen.length - 1]?.id === anchor.id) continue;
      if (seen.some((s) => s.id === anchor.id)) continue;
      seen.push(anchor);
    }
  }
  return seen;
}

export interface RouteMeasurement {
  /** Stored length, which is what "slack" means once it is in the tray. */
  slackMm: number;
  bendRadiusMm: number;
  /** Came in through the slot rather than over the wall. */
  viaEntry: boolean;
  /** Held down by the moulded fingers. */
  retained: boolean;
  /** Which holder the ribbon ends in, or null if it ends loose. */
  holder: number | null;
  /** Fingers it actually went under, for the bench to show its working. */
  fingersUsed: number;
}

/** How many retention points it takes before the dressing survives the case being handled. */
export const MIN_FINGERS = 2;

/**
 * Which holder a route is seated in.
 *
 * Deliberately the holder nearest where the ribbon *ends*, not the last one it passed. A
 * centre rail puts holders about twelve millimetres apart, which is closer together than
 * anything a finger can resolve — so "last one brushed past" identifies whichever holder the
 * route happened to overshoot, and the trainee would watch the seat number change while
 * doing nothing. The sleeve goes where the ribbon terminates. That is also what the verdict
 * is about.
 */
export function seatedHolder(points: readonly Vec2[], geometry: TrayGeometry, captureMm = CAPTURE_MM): number | null {
  const end = points[points.length - 1];
  if (!end) return null;
  let best: Anchor | null = null;
  let bestDistance = Infinity;
  for (const anchor of geometry.anchors) {
    if (anchor.kind !== 'holder') continue;
    const d = Math.hypot(end.x - anchor.at.x, end.z - anchor.at.z);
    if (d < bestDistance) {
      bestDistance = d;
      best = anchor;
    }
  }
  return best && bestDistance <= captureMm ? best.index ?? null : null;
}

/** Turn a dragged route into the numbers `judgeTray` reads. */
export function measureRoute(points: readonly Vec2[], geometry: TrayGeometry): RouteMeasurement {
  const captured = capturedAnchors(points, geometry);
  const fingers = captured.filter((a) => a.kind === 'finger');
  return {
    slackMm: Math.round(pathLength(resample(points, 2))),
    bendRadiusMm: Math.round(minBendRadius(points)),
    viaEntry: captured[0]?.kind === 'entry',
    retained: fingers.length >= MIN_FINGERS,
    holder: seatedHolder(points, geometry),
    fingersUsed: fingers.length,
  };
}
