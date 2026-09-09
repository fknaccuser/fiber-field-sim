/**
 * The locate bench: a DigAlert ticket answered.
 *
 * The whole task is one argument between two sources of truth. The print shows where the
 * cable was recorded; the wand shows where it is. A trainee who traces the print finishes in
 * ninety seconds with a tidy-looking ticket, and about a third of the time they have just
 * told a backhoe operator that it is safe to dig through the distribution main.
 *
 * So the drawing deliberately gives you the recorded routes for free and makes you work for
 * the actual ones. Sweeping paints readings, not lines: the wand tells you the signal under
 * your finger and nothing else, and joining those peaks into a facility is the trainee's
 * job — which is what locating is.
 *
 * Nothing here judges. Every verdict comes from `judgeLocate`, which is pure and tested; the
 * bench only collects where the trainee swept and where they painted.
 */
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { createRng, deriveSeed } from '../../world';
import { LEGAL_BASIS, MARK_COLORS, TOLERANCE_ZONE_INCHES } from '../../operations/digalert';
import {
  generateLocateJob,
  groundProjector,
  judgeLocate,
  MARK_TOLERANCE_M,
  signalAt,
  TELECOM_MARK_COLOR,
  type Mark,
  type Point,
} from '../../operations/locate';
import { BENCH_DOMAINS, scoreLocateRun } from '../../operations/benchRecord';
import { getOrCreateTraineeId, saveBenchRun } from '../store/persistence';
import { SoftKey } from '../components/SoftKey';
import { Chip } from '../components/Chip';

type Tool = 'sweep' | 'mark' | 'erase';

/** A reading the trainee took, kept where they took it. */
interface Reading {
  p: Point;
  signal: number;
}

/** Paint colours a technician actually has on the truck, plus the two easiest to grab by mistake. */
const PAINT = MARK_COLORS.filter((c) => ['orange', 'red', 'blue'].includes(c.color));

const HEX: Record<string, string> = Object.fromEntries(MARK_COLORS.map((c) => [c.color, c.hex]));

function ticketDays(from: Date, to: Date): number {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((day(to) - day(from)) / 86_400_000);
}

export function LocateBench() {
  // One ticket per seed, the way every other generated thing in this project works.
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 9999));
  const today = useMemo(() => new Date(), []);
  const job = useMemo(
    () => generateLocateJob(seed, today, createRng(deriveSeed(seed, 'locate'))),
    [seed, today],
  );

  const [tool, setTool] = useState<Tool>('sweep');
  const [color, setColor] = useState<string>(TELECOM_MARK_COLOR);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [answered, setAnswered] = useState<Date | null>(null);

  const drawing = useRef<SVGSVGElement>(null);
  const drawingMark = useRef<Mark | null>(null);

  const { extent } = job.request;

  // The drawing fills whatever width it is given: a locate is done with a finger, and a
  // three-metre tolerance has to be a comfortable target rather than a pixel.
  const box = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(320);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setBoxWidth(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Turned a quarter: a street is a long thin thing and a phone is a tall thin thing, so the
  // street runs down the page. Same reasoning as the print's own rotation.
  const proj = useMemo(() => groundProjector(extent, boxWidth / extent.h), [extent, boxWidth]);
  const { width, height, toPage } = proj;

  const path = (points: readonly Point[]) =>
    points.map((p, i) => { const q = toPage(p); return `${i === 0 ? 'M' : 'L'} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }).join(' ');

  const pointerWorld = (event: ReactPointerEvent<SVGSVGElement>): Point | null => {
    const svg = drawing.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return proj.toWorld(((event.clientX - rect.left) / rect.width) * width, ((event.clientY - rect.top) / rect.height) * height);
  };

  const apply = (event: ReactPointerEvent<SVGSVGElement>, starting: boolean) => {
    if (answered) return;
    const p = pointerWorld(event);
    if (!p) return;

    if (tool === 'sweep') {
      const signal = signalAt(p, job.runs);
      setReadings((prev) => [...prev, { p, signal }]);
      return;
    }

    if (tool === 'erase') {
      // Erase what is under the finger, whole marks at a time: paint comes off in stripes.
      setMarks((prev) => prev.filter((m) => !m.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= MARK_TOLERANCE_M)));
      return;
    }

    if (starting) {
      const mark: Mark = { id: `mark-${marks.length + 1}`, color, points: [p] };
      drawingMark.current = mark;
      setMarks((prev) => [...prev, mark]);
      return;
    }
    const active = drawingMark.current;
    if (!active) return;
    active.points.push(p);
    setMarks((prev) => prev.map((m) => (m.id === active.id ? { ...m, points: [...active.points] } : m)));
  };

  const verdict = useMemo(
    () => (answered ? judgeLocate(job.request, job.runs, marks, answered) : null),
    [answered, job, marks],
  );

  const answer = async () => {
    const at = new Date();
    setAnswered(at);
    const result = judgeLocate(job.request, job.runs, marks, at);
    const traineeId = await getOrCreateTraineeId();
    await saveBenchRun({
      id: `locate-${seed}-${at.getTime()}`,
      traineeId,
      kind: 'locate-mark',
      at: at.toISOString(),
      seed,
      mistakes: result.issues.map((i) => i.code),
      omitted: [],
      // A locate is a couple of hours of somebody's morning: the sweep is most of it.
      seconds: 90 * 60,
      passed: result.accepted,
      score: scoreLocateRun(result),
      domains: BENCH_DOMAINS['locate-mark'],
    });
  };

  const reset = () => {
    setSeed(1 + Math.floor(Math.random() * 9999));
    setReadings([]);
    setMarks([]);
    setAnswered(null);
    setTool('sweep');
    setColor(TELECOM_MARK_COLOR);
  };

  const daysToDig = ticketDays(today, job.request.digDate);

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 620, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link to="/" style={{ fontSize: 12, color: 'var(--cyan)' }}>← Board</Link>
        <span className="eyebrow" style={{ color: 'var(--cyan)' }}>Locate and mark</span>
      </div>

      {/* The ticket, as it lands. */}
      <div className="bezel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: 1.4, color: 'var(--orange)' }}>⚑ {job.request.ticketId}</span>
          <span className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: daysToDig <= 1 ? 'var(--red)' : 'var(--ink-soft)' }}>
            DIG DATE IN {daysToDig} DAY{daysToDig === 1 ? '' : 'S'}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{job.request.excavator}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}>{job.request.workDescription}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
          They are digging here whether or not you answer. Sweep the area, mark what you find in {TELECOM_MARK_COLOR}, and clear the ticket.
          Hand-dig tolerance either side of your marks is {TOLERANCE_ZONE_INCHES}″ — {LEGAL_BASIS.statute}.
        </div>
      </div>

      {/* Tools. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip active={tool === 'sweep'} onClick={() => setTool('sweep')} disabled={!!answered}>Wand</Chip>
        <Chip active={tool === 'mark'} onClick={() => setTool('mark')} disabled={!!answered}>Paint</Chip>
        <Chip active={tool === 'erase'} onClick={() => setTool('erase')} disabled={!!answered}>Erase</Chip>
        {tool === 'mark' && PAINT.map((c) => (
          <button
            key={c.color}
            type="button"
            onClick={() => setColor(c.color)}
            title={c.means}
            aria-label={`${c.color} paint — ${c.means}`}
            style={{
              width: 34, height: 34, borderRadius: 17, flexShrink: 0,
              background: c.hex,
              border: color === c.color ? '3px solid var(--ink)' : '1px solid rgba(0,0,0,0.4)',
              boxShadow: color === c.color ? '0 0 10px rgba(255,255,255,0.35)' : undefined,
            }}
          />
        ))}
      </div>
      <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: 'var(--ink-faint)' }}>
        {tool === 'sweep'
          ? 'DRAG TO SWEEP · THE WAND READS WHAT IS UNDER IT, NOTHING MORE'
          : tool === 'mark'
            ? `DRAG TO PAINT · ${color.toUpperCase()} — ${PAINT.find((c) => c.color === color)?.means.toUpperCase()}`
            : 'TAP A MARK TO TAKE IT OFF'}
      </div>

      {/* The ground. */}
      <div ref={box}>
        <svg
          ref={drawing}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: 'block', background: 'var(--void)', border: '1px solid var(--cyan-line)', touchAction: 'none', maxWidth: '100%' }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); apply(e, true); }}
          onPointerMove={(e) => { if (e.buttons !== 0) apply(e, false); }}
          onPointerUp={() => { drawingMark.current = null; }}
          onPointerCancel={() => { drawingMark.current = null; }}
        >
          {/* Kerbs and the parkway, so the area reads as a street rather than a rectangle. */}
          <rect x={toPage({ x: 0, y: job.streetY - 7 }).x} y={0} width={14 * proj.pxPerM} height={height} fill="rgba(127,212,232,0.05)" />
          <line x1={toPage({ x: 0, y: job.streetY }).x} y1={0} x2={toPage({ x: 0, y: job.streetY }).x} y2={height} stroke="rgba(127,212,232,0.25)" strokeWidth={1} strokeDasharray="10 8" />

          {/* What the records say. Free, and not necessarily true. */}
          {job.runs.map((run) => (
            <g key={`rec-${run.id}`}>
              <path d={path(run.recorded)} fill="none" stroke="rgba(127,212,232,0.45)" strokeWidth={1.3} strokeDasharray="6 5" />
            </g>
          ))}

          {/* What the wand found, where the trainee bothered to look. */}
          {readings.map((r, i) => (
            <circle
              key={i}
              cx={toPage(r.p).x}
              cy={toPage(r.p).y}
              r={2 + r.signal * 5}
              fill={`rgba(255,214,10,${0.12 + r.signal * 0.8})`}
            />
          ))}

          {/* Paint. */}
          {marks.map((m) => (
            <path key={m.id} d={path(m.points)} fill="none" stroke={HEX[m.color]} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
          ))}

          {/* After the ticket is answered, the truth — because a verdict you cannot see is a grade, not a lesson. */}
          {answered && job.runs.map((run) => (
            <path key={`act-${run.id}`} d={path(run.actual)} fill="none" stroke="#34d399" strokeWidth={2} strokeDasharray="2 6" />
          ))}
        </svg>
      </div>

      <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: 'var(--ink-faint)' }}>
        DASHED CYAN = AS RECORDED · YELLOW = WAND READING · {answered ? 'DASHED GREEN = WHERE IT ACTUALLY IS' : `MARKS COUNT WITHIN ${MARK_TOLERANCE_M} M OF THE CABLE`}
      </div>

      {!answered ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SoftKey label="Clear the ticket" onClick={() => void answer()} />
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
            {marks.length} MARK{marks.length === 1 ? '' : 'S'} · {readings.length} READING{readings.length === 1 ? '' : 'S'}
          </span>
        </div>
      ) : verdict && (
        <div className={`bezel${verdict.accepted ? '' : ' alert'}`} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: verdict.accepted ? 'var(--led-ok)' : 'var(--orange)' }}>{verdict.summary}</div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--ink-soft)' }}>
            {verdict.markedMeters} OF {verdict.plantMeters} M MARKED · SCORE {scoreLocateRun(verdict)}
          </div>
          {verdict.issues.map((issue, i) => (
            <div key={i} style={{ borderLeft: `2px solid ${issue.severity === 'strike-risk' ? 'var(--red)' : issue.severity === 'defect' ? 'var(--orange)' : 'var(--ink-faint)'}`, paddingLeft: 9 }}>
              <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.3, color: issue.severity === 'strike-risk' ? 'var(--red)' : 'var(--ink-soft)' }}>
                {issue.severity.replace('-', ' ').toUpperCase()} · {issue.where.toUpperCase()}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{issue.detail}</div>
            </div>
          ))}
          <SoftKey label="Next ticket" tone="cyan" onClick={reset} />
        </div>
      )}
    </div>
  );
}
