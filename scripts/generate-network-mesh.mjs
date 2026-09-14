// Original, deterministic vector artwork. Run from any directory to regenerate.
// The palette is deliberately multi-hue — cyan-dominant with clustered pops of
// violet, magenta/rose and warm amber/gold, echoing the glowing-node reference
// look rather than a flat monochrome blue mesh.
import { mkdir, writeFile } from 'node:fs/promises';
const destination = new URL('../src/solo/assets/', import.meta.url);
await mkdir(destination, { recursive: true });
let seed = 73519;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const n = value => value.toFixed(1);
const lines = [], dots = [], haze = [];
const rows = 13, cols = 28, points = [];
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const u = col / (cols - 1), v = row / (rows - 1);
    const x = -90 + u * 1810 + (random() - .5) * 55;
    const y = 350 + Math.sin(u * 7.2 - v * 1.8) * 180 + v * 480 + (random() - .5) * 48;
    points.push({ x, y, r: random(), row, col });
  }
}

// Smooth hue "zones" over the canvas so accent colors gather into regions
// (a warm cluster here, a magenta glow there) instead of scattering evenly.
// warm > 0 leans amber/rose; cool < 0 leans violet/cyan.
function warmField(x, y) {
  return Math.sin(x * 0.0042 + 0.6) * Math.cos(y * 0.0055 - 0.4) + 0.28 * Math.sin(x * 0.011);
}
function colorFor(p) {
  const warm = warmField(p.x, p.y);
  const t = p.r;
  if (t > 0.95) return '#ffe07a';                         // bright gold cores
  if (t > 0.79) return warm > 0.05 ? '#ff529a' : '#b585ff'; // vivid magenta / violet
  if (t > 0.58) return warm > 0.22 ? '#ff9d42' : '#cbf3ff'; // amber vs pale blue-white
  if (t > 0.4 && warm > 0.45) return '#ff70ac';           // rose speckle spreads through warm zones
  return '#33cbf6';                                       // cyan base
}

for (const [index, p] of points.entries()) {
  const color = colorFor(p);
  const warmAccent = color[1] === 'f' && color !== '#cbf3ff'; // gold/amber/rose/magenta (bright, non-pale)
  for (const offset of [1, cols, ...(p.r > .48 ? [cols + 1] : [])]) {
    const q = points[index + offset];
    if (!q || (offset !== cols && p.col === cols - 1)) continue;
    lines.push(`<path d="M${n(p.x)} ${n(p.y)}L${n(q.x)} ${n(q.y)}" stroke="${color}" opacity="${n(.15 + p.r * .42)}"/>`);
  }
  const r = 1 + p.r * 2.4;
  dots.push(`<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r)}" fill="${color}" opacity="${n(.42 + p.r * .58)}"/>`);
  // Warm/bright nodes bloom hard, so the colored pops read as glowing points of
  // light like the reference bokeh; cyan nodes bloom more sparingly.
  if (p.r > .8 || (warmAccent && p.r > .58)) haze.push(`<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r * (warmAccent ? 4.6 : 3.4))}" fill="${color}" opacity="${warmAccent ? '.46' : '.3'}"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" fill="none">
<defs>
 <radialGradient id="blue"><stop stop-color="#0f9fd4" stop-opacity=".5"/><stop offset="1" stop-color="#0f9fd4" stop-opacity="0"/></radialGradient>
 <radialGradient id="violet"><stop stop-color="#8a3fd0" stop-opacity=".52"/><stop offset="1" stop-color="#8a3fd0" stop-opacity="0"/></radialGradient>
 <radialGradient id="rose"><stop stop-color="#f0407f" stop-opacity=".46"/><stop offset="1" stop-color="#f0407f" stop-opacity="0"/></radialGradient>
 <radialGradient id="amber"><stop stop-color="#ff9333" stop-opacity=".42"/><stop offset="1" stop-color="#ff9333" stop-opacity="0"/></radialGradient>
 <filter id="blur"><feGaussianBlur stdDeviation="9"/></filter>
 <filter id="glow"><feGaussianBlur stdDeviation="3"/></filter>
 <linearGradient id="fade" x2="0" y2="1"><stop stop-color="white" stop-opacity=".12"/><stop offset=".5" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity=".1"/></linearGradient>
 <mask id="depth"><path fill="url(#fade)" d="M0 0H1600V900H0z"/></mask>
</defs>
<ellipse cx="1250" cy="470" rx="650" ry="440" fill="url(#blue)"/>
<ellipse cx="470" cy="760" rx="640" ry="450" fill="url(#violet)"/>
<ellipse cx="900" cy="300" rx="520" ry="360" fill="url(#rose)"/>
<ellipse cx="240" cy="220" rx="440" ry="320" fill="url(#amber)"/>
<g mask="url(#depth)"><g stroke-width=".8">${lines.join('')}</g><g filter="url(#glow)">${dots.join('')}</g>${dots.join('')}</g>
<g filter="url(#blur)">${haze.join('')}</g>
</svg>`;
await writeFile(new URL('network-mesh.svg', destination), svg);
