// The lab screen: a work order with a live checklist beside a console on
// each router, in one of three stages.
//
//   guided    think first (a multiple-choice why), build each command from a
//             bank of tiles with traps in it, check the result, and explain
//             it back at the end
//   assisted  the tile bank alone, traps included
//   typed     the bare console, with a hint and "show me" if you are stuck
//
// The checklist re-checks after every command in every stage, because the
// tiles run real commands on the routers. Only a typed run with no help
// lights Do; the other stages count as practice and step you up.

import { startLab, goalStates } from './catalog.js';
import { execute, prompt, complete } from './ios.js';
import { STAGES, STAGE_LABEL, alreadyThere, tilesFor, commandOf, bankFor, judge, guidedGoals, teachFor, shuffle } from './coach.js';

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

// createLabScreen({ lab, branchName, stage, suggested, onExit, onFinish, onRestart })
export function createLabScreen({ lab, branchName, stage = 'typed', suggested = null, onExit, onFinish, onRestart }) {
  const root = el('section', `lab is-${stage}`);
  const goals = guidedGoals(lab);
  const teach = teachFor(lab);
  const choosing = stage !== 'typed';
  let run = startLab(lab);
  const coach = { goalId: null, phase: null, step: 0, built: [], note: null, why: null, wrongPicks: new Set(), wrong: 0, verified: new Set(), touched: new Set(), taught: false };
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

  // Stage switcher: any stage, any time. Switching starts the lab over.
  const stages = el('div', 'lab-stages');
  stages.setAttribute('role', 'group');
  stages.setAttribute('aria-label', 'Stage');
  for (const st of STAGES) {
    const b = btn(`lab-stage${st === stage ? ' is-on' : ''}`, STAGE_LABEL[st], () => {
      if (st === stage) return;
      const started = Object.values(run.sessions).some(x => x.history.length);
      if (started && !window.confirm?.(`Switch to ${STAGE_LABEL[st]}? The lab starts over.`)) return;
      onRestart?.(st);
    });
    b.setAttribute('aria-pressed', String(st === stage));
    if (st === suggested && st !== stage) b.append(el('span', 'lab-stage-dot', ' next'));
    stages.append(b);
  }

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

  const coachBox = el('section', 'lab-coach');
  coachBox.setAttribute('aria-live', 'polite');
  if (choosing) { form.hidden = true; keys.hidden = true; consoleBox.append(coachBox); helpBox.hidden = true; }

  const body = el('div', 'lab-body');
  body.append(brief, consoleBox);
  const done = el('section', 'lab-done');
  done.hidden = true;
  root.append(top, stages, body, done);

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
  let followCoach = false;
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
      if (g.ask && !st.done && !choosing) {
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
    if (choosing) {
      drawCoach(states);
      // After the first pick, keep the coach in sight: on a phone the goal
      // list above it would otherwise push each new question off screen.
      if (followCoach) requestAnimationFrame(() => coachBox.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
      return;
    }
    drawHelp(next);
    if (next === -1 && !finished) finish();
  }

  // ---------- the coach (guided and assisted) ----------
  function mcq(question, key, onRight) {
    const wrap = el('div', 'lab-mcq');
    wrap.append(el('p', 'lab-q', question.q));
    const list = el('div', 'lab-choices');
    for (const c of shuffle(question.choices, key)) {
      const picked = coach.wrongPicks.has(`${key}:${c.text}`);
      const b = btn(`lab-choice${picked ? ' is-wrong' : ''}`, c.text, () => {
        if (c.ok) { coach.note = c.why; coach.why = null; coach.wrongPicks.clear(); onRight(); }
        else { coach.wrong += 1; coach.why = c.why; coach.wrongPicks.add(`${key}:${c.text}`); }
        drawGoals();
      });
      b.disabled = picked;
      list.append(b);
    }
    wrap.append(list);
    return wrap;
  }

  // The goal to work on: the first one not done, or a done one still owed
  // its "check it" question in guided mode.
  function activeGoal(states) {
    for (let i = 0; i < goals.length; i += 1) {
      const g = goals[i];
      if (!states[i].done) return i;
      if (stage === 'guided' && g.guide?.verify && coach.touched.has(g.id) && !coach.verified.has(g.id)) return i;
    }
    return -1;
  }

  function drawCoach(states) {
    coachBox.textContent = '';
    const i = activeGoal(states);
    if (i === -1) {
      if (stage === 'guided' && teach && !coach.taught) {
        coachBox.append(header('Explain it back', 'Teach-back'));
        coachBox.append(mcq(teach, 'teach', () => { coach.taught = true; }));
        if (coach.why) coachBox.append(el('p', 'lab-why', coach.why));
        return;
      }
      if (!finished) finish();
      return;
    }
    const goal = goals[i];
    const g = goal.guide ?? {};
    if (coach.goalId !== goal.id) {
      Object.assign(coach, { goalId: goal.id, step: 0, built: [], why: null });
      coach.wrongPicks.clear();
      coach.phase = stage === 'guided' && g.think ? 'think' : 'build';
    }
    coach.touched.add(goal.id);
    if (states[i].done) coach.phase = 'verify';

    const head = (kind) => header(goal.text, `${i + 1} of ${goals.length} · ${kind}`);

    if (coach.phase === 'think') {
      coachBox.append(head('Think'));
      coachBox.append(mcq(g.think, `${goal.id}:think`, () => { coach.phase = 'build'; }));
    } else if (coach.phase === 'verify') {
      coachBox.append(head('Check'));
      coachBox.append(mcq(g.verify, `${goal.id}:verify`, () => { coach.verified.add(goal.id); }));
    } else {
      // Build: skip mode steps the router is already in, then the next step.
      const steps = g.steps ?? [];
      while (coach.step < steps.length && alreadyThere(steps[coach.step], run.sessions[steps[coach.step].device])) coach.step += 1;
      if (coach.step < steps.length) {
        const step = steps[coach.step];
        if (current !== step.device) { current = step.device; drawConsole(); }
        coachBox.append(head('Build the command'));
        drawBuild(step, `${goal.id}:${coach.step}`);
      } else if (goal.ask && g.choices) {
        coachBox.append(head('Answer'));
        const q = { q: 'Read it off the console. Which is it?', choices: g.choices.map(text => ({ text, ok: false, why: '' })) };
        const list = el('div', 'lab-choices');
        for (const c of shuffle(q.choices, `${goal.id}:ans`)) {
          const picked = coach.wrongPicks.has(`ans:${c.text}`);
          list.append(btn(`lab-choice${picked ? ' is-wrong' : ''}`, c.text, () => {
            run.answers[goal.id] = c.text;
            if (goalStates(run)[i].done) { coach.note = 'Right. That is what the router says.'; coach.why = null; coach.wrongPicks.clear(); }
            else { coach.wrong += 1; coach.why = 'Not that one. Look at the console output again; the answer is printed there.'; coach.wrongPicks.add(`ans:${c.text}`); }
            drawGoals();
          }));
          list.lastChild.disabled = picked;
        }
        coachBox.append(el('p', 'lab-q', q.q), list);
      } else {
        coachBox.append(head('Check the console'));
        coachBox.append(el('p', 'lab-q', 'That did not tick the box yet. Read the console output: an error there is the clue. Switch to Typed to fix it by hand.'));
      }
    }
    if (coach.why) coachBox.append(el('p', 'lab-why', coach.why));
    if (coach.note) coachBox.prepend(el('p', 'lab-note', coach.note));
  }

  function header(text, kicker) {
    const h = el('div', 'lab-coach-head');
    h.append(el('span', 'lab-kicker', kicker), el('p', 'lab-coach-title', text));
    return h;
  }

  function drawBuild(step, key) {
    const s = run.sessions[step.device];
    const need = tilesFor(step, s);
    const line = el('div', 'lab-line');
    line.append(el('span', 'lab-line-prompt', prompt(s)));
    for (const t of coach.built) line.append(el('span', 'lab-tile is-placed', t));
    line.append(el('span', 'lab-slot', '\u00a0'));
    coachBox.append(line);
    const bank = el('div', 'lab-bank');
    for (const tile of bankFor(step, s, key)) {
      if (tile.need !== undefined && tile.need < coach.built.length) continue;
      const pickKey = `${key}:${coach.built.length}:${tile.text}:${tile.need ?? 'x'}`;
      const picked = coach.wrongPicks.has(pickKey);
      bank.append(btn(`lab-tile${picked ? ' is-wrong' : ''}`, tile.text, () => {
        const r = judge(tile, step, s, coach.built);
        if (!r.ok) { coach.wrong += 1; coach.why = r.why; coach.wrongPicks.add(pickKey); drawGoals(); return; }
        coach.built.push(tile.text);
        coach.why = null; coach.wrongPicks.clear(); coach.note = null;
        if (r.complete) {
          const cmd = commandOf(coach.built);
          coach.built = [];
          coach.step += 1;
          send(cmd);
        } else drawGoals();
      }));
      bank.lastChild.disabled = picked;
    }
    coachBox.append(bank);
    if (coach.built.length) coachBox.append(btn('lab-undo', 'Undo last tile', () => { coach.built.pop(); drawGoals(); }));
    if (need.length > 1 && stage === 'guided') coachBox.append(el('p', 'lab-tip', `${need.length} tiles. Pick them left to right.`));
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
    const helped = !choosing && assisted();
    if (!reported) { reported = true; onFinish?.({ assisted: helped, stage, wrong: coach.wrong }); }
    done.hidden = false;
    done.textContent = '';
    const tidy = coach.wrong <= 2;
    let heading, text, next = null;
    if (stage === 'typed') {
      heading = helped ? 'Lab complete, with help.' : 'Lab complete. Do is lit.';
      text = helped ? 'It counts as practice. Run it again without hints to light Do fully.' : 'Every box ticked from the bare console. That light stays bright for two weeks.';
    } else if (stage === 'guided') {
      heading = 'Guided run complete.';
      text = `${coach.wrong ? `${coach.wrong} wrong ${coach.wrong === 1 ? 'pick' : 'picks'}, each one explained.` : 'No wrong picks.'} Next: Assisted, the same tiles without the questions.`;
      next = 'assisted';
    } else {
      heading = 'Assisted run complete.';
      text = tidy ? 'Two or fewer wrong tiles. Next: Typed, the bare console. That is the one that lights Do.' : `${coach.wrong} wrong tiles. Run Assisted again for two or fewer, or try Typed anyway: nothing is locked.`;
      next = tidy ? 'typed' : 'assisted';
    }
    done.className = `lab-done ${stage === 'typed' && !helped ? 'is-clean' : 'is-helped'}`;
    done.append(el('h2', null, heading));
    done.append(el('p', null, text));
    const row = el('div', 'lab-done-row');
    if (next) row.append(btn('sk-go', `Start ${STAGE_LABEL[next]}`, () => onRestart?.(next)));
    row.append(btn(next ? 'sk-back' : 'sk-go', 'Back to the map', () => onExit?.()));
    if (!next) row.append(btn('sk-back', 'Run it again', () => onRestart?.(stage)));
    done.append(row);
    done.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  function drawAll() { drawConsole(); drawGoals(); }
  drawAll();
  followCoach = true;
  root.focusInput = () => input.focus({ preventScroll: true });
  return root;
}
