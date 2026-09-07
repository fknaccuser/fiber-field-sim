/**
 * Which way you are facing.
 *
 * The camera pose is already a pure function of mode and selection, so the heading can be
 * derived here without asking the renderer anything — no GL round-trip, no frame timing.
 *
 * World convention (from sceneLayout): +z is north, across the street toward the houses,
 * and +x is east along the street. Bearings are the ones you would read off a real
 * compass: 0 at north, increasing clockwise through east.
 */
import type { CameraPose } from './camera';

export const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Cardinal = (typeof CARDINALS)[number];

/** Compass bearing the camera is looking along, in degrees clockwise from north. */
export function bearingOf(pose: CameraPose): number {
  const dx = pose.target.x - pose.position.x;
  const dz = pose.target.z - pose.position.z;
  // Straight down (overview) has no meaningful heading on the ground plane; call it north
  // rather than letting floating-point noise spin the needle.
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 0;
  const deg = (Math.atan2(dx, dz) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Nearest of the eight points, for the label under the needle. */
export function cardinalOf(bearing: number): Cardinal {
  const i = Math.round((((bearing % 360) + 360) % 360) / 45) % 8;
  return CARDINALS[i];
}

/** Bearings are read as three digits in the field: 007°, 095°, 271°. */
export function formatBearing(bearing: number): string {
  return `${String(Math.round(((bearing % 360) + 360) % 360) % 360).padStart(3, '0')}°`;
}
