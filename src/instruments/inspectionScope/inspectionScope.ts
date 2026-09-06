/**
 * Fiber endface inspection scope: IEC 61300-3-35-style pass/fail on connector
 * cleanliness, by zone.
 */
import { createRng, deriveSeed, findSpan } from '../../world';
import type { WorldState } from '../../world';

export class NotAConnectorError extends Error {
  readonly code = 'NOT_A_CONNECTOR';
  readonly eventId: string;
  constructor(eventId: string) {
    super(`Fiber event ${eventId} is not a connector event`);
    this.name = 'NotAConnectorError';
    this.eventId = eventId;
  }
}

export interface InspectionResult {
  grade: 'pass' | 'fail';
  zones: { core: number; cladding: number; adhesive: number; contact: number };
  simulatedSeconds: 90;
}

const DIRTY_REFLECTANCE_FLOOR_DB = -35;
const DIRTY_REFLECTANCE_CEILING_DB = -14;

export function inspect(world: WorldState, spanId: string, eventId: string): InspectionResult {
  const span = findSpan(world, spanId);
  const ev = span.events.find((e) => e.id === eventId);
  if (!ev || (ev.kind !== 'connector-upc' && ev.kind !== 'connector-apc' && ev.kind !== 'connector-dirty')) {
    throw new NotAConnectorError(eventId);
  }

  const rng = createRng(deriveSeed(world.seed, 'inspection-scope', spanId, eventId));

  if (ev.kind === 'connector-dirty') {
    const r = ev.reflectanceDb ?? DIRTY_REFLECTANCE_FLOOR_DB;
    const t = Math.max(0, Math.min(1, (r - DIRTY_REFLECTANCE_FLOOR_DB) / (DIRTY_REFLECTANCE_CEILING_DB - DIRTY_REFLECTANCE_FLOOR_DB)));
    const coreDefects = Math.max(1, Math.round(1 + t * 4));
    return {
      grade: 'fail',
      zones: { core: coreDefects, cladding: rng.int(0, 2), adhesive: rng.int(0, 1), contact: rng.int(0, 2) },
      simulatedSeconds: 90,
    };
  }

  return { grade: 'pass', zones: { core: 0, cladding: 0, adhesive: 0, contact: rng.int(0, 2) }, simulatedSeconds: 90 };
}
