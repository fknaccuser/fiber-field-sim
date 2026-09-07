import { useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import type { FiberTubeColor } from '../../../world';
import type { NodeMark, SpanMark } from '../../map/mapOverlay';

export const PALETTE = {
  asphalt: '#2f343b',
  laneLine: '#c9b24a',
  sidewalk: '#a7a49b',
  curb: '#8f8c84',
  grass: '#8c9a5b',
  dirt: '#a58c69',
  gravel: '#8b8578',
  scrub: '#6f7a45',
  stucco: ['#d9c9b0', '#e2d5c0', '#cbb69a', '#d8cbb8', '#e8dcc8'],
  roof: '#8b5a44',
  trim: '#5b5048',
  glass: '#6f8fa8',
  garage: '#cfc6b8',
  cabinet: '#7f8c86',
  cabinetDark: '#5f6a66',
  pad: '#9c9a93',
  pedestal: '#5f7a5a',
  lid: '#8d8d86',
  lidMark: '#5a5a55',
  pit: '#3a2f26',
  closure: '#1c1d20',
  closureCap: '#7d8086',
  tray: '#c8cbd0',
  nid: '#b7bcc1',
  nidInner: '#dfe3e6',
  ont: '#e9e9e6',
  ontDark: '#2a2d31',
  rack: '#22262b',
  chassis: '#3b4047',
  card: '#4b525a',
  pop: '#c9c3b7',
  popTrim: '#7a746c',
  door: '#4a4f57',
  truck: '#f0f0ee',
  truckStripe: '#d64545',
  tire: '#1a1a1a',
  fiberYellow: '#e5c531',
  marker: '#ff7a00',
  trunk: '#6b4a32',
  leaf: '#4f7a3a',
  conduit: '#8f8f8f',
} as const;

export const MARK_COLOR: Record<NodeMark | SpanMark, string> = {
  claimed: '#ff9d00',
  alarm: '#ff4d4d',
  current: '#37d67a',
  tested: '#5ab0ff',
  visited: '#8a96a6',
};

export const TUBE_COLORS: Record<FiberTubeColor, string> = {
  blue: '#2f63d6',
  orange: '#f07a1a',
  green: '#2fa64a',
  brown: '#7a4b2a',
  slate: '#6f7b86',
  white: '#f2f2f2',
  red: '#d83333',
  black: '#1c1c1c',
  yellow: '#f2d12c',
  violet: '#8a4fd6',
  rose: '#e88bb0',
  aqua: '#3ac7d9',
};

export const LED_COLOR = { ok: '#37d67a', warn: '#ffb000', alarm: '#ff4d4d', off: '#2a2f36' } as const;

/** A group whose rotation eases toward `open ? openAngle : closedAngle` around one axis, requesting frames only while it moves (frameloop="demand"-friendly). */
export function Hinge({ open, axis, openAngle, closedAngle = 0, speed = 5, position, children }: { open: boolean; axis: 'x' | 'y' | 'z'; openAngle: number; closedAngle?: number; speed?: number; position?: [number, number, number]; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const target = open ? openAngle : closedAngle;
    const cur = g.rotation[axis];
    const diff = target - cur;
    if (Math.abs(diff) < 0.003) {
      if (cur !== target) g.rotation[axis] = target;
      return;
    }
    g.rotation[axis] = cur + diff * Math.min(1, dt * speed);
    invalidate();
  });
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  );
}

/** A group that eases its position between two offsets (sliding lids, lifted covers). */
export function Slide({ open, from, to, speed = 5, children }: { open: boolean; from: [number, number, number]; to: [number, number, number]; speed?: number; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const t = open ? to : from;
    const dx = t[0] - g.position.x;
    const dy = t[1] - g.position.y;
    const dz = t[2] - g.position.z;
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 0.004) {
      g.position.set(t[0], t[1], t[2]);
      return;
    }
    const k = Math.min(1, dt * speed);
    g.position.set(g.position.x + dx * k, g.position.y + dy * k, g.position.z + dz * k);
    invalidate();
  });
  return (
    <group ref={ref} position={from}>
      {children}
    </group>
  );
}

export function Box({ size, position, color, rotation, emissive, opacity, roughness = 0.8, metalness = 0.05, onClick }: { size: [number, number, number]; position?: [number, number, number]; rotation?: [number, number, number]; color: string; emissive?: string; opacity?: number; roughness?: number; metalness?: number; onClick?: (e: { stopPropagation(): void }) => void }) {
  return (
    <mesh position={position} rotation={rotation} onClick={onClick}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? 0.6 : 0} roughness={roughness} metalness={metalness} transparent={opacity !== undefined} opacity={opacity ?? 1} />
    </mesh>
  );
}

export function Led3D({ position, status, size = 0.012 }: { position: [number, number, number]; status: keyof typeof LED_COLOR; size?: number }) {
  const c = LED_COLOR[status];
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 10, 10]} />
      <meshStandardMaterial color={c} emissive={status === 'off' ? '#000000' : c} emissiveIntensity={status === 'off' ? 0 : 1.6} roughness={0.3} />
    </mesh>
  );
}

/** Ground highlight under the current location / selected object. */
export function GroundRing({ position, color, radius = 1.2 }: { position: [number, number, number]; color: string; radius?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[position[0], 0.02, position[2]]}>
      <ringGeometry args={[radius, radius + 0.18, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} />
    </mesh>
  );
}

/** An annotation, not part of the scene: it keeps a constant readable size instead of scaling with distance, so walking up to an enclosure does not turn its name into a billboard. */
export function Label({ position, text, accent, small }: { position: [number, number, number]; text: string; accent?: string; small?: boolean }) {
  return (
    <Html center position={position} style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }} zIndexRange={[20, 0]}>
      <div style={{ fontSize: small ? 10 : 11, color: '#e8eef5', background: 'rgba(11,15,20,0.8)', padding: '2px 7px', borderRadius: 4, border: `1px solid ${accent ?? '#2a3441'}`, fontFamily: 'system-ui, sans-serif' }}>{text}</div>
    </Html>
  );
}

export function Tube({ points, radius = 0.02, color }: { points: Array<[number, number, number]>; radius?: number; color: string }) {
  return (
    <>
      {points.slice(1).map((p, i) => {
        const a = points[i];
        const dx = p[0] - a[0];
        const dy = p[1] - a[1];
        const dz = p[2] - a[2];
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-4) return null;
        const mid: [number, number, number] = [(a[0] + p[0]) / 2, (a[1] + p[1]) / 2, (a[2] + p[2]) / 2];
        // Orient a y-axis cylinder along the segment.
        const yaw = Math.atan2(dx, dz);
        const pitch = Math.acos(Math.max(-1, Math.min(1, dy / len)));
        return (
          <group key={i} position={mid} rotation={[0, yaw, 0]}>
            <mesh rotation={[pitch, 0, 0]}>
              <cylinderGeometry args={[radius, radius, len, 8]} />
              <meshStandardMaterial color={color} roughness={0.6} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
