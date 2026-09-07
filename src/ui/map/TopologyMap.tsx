import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { NodeKind } from '../../world';
import type { UiSessionState } from '../../session/runner';
import type { DiagnosisClaim } from '../../session/types';
import { useViewportState } from '../viewport/viewportStore';
import { layoutTopology, type LaidOutNode } from './topologyLayout';
import { buildMapOverlay, dominantNodeMark, dominantSpanMark, type NodeMark, type SpanMark } from './mapOverlay';

const KIND_COLOR: Record<NodeKind, string> = {
  olt: '#5ab0ff',
  pop: '#3d5a80',
  fdh: '#4a90d9',
  splitter: '#7cc4ff',
  'splice-closure': '#6d8fb3',
  terminal: '#8fb8de',
  fat: '#8fb8de',
  ont: '#b8d4ee',
  'customer-premise': '#d0e0f0',
  'network-device': '#6f9ccf',
  yard: '#3a4756',
};

const MARK_COLOR: Record<NodeMark | SpanMark, string> = {
  claimed: '#ff9d00',
  alarm: '#ff4d4d',
  current: '#37d67a',
  tested: '#5ab0ff',
  visited: '#8a96a6',
};

interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

/** With `frameloop="demand"` nothing draws until something invalidates; guarantee one frame right after mount so a remounted map is never blank while idle. */
function KickFirstFrame() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(id);
  }, [invalidate]);
  return null;
}

function NodeShape({ kind }: { kind: NodeKind }) {
  switch (kind) {
    case 'olt':
    case 'network-device':
      return <boxGeometry args={[0.9, 0.5, 0.6]} />;
    case 'pop':
    case 'fdh':
      return <boxGeometry args={[0.8, 1.1, 0.5]} />;
    case 'splitter':
      return <octahedronGeometry args={[0.45]} />;
    case 'splice-closure':
      return <capsuleGeometry args={[0.22, 0.7, 4, 12]} />;
    case 'terminal':
    case 'fat':
      return <boxGeometry args={[0.5, 0.5, 0.5]} />;
    case 'ont':
      return <boxGeometry args={[0.35, 0.25, 0.35]} />;
    case 'customer-premise':
      return <coneGeometry args={[0.45, 0.6, 4]} />;
    case 'yard':
      return <cylinderGeometry args={[0.6, 0.6, 0.12, 24]} />;
  }
}

function NodeMesh({ node, mark, selected, onSelect }: { node: LaidOutNode; mark: NodeMark | null; selected: boolean; onSelect(id: string): void }) {
  const color = mark && mark !== 'visited' ? MARK_COLOR[mark] : KIND_COLOR[node.kind];
  const emissive = mark === 'current' || mark === 'alarm' || mark === 'claimed' ? MARK_COLOR[mark] : '#000000';
  return (
    <group position={[node.x, node.y + 0.3, node.z]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
        }}
      >
        <NodeShape kind={node.kind} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.55} roughness={0.55} metalness={0.15} />
      </mesh>
      {(mark === 'current' || selected) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.28, 0]}>
          <ringGeometry args={[0.7, 0.85, 40]} />
          <meshBasicMaterial color={selected ? '#ffffff' : MARK_COLOR.current} transparent opacity={0.9} />
        </mesh>
      )}
      <Html center distanceFactor={14} position={[0, 0.85, 0]} style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: 11, color: 'var(--text)', background: 'rgba(11,15,20,0.75)', padding: '2px 6px', borderRadius: 4, border: `1px solid ${mark && mark !== 'visited' ? MARK_COLOR[mark] : 'var(--bezel)'}` }}>{node.label}</div>
      </Html>
    </group>
  );
}

export function TopologyMap({ ui, selectedNodeId, onSelectNode }: { ui: UiSessionState; selectedNodeId: string | null; onSelectNode(id: string | null): void }) {
  const layout = useMemo(() => layoutTopology(ui.world.topology.nodes, ui.world.topology.spans), [ui.world.topology.nodes, ui.world.topology.spans]);
  const [draftClaims] = useViewportState<DiagnosisClaim[]>('diagnose.claims', []);
  const overlay = useMemo(() => buildMapOverlay(ui, draftClaims), [ui, draftClaims]);
  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);

  const [pose, setPose] = useViewportState<CameraPose>('map.camera', () => ({
    position: [layout.width * 0.6, Math.max(layout.length, layout.width) * 0.9 + 4, layout.length * 1.4 + 4],
    target: [0, 0, layout.length / 2],
  }));
  const controls = useRef<OrbitControlsImpl>(null);

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'low-power' }}
      camera={{ position: pose.position, fov: 45, near: 0.1, far: 200 }}
      style={{ background: 'var(--bg)' }}
      onPointerMissed={() => onSelectNode(null)}
    >
      <KickFirstFrame />
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 10, 4]} intensity={1.1} />
      <gridHelper args={[Math.max(layout.width, layout.length) + 8, 24, '#1f2a38', '#141b25']} position={[0, -0.01, layout.length / 2]} />

      {layout.spans.map((s) => {
        const a = byId.get(s.fromNodeId);
        const b = byId.get(s.toNodeId);
        if (!a || !b) return null;
        const mark = dominantSpanMark(overlay.spans[s.id]);
        return (
          <Line
            key={s.id}
            points={[
              [a.x, a.y + 0.3, a.z],
              [b.x, b.y + 0.3, b.z],
            ]}
            color={mark ? MARK_COLOR[mark] : '#2e3d52'}
            lineWidth={mark ? 3 : 1.5}
            dashed={mark === 'claimed'}
            dashSize={0.3}
            gapSize={0.15}
          />
        );
      })}

      {layout.nodes.map((n) => (
        <NodeMesh key={n.id} node={n} mark={dominantNodeMark(overlay.nodes[n.id])} selected={selectedNodeId === n.id} onSelect={onSelectNode} />
      ))}

      <OrbitControls
        ref={controls}
        target={pose.target}
        enableDamping={false}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={3}
        maxDistance={80}
        onEnd={() => {
          const c = controls.current;
          if (!c) return;
          setPose({ position: [c.object.position.x, c.object.position.y, c.object.position.z], target: [c.target.x, c.target.y, c.target.z] });
        }}
      />
    </Canvas>
  );
}
