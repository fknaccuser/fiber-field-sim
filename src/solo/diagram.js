import { svgEl, equipmentGlyph, EQUIPMENT } from './equipment.js';
import { fitTopologyBounds, resizeTopologyDrawer } from './topology-viewport.js';
import { attachMentor, explainDevice, explainCable, createGuideToggle } from './mentor.js';

// Per-kind node glow colour so each device reads as a luminous point in the web.
const NODE_COLOR = { client: '#3dd6f5', switch: '#6ee7f5', router: '#ffb257', server: '#b585ff', firewall: '#ff6fa5', accessPoint: '#7bf0c8', cloud: '#9edbed', fiber: '#ffb257', site: '#9edbed' };

export function positionsFor(network, compact = false) {
  const hasDistribution = network.devices.some(d => d.id === 'SW2');
  const fixed = compact
    ? { PC1: [90, 95], PC2: [310, 95], SW1: [200, 240], SW2: [200, 380], R1: [200, hasDistribution ? 520 : 380], S1: [200, hasDistribution ? 660 : 520], PC3: [390, 380] }
    : { PC1: [120, 125], PC2: [120, 360], SW1: [340, 240], SW2: [560, 240], R1: [780, 240], S1: [1000, 240], PC3: [560, 420] };
  return Object.fromEntries(network.devices.map((d, i) => [d.id, d.position ?? fixed[d.id] ?? [130 + (i % 5) * 200, 130 + Math.floor(i / 5) * 160]]));
}
export function renderTopology(network, options = {}) {
  const { selectedDeviceId = null, onSelectDevice, onSelectLink, reconnectLinkId = null, onMoveDevice, viewState = {}, sites = [], onToggleSite, compactList = false } = options;
  const container = document.createElement('div'); container.className = 'diagram';
  const toolbar = document.createElement('div'); toolbar.className = 'canvas-toolbar';
  const title = document.createElement('span'); title.className = 'canvas-title'; title.textContent = 'Logical topology';
  const count = document.createElement('span'); count.className = 'canvas-count'; count.textContent = `${options.totalDevices ?? network.devices.length} devices · ${options.totalLinks ?? network.links.length} links`;
  toolbar.append(title, count);
  const button = (label, handler, aria) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    if (aria) b.setAttribute('aria-label', aria);
    b.addEventListener('click', handler); toolbar.append(b); return b;
  };
  const svg = svgEl('svg', { class: 'topology-canvas', role: 'group', 'aria-label': 'Network topology. Select equipment or a cable. Drag the background to pan.' });
  const world = svgEl('g'), positions = positionsFor(network, viewState.compact ?? false);
  const ports = new Map((network.ports ?? []).map(p => [p.id, p]));
  const deviceNames = new Map(network.devices.map(d => [d.id, d.name]));
  const ends = link => [link.a ?? ports.get(link.aPortId)?.deviceId, link.b ?? ports.get(link.bPortId)?.deviceId];
  const cableSpec = link => { const [a, b] = ends(link); return explainCable(link, { aName: deviceNames.get(a), bName: deviceNames.get(b) }); };
  let width = viewState.width ?? 900, height = viewState.height ?? 500;
  const view = viewState;
  view.autoFit ??= true;
  const updateView = () => {
    world.setAttribute('transform', `translate(${view.x ?? 0} ${view.y ?? 0}) scale(${view.k ?? 1})`);
    zoom.textContent = `${Math.round((view.k ?? 1) * 100)}%`;
    svg.classList.toggle('topology-overview', (view.k ?? 1) < .55);
    for (const text of world.querySelectorAll('.node-label, .site-label')) text.style.fontSize = `${Math.max(14, 11 / (view.k ?? 1))}px`;
    for (const text of world.querySelectorAll('.node-type')) text.style.fontSize = `${Math.max(13, 11 / (view.k ?? 1))}px`;
    for (const node of world.querySelectorAll('.diagram-device:not([data-kind="site"])')) {
      const nameY = 61 + Math.max(19, 16 / (view.k ?? 1));
      node.querySelector('.node-label').setAttribute('y', nameY);
      node.querySelector('.node-detail').setAttribute('y', nameY + 19);
    }
  };
  const fit = () => {
    if (!svg.isConnected || !width || !height) return;
    // Measure rendered equipment, names, coaching arrows, and site bounds.
    // A few passes account for labels that retain a minimum screen font size.
    view.autoFit = true;
    view.k = 1;
    for (let pass = 0; pass < 4; pass++) {
      updateView();
      const bounds = world.getBBox();
      const next = fitTopologyBounds(bounds, width, height);
      if (next) Object.assign(view, next);
    }
    updateView();
  };
  const scale = (factor, x = width / 2, y = height / 2) => {
    const old = view.k ?? 1; view.k = Math.max(.001, Math.min(2.5, old * factor));
    view.autoFit = false;
    view.x = x - (x - (view.x ?? 0)) * view.k / old; view.y = y - (y - (view.y ?? 0)) * view.k / old; updateView();
  };
  button('−', () => scale(1 / 1.25), 'Zoom out');
  const zoom = document.createElement('span'); zoom.className = 'canvas-zoom'; toolbar.append(zoom);
  button('+', () => scale(1.25), 'Zoom in'); button('Fit', fit, 'Fit network');
  const labels = button('Labels', () => { view.labels = view.labels === false; svg.classList.toggle('labels-hidden', !view.labels); labels.setAttribute('aria-pressed', String(view.labels)); if (view.autoFit) fit(); });
  labels.setAttribute('aria-pressed', String(view.labels !== false)); svg.classList.toggle('labels-hidden', view.labels === false);
  const expand = button('Expand', () => setExpanded(!view.expanded), 'Expand topology');
  function setExpanded(expanded, resetFit = true) {
    view.expanded = expanded; if (resetFit) view.autoFit = true;
    container.classList.toggle('topology-expanded', expanded);
    expand.textContent = expanded ? 'Restore' : 'Expand'; expand.setAttribute('aria-label', expanded ? 'Restore topology' : 'Expand topology'); expand.setAttribute('aria-expanded', String(expanded));
  }
  setExpanded(view.expanded ?? false, false);
  container.addEventListener('keydown', event => { if (event.key === 'Escape' && view.expanded) { event.preventDefault(); setExpanded(false); expand.focus(); } });
  svg.setAttribute('aria-label', 'Network topology. Select equipment or a cable. Drag the background to pan. Ctrl or Command plus scroll to zoom.');
  toolbar.append(createGuideToggle());
  const navigationHelp = document.createElement('span'); navigationHelp.className = 'canvas-navigation-help'; navigationHelp.textContent = 'Drag to pan · Ctrl + scroll to zoom · hover a device to learn what it is'; toolbar.append(navigationHelp);
  container.append(toolbar, svg);
  for (const site of sites) {
    const group = svgEl('g', { class: 'topology-site' });
    group.append(svgEl('rect', { x: site.x, y: site.y, width: site.w, height: site.h, rx: 18 }));
    const label = svgEl('text', { class: 'site-label', x: site.x + 20, y: site.y + 28, role: 'button', tabindex: 0, 'aria-label': `Collapse ${site.name}` }, `${site.name}  −`);
    label.addEventListener('click', () => onToggleSite?.(site.id));
    label.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSite?.(site.id); } });
    group.append(label); world.append(group);
  }
  const paths = [];
  // Glowing multi-hue web: each connected cable takes an accent colour so the
  // topology reads like the reference network art rather than a flat diagram.
  const LINK_COLORS = ['#3dd6f5', '#b585ff', '#ff6fa5', '#ffb257', '#7bf0c8', '#6ee7f5'];
  let linkIndex = 0;
  for (const link of network.links) {
    const [a, b] = ends(link); if (!positions[a] || !positions[b]) continue;
    const g = svgEl('g', { class: `topology-cable${link.connected === false ? ' is-disconnected' : ''}${link.id === reconnectLinkId ? ' is-selected' : ''}${link.id === options.guideLinkId ? ' cable-coach-target' : ''}${selectedDeviceId && a !== selectedDeviceId && b !== selectedDeviceId ? ' is-muted' : ''}` });
    const linkColor = link.connected === false ? '#ff9d5c' : LINK_COLORS[linkIndex++ % LINK_COLORS.length];
    const line = svgEl('path', { class: `diagram-link${link.connected === false ? ' diagram-link-down' : ''}`, fill: 'none' });
    line.style.setProperty('--link-color', linkColor);
    line.style.setProperty('--link-glow', linkColor);
    const hit = svgEl('path', { class: 'cable-hit', fill: 'none', tabindex: 0, role: 'button', 'aria-label': `Cable ${link.id}, ${link.connected === false ? 'disconnected' : 'connected'}` });
    const act = () => onSelectLink?.(link.id); hit.addEventListener('click', act);
    hit.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    attachMentor(hit, () => cableSpec(link));
    const label = svgEl('text', { class: 'cable-label', 'text-anchor': 'middle' }, link.label ?? (ports.get(link.aPortId)?.label ?? ''));
    g.append(line, hit, label); world.append(g); paths.push({ a, b, line, hit, label });
  }
  function drawPaths() {
    for (const { a, b, line, hit, label } of paths) {
      const [ax, ay] = positions[a], [bx, by] = positions[b], mx = (ax + bx) / 2;
      const d = `M${ax},${ay} C${mx},${ay} ${mx},${by} ${bx},${by}`;
      line.setAttribute('d', d); hit.setAttribute('d', d); label.setAttribute('x', mx); label.setAttribute('y', (ay + by) / 2 - 10);
    }
  }
  drawPaths();
  let drag = null, suppressClick = false, nodeIndex = 0;
  const pointer = e => { const box = svg.getBoundingClientRect(); return [e.clientX - box.left, e.clientY - box.top]; };
  for (const device of network.devices) {
    const [x, y] = positions[device.id];
    const g = svgEl('g', { class: `diagram-device${device.id === selectedDeviceId ? ' diagram-device-selected' : ''}`, 'data-kind': device.kind, 'data-device-id': device.id, transform: `translate(${x} ${y})`, tabindex: 0, role: 'button', 'aria-label': `${device.name} (${device.kind})`, 'aria-pressed': device.id === selectedDeviceId });
    const nodeColor = NODE_COLOR[device.kind] ?? '#3dd6f5';
    g.style.setProperty('--node-color', nodeColor);
    g.append(svgEl('title', {}, device.name));
    const halo = svgEl('circle', { class: 'device-halo', cx: 0, cy: 0, r: 34 });
    halo.style.animationDelay = `${(nodeIndex++ % 6) * 0.55}s`;
    g.append(halo, svgEl('rect', { class: 'device-selection', x: -48, y: -45, width: 96, height: 90, rx: 14 }), equipmentGlyph(device.kind));
    if (device.kind !== 'site') g.append(svgEl('text', { class: 'node-type', x: 0, y: 61, 'text-anchor': 'middle' }, device.kind === 'client' ? 'PC' : EQUIPMENT[device.kind] ?? device.kind));
    g.append(svgEl('text', { class: 'node-label diagram-device-label', x: 0, y: 61, 'text-anchor': 'middle' }, device.name));
    g.append(svgEl('text', { class: 'node-detail', x: 0, y: 80, 'text-anchor': 'middle' }, device.subtitle ?? `${device.id} · ${EQUIPMENT[device.kind] ?? 'Site'}`));
    if (device.powered !== undefined) g.append(svgEl('circle', { cx: 35, cy: -31, r: 4, class: device.powered ? 'power-on' : 'power-off' }));
    if (options.guideDeviceId === device.id) {
      const pointer = svgEl('g', { class: 'device-guide-arrow', 'aria-hidden': 'true' });
      pointer.append(svgEl('path', { d: 'M0,-100V-58M-10,-69L0,-58L10,-69', fill: 'none', stroke: '#6ee7f5', 'stroke-width': 4 }));
      pointer.append(svgEl('text', { x: 0, y: -112, 'text-anchor': 'middle', fill: '#b7f3ff', 'font-size': 20 }, 'Start here'));
      g.append(pointer);
    }
    attachMentor(g, () => explainDevice(device));
    const act = () => { if (!suppressClick) onSelectDevice?.(device.id); };
    g.addEventListener('click', act);
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); }
      if (onMoveDevice && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault(); const p = positions[device.id]; onMoveDevice(device.id, [p[0] + (e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0), p[1] + (e.key === 'ArrowUp' ? -20 : e.key === 'ArrowDown' ? 20 : 0)]);
      }
    });
    g.addEventListener('pointerdown', e => {
      if (!onMoveDevice || e.button !== 0) return;
      e.stopPropagation(); drag = { id: device.id, g, start: pointer(e), position: [...positions[device.id]], moved: false }; suppressClick = false; svg.setPointerCapture(e.pointerId);
    });
    world.append(g);
  }
  svg.append(world);
  svg.addEventListener('pointerdown', e => { if (e.button !== 0 || e.target.closest('[role="button"]')) return; drag = { start: pointer(e), position: [view.x ?? 0, view.y ?? 0] }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const [x, y] = pointer(e), dx = x - drag.start[0], dy = y - drag.start[1];
    if (drag.id) {
      if (Math.hypot(dx, dy) > 5) drag.moved = true; if (!drag.moved) return;
      positions[drag.id] = [drag.position[0] + dx / view.k, drag.position[1] + dy / view.k]; drag.g.setAttribute('transform', `translate(${positions[drag.id].join(' ')})`); drawPaths();
    } else { view.autoFit = false; view.x = drag.position[0] + dx; view.y = drag.position[1] + dy; updateView(); }
  });
  svg.addEventListener('pointerup', () => { const done = drag; drag = null; if (done?.id && done.moved) { suppressClick = true; onMoveDevice?.(done.id, positions[done.id]); } else if (done?.id) onSelectDevice?.(done.id); });
  svg.addEventListener('pointercancel', () => { if (drag?.id) { positions[drag.id] = drag.position; drag.g.setAttribute('transform', `translate(${drag.position.join(' ')})`); drawPaths(); } drag = null; });
  svg.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const [x, y] = pointer(e); scale(e.deltaY < 0 ? 1.1 : 1 / 1.1, x, y); }, { passive: false });
  const splitter = document.createElement('div'); splitter.className = 'topology-splitter'; splitter.tabIndex = 0; splitter.setAttribute('role', 'separator'); splitter.setAttribute('aria-orientation', 'horizontal'); splitter.setAttribute('aria-label', 'Resize device and cable list'); splitter.title = 'Drag down for more topology space; drag up to open the list. Arrow keys also resize.';
  const grip = document.createElement('span'); grip.className = 'topology-splitter-grip'; grip.setAttribute('aria-hidden', 'true'); splitter.append(grip);
  const listWrap = document.createElement('details'); listWrap.className = 'topology-index';
  view.drawerHeight ??= compactList ? 0 : 140;
  listWrap.open = view.drawerHeight > 0;
  const summary = document.createElement('summary'); summary.textContent = 'Device & cable list'; listWrap.append(summary);
  const list = document.createElement('ul'); list.className = 'diagram-list';
  for (const device of network.devices) {
    const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.className = 'diagram-list-device'; b.textContent = `${device.name} (${device.kind})`;
    b.setAttribute('aria-pressed', String(device.id === selectedDeviceId)); b.addEventListener('click', () => onSelectDevice?.(device.id)); li.append(b); list.append(li);
  }
  for (const link of network.links) {
    const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.className = 'diagram-list-link'; b.textContent = `Cable ${link.id}: ${link.connected === false ? 'disconnected' : 'connected'}`;
    b.addEventListener('click', () => onSelectLink?.(link.id)); attachMentor(b, () => cableSpec(link)); li.append(b); list.append(li);
  }
  listWrap.append(list); container.append(splitter, listWrap);
  const drawerAvailable = () => Math.max(0, container.getBoundingClientRect().height - toolbar.getBoundingClientRect().height - splitter.getBoundingClientRect().height - summary.getBoundingClientRect().height);
  function applyDrawer(height) {
    view.drawerHeight = resizeTopologyDrawer(height, 0, drawerAvailable());
    if (view.drawerHeight < 8) view.drawerHeight = 0;
    if (view.drawerHeight > 0) view.lastDrawerHeight = view.drawerHeight;
    listWrap.open = view.drawerHeight > 0;
    list.style.height = `${view.drawerHeight}px`;
    splitter.setAttribute('aria-valuemin', '0'); splitter.setAttribute('aria-valuemax', String(Math.round(Math.max(0, drawerAvailable() - 240))));
    splitter.setAttribute('aria-valuenow', String(Math.round(view.drawerHeight)));
    splitter.setAttribute('aria-valuetext', view.drawerHeight ? `${Math.round(view.drawerHeight)} pixels of list space. Drag down for more topology.` : 'List collapsed. Maximum topology space.');
  }
  list.style.height = `${view.drawerHeight}px`;
  listWrap.addEventListener('toggle', () => {
    if (!container.isConnected) return;
    // Native summary clicks expand/collapse without resetting this preference on selection.
    if (listWrap.open !== (view.drawerHeight > 0)) applyDrawer(listWrap.open ? view.lastDrawerHeight ?? 140 : 0);
  });
  let resizing = null;
  splitter.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); splitter.focus(); splitter.setPointerCapture(event.pointerId);
    resizing = { y: event.clientY, height: view.drawerHeight }; container.classList.add('topology-resizing');
  });
  splitter.addEventListener('pointermove', event => { if (resizing) applyDrawer(resizeTopologyDrawer(resizing.height, event.clientY - resizing.y, drawerAvailable())); });
  const stopResize = () => { resizing = null; container.classList.remove('topology-resizing'); };
  splitter.addEventListener('pointerup', stopResize); splitter.addEventListener('pointercancel', stopResize); splitter.addEventListener('lostpointercapture', stopResize);
  splitter.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? drawerAvailable() : event.key === 'Enter' ? view.drawerHeight ? 0 : view.lastDrawerHeight ?? 140 : view.drawerHeight + (event.key === 'ArrowUp' ? 32 : -32);
    applyDrawer(next);
  });
  const observer = new ResizeObserver(() => {
    if (!container.isConnected) { observer.disconnect(); return; }
    const rect = svg.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    let first = !view.k;
    const oldWidth = width, oldHeight = height;
    width = rect.width; height = rect.height; view.width = width; view.height = height; svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    if (!network.devices.some(d => d.position) && view.compact !== (width < 600)) {
      view.compact = width < 600;
      Object.assign(positions, positionsFor(network, view.compact));
      for (const g of world.querySelectorAll('.diagram-device')) g.setAttribute('transform', `translate(${positions[g.getAttribute('data-device-id')].join(' ')})`);
      drawPaths(); first = true;
    }
    if (first || view.autoFit) fit(); else { view.x += (width - oldWidth) / 2; view.y += (height - oldHeight) / 2; updateView(); }
    applyDrawer(view.drawerHeight);
  }); observer.observe(svg);
  return container;
}
