// The Field desk: a queue of build work orders, and the desk you work one
// at: the order, the network diagram, and a console per device.
//
// Learning mode ticks each requirement as it lands and offers hints. Sim
// mode is the exam's version: a clock, no ticks, no hints, and a grade on
// submit that names every line of configuration nobody asked for.
//
// On a phone the three panes are tabs (Order, Map, Console); from 1000px
// they sit side by side.

import { TEMPLATES, makeOrder } from './jobs.js';
import { buildWorld, baselineOf, grade, requirementStates } from './grade.js';
import { renderTopology } from './topology.js';
import { createSession, execute, prompt, complete } from '../labs/ios.js';
import { branchById } from '../tree/ccna.js';

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

const newSeed = () => Math.floor(Math.random() * 1e9) + 1;
const clock = (ms) => {
  const t = Math.max(0, Math.round(Math.abs(ms) / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const NOTE_MIN = 12;
const SWITCH_BUILDS = ['build-access', 'build-ssh', 'build-vlans', 'build-uplink', 'build-bundle', 'build-edge'];
const groupOf = (kind) => (kind.startsWith('repair') ? 'Trouble tickets' : kind.startsWith('change') ? 'Changes' : SWITCH_BUILDS.includes(kind) ? 'Switch builds' : 'Router builds');

// createDesk({ getRecord, onRecord, onExit, start })
// start = { kind, seed, fault?, mode } opens straight onto that order.
export function createDesk({ getRecord, onRecord, onExit, start = null } = {}) {
  const root = el('section', 'desk');
  const ui = { view: 'queue', batch: TEMPLATES.map(t => ({ kind: t.kind, seed: newSeed() })), tab: 'order' };
  let run = null;
  let timer = null;

  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

  // ---------- the queue ----------
  function drawQueue() {
    const top = el('header', 'sk-top');
    top.append(btn('sk-back', 'Map', () => { stopTimer(); onExit?.(); }));
    const title = el('div', 'sk-title');
    title.append(el('span', 'sk-kicker', 'The Field'), el('h1', null, 'Work orders'));
    top.append(title);
    root.append(top);
    root.append(el('p', 'desk-intro', 'Build jobs on switches fresh from the box. Every order is new: other names, other VLANs, other ports. Learning ticks as you go; Sim runs against the clock and grades like the exam.'));
    const record = getRecord?.() ?? {};
    let list = null;
    let group = null;
    for (const item of ui.batch) {
      const g = groupOf(item.kind);
      if (g !== group) {
        group = g;
        root.append(el('h2', 'desk-group', g));
        list = el('div', 'desk-queue');
        root.append(list);
      }
      const order = makeOrder(item.kind, item.seed);
      const card = el('article', 'desk-card');
      const head = el('div', 'desk-card-head');
      head.append(el('span', 'desk-num', order.number), el('span', `desk-pri is-${order.priority.toLowerCase()}`, order.priority));
      card.append(head, el('h2', null, order.title), el('p', 'desk-card-site', `${order.site} · ${order.requester}`));
      const tags = el('p', 'desk-card-tags', item.kind.startsWith('repair') ? 'Fault unknown until you look' : order.lights.map(b => branchById(b)?.name).filter(Boolean).join(' · '));
      card.append(tags);
      const past = record.desk?.[item.kind];
      if (past) card.append(el('p', 'desk-card-past', `Best ${past.best}%${past.bestSim !== null && past.bestSim !== undefined ? ` · best sim ${past.bestSim}%` : ''} · ${past.runs} run${past.runs === 1 ? '' : 's'}`));
      const row = el('div', 'desk-card-go');
      row.append(btn('sk-go sk-go-small', 'Learning', () => openOrder(item, 'learn')), btn('sk-go sk-go-small ghost', `Sim · ${order.minutes} min`, () => openOrder(item, 'sim')));
      card.append(row);
      list.append(card);
    }
    root.append(btn('sk-back desk-reroll', 'New batch of orders', () => { ui.batch = TEMPLATES.map(t => ({ kind: t.kind, seed: newSeed() })); draw(); }));
  }

  // ---------- an order ----------
  function openOrder(item, mode) {
    const order = makeOrder(item.kind, item.seed, item.fault ? { fault: item.fault } : {});
    const world = buildWorld(order);
    run = {
      item, order, world, mode, baseline: baselineOf(world),
      sessions: Object.fromEntries(order.devices.map(d => [d.id, createSession(world, d.id)])),
      logs: {}, hist: {}, current: order.start, started: Date.now(), helped: new Set(), open: new Set(), result: null, note: '', submitting: false,
    };
    for (const d of order.devices) {
      const dev = world.devices[d.id];
      run.logs[d.id] = dev.kind === 'pc' ? `Command Prompt on ${d.id}\nType ipconfig, ping or tracert.\n\n` : `\n${dev.config.hostname} con0 is now available\n\nPress RETURN to get started.\n\n`;
      run.hist[d.id] = { list: [], at: 0 };
    }
    ui.view = 'order';
    ui.tab = 'order';
    stopTimer();
    if (mode === 'sim') timer = setInterval(tick, 1000);
    draw();
    window.scrollTo?.(0, 0);
  }

  const timerChip = el('span', 'desk-timer');
  function tick() {
    if (!run || run.result) return;
    const left = run.order.minutes * 60000 - (Date.now() - run.started);
    timerChip.textContent = left >= 0 ? clock(left) : `+${clock(left)}`;
    timerChip.classList.toggle('is-over', left < 0);
    timerChip.classList.toggle('is-low', left >= 0 && left < 120000);
  }

  function drawOrder() {
    const { order, mode } = run;
    const top = el('header', 'sk-top');
    top.append(btn('sk-back', 'Queue', () => {
      const started = Object.values(run.sessions).some(s => s.history.length);
      if (started && !window.confirm?.('Leave this order? Your work on it is lost.')) return;
      stopTimer(); run = null; ui.view = 'queue'; draw();
    }));
    const title = el('div', 'sk-title');
    title.append(el('span', 'sk-kicker', `${order.number} · ${mode === 'sim' ? 'Sim' : 'Learning'}`), el('h1', null, order.title));
    top.append(title);
    if (mode === 'sim') { tick(); top.append(timerChip); }
    root.append(top);

    const tabs = el('div', 'desk-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const [id, label] of [['order', 'Order'], ['map', 'Map'], ['console', 'Console']]) {
      const t = btn(`desk-tab${ui.tab === id ? ' is-on' : ''}`, label, () => { ui.tab = id; draw(); if (id === 'console') focusInput(); });
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(ui.tab === id));
      t.dataset.tab = id;
      tabs.append(t);
    }
    root.append(tabs);

    const body = el('div', `desk-body is-${ui.tab}`);
    body.append(orderPane(), mapPane(), consolePane());
    root.append(body);
  }

  function orderPane() {
    const { order, mode, world } = run;
    const pane = el('section', 'desk-pane desk-order');
    const meta = el('div', 'desk-meta');
    meta.append(el('span', `desk-pri is-${order.priority.toLowerCase()}`, order.priority), el('span', null, order.site), el('span', null, `From: ${order.requester}`));
    pane.append(meta, el('p', 'desk-summary', order.summary));
    const notes = el('ul', 'desk-notes');
    for (const n of order.notes ?? []) notes.append(el('li', null, n));
    pane.append(notes);

    pane.append(el('h3', 'desk-h', 'Requirements'));
    const states = mode === 'learn' ? requirementStates(order, world) : null;
    const list = el('ol', 'desk-reqs');
    order.requirements.forEach((r, i) => {
      const done = states?.[i].ok;
      const li = el('li', `desk-req${done ? ' is-done' : ''}`);
      li.dataset.req = r.id;
      if (mode === 'learn') { const m = el('span', 'lab-check'); m.setAttribute('aria-hidden', 'true'); li.append(m); }
      const txt = el('div', 'desk-req-text');
      txt.append(el('span', null, r.text));
      if (mode === 'learn' && !done) {
        const open = run.open.has(r.id);
        txt.append(btn('desk-hint-btn', open ? 'Hide help' : 'Help', () => { if (open) run.open.delete(r.id); else { run.open.add(r.id); run.helped.add(r.id); } draw(); }));
        if (open) {
          txt.append(el('p', 'lab-hint', r.hint));
          const show = Object.entries(r.show).map(([d, lines]) => `${d}:\n${lines.map(l => `  ${l || '(Enter)'}`).join('\n')}`).join('\n');
          txt.append(el('pre', 'lab-show', show));
        }
      }
      li.append(txt);
      list.append(li);
    });
    pane.append(list);

    pane.append(el('h3', 'desk-h', 'Acceptance tests'));
    const tests = el('ul', 'desk-tests');
    for (const t of order.tests) tests.append(el('li', null, t.text));
    pane.append(tests);
    if (mode === 'sim') pane.append(el('p', 'desk-small', 'Sim rules: no ticks, no help. Configure only what the order asks for; every extra line costs a point.'));

    // Submitting asks for the closing note first: what you did, how you know.
    if (run.submitting) {
      const f = el('form', 'desk-close');
      const label = el('label', 'desk-h', 'Resolution note');
      const ta = el('textarea', 'desk-note');
      ta.id = 'desk-note';
      label.htmlFor = ta.id;
      ta.placeholder = 'What you changed, and how you checked it. One or two lines, the way you would close a ticket.';
      ta.value = run.note;
      ta.rows = 3;
      ta.addEventListener('input', () => { run.note = ta.value; go.disabled = ta.value.trim().length < NOTE_MIN; });
      const go = btn('sk-go', 'Grade it');
      go.type = 'submit';
      go.disabled = run.note.trim().length < NOTE_MIN;
      f.append(label, ta, go, btn('sk-back', 'Keep working', () => { run.submitting = false; draw(); }));
      f.addEventListener('submit', (e) => { e.preventDefault(); if (run.note.trim().length >= NOTE_MIN) finish(); });
      pane.append(f);
    } else {
      pane.append(btn('sk-go desk-submit', mode === 'sim' ? 'Submit for grading' : 'Finish and grade', () => { run.submitting = true; ui.tab = 'order'; draw(); }));
    }
    return pane;
  }

  function mapPane() {
    const pane = el('section', 'desk-pane desk-map');
    pane.append(renderTopology(run.world, run.order, { current: run.current, onPick: (d) => { run.current = d; ui.tab = 'console'; draw(); focusInput(); } }));
    const key = el('p', 'desk-legend');
    for (const [cls, text] of [['up', 'up'], ['blk', 'blocking'], ['down', 'down'], ['err', 'err-disabled']]) {
      const k = el('span', `desk-key is-${cls}`);
      k.append(el('i'), el('span', null, text));
      key.append(k);
    }
    pane.append(key, el('p', 'desk-small', 'Tap a device to open its console.'));
    return pane;
  }

  let inputEl = null;
  function focusInput() { requestAnimationFrame(() => inputEl?.focus({ preventScroll: true })); }

  function consolePane() {
    const pane = el('section', 'desk-pane desk-console lab-console');
    const tabs = el('div', 'lab-tabs');
    for (const d of run.order.devices) {
      const host = run.world.devices[d.id].config.hostname;
      const name = d.kind === 'pc' || ['Switch', 'Router'].includes(host) ? d.id : host;
      const t = btn(`lab-tab${d.id === run.current ? ' is-on' : ''}`, name, () => { run.current = d.id; draw(); focusInput(); });
      t.dataset.device = d.id;
      tabs.append(t);
    }
    const screen = el('pre', 'lab-screen');
    screen.setAttribute('aria-live', 'polite');
    screen.textContent = run.logs[run.current];
    const form = el('form', 'lab-input');
    const s = run.sessions[run.current];
    const label = el('label', 'lab-prompt', prompt(s));
    const input = el('input', 'lab-command');
    Object.assign(input, { type: s.pending?.secret ? 'password' : 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
    input.setAttribute('enterkeyhint', 'send');
    input.setAttribute('aria-label', 'Command');
    input.id = 'desk-cmd';
    label.htmlFor = input.id;
    form.append(label, input);
    const keys = el('div', 'lab-keys');
    for (const [lbl, act] of [['Tab', 'tab'], ['?', 'help'], ['↑', 'up'], ['↓', 'down'], ['end', 'end']]) keys.append(btn('lab-key', lbl, () => key(act, input)));
    form.addEventListener('submit', (e) => { e.preventDefault(); const line = input.value; input.value = ''; send(line); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); key('tab', input); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); key('up', input); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); key('down', input); }
      else if (e.key === '?') { e.preventDefault(); key('help', input); }
      else if (e.key === 'z' && e.ctrlKey) { e.preventDefault(); key('end', input); }
    });
    screen.addEventListener('click', () => { if (!window.getSelection?.()?.toString()) input.focus({ preventScroll: true }); });
    inputEl = input;
    pane.append(tabs, screen, form, keys);
    requestAnimationFrame(() => { screen.scrollTop = screen.scrollHeight; screen.scrollLeft = 0; });
    return pane;
  }

  function send(line) {
    const s = run.sessions[run.current];
    const p = prompt(s);
    const secret = Boolean(s.pending?.secret);
    const out = execute(s, line);
    run.logs[run.current] += `${p}${secret ? '' : line}\n${out ? `${out}\n` : ''}`;
    const lines = run.logs[run.current].split('\n');
    if (lines.length > 600) run.logs[run.current] = lines.slice(-600).join('\n');
    if (line.trim() && !/\?$/.test(line) && !secret) { const h = run.hist[run.current]; h.list.push(line); h.at = h.list.length; }
    draw();
    focusInput();
  }

  function key(act, input) {
    const h = run.hist[run.current];
    const s = run.sessions[run.current];
    if (act === 'tab') input.value = complete(s, input.value);
    else if (act === 'help') { run.logs[run.current] += `${prompt(s)}${input.value}?\n${execute(s, `${input.value}?`)}\n`; const v = input.value; draw(); inputEl.value = v; }
    else if (act === 'up') { if (h.at > 0) { h.at -= 1; input.value = h.list[h.at]; } }
    else if (act === 'down') { if (h.at < h.list.length) { h.at += 1; input.value = h.list[h.at] ?? ''; } }
    else if (act === 'end') { send('end'); return; }
    focusInput();
  }

  // ---------- grading ----------
  function finish() {
    stopTimer();
    const g = grade(run.order, run.world, run.baseline, { elapsedMs: Date.now() - run.started });
    run.result = g;
    run.submitting = false;
    onRecord?.({ kind: run.order.kind, mode: run.mode, pct: g.pct, helped: run.helped.size > 0, seed: run.item.seed, note: run.note, lights: run.order.lights });
    ui.view = 'result';
    draw();
    window.scrollTo?.(0, 0);
  }

  function drawResult() {
    const { order, result: g, mode } = run;
    const top = el('header', 'sk-top');
    top.append(btn('sk-back', 'Queue', () => { run = null; ui.view = 'queue'; draw(); }));
    const title = el('div', 'sk-title');
    title.append(el('span', 'sk-kicker', `${order.number} · graded`), el('h1', null, order.title));
    top.append(title);
    root.append(top);

    const head = el('section', `desk-score${g.pct === 100 ? ' is-clean' : g.pct >= 80 ? ' is-pass' : ''}`);
    head.append(el('b', 'desk-pct', `${g.pct}%`));
    const what = [`${g.got} of ${g.total} points`];
    if (g.extras.length) what.push(`minus ${g.extras.length} for extra config`);
    what.push(`${clock(g.elapsedMs)}${mode === 'sim' ? ` of ${order.minutes}:00${g.over ? ', over time' : ''}` : ''}`);
    if (run.helped.size) what.push(`help used on ${run.helped.size}`);
    head.append(el('p', null, what.join(' · ')));
    root.append(head);

    root.append(el('h3', 'desk-h', 'Requirements'));
    const reqs = el('ul', 'desk-graded');
    for (const r of g.reqs) {
      const li = el('li', r.ok ? 'is-ok' : 'is-miss');
      li.append(el('span', 'desk-mark', r.ok ? '✓' : '✗'), el('span', null, r.text));
      if (!r.ok) {
        const why = el('div', 'desk-why');
        why.append(el('p', 'lab-hint', r.hint));
        why.append(el('pre', 'lab-show', Object.entries(r.show).map(([d, lines]) => `${d}:\n${lines.map(l => `  ${l || '(Enter)'}`).join('\n')}`).join('\n')));
        li.append(why);
      }
      reqs.append(li);
    }
    root.append(reqs);

    root.append(el('h3', 'desk-h', 'Acceptance tests'));
    const tests = el('ul', 'desk-graded');
    for (const t of g.tests) { const li = el('li', t.ok ? 'is-ok' : 'is-miss'); li.append(el('span', 'desk-mark', t.ok ? '✓' : '✗'), el('span', null, t.text)); tests.append(li); }
    root.append(tests);

    if (g.extras.length) {
      root.append(el('h3', 'desk-h', 'Extra configuration, minus 1 each'));
      root.append(el('p', 'desk-small', 'Nothing in the order asked for these. On the exam, extra lines can break the grader\'s checks.'));
      const ex = el('ul', 'desk-graded');
      for (const x of g.extras) { const li = el('li', 'is-miss'); li.append(el('span', 'desk-mark', '−1'), el('code', null, `${x.device}: ${x.text}`)); ex.append(li); }
      root.append(ex);
    }

    root.append(el('h3', 'desk-h', 'Your note'));
    root.append(el('blockquote', 'desk-quote', run.note));

    const row = el('div', 'desk-card-go');
    row.append(
      btn('sk-go', 'Same order again', () => openOrder(run.item, mode)),
      btn('sk-go ghost', 'New order like it', () => { const item = { kind: run.item.kind, seed: newSeed() }; ui.batch = ui.batch.map(b => (b.kind === item.kind ? item : b)); openOrder(item, mode); }),
      btn('sk-back', 'Queue', () => { run = null; ui.view = 'queue'; draw(); }),
    );
    root.append(row);
  }

  function draw() {
    root.textContent = '';
    root.className = `desk is-${ui.view}`;
    if (ui.view === 'order' && run) drawOrder();
    else if (ui.view === 'result' && run) drawResult();
    else { ui.view = 'queue'; drawQueue(); }
  }

  root.destroy = stopTimer;
  if (start) openOrder({ kind: start.kind, seed: start.seed, fault: start.fault ?? null }, start.mode ?? 'learn');
  else draw();
  return root;
}
