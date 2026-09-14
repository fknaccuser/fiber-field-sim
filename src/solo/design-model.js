// Design documents are separate from scored attempts: the training evaluator currently
// models one router. A multi-router drawing must never masquerade as a simulated run.
export const DESIGN_KEY = 'field-network-design-v1';
export const DESIGN_KINDS = ['router', 'switch', 'client', 'server', 'accessPoint', 'firewall', 'cloud', 'fiber'];
export function validateDesign(value) {
  if (!value || value.schema !== 'field-design-1' || !Array.isArray(value.devices) || !Array.isArray(value.links) || !Array.isArray(value.sites)) throw new Error('Choose a Field network design JSON file.');
  if (value.devices.length > 200 || value.links.length > 600 || value.sites.length > 40) throw new Error('Design limit: 200 devices, 600 links, 40 sites.');
  const text = s => typeof s === 'string' && s.length > 0 && s.length <= 100;
  const ids = new Set(), sites = new Set(), links = new Set();
  if (!text(value.name)) throw new Error('The design needs a name (up to 100 characters).');
  for (const site of value.sites) { if (!text(site.id) || !text(site.name) || sites.has(site.id)) throw new Error('Invalid or duplicate site.'); sites.add(site.id); }
  for (const d of value.devices) {
    if (!text(d.id) || d.id.startsWith('site:') || !text(d.name) || ids.has(d.id) || !DESIGN_KINDS.includes(d.kind)) throw new Error('Invalid or duplicate device.');
    if (!Array.isArray(d.position) || d.position.length !== 2 || !d.position.every(n => Number.isFinite(n) && Math.abs(n) <= 20000)) throw new Error('Invalid device position.');
    if (d.siteId && !sites.has(d.siteId)) throw new Error('A device references a missing site.');
    if (d.address !== undefined && (typeof d.address !== 'string' || d.address.length > 100)) throw new Error('Address annotations must be under 100 characters.');
    ids.add(d.id);
  }
  for (const l of value.links) {
    if (!text(l.id) || links.has(l.id) || !ids.has(l.a) || !ids.has(l.b) || l.a === l.b || typeof l.label !== 'string' || l.label.length > 100) throw new Error('Invalid cable or endpoint.'); links.add(l.id);
  }
  // Normalize input rather than retaining arbitrary imported properties.
  return { schema: 'field-design-1', name: value.name, sites: value.sites.map(s => ({ id: s.id, name: s.name })),
    devices: value.devices.map(d => ({ id: d.id, name: d.name, kind: d.kind, position: [...d.position], siteId: d.siteId || '', address: d.address || '' })),
    links: value.links.map(l => ({ id: l.id, a: l.a, b: l.b, label: l.label })) };
}
export function blankDesign() { return { schema: 'field-design-1', name: 'Untitled network', devices: [], links: [], sites: [] }; }
export function campusDesign() {
  const doc = blankDesign(); doc.name = 'Northline · Regional network';
  const add = (id, kind, name, position, siteId = '', address = '') => doc.devices.push({ id, kind, name, position, siteId, address });
  const link = (a, b, label = '') => doc.links.push({ id: `L${doc.links.length + 1}`, a, b, label });
  add('ISP', 'cloud', 'Internet', [700, 75]); add('CORE', 'router', 'Core router', [700, 245]); link('ISP', 'CORE', 'WAN');
  const sites = [['hq', 'Headquarters', 100, 370], ['west', 'West branch', 620, 370], ['east', 'East branch', 1140, 370], ['lab', 'Engineering', 100, 780], ['ops', 'Operations', 620, 780], ['dc', 'Data center', 1140, 780]];
  for (const [id, name, x, y] of sites) {
    doc.sites.push({ id, name });
    add(`${id}-R`, 'router', 'Gateway', [x + 170, y], id); link('CORE', `${id}-R`, 'Fiber');
    add(`${id}-SW`, 'switch', 'Access switch', [x + 170, y + 95], id); link(`${id}-R`, `${id}-SW`, 'Trunk');
    const kinds = id === 'dc' ? ['server', 'server', 'fiber'] : ['client', 'client', 'accessPoint'];
    kinds.forEach((kind, i) => { const nodeId = `${id}-${i + 1}`; add(nodeId, kind, kind === 'client' ? `Workstation ${i + 1}` : kind === 'server' ? `Server ${i + 1}` : kind === 'fiber' ? 'Fiber cabinet' : 'Wireless AP', [x + i * 170, y + 210], id); link(`${id}-SW`, nodeId); });
  }
  return doc;
}
export function deleteDevice(doc, id) { return { ...doc, devices: doc.devices.filter(d => d.id !== id), links: doc.links.filter(l => l.a !== id && l.b !== id) }; }
export function collapsedDesign(doc, collapsed = new Set()) {
  const map = new Map(doc.devices.map(d => [d.id, collapsed.has(d.siteId) ? `site:${d.siteId}` : d.id]));
  const devices = doc.devices.filter(d => !collapsed.has(d.siteId)).map(d => ({ ...d, subtitle: d.address || '' }));
  const sites = [];
  for (const site of doc.sites) {
    const members = doc.devices.filter(d => d.siteId === site.id); if (!members.length) continue;
    const xs = members.map(d => d.position[0]), ys = members.map(d => d.position[1]);
    const x = Math.min(...xs) - 90, y = Math.min(...ys) - 80, w = Math.max(...xs) - x + 90, h = Math.max(...ys) - y + 105;
    if (collapsed.has(site.id)) devices.push({ id: `site:${site.id}`, kind: 'site', name: site.name, subtitle: `${members.length} devices · expand`, position: [x + w / 2, y + h / 2] });
    else sites.push({ ...site, x, y, w, h });
  }
  const seen = new Set(), links = [];
  for (const l of doc.links) {
    const a = map.get(l.a), b = map.get(l.b); if (a === b) continue;
    const key = [a, b].sort().join('|');
    if ((a.startsWith('site:') || b.startsWith('site:')) && seen.has(key)) continue;
    seen.add(key); links.push({ ...l, a, b });
  }
  return { devices, links, sites };
}
