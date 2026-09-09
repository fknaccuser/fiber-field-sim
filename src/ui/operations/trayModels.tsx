/**
 * The terminal and the tray, as objects.
 *
 * Original FiberOps forms, not anybody's CAD: a splice tray is a shallow moulded box with an
 * entry slot at one end, two radius limiters, retention fingers down both channels and a
 * holder rail up the middle, and that shape is what the job is about. The closure around it
 * changes how you stand and where the slack goes, so it is modelled too — inline case, dome,
 * or a cabinet bay — but only as far as it changes the work.
 *
 * Everything is in tray millimetres and scaled once on the way into the scene, so the model
 * and `dressing.ts` are measuring the same object in the same units. A model drawn in its own
 * units beside a judge working in millimetres is how a bench ends up grading a shape the
 * trainee never saw.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Anchor, TrayGeometry, Vec2 } from '../../operations/dressing';
import type { ClosureForm } from '../../operations/catalog';
import { MM, ribbonGeometry } from './trayGeometry';

const TRAY_WALL_MM = 8;
const TRAY_DEPTH_MM = 20;

// Light enough to read against this app's very dark chrome. A tray you have to squint at is
// not a tray you can dress: the whole task is judged by eye, so the shape has to be visible
// before anything else about it matters.
const SHELL = new THREE.MeshStandardMaterial({ color: '#3d4750', roughness: 0.85, metalness: 0.05 });
const MOULDING = new THREE.MeshStandardMaterial({ color: '#6c7b8a', roughness: 0.65, metalness: 0.08 });
const LIMITER = new THREE.MeshStandardMaterial({ color: '#8a99a8', roughness: 0.5, side: THREE.DoubleSide });
const HOLDER = new THREE.MeshStandardMaterial({ color: '#4a545f', roughness: 0.75 });
const FINGER = new THREE.MeshStandardMaterial({ color: '#a8b6c3', roughness: 0.45 });

export function Ribbon({ points, color, lifted = 0 }: { points: readonly Vec2[]; color: string; lifted?: number }) {
  const geometry = useMemo(() => ribbonGeometry(points), [points]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} position={[0, (3 + lifted) * MM, 0]}>
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** A moulded retention finger: a low arch the ribbon is meant to pass under. */
function Finger({ at }: { at: Vec2 }) {
  return (
    <group position={[at.x * MM, 0, at.z * MM]}>
      {[-5, 5].map((offset) => (
        <mesh key={offset} position={[0, 5 * MM, offset * MM]} material={FINGER}>
          <boxGeometry args={[4 * MM, 10 * MM, 2.5 * MM]} />
        </mesh>
      ))}
      <mesh position={[0, 10 * MM, 0]} material={FINGER}>
        <boxGeometry args={[4 * MM, 2.5 * MM, 12 * MM]} />
      </mesh>
    </group>
  );
}

export function TrayModel({ geometry, highlight }: { geometry: TrayGeometry; highlight: Anchor[] }) {
  const L = geometry.lengthMm;
  const W = geometry.widthMm;
  const lit = new Set(highlight.map((a) => a.id));

  return (
    <group>
      {/* Floor. */}
      <mesh position={[(L / 2) * MM, -1 * MM, 0]} material={SHELL}>
        <boxGeometry args={[L * MM, 2 * MM, W * MM]} />
      </mesh>

      {/* Long walls. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(L / 2) * MM, (TRAY_DEPTH_MM / 2) * MM, (side * (W / 2 - TRAY_WALL_MM / 2)) * MM]} material={MOULDING}>
          <boxGeometry args={[L * MM, TRAY_DEPTH_MM * MM, TRAY_WALL_MM * MM]} />
        </mesh>
      ))}

      {/* Far end wall, solid. */}
      <mesh position={[(L - TRAY_WALL_MM / 2) * MM, (TRAY_DEPTH_MM / 2) * MM, 0]} material={MOULDING}>
        <boxGeometry args={[TRAY_WALL_MM * MM, TRAY_DEPTH_MM * MM, W * MM]} />
      </mesh>

      {/* Entry end: wall either side of the slot. The slot is not centred -- it sits over the
          routing channel, so the ribbon comes in already running the way it has to go. This
          is the hole, and it is the reason the wall is not one box. */}
      {(() => {
        const entry = geometry.anchors.find((a) => a.kind === 'entry');
        const slotZ = entry ? entry.at.z : 0;
        const slotHalf = 11;
        const segments: Array<[number, number]> = [
          [-W / 2, slotZ - slotHalf],
          [slotZ + slotHalf, W / 2],
        ];
        return segments.map(([from, to], i) => {
          const span = to - from;
          if (span <= 0) return null;
          return (
            <mesh key={i} position={[(TRAY_WALL_MM / 2) * MM, (TRAY_DEPTH_MM / 2) * MM, ((from + to) / 2) * MM]} material={MOULDING}>
              <boxGeometry args={[TRAY_WALL_MM * MM, TRAY_DEPTH_MM * MM, span * MM]} />
            </mesh>
          );
        });
      })()}

      {/* Radius limiters. Their radius is the tray's minimum: follow the moulding and the
          stored bend is legal without anybody measuring it. */}
      {geometry.anchors.filter((a) => a.kind === 'limiter').map((a) => (
        <mesh key={a.id} position={[a.at.x * MM, 6 * MM, a.at.z * MM]} material={LIMITER}>
          <cylinderGeometry args={[geometry.minBendRadiusMm * MM, geometry.minBendRadiusMm * MM, 12 * MM, 32, 1, true]} />
        </mesh>
      ))}

      {/* Retention fingers. */}
      {geometry.anchors.filter((a) => a.kind === 'finger').map((a) => <Finger key={a.id} at={a.at} />)}

      {/* Holder rail. */}
      <mesh position={[(L / 2) * MM, 2 * MM, 0]} material={HOLDER}>
        <boxGeometry args={[(L - 60) * MM, 4 * MM, 26 * MM]} />
      </mesh>
      {geometry.anchors.filter((a) => a.kind === 'holder').map((a) => (
        <mesh key={a.id} position={[a.at.x * MM, 5 * MM, a.at.z * MM]}>
          <boxGeometry args={[5 * MM, 6 * MM, 22 * MM]} />
          <meshStandardMaterial color={lit.has(a.id) ? '#3be8d8' : '#6d7a86'} roughness={0.6} emissive={lit.has(a.id) ? '#0d5c55' : '#000000'} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The terminal the tray came out of.
 *
 * Context, not detail: an inline case is re-entered lying down in a handhole, a dome stands
 * on a pedestal with all its slack managed at the base, and a cabinet bay is worked standing
 * up. That is the difference the trainee can feel; the fasteners are not.
 */
export function ClosureShell({ form, geometry }: { form: ClosureForm | 'cabinet'; geometry: TrayGeometry }) {
  const L = geometry.lengthMm;
  const W = geometry.widthMm;

  if (form === 'cabinet') {
    return (
      <group>
        <mesh position={[(L / 2) * MM, -8 * MM, 0]} material={SHELL}>
          <boxGeometry args={[(L + 90) * MM, 6 * MM, (W + 90) * MM]} />
        </mesh>
        {/* Bay uprights: you work this one standing up, with the tray swung out on its hinge. */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[(L / 2) * MM, 60 * MM, (side * (W / 2 + 42)) * MM]} material={SHELL}>
            <boxGeometry args={[(L + 90) * MM, 140 * MM, 6 * MM]} />
          </mesh>
        ))}
      </group>
    );
  }

  if (form === 'dome') {
    return (
      <group position={[(L / 2) * MM, 0, 0]}>
        <mesh position={[0, -14 * MM, 0]} material={SHELL}>
          <cylinderGeometry args={[(W / 2 + 46) * MM, (W / 2 + 52) * MM, 20 * MM, 40]} />
        </mesh>
        {/* The dome itself, drawn open — you are looking into it. */}
        <mesh position={[0, 6 * MM, 0]} material={SHELL}>
          <cylinderGeometry args={[(W / 2 + 46) * MM, (W / 2 + 46) * MM, 14 * MM, 40, 1, true]} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh position={[(L / 2) * MM, -10 * MM, 0]} material={SHELL}>
        <boxGeometry args={[(L + 70) * MM, 12 * MM, (W + 70) * MM]} />
      </mesh>
      {/* Inline case: low sides, opened flat, the way it lies in a handhole. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(L / 2) * MM, 8 * MM, (side * (W / 2 + 32)) * MM]} material={SHELL}>
          <boxGeometry args={[(L + 70) * MM, 36 * MM, 6 * MM]} />
        </mesh>
      ))}
    </group>
  );
}
