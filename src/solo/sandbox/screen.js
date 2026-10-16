// The sandbox on screen: what to try, the map, and the consoles. Nothing is
// graded. The network is saved after every command, so leaving and coming
// back picks up where it was (the consoles reopen at the user prompt, the
// way a reconnected console cable does).
//
// A server's Services panel sets its DNS records and DHCP pool, the way a
// server's service pages do; everything else is typed.

import { sandboxById } from './networks.js';
import { buildWorld } from '../desk/grade.js';
import { renderTopology } from '../desk/topology.js';
import { createConsoles } from '../desk/console.js';
import { refresh } from '../labs/world.js';
import { parseIp, formatIp, isIp } from '../labs/ip4.js';

const KEY = 'field-sandbox-v1';

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

function loadAll() { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; } }
function saveAll(all) { try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch { return false; } }
export const sandboxSaved = (id) => Boolean(loadAll()[id]?.devices);

// Everything a device keeps: its configuration, saved configuration, keys.
function snapshot(world, ticks) {
  return {
    at: Date.now(), ticks,
    devices: Object.fromEntries(Object.values(world.devices).map(d => [d.id, { config: d.config, startup: d.startup, rsaBits: d.rsaBits ?? null, err: d.err ?? {} }])),
    leases: world.dhcpLeases ?? {},
  };
}
function restore(world, snap) {
  for (const [id, s] of Object.entries(snap.devices ?? {})) {
    const d = world.devices[id];
    if (!d) continue;
    d.config = s.config; d.startup = s.startup; d.rsaBits = s.rsaBits; d.err = s.err ?? {};
  }
  world.dhcpLeases = snap.leases ?? {};
  refresh(world);
}

export function createSandbox({ id, onExit } = {}) {
  const root = el('section', 'desk sandbox');
  const net = sandboxById(id);
  let world = buildWorld(net);
  const all = loadAll();
  const prior = all[id];
  if (prior?.devices) restore(world, prior);
  const ui = { tab: 'try', ticks: new Set(prior?.ticks ?? []), note: '' };
  let con = createConsoles(world, net.devices, net.devices.find(d => !d.theirs)?.id, { redraw: () => { persist(); draw(); }, inputId: 'sandbox-cmd' });

  function persist() {
    const fresh = loadAll();
    fresh[id] = snapshot(world, [...ui.ticks]);
    if (!saveAll(fresh)) ui.note = 'Could not save on this device; your work stays while this page is open.';
  }

  function reset() {
    if (!window.confirm?.('Reset this network to blank? Your configuration here is erased.')) return;
    const fresh = loadAll();
    delete fresh[id];
    saveAll(fresh);
    world = buildWorld(net);
    ui.ticks = new Set();
    con = createConsoles(world, net.devices, net.devices.find(d => !d.theirs)?.id, { redraw: () => { persist(); draw(); }, inputId: 'sandbox-cmd' });
    draw();
  }

  function tryPane() {
    const pane = el('section', 'desk-pane desk-order');
    pane.append(el('p', 'desk-summary', net.blurb));
    const plan = el('ul', 'desk-notes');
    for (const p of net.plan) plan.append(el('li', null, p));
    pane.append(plan);
    pane.append(el('h3', 'desk-h', 'Things to try'));
    pane.append(el('p', 'desk-small', 'In this order, each one builds on the last. Tick them off yourself; nothing here is graded.'));
    const list = el('ol', 'sb-tries');
    net.tries.forEach(([what, how], k) => {
      const li = el('li', `sb-try${ui.ticks.has(k) ? ' is-done' : ''}`);
      const box = el('input');
      box.type = 'checkbox';
      box.checked = ui.ticks.has(k);
      box.id = `sb-try-${k}`;
      box.addEventListener('change', () => { if (box.checked) ui.ticks.add(k); else ui.ticks.delete(k); persist(); li.classList.toggle('is-done', box.checked); });
      const text = el('label', null);
      text.htmlFor = box.id;
      text.append(el('b', null, what), el('span', null, how));
      li.append(box, text);
      list.append(li);
    });
    pane.append(list);
    if (net.devices.some(d => d.theirs)) pane.append(el('p', 'desk-small', `${net.devices.filter(d => d.theirs).map(d => d.id).join(', ')} belongs to someone else and is already set up.`));
    if (ui.note) pane.append(el('p', 'sk-error', ui.note));
    pane.append(btn('sk-back sb-reset', 'Reset this network', reset));
    return pane;
  }

  function mapPane() {
    const pane = el('section', 'desk-pane desk-map');
    pane.append(renderTopology(world, net, { current: con.current, onPick: (d) => { con.current = d; ui.tab = 'console'; draw(); con.focus(); } }));
    const key = el('p', 'desk-legend');
    for (const [cls, text] of [['up', 'up'], ['blk', 'blocking'], ['down', 'down'], ['err', 'err-disabled']]) {
      const k = el('span', `desk-key is-${cls}`);
      k.append(el('i'), el('span', null, text));
      key.append(k);
    }
    pane.append(key, el('p', 'desk-small', 'Tap a device to open its console.'));
    return pane;
  }

  // ---------- a server's services ----------
  function servicesPanel(devId) {
    const dev = world.devices[devId];
    const srv = dev.config.server;
    const box = el('section', 'desk-pane sb-services');
    box.append(el('h3', 'desk-h', `${devId} · Services`));
    // DNS
    const dns = el('div', 'sb-svc');
    const dnsOn = el('label', 'sb-toggle');
    const dnsBox = el('input'); dnsBox.type = 'checkbox'; dnsBox.checked = srv.dns.on;
    dnsBox.addEventListener('change', () => { srv.dns.on = dnsBox.checked; refresh(world); persist(); draw(); });
    dnsOn.append(dnsBox, el('span', null, 'DNS service on'));
    dns.append(el('b', null, 'DNS'), dnsOn);
    const recs = el('table', 'sb-table');
    const head = el('tr'); head.append(el('th', null, 'Name'), el('th', null, 'Address'), el('th', null, ''));
    recs.append(head);
    for (const [name, a] of Object.entries(srv.dns.records)) {
      const tr = el('tr');
      const td = el('td');
      td.append(btn('sb-del', 'Remove', () => { delete srv.dns.records[name]; persist(); draw(); }));
      tr.append(el('td', null, name), el('td', null, formatIp(a)), td);
      recs.append(tr);
    }
    dns.append(recs);
    const add = el('form', 'sb-add');
    const n = el('input', 'sb-input'); n.placeholder = 'name, like portal.office.lab'; n.setAttribute('aria-label', 'Record name'); n.autocapitalize = 'off';
    const ip = el('input', 'sb-input'); ip.placeholder = 'address'; ip.setAttribute('aria-label', 'Record address');
    const go = btn('sk-go sk-go-small', 'Add A record'); go.type = 'submit';
    add.append(n, ip, go);
    add.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = n.value.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(name) || !isIp(ip.value.trim())) { ui.svcError = 'A record needs a name and an IPv4 address.'; draw(); return; }
      srv.dns.records[name] = parseIp(ip.value.trim());
      ui.svcError = '';
      persist(); draw();
    });
    dns.append(add);
    box.append(dns);
    // DHCP
    const dh = el('div', 'sb-svc');
    const dhOn = el('label', 'sb-toggle');
    const dhBox = el('input'); dhBox.type = 'checkbox'; dhBox.checked = srv.dhcp.on;
    dhBox.addEventListener('change', () => { srv.dhcp.on = dhBox.checked; persist(); draw(); });
    dhOn.append(dhBox, el('span', null, 'DHCP service on'));
    dh.append(el('b', null, 'DHCP'), dhOn);
    const pool = srv.dhcp.pools[0] ?? { name: 'serverPool', start: null, mask: null, gateway: null, dns: null, max: 50 };
    const form = el('form', 'sb-pool');
    const fields = [['gateway', 'Default gateway'], ['dns', 'DNS server'], ['start', 'Start IP address'], ['mask', 'Subnet mask']];
    const inputs = {};
    for (const [k, label] of fields) {
      const row = el('label', 'sb-field');
      const i = el('input', 'sb-input');
      i.value = pool[k] === null || pool[k] === undefined ? '' : formatIp(pool[k]);
      inputs[k] = i;
      row.append(el('span', null, label), i);
      form.append(row);
    }
    const maxRow = el('label', 'sb-field');
    const maxIn = el('input', 'sb-input'); maxIn.value = String(pool.max ?? 50); maxIn.inputMode = 'numeric';
    maxRow.append(el('span', null, 'Maximum users'), maxIn);
    form.append(maxRow);
    const save = btn('sk-go sk-go-small', 'Save pool'); save.type = 'submit';
    form.append(save);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const vals = {};
      for (const [k, label] of fields) {
        const v = inputs[k].value.trim();
        if (!v && k === 'dns') { vals[k] = null; continue; }
        if (!isIp(v)) { ui.svcError = `${label} is not a valid address.`; draw(); return; }
        vals[k] = parseIp(v);
      }
      srv.dhcp.pools = [{ name: 'serverPool', ...vals, max: Math.max(1, Number(maxIn.value) || 50) }];
      ui.svcError = '';
      persist(); draw();
    });
    dh.append(form);
    box.append(dh);
    if (ui.svcError) box.append(el('p', 'sk-error', ui.svcError));
    return box;
  }

  function consoleTab() {
    const wrap = el('div', 'desk-pane-group desk-console');
    if (world.devices[con.current]?.config.server) wrap.append(servicesPanel(con.current));
    if (net.devices.find(d => d.id === con.current)?.theirs) wrap.append(el('p', 'desk-small sb-theirs', `${con.current} belongs to the provider. Look, but it is not yours to change.`));
    wrap.append(con.pane('desk-pane lab-console'));
    return wrap;
  }

  function draw() {
    root.textContent = '';
    const top = el('header', 'sk-top');
    top.append(btn('sk-back', 'Back', () => { persist(); onExit?.(); }));
    const title = el('div', 'sk-title');
    title.append(el('span', 'sk-kicker', `Sandbox · level ${net.level}`), el('h1', null, net.title));
    top.append(title);
    root.append(top);
    const tabs = el('div', 'desk-tabs');
    for (const [tid, label] of [['try', 'Try'], ['map', 'Map'], ['console', 'Console']]) {
      const t = btn(`desk-tab${ui.tab === tid ? ' is-on' : ''}`, label, () => { ui.tab = tid; draw(); if (tid === 'console') con.focus(); });
      t.dataset.tab = tid;
      tabs.append(t);
    }
    root.append(tabs);
    const body = el('div', `desk-body is-${ui.tab === 'try' ? 'order' : ui.tab}`);
    body.append(tryPane(), mapPane(), consoleTab());
    root.append(body);
  }

  root.destroy = persist;
  draw();
  return root;
}
