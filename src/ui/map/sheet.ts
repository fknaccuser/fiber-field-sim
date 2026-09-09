/**
 * The print. A field technician does not carry a 3D model of the plant — they carry a
 * paper drawing, and the whole skill of reading one is knowing which sheet you are on.
 *
 * So this is a plan view (top-down) of the plant layout, at three drawing scales. The
 * layout is the single source of position for everything in the session — what you measure
 * on the sheet is where you roll. There is no second topology and no second set of
 * coordinates.
 *
 * Pure geometry — no React, no SVG — so every framing rule is unit-testable.
 *
 * Paper convention: x runs east (same as the world), y runs *down* the page, and the
 * world's +z (across the street, toward the houses) is north. So paper y = -z and north
 * is up, the way every drawing you will ever be handed is oriented.
 */
import type { SceneLayout, Vec3 } from './layout';

export type ZoomLevel = 'site' | 'neighbourhood' | 'branch';

export const ZOOM_ORDER: readonly ZoomLevel[] = ['site', 'neighbourhood', 'branch'];

export const ZOOM_LABEL: Record<ZoomLevel, string> = {
  site: 'SITE',
  neighbourhood: 'BLOCK',
  branch: 'PON BRANCH',
};

export const ZOOM_NOTE: Record<ZoomLevel, string> = {
  site: 'Detail around your position',
  neighbourhood: 'The street, hub to premises',
  branch: 'Whole branch, OLT to the last drop',
};

/** Half-extent, in metres, of the tightest sheet. */
const SITE_HALF = 26;
/** Breathing room around a computed bounding box, in metres. */
const PAD: Record<ZoomLevel, number> = { site: 0, neighbourhood: 10, branch: 26 };

export interface Point {
  x: number;
  y: number;
}

/** A rectangle in paper coordinates. */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** World (x east, y up, z north) to paper (x east, y down the page). */
export function planPoint(v: Vec3): Point {
  return { x: v.x, y: -v.z };
}

function boundsOf(points: readonly Point[], pad: number): Frame {
  if (points.length === 0) return { x: -SITE_HALF, y: -SITE_HALF, w: SITE_HALF * 2, h: SITE_HALF * 2 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

/**
 * Grow a frame to the viewport's aspect ratio without moving its centre, so nothing that
 * was inside the frame can be pushed out by the fit. Always grows, never crops.
 */
export function fitFrame(frame: Frame, aspect: number): Frame {
  const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const w = Math.max(frame.w, 1);
  const h = Math.max(frame.h, 1);
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  const [outW, outH] = w / h < safeAspect ? [h * safeAspect, h] : [w, w / safeAspect];
  return { x: cx - outW / 2, y: cy - outH / 2, w: outW, h: outH };
}

/**
 * Which sheet you are looking at. `site` is a fixed window on where you stand; the wider
 * two are computed from what actually exists, so a generated scenario with a longer street
 * or an extra hub still fits on the page.
 */
export function frameFor(level: ZoomLevel, layout: SceneLayout, focusNodeId: string | null): Frame {
  if (level === 'site') {
    const focus = layout.placements.find((p) => p.nodeId === focusNodeId) ?? layout.placements[0];
    const c = focus ? planPoint(focus.position) : { x: 0, y: 0 };
    return { x: c.x - SITE_HALF, y: c.y - SITE_HALF, w: SITE_HALF * 2, h: SITE_HALF * 2 };
  }

  // The block sheet is the street and its premises; the branch sheet is everything,
  // which is what drags the POP and its long feeder onto the page.
  const wanted =
    level === 'neighbourhood'
      ? layout.placements.filter((p) => p.kind !== 'pop' && p.kind !== 'yard' && p.kind !== 'device')
      : layout.placements;

  const points: Point[] = wanted.map((p) => planPoint(p.position));
  if (level === 'branch') for (const route of layout.routes) for (const v of route.points) points.push(planPoint(v));

  return boundsOf(points, PAD[level]);
}

/** Sheet-to-sheet: a step out, or null when you are already on the widest one. */
export function zoomOut(level: ZoomLevel): ZoomLevel | null {
  const i = ZOOM_ORDER.indexOf(level);
  return i < ZOOM_ORDER.length - 1 ? ZOOM_ORDER[i + 1] : null;
}

export function zoomIn(level: ZoomLevel): ZoomLevel | null {
  const i = ZOOM_ORDER.indexOf(level);
  return i > 0 ? ZOOM_ORDER[i - 1] : null;
}

const NICE_METRES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/** Grid pitch: fine enough to measure against, coarse enough not to fog the drawing. */
export function gridStep(frame: Frame): number {
  const target = Math.max(frame.w, frame.h) / 12;
  return NICE_METRES.find((m) => m >= target) ?? NICE_METRES[NICE_METRES.length - 1];
}

/** A round number of metres for the scale bar, about a quarter of the sheet across. */
export function scaleBarMetres(frame: Frame): number {
  const target = frame.w / 4;
  const under = [...NICE_METRES].reverse().find((m) => m <= target);
  return under ?? NICE_METRES[0];
}

/** Drawing scale, printed in the title block the way a real sheet carries it. */
export function scaleDenominator(frame: Frame, paperWidthMm = 190): number {
  const ratio = (frame.w * 1000) / paperWidthMm;
  return NICE_METRES.map((m) => m * 10).find((d) => d >= ratio) ?? Math.round(ratio);
}

export function isInside(frame: Frame, p: Point, slack = 0): boolean {
  return p.x >= frame.x - slack && p.x <= frame.x + frame.w + slack && p.y >= frame.y - slack && p.y <= frame.y + frame.h + slack;
}

/** Midpoint of a polyline, for hanging a dimension label off a cable run. */
export function polylineMidpoint(points: readonly Vec3[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return planPoint(points[0]);
  const plan = points.map(planPoint);
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < plan.length; i++) {
    const d = Math.hypot(plan[i].x - plan[i - 1].x, plan[i].y - plan[i - 1].y);
    segs.push(d);
    total += d;
  }
  let walked = 0;
  for (let i = 0; i < segs.length; i++) {
    if (walked + segs[i] >= total / 2) {
      const t = segs[i] === 0 ? 0 : (total / 2 - walked) / segs[i];
      return { x: plan[i].x + (plan[i + 1].x - plan[i].x) * t, y: plan[i].y + (plan[i + 1].y - plan[i].y) * t };
    }
    walked += segs[i];
  }
  return plan[plan.length - 1];
}

/** Quarter turn on the page: north swings from up to the right. */
export function rotatePoint(p: Point): Point {
  return { x: -p.y, y: p.x };
}

function rotateFrame(f: Frame): Frame {
  return { x: -(f.y + f.h), y: f.x, w: f.h, h: f.w };
}

/**
 * Which way up to hold the sheet.
 *
 * A residential block is a long thin thing — a street with houses along it — and on a
 * portrait phone that lands as a 12:1 ribbon squeezed into a band across the middle, with
 * the rest of the page empty. A technician handed that drawing turns it sideways, so the
 * street runs down the page. This does the same, and only when it actually helps.
 */
export function orientation(frame: Frame, viewportAspect: number): { rotate: boolean; frame: Frame } {
  const content = frame.w / Math.max(frame.h, 1e-6);
  const portrait = viewportAspect > 0 && Number.isFinite(viewportAspect) && viewportAspect < 1;
  // Turn it only when the drawing is decidedly wide and the page is decidedly tall;
  // rotating a roughly square drawing just disorients the reader for nothing.
  const rotate = portrait && content > 1.3 && content > viewportAspect * 1.6;
  return rotate ? { rotate, frame: rotateFrame(frame) } : { rotate: false, frame };
}

/**
 * Lettering for a symbol: the designation, and only the designation.
 *
 * The site sheet used to print the full label — "FDH A — CAMINO DEL AVION & VIA LADERA"
 * beside "CLOSURE A1 — VIA LADERA", eleven metres apart — and the two ran straight through
 * each other into an unreadable smudge. Which is exactly what a real sheet avoids by
 * lettering the *symbol* with its designation and putting the address in the schedule. Here
 * the schedule is the footer card and the plant index, so the drawing gets the short form
 * at every scale and the full label is one tap away.
 */
export function sheetLabel(label: string, _level: ZoomLevel): string {
  return label.split(/\s+[—–-]\s+|,/)[0].trim();
}

/** A label placed on the page, before anything has been done about collisions. */
export interface LabelBox {
  key: string;
  x: number;
  y: number;
  text: string;
}

/**
 * Stack labels that would print on top of each other.
 *
 * Two nodes at one address — an ONT and the NID on the same wall — land within a couple of
 * pixels of each other, and their lettering overprints. A draughtsman moves the second one
 * down a line. This does the same, greedily and deterministically: work in reading order,
 * and push anything that collides with an already-placed label down by one line until it
 * clears.
 *
 * Width is estimated from the character count because the caller has no text metrics and
 * does not need them — being approximately right about a monospaced 8px label is enough to
 * decide whether two of them touch.
 */
export function stackLabels<T extends LabelBox>(labels: readonly T[], lineHeight = 10, charWidth = 4.6): T[] {
  const placed: T[] = [];
  const ordered = [...labels].sort((a, b) => a.y - b.y || a.x - b.x || a.key.localeCompare(b.key));

  for (const label of ordered) {
    const halfWidth = (label.text.length * charWidth) / 2;
    let y = label.y;
    // A bounded walk: past this many lines the drawing is too crowded to letter anyway, and
    // an unbounded loop on degenerate input would hang the render.
    for (let attempt = 0; attempt < 12; attempt++) {
      const clash = placed.some((other) => {
        const otherHalf = (other.text.length * charWidth) / 2;
        return Math.abs(other.x - label.x) < halfWidth + otherHalf && Math.abs(other.y - y) < lineHeight;
      });
      if (!clash) break;
      y += lineHeight;
    }
    placed.push({ ...label, y });
  }

  return placed;
}

/** Cable lengths are engineering data: printed the way the records print them. */
export function formatMetres(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
