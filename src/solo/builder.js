import { renderTopology } from './diagram.js';
import { equipmentIcon, EQUIPMENT } from './equipment.js';
import { DESIGN_KEY, validateDesign, blankDesign, campusDesign, deleteDevice, collapsedDesign } from './design-model.js';

function el(tag, className, text) { const e = document.createElement(tag); if (className) e.className = className; if (text) e.textContent = text; return e; }
function button(text, action, className = '') { const b = el('button', className, text); b.type = 'button'; b.addEventListener('click', action); return b; }
function editForm(fields, label, apply) {
  const form = el('form', 'design-edit-form'), inputs = {};
  for (const [key, title, value] of fields) {
    const wrap = el('label', 'form-row'), input = el('input'); input.value = value; input.maxLength = 100;
    inputs[key] = input; wrap.append(el('span', '', title), input); form.append(wrap);
  }
  const saveButton = el('button', '', label); saveButton.type = 'submit'; form.append(saveButton);
  form.addEventListener('submit', event => { event.preventDefault(); apply(Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value]))); });
  return form;
}

export function createBuilder({ onExit }) {
  let doc = campusDesign(), selected = null, cable = null, connectFrom = null, view = {}, collapsed = new Set();
  let undo = [], redo = [], message = 'Example design · changes save on this device', panel = 'canvas';
  try { const stored = localStorage.getItem(DESIGN_KEY); if (stored) { doc = validateDesign(JSON.parse(stored)); message = 'Design restored from this device'; } } catch { message = 'Saved design could not be read. Export changes if storage is unavailable.'; }
  const root = el('div', 'design-screen');
  const save = () => { try { localStorage.setItem(DESIGN_KEY, JSON.stringify(doc)); message = 'Saved on this device'; } catch { message = 'Not saved · storage unavailable. Use Export JSON to keep your design.'; } };
  const commit = next => {
    try { const valid = validateDesign(next); undo.push(doc); undo = undo.slice(-50); redo = []; doc = valid; save(); }
    catch (error) { message = error.message; }
    render();
  };
  const toggleSite = id => { if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id); render(); };
  function pick(id) {
    if (id.startsWith('site:')) { toggleSite(id.slice(5)); return; }
    if (connectFrom) {
      if (id === connectFrom) { message = 'Choose a different device for the other endpoint.'; render(); return; }
      if (doc.links.some(l => l.a === id && l.b === connectFrom || l.b === id && l.a === connectFrom)) { message = 'Those devices already have a cable.'; render(); return; }
      const next = { ...doc, links: [...doc.links, { id: crypto.randomUUID(), a: connectFrom, b: id, label: 'Ethernet' }] };
      connectFrom = null; commit(next); return;
    }
    selected = id; cable = null; panel = 'inspector'; render();
  }
  function addDevice(kind) {
    const id = crypto.randomUUID(), number = doc.devices.filter(d => d.kind === kind).length + 1;
    const center = [(view.width / 2 - view.x) / view.k, (view.height / 2 - view.y) / view.k];
    if (!center.every(Number.isFinite)) { center[0] = 400; center[1] = 250; }
    let position = center;
    for (let n = 0; doc.devices.some(d => Math.hypot(d.position[0] - position[0], d.position[1] - position[1]) < 130) && n < 200; n++) {
      const angle = n * 2.4, radius = 160 + 30 * Math.sqrt(n);
      position = [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
    }
    selected = id; panel = 'inspector';
    commit({ ...doc, devices: [...doc.devices, { id, kind, name: `${EQUIPMENT[kind]} ${number}`, position, siteId: '', address: '' }] });
  }
  function download() {
    const a = el('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })); a.download = 'field-network-design.json'; a.click(); URL.revokeObjectURL(a.href);
  }
  function render() {
    root.replaceChildren();
    const header = el('header', 'design-header');
    const brand = el('div', 'workspace-brand', 'FIELD'); brand.append(el('span', '', 'NETWORK STUDIO'));
    header.append(brand, el('h1', '', doc.name), button('Back to training', onExit)); root.append(header);
    const tools = el('div', 'design-actions');
    const undoButton = button('Undo', () => { redo.push(doc); doc = undo.pop(); selected = null; cable = null; save(); render(); }); undoButton.disabled = undo.length === 0;
    const redoButton = button('Redo', () => { undo.push(doc); doc = redo.pop(); selected = null; cable = null; save(); render(); }); redoButton.disabled = redo.length === 0;
    const importInput = el('input'); importInput.type = 'file'; importInput.accept = '.json,application/json'; importInput.hidden = true;
    importInput.addEventListener('change', async () => {
      try { const file = importInput.files[0]; if (!file) return; if (file.size > 2_000_000) throw new Error('Choose a design smaller than 2 MB.'); const next = validateDesign(JSON.parse(await file.text())); selected = null; cable = null; collapsed = new Set(); view = {}; commit(next); }
      catch (error) { message = error.message; render(); }
    });
    tools.append(undoButton, redoButton, button('New design', () => { selected = null; cable = null; collapsed = new Set(); view = {}; commit(blankDesign()); }), button('Campus example', () => { selected = null; cable = null; collapsed = new Set(); view = {}; commit(campusDesign()); }), button('Import JSON', () => importInput.click()), button('Export JSON', download), importInput);
    const mode = el('span', 'design-mode', 'Design mode · topology & annotations'); tools.append(mode); root.append(tools);
    const mobileTabs = el('div', 'design-mobile-tabs');
    for (const p of ['equipment', 'canvas', 'inspector']) { const b = button(p[0].toUpperCase() + p.slice(1), () => { panel = p; render(); }); b.setAttribute('aria-pressed', String(panel === p)); mobileTabs.append(b); }
    root.append(mobileTabs); root.dataset.panel = panel;
    const workspace = el('div', 'design-workspace'), palette = el('aside', 'design-palette');
    palette.append(el('div', 'section-kicker', 'BUILD YOUR NETWORK'), el('h2', '', 'Equipment'), el('p', 'panel-description', 'Add a device, then drag it into place.'));
    const library = el('div', 'equipment-library');
    for (const [kind, name] of Object.entries(EQUIPMENT)) { const b = button('', () => addDevice(kind), 'equipment-button'); b.setAttribute('aria-label', `Add ${name}`); b.append(equipmentIcon(kind), el('span', '', name)); library.append(b); }
    palette.append(library, el('h2', '', 'Sites'));
    for (const s of doc.sites) {
      const row = el('div', 'site-entry');
      const remove = button('×', () => { collapsed.delete(s.id); commit({ ...doc, sites: doc.sites.filter(site => site.id !== s.id), devices: doc.devices.map(d => d.siteId === s.id ? { ...d, siteId: '' } : d) }); });
      remove.setAttribute('aria-label', `Remove site ${s.name}`);
      row.append(button(`${collapsed.has(s.id) ? '+' : '−'} ${s.name}`, () => toggleSite(s.id), 'site-toggle'), remove); palette.append(row);
    }
    palette.append(button('+ Add site', () => commit({ ...doc, sites: [...doc.sites, { id: crypto.randomUUID(), name: `Site ${doc.sites.length + 1}` }] })));
    const canvas = el('main', 'design-canvas');
    if (connectFrom) { const notice = el('div', 'connect-notice', `Connecting from ${doc.devices.find(d => d.id === connectFrom)?.name}. Select the destination device.`); notice.append(button('Cancel', () => { connectFrom = null; render(); })); canvas.append(notice); }
    const visible = collapsedDesign(doc, collapsed);
    canvas.append(renderTopology(visible, { selectedDeviceId: selected, reconnectLinkId: cable, viewState: view, sites: visible.sites, compactList: true, totalDevices: doc.devices.length, totalLinks: doc.links.length, onToggleSite: toggleSite, onSelectDevice: pick,
      onSelectLink: id => { cable = id; selected = null; panel = 'inspector'; render(); },
      onMoveDevice: (id, position) => {
        if (id.startsWith('site:')) return;
        const restoreFocus = document.activeElement?.classList.contains('diagram-device');
        commit({ ...doc, devices: doc.devices.map(d => d.id === id ? { ...d, position: position.map(n => Math.round(Math.max(-20000, Math.min(20000, n)) / 10) * 10) } : d) });
        if (restoreFocus) root.querySelector(`[data-device-id="${CSS.escape(id)}"]`)?.focus();
      },
    }));
    const inspector = el('aside', 'design-inspector'); inspector.append(el('div', 'section-kicker', 'CONTEXT'), el('h2', '', 'Inspector'));
    const device = doc.devices.find(d => d.id === selected), link = doc.links.find(l => l.id === cable);
    if (device) {
      inspector.append(equipmentIcon(device.kind), el('h3', '', EQUIPMENT[device.kind]));
      const update = changes => commit({ ...doc, devices: doc.devices.map(d => d.id === selected ? { ...d, ...changes } : d) });
      inspector.append(editForm([['name', 'Device name', device.name], ['address', 'Address / subnet annotation', device.address]], 'Apply details', update));
      const siteField = el('label', 'form-row'), select = el('select'); siteField.append(el('span', '', 'Site'));
      for (const s of [{ id: '', name: 'Ungrouped' }, ...doc.sites]) { const o = el('option', '', s.name); o.value = s.id; o.selected = s.id === device.siteId; select.append(o); }
      select.addEventListener('change', () => update({ siteId: select.value })); siteField.append(select); inspector.append(siteField);
      if (device.siteId) inspector.append(editForm([['name', 'Site name', doc.sites.find(s => s.id === device.siteId).name]], 'Rename site', ({ name }) => commit({ ...doc, sites: doc.sites.map(s => s.id === device.siteId ? { ...s, name } : s) })));
      inspector.append(button('Connect to device', () => { connectFrom = device.id; panel = 'canvas'; message = 'Select the other device on the canvas or in its device list.'; render(); }, 'primary-button'));
      inspector.append(button('Remove device', () => { const next = deleteDevice(doc, selected); selected = null; commit(next); }, 'danger-button'));
      inspector.append(el('p', 'panel-description', 'Drag on the canvas or use arrow keys on a focused device. Undo restores removed devices and cables.'));
    } else if (link) {
      const a = doc.devices.find(d => d.id === link.a), b = doc.devices.find(d => d.id === link.b);
      inspector.append(el('h3', '', `${a.name} → ${b.name}`), editForm([['label', 'Cable label', link.label]], 'Apply label', ({ label }) => commit({ ...doc, links: doc.links.map(l => l.id === cable ? { ...l, label } : l) })), button('Remove cable', () => { const next = { ...doc, links: doc.links.filter(l => l.id !== cable) }; cable = null; commit(next); }, 'danger-button'));
    } else {
      inspector.append(el('div', 'inspector-empty', 'Select equipment to edit its details or make a connection.'), editForm([['name', 'Network name', doc.name]], 'Rename network', ({ name }) => commit({ ...doc, name })));
      inspector.append(el('h3', '', 'Room to grow'), el('p', 'panel-description', 'Build up to 200 devices across 40 sites. Collapse a site to follow its uplinks, then expand it to work inside.'));
    }
    inspector.append(el('p', 'design-scope', 'Designs document your network. Use training labs for scored configuration and connectivity tests.'));
    workspace.append(palette, canvas, inspector); root.append(workspace);
    const status = el('footer', 'design-status'); status.setAttribute('role', 'status'); status.append(el('span', '', message), el('span', '', `${doc.devices.length} devices / ${doc.links.length} cables / ${doc.sites.length} sites`)); root.append(status);
  }
  render(); return root;
}
