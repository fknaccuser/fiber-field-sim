/** Outside-plant and central-office equipment: POP + OLT rack, FDH cabinet, handhole + splice closure, NAP pedestal, truck yard. */
import { useLayoutEffect, useRef } from 'react';
import { Color, Matrix4, type InstancedMesh } from 'three';
import type { FiberSpan, NetworkDeviceConfig, TopologyNode } from '../../../world';
import type { Placement } from '../sceneLayout';
import { Box, GroundRing, Hinge, Label, Led3D, MARK_COLOR, PALETTE, Slide, Tube, TUBE_COLORS } from './common';

type Click = (e: { stopPropagation(): void }) => void;

function select(onSelect: (id: string) => void, id: string): Click {
  return (e) => {
    e.stopPropagation();
    onSelect(id);
  };
}

// --- POP / OLT ------------------------------------------------------------------------------

export function OltRack({ device, position, losPorts, onSelect, nodeId }: { device: NetworkDeviceConfig | undefined; position: [number, number, number]; losPorts: Set<string>; onSelect: (id: string) => void; nodeId: string }) {
  const ports = device?.ponPorts ?? [];
  return (
    <group position={position} onClick={select(onSelect, nodeId)}>
      <Box size={[0.62, 2.1, 0.9]} position={[0, 1.05, 0]} color={PALETTE.rack} roughness={0.6} metalness={0.3} />
      {/* Chassis with two line-card slots, controller, fan tray and power supplies. */}
      <Box size={[0.5, 0.36, 0.7]} position={[0, 1.55, 0.1]} color={PALETTE.chassis} metalness={0.4} />
      {[0, 1].map((slot) => (
        <group key={slot} position={[-0.14 + slot * 0.28, 1.55, 0.46]}>
          <Box size={[0.24, 0.3, 0.02]} color={PALETTE.card} metalness={0.5} />
          {Array.from({ length: 8 }).map((_, i) => {
            const port = ports[slot * 8 + i];
            const status = port ? (losPorts.has(port.id) ? 'alarm' : 'ok') : 'off';
            return (
              <group key={i} position={[-0.09 + (i % 4) * 0.06, 0.08 - Math.floor(i / 4) * 0.16, 0.012]}>
                <Box size={[0.03, 0.03, 0.01]} color={port ? '#1f8a3a' : '#2b3038'} />
                <Led3D position={[0, 0.03, 0.005]} status={status} size={0.007} />
              </group>
            );
          })}
        </group>
      ))}
      <Box size={[0.5, 0.12, 0.7]} position={[0, 1.24, 0.1]} color={PALETTE.card} />
      <Led3D position={[0.2, 1.24, 0.46]} status="ok" size={0.01} />
      <Box size={[0.5, 0.18, 0.7]} position={[0, 1.02, 0.1]} color={PALETTE.chassis} />
      {/* Fiber management panel and patch cords into the panel. */}
      <Box size={[0.5, 0.2, 0.7]} position={[0, 0.7, 0.1]} color={PALETTE.card} />
      {ports.map((p, i) => (
        <Tube key={p.id} points={[[-0.16 + i * 0.06, 1.4, 0.47], [-0.16 + i * 0.06, 1.05, 0.5], [-0.2 + i * 0.05, 0.8, 0.47]]} radius={0.006} color={PALETTE.fiberYellow} />
      ))}
    </group>
  );
}

export function PopBuilding({ placement, oltDevice, losPorts, selected, current, mark, open, onSelect }: { placement: Placement; oltDevice: NetworkDeviceConfig | undefined; losPorts: Set<string>; selected: boolean; current: boolean; mark: string | null; open: boolean; onSelect: (id: string) => void }) {
  const p = placement.position;
  const accent = current ? MARK_COLOR.current : selected ? '#ffffff' : mark ? MARK_COLOR[mark as keyof typeof MARK_COLOR] : undefined;
  return (
    <group position={[p.x, 0, p.z]}>
      {/* Concrete pad, hardened building, parapet, steel door, HVAC unit. */}
      <Box size={[24, 0.12, 16]} position={[0, 0.06, 0]} color={PALETTE.pad} />
      {/* Entrance and equipment face the approach side. */}
      <group rotation={[0, Math.PI, 0]}>
      <group onClick={select(onSelect, placement.nodeId)}>
        <Box size={[16, 4.2, 9]} position={[0, 2.2, 0]} color={PALETTE.pop} opacity={open ? 0.28 : 1} />
        <Box size={[16.4, 0.4, 9.4]} position={[0, 4.4, 0]} color={PALETTE.popTrim} />
        <Box size={[1.2, 2.3, 0.15]} position={[-5, 1.25, 4.55]} color={PALETTE.door} metalness={0.4} />
        <Box size={[2.2, 1.4, 1.8]} position={[5, 5.1, -1]} color={PALETTE.cabinetDark} metalness={0.3} />
        <Box size={[3.2, 0.7, 0.08]} position={[0, 3.6, 4.55]} color={'#1d2a3a'} />
      </group>
      <OltRack device={oltDevice} position={[3, 0.12, 1]} losPorts={losPorts} onSelect={onSelect} nodeId={placement.nodeId} />
      <OltRackNeighbour position={[1.6, 0.12, 1]} />
      </group>
      {(selected || current) && <GroundRing position={[0, 0, -5.5]} color={current ? MARK_COLOR.current : '#ffffff'} radius={2} />}
      {(selected || current || mark) && <Label position={[0, 5.6, 0]} text={placement.node.label} accent={accent} />}
    </group>
  );
}

function OltRackNeighbour({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Box size={[0.62, 2.1, 0.9]} position={[0, 1.05, 0]} color={PALETTE.rack} metalness={0.3} />
      <Box size={[0.5, 0.22, 0.7]} position={[0, 1.7, 0.1]} color={PALETTE.card} />
      <Box size={[0.5, 0.22, 0.7]} position={[0, 1.4, 0.1]} color={PALETTE.card} />
      <Led3D position={[0.18, 1.7, 0.46]} status="ok" size={0.008} />
      <Led3D position={[0.18, 1.4, 0.46]} status="ok" size={0.008} />
    </group>
  );
}

// --- FDH cabinet -------------------------------------------------------------------------------

export interface CabinetLayout {
  bodyColor: string;
  capColor: string;
  heightM: number;
  widthM: number;
  depthM: number;
  adapterGrid: { rows: number; cols: number };
  splitterShelves: number;
  activeShelves: number;
  dRings: number;
}

export const DEFAULT_CABINET_LAYOUT: CabinetLayout = {
  bodyColor: '#ded3c0',
  capColor: '#2b2622',
  heightM: 1.8,
  widthM: 0.9,
  depthM: 0.55,
  adapterGrid: { rows: 6, cols: 12 },
  splitterShelves: 2,
  activeShelves: 3,
  dRings: 11,
};

/**
 * The distribution port field: a dense bulkhead of green SC/APC adapters, mostly
 * unpopulated. Instanced, because a 6x12 grid is 72 meshes and this cabinet already carries
 * a lot of geometry — one draw call instead of seventy-two.
 */
function AdapterField({ rows, cols, occupied, width, height, z }: { rows: number; cols: number; occupied: number; width: number; height: number; z: number }) {
  const ref = useRef<InstancedMesh>(null);
  const count = rows * cols;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const lit = new Color('#2f9e5b');
    const dark = new Color('#143a2a');
    const stepX = width / cols;
    const stepY = height / rows;
    for (let i = 0; i < count; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      m.makeTranslation(-width / 2 + stepX * (c + 0.5), height / 2 - stepY * (r + 0.5), 0);
      mesh.setMatrixAt(i, m);
      // A used port is lit; the rest are bare adapter bodies waiting for a jumper.
      mesh.setColorAt(i, i < occupied ? lit : dark);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [rows, cols, occupied, width, height, count]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} position={[0, 0, z]}>
      <boxGeometry args={[(width / cols) * 0.62, (height / rows) * 0.5, 0.022]} />
      <meshStandardMaterial roughness={0.55} />
    </instancedMesh>
  );
}

/**
 * A pad-mounted street cabinet, modelled from photographs of the real plant (see
 * docs/reference/). Cream powder-coated body, dark drip-edge cap wide enough to set an OTDR
 * on, double doors opening toward the street. Inside, top to bottom: stacked SC/APC adapter
 * modules dressed with yellow jumpers on the left, the distribution port field on the right,
 * splitter cassettes, an active shelf of purple 1RU chassis, a dense fan of yellow patch
 * cords, a slack coil, and an empty bottom shelf.
 *
 * Geometry comes from the equipment profile's catalog entry, so a different cabinet is a
 * YAML change rather than a code change.
 */
export function FdhCabinet({
  placement,
  splitter,
  distSpans,
  feederSpan,
  open,
  selected,
  current,
  mark,
  onSelect,
  splitterSelected,
  layout = DEFAULT_CABINET_LAYOUT,
}: {
  placement: Placement;
  splitter: TopologyNode | undefined;
  distSpans: FiberSpan[];
  feederSpan: FiberSpan | undefined;
  open: boolean;
  selected: boolean;
  current: boolean;
  mark: string | null;
  onSelect: (id: string) => void;
  splitterSelected: boolean;
  layout?: CabinetLayout;
}) {
  const p = placement.position;
  const ratio = typeof splitter?.attributes?.splitRatio === 'string' ? (splitter.attributes.splitRatio as string) : '1x32';
  const accent = current ? MARK_COLOR.current : selected ? '#ffffff' : mark ? MARK_COLOR[mark as keyof typeof MARK_COLOR] : undefined;

  const W = layout.widthM;
  const H = layout.heightM;
  const D = layout.depthM;
  const halfW = W / 2;
  const backZ = -D / 2;
  const bodyBottom = 0.22; // the cabinet sits on a plinth
  const bodyTop = bodyBottom + H;
  const feederStrand = feederSpan?.strands?.[0];

  return (
    <group position={[p.x, 0, p.z]}>
      {/* Concrete pad with a slight lip, weathered at the base. */}
      <Box size={[W + 0.6, 0.14, D + 0.5]} position={[0, 0.07, 0]} color={PALETTE.pad} roughness={1} />
      <Box size={[W + 0.14, bodyBottom, D + 0.1]} position={[0, bodyBottom / 2 + 0.07, 0]} color={'#b9ae9c'} roughness={1} />

      <group rotation={[0, Math.PI, 0]}>
        <group onClick={select(onSelect, placement.nodeId)}>
          {/* Body: back, sides, floor. Passive fibre cabinet — no vents, no fans. */}
          <Box size={[W, H, 0.05]} position={[0, bodyBottom + H / 2, backZ]} color={layout.bodyColor} roughness={0.85} />
          <Box size={[0.05, H, D]} position={[-halfW + 0.025, bodyBottom + H / 2, 0]} color={layout.bodyColor} roughness={0.85} />
          <Box size={[0.05, H, D]} position={[halfW - 0.025, bodyBottom + H / 2, 0]} color={layout.bodyColor} roughness={0.85} />
          <Box size={[W, 0.05, D]} position={[0, bodyBottom + 0.025, 0]} color={'#c8bdaa'} roughness={0.9} />

          {/* Dark drip-edge cap, overhanging on every side. Flat enough to stage a tester on. */}
          <Box size={[W + 0.09, 0.075, D + 0.09]} position={[0, bodyTop + 0.037, 0]} color={layout.capColor} roughness={0.7} />
          <Box size={[W + 0.05, 0.03, D + 0.05]} position={[0, bodyTop - 0.01, 0]} color={'#3a332c'} roughness={0.8} />

          {/* Doors, hinged at the outer edges, with a gasket channel down the inner face. */}
          {[-1, 1].map((side) => (
            <Hinge key={side} open={open} axis="y" openAngle={side * -2.25} position={[side * halfW, bodyBottom + H / 2, D / 2 - 0.03]}>
              <Box size={[halfW, H - 0.04, 0.035]} position={[(-side * halfW) / 2, 0, 0]} color={layout.bodyColor} roughness={0.8} />
              <Box size={[halfW - 0.06, H - 0.14, 0.008]} position={[(-side * halfW) / 2, 0, -0.022]} color={'#1a1714'} />
              {/* Latch and hasp on the leading edge. */}
              <Box size={[0.035, 0.16, 0.045]} position={[-side * (halfW - 0.05), -0.05, 0.03]} color={'#2b2b2b'} metalness={0.5} />
              <Box size={[0.16, 0.055, 0.004]} position={[(-side * halfW) / 2, H / 2 - 0.16, 0.02]} color={'#e8e6e0'} />
            </Hinge>
          ))}
        </group>

        {/* ---- Interior. Built only while the doors are open. ---- */}
        {open && (
          <group>
            {/* Backboard the whole assembly hangs off. */}
            <Box size={[W - 0.12, H - 0.12, 0.02]} position={[0, bodyBottom + H / 2, backZ + 0.04]} color={'#cdc3b2'} roughness={0.9} />

            {/* --- Upper: adapter modules left, distribution port field right --- */}
            {Array.from({ length: 5 }).map((_, i) => (
              <group key={`mod${i}`} position={[-halfW + 0.24, bodyTop - 0.16 - i * 0.1, backZ + 0.1]}>
                <Box size={[0.34, 0.075, 0.09]} color={'#d6d2c8'} roughness={0.7} />
                {Array.from({ length: 6 }).map((__, k) => (
                  <Box key={k} size={[0.035, 0.05, 0.02]} position={[-0.13 + k * 0.052, 0, 0.055]} color={'#2f9e5b'} />
                ))}
                {/* Yellow jumpers leaving the module, each with a white flag label. */}
                {Array.from({ length: 4 }).map((__, k) => (
                  <group key={`j${k}`}>
                    <Tube points={[[-0.13 + k * 0.052, 0, 0.07], [-0.05 + k * 0.03, -0.05 - k * 0.012, 0.13], [0.12, -0.16 - k * 0.02, 0.1]]} radius={0.004} color={PALETTE.fiberYellow} />
                    <Box size={[0.026, 0.014, 0.002]} position={[-0.04 + k * 0.03, -0.06 - k * 0.012, 0.13]} color={'#f2f0ea'} />
                  </group>
                ))}
              </group>
            ))}

            <group position={[halfW - 0.3, bodyTop - 0.42, backZ + 0.1]}>
              <Box size={[0.5, 0.56, 0.03]} position={[0, 0, -0.02]} color={'#c2b8a6'} roughness={0.85} />
              <AdapterField rows={layout.adapterGrid.rows} cols={layout.adapterGrid.cols} occupied={distSpans.length} width={0.46} height={0.52} z={0.012} />
            </group>

            {/* Radius limiters and the D-ring column down the right-hand side. */}
            {Array.from({ length: layout.dRings }).map((_, i) => (
              <mesh key={`ring${i}`} position={[halfW - 0.06, bodyTop - 0.18 - i * 0.11, backZ + 0.13]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.032, 0.007, 6, 14, Math.PI * 1.35]} />
                <meshStandardMaterial color={'#15161a'} roughness={0.8} />
              </mesh>
            ))}

            {/* --- Splitter cassettes --- */}
            {Array.from({ length: layout.splitterShelves }).map((_, i) => (
              <group key={`spl${i}`} position={[-halfW + 0.3, bodyTop - 0.74 - i * 0.13, backZ + 0.12]} onClick={splitter ? select(onSelect, splitter.id) : undefined}>
                <Box size={[0.4, 0.1, 0.11]} color={i === 0 && splitterSelected ? '#ffffff' : '#e9eaee'} emissive={i === 0 && splitterSelected ? '#00f0ff' : undefined} roughness={0.5} />
                <Box size={[0.22, 0.035, 0.004]} position={[0, 0.015, 0.057]} color={'#1d2a3a'} />
                {i === 0 && (selected || current || splitterSelected) && <Label position={[0, 0.14, 0.06]} text={`SPLITTER ${ratio.toUpperCase()}`} small />}
              </group>
            ))}

            {/* --- Active shelf: purple 1RU chassis, the signature of this cabinet --- */}
            {Array.from({ length: layout.activeShelves }).map((_, i) => (
              <group key={`ch${i}`} position={[0, bodyTop - 1.02 - i * 0.11, backZ + 0.14]}>
                <Box size={[W - 0.2, 0.085, 0.2]} color={i === 0 ? '#4a2a72' : '#3f2463'} roughness={0.45} metalness={0.2} />
                <Box size={[W - 0.24, 0.05, 0.006]} position={[0, 0, 0.103]} color={'#2a1745'} />
                {/* Port group LEDs — green where the chassis is carrying, dark where it is not. */}
                {Array.from({ length: 8 }).map((__, k) => (
                  <mesh key={k} position={[-0.28 + k * 0.08, 0.012, 0.107]}>
                    <sphereGeometry args={[0.0055, 6, 6]} />
                    <meshStandardMaterial color={k < 5 ? '#2ee58a' : '#1b2b22'} emissive={k < 5 ? '#2ee58a' : '#000'} emissiveIntensity={k < 5 ? 1.5 : 0} />
                  </mesh>
                ))}
                <Box size={[0.05, 0.03, 0.004]} position={[0.3, -0.02, 0.104]} color={'#0f1a24'} />
              </group>
            ))}

            {/* Management panel with RJ45 jacks. */}
            <group position={[-halfW + 0.22, bodyTop - 0.9, backZ + 0.13]}>
              <Box size={[0.3, 0.07, 0.14]} color={'#b9c0c8'} roughness={0.6} />
              {Array.from({ length: 4 }).map((_, k) => (
                <Box key={k} size={[0.03, 0.035, 0.02]} position={[-0.1 + k * 0.065, 0, 0.08]} color={'#2b3238'} />
              ))}
            </group>

            {/* Teal multimode duplex loops across the middle. */}
            <Tube points={[[-0.3, bodyTop - 0.98, backZ + 0.24], [-0.05, bodyTop - 1.06, backZ + 0.3], [0.28, bodyTop - 0.98, backZ + 0.24]]} radius={0.006} color={'#2fb6c4'} />
            <Tube points={[[-0.28, bodyTop - 1.09, backZ + 0.24], [0.0, bodyTop - 1.17, backZ + 0.29], [0.3, bodyTop - 1.09, backZ + 0.24]]} radius={0.006} color={'#2fb6c4'} />

            {/* Feeder in, dressed down the left to the splitter. */}
            <Tube
              points={[
                [-halfW + 0.1, bodyBottom + 0.1, backZ + 0.1],
                [-halfW + 0.12, bodyTop - 0.9, backZ + 0.12],
                [-halfW + 0.26, bodyTop - 0.78, backZ + 0.16],
              ]}
              radius={0.011}
              color={feederStrand ? TUBE_COLORS[feederStrand.fiberColor] : TUBE_COLORS.blue}
            />

            {/* Dense fan of distribution jumpers from the splitter out to the port field. */}
            {distSpans.slice(0, 14).map((span, i) => (
              <group key={span.id}>
                <Tube
                  points={[
                    [-halfW + 0.44, bodyTop - 0.76, backZ + 0.16],
                    [-0.05 + i * 0.012, bodyTop - 0.6 - i * 0.006, backZ + 0.22],
                    [halfW - 0.5 + (i % 12) * 0.038, bodyTop - 0.2 - Math.floor(i / 12) * 0.087, backZ + 0.13],
                  ]}
                  radius={0.0035}
                  color={PALETTE.fiberYellow}
                />
                <Box size={[0.024, 0.012, 0.002]} position={[-0.02 + i * 0.012, bodyTop - 0.62 - i * 0.006, backZ + 0.23]} color={'#f2f0ea'} />
              </group>
            ))}

            {/* Port-label strips on the left, and a coil of yellow slack on the bottom shelf. */}
            {Array.from({ length: 3 }).map((_, i) => (
              <Box key={`lbl${i}`} size={[0.13, 0.03, 0.004]} position={[-halfW + 0.16, bodyTop - 1.2 - i * 0.06, backZ + 0.12]} color={'#11171d'} />
            ))}
            <mesh position={[-halfW + 0.26, bodyBottom + 0.13, backZ + 0.2]} rotation={[Math.PI / 2.2, 0, 0.2]}>
              <torusGeometry args={[0.1, 0.011, 8, 26]} />
              <meshStandardMaterial color={PALETTE.fiberYellow} roughness={0.5} />
            </mesh>

            {/* Empty equipment shelf at the bottom — free space for a future card. */}
            <Box size={[W - 0.14, 0.014, D - 0.14]} position={[0, bodyBottom + 0.3, 0.02]} color={'#d9d5cc'} roughness={0.8} />

            {/* Conduit entering from below the pad. */}
            <Tube points={[[0, bodyBottom + 0.04, backZ + 0.16], [0, -0.6, backZ + 0.16]]} radius={0.05} color={PALETTE.conduit} />
          </group>
        )}
      </group>

      {(selected || current || splitterSelected) && <GroundRing position={[0, 0, -0.55]} color={current ? MARK_COLOR.current : '#ffffff'} radius={W} />}
      {(selected || current || mark || splitterSelected) && <Label position={[0, bodyTop + 0.34, 0]} text={placement.node.label} accent={accent} />}
    </group>
  );
}

// --- Handhole + splice closure ------------------------------------------------------------------

export function SpliceClosure({ position, open, strands, trayCount = 3, onSelect, nodeId, selectedTray, onSelectTray }: { position: [number, number, number]; open: boolean; strands: Array<{ tubeColor: keyof typeof TUBE_COLORS; fiberColor: keyof typeof TUBE_COLORS }>; trayCount?: number; onSelect: (id: string) => void; nodeId: string; selectedTray: number | null; onSelectTray: (i: number) => void }) {
  const tubes = Array.from(new Set(strands.map((s) => s.tubeColor)));
  const tubeColors = tubes.length > 0 ? tubes : (['blue', 'orange'] as const);
  return (
    <group position={position} onClick={select(onSelect, nodeId)}>
      {/* Shell: lower half fixed, upper half lifts. End seals with cable entry ports. */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 0.62, 20, 1, false, Math.PI, Math.PI]} />
        <meshStandardMaterial color={PALETTE.closure} roughness={0.5} />
      </mesh>
      <Slide open={open} from={[0, 0, 0]} to={[0, 0.34, -0.06]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.13, 0.13, 0.62, 20, 1, false, 0, Math.PI]} />
          <meshStandardMaterial color={PALETTE.closure} roughness={0.5} />
        </mesh>
      </Slide>
      {[-0.33, 0.33].map((x) => (
        <group key={x}>
          <mesh position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.14, 0.14, 0.05, 20]} />
            <meshStandardMaterial color={PALETTE.closureCap} metalness={0.3} />
          </mesh>
          {[-0.06, 0.06].map((z) => (
            <mesh key={z} position={[x + (x < 0 ? -0.06 : 0.06), -0.03, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.025, 0.025, 0.08, 10]} />
              <meshStandardMaterial color={'#111'} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Tray stack and buffer tubes, visible once the shell is open. */}
      {open &&
        Array.from({ length: trayCount }).map((_, i) => {
          const y = -0.02 + i * 0.035;
          const isTop = i === trayCount - 1;
          const sel = selectedTray === i;
          return (
            <Hinge key={i} open={isTop && sel} axis="x" openAngle={-0.9} position={[0, y, 0.07]}>
              <group
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTray(i);
                }}
              >
                <Box size={[0.4, 0.012, 0.14]} position={[0, 0, -0.07]} color={sel ? '#ffffff' : PALETTE.tray} emissive={sel ? '#5ab0ff' : undefined} />
                <Tube points={[[-0.18, 0.012, -0.12], [-0.12, 0.012, -0.03], [0.12, 0.012, -0.03], [0.18, 0.012, -0.12]]} radius={0.004} color={TUBE_COLORS[tubeColors[i % tubeColors.length]]} />
                {isTop &&
                  strands.slice(0, 6).map((s, k) => (
                    <group key={k}>
                      <Tube points={[[-0.17, 0.016, -0.11 + k * 0.012], [0.17, 0.016, -0.11 + k * 0.012]]} radius={0.0015} color={TUBE_COLORS[s.fiberColor]} />
                      <mesh position={[-0.02 + (k % 3) * 0.02, 0.018, -0.11 + k * 0.012]} rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[0.004, 0.004, 0.04, 8]} />
                        <meshStandardMaterial color={'#d8dde3'} transparent opacity={0.85} />
                      </mesh>
                    </group>
                  ))}
              </group>
            </Hinge>
          );
        })}
    </group>
  );
}

export function Handhole({ placement, open, closureOpen, strands, selected, current, mark, onSelect, selectedTray, onSelectTray, contents }: { placement: Placement; open: boolean; closureOpen: boolean; strands: Array<{ tubeColor: keyof typeof TUBE_COLORS; fiberColor: keyof typeof TUBE_COLORS }>; selected: boolean; current: boolean; mark: string | null; onSelect: (id: string) => void; selectedTray: number | null; onSelectTray: (i: number) => void; contents: 'closure' | 'terminal' }) {
  const p = placement.position;
  const accent = current ? MARK_COLOR.current : selected ? '#ffffff' : mark ? MARK_COLOR[mark as keyof typeof MARK_COLOR] : undefined;
  return (
    <group position={[p.x, 0, p.z]}>
      {/* A real open pit: a polymer-concrete rim standing proud of the turf, four walls, a
          gravel floor, conduit entering each end, and a slack loop coiled on the floor. */}
      {([
        [[0.15, 0.13, 1.1], [-0.675, 0.145, 0]],
        [[0.15, 0.13, 1.1], [0.675, 0.145, 0]],
        [[1.2, 0.13, 0.15], [0, 0.145, -0.475]],
        [[1.2, 0.13, 0.15], [0, 0.145, 0.475]],
      ] as Array<[[number, number, number], [number, number, number]]>).map(([size, pos], i) => (
        <Box key={i} size={size} position={pos} color={PALETTE.curb} roughness={0.95} />
      ))}
      {([
        [[0.06, 1.0, 0.8], [-0.6, -0.42, 0]],
        [[0.06, 1.0, 0.8], [0.6, -0.42, 0]],
        [[1.26, 1.0, 0.06], [0, -0.42, -0.4]],
        [[1.26, 1.0, 0.06], [0, -0.42, 0.4]],
      ] as Array<[[number, number, number], [number, number, number]]>).map(([size, pos], i) => (
        <Box key={`w${i}`} size={size} position={pos} color={PALETTE.pit} roughness={1} />
      ))}
      <Box size={[1.2, 0.05, 0.8]} position={[0, -0.93, 0]} color={'#5a4a3a'} roughness={1} />
      {[-0.62, 0.62].map((x) => (
        <mesh key={x} position={[x, -0.62, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.07, 0.07, 0.14, 12]} />
          <meshStandardMaterial color={PALETTE.conduit} />
        </mesh>
      ))}
      <mesh position={[0, -0.86, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.22, 0.014, 8, 32]} />
        <meshStandardMaterial color={'#111'} />
      </mesh>
      {contents === 'closure' ? (
        <SpliceClosure position={[0, -0.55, -0.05]} open={closureOpen} strands={strands} onSelect={onSelect} nodeId={placement.nodeId} selectedTray={selectedTray} onSelectTray={onSelectTray} />
      ) : (
        <group position={[0, -0.6, 0]} onClick={select(onSelect, placement.nodeId)}>
          <Box size={[0.4, 0.3, 0.25]} color={'#2c3e35'} />
          {Array.from({ length: 6 }).map((_, i) => (
            <Box key={i} size={[0.04, 0.04, 0.02]} position={[-0.12 + i * 0.05, 0, 0.13]} color={'#6e7580'} />
          ))}
        </group>
      )}
      <Slide open={open} from={[0, 0.14, 0]} to={[0, 0.2, 1.2]}>
        <group onClick={select(onSelect, placement.nodeId)}>
          <Box size={[1.22, 0.09, 0.82]} color={PALETTE.lid} roughness={0.95} />
          <Box size={[0.7, 0.006, 0.12]} position={[0, 0.048, 0]} color={PALETTE.lidMark} />
          {[-0.45, 0.45].map((x) => (
            <mesh key={x} position={[x, 0.05, 0.25]}>
              <cylinderGeometry args={[0.045, 0.045, 0.012, 12]} />
              <meshStandardMaterial color={'#3a3a3a'} />
            </mesh>
          ))}
        </group>
      </Slide>
      {(selected || current) && <GroundRing position={[0, 0, 0]} color={current ? MARK_COLOR.current : '#ffffff'} radius={1.0} />}
      {(selected || current || mark) && <Label position={[0, 1.1, 0]} text={placement.node.label} accent={accent} />}
    </group>
  );
}

// --- NAP pedestal ------------------------------------------------------------------------------

export function NapPedestal({ position, label, ports, selectedId, currentId, marks, onSelect }: { position: [number, number, number]; label: string; ports: Placement[]; selectedId: string | null; currentId: string; marks: Record<string, string | null>; onSelect: (id: string) => void }) {
  const anySelected = ports.some((p) => p.nodeId === selectedId);
  const anyCurrent = ports.some((p) => p.nodeId === currentId);
  const anyMark = ports.map((p) => marks[p.nodeId]).find((m) => m) ?? null;
  const first = ports[0];
  return (
    <group position={position}>
      <Box size={[0.5, 0.06, 0.5]} position={[0, 0.03, 0]} color={PALETTE.curb} />
      {/* Port face toward the street, the side the technician reaches it from. */}
      <group rotation={[0, Math.PI, 0]}>
      <group onClick={first ? select(onSelect, first.nodeId) : undefined}>
        <Box size={[0.32, 0.86, 0.32]} position={[0, 0.49, 0]} color={PALETTE.pedestal} roughness={0.9} />
        <mesh position={[0, 0.94, 0]}>
          <sphereGeometry args={[0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={PALETTE.pedestal} roughness={0.9} />
        </mesh>
        <Box size={[0.18, 0.06, 0.005]} position={[0, 0.78, 0.163]} color={'#e5e7ea'} />
      </group>
      {/* Port face: 8 visible ports; the ones bound to real terminal nodes are live and selectable. */}
      {Array.from({ length: 8 }).map((_, i) => {
        const port = ports.find((p) => (p.portNo ?? 0) === i + 1) ?? (i < ports.length && !ports.some((p) => p.portNo) ? ports[i] : undefined);
        const isSel = port && port.nodeId === selectedId;
        const isCur = port && port.nodeId === currentId;
        const mark = port ? marks[port.nodeId] : null;
        const color = isSel ? '#ffffff' : isCur ? MARK_COLOR.current : mark ? MARK_COLOR[mark as keyof typeof MARK_COLOR] : port ? '#2f9e5b' : '#6e7580';
        return (
          <group key={i} position={[-0.1 + (i % 4) * 0.066, 0.62 - Math.floor(i / 4) * 0.09, 0.165]} onClick={port ? select(onSelect, port.nodeId) : undefined}>
            <Box size={[0.05, 0.05, 0.02]} color={color} emissive={isSel || isCur ? color : undefined} />
            {port && <Tube points={[[0, -0.025, 0.01], [0, -0.3 - i * 0.02, 0.05], [0, -0.6, 0]]} radius={0.004} color={'#111'} />}
          </group>
        );
      })}
      </group>
      {(anySelected || anyCurrent) && <GroundRing position={[0, 0, 0]} color={anyCurrent ? MARK_COLOR.current : '#ffffff'} radius={0.7} />}
      {(anySelected || anyCurrent || anyMark) && <Label position={[0, 1.35, 0]} text={label} accent={anyCurrent ? MARK_COLOR.current : anySelected ? '#ffffff' : anyMark ? MARK_COLOR[anyMark as keyof typeof MARK_COLOR] : undefined} />}
    </group>
  );
}

// --- Yard -----------------------------------------------------------------------------------

export function Yard({ placement, current, selected, onSelect }: { placement: Placement; current: boolean; selected: boolean; onSelect: (id: string) => void }) {
  const p = placement.position;
  return (
    <group position={[p.x, 0, p.z]} onClick={select(onSelect, placement.nodeId)}>
      <Box size={[26, 0.08, 16]} position={[0, 0.04, 0]} color={PALETTE.gravel} />
      {[-13, 13].map((x) => (
        <Box key={x} size={[0.1, 1.8, 16]} position={[x, 0.9, 0]} color={'#8a8f96'} opacity={0.35} />
      ))}
      <Box size={[26, 1.8, 0.1]} position={[0, 0.9, -8]} color={'#8a8f96'} opacity={0.35} />
      {/* Bucket truck: cab, utility body, wheels, stripe. */}
      <group position={[-3, 0, 2]}>
        <Box size={[2.4, 1.6, 2.2]} position={[-2.2, 1.4, 0]} color={PALETTE.truck} />
        <Box size={[2.2, 0.9, 2.0]} position={[-2.2, 2.4, 0]} color={PALETTE.glass} opacity={0.7} />
        <Box size={[4.6, 1.9, 2.3]} position={[1.4, 1.55, 0]} color={PALETTE.truck} />
        <Box size={[4.6, 0.12, 2.32]} position={[1.4, 1.2, 0]} color={PALETTE.truckStripe} />
        <Box size={[3.2, 0.3, 0.3]} position={[0.6, 3.0, -0.6]} color={PALETTE.truck} rotation={[0, 0, 0.35]} />
        {[-2.4, 1.4, 2.9].map((x) =>
          [-1.15, 1.15].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 0.5, z]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.5, 0.5, 0.35, 16]} />
              <meshStandardMaterial color={PALETTE.tire} />
            </mesh>
          )),
        )}
      </group>
      <Box size={[5, 0.6, 0.1]} position={[0, 2.4, -7.9]} color={'#1d2a3a'} />
      {(current || selected) && <GroundRing position={[0, 0, 4]} color={current ? MARK_COLOR.current : '#ffffff'} radius={2} />}
      {(current || selected) && <Label position={[0, 3.4, -7.9]} text={placement.node.label} accent={current ? MARK_COLOR.current : '#ffffff'} />}
    </group>
  );
}
