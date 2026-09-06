/**
 * Visual fault locator: shines visible light down a fiber and reports where it leaks
 * out -- useful for short-range continuity and pinpointing a bend or break by eye,
 * without needing an OTDR shot.
 */
import { findSpan } from '../../world';
import type { FiberEventKind, WorldState } from '../../world';

export const VFL_RANGE_METERS = 5000;
export const VFL_MACROBEND_MIN_LOSS_1550_DB = 0.3;

export type VflLeakKind = Extract<FiberEventKind, 'macrobend' | 'fiber-break' | 'connector-dirty'>;

export interface VflResult {
  leaks: Array<{ positionMeters: number; kind: VflLeakKind }>;
  simulatedSeconds: 120;
}

const LEAK_KINDS: readonly VflLeakKind[] = ['macrobend', 'fiber-break', 'connector-dirty'];

export function inspect(world: WorldState, spanId: string, fromNodeId: string): VflResult {
  const span = findSpan(world, spanId);
  const reversed = fromNodeId === span.toNodeId;
  const leaks: VflResult['leaks'] = [];

  for (const ev of span.events) {
    if (!(LEAK_KINDS as readonly string[]).includes(ev.kind)) continue;
    const positionMeters = reversed ? span.lengthMeters - ev.positionMeters : ev.positionMeters;
    if (positionMeters < 0 || positionMeters > VFL_RANGE_METERS) continue;
    if (ev.kind === 'macrobend') {
      const loss1550 = ev.lossDbByWavelength?.['1550'] ?? 0;
      if (loss1550 < VFL_MACROBEND_MIN_LOSS_1550_DB) continue;
    }
    leaks.push({ positionMeters, kind: ev.kind as VflLeakKind });
  }

  return { leaks, simulatedSeconds: 120 };
}
