/**
 * Pure renderer math: coordinate mapping, cursors, zoom/pan, hit-testing, and
 * downsampling. No DOM, no canvas -- the canvas component (item 6 territory, stubbed in
 * src/ui/otdr) calls these and only these to turn a trace result into pixels.
 */
import type { DetectedEvent, OtdrTraceResult, TraceSample } from './types';

export interface Viewport {
  xMinMeters: number;
  xMaxMeters: number;
  yMinDb: number;
  yMaxDb: number;
}

export function defaultViewport(result: OtdrTraceResult): Viewport {
  return {
    xMinMeters: 0,
    xMaxMeters: result.settings.rangeMeters,
    yMinDb: result.noiseFloorDb - 5,
    yMaxDb: 2, // saturationHeadroomDb-ish ceiling; the caller may override from the instrument profile
  };
}

export function toPixel(vp: Viewport, widthPx: number, heightPx: number, distanceMeters: number, levelDb: number): { x: number; y: number } {
  const xSpan = vp.xMaxMeters - vp.xMinMeters || 1;
  const ySpan = vp.yMaxDb - vp.yMinDb || 1;
  const x = ((distanceMeters - vp.xMinMeters) / xSpan) * widthPx;
  // dB increases upward on screen but pixel y increases downward.
  const y = heightPx - ((levelDb - vp.yMinDb) / ySpan) * heightPx;
  return { x, y };
}

export function fromPixelX(vp: Viewport, widthPx: number, xPx: number): number {
  const xSpan = vp.xMaxMeters - vp.xMinMeters;
  return vp.xMinMeters + (xPx / widthPx) * xSpan;
}

export function levelAt(result: OtdrTraceResult, distanceMeters: number): number {
  if (result.samples.length === 0) return result.noiseFloorDb;
  let best = result.samples[0];
  let bestDiff = Math.abs(best.distanceMeters - distanceMeters);
  for (const s of result.samples) {
    const diff = Math.abs(s.distanceMeters - distanceMeters);
    if (diff < bestDiff) {
      best = s;
      bestDiff = diff;
    }
  }
  return best.levelDb;
}

export interface CursorReadout {
  aLevelDb: number;
  bLevelDb: number;
  deltaMeters: number;
  deltaDb: number;
  twoPointLossDb: number;
  slopeDbPerKm: number | null;
}

export function cursorReadout(result: OtdrTraceResult, aMeters: number, bMeters: number): CursorReadout {
  const aLevelDb = levelAt(result, aMeters);
  const bLevelDb = levelAt(result, bMeters);
  const deltaMeters = bMeters - aMeters;
  const deltaDb = bLevelDb - aLevelDb;
  const twoPointLossDb = aLevelDb - bLevelDb;
  const slopeDbPerKm = deltaMeters !== 0 ? (twoPointLossDb / deltaMeters) * 1000 : null;
  return { aLevelDb, bLevelDb, deltaMeters, deltaDb, twoPointLossDb, slopeDbPerKm };
}

export function zoomAround(vp: Viewport, focusMeters: number, factor: number): Viewport {
  const span = vp.xMaxMeters - vp.xMinMeters;
  const newSpan = Math.max(1, span / factor);
  const ratio = span === 0 ? 0.5 : (focusMeters - vp.xMinMeters) / span;
  let xMin = focusMeters - ratio * newSpan;
  let xMax = xMin + newSpan;
  if (xMin < 0) {
    xMax -= xMin;
    xMin = 0;
  }
  return { ...vp, xMinMeters: xMin, xMaxMeters: xMax };
}

export function pan(vp: Viewport, deltaMeters: number): Viewport {
  let xMin = vp.xMinMeters + deltaMeters;
  let xMax = vp.xMaxMeters + deltaMeters;
  if (xMin < 0) {
    xMax -= xMin;
    xMin = 0;
  }
  return { ...vp, xMinMeters: xMin, xMaxMeters: xMax };
}

export function hitTestEvent(result: OtdrTraceResult, vp: Viewport, widthPx: number, xPx: number, toleranceX = 8): DetectedEvent | null {
  let best: DetectedEvent | null = null;
  let bestPixelDiff = Infinity;
  for (const ev of result.events) {
    const { x } = toPixel(vp, widthPx, 1, ev.distanceMeters, 0);
    const diff = Math.abs(x - xPx);
    if (diff < bestPixelDiff) {
      bestPixelDiff = diff;
      best = ev;
    }
  }
  return bestPixelDiff <= toleranceX ? best : null;
}

/** Min/max decimation so reflective peaks survive downsampling to a pixel-width array. */
export function downsampleForWidth(samples: TraceSample[], vp: Viewport, widthPx: number): TraceSample[] {
  if (samples.length <= widthPx * 2 || widthPx <= 0) return samples;
  const visible = samples.filter((s) => s.distanceMeters >= vp.xMinMeters && s.distanceMeters <= vp.xMaxMeters);
  if (visible.length <= widthPx * 2) return visible;
  const bucketSize = visible.length / widthPx;
  const out: TraceSample[] = [];
  for (let b = 0; b < widthPx; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.max(start + 1, Math.floor((b + 1) * bucketSize));
    let min = visible[start];
    let max = visible[start];
    for (let i = start; i < end && i < visible.length; i++) {
      if (visible[i].levelDb < min.levelDb) min = visible[i];
      if (visible[i].levelDb > max.levelDb) max = visible[i];
    }
    // Emit both extremes (in distance order) so a spike within the bucket survives.
    if (min.distanceMeters <= max.distanceMeters) {
      out.push(min, max);
    } else {
      out.push(max, min);
    }
  }
  return out;
}
