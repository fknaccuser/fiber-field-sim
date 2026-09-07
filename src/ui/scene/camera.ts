/**
 * Camera framing for the plant scene. Pure: given a layout, a mode, and what is selected,
 * it returns where the camera should sit and look. The scene component eases toward
 * whatever this returns, so every mode change and every selection is one animated move.
 */
import type { Placement, PlacementKind, SceneLayout, Vec3 } from './sceneLayout';

export type CameraMode = 'field' | 'equipment' | 'cutaway' | 'overview' | 'trace';

export const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  field: 'Field',
  equipment: 'Equipment',
  cutaway: 'Cutaway',
  overview: 'Overview',
  trace: 'Trace',
};

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

/** Eye height of a standing technician, in scene units (metres). */
export const EYE_HEIGHT = 1.7;

/** How close the equipment view sits to each kind of object, and what it looks at. */
const FRAMING: Record<PlacementKind, { distance: number; height: number; targetY: number }> = {
  pop: { distance: 16, height: 6, targetY: 2.5 },
  // The cabinet is 1.8 m on a plinth; stand back far enough to see the cap and the
  // port field at once, at about chest height.
  fdh: { distance: 3.0, height: 1.75, targetY: 1.25 },
  splitter: { distance: 1.9, height: 1.6, targetY: 1.35 },
  // Steep enough to actually look down into the pit rather than across the rim.
  handhole: { distance: 1.7, height: 2.7, targetY: -0.4 },
  pedestal: { distance: 1.6, height: 1.1, targetY: 0.65 },
  house: { distance: 14, height: 5, targetY: 2 },
  nid: { distance: 1.1, height: 1.45, targetY: 1.35 },
  ont: { distance: 1.0, height: 1.35, targetY: 1.25 },
  yard: { distance: 18, height: 7, targetY: 1.5 },
  device: { distance: 3, height: 2, targetY: 1 },
};

/** Cutaway pulls in tighter still and drops to the object's own centre — inside the enclosure. */
const CUTAWAY_SCALE = 0.55;

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** Frames one placement from the street side (negative z), which is where a technician stands. */
export function frame(placement: Placement, mode: 'equipment' | 'cutaway'): CameraPose {
  const f = FRAMING[placement.kind];
  const scale = mode === 'cutaway' ? CUTAWAY_SCALE : 1;
  const p = placement.position;
  // NIDs and ONTs sit on a side wall facing -x; approach them from that side rather than from the street.
  const sideApproach = placement.kind === 'nid' || placement.kind === 'ont';
  const offset: Vec3 = sideApproach
    ? { x: -f.distance * scale, y: f.height * scale + (mode === 'cutaway' ? 0 : 0.1), z: -f.distance * scale * 0.35 }
    : { x: 0, y: f.height * scale, z: -f.distance * scale };
  return { position: add({ x: p.x, y: 0, z: p.z }, offset), target: { x: p.x, y: p.y + f.targetY * (mode === 'cutaway' ? 0.9 : 1), z: p.z } };
}

/** Standing in the street at eye height, looking at whatever is selected (or down the block). */
export function fieldPose(layout: SceneLayout, focus: Placement | null): CameraPose {
  if (!focus) {
    const cx = (layout.street.xMin + layout.street.xMax) / 2;
    return { position: { x: cx - 12, y: EYE_HEIGHT, z: -1.5 }, target: { x: cx + 8, y: 1.2, z: 6 } };
  }
  const p = focus.position;
  const standOff = focus.kind === 'house' || focus.kind === 'nid' || focus.kind === 'ont' ? 9 : 5;
  return { position: { x: p.x - standOff * 0.5, y: EYE_HEIGHT, z: p.z - standOff }, target: { x: p.x, y: Math.max(0.6, p.y + 0.6), z: p.z } };
}

export function overviewPose(layout: SceneLayout): CameraPose {
  const cx = (layout.street.xMin + layout.street.xMax) / 2;
  const span = layout.street.xMax - layout.street.xMin;
  return { position: { x: cx - span * 0.1, y: span * 0.26 + 14, z: -span * 0.24 - 18 }, target: { x: cx, y: 0, z: 8 } };
}

/** Frames the whole traced route, so an OTDR shot's markers are all on screen at once. */
export function tracePose(layout: SceneLayout, tracedSpanIds: string[]): CameraPose {
  const pts = layout.routes.filter((r) => tracedSpanIds.includes(r.spanId)).flatMap((r) => r.points);
  if (pts.length === 0) return overviewPose(layout);
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const cx = (minX + maxX) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const width = Math.max(20, maxX - minX);
  return { position: { x: cx - width * 0.1, y: width * 0.36 + 10, z: cz - width * 0.34 - 14 }, target: { x: cx, y: 0, z: cz } };
}

export function poseFor(mode: CameraMode, layout: SceneLayout, focus: Placement | null, tracedSpanIds: string[]): CameraPose {
  switch (mode) {
    case 'overview':
      return overviewPose(layout);
    case 'trace':
      return tracePose(layout, tracedSpanIds);
    case 'field':
      return fieldPose(layout, focus);
    case 'equipment':
    case 'cutaway':
      return focus ? frame(focus, mode) : fieldPose(layout, null);
  }
}

/** Which modes make sense right now — a cutaway needs something openable selected, a trace needs a shot. */
export function availableModes(focus: Placement | null, hasTrace: boolean): CameraMode[] {
  const modes: CameraMode[] = ['field', 'overview'];
  if (focus) modes.splice(1, 0, 'equipment');
  if (focus && CUTAWAY_KINDS.has(focus.kind)) modes.splice(2, 0, 'cutaway');
  if (hasTrace) modes.push('trace');
  return modes;
}

export const CUTAWAY_KINDS = new Set<PlacementKind>(['fdh', 'handhole', 'nid', 'ont', 'splitter', 'pedestal', 'pop']);
