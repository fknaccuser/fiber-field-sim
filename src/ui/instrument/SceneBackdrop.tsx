/**
 * The equipment you are standing at, live behind a held instrument: the same scene and the
 * same models the World tab uses — not a picture of one — framed on the trainee's current
 * location and left non-interactive so taps land on the device instead.
 *
 * Only one instrument viewport is mounted at a time (ViewportHost's 'unmount' policy), so
 * this never coexists with the World tab's canvas. The invariant is one *WebGL context*,
 * not one <canvas> element: a held OTDR legitimately has this plus its own 2D trace canvas.
 *
 * This used to render a single frame, copy it to a data URL and swap in an <img>, to satisfy
 * a mis-stated "one canvas element" rule. That cost a synchronous PNG encode on every raise
 * and, worse, the device screen was gated on the capture completing — so a frame that never
 * arrived (a backgrounded tab throttles rAF to zero) left the instrument permanently blank.
 * An idle `frameloop="demand"` canvas costs nothing once drawn, so the snapshot was solving
 * a problem that did not exist. See item-9-stow-raise.md, follow-up F1.
 */
import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type { UiSessionState } from '../../session/runner';
import { layoutScene } from '../scene/sceneLayout';
import { SceneContents } from '../scene/PlantScene';
import { frame } from '../scene/camera';

/** `frameloop="demand"` draws nothing until something invalidates; guarantee the first frame. */
function KickFirstFrame() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(id);
  }, [invalidate]);
  return null;
}

export function SceneBackdrop({ ui, open }: { ui: UiSessionState; open: string[] }) {
  const layout = useMemo(() => layoutScene(ui.world.topology.nodes, ui.world.topology.spans, ui.world.hosts), [ui.world.topology.nodes, ui.world.topology.spans, ui.world.hosts]);
  const focus = useMemo(() => {
    const direct = layout.placements.find((p) => p.nodeId === ui.locationNodeId);
    if (direct) return direct;
    return layout.placements.find((p) => p.parentNodeId === ui.locationNodeId) ?? null;
  }, [layout, ui.locationNodeId]);
  const pose = useMemo(() => (focus ? frame(focus, 'cutaway') : null), [focus]);
  const openIds = useMemo(() => [...open, ...(focus ? [focus.nodeId, `${focus.nodeId}__closure`] : [])], [open, focus]);

  if (!pose || !focus) return <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(#101a2b, #050b14)' }} />;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
      <Canvas
        frameloop="demand"
        dpr={[0.7, 1]}
        gl={{ antialias: false, powerPreference: 'low-power' }}
        camera={{ position: [pose.position.x, pose.position.y, pose.position.z], fov: 55, near: 0.05, far: 400 }}
        style={{ background: '#aebfd0' }}
        onCreated={({ camera }) => camera.lookAt(pose.target.x, pose.target.y, pose.target.z)}
      >
        <KickFirstFrame />
        <SceneContents ui={ui} layout={layout} mode="cutaway" selectedId={focus.nodeId} openIds={openIds} selectedTray={0} quality="reduced" onSelect={() => undefined} onSelectTray={() => undefined} />
      </Canvas>
      {/* Depth-of-field stand-in: the equipment sits behind the device you are holding. */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 35%, rgba(5,11,20,0) 30%, rgba(5,11,20,0.62) 100%)' }} />
    </div>
  );
}
