/**
 * Bidirectional averaging: shooting the same span from both ends and averaging the
 * measured loss at each matched event resolves a gainer (apparent negative loss in one
 * direction) back to its true splice loss.
 */
import { BidirectionalMismatchError } from './errors';
import type { BidirectionalEvent, DetectedEvent, OtdrTraceResult } from './types';

const SETTINGS_KEYS = ['wavelengthNm', 'pulseWidthNs', 'rangeMeters', 'iorSetting', 'averagingSeconds'] as const;

export function bidirectionalAverage(ab: OtdrTraceResult, ba: OtdrTraceResult): BidirectionalEvent[] {
  const baReversed = [...ba.hidden.pathSpanIds].reverse();
  if (JSON.stringify(ab.hidden.pathSpanIds) !== JSON.stringify(baReversed)) {
    throw new BidirectionalMismatchError('The A->B and B->A traces do not traverse the same path in reverse');
  }
  const settingsMatch = SETTINGS_KEYS.every((k) => ab.settings[k] === ba.settings[k]);
  if (!settingsMatch) {
    throw new BidirectionalMismatchError('The A->B and B->A traces must use matching settings');
  }

  const totalDisplayLength = ab.events[ab.events.length - 1]?.distanceMeters ?? 0;
  const edz = ab.eventDeadZoneMeters;
  const measurable = (e: DetectedEvent) => e.kind !== 'launch' && e.kind !== 'end-of-fiber';

  const results: BidirectionalEvent[] = [];
  for (const abEv of ab.events) {
    if (!measurable(abEv)) continue;
    const predictedBaDistance = totalDisplayLength - abEv.distanceMeters;
    let best: DetectedEvent | null = null;
    let bestDiff = Infinity;
    for (const baEv of ba.events) {
      if (!measurable(baEv)) continue;
      const diff = Math.abs(predictedBaDistance - baEv.distanceMeters);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = baEv;
      }
    }
    const matched = best !== null && bestDiff <= edz;
    const lossAbDb = abEv.lossDb ?? 0;
    const lossBaDb = matched ? best!.lossDb ?? 0 : NaN;
    const averagedLossDb = matched ? (lossAbDb + lossBaDb) / 2 : lossAbDb;
    results.push({ distanceFromAMeters: abEv.distanceMeters, lossAbDb, lossBaDb, averagedLossDb, matched });
  }
  return results;
}
