/**
 * Builds the OTDR's event table from ground truth -- never by pattern-matching the noisy
 * samples. Only the per-event section-attenuation slope reads `samples` (a least-squares
 * fit over the clean stretch between two events); everything else (resolution, measured
 * loss/reflectance/distance) is a deterministic formula seeded from the world.
 */
import type { Rng } from '../../world';
import { MIN_SECTION_FOR_SLOPE_EDZ_MULTIPLE, SNR_NEAR_FLOOR_DB } from './constants';
import type { DetectedEvent, DetectedEventKind, GroundTruthEvent, TraceSample } from './types';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export interface DetectionContext {
  eventDeadZoneMeters: number;
  attenuationDeadZoneMeters: number;
  noiseFloorDb: number;
  rng: Rng;
}

interface Draft {
  distanceMeters: number;
  reflectanceDb: number | null;
  measuredLossDb: number | null; // null for launch/end-of-fiber
  extraMergedLossDb: number;
  quality: 'ok' | 'near-noise-floor';
  kind: DetectedEventKind;
}

/**
 * Computes each ground-truth event's clean (noiseless) baseline level (dB) just before
 * it, used to decide visibility/resolution. Supplied by trace.ts, which knows how to
 * evaluate a branch's smooth backscatter curve at a given true distance.
 */
export type BaselineBeforeFn = (g: GroundTruthEvent) => number;

export function detectEvents(
  groundTruth: GroundTruthEvent[],
  baselineBefore: BaselineBeforeFn,
  samples: TraceSample[],
  ctx: DetectionContext,
): { detected: DetectedEvent[]; groundTruth: GroundTruthEvent[] } {
  const sorted = [...groundTruth].sort((a, b) => a.displayDistanceMeters - b.displayDistanceMeters);
  const outGroundTruth: GroundTruthEvent[] = [];
  const drafts: Draft[] = [];
  let last: Draft | null = null;

  for (const g of sorted) {
    const baseline = baselineBefore(g);
    let resolved: boolean;
    if (!last) {
      resolved = true; // the front panel is always resolved -- there is nothing before it.
    } else {
      const deadZone = last.reflectanceDb !== null ? ctx.attenuationDeadZoneMeters : ctx.eventDeadZoneMeters;
      const farEnough = g.displayDistanceMeters >= last.distanceMeters + deadZone;
      const visible = baseline >= ctx.noiseFloorDb + SNR_NEAR_FLOOR_DB / 2;
      let lossOk = true;
      if (g.reflectanceDb === null) {
        const minLoss = clamp(0.02 + 0.05 * Math.pow(10, (ctx.noiseFloorDb - baseline + 30) / 20), 0.02, 2);
        lossOk = Math.abs(g.trueLossDb) >= minLoss;
      }
      resolved = farEnough && visible && lossOk;
    }
    outGroundTruth.push({ ...g, resolved });

    if (!resolved) {
      if (last) last.extraMergedLossDb += g.trueLossDb;
      continue;
    }

    const isReflective = g.reflectanceDb !== null;
    const sigma = clamp(0.01 + 0.02 * Math.pow(10, (ctx.noiseFloorDb - baseline + 30) / 20), 0.01, 0.5);
    const gJit = ctx.rng.nextGaussian();
    const draft: Draft = {
      distanceMeters: g.displayDistanceMeters + (gJit * ctx.eventDeadZoneMeters) / 8,
      reflectanceDb: isReflective ? g.reflectanceDb! + 1.0 * gJit : null,
      measuredLossDb: g.trueLossDb + sigma * gJit,
      extraMergedLossDb: 0,
      quality: baseline - ctx.noiseFloorDb < SNR_NEAR_FLOOR_DB ? 'near-noise-floor' : 'ok',
      kind: isReflective ? 'reflective' : 'non-reflective',
    };
    drafts.push(draft);
    last = draft;
  }

  if (drafts.length > 0) {
    drafts[0].kind = 'launch';
    drafts[0].measuredLossDb = null;
  }
  if (drafts.length > 1) {
    const lastDraft = drafts[drafts.length - 1];
    lastDraft.kind = 'end-of-fiber';
    lastDraft.measuredLossDb = null;
  }

  let cumulative = 0;
  const detected: DetectedEvent[] = drafts.map((d, i) => {
    const totalLoss = d.measuredLossDb === null ? null : d.measuredLossDb + d.extraMergedLossDb;
    if (totalLoss !== null) cumulative += totalLoss;

    const prev = i > 0 ? drafts[i - 1] : null;
    let sectionAttenuationDbPerKm: number | null = null;
    if (prev) {
      const windowStart = prev.distanceMeters + (prev.reflectanceDb !== null ? ctx.attenuationDeadZoneMeters : ctx.eventDeadZoneMeters);
      const windowEnd = d.distanceMeters;
      if (windowEnd - windowStart >= MIN_SECTION_FOR_SLOPE_EDZ_MULTIPLE * ctx.eventDeadZoneMeters) {
        sectionAttenuationDbPerKm = fitSlopeDbPerKm(samples, windowStart, windowEnd);
      }
    }

    return {
      index: i + 1,
      kind: d.kind,
      distanceMeters: d.distanceMeters,
      lossDb: totalLoss,
      reflectanceDb: d.reflectanceDb,
      cumulativeLossDb: cumulative,
      sectionAttenuationDbPerKm,
      quality: d.quality,
    };
  });

  return { detected, groundTruth: outGroundTruth };
}

function fitSlopeDbPerKm(samples: TraceSample[], fromMeters: number, toMeters: number): number | null {
  const pts = samples.filter((s) => s.distanceMeters > fromMeters && s.distanceMeters < toMeters);
  if (pts.length < 2) return null;
  const n = pts.length;
  const meanX = pts.reduce((a, p) => a + p.distanceMeters, 0) / n;
  const meanY = pts.reduce((a, p) => a + p.levelDb, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.distanceMeters - meanX) * (p.levelDb - meanY);
    den += (p.distanceMeters - meanX) ** 2;
  }
  if (den === 0) return null;
  const slopeDbPerMeter = num / den; // negative: level decreases with distance
  return -slopeDbPerMeter * 1000; // report attenuation as a positive dB/km value
}
