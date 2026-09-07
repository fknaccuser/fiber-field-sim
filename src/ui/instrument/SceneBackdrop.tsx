/**
 * The equipment you are standing at, shown behind a held instrument: the real scene and the
 * real models the World tab uses, framed on the trainee's current location and left
 * non-interactive so taps land on the device instead.
 *
 * Only one instrument viewport is mounted at a time (ViewportHost's 'unmount' policy), so
 * this never coexists with the World tab's canvas.
 *
 * CURRENT BEHAVIOUR, SLATED FOR REMOVAL: rather than staying live, this renders a single
 * frame, copies it to a data URL and swaps in an <img>, then reports ready. That was done to
 * satisfy a mis-stated invariant ("never more than one <canvas> element"); the real rule is
 * one *WebGL context*, and a 2D trace canvas alongside this one was always fine. The
 * snapshot costs a synchronous PNG encode per raise and — worse — HeldDevice gates the
 * instrument screen on it, so a frame that never arrives leaves the device permanently
 * blank. See docs/architecture/item-9-stow-raise.md, follow-up F1: restore the live render
 * and un-gate the screen.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { UiSessionState } from '../../session/runner';
import { layoutScene } from '../scene/sceneLayout';
import { SceneContents } from '../scene/PlantScene';
import { frame } from '../scene/camera';

function Capture({ onCapture }: { onCapture(image: string): void }) {
  const captured = useRef(false);
  useFrame(({ gl, scene, camera }) => {
    if (captured.current) return;
    gl.render(scene, camera);
    captured.current = true;
    onCapture(gl.domElement.toDataURL('image/png'));
  }, 1);
  return null;
}

export function SceneBackdrop({ ui, open, onReady }: { ui: UiSessionState; open: string[]; onReady(): void }) {
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const layout = useMemo(() => layoutScene(ui.world.topology.nodes, ui.world.topology.spans, ui.world.hosts), [ui.world.topology.nodes, ui.world.topology.spans, ui.world.hosts]);
  const focus = useMemo(() => {
    const direct = layout.placements.find((p) => p.nodeId === ui.locationNodeId);
    if (direct) return direct;
    return layout.placements.find((p) => p.parentNodeId === ui.locationNodeId) ?? null;
  }, [layout, ui.locationNodeId]);
  const pose = useMemo(() => (focus ? frame(focus, 'cutaway') : null), [focus]);
  const openIds = useMemo(() => [...open, ...(focus ? [focus.nodeId, `${focus.nodeId}__closure`] : [])], [open, focus]);
  useEffect(() => { if (snapshot || !pose || !focus) onReady(); }, [snapshot, pose, focus]);

  if (!pose || !focus) return <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(#1b2530, #0b0f14)' }} />;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
      {snapshot ? <img src={snapshot} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Canvas
        frameloop="demand"
        dpr={[0.7, 1]}
        gl={{ antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: true }}
        camera={{ position: [pose.position.x, pose.position.y, pose.position.z], fov: 55, near: 0.05, far: 400 }}
        style={{ background: '#aebfd0' }}
        onCreated={({ camera }) => camera.lookAt(pose.target.x, pose.target.y, pose.target.z)}
      >
        <SceneContents ui={ui} layout={layout} mode="cutaway" selectedId={focus.nodeId} openIds={openIds} selectedTray={0} quality="reduced" onSelect={() => undefined} onSelectTray={() => undefined} />
        <Capture onCapture={setSnapshot} />
      </Canvas>}
      {/* Depth-of-field stand-in: the equipment sits behind the device you are holding. */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 35%, rgba(11,15,20,0) 30%, rgba(11,15,20,0.55) 100%)' }} />
    </div>
  );
}
