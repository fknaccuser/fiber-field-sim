/**
 * The print, drawn as a print.
 *
 * Deliberately SVG rather than a second WebGL view: a paper drawing is line work and
 * lettering, it costs no GL context, and it keeps the one-context invariant intact so the
 * world scene can stay alive behind it.
 *
 * Everything is projected to screen pixels by hand instead of leaning on a viewBox, so a
 * line weight and a letter height mean the same thing on all three sheets — which is the
 * entire point of a scaled drawing.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { UiSessionState } from '../../session/runner';
import type { DiagnosisClaim } from '../../session/types';
import { layoutScene, type SceneLayout, PARKWAY_Z, SIDEWALK_Z, STREET_HALF_WIDTH, TRENCH_Z, HOUSE_D, HOUSE_W, type Placement, type PlacementKind } from './layout';
import { useViewportState } from '../viewport/viewportStore';
import { buildMapOverlay, dominantNodeMark, dominantSpanMark, type NodeMark } from './mapOverlay';
import {
  fitFrame,
  formatMetres,
  frameFor,
  gridStep,
  isInside,
  planPoint,
  orientation,
  polylineMidpoint,
  rotatePoint,
  scaleBarMetres,
  scaleDenominator,
  sheetLabel,
  ZOOM_ORDER,
  ZOOM_LABEL,
  type Frame,
  type Point,
  type ZoomLevel,
} from './sheet';

const INK = '#7fd4e8';
const INK_FAINT = 'rgba(127,212,232,0.20)';
const INK_GHOST = 'rgba(127,212,232,0.09)';
const REDLINE = '#ff6b00';
const ALARM = '#ff4d5e';
const HERE = '#34d399';

const MARK_INK: Record<NodeMark, string> = {
  current: HERE,
  alarm: ALARM,
  claimed: REDLINE,
  tested: '#00f0ff',
  visited: 'rgba(127,212,232,0.55)',
};

/** How far out each sheet still bothers to letter things. A wide sheet with every label on it is unreadable. */
const LABELS_AT: Record<ZoomLevel, PlacementKind[]> = {
  site: ['pop', 'fdh', 'splitter', 'handhole', 'pedestal', 'ont', 'nid', 'house', 'yard', 'device'],
  neighbourhood: ['pop', 'fdh', 'handhole', 'pedestal', 'yard'],
  branch: ['pop', 'fdh', 'yard'],
};

interface Projector {
  (p: Point): Point;
  k: number;
}

function makeProjector(frame: Frame, w: number, h: number, rotate: boolean): Projector {
  const k = w / frame.w;
  const fn = ((p: Point) => {
    const q = rotate ? rotatePoint(p) : p;
    return { x: (q.x - frame.x) * k, y: (q.y - frame.y) * (h / frame.h) };
  }) as Projector;
  fn.k = k;
  return fn;
}

/** Plan symbols. Line-art only — a print has no fills, no shading, no gloss. */
function Symbol({ kind, r, stroke }: { kind: PlacementKind; r: number; stroke: string }) {
  const common = { fill: 'none', stroke, strokeWidth: 1.3, vectorEffect: 'non-scaling-stroke' as const };
  switch (kind) {
    case 'pop':
      return (
        <g {...common}>
          <rect x={-r} y={-r} width={r * 2} height={r * 2} />
          <rect x={-r * 0.55} y={-r * 0.55} width={r * 1.1} height={r * 1.1} />
        </g>
      );
    case 'fdh':
      return (
        <g {...common}>
          <rect x={-r} y={-r * 0.8} width={r * 2} height={r * 1.6} />
          <line x1={0} y1={-r * 0.8} x2={0} y2={r * 0.8} />
          <line x1={-r} y1={-r * 0.8} x2={r} y2={r * 0.8} />
        </g>
      );
    case 'splitter':
      return (
        <g {...common}>
          <polygon points={`0,${-r} ${r},${r * 0.7} ${-r},${r * 0.7}`} />
        </g>
      );
    case 'handhole':
      // Square with an X: the standard plan symbol for a below-grade access point.
      return (
        <g {...common}>
          <rect x={-r} y={-r} width={r * 2} height={r * 2} />
          <line x1={-r} y1={-r} x2={r} y2={r} />
          <line x1={r} y1={-r} x2={-r} y2={r} />
        </g>
      );
    case 'pedestal':
      return (
        <g {...common}>
          <rect x={-r * 0.7} y={-r} width={r * 1.4} height={r * 2} rx={r * 0.3} />
          <line x1={-r * 0.7} y1={-r * 0.35} x2={r * 0.7} y2={-r * 0.35} />
        </g>
      );
    case 'ont':
    case 'nid':
      return (
        <g {...common}>
          <rect x={-r * 0.7} y={-r * 0.55} width={r * 1.4} height={r * 1.1} />
        </g>
      );
    case 'yard':
      return (
        <g {...common}>
          <circle cx={0} cy={0} r={r} />
          <line x1={-r} y1={0} x2={r} y2={0} />
          <line x1={0} y1={-r} x2={0} y2={r} />
        </g>
      );
    case 'device':
      return (
        <g {...common}>
          <rect x={-r} y={-r * 0.5} width={r * 2} height={r} />
        </g>
      );
    case 'house':
      return null;
  }
}

function TitleBlock({ ui, level, frame, w, h }: { ui: UiSessionState; level: ZoomLevel; frame: Frame; w: number; h: number }) {
  const rows: Array<[string, string]> = [
    ['DRAWING', ui.meta.scenarioId.toUpperCase()],
    ['SCALE', `1:${scaleDenominator(frame)}`],
    ['SHEET', `${ZOOM_ORDER.indexOf(level) + 1} OF ${ZOOM_ORDER.length}`],
    ['REV', `SEED ${ui.meta.seed}`],
  ];
  const bw = 168;
  const bh = 16 + rows.length * 13;
  const x = w - bw - 10;
  const y = h - bh - 10;
  if (w < 260 || h < 190) return null;
  return (
    <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>
      <rect width={bw} height={bh} fill="rgba(5,11,20,0.92)" stroke={INK} strokeWidth={1} />
      <text x={7} y={12} fill={INK} fontSize={8.5} letterSpacing={1.4} fontFamily="var(--font-display)">
        OSP RECORD DRAWING
      </text>
      <line x1={0} y1={16} x2={bw} y2={16} stroke={INK} strokeWidth={0.6} opacity={0.6} />
      {rows.map(([k, v], i) => (
        <g key={k} transform={`translate(0,${16 + i * 13})`}>
          <text x={7} y={9.5} fill="rgba(127,212,232,0.6)" fontSize={7.5} letterSpacing={1} fontFamily="var(--font-display)">
            {k}
          </text>
          <text x={62} y={9.5} fill={INK} fontSize={8} fontFamily="var(--font-mono)">
            {v}
          </text>
        </g>
      ))}
    </g>
  );
}

function NorthArrow({ x, y, rotated }: { x: number; y: number; rotated: boolean }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${rotated ? 90 : 0})`} style={{ pointerEvents: 'none' }} stroke={INK} fill="none" strokeWidth={1.1}>
      <circle cx={0} cy={0} r={13} opacity={0.45} />
      <polygon points="0,-11 5,4 0,0 -5,4" fill={INK} stroke="none" />
      <text x={0} y={-15} fill={INK} fontSize={8} letterSpacing={1.4} textAnchor="middle" stroke="none" fontFamily="var(--font-display)">
        N
      </text>
    </g>
  );
}

function ScaleBar({ frame, k, x, y }: { frame: Frame; k: number; x: number; y: number }) {
  const metres = scaleBarMetres(frame);
  const px = metres * k;
  return (
    <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>
      <line x1={0} y1={0} x2={px} y2={0} stroke={INK} strokeWidth={1.2} />
      <line x1={0} y1={-4} x2={0} y2={4} stroke={INK} strokeWidth={1.2} />
      <line x1={px / 2} y1={-3} x2={px / 2} y2={3} stroke={INK} strokeWidth={0.8} opacity={0.6} />
      <line x1={px} y1={-4} x2={px} y2={4} stroke={INK} strokeWidth={1.2} />
      <text x={px / 2} y={-8} fill={INK} fontSize={8.5} textAnchor="middle" fontFamily="var(--font-mono)">
        {formatMetres(metres)}
      </text>
    </g>
  );
}

export function Blueprint({
  ui,
  level,
  selectedNodeId,
  onSelectNode,
}: {
  ui: UiSessionState;
  level: ZoomLevel;
  selectedNodeId: string | null;
  onSelectNode(id: string | null): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = (w: number, h: number) => setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));

    // Measure synchronously first. ResizeObserver callbacks are delivered during a
    // rendering update, and a document that is not being rendered — a background tab, or
    // this keep-alive sheet mounted while another viewport is on top — never gets one. So
    // the observer alone can leave the drawing blank until something else forces a frame.
    const r0 = el.getBoundingClientRect();
    measure(Math.round(r0.width), Math.round(r0.height));

    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      measure(Math.round(r.width), Math.round(r.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(
    () => layoutScene(ui.world.topology.nodes, ui.world.topology.spans, ui.world.hosts),
    [ui.world.topology.nodes, ui.world.topology.spans, ui.world.hosts],
  );
  const [draftClaims] = useViewportState<DiagnosisClaim[]>('diagnose.claims', []);
  const overlay = useMemo(() => buildMapOverlay(ui, draftClaims), [ui, draftClaims]);

  const { w, h } = size;
  // Frame the subject, decide which way up the sheet reads best, then fit it to the
  // viewport. Rotation is chosen from the drawing's own proportions, not hard-coded.
  const oriented = useMemo(() => {
    if (w <= 0 || h <= 0) return null;
    const o = orientation(frameFor(level, layout, ui.locationNodeId), w / h);
    return { rotate: o.rotate, frame: fitFrame(o.frame, w / h) };
  }, [level, layout, ui.locationNodeId, w, h]);
  const frame = oriented?.frame ?? null;
  const rotate = oriented?.rotate ?? false;
  const project = useMemo(() => (frame ? makeProjector(frame, w, h, rotate) : null), [frame, w, h, rotate]);

  const body = (() => {
    if (!frame || !project) return null;
    const k = project.k;
    const step = gridStep(frame);
    const showGround = level !== 'branch';
    const labelKinds = LABELS_AT[level];

    // Grid, snapped to whole metres so it reads as a survey grid rather than screen pixels.
    const gridLines: React.ReactElement[] = [];
    const firstX = Math.ceil(frame.x / step) * step;
    for (let gx = firstX; gx <= frame.x + frame.w; gx += step) {
      const px = project({ x: gx, y: 0 }).x;
      gridLines.push(<line key={`vx${gx}`} x1={px} y1={0} x2={px} y2={h} stroke={gx === 0 ? INK_FAINT : INK_GHOST} strokeWidth={gx === 0 ? 1 : 0.6} />);
    }
    const firstY = Math.ceil(frame.y / step) * step;
    for (let gy = firstY; gy <= frame.y + frame.h; gy += step) {
      const py = project({ x: 0, y: gy }).y;
      gridLines.push(<line key={`hz${gy}`} x1={0} y1={py} x2={w} y2={py} stroke={gy === 0 ? INK_FAINT : INK_GHOST} strokeWidth={gy === 0 ? 1 : 0.6} />);
    }

    const bandY = (zA: number, zB: number) => {
      const a = project({ x: 0, y: -zA }).y;
      const b = project({ x: 0, y: -zB }).y;
      return { y: Math.min(a, b), height: Math.abs(a - b) };
    };
    const x0 = project({ x: layout.street.xMin, y: 0 }).x;
    const x1 = project({ x: layout.street.xMax, y: 0 }).x;

    return (
      <>
        <g>{gridLines}</g>

        {showGround && (
          <g>
            {/* Right of way: kerb lines, walk, parkway, and the trench the distribution runs in. */}
            <rect x={x0} {...bandY(-STREET_HALF_WIDTH, STREET_HALF_WIDTH)} width={x1 - x0} fill="rgba(127,212,232,0.045)" stroke={INK_FAINT} strokeWidth={1} />
            <line
              x1={x0}
              y1={project({ x: 0, y: 0 }).y}
              x2={x1}
              y2={project({ x: 0, y: 0 }).y}
              stroke={INK_FAINT}
              strokeWidth={1}
              strokeDasharray="10 8"
            />
            <rect x={x0} {...bandY(SIDEWALK_Z[0], SIDEWALK_Z[1])} width={x1 - x0} fill="none" stroke={INK_GHOST} strokeWidth={1} />
            <rect x={x0} {...bandY(PARKWAY_Z[0], PARKWAY_Z[1])} width={x1 - x0} fill="none" stroke={INK_GHOST} strokeWidth={1} />
            <line
              x1={x0}
              y1={project({ x: 0, y: -TRENCH_Z }).y}
              x2={x1}
              y2={project({ x: 0, y: -TRENCH_Z }).y}
              stroke={INK_FAINT}
              strokeWidth={0.8}
              strokeDasharray="3 4"
            />
            {/* Lot lines and house footprints, drawn at their true size. */}
            {layout.lots.map((lot) => {
              const lx = project({ x: lot.x - lot.width / 2, y: 0 }).x;
              const lw = lot.width * k;
              const top = project({ x: 0, y: -(HOUSE_D + 24) }).y;
              const bottom = project({ x: 0, y: -PARKWAY_Z[1] }).y;
              return <line key={lot.houseNodeId} x1={lx} y1={top} x2={lx} y2={bottom} stroke={INK_GHOST} strokeWidth={0.7} strokeDasharray="6 5" opacity={lw > 6 ? 1 : 0} />;
            })}
            {layout.placements
              .filter((p) => p.kind === 'house')
              .map((p) => {
                const c = project(planPoint(p.position));
                return (
                  <rect
                    key={p.nodeId}
                    x={c.x - (HOUSE_W * k) / 2}
                    y={c.y - (HOUSE_D * k) / 2}
                    width={HOUSE_W * k}
                    height={HOUSE_D * k}
                    fill="rgba(127,212,232,0.04)"
                    stroke={INK_FAINT}
                    strokeWidth={0.9}
                  />
                );
              })}
          </g>
        )}

        {/* Cable runs. Weight carries the hierarchy the way it does on a real sheet. */}
        <g fill="none" strokeLinejoin="round" strokeLinecap="round">
          {layout.routes.map((route) => {
            const mark = dominantSpanMark(overlay.spans[route.spanId]);
            const d = route.points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${project(planPoint(v)).x.toFixed(1)} ${project(planPoint(v)).y.toFixed(1)}`).join(' ');
            const weight = route.kind === 'feeder' ? 2.4 : route.kind === 'distribution' ? 1.6 : 1;
            return (
              <path
                key={route.spanId}
                d={d}
                stroke={mark ? MARK_INK[mark] : INK}
                strokeWidth={mark ? weight + 1 : weight}
                opacity={mark ? 1 : route.kind === 'drop' ? 0.45 : 0.7}
                strokeDasharray={mark === 'claimed' ? '7 5' : route.kind === 'drop' ? '5 4' : undefined}
              />
            );
          })}
        </g>

        {/* Dimensions: cable lengths, called out where there is room to read them. */}
        {level !== 'branch' && (
          <g style={{ pointerEvents: 'none' }}>
            {dimensionCallouts(layout, frame, project, rotate).map((c) => (
              <g key={c.key} transform={`translate(${c.x.toFixed(1)},${(c.y - 6).toFixed(1)})`}>
                <rect x={-c.text.length * 2.6 - 4} y={-8} width={c.text.length * 5.2 + 8} height={11} fill="rgba(5,11,20,0.85)" />
                <text x={0} y={0} fill="rgba(127,212,232,0.85)" fontSize={8} textAnchor="middle" fontFamily="var(--font-mono)">
                  {c.text}
                </text>
              </g>
            ))}
          </g>
        )}

        {/* Plant symbols. */}
        <g>
          {/*
            A plan shows the pedestal, not its eight ports stacked on the same spot. So the
            pedestal is drawn once per physical cabinet, and it carries the worst mark of
            any port inside it — which is how you would read a marked-up sheet.
          */}
          {layout.pedestals.map((ped) => {
            const plan = planPoint(ped.position);
            if (!isInside(frame, rotate ? rotatePoint(plan) : plan, 4)) return null;
            const c = project(plan);
            const mark = dominantNodeMark(ped.portNodeIds.flatMap((id) => overlay.nodes[id] ?? []));
            const target = ped.portNodeIds[0] ?? null;
            const selected = target !== null && selectedNodeId === target;
            const r = Math.max(5, Math.min(1.1 * k, 26));
            return (
              <g key={ped.groupId} transform={`translate(${c.x.toFixed(1)},${c.y.toFixed(1)})`} onClick={() => target && onSelectNode(target)} style={{ cursor: 'pointer' }}>
                <circle cx={0} cy={0} r={Math.max(r + 8, 16)} fill="transparent" />
                {mark === 'current' && <circle cx={0} cy={0} r={r + 7} fill="none" stroke={HERE} strokeWidth={1.1} className="pulse-ring" />}
                {selected && <circle cx={0} cy={0} r={r + 5} fill="none" stroke="#ffffff" strokeWidth={0.9} strokeDasharray="3 3" />}
                <Symbol kind="pedestal" r={r} stroke={selected ? '#ffffff' : mark ? MARK_INK[mark] : INK} />
                {LABELS_AT[level].includes('pedestal') && (
                  <text x={0} y={r + 11} fill={mark ? MARK_INK[mark] : 'rgba(127,212,232,0.75)'} fontSize={8} textAnchor="middle" letterSpacing={0.6} fontFamily="var(--font-display)">
                    {sheetLabel(ped.label, level).toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}

          {layout.placements
            .filter((p) => p.kind !== 'house' && p.kind !== 'pedestal' && (level === 'site' || p.kind !== 'splitter'))
            .map((p) => {
              const plan = planPoint(p.position);
              if (!isInside(frame, rotate ? rotatePoint(plan) : plan, 4)) return null;
              const c = project(plan);
              const mark = dominantNodeMark(overlay.nodes[p.nodeId]);
              const selected = selectedNodeId === p.nodeId;
              const stroke = selected ? '#ffffff' : mark ? MARK_INK[mark] : INK;
              const r = symbolRadius(p, k);
              return (
                <g key={p.nodeId} transform={`translate(${c.x.toFixed(1)},${c.y.toFixed(1)})`} onClick={() => onSelectNode(p.nodeId)} style={{ cursor: 'pointer' }}>
                  {/* Generous invisible target: this is a phone, and a 9 px symbol is not a tap target. */}
                  <circle cx={0} cy={0} r={Math.max(r + 8, 16)} fill="transparent" />
                  {mark === 'current' && <circle cx={0} cy={0} r={r + 7} fill="none" stroke={HERE} strokeWidth={1.1} opacity={0.85} className="pulse-ring" />}
                  {selected && <circle cx={0} cy={0} r={r + 5} fill="none" stroke="#ffffff" strokeWidth={0.9} strokeDasharray="3 3" />}
                  <Symbol kind={p.kind} r={r} stroke={stroke} />
                  {labelKinds.includes(p.kind) && (
                    <text x={0} y={r + 11} fill={mark ? MARK_INK[mark] : 'rgba(127,212,232,0.75)'} fontSize={8} textAnchor="middle" letterSpacing={0.6} fontFamily="var(--font-display)">
                      {sheetLabel(p.node.label, level).toUpperCase()}
                    </text>
                  )}
                </g>
              );
            })}
        </g>

        <NorthArrow x={w - 26} y={30} rotated={rotate} />
        <ScaleBar frame={frame} k={k} x={16} y={h - 18} />
        <TitleBlock ui={ui} level={level} frame={frame} w={w} h={h} />
      </>
    );
  })();

  return (
    <div ref={box} style={{ position: 'absolute', inset: 0, background: 'var(--void)' }}>
      <svg width="100%" height="100%" style={{ display: 'block', touchAction: 'manipulation' }} onClick={(e) => e.target === e.currentTarget && onSelectNode(null)}>
        {body}
      </svg>
    </div>
  );
}

/**
 * Cable-length callouts, collapsed where they collide.
 *
 * Two fibres in the same duct share a route, so their labels land on exactly the same
 * pixel and overprint into an unreadable smudge. A real sheet calls that out once and
 * lists the lengths, so that is what this does.
 */
function dimensionCallouts(
  layout: SceneLayout,
  frame: Frame,
  project: Projector,
  rotate: boolean,
): Array<{ key: string; x: number; y: number; text: string }> {
  const groups = new Map<string, { x: number; y: number; lengths: number[]; key: string }>();

  for (const route of layout.routes) {
    if (route.kind === 'drop' || route.span.lengthMeters <= 0) continue;
    const mid = polylineMidpoint(route.points);
    if (!isInside(frame, rotate ? rotatePoint(mid) : mid, -6)) continue;
    const p = project(mid);
    // Round to a label's own width: anything closer than this would overlap anyway.
    const cell = `${Math.round(p.x / 34)}:${Math.round(p.y / 12)}`;
    const g = groups.get(cell);
    if (g) g.lengths.push(route.span.lengthMeters);
    else groups.set(cell, { x: p.x, y: p.y, lengths: [route.span.lengthMeters], key: route.spanId });
  }

  return [...groups.values()].map((g) => {
    const distinct = [...new Set(g.lengths)].sort((a, b) => a - b);
    const shown = distinct.slice(0, 2).map(formatMetres).join(' / ');
    return { key: g.key, x: g.x, y: g.y, text: distinct.length > 2 ? `${shown} +${distinct.length - 2}` : shown };
  });
}

/** Symbol sizes scale with the sheet but never shrink below a legible minimum. */
function symbolRadius(p: Placement, k: number): number {
  const metres: Record<PlacementKind, number> = {
    pop: 3.5,
    fdh: 1.6,
    splitter: 1.1,
    handhole: 1.2,
    pedestal: 1.1,
    ont: 0.8,
    nid: 0.8,
    yard: 2.5,
    device: 1.4,
    house: 5,
  };
  const min: Record<PlacementKind, number> = { pop: 9, fdh: 7, splitter: 5, handhole: 5, pedestal: 5, ont: 3.5, nid: 3.5, yard: 7, device: 5, house: 4 };
  return Math.max(min[p.kind], Math.min(metres[p.kind] * k, 26));
}

export { ZOOM_LABEL };
