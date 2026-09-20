// Preview-only screen. Domains, filtering, weighted sampling, grading and
// presentation order all come from the repo's study/bank.js.

import {
  DOMAINS, filter, sampleExam, coverage, presentation,
  isCorrect, expectedSelections, quotas,
} from '../src/solo/study/bank.js';
import { CCNA_BANK } from '../src/solo/study/questions.js';

const root = document.getElementById('root');
const state = {
  screen: 'home',
  blueprint: 'v1',
  domains: new Set(DOMAINS.map(d => d.id)),
  deck: [],
  at: 0,
  pick: [],
  shown: null,
  graded: null,
  right: 0,
  exam: false,
};

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const button = (cls, text, onClick) => {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

function startQuiz() {
  const pool = filter(CCNA_BANK, { domains: [...state.domains], blueprint: state.blueprint });
  const order = presentation({ choices: pool }, Math.random).choiceOrder;
  state.deck = order.map(i => pool[i]);
  state.exam = false;
  begin();
}

function startExam() {
  const { questions, shortfalls } = sampleExam(CCNA_BANK, { count: 50, blueprint: state.blueprint });
  state.deck = questions;
  state.exam = true;
  state.shortfalls = shortfalls;
  begin();
}

function begin() {
  state.at = 0;
  state.right = 0;
  state.screen = 'quiz';
  load();
}

function load() {
  const q = state.deck[state.at];
  state.pick = [];
  state.graded = null;
  state.shown = q ? presentation(q, Math.random) : null;
  render();
}

function submit() {
  const q = state.deck[state.at];
  const answer = q.format === 'single' ? state.pick[0] : state.pick;
  const correct = isCorrect(q, answer);
  if (correct) state.right += 1;
  state.graded = { correct, answer };
  render();
}

function advance() {
  if (state.at + 1 >= state.deck.length) { state.screen = 'done'; render(); return; }
  state.at += 1;
  load();
}

function renderHome() {
  root.append(el('h1', null, 'Study'));
  root.append(el('p', 'sub', `${CCNA_BANK.length} CCNA questions. Mock exams are drawn to Cisco's domain weights.`));

  const bp = el('div', 'seg');
  for (const [id, label, hint] of [['v1', 'V1.1', 'live today'], ['v2', 'V2.0', 'Feb 2027'], ['both', 'Both', 'everything']]) {
    const b = button(`seg-b${state.blueprint === id ? ' on' : ''}`, '', () => { state.blueprint = id; render(); });
    b.append(el('span', 'seg-name', label));
    b.append(el('span', 'seg-hint', hint));
    bp.append(b);
  }
  root.append(el('p', 'label', 'Blueprint'));
  root.append(bp);

  root.append(el('p', 'label', 'Domains'));
  const rows = coverage(CCNA_BANK, { blueprint: state.blueprint });
  const list = el('div', 'domains');
  for (const row of rows) {
    const on = state.domains.has(row.domain);
    const b = button(`dom${on ? ' on' : ''}`, '', () => {
      if (on) state.domains.delete(row.domain); else state.domains.add(row.domain);
      render();
    });
    b.append(el('span', 'dom-name', row.label));
    b.append(el('span', 'dom-meta', `${row.weight}% · ${row.have} questions`));
    list.append(b);
  }
  root.append(list);

  const pool = filter(CCNA_BANK, { domains: [...state.domains], blueprint: state.blueprint });
  const actions = el('div', 'actions');
  const quiz = button('go', `Quiz ${pool.length} questions`, startQuiz);
  if (!pool.length) quiz.disabled = true;
  actions.append(quiz);
  actions.append(button('go ghost', 'Mock exam, 50 weighted', startExam));
  root.append(actions);

  const q = quotas(50);
  root.append(el('p', 'foot', `A mock draws ${q.map(x => `${x.domain} ${x.want}`).join(', ')}.`));
}

function renderQuestion() {
  const q = state.deck[state.at];
  root.append(el('p', 'crumbs', `${state.exam ? 'Mock exam' : 'Quiz'} · ${state.at + 1} of ${state.deck.length} · ${q.domain}${q.v2 === 'v2only' ? ' · v2.0 only' : ''}`));

  const card = el('section', 'card');
  if (q.scenario) card.append(el('p', 'scenario', q.scenario));
  card.append(el('p', 'prompt', q.prompt));

  if (q.format === 'match') renderMatch(card, q);
  else if (q.format === 'order') renderOrder(card, q);
  else renderChoices(card, q);

  if (!state.graded) {
    const need = expectedSelections(q);
    const ready = q.format === 'match' || q.format === 'order'
      ? state.pick.length === (q.pairs ?? q.steps).length
      : state.pick.length === need;
    const go = button('go', need && need > 1 ? `Check (${state.pick.length}/${need})` : 'Check', submit);
    if (!ready) go.disabled = true;
    card.append(go);
  } else {
    const fb = el('div', `fb ${state.graded.correct ? 'ok' : 'no'}`);
    fb.setAttribute('role', 'status');
    fb.append(el('p', 'verdict', state.graded.correct ? 'Correct' : 'Not quite'));
    fb.append(el('p', 'explain', q.explain));
    card.append(fb);
    card.append(button('go', state.at + 1 >= state.deck.length ? 'Finish' : 'Next', advance));
  }
  root.append(card);
  root.append(button('quit', 'Back to study', () => { state.screen = 'home'; render(); }));
}

function renderChoices(card, q) {
  const wrap = el('div', 'choices');
  for (const i of state.shown.choiceOrder) {
    const choice = q.choices[i];
    const picked = state.pick.includes(i);
    let cls = `choice${picked ? ' picked' : ''}`;
    if (state.graded) {
      if (choice.correct) cls += ' right';
      else if (picked) cls += ' wrong';
    }
    const b = button(cls, '', () => {
      if (state.graded) return;
      if (q.format === 'single') state.pick = [i];
      else if (picked) state.pick = state.pick.filter(x => x !== i);
      else state.pick = [...state.pick, i];
      render();
    });
    b.append(el('span', 'choice-text', choice.text));
    if (state.graded) b.append(el('span', 'choice-why', choice.why));
    wrap.append(b);
  }
  card.append(wrap);
}

function renderMatch(card, q) {
  const wrap = el('div', 'pairs');
  for (let leftIndex = 0; leftIndex < q.pairs.length; leftIndex += 1) {
    const row = el('label', 'pair');
    row.append(el('span', 'pair-left', q.pairs[leftIndex].left));
    const select = document.createElement('select');
    select.className = 'pair-select';
    select.setAttribute('aria-label', q.pairs[leftIndex].left);
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'choose…';
    select.append(blank);
    for (const rightIndex of state.shown.rightOrder) {
      const o = document.createElement('option');
      o.value = String(rightIndex);
      o.textContent = q.pairs[rightIndex].right;
      select.append(o);
    }
    select.value = state.pick[leftIndex] === undefined ? '' : String(state.pick[leftIndex]);
    select.disabled = Boolean(state.graded);
    select.addEventListener('change', () => {
      const next = [...state.pick];
      next[leftIndex] = select.value === '' ? undefined : Number(select.value);
      state.pick = next;
      render();
    });
    if (state.graded) row.classList.add(state.pick[leftIndex] === leftIndex ? 'right' : 'wrong');
    row.append(select);
    wrap.append(row);
  }
  card.append(wrap);
}

function renderOrder(card, q) {
  const wrap = el('div', 'steps');
  const remaining = state.shown.shownOrder.filter(i => !state.pick.includes(i));
  state.pick.forEach((i, position) => {
    const row = el('div', `step chosen${state.graded ? (state.pick[position] === position ? ' right' : ' wrong') : ''}`);
    row.append(el('span', 'step-n', String(position + 1)));
    row.append(el('span', null, q.steps[i]));
    if (!state.graded) {
      row.append(button('step-undo', 'remove', () => { state.pick = state.pick.filter(x => x !== i); render(); }));
    }
    wrap.append(row);
  });
  if (!state.graded) {
    for (const i of remaining) {
      wrap.append(button('step', q.steps[i], () => { state.pick = [...state.pick, i]; render(); }));
    }
  }
  card.append(wrap);
}

function renderDone() {
  const pct = Math.round((100 * state.right) / state.deck.length);
  root.append(el('h1', null, `${state.right} of ${state.deck.length}`));
  root.append(el('p', 'sub', `${pct}% ${state.exam ? 'on a weighted mock' : 'on this quiz'}. Cisco does not publish a pass mark; somewhere around 80 percent is the usual working target.`));
  if (state.exam && state.shortfalls?.length) {
    root.append(el('p', 'warn', `Short on ${state.shortfalls.map(s => `${s.domain} (${s.have} of ${s.want})`).join(', ')}, so this mock was under-weighted there.`));
  }
  root.append(button('go', 'Back to study', () => { state.screen = 'home'; render(); }));
}

function render() {
  root.innerHTML = '';
  if (state.screen === 'home') renderHome();
  else if (state.screen === 'done') renderDone();
  else renderQuestion();
  window.scrollTo(0, 0);
}

render();
