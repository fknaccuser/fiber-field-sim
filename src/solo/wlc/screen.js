// The wireless controller work order: the order on one tab, the controller's
// web GUI on the other (side by side when wide).
//
// The GUI behaves like a controller's: nothing changes until Apply, a new
// WLAN starts disabled on the management interface, and a pre-shared key
// has to be 8 to 63 characters. Learning ticks requirements as they land;
// Sim hides them and grades on submit, extra configuration included.

import { wlcTemplateOf, blankWlan, clone, gradeWlc, QOS, QOS_LABEL, AP_MODES } from './model.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function btn(cls, text, onClick) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
const clock = (ms) => { const t = Math.max(0, Math.round(Math.abs(ms) / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

let uid = 0;
function field(label, input) {
  const id = `wlc-f${uid += 1}`;
  input.id = id;
  const row = el('div', 'wlc-field');
  const l = el('label', null, label);
  l.htmlFor = id;
  row.append(l, input);
  return row;
}
function text(value, onInput, { type = 'text', placeholder = '' } = {}) {
  const i = el('input', 'wlc-input');
  Object.assign(i, { type, value: value ?? '', placeholder, autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  i.addEventListener('input', () => onInput(i.value));
  return i;
}
function select(value, options, onChange) {
  const s = el('select', 'wlc-input');
  for (const [v, label] of options) { const o = el('option', null, label); o.value = String(v); s.append(o); }
  s.value = String(value ?? '');
  s.addEventListener('change', () => onChange(s.value));
  return s;
}
function check(label, value, onChange) {
  const row = el('label', 'wlc-check');
  const i = el('input');
  i.type = 'checkbox';
  i.checked = Boolean(value);
  i.addEventListener('change', () => onChange(i.checked));
  row.append(i, el('span', null, label));
  return row;
}

// createWlcScreen({ kind, seed, mode, onRecord, onExit })
export function createWlcScreen({ kind, seed, mode = 'learn', onRecord, onExit } = {}) {
  const root = el('section', 'desk wlc');
  const order = wlcTemplateOf(kind).make(seed);
  const start = clone(order.controller);
  const ctl = clone(order.controller);
  const ui = { tab: 'order', page: 'monitor', sub: 'general', target: null, draft: null, error: '', note: '', open: new Set(), helped: new Set(), result: null, started: Date.now() };
  let timer = null;
  const chip = el('span', 'desk-timer');
  const tick = () => {
    const left = order.minutes * 60000 - (Date.now() - ui.started);
    chip.textContent = left >= 0 ? clock(left) : `+${clock(left)}`;
    chip.classList.toggle('is-over', left < 0);
    chip.classList.toggle('is-low', left >= 0 && left < 120000);
  };
  if (mode === 'sim') timer = setInterval(tick, 1000);
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

  function goPage(page, extra = {}) { Object.assign(ui, { page, error: '', ...extra }); draw(); }

  // ---------- the order ----------
  function orderPane() {
    const pane = el('section', 'desk-pane desk-order');
    const meta = el('div', 'desk-meta');
    meta.append(el('span', `desk-pri is-${order.priority.toLowerCase()}`, order.priority), el('span', null, order.site), el('span', null, `From: ${order.requester}`));
    pane.append(meta, el('p', 'desk-summary', order.summary));
    const notes = el('ul', 'desk-notes');
    for (const n of order.notes) notes.append(el('li', null, n));
    pane.append(notes, el('h3', 'desk-h', 'Requirements'));
    const list = el('ol', 'desk-reqs');
    for (const r of order.requirements) {
      const done = mode === 'learn' && (() => { try { return r.check(ctl); } catch { return false; } })();
      const li = el('li', `desk-req${done ? ' is-done' : ''}`);
      li.dataset.req = r.id;
      if (mode === 'learn') { const m = el('span', 'lab-check'); m.setAttribute('aria-hidden', 'true'); li.append(m); }
      const t = el('div', 'desk-req-text');
      t.append(el('span', null, r.text));
      if (mode === 'learn' && !done) {
        const open = ui.open.has(r.id);
        t.append(btn('desk-hint-btn', open ? 'Hide help' : 'Help', () => { if (open) ui.open.delete(r.id); else { ui.open.add(r.id); ui.helped.add(r.id); } draw(); }));
        if (open) t.append(el('p', 'lab-hint', r.hint));
      }
      li.append(t);
      list.append(li);
    }
    pane.append(list);
    if (mode === 'sim') pane.append(el('p', 'desk-small', 'Sim rules: no ticks, no help. Change only what the order asks for; every extra change costs a point.'));
    pane.append(btn('sk-go desk-submit', mode === 'sim' ? 'Submit for grading' : 'Finish and grade', finish));
    return pane;
  }

  // ---------- the controller GUI ----------
  function gui() {
    const pane = el('section', 'desk-pane wlc-gui');
    const head = el('div', 'wlc-head');
    head.append(el('span', 'wlc-brand', 'Wireless Controller'), el('span', 'wlc-addr', `https://${ctl.interfaces.management.ip}`));
    pane.append(head);
    const nav = el('nav', 'wlc-nav');
    for (const [id, label] of [['monitor', 'Monitor'], ['wlans', 'WLANs'], ['controller', 'Controller'], ['wireless', 'Wireless'], ['security', 'Security']]) {
      const on = ui.page === id || ui.page.startsWith(`${id}-`) || (id === 'wlans' && ui.page.startsWith('wlan')) || (id === 'controller' && ui.page.startsWith('iface')) || (id === 'wireless' && ui.page.startsWith('ap')) || (id === 'security' && ui.page.startsWith('radius'));
      const b = btn(`wlc-tab${on ? ' is-on' : ''}`, label, () => goPage(id));
      b.dataset.page = id;
      nav.append(b);
    }
    pane.append(nav);
    const body = el('div', 'wlc-body');
    const pages = { monitor, wlans, 'wlan-new': wlanNew, 'wlan-edit': wlanEdit, controller, 'iface-new': ifaceNew, 'iface-edit': ifaceEdit, wireless, 'ap-edit': apEdit, security, 'radius-new': radiusNew };
    (pages[ui.page] ?? monitor)(body);
    if (ui.error) body.prepend(el('p', 'wlc-error', ui.error));
    pane.append(body);
    return pane;
  }

  function table(headers, rows) {
    const t = el('table', 'wlc-table');
    const tr = el('tr');
    for (const h of headers) tr.append(el('th', null, h));
    const thead = el('thead');
    thead.append(tr);
    const tb = el('tbody');
    for (const r of rows) {
      const row = el('tr');
      for (const c of r) { const td = el('td'); if (c instanceof Node) td.append(c); else td.textContent = String(c ?? ''); row.append(td); }
      tb.append(row);
    }
    t.append(thead, tb);
    const wrap = el('div', 'wlc-scroll');
    wrap.append(t);
    return wrap;
  }
  const link = (label, fn) => { const b = btn('wlc-link', label, fn); return b; };
  const pageTitle = (body, title, ...actions) => { const h = el('div', 'wlc-title'); h.append(el('h3', null, title)); for (const a of actions) h.append(a); body.append(h); };
  const applyBar = (body, onApply, back) => { const r = el('div', 'wlc-actions'); r.append(btn('wlc-btn', '< Back', back), btn('wlc-btn is-primary', 'Apply', onApply)); body.append(r); };

  function monitor(body) {
    pageTitle(body, 'Summary');
    body.append(table(['', ''], [
      ['Management address', ctl.interfaces.management.ip],
      ['Access points joined', ctl.aps.length],
      ['WLANs', `${Object.values(ctl.wlans).filter(w => w.enabled).length} enabled of ${Object.keys(ctl.wlans).length}`],
      ['RADIUS servers', Object.keys(ctl.radius).length],
    ]));
  }

  function wlans(body) {
    pageTitle(body, 'WLANs', btn('wlc-btn is-primary', 'Create New', () => goPage('wlan-new', { draft: { id: firstFreeId(), profile: '', ssid: '' } })));
    const rows = Object.values(ctl.wlans).sort((a, b) => a.id - b.id).map(w => [
      link(String(w.id), () => editWlan(w.id)), w.profile, w.ssid, w.enabled ? 'Enabled' : 'Disabled',
      w.l2 === 'none' ? 'None' : `[${w.wpa3 ? 'WPA3' : 'WPA2'}][Auth(${w.akm === 'psk' ? 'PSK' : '802.1X'})]`,
    ]);
    body.append(table(['ID', 'Profile', 'SSID', 'Status', 'Security'], rows));
  }
  const firstFreeId = () => { for (let i = 1; i <= 16; i += 1) if (!ctl.wlans[i]) return i; return null; };
  function editWlan(id) { goPage('wlan-edit', { target: id, sub: 'general', draft: clone(ctl.wlans[id]) }); }

  function wlanNew(body) {
    const d = ui.draft;
    pageTitle(body, 'WLANs > New');
    const ids = Array.from({ length: 16 }, (_, k) => k + 1).filter(i => !ctl.wlans[i]);
    body.append(field('Type', select('wlan', [['wlan', 'WLAN']], () => {})));
    body.append(field('Profile Name', text(d.profile, (v) => { d.profile = v; })));
    body.append(field('SSID', text(d.ssid, (v) => { d.ssid = v; })));
    body.append(field('ID', select(d.id, ids.map(i => [i, String(i)]), (v) => { d.id = Number(v); })));
    applyBar(body, () => {
      if (!d.profile.trim() || !d.ssid.trim()) { ui.error = 'Profile Name and SSID are required.'; draw(); return; }
      if (Object.values(ctl.wlans).some(w => w.profile === d.profile.trim())) { ui.error = `Profile ${d.profile} already exists.`; draw(); return; }
      ctl.wlans[d.id] = blankWlan(d.id, d.profile.trim(), d.ssid.trim());
      editWlan(d.id);
    }, () => goPage('wlans'));
  }

  function wlanEdit(body) {
    const d = ui.draft;
    pageTitle(body, `WLANs > Edit '${d.profile}'`);
    const subs = el('div', 'wlc-subtabs');
    for (const [id, label] of [['general', 'General'], ['security', 'Security'], ['aaa', 'AAA Servers'], ['qos', 'QoS']]) {
      const b = btn(`wlc-subtab${ui.sub === id ? ' is-on' : ''}`, label, () => { ui.sub = id; draw(); });
      b.dataset.sub = id;
      subs.append(b);
    }
    body.append(subs);
    if (ui.sub === 'general') {
      body.append(field('Profile Name', text(d.profile, (v) => { d.profile = v; })));
      body.append(field('SSID', text(d.ssid, (v) => { d.ssid = v; })));
      body.append(check('Status: Enabled', d.enabled, (v) => { d.enabled = v; }));
      const ifs = Object.values(ctl.interfaces).filter(i => i.name !== 'virtual').map(i => [i.name, i.name === 'management' ? 'management' : `${i.name} (VLAN ${i.vlan})`]);
      body.append(field('Interface/Interface Group', select(d.iface, ifs, (v) => { d.iface = v; })));
      body.append(check('Broadcast SSID', d.broadcast, (v) => { d.broadcast = v; }));
    } else if (ui.sub === 'security') {
      body.append(el('p', 'wlc-sub', 'Layer 2'));
      body.append(field('Layer 2 Security', select(d.l2, [['none', 'None'], ['wpa2', 'WPA+WPA2'], ['wpa3', 'WPA3']], (v) => { d.l2 = v; d.wpa3 = v === 'wpa3'; d.wpa2 = v === 'wpa2' ? d.wpa2 : false; draw(); })));
      if (d.l2 !== 'none') {
        if (d.l2 === 'wpa2') body.append(check('WPA2 Policy', d.wpa2, (v) => { d.wpa2 = v; }));
        body.append(el('p', 'wlc-sub', 'Encryption'));
        body.append(check('AES', d.aes, (v) => { d.aes = v; }));
        if (d.l2 === 'wpa2') body.append(check('TKIP', d.tkip, (v) => { d.tkip = v; }));
        body.append(field('Auth Key Management', select(d.akm, [['802.1x', '802.1X'], ['psk', 'PSK']], (v) => { d.akm = v; draw(); })));
        if (d.akm === 'psk') body.append(field('PSK (ASCII)', text(d.psk, (v) => { d.psk = v; }, { type: 'text', placeholder: '8 to 63 characters' })));
      }
    } else if (ui.sub === 'aaa') {
      const opts = [['', 'None'], ...Object.values(ctl.radius).map(r => [r.index, `${r.ip}, port ${r.port}`])];
      body.append(el('p', 'wlc-sub', 'Authentication servers'));
      body.append(field('Server 1', select(d.radius[0] ?? '', opts, (v) => { d.radius = v ? [Number(v)] : []; })));
      if (!Object.keys(ctl.radius).length) body.append(el('p', 'wlc-note', 'No RADIUS servers yet. Add one under Security > AAA > RADIUS.'));
    } else {
      body.append(field('Quality of Service', select(d.qos, QOS.map(q => [q, QOS_LABEL[q]]), (v) => { d.qos = v; })));
    }
    applyBar(body, () => {
      if (d.l2 !== 'none' && d.akm === 'psk' && (d.psk.length < 8 || d.psk.length > 63)) { ui.error = 'The PSK must be 8 to 63 ASCII characters.'; draw(); return; }
      if (d.l2 !== 'none' && !d.aes && !d.tkip) { ui.error = 'Pick an encryption cipher.'; draw(); return; }
      if (d.l2 === 'wpa2' && !d.wpa2) { ui.error = 'Tick WPA2 Policy, or choose another Layer 2 option.'; draw(); return; }
      ctl.wlans[d.id] = { ...clone(d), profile: d.profile.trim(), ssid: d.ssid.trim() };
      ui.error = '';
      ui.flash = 'Applied.';
      draw();
    }, () => goPage('wlans'));
    if (ui.flash) { body.append(el('p', 'wlc-flash', ui.flash)); ui.flash = ''; }
  }

  function controller(body) {
    pageTitle(body, 'Interfaces', btn('wlc-btn is-primary', 'New', () => goPage('iface-new', { draft: { name: '', vlan: '' } })));
    const rows = Object.values(ctl.interfaces).map(i => [i.fixed ? i.name : link(i.name, () => goPage('iface-edit', { target: i.name, draft: clone(i) })), i.vlan === null ? 'N/A' : i.vlan === 0 ? 'untagged' : i.vlan, i.ip ?? '', i.fixed ? 'Static' : 'Dynamic']);
    body.append(table(['Interface Name', 'VLAN', 'IP Address', 'Type'], rows));
  }
  function ifaceNew(body) {
    const d = ui.draft;
    pageTitle(body, 'Interfaces > New');
    body.append(field('Interface Name', text(d.name, (v) => { d.name = v; })));
    body.append(field('VLAN Id', text(d.vlan, (v) => { d.vlan = v; }, { type: 'text', placeholder: '1-4094' })));
    applyBar(body, () => {
      const name = d.name.trim();
      const vlan = Number(d.vlan);
      if (!name) { ui.error = 'Interface Name is required.'; draw(); return; }
      if (ctl.interfaces[name]) { ui.error = `Interface ${name} already exists.`; draw(); return; }
      if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) { ui.error = 'VLAN Id must be 1 to 4094.'; draw(); return; }
      ctl.interfaces[name] = { name, vlan, port: null, ip: null, mask: null, gw: null, dhcp: null };
      goPage('iface-edit', { target: name, draft: clone(ctl.interfaces[name]) });
    }, () => goPage('controller'));
  }
  function ifaceEdit(body) {
    const d = ui.draft;
    pageTitle(body, `Interfaces > Edit '${d.name}'`);
    body.append(field('VLAN Identifier', text(String(d.vlan ?? ''), (v) => { d.vlan = v; })));
    body.append(field('Port Number', text(String(d.port ?? ''), (v) => { d.port = v; })));
    body.append(field('IP Address', text(d.ip, (v) => { d.ip = v; })));
    body.append(field('Netmask', text(d.mask, (v) => { d.mask = v; })));
    body.append(field('Gateway', text(d.gw, (v) => { d.gw = v; })));
    body.append(field('Primary DHCP Server', text(d.dhcp, (v) => { d.dhcp = v; })));
    applyBar(body, () => {
      for (const [k, label] of [['ip', 'IP Address'], ['mask', 'Netmask'], ['gw', 'Gateway'], ['dhcp', 'Primary DHCP Server']]) {
        if (!IPV4.test(String(d[k] ?? '').trim())) { ui.error = `${label} is not a valid address.`; draw(); return; }
      }
      const port = Number(d.port);
      if (!Number.isInteger(port) || port < 1 || port > 8) { ui.error = 'Port Number must be 1 to 8.'; draw(); return; }
      ctl.interfaces[d.name] = { ...ctl.interfaces[d.name], vlan: Number(d.vlan), port, ip: d.ip.trim(), mask: d.mask.trim(), gw: d.gw.trim(), dhcp: d.dhcp.trim() };
      ui.flash = 'Applied.';
      goPage('controller');
    }, () => goPage('controller'));
  }

  function wireless(body) {
    pageTitle(body, 'All APs');
    body.append(table(['AP Name', 'Model', 'IP Address', 'AP Mode'], ctl.aps.map(a => [link(a.name, () => goPage('ap-edit', { target: a.name, draft: clone(a) })), a.model, a.ip, a.mode === 'flexconnect' ? 'FlexConnect' : a.mode[0].toUpperCase() + a.mode.slice(1)])));
  }
  function apEdit(body) {
    const d = ui.draft;
    pageTitle(body, `All APs > ${d.name}`);
    body.append(field('AP Mode', select(d.mode, AP_MODES.map(m => [m, m === 'flexconnect' ? 'FlexConnect' : m[0].toUpperCase() + m.slice(1)]), (v) => { d.mode = v; })));
    body.append(el('p', 'wlc-note', 'Changing the mode reboots the AP; its clients drop for a minute.'));
    applyBar(body, () => {
      const ap = ctl.aps.find(a => a.name === d.name);
      ap.mode = d.mode;
      goPage('wireless');
    }, () => goPage('wireless'));
  }

  function security(body) {
    pageTitle(body, 'RADIUS Authentication Servers', btn('wlc-btn is-primary', 'New', () => goPage('radius-new', { draft: { ip: '', secret: '', confirm: '', port: '1812', enabled: true } })));
    body.append(table(['Index', 'Server Address', 'Port', 'Status'], Object.values(ctl.radius).map(r => [r.index, r.ip, r.port, r.enabled ? 'Enabled' : 'Disabled'])));
  }
  function radiusNew(body) {
    const d = ui.draft;
    pageTitle(body, 'RADIUS Authentication Servers > New');
    body.append(field('Server IP Address', text(d.ip, (v) => { d.ip = v; })));
    body.append(field('Shared Secret', text(d.secret, (v) => { d.secret = v; }, { type: 'password' })));
    body.append(field('Confirm Shared Secret', text(d.confirm, (v) => { d.confirm = v; }, { type: 'password' })));
    body.append(field('Port Number', text(d.port, (v) => { d.port = v; })));
    body.append(check('Server Status: Enabled', d.enabled, (v) => { d.enabled = v; }));
    applyBar(body, () => {
      if (!IPV4.test(d.ip.trim())) { ui.error = 'Server IP Address is not valid.'; draw(); return; }
      if (!d.secret || d.secret !== d.confirm) { ui.error = 'The shared secrets do not match.'; draw(); return; }
      const index = Math.max(0, ...Object.keys(ctl.radius).map(Number)) + 1;
      ctl.radius[index] = { index, ip: d.ip.trim(), secret: d.secret, port: Number(d.port), enabled: d.enabled };
      goPage('security');
    }, () => goPage('security'));
  }

  // ---------- grading ----------
  function finish() {
    stop();
    const g = gradeWlc(order, start, ctl);
    ui.result = g;
    onRecord?.({ kind, mode, pct: g.pct, helped: ui.helped.size > 0, seed, lights: order.lights });
    draw();
    window.scrollTo?.(0, 0);
  }

  function drawResult() {
    const g = ui.result;
    const head = el('section', `desk-score${g.pct === 100 ? ' is-clean' : g.pct >= 80 ? ' is-pass' : ''}`);
    head.append(el('b', 'desk-pct', `${g.pct}%`));
    head.append(el('p', null, `${g.got} of ${g.total} requirements${g.extras.length ? `, minus ${g.extras.length} for extra changes` : ''}${ui.helped.size ? ` · help used on ${ui.helped.size}` : ''}`));
    root.append(head);
    const reqs = el('ul', 'desk-graded');
    for (const r of g.reqs) {
      const li = el('li', r.ok ? 'is-ok' : 'is-miss');
      li.append(el('span', 'desk-mark', r.ok ? '✓' : '✗'), el('span', null, r.text));
      if (!r.ok) { const why = el('div', 'desk-why'); why.append(el('p', 'lab-hint', r.hint)); li.append(why); }
      reqs.append(li);
    }
    root.append(reqs);
    if (g.extras.length) {
      root.append(el('h3', 'desk-h', 'Extra changes, minus 1 each'));
      const ex = el('ul', 'desk-graded');
      for (const x of g.extras) { const li = el('li', 'is-miss'); li.append(el('span', 'desk-mark', '−1'), el('code', null, x.text)); ex.append(li); }
      root.append(ex);
    }
    const row = el('div', 'desk-card-go');
    row.append(btn('sk-back', 'Done', () => onExit?.()));
    root.append(row);
  }

  function draw() {
    root.textContent = '';
    const top = el('header', 'sk-top');
    top.append(btn('sk-back', 'Back', () => { stop(); onExit?.(); }));
    const title = el('div', 'sk-title');
    title.append(el('span', 'sk-kicker', `${order.number} · ${ui.result ? 'graded' : mode === 'sim' ? 'Sim' : 'Learning'}`), el('h1', null, order.title));
    top.append(title);
    if (mode === 'sim' && !ui.result) { tick(); top.append(chip); }
    root.append(top);
    if (ui.result) { drawResult(); return; }
    const tabs = el('div', 'desk-tabs wlc-tabs');
    for (const [id, label] of [['order', 'Order'], ['gui', 'Controller']]) {
      const t = btn(`desk-tab${ui.tab === id ? ' is-on' : ''}`, label, () => { ui.tab = id; draw(); });
      t.dataset.tab = id;
      tabs.append(t);
    }
    root.append(tabs);
    const body = el('div', `desk-body wlc-split is-${ui.tab}`);
    body.append(orderPane(), gui());
    root.append(body);
  }

  root.destroy = stop;
  draw();
  return root;
}
