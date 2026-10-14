// The work order's network, drawn from the live world: each device where the
// order placed it, each cable colored by what the engine says about it, and
// the port name at each end, the way a site diagram labels them.

import { interfaceState, l2Of } from '../labs/world.js';
import { keyOf } from '../labs/switching.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, text = null) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== null) n.textContent = text;
  return n;
}

const short = (n) => n.replace('GigabitEthernet', 'Gi').replace('FastEthernet', 'Fa').replace('Port-channel', 'Po');
const SIZE = { switch: [24, 9], router: [20, 9], pc: [14, 8] };
const KIND = { switch: 'SWITCH', router: 'ROUTER', pc: 'PC' };

// up, down, err (err-disabled) or blk (spanning tree blocking).
export function endState(world, d, i) {
  const dev = world.devices[d];
  const st = interfaceState(world, d, i);
  if (st.err) return 'err';
  if (!st.up) return 'down';
  if (dev.kind === 'switch') {
    const l2 = l2Of(world);
    const L = l2.logicalOf[keyOf(d, i)];
    const blocked = L && Object.values(l2.stp[d] ?? {}).some(v => v.ports[L.name]?.state === 'BLK');
    if (blocked) return 'blk';
  }
  return 'up';
}

const WORST = ['err', 'down', 'blk', 'up'];

export function renderTopology(world, order, { onPick, current = null } = {}) {
  const svg = s('svg', { viewBox: '0 0 100 70', class: 'desk-topo', role: 'img', 'aria-label': 'Network diagram' });
  const pos = Object.fromEntries(order.devices.map(d => [d.id, d]));
  // Parallel cables between the same two devices fan out side by side.
  const pairs = {};
  for (const link of world.links) {
    // A one-ended segment is a LAN the diagram does not draw.
    if (link.ends.length !== 2) continue;
    const [a, b] = link.ends;
    const key = [a[0], b[0]].sort().join('|');
    (pairs[key] ??= []).push(link);
  }
  const lines = s('g', { class: 'desk-links' });
  const labels = s('g', { class: 'desk-ports' });
  for (const group of Object.values(pairs)) {
    group.forEach((link, k) => {
      const [[da, ia], [db, ib]] = link.ends;
      const A = pos[da];
      const B = pos[db];
      if (!A || !B) return;
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len = Math.hypot(dx, dy) || 1;
      const off = (k - (group.length - 1) / 2) * 5;
      const ox = (-dy / len) * off;
      const oy = (dx / len) * off;
      const x1 = A.x + ox, y1 = A.y + oy, x2 = B.x + ox, y2 = B.y + oy;
      const ends = [endState(world, da, ia), endState(world, db, ib)];
      const state = WORST.find(w => ends.includes(w));
      lines.append(s('line', { x1, y1, x2, y2, class: `desk-link is-${state}` }));
      // Each port name sits just past the edge of its device's box.
      const ux = dx / len, uy = dy / len;
      const edge = (node) => { const [w, h] = SIZE[node.kind]; return Math.min((w / 2) / (Math.abs(ux) || 1e-6), (h / 2) / (Math.abs(uy) || 1e-6)); };
      const place = (node, sx, sy, dir, name, st) => {
        if (name === 'FastEthernet0') return; // a PC's only NIC needs no label
        // Toward a PC, put the switch's port name partway down the cable,
        // where fanned-out cables have room between them.
        const far = node === A ? B : A;
        const d = far.kind === 'pc' && node.kind !== 'pc' ? Math.max(edge(node) + 1.6, len * 0.42) : edge(node) + 1.6;
        const x = sx + dir * ux * d;
        const y = sy + dir * uy * d;
        // Parallel cables put their labels on their own outer side.
        const out = off < 0 ? -1 : 1;
        // A steep cable leaning left gets its label on the left.
        const lean = off !== 0 ? out : (dir * ux < 0.15 ? -1 : 1);
        const side = Math.abs(ux) > Math.abs(uy)
          ? { dx: 0, dy: out < 0 ? -1.3 : 3, anchor: 'middle' }
          : { dx: (lean < 0 ? -1 : 1) * 1.6, dy: 1, anchor: lean < 0 ? 'end' : 'start' };
        labels.append(s('text', { x: x + side.dx, y: y + side.dy, 'text-anchor': side.anchor, class: `desk-port is-${st}` }, short(name)));
      };
      place(A, x1, y1, 1, ia, ends[0]);
      place(B, x2, y2, -1, ib, ends[1]);
    });
  }
  svg.append(lines);
  for (const d of order.devices) {
    const [w, h] = SIZE[d.kind];
    const g = s('g', { class: `desk-node is-${d.kind}${current === d.id ? ' is-current' : ''}`, tabindex: 0, role: 'button', 'data-device': d.id });
    const host = world.devices[d.id].config.hostname;
    const name = d.kind === 'pc' || ['Switch', 'Router'].includes(host) ? d.id : host;
    g.setAttribute('aria-label', `Open the console on ${name}`);
    g.append(s('rect', { x: d.x - w / 2, y: d.y - h / 2, width: w, height: h, rx: d.kind === 'router' ? 4.5 : 1.6 }));
    g.append(s('text', { x: d.x, y: d.y - 0.6, class: 'desk-node-name' }, name));
    g.append(s('text', { x: d.x, y: d.y + 2.9, class: 'desk-node-kind' }, KIND[d.kind]));
    const pick = () => onPick?.(d.id);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    svg.append(g);
  }
  svg.append(labels);
  return svg;
}
