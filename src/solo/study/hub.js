// CCNA exam prep, as a self-contained screen inside the app.
//
// Follows the issue library's pattern: it owns its own state, saves to
// localStorage behind try/catch, and hands control back through onExit and
// onLaunch. That keeps it out of the main state machine, so adding it cannot
// disturb the mission flow.
//
// Everything that decides anything lives in the pure modules beside it
// (bank, recall, concepts, mastery, drills/subnet), all under test. This
// file only draws them.

import { DOMAINS, filter, sampleExam, coverage, presentation, isCorrect, expectedSelections, quotas } from './bank.js';
import { CCNA_BANK } from './questions.js';
import { review, dueCards, summarise, checkTyped, nextDue } from './recall.js';
import { RECALL_DECK } from './recall-deck.js';
import { conceptById } from './concepts.js';
import { masteryOf, collectionSummary, studyAfterTicket } from './mastery.js';
import { TIERS, tierById, generate, isCorrect as drillCorrect, emptySession, record, averageSeconds, shouldShowWork } from '../drills/subnet.js';
import { parameters } from '../seed.js';

export const STORAGE_KEY = 'field-exam-prep-v1';

const CARD_IDS = CCNA_BANK.filter(q => q.format === 'single').map(q => q.id);
const TYPE_IDS = RECALL_DECK.map(c => c.id);

// A case code whose only fault is the given recipe, so a concept can send
// the trainee straight into a ticket that exercises it.
export function codeForRecipe(recipeId, tier = 1) {
  for (let i = 0; i < 400; i += 1) {
    const code = `TF1-BR-${tier}-${recipeId[0]}-prep${i}`;
    try {
      const params = parameters(code);
      if (params.recipes.length === 1 && params.recipes[0] === recipeId) return code;
    } catch { /* not a valid code; keep looking */ }
  }
  return null;
}

function loadSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      cards: raw && typeof raw.cards === 'object' ? raw.cards : {},
      typeit: raw && typeof raw.typeit === 'object' ? raw.typeit : {},
      quiz: raw && typeof raw.quiz === 'object' ? raw.quiz : {},
      subnetBest: Number.isFinite(raw?.subnetBest) ? raw.subnetBest : 0,
      blueprint: ['v1', 'v2', 'both'].includes(raw?.blueprint) ? raw.blueprint : 'v1',
    };
  } catch {
    return { cards: {}, typeit: {}, quiz: {}, subnetBest: 0, blueprint: 'v1' };
  }
}

export function createExamPrep({ onExit, onLaunch, getCompletedRuns } = {}) {
  const root = el('main', 'exam-prep');
  const saved = loadSaved();
  let storageError = '';
  let ticker = null;

  const ui = {
    screen: 'home',
    domains: new Set(DOMAINS.map(d => d.id)),
    deck: [], at: 0, pick: [], shown: null, graded: null, right: 0, exam: false, shortfalls: [],
    recallKind: null, queue: [], recallAt: 0, recallRight: 0, flipped: false, typed: null,
    drill: emptySession('warm'), drillQ: null, drillLast: null, drillLeft: 0, drillStart: 0,
  };

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); storageError = ''; } catch {
      storageError = 'Progress could not be saved. Keep this tab open to retain this session.';
    }
  }

  function runs() { return (getCompletedRuns?.() ?? []).filter(Boolean); }

  function practice() {
    const questions = { ...saved.quiz };
    for (const [id, card] of Object.entries(saved.cards)) {
      questions[id] = { right: (questions[id]?.right ?? 0) + (card.right ?? 0), seen: (questions[id]?.seen ?? 0) + (card.seen ?? 0) };
    }
    return { questions, cards: saved.typeit };
  }
  const mastery = () => masteryOf({ completedRuns: runs(), practice: practice() });

  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }
  function go(screen) { stopTicker(); ui.screen = screen; draw(); }
  function exit() { stopTicker(); onExit?.(); }

  // ---------- quiz and mock exam ----------
  function begin(deck, exam, shortfalls = []) {
    Object.assign(ui, { deck, exam, shortfalls, at: 0, right: 0, screen: 'quiz' });
    loadQuestion();
  }
  function loadQuestion() {
    const q = ui.deck[ui.at];
    ui.pick = []; ui.graded = null;
    ui.shown = q ? presentation(q) : null;
    draw();
  }
  function submitQuestion() {
    const q = ui.deck[ui.at];
    const correct = isCorrect(q, q.format === 'single' ? ui.pick[0] : ui.pick);
    if (correct) ui.right += 1;
    const prior = saved.quiz[q.id] ?? { right: 0, seen: 0 };
    saved.quiz[q.id] = { right: prior.right + (correct ? 1 : 0), seen: prior.seen + 1 };
    save();
    ui.graded = { correct };
    draw();
  }

  // ---------- spaced recall ----------
  function startRecall(kind) {
    const ids = kind === 'cards' ? CARD_IDS : TYPE_IDS;
    Object.assign(ui, { recallKind: kind, queue: dueCards(ids, saved[kind], Date.now()).slice(0, 20), recallAt: 0, recallRight: 0, flipped: false, typed: null });
    go('recall');
  }
  function markRecall(correct) {
    const id = ui.queue[ui.recallAt];
    saved[ui.recallKind] = { ...saved[ui.recallKind], [id]: review(saved[ui.recallKind][id], correct, Date.now()) };
    save();
    if (correct) ui.recallRight += 1;
    Object.assign(ui, { recallAt: ui.recallAt + 1, flipped: false, typed: null });
    draw();
  }

  // ---------- subnet drill ----------
  function nextDrill() {
    stopTicker();
    ui.drillQ = generate(ui.drill.tierId);
    ui.drillLast = null;
    ui.drillLeft = tierById(ui.drill.tierId).seconds;
    ui.drillStart = Date.now();
    draw();
    ticker = setInterval(() => {
      ui.drillLeft -= 1;
      if (ui.drillLeft <= 0) { stopTicker(); submitDrill(null, true); return; }
      const bar = root.querySelector('.ep-bar');
      const secs = root.querySelector('.ep-secs');
      if (bar) bar.style.width = `${(100 * ui.drillLeft) / tierById(ui.drill.tierId).seconds}%`;
      if (secs) secs.textContent = `${ui.drillLeft}s`;
    }, 1000);
  }
  function submitDrill(value, timedOut) {
    if (!ui.drillQ || ui.drillLast) return;
    stopTicker();
    const correct = !timedOut && drillCorrect(value, ui.drillQ.answer);
    const seconds = (Date.now() - ui.drillStart) / 1000;
    ui.drill = record(ui.drill, { correct, seconds, timedOut });
    if (ui.drill.best > saved.subnetBest) { saved.subnetBest = ui.drill.best; save(); }
    ui.drillLast = { correct, timedOut, seconds };
    draw();
  }

  // ---------- screens ----------
  function drawHome() {
    root.append(header('Exam prep', 'CCNA 200-301. Drill in here, earn it in the Field.'));
    const sum = collectionSummary(mastery());
    const coll = btn('ep-collection', '', () => go('collection'));
    coll.append(el('span', 'ep-coll-title', 'Collection'));
    coll.append(el('span', 'ep-coll-meta', `${sum.earned} earned · ${sum.practiced} practiced · ${sum.unseen} unseen`));
    const track = el('span', 'ep-track');
    const e = el('span', 'ep-track-earned'); e.style.width = `${(100 * sum.earned) / sum.total}%`;
    const p = el('span', 'ep-track-practiced'); p.style.width = `${(100 * sum.practiced) / sum.total}%`;
    track.append(e, p);
    coll.append(track);
    root.append(coll);

    root.append(el('p', 'ep-label', 'Blueprint'));
    const seg = el('div', 'ep-seg');
    for (const [id, name, hint] of [['v1', 'V1.1', 'live now'], ['v2', 'V2.0', 'Feb 2027'], ['both', 'Both', 'everything']]) {
      const b = btn(`ep-seg-b${saved.blueprint === id ? ' on' : ''}`, '', () => { saved.blueprint = id; save(); draw(); });
      b.append(el('span', 'ep-seg-name', name));
      b.append(el('span', 'ep-seg-hint', hint));
      seg.append(b);
    }
    root.append(seg);

    root.append(el('p', 'ep-label', 'Domains'));
    const doms = el('div', 'ep-domains');
    for (const row of coverage(CCNA_BANK, { blueprint: saved.blueprint })) {
      const on = ui.domains.has(row.domain);
      const b = btn(`ep-dom${on ? ' on' : ''}`, '', () => { if (on) ui.domains.delete(row.domain); else ui.domains.add(row.domain); draw(); });
      b.append(el('span', 'ep-dom-name', row.label));
      b.append(el('span', 'ep-dom-meta', `${row.weight}% · ${row.have} questions`));
      doms.append(b);
    }
    root.append(doms);

    const pool = filter(CCNA_BANK, { domains: [...ui.domains], blueprint: saved.blueprint });
    const acts = el('div', 'ep-actions');
    const quiz = btn('ep-go', `Quiz ${pool.length} questions`, () => begin(presentation({ choices: pool }).choiceOrder.map(i => pool[i]), false));
    quiz.disabled = !pool.length;
    acts.append(quiz);
    acts.append(btn('ep-go ghost', 'Mock exam, 50 weighted', () => {
      const { questions, shortfalls } = sampleExam(CCNA_BANK, { count: 50, blueprint: saved.blueprint });
      begin(questions, true, shortfalls);
    }));
    root.append(acts);

    const now = Date.now();
    root.append(el('p', 'ep-label', 'Drills and recall'));
    const more = el('div', 'ep-actions');
    more.append(btn('ep-go ghost', 'Subnet drill', () => { ui.drill = emptySession(ui.drill.tierId); ui.drillQ = null; go('drill'); }));
    more.append(btn('ep-go ghost', `Flashcards · ${dueCards(CARD_IDS, saved.cards, now).length} due`, () => startRecall('cards')));
    more.append(btn('ep-go ghost', `Type-it · ${dueCards(TYPE_IDS, saved.typeit, now).length} due`, () => startRecall('typeit')));
    root.append(more);

    root.append(el('p', 'ep-foot', `A mock draws ${quotas(50).map(x => `${x.domain} ${x.want}`).join(', ')}.`));
    if (storageError) root.append(el('p', 'ep-warn', storageError));
    root.append(btn('ep-quit', 'Back', exit));
  }

  function drawCollection() {
    const rows = mastery();
    const sum = collectionSummary(rows);
    root.append(header('Collection', 'Drilling gets a concept to practiced. Only fixing it in the Field without help earns it.'));
    const legend = el('div', 'ep-legend');
    for (const [cls, name, n] of [['earned', 'Earned', sum.earned], ['practiced', 'Practiced', sum.practiced], ['unseen', 'Unseen', sum.unseen]]) {
      const item = el('span', `ep-lg ep-lg-${cls}`);
      item.append(el('b', null, String(n)));
      item.append(el('span', null, name));
      legend.append(item);
    }
    root.append(legend);

    const last = [...runs()].reverse().find(r => r.mode === 'repair');
    if (last) {
      const plan = studyAfterTicket({ recipes: last.recipes, assisted: last.assisted, solved: true });
      const box = el('section', 'ep-card');
      box.append(el('p', 'ep-label', 'Your last ticket'));
      box.append(el('p', 'ep-explain', plan.needed
        ? `Fixed with help, so ${plan.concepts.map(id => conceptById(id).label).join(', ')} counts as practiced. Study it, then take it again without hints to earn it.`
        : `Fixed without help. ${plan.concepts.map(id => conceptById(id).label).join(', ')} is earned.`));
      if (plan.needed && plan.questions.length) {
        box.append(btn('ep-go', `Study the ${plan.questions.length} questions`, () => begin(CCNA_BANK.filter(q => plan.questions.includes(q.id) && q.format !== 'match' && q.format !== 'order'), false)));
      }
      root.append(box);
    }

    const list = el('div', 'ep-concepts');
    for (const row of rows) {
      const concept = conceptById(row.id);
      const card = el('div', `ep-concept st-${row.state}`);
      const head = el('div', 'ep-concept-head');
      head.append(el('span', 'ep-concept-name', row.label));
      head.append(el('span', `ep-badge b-${row.state}`, row.state));
      card.append(head);
      const bits = [`Faults ${concept.recipes.join(', ')}`];
      if (row.earnedBy) bits.push(`earned by ${row.earnedBy}`);
      else if (row.assistedInField) bits.push('fixed with help');
      bits.push(row.drilled ? `${row.drilled} of ${row.material} drilled` : `${row.material} to study`);
      card.append(el('p', 'ep-concept-meta', bits.join(' · ')));

      const acts = el('div', 'ep-concept-acts');
      const recipe = concept.recipes[0];
      if (recipe && row.state !== 'earned') {
        acts.append(btn('ep-mini', `Take a ${recipe} ticket`, () => {
          const code = codeForRecipe(recipe);
          if (code) { stopTicker(); onLaunch?.(code); }
        }));
      }
      if (concept.questions.length) {
        acts.append(btn('ep-mini ghost', 'Study it', () => begin(CCNA_BANK.filter(q => concept.questions.includes(q.id) && q.format !== 'match' && q.format !== 'order'), false)));
      }
      card.append(acts);
      list.append(card);
    }
    root.append(list);
    root.append(btn('ep-quit', 'Back to exam prep', () => go('home')));
  }

  function drawQuestion() {
    const q = ui.deck[ui.at];
    if (!q) { go('home'); return; }
    root.append(el('p', 'ep-crumbs', `${ui.exam ? 'Mock exam' : 'Quiz'} · ${ui.at + 1} of ${ui.deck.length} · ${q.domain}${q.v2 === 'v2only' ? ' · v2.0 only' : ''}`));
    const card = el('section', 'ep-card');
    if (q.scenario) card.append(el('p', 'ep-scenario', q.scenario));
    card.append(el('p', 'ep-prompt', q.prompt));

    if (q.format === 'match') drawMatch(card, q);
    else if (q.format === 'order') drawOrder(card, q);
    else drawChoices(card, q);

    if (!ui.graded) {
      const need = expectedSelections(q);
      const ready = q.format === 'match' || q.format === 'order'
        ? ui.pick.filter(v => v !== undefined).length === (q.pairs ?? q.steps).length
        : ui.pick.length === need;
      const check = btn('ep-go', need > 1 ? `Check (${ui.pick.length}/${need})` : 'Check', submitQuestion);
      check.disabled = !ready;
      card.append(check);
    } else {
      const fb = el('div', `ep-fb ${ui.graded.correct ? 'ok' : 'no'}`);
      fb.setAttribute('role', 'status');
      fb.append(el('p', 'ep-verdict', ui.graded.correct ? 'Correct' : 'Not quite'));
      fb.append(el('p', 'ep-explain', q.explain));
      card.append(fb);
      card.append(btn('ep-go', ui.at + 1 >= ui.deck.length ? 'Finish' : 'Next', () => {
        if (ui.at + 1 >= ui.deck.length) go('done'); else { ui.at += 1; loadQuestion(); }
      }));
    }
    root.append(card);
    root.append(btn('ep-quit', 'Back to exam prep', () => go('home')));
  }

  function drawChoices(card, q) {
    const wrap = el('div', 'ep-choices');
    for (const i of ui.shown.choiceOrder) {
      const c = q.choices[i];
      const picked = ui.pick.includes(i);
      let cls = `ep-choice${picked ? ' picked' : ''}`;
      if (ui.graded) cls += c.correct ? ' right' : (picked ? ' wrong' : '');
      const b = btn(cls, '', () => {
        if (ui.graded) return;
        if (q.format === 'single') ui.pick = [i];
        else ui.pick = picked ? ui.pick.filter(x => x !== i) : [...ui.pick, i];
        draw();
      });
      b.append(el('span', 'ep-choice-text', c.text));
      if (ui.graded) b.append(el('span', 'ep-choice-why', c.why));
      wrap.append(b);
    }
    card.append(wrap);
  }

  function drawMatch(card, q) {
    const wrap = el('div', 'ep-pairs');
    q.pairs.forEach((pair, left) => {
      const row = el('label', 'ep-pair');
      row.append(el('span', 'ep-pair-left', pair.left));
      const sel = document.createElement('select');
      sel.className = 'ep-select';
      sel.setAttribute('aria-label', pair.left);
      sel.append(option('', 'choose…'));
      for (const right of ui.shown.rightOrder) sel.append(option(String(right), q.pairs[right].right));
      sel.value = ui.pick[left] === undefined ? '' : String(ui.pick[left]);
      sel.disabled = Boolean(ui.graded);
      sel.addEventListener('change', () => {
        const next = [...ui.pick];
        next[left] = sel.value === '' ? undefined : Number(sel.value);
        ui.pick = next;
        draw();
      });
      if (ui.graded) row.classList.add(ui.pick[left] === left ? 'right' : 'wrong');
      row.append(sel);
      wrap.append(row);
    });
    card.append(wrap);
  }

  function drawOrder(card, q) {
    const wrap = el('div', 'ep-steps');
    ui.pick.forEach((i, pos) => {
      const row = el('div', `ep-step chosen${ui.graded ? (i === pos ? ' right' : ' wrong') : ''}`);
      row.append(el('span', 'ep-step-n', String(pos + 1)));
      row.append(el('span', null, q.steps[i]));
      if (!ui.graded) row.append(btn('ep-step-undo', 'remove', () => { ui.pick = ui.pick.filter(x => x !== i); draw(); }));
      wrap.append(row);
    });
    if (!ui.graded) {
      for (const i of ui.shown.shownOrder.filter(i => !ui.pick.includes(i))) {
        wrap.append(btn('ep-step', q.steps[i], () => { ui.pick = [...ui.pick, i]; draw(); }));
      }
    }
    card.append(wrap);
  }

  function drawDone() {
    const pct = ui.deck.length ? Math.round((100 * ui.right) / ui.deck.length) : 0;
    root.append(header(`${ui.right} of ${ui.deck.length}`, `${pct}% ${ui.exam ? 'on a weighted mock' : 'on this quiz'}. Cisco does not publish a pass mark; around 80 percent is the usual working target.`));
    if (ui.exam && ui.shortfalls.length) {
      root.append(el('p', 'ep-warn', `Short on ${ui.shortfalls.map(s => `${s.domain} (${s.have} of ${s.want})`).join(', ')}, so this mock was under-weighted there.`));
    }
    root.append(btn('ep-go', 'Back to exam prep', () => go('home')));
  }

  function drawRecall() {
    const kind = ui.recallKind;
    const ids = kind === 'cards' ? CARD_IDS : TYPE_IDS;
    if (ui.recallAt >= ui.queue.length) {
      const s = summarise(ids, saved[kind]);
      const upcoming = nextDue(ids, saved[kind], Date.now());
      root.append(header(ui.queue.length ? `${ui.recallRight} of ${ui.queue.length}` : 'Nothing due',
        ui.queue.length ? 'Right answers move up a box and come back later. Misses come back this session.' : 'Everything is scheduled for later. That is the system working rather than a gap.'));
      const boxes = el('div', 'ep-boxes');
      for (const [box, n] of Object.entries(s.boxes)) boxes.append(tile(String(n), `box ${box}`));
      boxes.append(tile(String(s.fresh), 'unseen'));
      root.append(boxes);
      if (upcoming) root.append(el('p', 'ep-foot', `Next review ${new Date(upcoming).toLocaleString()}.`));
      root.append(btn('ep-go', 'Back to exam prep', () => go('home')));
      return;
    }
    const id = ui.queue[ui.recallAt];
    const item = kind === 'cards' ? CCNA_BANK.find(q => q.id === id) : RECALL_DECK.find(c => c.id === id);
    root.append(el('p', 'ep-crumbs', `${kind === 'cards' ? 'Flashcards' : 'Type-it'} · ${ui.recallAt + 1} of ${ui.queue.length} · box ${saved[kind][id]?.box ?? 'new'}`));
    const card = el('section', 'ep-card');

    if (kind === 'cards') {
      if (item.scenario) card.append(el('p', 'ep-scenario', item.scenario));
      card.append(el('p', 'ep-prompt', item.prompt));
      if (!ui.flipped) {
        card.append(el('p', 'ep-hint', 'Answer it in your head first, then flip.'));
        card.append(btn('ep-go', 'Flip', () => { ui.flipped = true; draw(); }));
      } else {
        card.append(el('p', 'ep-answer', item.choices.find(c => c.correct).text));
        card.append(el('p', 'ep-explain', item.explain));
        const row = el('div', 'ep-grade');
        row.append(btn('ep-go miss', 'Missed it', () => markRecall(false)));
        row.append(btn('ep-go', 'Knew it', () => markRecall(true)));
        card.append(row);
      }
    } else {
      card.append(el('p', 'ep-kind', item.kind === 'command' ? 'IOS command' : 'Fact'));
      card.append(el('p', 'ep-prompt', item.prompt));
      if (!ui.typed) {
        const input = textInput('ep-type', item.prompt);
        const check = () => { const r = checkTyped(item, input.value); if (!r.empty) { ui.typed = { value: input.value, ...r }; draw(); } };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
        card.append(input);
        card.append(btn('ep-go', 'Check', check));
        setTimeout(() => input.focus(), 0);
      } else {
        const fb = el('div', `ep-fb ${ui.typed.correct ? 'ok' : 'no'}`);
        fb.setAttribute('role', 'status');
        fb.append(el('p', 'ep-verdict', ui.typed.correct ? 'Correct' : 'Not quite'));
        if (!ui.typed.correct) {
          fb.append(el('p', 'ep-mine', `You typed: ${ui.typed.value}`));
          fb.append(el('p', 'ep-answer mono', item.answer));
        }
        fb.append(el('p', 'ep-explain', item.note));
        card.append(fb);
        card.append(btn('ep-go', 'Next', () => markRecall(ui.typed.correct)));
      }
    }
    root.append(card);
    root.append(btn('ep-quit', 'Back to exam prep', () => go('home')));
  }

  function drawDrill() {
    root.append(header('Subnet drill', 'Generated every time, so there is nothing to memorise except the method.'));
    const tiers = el('div', 'ep-seg');
    for (const t of TIERS) {
      const b = btn(`ep-seg-b${t.id === ui.drill.tierId ? ' on' : ''}`, '', () => { stopTicker(); ui.drill = emptySession(t.id); ui.drillQ = null; draw(); });
      b.append(el('span', 'ep-seg-name', t.label));
      b.append(el('span', 'ep-seg-hint', `${t.seconds}s`));
      tiers.append(b);
    }
    root.append(tiers);

    if (!ui.drillQ) {
      const intro = el('section', 'ep-card');
      intro.append(el('p', 'ep-explain', tierById(ui.drill.tierId).teach
        ? 'Warm shows the full arithmetic after every question, so the method is built before the clock matters.'
        : 'Field and Exam show the worked arithmetic only when you miss.'));
      intro.append(el('p', 'ep-foot', saved.subnetBest ? `Best streak ${saved.subnetBest}` : 'No streak yet'));
      intro.append(btn('ep-go', 'Start drilling', nextDrill));
      root.append(intro);
      root.append(btn('ep-quit', 'Back to exam prep', () => go('home')));
      return;
    }

    const avg = averageSeconds(ui.drill);
    const stats = el('div', 'ep-stats');
    for (const [k, v] of [['STREAK', ui.drill.streak], ['BEST', saved.subnetBest], ['SCORE', `${ui.drill.correct}/${ui.drill.asked}`], ['AVG', avg ? `${avg.toFixed(1)}s` : '—']]) {
      const s = el('span');
      s.append(el('em', null, k));
      s.append(el('b', null, String(v)));
      stats.append(s);
    }
    root.append(stats);

    const card = el('section', 'ep-card');
    const timer = el('div', 'ep-timer');
    const bar = el('div', 'ep-bar');
    bar.style.width = ui.drillLast ? '0%' : `${(100 * ui.drillLeft) / tierById(ui.drill.tierId).seconds}%`;
    timer.append(bar);
    card.append(timer);
    card.append(el('div', 'ep-secs', ui.drillLast ? '' : `${ui.drillLeft}s`));
    card.append(el('p', 'ep-prompt', ui.drillQ.prompt));

    if (ui.drillLast) {
      const fb = el('div', `ep-fb ${ui.drillLast.correct ? 'ok' : 'no'}`);
      fb.setAttribute('role', 'status');
      fb.append(el('p', 'ep-verdict', ui.drillLast.correct ? `Correct · ${ui.drillLast.seconds.toFixed(1)}s` : (ui.drillLast.timedOut ? 'Out of time' : 'Not quite')));
      if (!ui.drillLast.correct) fb.append(el('p', 'ep-answer mono', ui.drillQ.answer));
      if (shouldShowWork(ui.drill.tierId, ui.drillLast.correct)) {
        const work = el('ol', 'ep-work');
        for (const line of ui.drillQ.work) work.append(el('li', null, line));
        fb.append(work);
      } else {
        fb.append(el('p', 'ep-explain', ui.drillQ.rule));
      }
      card.append(fb);
      card.append(btn('ep-go', 'Next', nextDrill));
    } else {
      const input = textInput('ep-type big', ui.drillQ.prompt);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitDrill(input.value); } });
      card.append(input);
      card.append(btn('ep-go', 'Check', () => submitDrill(input.value)));
      setTimeout(() => input.focus(), 0);
    }
    root.append(card);
    root.append(btn('ep-quit', 'Back to exam prep', () => go('home')));
  }

  function draw() {
    root.textContent = '';
    const screens = { home: drawHome, collection: drawCollection, quiz: drawQuestion, done: drawDone, recall: drawRecall, drill: drawDrill };
    (screens[ui.screen] ?? drawHome)();
  }

  draw();
  root.destroy = stopTicker;
  return root;
}

// ---------- small builders ----------
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function btn(cls, text, onClick) {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
function header(title, sub) {
  const h = el('header', 'ep-header');
  h.append(el('h1', null, title));
  if (sub) h.append(el('p', 'ep-sub', sub));
  return h;
}
function option(value, text) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  return o;
}
function tile(big, small) {
  const t = el('div', 'ep-tile');
  t.append(el('b', null, big));
  t.append(el('span', null, small));
  return t;
}
function textInput(cls, label) {
  const i = el('input', cls);
  i.type = 'text';
  i.autocomplete = 'off';
  i.autocapitalize = 'off';
  i.spellcheck = false;
  i.setAttribute('aria-label', label);
  return i;
}
