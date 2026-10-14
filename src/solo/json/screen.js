// The API work order: the order on one tab, the API workspace on the other.
// The workspace shows the GET response, an editor for the POST body with the
// example beside it, and the broken PUT payload to repair. Each editor says
// at once whether its text parses, and where it stops if not.

import { jsonTemplateOf, parseJson, gradeJson } from './work.js';

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

export function createJsonScreen({ kind, seed, mode = 'learn', onRecord, onExit } = {}) {
  const root = el('section', 'desk jsonw');
  const order = jsonTemplateOf(kind).make(seed);
  const answers = { down: '', count: '', body: '', fix: order.broken };
  const ui = { tab: 'order', open: new Set(), helped: new Set(), result: null, started: Date.now() };
  let timer = null;
  const chip = el('span', 'desk-timer');
  const tick = () => {
    const left = order.minutes * 60000 - (Date.now() - ui.started);
    chip.textContent = left >= 0 ? clock(left) : `+${clock(left)}`;
    chip.classList.toggle('is-over', left < 0);
  };
  if (mode === 'sim') timer = setInterval(tick, 1000);
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

  function orderPane() {
    const pane = el('section', 'desk-pane desk-order');
    const meta = el('div', 'desk-meta');
    meta.append(el('span', `desk-pri is-${order.priority.toLowerCase()}`, order.priority), el('span', null, order.site), el('span', null, `From: ${order.requester}`));
    pane.append(meta, el('p', 'desk-summary', order.summary));
    const notes = el('ul', 'desk-notes');
    for (const n of order.notes) notes.append(el('li', null, n));
    pane.append(notes, el('h3', 'desk-h', 'Requirements'));
    const list = el('ol', 'desk-reqs');
    const states = mode === 'learn' ? gradeJson(order, answers).reqs : null;
    order.requirements.forEach((r, i) => {
      const done = states?.[i].ok;
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
    });
    pane.append(list);
    pane.append(btn('sk-go desk-submit', mode === 'sim' ? 'Submit for grading' : 'Finish and grade', finish));
    return pane;
  }

  function status(text) {
    const p = parseJson(text);
    return p.ok ? el('p', 'jw-ok', 'Valid JSON') : el('p', 'jw-bad', text.trim() ? `Does not parse: ${p.error}` : 'Empty');
  }

  function editor(field, placeholder) {
    const box = el('div', 'jw-editor');
    const ta = el('textarea', 'jw-text');
    Object.assign(ta, { value: answers[field], spellcheck: false, placeholder, rows: 8 });
    ta.setAttribute('autocapitalize', 'off');
    ta.setAttribute('autocomplete', 'off');
    ta.dataset.field = field;
    const st = el('div', 'jw-status');
    st.append(status(answers[field]));
    ta.addEventListener('input', () => {
      answers[field] = ta.value;
      st.textContent = '';
      st.append(status(ta.value));
      if (mode === 'learn') refreshTicks();
    });
    box.append(ta, st);
    return box;
  }

  // Ticks update without a full redraw, so typing keeps its place.
  function refreshTicks() {
    const states = gradeJson(order, answers).reqs;
    for (const r of states) root.querySelector(`.desk-req[data-req="${r.id}"]`)?.classList.toggle('is-done', r.ok);
  }

  function workPane() {
    const pane = el('section', 'desk-pane jw-pane');
    pane.append(el('p', 'jw-req', `GET /api/v1/devices/${order.device}/interfaces`), el('p', 'jw-code', '200 OK · application/json'));
    pane.append(el('pre', 'jw-pre', JSON.stringify(order.response, null, 2)));
    const q = el('div', 'jw-answers');
    for (const [field, label] of [['down', 'Which interfaces are down?'], ['count', `How many are in VLAN ${order.askVlan}?`]]) {
      const id = `jw-${field}`;
      const l = el('label', null, label);
      l.htmlFor = id;
      const i = el('input', 'jw-input');
      Object.assign(i, { id, value: answers[field], autocomplete: 'off', spellcheck: false });
      i.setAttribute('autocapitalize', 'off');
      i.addEventListener('input', () => { answers[field] = i.value; if (mode === 'learn') refreshTicks(); });
      q.append(l, i);
    }
    pane.append(q);
    pane.append(el('p', 'jw-req', `POST /api/v1/devices/${order.device}/vlans`));
    pane.append(el('p', 'desk-small', 'Example body for VLAN 10:'));
    pane.append(el('pre', 'jw-pre is-example', JSON.stringify(order.example, null, 2)));
    pane.append(editor('body', 'Your body here'));
    pane.append(el('p', 'jw-req', `PUT /api/v1/devices/${order.device}/interfaces`));
    pane.append(el('p', 'desk-small', 'Started by hand and rejected with 400 Bad Request. Repair it:'));
    pane.append(editor('fix', ''));
    return pane;
  }

  function finish() {
    stop();
    const g = gradeJson(order, answers);
    ui.result = g;
    onRecord?.({ kind, mode, pct: g.pct, helped: ui.helped.size > 0, seed, lights: order.lights });
    draw();
    window.scrollTo?.(0, 0);
  }

  function drawResult() {
    const g = ui.result;
    const head = el('section', `desk-score${g.pct === 100 ? ' is-clean' : g.pct >= 80 ? ' is-pass' : ''}`);
    head.append(el('b', 'desk-pct', `${g.pct}%`), el('p', null, `${g.got} of ${g.total} requirements${ui.helped.size ? ` · help used on ${ui.helped.size}` : ''}`));
    root.append(head);
    const list = el('ul', 'desk-graded');
    for (const r of g.reqs) {
      const li = el('li', r.ok ? 'is-ok' : 'is-miss');
      li.append(el('span', 'desk-mark', r.ok ? '✓' : '✗'), el('span', null, r.text));
      if (!r.ok) {
        const why = el('div', 'desk-why');
        why.append(el('p', 'lab-hint', r.hint));
        const sol = order.solution[r.id === 'down' ? 'down' : r.id === 'count' ? 'count' : r.id];
        why.append(el('pre', 'lab-show', sol));
        li.append(why);
      }
      list.append(li);
    }
    root.append(list);
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
    for (const [id, label] of [['order', 'Order'], ['work', 'API']]) {
      const t = btn(`desk-tab${ui.tab === id ? ' is-on' : ''}`, label, () => { ui.tab = id; draw(); });
      t.dataset.tab = id;
      tabs.append(t);
    }
    root.append(tabs);
    const body = el('div', `desk-body wlc-split jw-split is-${ui.tab}`);
    body.append(orderPane(), workPane());
    root.append(body);
  }

  root.destroy = stop;
  draw();
  return root;
}
