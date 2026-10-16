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
import { capstonePassed } from '../capstone/capstones.js';
import { renderTopology } from './topology.js';
import { createConsoles } from './console.js';
import { WLC_TEMPLATES } from '../wlc/model.js';
import { JSON_TEMPLATES } from '../json/work.js';
import { SANDBOXES } from '../sandbox/networks.js';
import { sandboxSaved } from '../sandbox/screen.js';
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
const GROUPS = ['Switch builds', 'Router builds', 'Changes', 'Trouble tickets'];
const byGroup = (a, b) => GROUPS.indexOf(groupOf(a.kind)) - GROUPS.indexOf(groupOf(b.kind));

// createDesk({ getRecord, onRecord, onExit, start, onSubmit, examLabel })
// start = { kind, seed, fault?, mode } opens straight onto that order.
// mode 'exam' is a sim inside the mock exam: no clock of its own (the mock
// runs one), no way back, no note, and the grade goes to onSubmit unseen.
export function createDesk({ getRecord, onRecord, onExit, onWlc = null, onSandbox = null, start = null, onSubmit = null, examLabel = 'Simulation' } = {}) {
  const root = el('section', 'desk');
  const ui = { view: 'queue', batch: TEMPLATES.map(t => ({ kind: t.kind, seed: newSeed() })).sort(byGroup), tab: 'order' };
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
    root.append(el('p', 'desk-intro', 'Builds, changes and trouble tickets on switches and routers. Every order is new: other names, other addresses, other ports. Learning ticks as you go; Sim runs against the clock and grades like the exam.'));
    const record = getRecord?.() ?? {};
    // The sandbox first: free practice on prebuilt networks, simplest first.
    if (onSandbox) {
      root.append(el('h2', 'desk-group', 'Sandbox · free practice'));
      const sb = el('div', 'desk-queue');
      for (const n of SANDBOXES) {
        const card = el('article', 'desk-card is-sandbox');
        card.append(el('span', 'sb-level', `LEVEL ${n.level}`), el('h2', null, n.title), el('p', 'desk-card-site', n.blurb));
        const row = el('div', 'desk-card-go');
        row.append(btn('sk-go sk-go-small', sandboxSaved(n.id) ? 'Continue' : 'Open', () => onSandbox(n.id)));
        card.append(row);
        sb.append(card);
      }
      root.append(sb);
    }
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
    // The wireless controller's orders run in its web GUI, not a console.
    for (const [group, list, where] of onWlc ? [['Wireless controller', WLC_TEMPLATES, 'Controller GUI'], ['Automation', JSON_TEMPLATES, 'REST API']] : []) {
      root.append(el('h2', 'desk-group', group));
      const wl = el('div', 'desk-queue');
      for (const t of list) {
        const card = el('article', 'desk-card');
        card.append(el('h2', null, t.title), el('p', 'desk-card-tags', `${where} · ${t.lights.map(b => branchById(b)?.name).filter(Boolean).join(' · ')}`));
        const past = record.desk?.[t.kind];
        if (past) card.append(el('p', 'desk-card-past', `Best ${past.best}%${past.bestSim !== null && past.bestSim !== undefined ? ` · best sim ${past.bestSim}%` : ''} · ${past.runs} run${past.runs === 1 ? '' : 's'}`));
        const row = el('div', 'desk-card-go');
        row.append(btn('sk-go sk-go-small', 'Learning', () => onWlc(t.kind, 'learn')), btn('sk-go sk-go-small ghost', `Sim · ${t.minutes} min`, () => onWlc(t.kind, 'sim')));
        card.append(row);
        wl.append(card);
      }
      root.append(wl);
    }
    root.append(btn('sk-back desk-reroll', 'New batch of orders', () => { ui.batch = TEMPLATES.map(t => ({ kind: t.kind, seed: newSeed() })).sort(byGroup); draw(); }));
  }

  // ---------- an order ----------
  function openOrder(item, mode) {
    const order = makeOrder(item.kind, item.seed, item.fault ? { fault: item.fault } : {});
    const world = buildWorld(order);
    run = {
      item, order, world, mode, baseline: baselineOf(world),
      con: createConsoles(world, order.devices, order.start, { redraw: () => draw() }),
      started: Date.now(), helped: new Set(), open: new Set(), result: null, note: '', submitting: false,
    };
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
    if (mode === 'capstone') {
      top.append(btn('sk-back', 'Back', () => {
        if (run.con.started() && !window.confirm?.('Leave the capstone? Your work on it is lost.')) return;
        run = null; onExit?.();
      }));
    } else if (mode !== 'exam') {
      top.append(btn('sk-back', 'Queue', () => {
        if (run.con.started() && !window.confirm?.('Leave this order? Your work on it is lost.')) return;
        stopTimer(); run = null; ui.view = 'queue'; draw();
      }));
    }
    const title = el('div', 'sk-title');
    title.append(el('span', 'sk-kicker', mode === 'exam' ? examLabel : mode === 'capstone' ? `${order.number} · Capstone` : `${order.number} · ${mode === 'sim' ? 'Sim' : 'Learning'}`), el('h1', null, order.title));
    top.append(title);
    if (mode === 'sim') { tick(); top.append(timerChip); }
    root.append(top);

    const tabs = el('div', 'desk-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const [id, label] of [['order', 'Order'], ['map', 'Map'], ['console', 'Console']]) {
      const t = btn(`desk-tab${ui.tab === id ? ' is-on' : ''}`, label, () => { ui.tab = id; draw(); if (id === 'console') run.con.focus(); });
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

    if (mode === 'capstone') {
      pane.append(el('h3', 'desk-h', 'Goals'));
      const goals = el('ol', 'desk-reqs');
      for (const g of order.goals) goals.append(el('li', 'desk-req', g));
      pane.append(goals);
      pane.append(el('p', 'desk-small', 'No ticks and no help. Build it however you like; when you submit, the network is tested against these goals, and every one has to hold for the crown.'));
      if (!run.submitting) { pane.append(btn('sk-go desk-submit', 'Submit the network', () => { run.submitting = true; draw(); })); return pane; }
      const box = el('div', 'desk-close');
      box.append(el('p', 'desk-small', 'Test the network now?'));
      box.append(btn('sk-go desk-confirm', 'Test it', () => finish()), btn('sk-back', 'Keep working', () => { run.submitting = false; draw(); }));
      pane.append(box);
      return pane;
    }
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
    if (mode !== 'learn') pane.append(el('p', 'desk-small', 'Sim rules: no ticks, no help. Configure only what the order asks for; every extra line costs a point.'));
    if (mode === 'exam') {
      if (!run.submitting) {
        pane.append(btn('sk-go desk-submit', 'Submit and go on', () => { run.submitting = true; draw(); }));
        return pane;
      }
      const box = el('div', 'desk-close');
      box.append(el('p', 'desk-small', 'Submit this simulation? There is no coming back to it.'));
      box.append(btn('sk-go desk-confirm', 'Submit', () => {
        const g = grade(run.order, run.world, run.baseline, { elapsedMs: Date.now() - run.started });
        onSubmit?.(g, run.order);
      }), btn('sk-back', 'Keep working', () => { run.submitting = false; draw(); }));
      pane.append(box);
      return pane;
    }

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
    pane.append(renderTopology(run.world, run.order, { current: run.con.current, onPick: (d) => { run.con.current = d; ui.tab = 'console'; draw(); run.con.focus(); } }));
    const key = el('p', 'desk-legend');
    for (const [cls, text] of [['up', 'up'], ['blk', 'blocking'], ['down', 'down'], ['err', 'err-disabled']]) {
      const k = el('span', `desk-key is-${cls}`);
      k.append(el('i'), el('span', null, text));
      key.append(k);
    }
    pane.append(key, el('p', 'desk-small', 'Tap a device to open its console.'));
    return pane;
  }

  const consolePane = () => run.con.pane();

  // ---------- grading ----------
  function finish() {
    stopTimer();
    const g = grade(run.order, run.world, run.baseline, { elapsedMs: Date.now() - run.started });
    run.result = g;
    run.submitting = false;
    if (run.mode === 'capstone') onRecord?.({ kind: run.order.kind, mode: 'capstone', tree: run.order.tree ?? null, passed: capstonePassed(g), got: g.tests.filter(t => t.ok).length, total: g.tests.length });
    else onRecord?.({ kind: run.order.kind, mode: run.mode, pct: g.pct, helped: run.helped.size > 0, seed: run.item.seed, note: run.note, lights: run.order.lights });
    ui.view = 'result';
    draw();
    window.scrollTo?.(0, 0);
  }

  function drawCapstoneResult() {
    const { order, result: g } = run;
    const top = el('header', 'sk-top');
    top.append(btn('sk-back', 'Back', () => { run = null; onExit?.(); }));
    const title = el('div', 'sk-title');
    title.append(el('span', 'sk-kicker', `${order.number} · tested`), el('h1', null, order.title));
    top.append(title);
    root.append(top);
    const passed = capstonePassed(g);
    const head = el('section', `desk-score cap-score${passed ? ' is-clean' : ''}`);
    head.append(el('b', 'desk-pct', passed ? 'Crowned' : `${g.tests.filter(t => t.ok).length} of ${g.tests.length}`));
    head.append(el('p', null, passed ? 'Every goal holds. The tree is crowned.' : 'Not every goal holds yet. The network stays as you left it: go back in, find why, and test again.'));
    root.append(head);
    const list = el('ul', 'desk-graded');
    for (const t of g.tests) { const li = el('li', t.ok ? 'is-ok' : 'is-miss'); li.append(el('span', 'desk-mark', t.ok ? '✓' : '✗'), el('span', null, t.text)); list.append(li); }
    root.append(list);
    const row = el('div', 'desk-card-go');
    if (!passed) row.append(btn('sk-go', 'Back to the network', () => { run.result = null; run.submitting = false; ui.view = 'order'; draw(); }));
    row.append(btn('sk-back', 'Done', () => { run = null; onExit?.(); }));
    root.append(row);
  }

  function drawResult() {
    if (run.mode === 'capstone') { drawCapstoneResult(); return; }
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
  // The mock exam grades an open sim as it stands when its clock runs out.
  root.examGrade = () => (run ? grade(run.order, run.world, run.baseline, { elapsedMs: Date.now() - run.started }) : null);
  if (start) openOrder({ kind: start.kind, seed: start.seed, fault: start.fault ?? null }, start.mode ?? 'learn');
  else draw();
  return root;
}
