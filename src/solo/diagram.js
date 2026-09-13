// SVG topology (UI_AND_STORAGE.md "Network view is an SVG schematic"). Plain
// vector shapes and labeled ports, not a 2D world/character engine. Every
// clickable device/cable also has a keyboard-focusable equivalent, and the
// whole diagram has a plain HTML list alternative (UI_AND_STORAGE.md's
// accessibility rules).

// Coordinates from SCENARIOS.md "Fixed generator details", on a 100x100 viewBox.
const POSITIONS = {
  BR: { PC1: [15, 20], PC2: [15, 75], SW1: [38, 35], SW2: [58, 35], R1: [77, 35], S1: [94, 35] },
  OF: {
    PC1: [15, 20],
    PC2: [15, 75],
    SW1: [38, 35],
    SW2: [58, 35],
    R1: [77, 35],
    S1: [94, 35],
    PC3: [58, 75],
  },
  HM: { PC1: [15, 20], PC2: [15, 75], SW1: [38, 35], R1: [65, 35], S1: [90, 35] },
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  return el;
}

function positionsFor(network) {
  return POSITIONS[network.layoutId] ?? {};
}

function deviceLabel(device) {
  return `${device.name} (${device.kind})`;
}

// A plain vector glyph per device kind so the diagram reads as a laptop,
// switch, router or server without any asset/art dependency.
function deviceShape(kind) {
  switch (kind) {
    case 'client':
      return svgEl('rect', { x: -6, y: -4, width: 12, height: 8, rx: 1 });
    case 'server':
      return svgEl('rect', { x: -5, y: -7, width: 10, height: 14, rx: 1 });
    case 'router':
      return svgEl('polygon', { points: '0,-7 7,0 0,7 -7,0' });
    case 'switch':
    default:
      return svgEl('rect', { x: -8, y: -3, width: 16, height: 6, rx: 1 });
  }
}

function linkEndpoints(network, link) {
  const portA = network.ports.find((p) => p.id === link.aPortId);
  const portB = network.ports.find((p) => p.id === link.bPortId);
  return [portA?.deviceId, portB?.deviceId];
}

export function renderTopology(
  network,
  { selectedDeviceId = null, onSelectDevice, onSelectLink, reconnectLinkId = null } = {},
) {
  const container = document.createElement('div');
  container.className = 'diagram';

  const svg = svgEl('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': 'Network topology' });
  const positions = positionsFor(network);

  const linksGroup = svgEl('g', { class: 'diagram-links' });
  for (const link of network.links) {
    const [deviceAId, deviceBId] = linkEndpoints(network, link);
    const posA = positions[deviceAId];
    const posB = positions[deviceBId];
    if (!posA || !posB) continue;
    const classes = ['diagram-link'];
    if (!link.connected) classes.push('diagram-link-down');
    if (link.id === reconnectLinkId) classes.push('diagram-link-reconnecting');
    const line = svgEl('line', {
      x1: posA[0],
      y1: posA[1],
      x2: posB[0],
      y2: posB[1],
      class: classes.join(' '),
      tabindex: '0',
      role: 'button',
      'aria-label': `Cable ${link.id}, ${link.connected ? 'connected' : 'disconnected'}`,
    });
    const selectLink = () => onSelectLink?.(link.id);
    line.addEventListener('click', selectLink);
    line.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectLink();
      }
    });
    linksGroup.appendChild(line);
  }
  svg.appendChild(linksGroup);

  const devicesGroup = svgEl('g', { class: 'diagram-devices' });
  for (const device of network.devices) {
    const pos = positions[device.id];
    if (!pos) continue;
    const group = svgEl('g', {
      class: device.id === selectedDeviceId ? 'diagram-device diagram-device-selected' : 'diagram-device',
      transform: `translate(${pos[0]}, ${pos[1]})`,
      tabindex: '0',
      role: 'button',
      'aria-label': deviceLabel(device),
      'aria-pressed': device.id === selectedDeviceId ? 'true' : 'false',
    });
    group.appendChild(deviceShape(device.kind));
    const label = svgEl('text', { class: 'diagram-device-label', x: 0, y: 12, 'text-anchor': 'middle' });
    label.textContent = device.name;
    group.appendChild(label);

    const select = () => onSelectDevice?.(device.id);
    group.addEventListener('click', select);
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });
    devicesGroup.appendChild(group);
  }
  svg.appendChild(devicesGroup);

  container.appendChild(svg);

  // Equivalent selectable list: every device (and link status) reachable
  // without pointing at the SVG at all.
  const list = document.createElement('ul');
  list.className = 'diagram-list';
  for (const device of network.devices) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'diagram-list-device';
    button.textContent = deviceLabel(device);
    button.setAttribute('aria-pressed', device.id === selectedDeviceId ? 'true' : 'false');
    button.addEventListener('click', () => onSelectDevice?.(device.id));
    item.appendChild(button);
    list.appendChild(item);
  }
  for (const link of network.links) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      link.id === reconnectLinkId ? 'diagram-list-link diagram-list-link-reconnecting' : 'diagram-list-link';
    button.textContent = `Cable ${link.id}: ${link.connected ? 'connected' : 'disconnected'}`;
    button.addEventListener('click', () => onSelectLink?.(link.id));
    item.appendChild(button);
    list.appendChild(item);
  }
  container.appendChild(list);

  return container;
}
