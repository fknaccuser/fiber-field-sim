/**
 * Wavelength-key mapping and per-FiberEvent one-way loss. Shared by the OTDR physics
 * module and the optical path resolver so both compute the exact same insertion loss
 * for a given event at a given wavelength.
 */
import type { FiberEvent } from '../../world';
import type { NetworkProfile } from '../../profiles';
import { FIBER_BREAK_LOSS_DB, MISMATCH_TRUE_LOSS_DB } from './constants';

export type WavelengthKey = '1310' | '1550' | '1625';

const KEY_WAVELENGTHS: Record<WavelengthKey, number> = { '1310': 1310, '1550': 1550, '1625': 1625 };
const KEYS_ASCENDING: WavelengthKey[] = ['1310', '1550', '1625'];

/** Maps any wavelength in nm (a test wavelength or a service wavelength like 1577/1270) to the nearest of the three modeled keys. */
export function wavelengthKey(nm: number): WavelengthKey {
  let best: WavelengthKey = '1310';
  let bestDist = Infinity;
  for (const k of KEYS_ASCENDING) {
    const d = Math.abs(KEY_WAVELENGTHS[k] - nm);
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return best;
}

/** Reads a value from a partial {1310?,1550?,1625?} table at `key`, interpolating linearly (on wavelength, not array index) between the nearest defined keys when `key` itself is undefined, or falling back to the single defined value when only one key is present. Returns null if no key is defined at all. */
export function readWavelengthTriple(
  table: { '1310'?: number; '1550'?: number; '1625'?: number } | undefined,
  key: WavelengthKey,
): number | null {
  if (!table) return null;
  const direct = table[key];
  if (direct !== undefined) return direct;
  const defined = KEYS_ASCENDING.filter((k) => table[k] !== undefined);
  if (defined.length === 0) return null;
  if (defined.length === 1) return table[defined[0]]!;
  // Find the two defined keys bracketing (or nearest to) the requested key's wavelength.
  const targetNm = KEY_WAVELENGTHS[key];
  let lower: WavelengthKey | null = null;
  let upper: WavelengthKey | null = null;
  for (const k of defined) {
    if (KEY_WAVELENGTHS[k] <= targetNm) lower = k;
    if (KEY_WAVELENGTHS[k] >= targetNm && upper === null) upper = k;
  }
  if (lower && upper && lower !== upper) {
    const x0 = KEY_WAVELENGTHS[lower];
    const x1 = KEY_WAVELENGTHS[upper];
    const y0 = table[lower]!;
    const y1 = table[upper]!;
    const t = (targetNm - x0) / (x1 - x0);
    return y0 + t * (y1 - y0);
  }
  // target is outside the defined range on one side: use the nearest defined value.
  const nearest = (lower ?? upper)!;
  return table[nearest]!;
}

/**
 * One-way insertion loss (dB) of a FiberEvent at the given wavelength key, in the given
 * traversal direction. `direction` only matters for 'mismatched-fiber-splice' (a
 * gainer): its apparent loss differs by direction, which is exactly what bidirectional
 * averaging is for.
 */
export function eventOneWayLossDb(
  event: FiberEvent,
  network: Pick<NetworkProfile, 'splitterLadder'>,
  key: WavelengthKey,
  direction: 'forward' | 'reverse',
): number {
  if (event.kind === 'fiber-break') return FIBER_BREAK_LOSS_DB;

  if (event.kind === 'mismatched-fiber-splice') {
    const forward = event.lossDb ?? 0;
    const trueLoss = event.trueLossDb ?? MISMATCH_TRUE_LOSS_DB;
    const reverse = -forward + 2 * trueLoss;
    return direction === 'reverse' ? reverse : forward;
  }

  const fromWavelengthTable = readWavelengthTriple(event.lossDbByWavelength, key);
  if (fromWavelengthTable !== null) return fromWavelengthTable;

  if (event.kind === 'splitter' && event.lossDb === undefined) {
    const entry = network.splitterLadder.find((l) => l.ratio === event.splitRatio);
    if (!entry) throw new Error(`Splitter event ${event.id}: split ratio "${event.splitRatio}" not found in network splitterLadder`);
    return entry.nominalLossDb;
  }

  return event.lossDb ?? 0;
}
