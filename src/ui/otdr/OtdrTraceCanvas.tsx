/**
 * The OTDR trace canvas. This component contains no physics -- it only draws what
 * `OtdrTraceResult.samples`/`events` already computed, via the pure helpers in
 * instruments/otdr/viewport.ts. It must never read ground truth: a source-grep test
 * (OtdrTraceCanvas.test.ts) fails the build if this file's text contains the word
 * that names that field, so don't reference it even in a comment.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { PublicOtdrTraceResult } from '../../instruments/otdr/types';
import type { DetectedEvent } from '../../instruments/otdr/types';
import { downsampleForWidth, fromPixelX, hitTestEvent, pan, toPixel, zoomAround, type Viewport } from '../../instruments/otdr/viewport';

export interface OtdrTraceCanvasTheme {
  background: string;
  grid: string;
  trace: string;
  cursorA: string;
  cursorB: string;
  marker: string;
  text: string;
}

export interface OtdrTraceCanvasProps {
  result: PublicOtdrTraceResult | null;
  viewport: Viewport;
  cursors: { a: number; b: number };
  activeCursor: 'a' | 'b';
  showEventMarkers: boolean;
  onCursorMove(which: 'a' | 'b', meters: number): void;
  onViewportChange(vp: Viewport): void;
  onEventSelect(event: DetectedEvent | null): void;
  theme: OtdrTraceCanvasTheme;
}

function niceStep(span: number, targetDivisions: number): number {
  const raw = span / targetDivisions;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const residual = raw / magnitude;
  const stepUnit = residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1;
  return stepUnit * magnitude;
}

export function OtdrTraceCanvas(props: OtdrTraceCanvasProps) {
  const { result, viewport, cursors, activeCursor, showEventMarkers, onCursorMove, onViewportChange, onEventSelect, theme } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ mode: 'cursor' | 'pan'; lastX: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const widthCss = canvas.clientWidth || 320;
    const heightCss = canvas.clientHeight || 220;
    canvas.width = Math.round(widthCss * dpr);
    canvas.height = Math.round(heightCss * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const widthPx = widthCss;
    const heightPx = heightCss;

    // Background
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, widthPx, heightPx);

    if (!result) return;

    // Grid
    ctx.strokeStyle = theme.grid;
    ctx.fillStyle = theme.text;
    ctx.font = '10px ui-monospace, monospace';
    ctx.lineWidth = 1;

    const yStep = niceStep(viewport.yMaxDb - viewport.yMinDb, 6);
    for (let db = Math.ceil(viewport.yMinDb / yStep) * yStep; db <= viewport.yMaxDb; db += yStep) {
      const { y } = toPixel(viewport, widthPx, heightPx, viewport.xMinMeters, db);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(widthPx, y);
      ctx.stroke();
      ctx.fillText(`${db.toFixed(0)} dB`, 4, y - 2);
    }

    const xStep = niceStep(viewport.xMaxMeters - viewport.xMinMeters, 8);
    for (let d = Math.ceil(viewport.xMinMeters / xStep) * xStep; d <= viewport.xMaxMeters; d += xStep) {
      const { x } = toPixel(viewport, widthPx, heightPx, d, viewport.yMinDb);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, heightPx);
      ctx.stroke();
      ctx.fillText(`${Math.round(d)} m`, x + 2, heightPx - 4);
    }

    // Noise floor
    const noiseY = toPixel(viewport, widthPx, heightPx, viewport.xMinMeters, result.noiseFloorDb).y;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = theme.grid;
    ctx.beginPath();
    ctx.moveTo(0, noiseY);
    ctx.lineTo(widthPx, noiseY);
    ctx.stroke();
    ctx.restore();

    // Trace
    const drawSamples = downsampleForWidth(result.samples, viewport, widthPx);
    ctx.strokeStyle = theme.trace;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (const s of drawSamples) {
      const { x, y } = toPixel(viewport, widthPx, heightPx, s.distanceMeters, s.levelDb);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Event markers
    if (showEventMarkers) {
      ctx.fillStyle = theme.marker;
      for (const ev of result.events) {
        if (ev.distanceMeters < viewport.xMinMeters || ev.distanceMeters > viewport.xMaxMeters) continue;
        const { x } = toPixel(viewport, widthPx, heightPx, ev.distanceMeters, 0);
        ctx.beginPath();
        ctx.moveTo(x - 4, 10);
        ctx.lineTo(x + 4, 10);
        ctx.lineTo(x, 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillText(String(ev.index), x - 3, 20);
      }
    }

    // Cursors
    const drawCursor = (meters: number, color: string, label: string) => {
      if (meters < viewport.xMinMeters || meters > viewport.xMaxMeters) return;
      const { x } = toPixel(viewport, widthPx, heightPx, meters, 0);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, heightPx);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(label, x + 2, 12);
    };
    drawCursor(cursors.a, theme.cursorA, 'A');
    drawCursor(cursors.b, theme.cursorB, 'B');
  }, [result, viewport, cursors, activeCursor, showEventMarkers, theme]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      dragRef.current = { mode: e.shiftKey ? 'pan' : 'cursor', lastX: xPx };
      if (!e.shiftKey) {
        const meters = fromPixelX(viewport, rect.width, xPx);
        onCursorMove(activeCursor, meters);
        if (result) {
          const hit = hitTestEvent(result, viewport, rect.width, xPx);
          onEventSelect(hit);
        }
      }
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [viewport, activeCursor, onCursorMove, onEventSelect, result],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      if (drag.mode === 'cursor') {
        const meters = fromPixelX(viewport, rect.width, xPx);
        onCursorMove(activeCursor, meters);
      } else {
        const deltaPx = xPx - drag.lastX;
        const deltaMeters = -(deltaPx / rect.width) * (viewport.xMaxMeters - viewport.xMinMeters);
        onViewportChange(pan(viewport, deltaMeters));
      }
      dragRef.current = { ...drag, lastX: xPx };
    },
    [viewport, activeCursor, onCursorMove, onViewportChange],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      const focusMeters = fromPixelX(viewport, rect.width, xPx);
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      onViewportChange(zoomAround(viewport, focusMeters, factor));
    },
    [viewport, onViewportChange],
  );

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    />
  );
}
