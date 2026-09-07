import { createRng, deriveSeed } from '../../world';

/** IEC 61300-3-35 single-mode zones, radii in micrometres from the fiber axis. */
export const ZONE_RADII_UM = { core: 25, cladding: 120, adhesive: 130, contact: 250 } as const;

export type ZoneId = keyof typeof ZONE_RADII_UM;

export const ZONE_ORDER: ZoneId[] = ['core', 'cladding', 'adhesive', 'contact'];

/** What "passable" means per zone, shown as a legend beside the image. */
export const ZONE_LEGEND: Record<ZoneId, { letter: string; label: string; limit: string }> = {
  core: { letter: 'A', label: 'Core', limit: 'No defects, no scratches' },
  cladding: { letter: 'B', label: 'Cladding', limit: 'Few small particles, no wide scratches' },
  adhesive: { letter: 'C', label: 'Adhesive', limit: 'Not graded' },
  contact: { letter: 'D', label: 'Contact', limit: 'Small particles tolerated' },
};

export interface ZoneCounts {
  core: number;
  cladding: number;
  adhesive: number;
  contact: number;
}

export interface EndFaceDefect {
  zone: ZoneId;
  kind: 'particle' | 'scratch' | 'oil';
  /** Micrometres from the fiber axis. */
  x: number;
  y: number;
  /** Particle radius, scratch half-length, or oil-film radius, in micrometres. */
  size: number;
  /** Scratch orientation / film elongation, radians. */
  angle: number;
  /** 0..1 brightness or opacity. */
  intensity: number;
  /** Scratch curvature, -1..1. */
  bend: number;
  /** Twelve radial multipliers giving an oil film its irregular outline. */
  lobes: number[];
  /** True for the defects the instrument counted toward the zone totals. */
  counted: boolean;
}

export interface EndFaceModel {
  grade: 'pass' | 'fail';
  zones: ZoneCounts;
  defects: EndFaceDefect[];
}

export interface EndFaceInput {
  seed: number;
  spanId: string;
  eventId: string;
  grade: 'pass' | 'fail';
  zones: ZoneCounts;
}

function innerRadius(zone: ZoneId): number {
  const i = ZONE_ORDER.indexOf(zone);
  return i === 0 ? 0 : ZONE_RADII_UM[ZONE_ORDER[i - 1]];
}

export function zoneOf(radiusUm: number): ZoneId | null {
  for (const zone of ZONE_ORDER) {
    if (radiusUm <= ZONE_RADII_UM[zone]) return zone;
  }
  return null;
}

/**
 * Deterministic per-connector picture: the same connector always looks the same under the
 * scope, and every counted defect lands inside the zone the instrument attributed it to.
 * Reads nothing but the instrument's own reported result.
 */
export function buildEndFaceModel(input: EndFaceInput): EndFaceModel {
  const rng = createRng(deriveSeed(input.seed, 'scope-endface', input.spanId, input.eventId));
  const defects: EndFaceDefect[] = [];

  const lobes = () => Array.from({ length: 12 }, () => 0.7 + rng.next() * 0.6);

  const placeIn = (zone: ZoneId, margin: number) => {
    const lo = innerRadius(zone) + margin;
    const hi = ZONE_RADII_UM[zone] - margin;
    const r = lo + rng.next() * Math.max(hi - lo, 0);
    const a = rng.next() * Math.PI * 2;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  };

  for (const zone of ZONE_ORDER) {
    const count = input.zones[zone];
    for (let i = 0; i < count; i++) {
      const scratch = zone !== 'contact' && rng.next() < 0.3;
      const bigger = zone === 'core' ? 1.6 : 1;
      const size = scratch ? (12 + rng.next() * 28) * bigger : (1.5 + rng.next() * 4) * bigger;
      const { x, y } = placeIn(zone, Math.min(size, 6));
      defects.push({
        zone,
        kind: scratch ? 'scratch' : 'particle',
        x,
        y,
        size,
        angle: rng.next() * Math.PI,
        intensity: 0.65 + rng.next() * 0.35,
        bend: rng.next() * 2 - 1,
        lobes: [],
        counted: true,
      });
    }
  }

  if (input.grade === 'fail' && input.zones.core >= 3) {
    const { x, y } = placeIn('cladding', 20);
    defects.push({ zone: 'cladding', kind: 'oil', x: x * 0.5, y: y * 0.5, size: 60 + rng.next() * 50, angle: rng.next() * Math.PI, intensity: 0.22 + rng.next() * 0.12, bend: 0, lobes: lobes(), counted: false });
  }

  const dust = rng.int(0, 3);
  for (let i = 0; i < dust; i++) {
    const { x, y } = placeIn('contact', 4);
    defects.push({ zone: 'contact', kind: 'particle', x, y, size: 0.6 + rng.next() * 0.8, angle: 0, intensity: 0.3 + rng.next() * 0.3, bend: 0, lobes: [], counted: false });
  }

  return { grade: input.grade, zones: input.zones, defects };
}
