// Preview-only screen. Domains, filtering, weighted sampling, grading and
// presentation order all come from the repo's study/bank.js.

import {
  DOMAINS, filter, sampleExam, coverage, presentation,
  isCorrect, expectedSelections, quotas,
} from '../src/solo/study/bank.js';
import { CCNA_BANK } from '../src/solo/study/questions.js';
import { review, dueCards, summarise, checkTyped, nextDue } from '../src/solo/study/recall.js';
import { RECALL_DECK } from '../src/solo/study/recall-deck.js';

// Schedules persist per deck in the preview so the spacing is visible across
// visits. Storage can be unavailable, in which case it simply resets.
const load_ = (key) => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } };
const save_ = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage off */ } };
const CARDS_KEY = 'fieldsim:cards';
const TYPE_KEY = 'fieldsim:typeit';
const recall = { cards: load_(CARDS_KEY), typeit: load_(TYPE_KEY) };
const CARD_IDS = CCNA_BANK.filter(q => q.format === 'single').map(q => q.id);
const TYPE_IDS = RECALL_DECK.map(c => c.id);


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

  const now = Date.now();
  const cardDue = dueCards(CARD_IDS, recall.cards, now).length;
  const typeDue = dueCards(TYPE_IDS, recall.typeit, now).length;
  root.append(el('p', 'label spaced', 'Spaced recall'));
  const spaced = el('div', 'actions');
  spaced.append(button('go ghost', `Flashcards · ${cardDue} due`, () => startRecall('cards')));
  spaced.append(button('go ghost', `Type-it · ${typeDue} due`, () => startRecall('typeit')));
  root.append(spaced);

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

function startRecall(kind) {
  const ids = kind === 'cards' ? CARD_IDS : TYPE_IDS;
  state.recallKind = kind;
  state.recallQueue = dueCards(ids, recall[kind], Date.now()).slice(0, 20);
  state.recallAt = 0;
  state.recallRight = 0;
  state.flipped = false;
  state.typed = null;
  state.screen = 'recall';
  render();
}

function recallCurrent() {
  const id = state.recallQueue[state.recallAt];
  return state.recallKind === 'cards' ? CCNA_BANK.find(q => q.id === id) : RECALL_DECK.find(c => c.id === id);
}

function mark(correct) {
  const id = state.recallQueue[state.recallAt];
  const kind = state.recallKind;
  recall[kind] = { ...recall[kind], [id]: review(recall[kind][id], correct, Date.now()) };
  save_(kind === 'cards' ? CARDS_KEY : TYPE_KEY, recall[kind]);
  if (correct) state.recallRight += 1;
  state.recallAt += 1;
  state.flipped = false;
  state.typed = null;
  render();
}

function renderRecall() {
  const kind = state.recallKind;
  const ids = kind === 'cards' ? CARD_IDS : TYPE_IDS;
  if (state.recallAt >= state.recallQueue.length) {
    const s = summarise(ids, recall[kind]);
    const upcoming = nextDue(ids, recall[kind], Date.now());
    root.append(el('h1', null, state.recallQueue.length ? `${state.recallRight} of ${state.recallQueue.length}` : 'Nothing due'));
    root.append(el('p', 'sub', state.recallQueue.length
      ? 'Right answers move up a box and come back later. Misses come back this session.'
      : 'Everything is scheduled for later. That is the system working rather than a gap.'));
    const boxes = el('div', 'boxes');
    for (const [box, count] of Object.entries(s.boxes)) {
      const b = el('div', 'box');
      b.append(el('b', null, String(count)));
      b.append(el('span', null, `box ${box}`));
      boxes.append(b);
    }
    const fresh = el('div', 'box');
    fresh.append(el('b', null, String(s.fresh)));
    fresh.append(el('span', null, 'unseen'));
    boxes.append(fresh);
    root.append(boxes);
    if (upcoming) root.append(el('p', 'foot', `Next review ${new Date(upcoming).toLocaleString()}.`));
    root.append(button('go', 'Back to study', () => { state.screen = 'home'; render(); }));
    return;
  }

  const item = recallCurrent();
  root.append(el('p', 'crumbs', `${kind === 'cards' ? 'Flashcards' : 'Type-it'} · ${state.recallAt + 1} of ${state.recallQueue.length} · box ${recall[kind][item.id]?.box ?? 'new'}`));
  const card = el('section', 'card');

  if (kind === 'cards') {
    if (item.scenario) card.append(el('p', 'scenario', item.scenario));
    card.append(el('p', 'prompt', item.prompt));
    if (!state.flipped) {
      card.append(el('p', 'hint', 'Answer it in your head first, then flip.'));
      card.append(button('go', 'Flip', () => { state.flipped = true; render(); }));
    } else {
      const back = el('div', 'back');
      back.append(el('p', 'answer', item.choices.find(c => c.correct).text));
      back.append(el('p', 'explain', item.explain));
      card.append(back);
      const row = el('div', 'grade');
      row.append(button('go miss', 'Missed it', () => mark(false)));
      row.append(button('go', 'Knew it', () => mark(true)));
      card.append(row);
    }
  } else {
    card.append(el('p', 'kind', item.kind === 'command' ? 'IOS command' : 'Fact'));
    card.append(el('p', 'prompt', item.prompt));
    if (!state.typed) {
      const input = el('input', 'type-input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.autocapitalize = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-label', item.prompt);
      const go = () => { state.typed = { value: input.value, ...checkTyped(item, input.value) }; if (!state.typed.empty) render(); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      card.append(input);
      card.append(button('go', 'Check', go));
      setTimeout(() => input.focus(), 0);
    } else {
      const fb = el('div', `fb ${state.typed.correct ? 'ok' : 'no'}`);
      fb.setAttribute('role', 'status');
      fb.append(el('p', 'verdict', state.typed.correct ? 'Correct' : 'Not quite'));
      if (!state.typed.correct) {
        fb.append(el('p', 'mine', `You typed: ${state.typed.value}`));
        fb.append(el('p', 'answer mono', item.answer));
      }
      fb.append(el('p', 'explain', item.note));
      card.append(fb);
      card.append(button('go', 'Next', () => mark(state.typed.correct)));
    }
  }
  root.append(card);
  root.append(button('quit', 'Back to study', () => { state.screen = 'home'; render(); }));
}

function render() {
  root.innerHTML = '';
  if (state.screen === 'home') renderHome();
  else if (state.screen === 'recall') renderRecall();
  else if (state.screen === 'done') renderDone();
  else renderQuestion();
  window.scrollTo(0, 0);
}

render();
