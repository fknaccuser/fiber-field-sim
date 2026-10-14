// A simlet on screen: the questions, the map, and a console per device.
// Same three tabs as the Field desk on a phone; side by side when wide.
//
// createSimletScreen({ kind, seed, mode, label, onDone, onExit })
//   mode 'practice' marks the answers and explains them after Check.
//   mode 'exam' is one item of the mock: answers go to onDone unmarked.

import { simletOf, resolveQuestions } from './simlets.js';
import { buildWorld } from '../desk/grade.js';
import { renderTopology } from '../desk/topology.js';
import { createConsoles } from '../desk/console.js';

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

export function createSimletScreen({ kind, seed, mode = 'practice', label = 'Simlet', onDone, onExit, onAgain } = {}) {
  const root = el('section', 'desk simlet');
  const simlet = simletOf(kind).make(seed);
  const world = buildWorld(simlet);
  // The questions read the network as it was built, before anyone types.
  const questions = resolveQuestions(simlet, world);
  const ui = { tab: 'questions', answers: {}, checked: false, confirming: false };
  const con = createConsoles(world, simlet.devices, simlet.start, { redraw: () => draw(), inputId: 'simlet-cmd' });

  const answered = () => questions.filter(q => ui.answers[q.id] !== undefined).length;
  const score = () => questions.filter(q => q.choices[ui.answers[q.id]]?.correct).length;

  function questionsPane() {
    const pane = el('section', 'desk-pane desk-order simlet-qs');
    pane.append(el('p', 'desk-summary', simlet.scenario));
    if (!ui.checked) pane.append(el('p', 'desk-small', 'Look, don\'t fix: the answers are about the network as you found it. Use the Console tab for show commands.'));
    questions.forEach((q, i) => {
      const box = el('div', 'simlet-q');
      box.dataset.q = q.id;
      box.append(el('p', 'simlet-prompt', `${i + 1}. ${q.prompt}`));
      const list = el('div', 'simlet-choices');
      q.choices.forEach((c, k) => {
        const picked = ui.answers[q.id] === k;
        let cls = `simlet-choice${picked ? ' is-picked' : ''}`;
        if (ui.checked) cls += c.correct ? ' is-right' : picked ? ' is-wrong' : '';
        const b = btn(cls, c.text, () => { if (ui.checked) return; ui.answers[q.id] = k; draw(); });
        b.setAttribute('aria-pressed', String(picked));
        if (ui.checked) b.disabled = true;
        list.append(b);
      });
      box.append(list);
      if (ui.checked) box.append(el('p', 'simlet-explain', q.explain));
      pane.append(box);
    });
    if (ui.checked) {
      const s = score();
      pane.append(el('p', `simlet-score${s === questions.length ? ' is-clean' : ''}`, `${s} of ${questions.length} right`));
      const row = el('div', 'desk-card-go');
      if (onAgain) row.append(btn('sk-go', 'Another simlet', onAgain));
      row.append(btn('sk-back', 'Done', () => onExit?.()));
      pane.append(row);
    } else if (ui.confirming) {
      const box = el('div', 'desk-close');
      box.append(el('p', 'desk-small', mode === 'exam' ? 'Submit these answers? There is no coming back.' : 'Check your answers?'));
      box.append(btn('sk-go desk-confirm', mode === 'exam' ? 'Submit' : 'Check', finish), btn('sk-back', 'Keep looking', () => { ui.confirming = false; draw(); }));
      pane.append(box);
    } else {
      const go = btn('sk-go desk-submit', mode === 'exam' ? `Submit and go on (${answered()}/${questions.length})` : `Check (${answered()}/${questions.length})`, () => { ui.confirming = true; draw(); });
      go.disabled = answered() < questions.length;
      pane.append(go);
    }
    return pane;
  }

  function finish() {
    const result = { kind, seed, right: score(), total: questions.length, domain: simlet.domain, lights: simlet.lights, answers: { ...ui.answers } };
    if (mode === 'exam') { onDone?.(result); return; }
    ui.checked = true;
    ui.confirming = false;
    ui.tab = 'questions';
    onDone?.(result);
    draw();
    window.scrollTo?.(0, 0);
  }

  function mapPane() {
    const pane = el('section', 'desk-pane desk-map');
    pane.append(renderTopology(world, simlet, { current: con.current, onPick: (d) => { con.current = d; ui.tab = 'console'; draw(); con.focus(); } }));
    pane.append(el('p', 'desk-small', 'Tap a device to open its console.'));
    return pane;
  }

  function draw() {
    root.textContent = '';
    const top = el('header', 'sk-top');
    if (mode !== 'exam') top.append(btn('sk-back', 'Back', () => onExit?.()));
    const title = el('div', 'sk-title');
    title.append(el('span', 'sk-kicker', label), el('h1', null, simlet.title));
    top.append(title);
    root.append(top);
    const tabs = el('div', 'desk-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const [id, name] of [['questions', 'Questions'], ['map', 'Map'], ['console', 'Console']]) {
      const t = btn(`desk-tab${ui.tab === id ? ' is-on' : ''}`, name, () => { ui.tab = id; draw(); if (id === 'console') con.focus(); });
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(ui.tab === id));
      t.dataset.tab = id;
      tabs.append(t);
    }
    root.append(tabs);
    const body = el('div', `desk-body is-${ui.tab === 'questions' ? 'order' : ui.tab}`);
    body.append(questionsPane(), mapPane(), con.pane());
    root.append(body);
  }

  draw();
  return root;
}
