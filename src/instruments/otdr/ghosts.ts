/**
 * Ghost events: an instrument-side artifact of a strong reflector, appearing at integer
 * multiples of its distance. These are NEVER world-state faults (the fault taxonomy
 * intentionally excludes them) -- they exist only in the trace result.
 */
import { SNR_NEAR_FLOOR_DB } from './constants';
import type { DetectedEvent, GhostArtifact } from './types';

export interface GhostContext {
  rangeMeters: number;
  ghostThresholdReflectanceDb: number;
  ghostDecayDbPerOrder: number;
  bsCoefDb: number;
  saturationHeadroomDb: number;
  noiseFloorDb: number;
  /** Clean (noiseless) baseline level (dB) at a given displayed distance. */
  baselineAt: (distanceMeters: number) => number;
}

export function deriveGhosts(detected: DetectedEvent[], ctx: GhostContext): GhostArtifact[] {
  const ghosts: GhostArtifact[] = [];
  for (const ev of detected) {
    if (ev.reflectanceDb === null) continue;
    if (ev.reflectanceDb < ctx.ghostThresholdReflectanceDb) continue;

    const baselineAtSource = ctx.baselineAt(ev.distanceMeters);
    const H = Math.min((ev.reflectanceDb - ctx.bsCoefDb) / 2, ctx.saturationHeadroomDb - baselineAtSource);

    for (let k = 2; k * ev.distanceMeters < ctx.rangeMeters; k++) {
      const peakDb = H - (k - 1) * ctx.ghostDecayDbPerOrder;
      const distanceMeters = k * ev.distanceMeters;
      const baseline = ctx.baselineAt(distanceMeters);
      if (baseline + peakDb > ctx.noiseFloorDb + SNR_NEAR_FLOOR_DB) {
        ghosts.push({ sourceEventDistanceMeters: ev.distanceMeters, order: k, distanceMeters, peakDb });
      }
    }
  }
  return ghosts;
}
