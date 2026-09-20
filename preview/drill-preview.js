// Preview-only entry. The generator, the answer checking, and the session
// scoring are the repo's own drills/subnet.js. Only the screen is written here.

import { TIERS, tierById, generate, isCorrect, emptySession, record, averageSeconds, shouldShowWork } from '../src/solo/drills/subnet.js';

const BEST_KEY = 'fieldsim:subnet:best';
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY) || 0); } catch { return 0; } };
const writeBest = (n) => { try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* storage can be off */ } };

const root = document.getElementById('root');
let session = emptySession('warm');
let question = null;
let last = null;
let left = 0;
let startedAt = 0;
let ticker = null;
let allTime = readBest();

function stop() { if (ticker) { clearInterval(ticker); ticker = null; } }

function next() {
  stop();
  question = generate(session.tierId);
  last = null;
  left = tierById(session.tierId).seconds;
  startedAt = Date.now();
  render();
  ticker = setInterval(() => {
    left -= 1;
    if (left <= 0) { stop(); submit(null, true); return; }
    const bar = document.getElementById('bar');
    const secs = document.getElementById('secs');
    if (bar) bar.style.width = `${(100 * left) / tierById(session.tierId).seconds}%`;
    if (secs) secs.textContent = `${left}s`;
  }, 1000);
}

function submit(value, timedOut) {
  if (!question || last) return;
  stop();
  const correct = !timedOut && isCorrect(value, question.answer);
  const seconds = (Date.now() - startedAt) / 1000;
  session = record(session, { correct, seconds, timedOut });
  if (session.best > allTime) { allTime = session.best; writeBest(allTime); }
  last = { correct, timedOut, seconds };
  render();
}

function setTier(id) { stop(); session = emptySession(id); question = null; last = null; render(); }

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function tierRow() {
  const row = el('div', 'tiers');
  for (const t of TIERS) {
    const b = el('button', `tier${t.id === session.tierId ? ' on' : ''}`);
    b.type = 'button';
    b.append(el('span', 'tier-name', t.label));
    b.append(el('span', 'tier-secs', `${t.seconds}s`));
    b.addEventListener('click', () => setTier(t.id));
    row.append(b);
  }
  return row;
}

function render() {
  root.innerHTML = '';
  root.append(el('h1', null, 'Subnet drill'));
  root.append(el('p', 'sub', 'Generated every time, so there is nothing to memorise except the method.'));
  root.append(tierRow());

  if (!question) {
    const intro = el('section', 'card');
    intro.append(el('p', 'intro', 'Type the answer and press Enter. Running out of time costs the streak and nothing else.'));
    intro.append(el('p', 'intro', tierById(session.tierId).teach
      ? 'Warm shows the full arithmetic after every question, right or wrong, so the method gets built before the clock matters.'
      : 'Field and Exam show the worked arithmetic only when you miss.'));
    intro.append(el('p', 'best', allTime ? `Best streak ${allTime}` : 'No streak yet'));
    const go = el('button', 'go', 'Start drilling');
    go.type = 'button';
    go.addEventListener('click', next);
    intro.append(go);
    root.append(intro);
    return;
  }

  const avg = averageSeconds(session);
  const stats = el('div', 'stats');
  const stat = (label, value) => { const s = el('span'); s.append(el('em', null, label)); s.append(el('b', null, value)); return s; };
  stats.append(stat('STREAK', String(session.streak)));
  stats.append(stat('BEST', String(allTime)));
  stats.append(stat('SCORE', `${session.correct}/${session.asked}`));
  stats.append(stat('AVG', avg ? `${avg.toFixed(1)}s` : '—'));
  root.append(stats);

  const card = el('section', 'card');
  const timer = el('div', 'timer');
  const bar = el('div', 'bar');
  bar.id = 'bar';
  bar.style.width = last ? '0%' : `${(100 * left) / tierById(session.tierId).seconds}%`;
  timer.append(bar);
  card.append(timer);
  const secs = el('div', 'secs', last ? '' : `${left}s`);
  secs.id = 'secs';
  card.append(secs);
  card.append(el('p', 'prompt', question.prompt));

  if (last) {
    const fb = el('div', `fb ${last.correct ? 'ok' : 'no'}`);
    fb.setAttribute('role', 'status');
    fb.append(el('p', 'verdict', last.correct ? `Correct · ${last.seconds.toFixed(1)}s` : (last.timedOut ? 'Out of time' : 'Not quite')));
    if (!last.correct) fb.append(el('p', 'answer', question.answer));
    if (shouldShowWork(session.tierId, last.correct)) {
      const work = el('ol', 'work');
      for (const line of question.work) work.append(el('li', null, line));
      fb.append(work);
    } else {
      fb.append(el('p', 'rule', question.rule));
    }
    const go = el('button', 'go', 'Next');
    go.type = 'button';
    go.addEventListener('click', next);
    fb.append(go);
    card.append(fb);
  } else {
    const input = el('input', 'input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', question.prompt);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(input.value); } });
    card.append(input);
    const go = el('button', 'go', 'Check');
    go.type = 'button';
    go.addEventListener('click', () => submit(input.value));
    card.append(go);
    setTimeout(() => input.focus(), 0);
  }
  root.append(card);
}

render();
