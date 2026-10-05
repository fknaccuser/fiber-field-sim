// The lab screen: a work order with a live checklist beside a console on
// each router.
//
// The checklist re-checks after every command. Help comes in two steps per
// goal: a hint in plain words, then the exact commands. Using either one
// makes the lab count as practice rather than mastery, and the screen says so
// before you use it.

import { startLab, goalStates } from './catalog.js';
import { execute, prompt, complete } from './ios.js';

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

// createLabScreen({ lab, branchName, onExit, onFinish({ assisted }) })
export function createLabScreen({ lab, branchName, onExit, onFinish }) {
  const root = el('section', 'lab');
  let run = startLab(lab);
  let current = lab.start;
  const logs = {};
  const histories = {};
  let finished = false;
  let reported = false;

  const resetLogs = () => {
    for (const d of lab.devices) {
      logs[d] = `\n${run.world.devices[d].config.hostname} con0 is now available\n\nPress RETURN to get started.\n\n`;
      histories[d] = { list: [], at: 0 };
    }
  };
  resetLogs();

  const assisted = () => run.help.hints.size > 0 || run.help.shown.size > 0;

  // ---------- layout ----------
  const top = el('header', 'sk-top');
  top.append(btn('sk-back', 'Map', () => onExit?.()));
  const title = el('div', 'sk-title');
  title.append(el('span', 'sk-kicker', `Do lab · ${branchName}`));
  title.append(el('h1', null, lab.title));
  top.append(title);
  top.append(btn('sk-back lab-restart', 'Restart', () => {
    if (!window.confirm?.('Start this lab over from the beginning?')) return;
    run = startLab(lab);
    finished = false;
    reported = false;
    current = lab.start;
    resetLogs();
    drawAll();
  }));

  const order = el('div', 'lab-order');
  const story = el('p', 'lab-story', lab.story);
  const topo = el('p', 'lab-topo', lab.topology);
  order.append(story, topo);

  const checklist = el('ol', 'lab-goals');
  const helpBox = el('div', 'lab-help');
  const brief = el('div', 'lab-brief');
  brief.append(order, checklist, helpBox);

  const tabs = el('div', 'lab-tabs');
  tabs.setAttribute('role', 'tablist');
  const screen = el('pre', 'lab-screen');
  screen.setAttribute('aria-live', 'polite');
  screen.tabIndex = 0;
  const form = el('form', 'lab-input');
  const promptLabel = el('label', 'lab-prompt');
  const input = el('input', 'lab-command');
  input.type = 'text';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.setAttribute('enterkeyhint', 'send');
  input.setAttribute('aria-label', 'Command');
  promptLabel.htmlFor = input.id = `lab-cmd-${lab.id}`;
  form.append(promptLabel, input);
  const keys = el('div', 'lab-keys');
  for (const [label, act] of [['Tab', 'tab'], ['?', 'help'], ['↑', 'up'], ['↓', 'down'], ['end', 'end']]) {
    const k = btn('lab-key', label, () => key(act));
    k.setAttribute('aria-label', { tab: 'Complete the word', help: 'Help for this command', up: 'Previous command', down: 'Next command', end: 'Back to privileged EXEC' }[act]);
    keys.append(k);
  }
  const consoleBox = el('div', 'lab-console');
  consoleBox.append(tabs, screen, form, keys);

  const body = el('div', 'lab-body');
  body.append(brief, consoleBox);
  const done = el('section', 'lab-done');
  done.hidden = true;
  root.append(top, body, done);

  // ---------- console ----------
  function session() { return run.sessions[current]; }

  function send(line) {
    const s = session();
    const p = prompt(s);
    const secret = Boolean(s.pending?.secret);
    const out = execute(s, line);
    logs[current] += `${p}${secret ? '' : line}\n${out ? `${out}\n` : ''}`;
    if (line.trim() && !/\?$/.test(line)) { histories[current].list.push(line); histories[current].at = histories[current].list.length; }
    drawConsole();
    drawGoals();
  }

  function key(act) {
    const h = histories[current];
    if (act === 'tab') input.value = complete(session(), input.value);
    else if (act === 'help') {
      const s = session();
      const line = `${input.value}?`;
      logs[current] += `${prompt(s)}${line}\n${execute(s, line)}\n`;
      drawConsole();
    } else if (act === 'up') { if (h.at > 0) { h.at -= 1; input.value = h.list[h.at]; } }
    else if (act === 'down') { if (h.at < h.list.length) { h.at += 1; input.value = h.list[h.at] ?? ''; } }
    else if (act === 'end') { send('end'); input.value = ''; }
    input.focus({ preventScroll: true });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const line = input.value;
    input.value = '';
    send(line);
    input.focus({ preventScroll: true });
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); key('tab'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); key('up'); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); key('down'); }
    else if (e.key === '?') { e.preventDefault(); key('help'); }
    else if (e.key === 'z' && e.ctrlKey) { e.preventDefault(); key('end'); }
  });
  screen.addEventListener('click', () => { if (!window.getSelection?.()?.toString()) input.focus({ preventScroll: true }); });

  function drawConsole() {
    tabs.textContent = '';
    for (const d of lab.devices) {
      const t = btn(`lab-tab${d === current ? ' is-on' : ''}`, run.world.devices[d].config.hostname === 'Router' ? d : run.world.devices[d].config.hostname, () => { current = d; drawConsole(); input.focus({ preventScroll: true }); });
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(d === current));
      t.dataset.device = d;
      tabs.append(t);
    }
    // Keep the console to its last few thousand lines.
    const lines = logs[current].split('\n');
    if (lines.length > 600) logs[current] = lines.slice(-600).join('\n');
    screen.textContent = logs[current];
    screen.scrollTop = screen.scrollHeight;
    const s = session();
    promptLabel.textContent = prompt(s);
    input.type = s.pending?.secret ? 'password' : 'text';
  }

  // ---------- checklist ----------
  function drawGoals() {
    const states = goalStates(run);
    const next = states.findIndex(g => !g.done);
    checklist.textContent = '';
    lab.goals.forEach((g, i) => {
      const st = states[i];
      const li = el('li', `lab-goal${st.done ? ' is-done' : ''}${i === next ? ' is-next' : ''}`);
      li.dataset.goal = g.id;
      const mark = el('span', 'lab-check');
      mark.setAttribute('aria-hidden', 'true');
      const text = el('span', 'lab-goal-text', g.text);
      li.append(mark, text);
      const sr = el('span', 'visually-hidden', st.done ? ' (done)' : '');
      li.append(sr);
      if (g.ask && !st.done) {
        const f = el('form', 'lab-ask');
        const a = el('input', 'lab-ask-input');
        a.placeholder = g.ask;
        a.value = run.answers[g.id] ?? '';
        a.setAttribute('aria-label', g.text);
        a.autocomplete = 'off';
        a.autocapitalize = 'off';
        a.spellcheck = false;
        f.append(a, btn('lab-ask-go', 'Check'));
        f.lastChild.type = 'submit';
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          run.answers[g.id] = a.value;
          const ok = goalStates(run)[i].done;
          if (!ok) { a.classList.remove('is-wrong'); void a.offsetWidth; a.classList.add('is-wrong'); }
          drawGoals();
        });
        li.append(f);
      }
      checklist.append(li);
    });
    drawHelp(next);
    if (next === -1 && !finished) finish();
  }

  function drawHelp(next) {
    helpBox.textContent = '';
    if (next === -1) return;
    const g = lab.goals[next];
    const row = el('div', 'lab-help-row');
    const note = el('span', 'lab-help-note', assisted() ? 'Help used: this lab will count as practice.' : 'Stuck? Help is here, but it makes the lab count as practice.');
    row.append(note);
    if (!run.help.hints.has(g.id)) row.append(btn('lab-help-btn', 'Hint', () => { run.help.hints.add(g.id); drawGoals(); }));
    else if (!run.help.shown.has(g.id) && g.show) row.append(btn('lab-help-btn', 'Show me', () => { run.help.shown.add(g.id); drawGoals(); }));
    helpBox.append(row);
    if (run.help.hints.has(g.id)) helpBox.append(el('p', 'lab-hint', g.hint));
    if (run.help.shown.has(g.id) && g.show) {
      const pre = el('pre', 'lab-show');
      pre.textContent = Object.entries(g.show).map(([d, lines]) => `${d}:\n${lines.map(l => `  ${l === '' ? '(press Enter)' : l}`).join('\n')}`).join('\n');
      helpBox.append(pre);
    }
  }

  function finish() {
    finished = true;
    if (!reported) { reported = true; onFinish?.({ assisted: assisted() }); }
    done.hidden = false;
    done.textContent = '';
    const clean = !assisted();
    done.className = `lab-done ${clean ? 'is-clean' : 'is-helped'}`;
    done.append(el('h2', null, clean ? 'Lab complete. Do is lit.' : 'Lab complete, with help.'));
    done.append(el('p', null, clean ? 'Every box ticked without a hint. That light stays bright for two weeks.' : 'It counts as practice. Run it again without hints to light Do fully.'));
    const row = el('div', 'lab-done-row');
    row.append(btn('sk-go', 'Back to the map', () => onExit?.()));
    row.append(btn('sk-back', 'Run it again', () => {
      run = startLab(lab); finished = false; reported = false; current = lab.start; resetLogs(); done.hidden = true; drawAll();
    }));
    done.append(row);
    done.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  function drawAll() { drawConsole(); drawGoals(); }
  drawAll();
  root.focusInput = () => input.focus({ preventScroll: true });
  return root;
}
