/**
 * Turning a laid route into something three.js can draw.
 *
 * Separate from `trayModels.tsx` for a plain reason: a file that exports both components and
 * plain functions breaks fast refresh, and this is the only plain function in there. It is
 * also the piece most worth keeping out of a component — a ribbon is a swept strip, and the
 * sweep is arithmetic.
 */
import * as THREE from 'three';
import type { Vec2 } from '../../operations/dressing';

/** Scene units per millimetre. A tray is a couple of hundred millimetres and a few units wide. */
export const MM = 0.01;

/**
 * The ribbon: a flat strip swept along the laid route.
 *
 * Built by hand rather than with a tube, because ribbon is flat and lies flat, and how it
 * sits in a tray is half of why dressing matters. A round tube would look like loose fibre
 * and teach the wrong shape.
 */
export function ribbonGeometry(points: readonly Vec2[], widthMm = 6): THREE.BufferGeometry | null {
  if (points.length < 2) return null;
  const half = (widthMm / 2) * MM;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // Perpendicular in the tray plane.
    const nx = -dz * half;
    const nz = dx * half;
    const x = points[i].x * MM;
    const z = points[i].z * MM;
    positions.push(x + nx, 0, z + nz, x - nx, 0, z - nz);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
