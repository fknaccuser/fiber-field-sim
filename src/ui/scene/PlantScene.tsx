/**
 * The 3D outside-plant world. Every object here is bound to a real topology node or span
 * (see sceneLayout.ts); selecting one selects that entity. Nothing is drawn from ground
 * truth: highlights come from the action log + claims (mapOverlay) and LED states come
 * from what the trainee has measured or been told (sceneState).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { PerspectiveCamera } from 'three';
import type { UiSessionState } from '../../session/runner';
import type { DiagnosisClaim } from '../../session/types';
import type { FiberTubeColor } from '../../world';
import { buildMapOverlay, dominantNodeMark, dominantSpanMark, type NodeMark, type SpanMark } from '../map/mapOverlay';
import { useViewportState } from '../viewport/viewportStore';
import { layoutScene, type Placement, type SceneLayout } from './sceneLayout';
import { lastOtdrShot, ontLeds } from './sceneState';
import { poseFor, type CameraMode, type CameraPose } from './camera';
import { TUBE_COLORS } from './models/common';
import { FdhCabinet, Handhole, NapPedestal, PopBuilding, Yard } from './models/plant';
import { House } from './models/premise';
import { CableRoutes, Ground, TraceMarkers } from './models/environment';

export interface SceneSelection {
  nodeId: string;
  /** For a splice closure: which tray is lifted. */
  tray?: number;
}

export interface PlantSceneProps {
  ui: UiSessionState;
  layout: SceneLayout;
  mode: CameraMode;
  selectedId: string | null;
  openIds: string[];
  selectedTray: number | null;
  quality: 'full' | 'reduced';
  onSelect(id: string | null): void;
  onSelectTray(i: number): void;
}

/** Eases the camera toward the pose the current mode/selection asks for, then hands control back to the user's own orbiting. */
function CameraRig({ pose, controls, onSettled }: { pose: CameraPose; controls: React.RefObject<OrbitControlsImpl | null>; onSettled(): void }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const active = useRef(true);
  const last = useRef(pose);

  useEffect(() => {
    if (JSON.stringify(last.current) !== JSON.stringify(pose)) {
      last.current = pose;
      active.current = true;
      invalidate();
    }
  }, [pose, invalidate]);

  useFrame((_, dt) => {
    if (!active.current) return;
    const c = controls.current;
    const k = Math.min(1, dt * 3.4);
    camera.position.x += (pose.position.x - camera.position.x) * k;
    camera.position.y += (pose.position.y - camera.position.y) * k;
    camera.position.z += (pose.position.z - camera.position.z) * k;
    if (c) {
      c.target.x += (pose.target.x - c.target.x) * k;
      c.target.y += (pose.target.y - c.target.y) * k;
      c.target.z += (pose.target.z - c.target.z) * k;
      c.update();
    }
    const done = Math.hypot(pose.position.x - camera.position.x, pose.position.y - camera.position.y, pose.position.z - camera.position.z) < 0.02;
    if (done) {
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      if (c) {
        c.target.set(pose.target.x, pose.target.y, pose.target.z);
        c.update();
      }
      active.current = false;
      onSettled();
    }
    invalidate();
  });
  return null;
}

/** One guaranteed frame after mount, since frameloop="demand" draws nothing on its own. */
function KickFirstFrame() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(id);
  }, [invalidate]);
  return null;
}

function strandsOf(ui: UiSessionState, nodeId: string): Array<{ tubeColor: FiberTubeColor; fiberColor: FiberTubeColor }> {
  const spans = ui.world.topology.spans.filter((s) => s.fromNodeId === nodeId || s.toNodeId === nodeId);
  const out: Array<{ tubeColor: FiberTubeColor; fiberColor: FiberTubeColor }> = [];
  for (const s of spans) for (const st of s.strands ?? []) out.push({ tubeColor: st.tubeColor, fiberColor: st.fiberColor });
  return out;
}

export function SceneContents({ ui, layout, mode, selectedId, openIds, selectedTray, quality, onSelect, onSelectTray }: PlantSceneProps) {
  const [draftClaims] = useViewportState<DiagnosisClaim[]>('diagnose.claims', []);
  const overlay = useMemo(() => buildMapOverlay(ui, draftClaims), [ui, draftClaims]);
  const shot = useMemo(() => (mode === 'trace' ? lastOtdrShot(ui) : null), [ui, mode]);
  const tracedSpanIds = useMemo(() => new Set(shot?.pathSpanIds ?? []), [shot]);
  const open = useMemo(() => new Set(openIds), [openIds]);
  const xray = mode === 'cutaway' || mode === 'trace';

  const nodeMarks: Record<string, NodeMark | null> = useMemo(() => {
    const out: Record<string, NodeMark | null> = {};
    for (const p of layout.placements) out[p.nodeId] = dominantNodeMark(overlay.nodes[p.nodeId]);
    return out;
  }, [layout, overlay]);
  const spanMarks: Record<string, SpanMark | null> = useMemo(() => {
    const out: Record<string, SpanMark | null> = {};
    for (const r of layout.routes) out[r.spanId] = dominantSpanMark(overlay.spans[r.spanId]);
    return out;
  }, [layout, overlay]);

  const losPorts = useMemo(() => {
    const out = new Set<string>();
    for (const a of ui.log) {
      if (a.type !== 'cli') continue;
      for (const f of a.facts) {
        if (f.kind !== 'ont-status-observed' || f.status === 'online') continue;
        for (const d of ui.world.devices) for (const p of d.ponPorts ?? []) if (p.onts.some((o) => o.ontId === f.ontId)) out.add(p.id);
      }
    }
    return out;
  }, [ui]);

  const locateMarkXs = useMemo(() => {
    const xs: number[] = [];
    for (const n of ui.world.topology.nodes) {
      if (!n.attributes?.locateTicket) continue;
      const p = layout.placements.find((pl) => pl.nodeId === n.id);
      if (p) xs.push(p.position.x);
    }
    return xs;
  }, [ui, layout]);

  const holeXs = useMemo(() => layout.placements.filter((p) => p.kind === 'handhole').map((p) => p.position.x), [layout]);
  const houses = layout.placements.filter((p) => p.kind === 'house');
  const oltDevice = ui.world.devices.find((d) => d.role === 'olt');
  const decorated = quality === 'full';

  return (
    <>
      <KickFirstFrame />
      <ambientLight intensity={0.62} />
      <hemisphereLight args={['#cfe2ff', '#6b5a44', 0.55]} />
      <directionalLight position={[-30, 45, -20]} intensity={1.25} castShadow={false} />
      <fog attach="fog" args={['#b9c6d4', 60, quality === 'full' ? 260 : 160]} />
      <color attach="background" args={['#aebfd0']} />

      <Ground layout={layout} xray={xray} decorated={decorated} locateMarkXs={locateMarkXs} holeXs={holeXs} />
      <CableRoutes layout={layout} spanMarks={spanMarks} tracedSpanIds={tracedSpanIds} xray={xray} />
      {shot && <TraceMarkers layout={layout} shot={shot} />}

      {layout.placements.map((p) => {
        const current = ui.locationNodeId === p.nodeId;
        const selected = selectedId === p.nodeId;
        const mark = nodeMarks[p.nodeId];
        switch (p.kind) {
          case 'pop':
            if (p.node.kind !== 'olt') return null;
            return <PopBuilding key={p.nodeId} placement={p} oltDevice={oltDevice} losPorts={losPorts} selected={selected} current={current} mark={mark} open={open.has(p.nodeId) || xray} onSelect={onSelect} />;
          case 'fdh': {
            const splitter = layout.placements.find((s) => s.kind === 'splitter' && s.parentNodeId === p.nodeId);
            const splitterNode = splitter?.node ?? ui.world.topology.nodes.find((n) => n.kind === 'splitter');
            const dist = splitterNode ? ui.world.topology.spans.filter((s) => s.fromNodeId === splitterNode.id) : [];
            const feeder = splitterNode ? ui.world.topology.spans.find((s) => s.toNodeId === splitterNode.id) : undefined;
            return (
              <FdhCabinet
                key={p.nodeId}
                placement={p}
                splitter={splitterNode}
                distSpans={dist}
                feederSpan={feeder}
                open={open.has(p.nodeId) || (splitter ? open.has(splitter.nodeId) : false) || xray}
                selected={selected}
                current={current || (splitter ? ui.locationNodeId === splitter.nodeId : false)}
                mark={mark ?? (splitter ? nodeMarks[splitter.nodeId] : null)}
                onSelect={onSelect}
                splitterSelected={splitter ? selectedId === splitter.nodeId : false}
              />
            );
          }
          case 'handhole':
            return (
              <Handhole
                key={p.nodeId}
                placement={p}
                open={open.has(p.nodeId) || xray}
                closureOpen={open.has(`${p.nodeId}__closure`) || (xray && selected)}
                strands={strandsOf(ui, p.nodeId)}
                selected={selected}
                current={current}
                mark={mark}
                onSelect={onSelect}
                selectedTray={selectedTray}
                onSelectTray={onSelectTray}
                contents={p.node.kind === 'splice-closure' ? 'closure' : 'terminal'}
              />
            );
          case 'house': {
            const ont = layout.placements.find((o) => o.kind === 'ont' && o.parentNodeId === p.nodeId);
            const nid = layout.placements.find((n) => n.kind === 'nid' && n.parentNodeId === p.nodeId);
            const ontId = ont?.nodeId ?? '';
            const drop = ui.world.topology.spans.find((s) => s.toNodeId === ontId);
            const dropColor = drop?.strands?.[0] ? TUBE_COLORS[drop.strands[0].fiberColor] : '#e5e5e5';
            const leds = ontId ? ontLeds(ui, ontId) : { visible: false, power: 'off' as const, pon: 'off' as const, los: 'off' as const, lan: 'off' as const, basis: '' };
            return (
              <House
                key={p.nodeId}
                placement={p}
                index={houses.indexOf(p)}
                nid={nid}
                ont={ont}
                leds={leds}
                nidOpen={nid ? open.has(nid.nodeId) || xray : false}
                current={ui.locationNodeId === ontId || current}
                selectedId={selectedId}
                mark={ontId ? nodeMarks[ontId] : null}
                onSelect={onSelect}
                dropColor={dropColor}
                decorated={decorated}
              />
            );
          }
          case 'yard':
            return <Yard key={p.nodeId} placement={p} current={current} selected={selected} onSelect={onSelect} />;
          default:
            return null;
        }
      })}

      {layout.pedestals.map((ped) => (
        <NapPedestal
          key={ped.groupId}
          position={[ped.position.x, 0, ped.position.z]}
          label={ped.label}
          ports={layout.placements.filter((p) => p.groupId === ped.groupId)}
          selectedId={selectedId}
          currentId={ui.locationNodeId}
          marks={nodeMarks}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

export function PlantScene(props: Omit<PlantSceneProps, 'layout'> & { layout: SceneLayout; focus: Placement | null }) {
  const { ui, layout, mode, focus, quality } = props;
  const controls = useRef<OrbitControlsImpl>(null);
  const [userMoved, setUserMoved] = useState(false);
  const tracedSpanIds = useMemo(() => lastOtdrShot(ui)?.pathSpanIds ?? [], [ui]);
  const pose = useMemo(() => poseFor(mode, layout, focus, tracedSpanIds), [mode, layout, focus, tracedSpanIds]);

  useEffect(() => setUserMoved(false), [mode, focus?.nodeId]);

  return (
    <Canvas
      frameloop="demand"
      dpr={quality === 'full' ? [1, 1.6] : [0.75, 1]}
      gl={{ antialias: quality === 'full', powerPreference: 'low-power' }}
      camera={{ position: [pose.position.x, pose.position.y, pose.position.z], fov: 55, near: 0.05, far: 400 }}
      style={{ background: '#aebfd0', touchAction: 'none' }}
      onPointerMissed={() => props.onSelect(null)}
    >
      {!userMoved && <CameraRig pose={pose} controls={controls} onSettled={() => undefined} />}
      <SceneContents {...props} />
      <OrbitControls
        ref={controls}
        makeDefault
        target={[pose.target.x, pose.target.y, pose.target.z]}
        enableDamping={false}
        enablePan
        maxPolarAngle={Math.PI / 2.02}
        minDistance={0.35}
        maxDistance={260}
        zoomSpeed={0.8}
        rotateSpeed={0.65}
        onStart={() => setUserMoved(true)}
      />
    </Canvas>
  );
}

export { layoutScene };
