import { useEffect, useRef } from 'react';
import { ZONE_LEGEND, ZONE_ORDER, ZONE_RADII_UM, type EndFaceDefect, type EndFaceModel } from './endFaceModel';

const FIELD_UM = 265;

function drawFace(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2;
  const s = (size / 2) / FIELD_UM;
  const g = ctx.createRadialGradient(c, c, 0, c, c, size / 2);
  g.addColorStop(0, '#101418');
  g.addColorStop(1, '#05070a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(c, c, ZONE_RADII_UM.contact * s, 0, Math.PI * 2);
  ctx.fillStyle = '#2c3138';
  ctx.fill();

  const clad = ctx.createRadialGradient(c - 20 * s, c - 20 * s, 10 * s, c, c, ZONE_RADII_UM.cladding * s);
  clad.addColorStop(0, '#7d848d');
  clad.addColorStop(1, '#5c636b');
  ctx.beginPath();
  ctx.arc(c, c, ZONE_RADII_UM.cladding * s, 0, Math.PI * 2);
  ctx.fillStyle = clad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(c, c, ZONE_RADII_UM.core * s * 0.36, 0, Math.PI * 2);
  ctx.fillStyle = '#9aa2ab';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, ZONE_RADII_UM.core * s * 0.36, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawDefect(ctx: CanvasRenderingContext2D, d: EndFaceDefect, size: number): void {
  const c = size / 2;
  const s = (size / 2) / FIELD_UM;
  const x = c + d.x * s;
  const y = c + d.y * s;

  if (d.kind === 'particle') {
    const r = Math.max(d.size * s, 1.2);
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    halo.addColorStop(0, `rgba(255,255,255,${d.intensity})`);
    halo.addColorStop(0.45, `rgba(235,240,245,${d.intensity * 0.75})`);
    halo.addColorStop(1, 'rgba(235,240,245,0)');
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = halo;
    ctx.fill();
    return;
  }

  if (d.kind === 'scratch') {
    const len = d.size * s;
    const dx = Math.cos(d.angle) * len;
    const dy = Math.sin(d.angle) * len;
    const nx = -Math.sin(d.angle) * len * 0.35 * d.bend;
    const ny = Math.cos(d.angle) * len * 0.35 * d.bend;
    ctx.beginPath();
    ctx.moveTo(x - dx, y - dy);
    ctx.quadraticCurveTo(x + nx, y + ny, x + dx, y + dy);
    ctx.strokeStyle = `rgba(20,24,28,${0.55 * d.intensity})`;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.strokeStyle = `rgba(240,244,248,${d.intensity})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    return;
  }

  ctx.beginPath();
  d.lobes.forEach((m, i) => {
    const a = d.angle + (i / d.lobes.length) * Math.PI * 2;
    const rx = d.size * s * m * 1.25;
    const ry = d.size * s * m * 0.8;
    const px = x + Math.cos(a) * rx;
    const py = y + Math.sin(a) * ry;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = `rgba(190,200,215,${d.intensity})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(230,236,244,${d.intensity * 1.6})`;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawZones(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2;
  const s = (size / 2) / FIELD_UM;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.font = `${Math.max(10, size * 0.035)}px ui-monospace, monospace`;
  ctx.textBaseline = 'middle';
  for (const zone of ZONE_ORDER) {
    const r = ZONE_RADII_UM[zone] * s;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(90,176,255,0.75)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(90,176,255,0.95)';
    ctx.fillText(ZONE_LEGEND[zone].letter, c + r * 0.72 + 3, c - r * 0.72);
  }
  ctx.setLineDash([]);
}

export function EndFaceCanvas({ model, showZones, size = 320 }: { model: EndFaceModel | null; showZones: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFace(ctx, size);
    if (model) {
      for (const d of model.defects) drawDefect(ctx, d, size);
    }
    if (showZones) drawZones(ctx, size);
  }, [model, showZones, size]);

  return <canvas ref={ref} style={{ width: size, height: size, borderRadius: '50%', display: 'block', background: '#05070a' }} aria-label="Connector end-face" />;
}
