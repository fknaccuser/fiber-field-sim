/** Street, sidewalk, parkway, lots, desert scrub, locate marks; buried cable routes; OTDR trace markers. */
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import type { UiActionEvent } from '../../../session/runner';
import type { SpanMark } from '../../map/mapOverlay';
import { HOUSE_Z, LOT_FRONT_Z, PARKWAY_Z, pointAlongRoute, SIDEWALK_Z, STREET_HALF_WIDTH, TRENCH_Z, type CableRoute, type SceneLayout, type Vec3 } from '../sceneLayout';
import { Box, MARK_COLOR, PALETTE, TUBE_COLORS } from './common';

/**
 * The parkway strip with a rectangular bite taken out around every handhole, so an open pit
 * is a hole you can see down into rather than a rim sitting on unbroken turf. Returns
 * [centreX, centreZ, width, depth] rectangles covering the strip minus those bites.
 */
export function turfPatches(xMin: number, xMax: number, z0: number, z1: number, holes: Array<{ x: number; halfW: number; z: number; halfD: number }>): Array<[number, number, number, number]> {
  const sorted = [...holes].sort((a, b) => a.x - b.x);
  const out: Array<[number, number, number, number]> = [];
  let cursor = xMin;
  for (const h of sorted) {
    const left = h.x - h.halfW;
    const right = h.x + h.halfW;
    if (left > cursor) out.push([(cursor + left) / 2, (z0 + z1) / 2, left - cursor, z1 - z0]);
    // Fore and aft of the opening, still within the strip.
    const front = h.z - h.halfD;
    const back = h.z + h.halfD;
    if (front > z0) out.push([h.x, (z0 + front) / 2, right - left, front - z0]);
    if (z1 > back) out.push([h.x, (back + z1) / 2, right - left, z1 - back]);
    cursor = Math.max(cursor, right);
  }
  if (xMax > cursor) out.push([(cursor + xMax) / 2, (z0 + z1) / 2, xMax - cursor, z1 - z0]);
  return out.filter(([, , w, d]) => w > 0.01 && d > 0.01);
}

export function Ground({ layout, xray, decorated, locateMarkXs, holeXs = [] }: { layout: SceneLayout; xray: boolean; decorated: boolean; locateMarkXs: number[]; holeXs?: number[] }) {
  const { xMin, xMax } = layout.street;
  const len = xMax - xMin;
  const cx = (xMin + xMax) / 2;
  const opacity = xray ? 0.45 : 1;
  const dashes = useMemo(() => {
    const out: number[] = [];
    for (let x = xMin + 2; x < xMax; x += 6) out.push(x);
    return out;
  }, [xMin, xMax]);
  const scrub = useMemo(() => {
    const out: Array<[number, number, number]> = [];
    let s = 7;
    for (let i = 0; i < Math.min(40, len / 6); i++) {
      s = (s * 9301 + 49297) % 233280;
      const x = xMin + (s / 233280) * len;
      s = (s * 9301 + 49297) % 233280;
      const z = -9 - (s / 233280) * 14;
      s = (s * 9301 + 49297) % 233280;
      out.push([x, 0.35 + (s / 233280) * 0.4, z]);
    }
    return out;
  }, [xMin, len]);

  return (
    <group>
      {/* Asphalt, lane line, curbs. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, 0]}>
        <planeGeometry args={[len, STREET_HALF_WIDTH * 2]} />
        <meshStandardMaterial color={PALETTE.asphalt} roughness={1} transparent={xray} opacity={opacity} />
      </mesh>
      {dashes.map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, 0]}>
          <planeGeometry args={[2.2, 0.14]} />
          <meshBasicMaterial color={PALETTE.laneLine} />
        </mesh>
      ))}
      <Box size={[len, 0.14, 0.3]} position={[cx, 0.07, STREET_HALF_WIDTH + 0.15]} color={PALETTE.curb} opacity={xray ? opacity : undefined} />
      <Box size={[len, 0.14, 0.3]} position={[cx, 0.07, -STREET_HALF_WIDTH - 0.15]} color={PALETTE.curb} opacity={xray ? opacity : undefined} />
      {/* Sidewalk, parkway strip, lot ground. */}
      {/* The parkway and sidewalk sit just above the lot grade -- low enough that a flush
          handhole rim, a pedestal pad and a cabinet pad all still read as sitting on them. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.05, (SIDEWALK_Z[0] + SIDEWALK_Z[1]) / 2]}>
        <planeGeometry args={[len, SIDEWALK_Z[1] - SIDEWALK_Z[0]]} />
        <meshStandardMaterial color={PALETTE.sidewalk} roughness={1} transparent={xray} opacity={opacity} />
      </mesh>
      {turfPatches(xMin, xMax, PARKWAY_Z[0], PARKWAY_Z[1], holeXs.map((x) => ({ x, halfW: 0.78, z: TRENCH_Z, halfD: 0.44 }))).map(([px, pz, w, d], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[px, 0.03, pz]}>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color={PALETTE.grass} roughness={1} transparent={xray} opacity={opacity} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.0, LOT_FRONT_Z + 14]}>
        <planeGeometry args={[len, 28]} />
        <meshStandardMaterial color={PALETTE.dirt} roughness={1} transparent={xray} opacity={opacity} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.0, -STREET_HALF_WIDTH - 14]}>
        <planeGeometry args={[len, 28]} />
        <meshStandardMaterial color={PALETTE.dirt} roughness={1} transparent={xray} opacity={opacity} />
      </mesh>
      {/* Back-fence line behind the lots. */}
      <Box size={[len, 1.6, 0.1]} position={[cx, 0.8, HOUSE_Z + 8]} color={'#a08562'} />
      {decorated &&
        scrub.map(([x, r, z], i) => (
          <mesh key={i} position={[x, r * 0.6, z]}>
            <sphereGeometry args={[r, 7, 5]} />
            <meshStandardMaterial color={PALETTE.scrub} roughness={1} />
          </mesh>
        ))}
      {/* DigAlert marks: orange paint along the trench line in front of a site with an open work order, plus a flag. */}
      {locateMarkXs.map((x) => (
        <group key={x}>
          {[-3, -1.5, 0, 1.5, 3].map((dx) => (
            <mesh key={dx} rotation={[-Math.PI / 2, 0, 0]} position={[x + dx, 0.11, TRENCH_Z]}>
              <planeGeometry args={[1.0, 0.12]} />
              <meshBasicMaterial color={PALETTE.marker} />
            </mesh>
          ))}
          <mesh position={[x + 3.6, 0.5, TRENCH_Z]}>
            <cylinderGeometry args={[0.01, 0.01, 0.8, 6]} />
            <meshBasicMaterial color={'#888'} />
          </mesh>
          <Box size={[0.001, 0.12, 0.18]} position={[x + 3.6, 0.85, TRENCH_Z + 0.09]} color={PALETTE.marker} />
        </group>
      ))}
    </group>
  );
}

function toTuple(p: Vec3): [number, number, number] {
  return [p.x, p.y, p.z];
}

export function CableRoutes({ layout, spanMarks, tracedSpanIds, xray }: { layout: SceneLayout; spanMarks: Record<string, SpanMark | null>; tracedSpanIds: Set<string>; xray: boolean }) {
  return (
    <group>
      {layout.routes.map((r) => {
        const mark = spanMarks[r.spanId];
        const traced = tracedSpanIds.has(r.spanId);
        const strandColor = r.span.strands?.[0] ? TUBE_COLORS[r.span.strands[0].tubeColor] : null;
        const color = traced ? '#ffb000' : mark ? MARK_COLOR[mark] : strandColor ?? (r.kind === 'drop' ? '#1a1a1a' : r.kind === 'feeder' ? '#101418' : '#23282e');
        const buried = !xray && !traced && !mark;
        return <Line key={r.spanId} points={r.points.map(toTuple)} color={color} lineWidth={traced || mark ? 3 : r.kind === 'feeder' ? 2.2 : 1.4} transparent opacity={buried ? 0.0 : 1} dashed={mark === 'claimed'} dashSize={0.6} gapSize={0.3} depthTest={!(traced || mark || xray)} />;
      })}
    </group>
  );
}

/** Maps the last OTDR shot's detected events onto the physical route the light actually took, in path order from the access node. */
export function TraceMarkers({ layout, shot }: { layout: SceneLayout; shot: Extract<UiActionEvent, { type: 'otdr-shot' }> }) {
  const markers = useMemo(() => {
    const routeById = new Map(layout.routes.map((r) => [r.spanId, r]));
    const out: Array<{ p: Vec3; kind: string; distance: number }> = [];
    let node = shot.access.accessNodeId;
    const spansInOrder: Array<{ route: CableRoute; reversed: boolean }> = [];
    for (const id of shot.pathSpanIds) {
      const route = routeById.get(id);
      if (!route) continue;
      const reversed = route.span.toNodeId === node;
      spansInOrder.push({ route, reversed });
      node = reversed ? route.span.fromNodeId : route.span.toNodeId;
    }
    for (const ev of shot.events) {
      if (ev.kind === 'launch') continue;
      let d = ev.distanceMeters - shot.settings.launchCableMeters;
      if (d < 0) continue;
      for (const { route, reversed } of spansInOrder) {
        const len = route.span.lengthMeters;
        if (d <= len) {
          out.push({ p: pointAlongRoute(route, reversed ? len - d : d), kind: ev.kind, distance: ev.distanceMeters });
          break;
        }
        d -= len;
      }
    }
    return out;
  }, [layout, shot]);
  return (
    <group>
      {markers.map((m, i) => (
        <group key={i} position={[m.p.x, Math.max(m.p.y, -0.5) + 0.6, m.p.z]}>
          <mesh>
            <sphereGeometry args={[0.22, 12, 12]} />
            <meshStandardMaterial color={m.kind === 'end-of-fiber' ? '#ff4d4d' : m.kind === 'reflective' ? '#ffb000' : '#5ab0ff'} emissive={m.kind === 'end-of-fiber' ? '#ff4d4d' : '#ffb000'} emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0, -0.45, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.9, 6]} />
            <meshBasicMaterial color={'#ffb000'} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
