/** Customer premise: stucco house on its lot, gray NID on the side wall, ONT and gateway indoors behind that wall. */
import type { OntLeds } from '../sceneState';
import { HOUSE_D, HOUSE_W, type Placement } from '../sceneLayout';
import { Box, GroundRing, Hinge, Label, Led3D, MARK_COLOR, PALETTE, Tube, TUBE_COLORS } from './common';

type Click = (e: { stopPropagation(): void }) => void;
function select(onSelect: (id: string) => void, id: string): Click {
  return (e) => {
    e.stopPropagation();
    onSelect(id);
  };
}

export function Nid({ placement, open, selected, onSelect, dropColor }: { placement: Placement; open: boolean; selected: boolean; onSelect: (id: string) => void; dropColor: string }) {
  const p = placement.position;
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, placement.rotationY, 0]} onClick={select(onSelect, placement.nodeId)}>
      {/* Base box with fiber slack, adapter, provider/customer divider; hinged weather cover; drop from below, jumper through the wall. */}
      <Box size={[0.3, 0.42, 0.11]} position={[0, 0, -0.055]} color={PALETTE.nidInner} />
      <Box size={[0.28, 0.4, 0.005]} position={[0, 0, -0.105]} color={'#c3c8cd'} />
      <Box size={[0.005, 0.36, 0.06]} position={[0, 0, -0.06]} color={'#9aa1aa'} />
      <mesh position={[-0.07, 0.05, -0.04]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.05, 0.004, 8, 24]} />
        <meshStandardMaterial color={dropColor} />
      </mesh>
      <Box size={[0.03, 0.05, 0.03]} position={[0.07, 0.02, -0.05]} color={'#2fa64a'} />
      <Tube points={[[-0.07, -0.21, -0.05], [-0.07, -0.05, -0.05]]} radius={0.004} color={dropColor} />
      <Tube points={[[0.07, 0.045, -0.05], [0.07, 0.12, -0.05], [0.07, 0.15, -0.14]]} radius={0.003} color={PALETTE.fiberYellow} />
      <Box size={[0.12, 0.03, 0.004]} position={[-0.07, 0.17, -0.05]} color={'#e8b300'} />
      <Hinge open={open} axis="y" openAngle={-2.2} position={[-0.15, 0, 0]}>
        <Box size={[0.3, 0.42, 0.02]} position={[0.15, 0, 0.01]} color={selected ? '#d7dee8' : PALETTE.nid} emissive={selected ? '#5ab0ff' : undefined} roughness={0.7} />
        <Box size={[0.03, 0.05, 0.015]} position={[0.28, 0, 0.02]} color={'#3a3a3a'} />
      </Hinge>
    </group>
  );
}

export function Ont({ placement, leds, selected, onSelect }: { placement: Placement; leds: OntLeds; selected: boolean; onSelect: (id: string) => void }) {
  const p = placement.position;
  const lit = leds.visible;
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, placement.rotationY, 0]}>
      {/* Wall shelf with the customer gateway, power brick at the outlet, ONT itself with its LED row and ports. */}
      <group onClick={select(onSelect, placement.nodeId)}>
        <Box size={[0.22, 0.16, 0.05]} position={[0, 0, 0.025]} color={selected ? '#ffffff' : PALETTE.ont} emissive={selected ? '#5ab0ff' : undefined} roughness={0.5} />
        <Box size={[0.2, 0.02, 0.006]} position={[0, -0.03, 0.053]} color={PALETTE.ontDark} />
        <Box size={[0.03, 0.01, 0.006]} position={[-0.07, 0.05, 0.053]} color={'#2fa64a'} />
        <Box size={[0.06, 0.01, 0.006]} position={[0.03, 0.05, 0.053]} color={'#d8dde3'} />
        {(['power', 'pon', 'los', 'lan'] as const).map((k, i) => (
          <Led3D key={k} position={[-0.075 + i * 0.05, -0.03, 0.058]} status={lit ? leds[k] : 'off'} size={0.006} />
        ))}
      </group>
      <Box size={[0.05, 0.03, 0.02]} position={[0.1, -0.25, 0.01]} color={'#f5f5f2'} />
      <Tube points={[[0.1, -0.24, 0.02], [0.1, -0.09, 0.03], [0.06, -0.08, 0.04]]} radius={0.002} color={'#222'} />
      <Box size={[0.4, 0.02, 0.18]} position={[0.35, -0.05, 0.09]} color={'#8b6b4f'} />
      <Box size={[0.2, 0.05, 0.14]} position={[0.35, -0.015, 0.09]} color={'#1f2327'} />
      <Led3D position={[0.28, 0.012, 0.15]} status={lit && leds.lan === 'ok' ? 'ok' : 'off'} size={0.004} />
      <Tube points={[[0.11, -0.02, 0.05], [0.25, -0.02, 0.09]]} radius={0.002} color={'#3b6fd8'} />
      <Tube points={[[-0.09, 0.03, 0.02], [-0.11, 0.03, -0.01]]} radius={0.003} color={PALETTE.fiberYellow} />
    </group>
  );
}

export function House({ placement, index, nid, ont, leds, nidOpen, current, selectedId, mark, onSelect, dropColor, decorated }: { placement: Placement; index: number; nid: Placement | undefined; ont: Placement | undefined; leds: OntLeds; nidOpen: boolean; current: boolean; selectedId: string | null; mark: string | null; onSelect: (id: string) => void; dropColor: string; decorated: boolean }) {
  const p = placement.position;
  const stucco = PALETTE.stucco[index % PALETTE.stucco.length];
  const houseSelected = selectedId === placement.nodeId;
  const ontSelected = ont ? selectedId === ont.nodeId : false;
  const nidSelected = nid ? selectedId === nid.nodeId : false;
  const xray = current || houseSelected || ontSelected || nidSelected;
  const accent = current ? MARK_COLOR.current : houseSelected || ontSelected || nidSelected ? '#ffffff' : mark ? MARK_COLOR[mark as keyof typeof MARK_COLOR] : undefined;
  const hw = HOUSE_W / 2;
  const hd = HOUSE_D / 2;
  return (
    <group>
      <group position={[p.x, 0, p.z]}>
        {/* Slab, walls (west wall goes translucent when you are here or looking at the ONT), hip roof, garage, door, windows. */}
        <Box size={[HOUSE_W + 0.4, 0.15, HOUSE_D + 0.4]} position={[0, 0.075, 0]} color={PALETTE.pad} />
        <group onClick={ont ? select(onSelect, placement.nodeId) : undefined}>
          <Box size={[0.2, 3.2, HOUSE_D]} position={[-hw + 0.1, 1.75, 0]} color={stucco} opacity={xray ? 0.22 : 1} />
          <Box size={[0.2, 3.2, HOUSE_D]} position={[hw - 0.1, 1.75, 0]} color={stucco} />
          <Box size={[HOUSE_W, 3.2, 0.2]} position={[0, 1.75, hd - 0.1]} color={stucco} />
          <Box size={[HOUSE_W, 3.2, 0.2]} position={[0, 1.75, -hd + 0.1]} color={stucco} opacity={xray ? 0.35 : 1} />
          <Box size={[HOUSE_W - 0.4, 0.15, HOUSE_D - 0.4]} position={[0, 3.3, 0]} color={'#e8e2d6'} />
          <mesh position={[0, 3.35 + 1.1, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[Math.hypot(hw + 0.5, hd + 0.5), 2.2, 4]} />
            <meshStandardMaterial color={PALETTE.roof} roughness={0.9} />
          </mesh>
          <Box size={[3.2, 2.4, 0.1]} position={[2.6, 1.35, -hd - 0.02]} color={PALETTE.garage} />
          <Box size={[1.0, 2.2, 0.1]} position={[-1.6, 1.25, -hd - 0.02]} color={PALETTE.trim} />
          <Box size={[1.4, 1.1, 0.1]} position={[-3.6, 1.9, -hd - 0.02]} color={PALETTE.glass} />
          <Box size={[1.4, 1.1, 0.1]} position={[0.2, 1.9, -hd - 0.02]} color={PALETTE.glass} />
        </group>
        {/* Driveway to the street and a dry front lawn. */}
        <Box size={[3.6, 0.04, 7]} position={[2.6, 0.02, -hd - 3.6]} color={PALETTE.sidewalk} />
        <Box size={[HOUSE_W + 4, 0.02, 6.8]} position={[-1.5, 0.01, -hd - 3.5]} color={PALETTE.grass} />
        {decorated && (
          <group position={[-hw - 1.6, 0, -hd - 2.5]}>
            <mesh position={[0, 1.2, 0]}>
              <cylinderGeometry args={[0.12, 0.16, 2.4, 8]} />
              <meshStandardMaterial color={PALETTE.trunk} />
            </mesh>
            <mesh position={[0, 3.0, 0]}>
              <sphereGeometry args={[1.4, 10, 8]} />
              <meshStandardMaterial color={PALETTE.leaf} roughness={0.9} />
            </mesh>
          </group>
        )}
        {(current || houseSelected) && <GroundRing position={[-hw - 1.2, 0, 1]} color={current ? MARK_COLOR.current : '#ffffff'} radius={1.3} />}
        {(current || houseSelected || ontSelected || nidSelected || mark) && <Label position={[0, 6.2, 0]} text={placement.node.label} accent={accent} />}
      </group>
      {nid && <Nid placement={nid} open={nidOpen} selected={nidSelected} onSelect={onSelect} dropColor={dropColor} />}
      {ont && <Ont placement={ont} leds={leds} selected={ontSelected} onSelect={onSelect} />}
      {ont && (current || ontSelected) && <Label position={[ont.position.x, ont.position.y + 0.35, ont.position.z]} text={leds.visible ? 'ONT' : 'ONT (indoors)'} small accent={accent} />}
    </group>
  );
}

export { TUBE_COLORS };
