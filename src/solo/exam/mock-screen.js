// The full mock exam on screen: one clock, one direction, every item type.
//
// Questions use the exam prep card styles; simulations are the Field desk
// in exam mode; simlets are the simlet screen in exam mode. A bar on top
// keeps the clock and the count in sight through all of them.
//
// The run is saved after every item, so a closed tab can resume where it
// left off. The clock does not stop while it is closed: that is the rule
// being practiced. A simulation or simlet open at the time starts over.

import { MOCKS, buildPaper, score, pace, WORKING_TARGET, SIM_POINTS } from './mock.js';
import { CCNA_BANK } from '../study/questions.js';
import { presentation, isCorrect, expectedSelections, isDrag } from '../study/bank.js';
import { renderDrag, dragProgress, dragHelp } from '../study/drag.js';
import { renderExhibit } from '../study/exhibit.js';
import { freshen } from '../study/gen/index.js';
import { createDesk } from '../desk/screen.js';
import { templateOf } from '../desk/jobs.js';
import { createSimletScreen } from './simlet-screen.js';
import { simletOf } from './simlets.js';

export const RUN_KEY = 'field-mock-run-v1';
const BY_ID = new Map(CCNA_BANK.map(q => [q.id, q]));

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
const clock = (ms) => {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

export function loadRun() {
  try {
    const r = JSON.parse(localStorage.getItem(RUN_KEY) ?? 'null');
    if (!r?.paper?.items?.length || !Number.isFinite(r.startedAt)) return null;
    return r;
  } catch { return null; }
}
function saveRun(run) { try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); } catch { /* the run still works in memory */ } }
function clearRun() { try { localStorage.removeItem(RUN_KEY); } catch { /* nothing to clear */ } }

export const runLeftMs = (run, now = Date.now()) => (MOCKS[run.paper.format]?.minutes ?? 120) * 60000 - (now - run.startedAt);

// createMockScreen({ format, blueprint, resume, onFinish, onExit })
//   onFinish(summary) is called once, when the paper is scored.
export function createMockScreen({ format = 'full', blueprint = 'v1', resume = null, onFinish, onAnswer, onExit } = {}) {
  const root = el('main', 'exam-mock');
  let run = resume ?? null;
  let ticker = null;
  let child = null; // the desk or simlet element for the current item
  const q = { shown: null, pick: [], sel: null, item: -1 };
  const bar = { clock: el('span', 'mk-clock'), pace: el('span', 'mk-pace') };

  const stop = () => { if (ticker) { clearInterval(ticker); ticker = null; } };
  const f = () => MOCKS[run?.paper.format ?? format] ?? MOCKS.full;

  function start() {
    const seed = Math.floor(Math.random() * 1e9) + 1;
    run = { paper: buildPaper(format, { seed, blueprint }), index: 0, results: [], startedAt: Date.now(), done: false };
    saveRun(run);
    begin();
  }
  function begin() {
    stop();
    ticker = setInterval(tick, 1000);
    draw();
    window.scrollTo?.(0, 0);
  }

  function tick() {
    if (!run || run.done) return;
    const left = runLeftMs(run);
    if (left <= 0) { timeUp(); return; }
    bar.clock.textContent = clock(left);
    bar.clock.classList.toggle('is-low', left < 10 * 60000);
    const p = pace(run.paper, run.index, Date.now() - run.startedAt);
    const mins = Math.round(Math.abs(p.aheadMs) / 60000);
    bar.pace.textContent = mins < 2 ? 'On pace' : p.aheadMs > 0 ? `${mins} min ahead` : `${mins} min behind`;
    bar.pace.className = `mk-pace${p.aheadMs < -120000 ? ' is-behind' : ''}`;
  }

  // ---------- moving forward ----------
  function record(result) {
    run.results[run.index] = result;
    run.index += 1;
    child = null;
    if (run.index >= run.paper.items.length) { finish(false); return; }
    saveRun(run);
    draw();
    window.scrollTo?.(0, 0);
  }

  function timeUp() {
    // Whatever is open counts as it stands; everything after it scores zero.
    const item = run.paper.items[run.index];
    if (item?.type === 'sim' && child?.gradeNow) run.results[run.index] = child.gradeNow();
    finish(true);
  }

  function finish(timedOut) {
    stop();
    run.done = true;
    run.timedOut = timedOut;
    run.endedAt = Math.min(Date.now(), run.startedAt + f().minutes * 60000);
    const s = score(run.paper, run.results);
    run.summary = { format: run.paper.format, at: run.endedAt, pct: s.pct, minutes: Math.round((run.endedAt - run.startedAt) / 60000), timedOut, answered: run.results.filter(Boolean).length, items: run.paper.items.length, domains: Object.fromEntries(s.domains.map(d => [d.domain, d.pct])) };
    clearRun();
    onFinish?.(run.summary);
    child = null;
    draw();
    window.scrollTo?.(0, 0);
  }

  // ---------- items ----------
  function questionOf(i) {
    const item = run.paper.items[i];
    const base = BY_ID.get(item.id);
    return base ? freshen(base, item.gseed) : null;
  }

  function drawQuestion() {
    const question = questionOf(run.index);
    if (!question) { record({ ok: false, domain: null }); return; }
    if (q.item !== run.index) Object.assign(q, { item: run.index, shown: presentation(question), pick: [], sel: null });
    const card = el('section', 'ep-card');
    if (question.scenario) card.append(el('p', 'ep-scenario', question.scenario));
    if (question.exhibit) card.append(renderExhibit(question.exhibit, { highlight: false }));
    card.append(el('p', 'ep-prompt', question.prompt));
    if (isDrag(question)) {
      card.append(el('p', 'ep-hint', dragHelp(question)));
      card.append(renderDrag(question, q.shown, q, { onChange: draw }));
    } else {
      const wrap = el('div', 'ep-choices');
      for (const i of q.shown.choiceOrder) {
        const c = question.choices[i];
        const picked = q.pick.includes(i);
        const b = btn(`ep-choice${picked ? ' picked' : ''}`, '', () => {
          if (question.format === 'single') q.pick = [i];
          else q.pick = picked ? q.pick.filter(x => x !== i) : [...q.pick, i];
          draw();
        });
        b.setAttribute('aria-pressed', String(picked));
        b.append(el('span', 'ep-choice-text', c.text));
        wrap.append(b);
      }
      card.append(wrap);
    }
    const need = expectedSelections(question);
    const prog = isDrag(question) ? dragProgress(question, q.pick) : null;
    const ready = prog ? prog.placed === prog.need : q.pick.length === need;
    const label = prog ? `Next (${prog.placed}/${prog.need} placed)` : need > 1 ? `Next (${q.pick.length}/${need} chosen)` : 'Next';
    const next = btn('ep-go mk-next', label, () => {
      const answer = question.format === 'single' ? q.pick[0] : q.pick;
      const ok = isCorrect(question, answer);
      onAnswer?.(question, ok);
      record({ ok, domain: question.domain, pick: Array.isArray(answer) ? [...answer] : answer });
    });
    next.disabled = !ready;
    card.append(next);
    return card;
  }

  function mountSim(item) {
    if (child?.dataset.at === String(run.index)) return child;
    const n = run.paper.items.slice(0, run.index + 1).filter(x => x.type === 'sim').length;
    const of = run.paper.items.filter(x => x.type === 'sim').length;
    let desk = null;
    desk = createDesk({
      start: { kind: item.kind, seed: item.seed, mode: 'exam' },
      examLabel: `Simulation ${n} of ${of}`,
      onSubmit: (g) => record({ pct: g.pct, got: g.got, total: g.total, extras: g.extras.map(x => `${x.device}: ${x.text}`), misses: g.reqs.filter(r => !r.ok).map(r => r.text), domain: item.domain }),
    });
    desk.dataset.at = String(run.index);
    desk.gradeNow = () => {
      const g = desk.examGrade?.();
      return g ? { pct: g.pct, got: g.got, total: g.total, extras: g.extras.map(x => `${x.device}: ${x.text}`), misses: g.reqs.filter(r => !r.ok).map(r => r.text), domain: item.domain } : { pct: 0, domain: item.domain };
    };
    child = desk;
    return desk;
  }

  function mountSimlet(item) {
    if (child?.dataset.at === String(run.index)) return child;
    const n = run.paper.items.slice(0, run.index + 1).filter(x => x.type === 'simlet').length;
    const of = run.paper.items.filter(x => x.type === 'simlet').length;
    const s = createSimletScreen({ kind: item.kind, seed: item.seed, mode: 'exam', label: `Simlet ${n} of ${of}`, onDone: (r) => record({ right: r.right, total: r.total, domain: item.domain }) });
    s.dataset.at = String(run.index);
    child = s;
    return s;
  }

  // ---------- screens ----------
  function examBar() {
    const top = el('div', 'mk-bar');
    const item = run.paper.items[run.index];
    const kind = item.type === 'sim' ? 'Simulation' : item.type === 'simlet' ? 'Simlet' : 'Question';
    top.append(el('span', 'mk-count', `${run.index + 1} / ${run.paper.items.length}`), el('span', 'mk-kind', kind), bar.pace, bar.clock);
    tick();
    return top;
  }

  function drawIntro() {
    const fm = MOCKS[format] ?? MOCKS.full;
    const box = el('section', 'ep-card');
    box.append(el('h1', 'mk-h', fm.label));
    const rules = el('ul', 'mk-rules');
    for (const line of [
      `${fm.questions + fm.sims + fm.simlets} items in ${fm.minutes} minutes: ${fm.questions} questions, ${fm.sims} simulations and ${fm.simlets} ${fm.simlets === 1 ? 'simlet' : 'simlets'}, weighted like the blueprint.`,
      'One direction only. Once you move on, an item is closed, and there is no review screen.',
      '"Choose two" means exactly two. Drag-and-drop counts only when every piece is right.',
      `A simulation is graded on the running configuration for partial credit, worth ${SIM_POINTS} questions. Extra configuration costs points, as in the Field.`,
      'Exhibits are plain, with no colors. The clock keeps running if you close the app.',
      `Cisco does not publish a pass mark. ${Math.round(WORKING_TARGET * 100)}% is the usual working target.`,
    ]) rules.append(el('li', null, line));
    box.append(rules);
    box.append(btn('ep-go', `Start the clock · ${fm.minutes} min`, start));
    root.append(box);
    root.append(btn('ep-quit', 'Not now', () => onExit?.()));
  }

  function drawResult() {
    const s = score(run.paper, run.results);
    const head = el('section', 'ep-card mk-result');
    head.append(el('p', 'mk-kicker', `${f().label} · ${run.timedOut ? 'time ran out' : 'finished'} in ${clock(run.endedAt - run.startedAt)}`));
    head.append(el('b', `mk-pct${s.pct >= WORKING_TARGET * 100 ? ' is-pass' : ''}`, `${s.pct}%`));
    head.append(el('p', 'ep-explain', s.pct >= WORKING_TARGET * 100
      ? `Above the ${Math.round(WORKING_TARGET * 100)}% working target. The weakest domain below is still where the next points are.`
      : `Below the ${Math.round(WORKING_TARGET * 100)}% working target. The domains below show where the points went.`));
    root.append(head);

    const dom = el('section', 'ep-card');
    dom.append(el('p', 'ep-label', 'By domain'));
    for (const d of s.domains) {
      const row = el('div', 'mk-dom');
      const meta = el('div', 'mk-dom-meta');
      meta.append(el('span', null, `${d.label} · ${d.weight}%`), el('b', null, d.of ? `${d.pct}%` : '—'));
      const track = el('div', 'mk-track');
      const fill = el('i', d.pct >= WORKING_TARGET * 100 ? 'is-pass' : '');
      fill.style.width = `${d.pct}%`;
      track.append(fill);
      row.append(meta, track);
      dom.append(row);
    }
    const types = el('p', 'ep-foot', `Questions ${s.byType.q.pct}% · Simulations ${s.byType.sim.pct}% · Simlets ${s.byType.simlet.pct}%`);
    dom.append(types);
    root.append(dom);

    // Review: now that the paper is closed, what was missed and why.
    const misses = el('section', 'ep-card');
    misses.append(el('p', 'ep-label', 'What was missed'));
    let count = 0;
    run.paper.items.forEach((item, i) => {
      const r = run.results[i];
      if (item.type === 'q') {
        if (r?.ok) return;
        const question = questionOf(i);
        if (!question) return;
        count += 1;
        const d = el('details', 'mk-miss');
        d.append(el('summary', null, `${i + 1}. ${question.prompt}${r ? '' : ' (not reached)'}`));
        const right = question.choices ? question.choices.filter(c => c.correct).map(c => c.text).join('; ') : null;
        if (right) d.append(el('p', 'ep-answer', right));
        d.append(el('p', 'ep-explain', question.explain));
        misses.append(d);
      } else if (item.type === 'sim') {
        if (r && r.pct === 100) return;
        count += 1;
        const d = el('details', 'mk-miss');
        d.append(el('summary', null, `${i + 1}. Simulation: ${templateOf(item.kind)?.title ?? item.kind} · ${r ? `${r.pct}%` : 'not reached'}`));
        for (const m of r?.misses ?? []) d.append(el('p', 'ep-explain', `Missed: ${m}`));
        for (const x of r?.extras ?? []) d.append(el('p', 'ep-explain', `Extra: ${x}`));
        misses.append(d);
      } else {
        if (r && r.right === r.total) return;
        count += 1;
        const d = el('details', 'mk-miss');
        d.append(el('summary', null, `${i + 1}. Simlet: ${simletOf(item.kind)?.title ?? item.kind} · ${r ? `${r.right} of ${r.total}` : 'not reached'}`));
        d.append(el('p', 'ep-explain', 'Run a simlet of this kind from Exam prep to see each question explained.'));
        misses.append(d);
      }
    });
    if (!count) misses.append(el('p', 'ep-explain', 'Nothing. A clean paper.'));
    root.append(misses);
    root.append(btn('ep-go', 'Back to exam prep', () => onExit?.()));
  }

  function draw() {
    root.textContent = '';
    if (!run) { root.className = 'exam-mock exam-prep'; drawIntro(); return; }
    if (run.done) { root.className = 'exam-mock exam-prep'; drawResult(); return; }
    if (runLeftMs(run) <= 0) { finish(true); return; }
    const item = run.paper.items[run.index];
    if (item.type === 'q') {
      root.className = 'exam-mock exam-prep';
      root.append(examBar());
      const card = drawQuestion();
      if (card) root.append(card);
      return;
    }
    root.className = 'exam-mock skillmap is-lab is-desk';
    root.append(examBar());
    try {
      root.append(item.type === 'sim' ? mountSim(item) : mountSimlet(item));
    } catch (e) {
      // A broken item must not strand the paper: say so and let it be skipped.
      const box = el('section', 'desk-pane');
      box.append(el('p', 'desk-summary', 'This item failed to load. It will be scored as zero.'), el('p', 'desk-small', String(e?.message ?? e)));
      box.append(btn('sk-go', 'Skip it', () => record(item.type === 'sim' ? { pct: 0, domain: item.domain } : { right: 0, total: 4, domain: item.domain })));
      root.append(box);
    }
  }

  root.destroy = () => { stop(); child?.destroy?.(); };
  if (run && !run.done) begin(); else draw();
  return root;
}
