/**
 * Dressing a tray by hand, on the tray.
 *
 * The old tray bench asked two questions per fibre — round the limiter or straight across,
 * real slack or just enough — and it was honest about being a set of choices rather than a
 * task. Dressing is not a set of choices. It is a shape you make with your hands, judged by
 * eye, and the two mistakes that matter most (a bend inside the radius, and slack that is not
 * really there) are things you can only get wrong by *doing* it.
 *
 * So this is the tray, and you route the ribbon on it: in through the entry slot, under the
 * retention fingers, round the limiters enough times to store real slack, into a holder. The
 * trade is the whole lesson — every extra lap buys slack and costs you room, and winding it
 * tighter to fit more laps in is how a tidy-looking tray ends up attenuating.
 *
 * WHAT IS AND IS NOT DECIDED HERE. Nothing. The route is measured by `dressing.ts` and judged
 * by `judgeTray`, both pure, both tested without a renderer. This file turns a drag into a
 * polyline and draws it. That separation is what lets the bench be rebuilt, or drawn wrong,
 * without the grading moving.
 */
import { Suspense, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  buildTrayGeometry,
  capturedAnchors,
  measureRoute,
  pathsCross,
  resample,
  seatedHolder,
  type Anchor,
  type TrayGeometry,
  type Vec2,
} from '../../operations/dressing';
import { judgeTray, MIN_SLACK_MM, type FibrePlacement, type Tray } from '../../operations/tray';
import { CABINETS, CLOSURES, type ClosureForm } from '../../operations/catalog';
import { BENCH_DOMAINS, scoreTrayRun } from '../../operations/benchRecord';
import { getOrCreateTraineeId, saveBenchRun } from '../store/persistence';
import { ClosureShell, Ribbon, TrayModel } from './trayModels';
import { MM } from './trayGeometry';
import { SoftKey } from '../components/SoftKey';
import { Chip } from '../components/Chip';

const TUBE_ORDER = ['blue', 'orange', 'green', 'brown'] as const;
const TUBE_HEX: Record<string, string> = { blue: '#3b82f6', orange: '#f97316', green: '#22c55e', brown: '#a16207' };

/** One ribbon on the bench, and wherever the trainee has laid it so far. */
interface Lay {
  tube: string;
  fibre: number;
  route: Vec2[];
}

/** The hardware you opened. All of them carry a tray; what changes is the case around it. */
type Hardware = { id: string; label: string; form: ClosureForm | 'cabinet'; holders: number; minBendRadiusMm: number; note: string };

const HARDWARE: Hardware[] = [
  ...CLOSURES.map((c) => ({ id: c.id, label: c.designation, form: c.form, holders: c.splicesPerTray, minBendRadiusMm: c.minBendRadiusMm, note: c.note })),
  ...CABINETS.map((c) => ({ id: c.id, label: c.designation, form: 'cabinet' as const, holders: 24, minBendRadiusMm: c.minBendRadiusMm, note: c.note })),
];

/**
 * The floor of the tray, as something a finger can hit.
 *
 * Invisible and slightly oversized: a route that runs a little outside the walls is a route
 * over the wall, which is a thing the trainee is allowed to do wrong. Clamping the pointer to
 * the tray would quietly prevent the mistake instead of catching it.
 */
function DragPlane({ geometry, enabled, onPoint, onEnd }: { geometry: TrayGeometry; enabled: boolean; onPoint(p: Vec2, starting: boolean): void; onEnd(): void }) {
  const dragging = useRef(false);
  const { gl } = useThree();

  const toTray = (event: ThreeEvent<PointerEvent>): Vec2 => ({ x: event.point.x / MM, z: event.point.z / MM });

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[(geometry.lengthMm / 2) * MM, 0, 0]}
      visible={false}
      onPointerDown={(e) => {
        if (!enabled) return;
        e.stopPropagation();
        dragging.current = true;
        gl.domElement.setPointerCapture?.(e.pointerId);
        onPoint(toTray(e), true);
      }}
      onPointerMove={(e) => {
        if (!enabled || !dragging.current) return;
        e.stopPropagation();
        onPoint(toTray(e), false);
      }}
      onPointerUp={() => { dragging.current = false; onEnd(); }}
      onPointerLeave={() => { if (dragging.current) { dragging.current = false; onEnd(); } }}
    >
      <planeGeometry args={[(geometry.lengthMm + 160) * MM, (geometry.widthMm + 160) * MM]} />
    </mesh>
  );
}

function Scene({
  geometry,
  hardware,
  lays,
  activeTube,
  look,
  onPoint,
  onEnd,
}: {
  geometry: TrayGeometry;
  hardware: Hardware;
  lays: Lay[];
  activeTube: string;
  look: boolean;
  onPoint(p: Vec2, starting: boolean): void;
  onEnd(): void;
}) {
  const active = lays.find((l) => l.tube === activeTube);
  // Light the features the ribbon is actually engaged with. Holders are the exception:
  // running the length of the rail passes a dozen of them, and lighting all twelve would say
  // the ribbon is seated in twelve holders. Only the one it ends in is seated.
  const captured = useMemo(() => {
    if (!active) return [] as Anchor[];
    const met = capturedAnchors(active.route, geometry).filter((a) => a.kind !== 'holder');
    const seat = seatedHolder(active.route, geometry);
    const holder = seat === null ? null : geometry.anchors.find((a) => a.kind === 'holder' && a.index === seat) ?? null;
    return holder ? [...met, holder] : met;
  }, [active, geometry]);

  return (
    <>
      <ambientLight intensity={1.15} />
      <hemisphereLight args={['#cfe4f5', '#1b232c', 0.9]} />
      <directionalLight position={[1.4, 2.6, 1.1]} intensity={2.1} castShadow={false} />
      <directionalLight position={[-1.6, 1.2, -1.4]} intensity={0.8} />
      <color attach="background" args={['#0b0f14']} />

      <group position={[-(geometry.lengthMm / 2) * MM, 0, 0]}>
        <ClosureShell form={hardware.form} geometry={geometry} />
        <TrayModel geometry={geometry} highlight={captured} />
        {lays.map((lay, i) => (
          <Ribbon key={lay.tube} points={lay.route} color={TUBE_HEX[lay.tube] ?? '#94a3b8'} lifted={i * 0.6} />
        ))}
        <DragPlane geometry={geometry} enabled={!look} onPoint={onPoint} onEnd={onEnd} />
      </group>

      {/* Looking around and laying ribbon are the same gesture on a phone, so they take
          turns. Orbit is off by default: you came here to dress a tray. */}
      {look && <OrbitControls enablePan={false} minPolarAngle={0.15} maxPolarAngle={1.35} minDistance={2.4} maxDistance={7} />}
    </>
  );
}

export function SpliceTrayBench() {
  const [hardware, setHardware] = useState<Hardware>(HARDWARE[0]);
  const [look, setLook] = useState(false);
  const [labelled, setLabelled] = useState(true);
  const [signedOff, setSignedOff] = useState(false);

  const geometry = useMemo(() => buildTrayGeometry(hardware.holders, hardware.minBendRadiusMm), [hardware]);

  const [lays, setLays] = useState<Lay[]>(() => TUBE_ORDER.map((tube, i) => ({ tube, fibre: i + 1, route: [] })));
  const [activeTube, setActiveTube] = useState<string>(TUBE_ORDER[0]);

  const addPoint = (p: Vec2, starting: boolean) => {
    if (signedOff) return;
    setLays((prev) =>
      prev.map((lay) => {
        if (lay.tube !== activeTube) return lay;
        // Starting a drag re-lays this ribbon from scratch: you pull it out and route it
        // again, you do not splice a new bit onto the end of the old route.
        if (starting) return { ...lay, route: [p] };
        const last = lay.route[lay.route.length - 1];
        if (last && Math.hypot(p.x - last.x, p.z - last.z) < 1.5) return lay;
        return { ...lay, route: [...lay.route, p] };
      }),
    );
  };

  const clearActive = () => setLays((prev) => prev.map((l) => (l.tube === activeTube ? { ...l, route: [] } : l)));

  // Every route the trainee has actually laid, measured and handed to the judge.
  const dressed = useMemo(() => lays.filter((l) => l.route.length >= 2), [lays]);
  const placements: FibrePlacement[] = useMemo(
    () =>
      dressed.map((lay) => {
        const m = measureRoute(lay.route, geometry);
        return {
          tube: lay.tube,
          fibre: lay.fibre,
          holder: m.holder,
          bendRadiusMm: Number.isFinite(m.bendRadiusMm) ? m.bendRadiusMm : 999,
          slackMm: m.slackMm,
          crossesOthers: dressed.some((other) => other.tube !== lay.tube && pathsCross(resample(lay.route, 4), resample(other.route, 4))),
          viaEntry: m.viaEntry,
          retained: m.retained,
        };
      }),
    [dressed, geometry],
  );

  const tray: Tray = useMemo(() => ({ id: `${hardware.label}-TRAY-1`, holders: hardware.holders, placements }), [hardware, placements]);
  const verdict = useMemo(() => judgeTray(tray, labelled, hardware.minBendRadiusMm), [tray, labelled, hardware]);

  const activeMeasure = useMemo(() => {
    const lay = lays.find((l) => l.tube === activeTube);
    return lay && lay.route.length >= 2 ? measureRoute(lay.route, geometry) : null;
  }, [lays, activeTube, geometry]);

  const signOff = async () => {
    setSignedOff(true);
    const traineeId = await getOrCreateTraineeId();
    await saveBenchRun({
      id: `tray3d-${Date.now()}`,
      traineeId,
      kind: 'tray-dress',
      at: new Date().toISOString(),
      seed: 0,
      mistakes: verdict.issues.map((i) => i.code),
      omitted: [],
      // Dressing a tray of ribbons is most of an hour once the splices are made.
      seconds: 45 * 60,
      passed: verdict.accepted,
      score: scoreTrayRun(verdict),
      domains: BENCH_DOMAINS['tray-dress'],
    });
  };

  const reset = () => {
    setLays(TUBE_ORDER.map((tube, i) => ({ tube, fibre: i + 1, route: [] })));
    setSignedOff(false);
    setActiveTube(TUBE_ORDER[0]);
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 620, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link to="/" style={{ fontSize: 12, color: 'var(--cyan)' }}>← Board</Link>
        <span className="eyebrow" style={{ color: 'var(--cyan)' }}>Tray dressing</span>
      </div>

      {/* The hardware you opened. The tray is the same job in all of them; the case is not. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {HARDWARE.map((h) => (
          <Chip key={h.id} active={h.id === hardware.id} onClick={() => { setHardware(h); reset(); }}>
            {h.label}
          </Chip>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
        {hardware.note} · {hardware.holders} holders · {hardware.minBendRadiusMm} mm limiters.
        <span className="mono" style={{ color: 'var(--orange)', marginLeft: 6, fontSize: 10, letterSpacing: 1 }}>CAPACITY UNVERIFIED</span>
      </div>

      {/* Which ribbon is in your hands. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {lays.map((lay) => (
          <button
            key={lay.tube}
            type="button"
            onClick={() => setActiveTube(lay.tube)}
            style={{
              minHeight: 36, padding: '5px 11px', borderRadius: 6, fontSize: 11.5,
              border: lay.tube === activeTube ? '2px solid var(--cyan)' : '1px solid var(--bezel)',
              background: lay.route.length >= 2 ? `${TUBE_HEX[lay.tube]}33` : 'transparent',
              color: 'var(--ink)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 5, background: TUBE_HEX[lay.tube] }} />
            {lay.tube}
          </button>
        ))}
        <Chip active={look} onClick={() => setLook(!look)}>{look ? 'Looking' : 'Look'}</Chip>
        <Chip onClick={clearActive} disabled={signedOff}>Pull it out</Chip>
      </div>

      <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: 'var(--ink-faint)', lineHeight: 1.6 }}>
        {look
          ? 'DRAG TO TURN THE CASE · TAP LOOK AGAIN TO GO BACK TO DRESSING'
          : `DRAG TO LAY THE ${activeTube.toUpperCase()} RIBBON · IN THROUGH THE SLOT, UNDER THE FINGERS, ROUND THE LIMITERS, INTO A HOLDER`}
      </div>

      <div style={{ height: 400, border: '1px solid var(--cyan-line)', background: 'var(--void)', touchAction: 'none' }}>
        <Suspense fallback={null}>
          <Canvas camera={{ position: [0, 3.4, 1.95], fov: 40 }} dpr={[1, 2]} onCreated={({ camera }) => camera.lookAt(new THREE.Vector3(0, 0, 0))}>
            <Scene
              geometry={geometry}
              hardware={hardware}
              lays={lays}
              activeTube={activeTube}
              look={look}
              onPoint={addPoint}
              onEnd={() => undefined}
            />
          </Canvas>
        </Suspense>
      </div>

      {/* Live readout for the ribbon in your hands: the four things the tray is judged on. */}
      {activeMeasure && (
        <div className="bezel" style={{ padding: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          {[
            ['SLACK', `${activeMeasure.slackMm} mm`, activeMeasure.slackMm >= MIN_SLACK_MM],
            ['TIGHTEST BEND', Number.isFinite(activeMeasure.bendRadiusMm) ? `${activeMeasure.bendRadiusMm} mm` : 'straight', !Number.isFinite(activeMeasure.bendRadiusMm) || activeMeasure.bendRadiusMm >= hardware.minBendRadiusMm],
            ['ENTRY', activeMeasure.viaEntry ? 'through the slot' : 'over the wall', activeMeasure.viaEntry],
            ['RETENTION', `${activeMeasure.fingersUsed} finger(s)`, activeMeasure.retained],
            ['HOLDER', activeMeasure.holder === null ? 'loose' : `#${activeMeasure.holder}`, activeMeasure.holder !== null],
          ].map(([label, value, ok]) => (
            <div key={label as string}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 1.3, color: 'var(--ink-faint)' }}>{label as string}</div>
              <div style={{ fontSize: 12.5, color: ok ? 'var(--led-ok)' : 'var(--orange)' }}>{value as string}</div>
            </div>
          ))}
        </div>
      )}

      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={labelled} onChange={(e) => setLabelled(e.target.checked)} disabled={signedOff} />
        Tray labelled and assignments recorded
      </label>

      {/* The verdict, live while you work and final once you sign it off. */}
      <div className={`bezel${verdict.accepted ? '' : ' alert'}`} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: verdict.accepted ? 'var(--led-ok)' : 'var(--orange)' }}>
          {dressed.length === 0 ? 'Nothing laid yet.' : verdict.summary}
        </div>
        {dressed.length > 0 && (
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--ink-soft)' }}>
            {dressed.length} OF {lays.length} DRESSED · {verdict.addedLossDb.toFixed(3)} dB ADDED{signedOff ? ` · SCORE ${scoreTrayRun(verdict)}` : ''}
          </div>
        )}
        {verdict.issues.map((issue, i) => (
          <div key={i} style={{ borderLeft: `2px solid ${issue.severity === 'defect' ? 'var(--red)' : 'var(--ink-faint)'}`, paddingLeft: 9 }}>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.3, color: issue.severity === 'defect' ? 'var(--red)' : 'var(--ink-soft)' }}>
              {issue.severity.toUpperCase()} · {issue.where.toUpperCase()}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{issue.detail}</div>
          </div>
        ))}
        {signedOff
          ? <SoftKey label="Dress another" tone="cyan" onClick={reset} />
          : <SoftKey label="Close the tray" disabled={dressed.length === 0} onClick={() => void signOff()} />}
      </div>
    </div>
  );
}
