// Preview-only entry point. The logic below is the repo's own jobs.js and
// layouts.js; only the editing surface is written for the preview, so the
// pass/fail behaviour you see here is the behaviour the tests cover.

import { JOBS, prepareJob, gradeJob } from '../src/solo/jobs.js';

// Which fields a job lets you touch. Kept here rather than in jobs.js so the
// module stays a pure spec-and-grade layer with no UI vocabulary in it.
const FIELDS = {
  'job-workstation': [
    { kind: 'device', id: 'PC1', key: 'ip', label: 'IPv4 address', type: 'text', placeholder: 'e.g. 10.42.10.77' },
    { kind: 'device', id: 'PC1', key: 'prefix', label: 'Prefix length', type: 'number', placeholder: '24' },
    { kind: 'device', id: 'PC1', key: 'gateway', label: 'Default gateway', type: 'text' },
    { kind: 'device', id: 'PC1', key: 'dns', label: 'DNS server', type: 'text' },
  ],
  'job-access-vlan': [
    { kind: 'port', id: 'SW1:Gi0/3', key: 'mode', label: 'Port mode', type: 'select', options: ['access', 'trunk'] },
    { kind: 'port', id: 'SW1:Gi0/3', key: 'accessVlan', label: 'Access VLAN', type: 'number' },
  ],
  'job-port-up': [
    { kind: 'port', id: 'SW1:Gi0/1', key: 'adminUp', label: 'Port enabled', type: 'bool' },
    { kind: 'link', id: 'SW1:Gi0/1', key: 'connected', label: 'Cable seated', type: 'bool' },
  ],
  'job-trunk': [
    { kind: 'port', id: 'SW1:Gi0/24', key: 'mode', label: 'Port mode', type: 'select', options: ['access', 'trunk'] },
    { kind: 'port', id: 'SW1:Gi0/24', key: 'allowedVlans', label: 'Allowed VLANs', type: 'vlans', placeholder: 'e.g. 10,20' },
  ],
  'job-resolver': [
    { kind: 'device', id: 'PC1', key: 'dns', label: 'DNS server', type: 'text' },
  ],
};

// A hint at what the segment looks like, so the trainee has something to read
// rather than something to guess. This is the point of the tier: you can see
// what correct looks like elsewhere on the network.
const REFERENCE = (network) => {
  const rows = [];
  for (const d of network.devices) {
    if (d.kind === 'client' || d.kind === 'server') rows.push([d.id, `${d.ip ?? '—'}${d.prefix ? '/' + d.prefix : ''}`, `gw ${d.gateway ?? '—'}`, `dns ${d.dns ?? '—'}`]);
    if (d.kind === 'router') rows.push([d.id, d.ip ?? '—', '', '']);
  }
  for (const p of network.ports) {
    if (p.id.startsWith('SW')) rows.push([p.id, p.mode, p.mode === 'trunk' ? `allows ${p.allowedVlans.join(',') || '—'}` : `vlan ${p.accessVlan}`, p.adminUp ? 'up' : 'shut']);
  }
  return rows;
};

const state = { jobId: JOBS[0].id, run: null, graded: null, streak: 0, cleared: new Set() };
const root = document.getElementById('root');

function startJob(jobId) {
  state.jobId = jobId;
  state.run = prepareJob(jobId);
  state.graded = null;
  render();
}

function setValue(field, raw) {
  const net = state.run.network;
  let value = raw;
  if (field.type === 'number') value = raw === '' ? null : Number(raw);
  if (field.type === 'vlans') value = String(raw).split(/[,\s]+/).map(Number).filter(Number.isInteger);
  if (field.type === 'text') value = String(raw).trim() === '' ? null : String(raw).trim();

  if (field.kind === 'device') {
    state.run.network = { ...net, devices: net.devices.map(d => (d.id === field.id ? { ...d, [field.key]: value } : d)) };
  } else if (field.kind === 'port') {
    state.run.network = { ...net, ports: net.ports.map(p => (p.id === field.id ? { ...p, [field.key]: value } : p)) };
  } else {
    state.run.network = {
      ...net,
      links: net.links.map(l => (l.aPortId === field.id || l.bPortId === field.id ? { ...l, [field.key]: value } : l)),
    };
  }
}

function currentValue(field) {
  const net = state.run.network;
  if (field.kind === 'device') return net.devices.find(d => d.id === field.id)?.[field.key];
  if (field.kind === 'port') return net.ports.find(p => p.id === field.id)?.[field.key];
  const link = net.links.find(l => l.aPortId === field.id || l.bPortId === field.id);
  return link?.[field.key];
}

function check() {
  state.graded = gradeJob(state.jobId, state.run.network, state.run.spec);
  if (state.graded.passed) {
    if (!state.cleared.has(state.jobId)) state.cleared.add(state.jobId);
    state.streak += 1;
  } else {
    state.streak = 0;
  }
  render();
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function render() {
  root.innerHTML = '';
  const job = JOBS.find(j => j.id === state.jobId);

  const head = el('header', 'jp-head');
  head.append(el('h1', null, 'Jobs'));
  head.append(el('p', 'jp-sub', 'Nothing is broken. There is a spec. Do the thing, check the result.'));
  const streak = el('p', 'jp-streak', `${state.cleared.size} of ${JOBS.length} cleared${state.streak > 1 ? ` · ${state.streak} in a row` : ''}`);
  head.append(streak);
  root.append(head);

  const picker = el('div', 'jp-picker');
  for (const j of JOBS) {
    const b = el('button', `jp-chip${j.id === state.jobId ? ' is-on' : ''}${state.cleared.has(j.id) ? ' is-clear' : ''}`);
    b.type = 'button';
    b.append(el('span', 'jp-chip-fam', j.family));
    b.append(el('span', null, j.title));
    b.append(el('span', 'jp-chip-min', `${j.minutes} min`));
    b.addEventListener('click', () => startJob(j.id));
    picker.append(b);
  }
  root.append(picker);

  const card = el('section', 'jp-card');
  card.append(el('h2', null, job.title));
  card.append(el('p', 'jp-brief', job.brief));
  card.append(el('p', 'jp-skill', job.skill));

  const form = el('div', 'jp-form');
  for (const field of FIELDS[job.id] ?? []) {
    const row = el('label', 'jp-field');
    row.append(el('span', 'jp-field-label', `${field.label}  ·  ${field.id}`));
    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      for (const opt of field.options) {
        const o = document.createElement('option'); o.value = opt; o.textContent = opt; input.append(o);
      }
      input.value = currentValue(field) ?? field.options[0];
      input.addEventListener('change', () => { setValue(field, input.value); });
    } else if (field.type === 'bool') {
      input = document.createElement('select');
      for (const [v, t] of [['false', 'no'], ['true', 'yes']]) {
        const o = document.createElement('option'); o.value = v; o.textContent = t; input.append(o);
      }
      input.value = String(Boolean(currentValue(field)));
      input.addEventListener('change', () => { setValue(field, input.value === 'true'); });
    } else {
      input = document.createElement('input');
      input.type = field.type === 'number' ? 'text' : 'text';
      input.inputMode = field.type === 'number' ? 'numeric' : 'text';
      input.placeholder = field.placeholder ?? '';
      const now = currentValue(field);
      input.value = Array.isArray(now) ? now.join(',') : (now ?? '');
      input.addEventListener('input', () => { setValue(field, input.value); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
    }
    input.className = 'jp-input';
    row.append(input);
    form.append(row);
  }
  card.append(form);

  const go = el('button', 'jp-check', 'Check my work');
  go.type = 'button';
  go.addEventListener('click', check);
  card.append(go);

  if (state.graded) {
    const result = el('div', `jp-result is-${state.graded.passed ? 'pass' : 'fail'}`);
    result.setAttribute('role', 'status');
    result.append(el('p', 'jp-result-head', state.graded.passed ? 'Done. That is the configuration.' : 'Not there yet.'));
    const list = el('ul', 'jp-checks');
    for (const c of state.graded.checks) {
      const li = el('li', c.ok ? 'is-ok' : 'is-no');
      li.append(el('span', 'jp-tick', c.ok ? '✓' : '·'));
      li.append(el('span', null, c.label));
      list.append(li);
    }
    result.append(list);
    card.append(result);
  }

  root.append(card);

  const ref = el('details', 'jp-ref');
  ref.append(el('summary', null, 'Look at the rest of the network'));
  const table = el('table', 'jp-table');
  for (const row of REFERENCE(state.run.network)) {
    const tr = document.createElement('tr');
    for (const cell of row) { const td = document.createElement('td'); td.textContent = cell; tr.append(td); }
    table.append(tr);
  }
  ref.append(table);
  ref.append(el('p', 'jp-ref-note', 'Looking things up is the job, not a shortcut around it.'));
  root.append(ref);
}

startJob(state.jobId);
