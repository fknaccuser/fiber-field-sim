// Original equipment artwork, shared by the training and design canvases.
export function svgEl(tag, attrs = {}, text) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (text !== undefined) el.textContent = text;
  return el;
}
export const EQUIPMENT = { router: 'Router', switch: 'Switch', client: 'Workstation', server: 'Server', accessPoint: 'Access point', firewall: 'Firewall', cloud: 'Internet', fiber: 'Fiber cabinet' };
export function equipmentGlyph(kind) {
  const g = svgEl('g', { class: 'equipment-glyph', 'aria-hidden': 'true' });
  const add = (tag, attrs) => g.appendChild(svgEl(tag, attrs));
  const body = { fill: '#344b61', stroke: '#7b96ab', 'stroke-width': 1.5 };
  const screen = { fill: '#123b55', stroke: '#529cba', 'stroke-width': 1 };
  if (kind === 'cloud' || kind === 'site') {
    add('path', { d: 'M-26 12C-44 10-42-13-26-15C-24-38 7-38 14-18C36-23 45 9 25 12Z', ...body });
    add('path', { d: 'M-15-4H15M0-15V7', stroke: '#41c6e5', 'stroke-width': 2, fill: 'none' });
  } else if (kind === 'client') {
    add('rect', { x: -29, y: -25, width: 58, height: 38, rx: 3, ...body });
    add('rect', { x: -24, y: -20, width: 48, height: 27, rx: 1, ...screen });
    add('path', { d: 'M-24 23L-31 14H31L24 23Z', ...body });
    add('path', { d: 'M-14-12H9M-14-7H1', stroke: '#41c6e5', opacity: .5, 'stroke-width': 2 });
  } else if (kind === 'server' || kind === 'fiber') {
    add('rect', { x: -22, y: -32, width: 44, height: 62, rx: 3, ...body });
    for (let i = 0; i < 3; i++) {
      add('rect', { x: -17, y: -25 + i * 17, width: 34, height: 13, rx: 1, fill: '#172c40', stroke: '#59778e' });
      add('circle', { cx: 11, cy: -19 + i * 17, r: 2, fill: '#41c6e5' });
      add('path', { d: `M-12 ${-20 + i * 17}h14m-14 4h14`, stroke: '#617e94', 'stroke-width': 1.5 });
    }
    if (kind === 'fiber') add('path', { d: 'M-4 30v9m8-9v9', stroke: '#e7b96d', 'stroke-width': 2 });
  } else if (kind === 'accessPoint') {
    add('rect', { x: -26, y: -1, width: 52, height: 22, rx: 6, ...body });
    add('circle', { cx: 0, cy: 10, r: 2, fill: '#41c6e5' });
    add('path', { d: 'M-22-15Q0-35 22-15M-14-7Q0-21 14-7M-5-1Q0-6 5-1', stroke: '#41c6e5', 'stroke-width': 2, fill: 'none' });
  } else if (kind === 'firewall') {
    add('path', { d: 'M0-30L27-19V2Q25 22 0 32Q-25 22-27 2V-19Z', ...body });
    add('path', { d: 'M-17-11H17M-20 0H20M-15 11H15M0-22V-11M-9-11V0M9-11V0M0 0V11M-7 11V21M7 11V21', stroke: '#e7b96d', 'stroke-width': 2, fill: 'none' });
  } else {
    add('path', { d: 'M-33-12L-22-22H24L34-12Z', fill: '#4d6b83', stroke: '#7b96ab', 'stroke-width': 1.5 });
    add('rect', { x: -33, y: -12, width: 67, height: 29, rx: 3, ...body });
    if (kind === 'router') add('path', { d: 'M-20 2H-3m-5-5 5 5-5 5M20 2H3m5-5-5 5 5 5', stroke: '#55d0e8', 'stroke-width': 2, fill: 'none' });
    else for (let i = 0; i < 6; i++) {
      add('rect', { x: -27 + i * 9, y: -4, width: 6, height: 9, rx: 1, fill: '#102438', stroke: '#7897ac', 'stroke-width': .8 });
      add('rect', { x: -25 + i * 9, y: 8, width: 2, height: 2, fill: '#41c6e5' });
    }
  }
  return g;
}
export function equipmentIcon(kind) {
  const svg = svgEl('svg', { viewBox: '-45 -40 90 85', width: 56, height: 50, 'aria-hidden': 'true' });
  svg.append(equipmentGlyph(kind)); return svg;
}
