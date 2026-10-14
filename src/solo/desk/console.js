// The console pane shared by the Field desk, simlets and the mock exam: one
// tab per device, the IOS (or PC) prompt, history, Tab and ? keys.
//
// createConsoles(world, devices, start, { redraw }) keeps a session, a
// scrollback and a history per device. pane() draws the pane; the host calls
// redraw() whenever it rebuilds, and the kit calls the host's redraw after
// each command.

import { createSession, execute, prompt, complete } from '../labs/ios.js';

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

const MAX_LINES = 600;

export function createConsoles(world, devices, start, { redraw, inputId = 'desk-cmd' } = {}) {
  const sessions = Object.fromEntries(devices.map(d => [d.id, createSession(world, d.id)]));
  const logs = {};
  const hist = {};
  for (const d of devices) {
    const dev = world.devices[d.id];
    logs[d.id] = dev.kind === 'pc' ? `Command Prompt on ${d.id}\nType ipconfig, ping or tracert.\n\n` : `\n${dev.config.hostname} con0 is now available\n\nPress RETURN to get started.\n\n`;
    hist[d.id] = { list: [], at: 0 };
  }
  let current = start ?? devices[0]?.id;
  let inputEl = null;

  const kit = {
    sessions,
    get current() { return current; },
    set current(d) { current = d; },
    started: () => Object.values(sessions).some(s => s.history.length),
    focus: () => requestAnimationFrame(() => inputEl?.focus({ preventScroll: true })),
    pane,
  };

  function send(line) {
    const s = sessions[current];
    const p = prompt(s);
    const secret = Boolean(s.pending?.secret);
    const out = execute(s, line);
    logs[current] += `${p}${secret ? '' : line}\n${out ? `${out}\n` : ''}`;
    const lines = logs[current].split('\n');
    if (lines.length > MAX_LINES) logs[current] = lines.slice(-MAX_LINES).join('\n');
    if (line.trim() && !/\?$/.test(line) && !secret) { const h = hist[current]; h.list.push(line); h.at = h.list.length; }
    redraw?.();
    kit.focus();
  }

  function key(act, input) {
    const h = hist[current];
    const s = sessions[current];
    if (act === 'tab') input.value = complete(s, input.value);
    else if (act === 'help') { logs[current] += `${prompt(s)}${input.value}?\n${execute(s, `${input.value}?`)}\n`; const v = input.value; redraw?.(); if (inputEl) inputEl.value = v; }
    else if (act === 'up') { if (h.at > 0) { h.at -= 1; input.value = h.list[h.at]; } }
    else if (act === 'down') { if (h.at < h.list.length) { h.at += 1; input.value = h.list[h.at] ?? ''; } }
    else if (act === 'end') { send('end'); return; }
    kit.focus();
  }

  function pane(cls = 'desk-pane desk-console lab-console') {
    const box = el('section', cls);
    const tabs = el('div', 'lab-tabs');
    for (const d of devices) {
      const host = world.devices[d.id].config.hostname;
      const name = d.kind === 'pc' || ['Switch', 'Router'].includes(host) ? d.id : host;
      const t = btn(`lab-tab${d.id === current ? ' is-on' : ''}`, name, () => { current = d.id; redraw?.(); kit.focus(); });
      t.dataset.device = d.id;
      tabs.append(t);
    }
    const screen = el('pre', 'lab-screen');
    screen.setAttribute('aria-live', 'polite');
    screen.textContent = logs[current];
    const form = el('form', 'lab-input');
    const s = sessions[current];
    const label = el('label', 'lab-prompt', prompt(s));
    const input = el('input', 'lab-command');
    Object.assign(input, { type: s.pending?.secret ? 'password' : 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
    input.setAttribute('enterkeyhint', 'send');
    input.setAttribute('aria-label', 'Command');
    input.id = inputId;
    label.htmlFor = input.id;
    form.append(label, input);
    const keys = el('div', 'lab-keys');
    for (const [lbl, act] of [['Tab', 'tab'], ['?', 'help'], ['↑', 'up'], ['↓', 'down'], ['end', 'end']]) keys.append(btn('lab-key', lbl, () => key(act, input)));
    form.addEventListener('submit', (e) => { e.preventDefault(); const line = input.value; input.value = ''; send(line); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); key('tab', input); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); key('up', input); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); key('down', input); }
      else if (e.key === '?') { e.preventDefault(); key('help', input); }
      else if (e.key === 'z' && e.ctrlKey) { e.preventDefault(); key('end', input); }
    });
    screen.addEventListener('click', () => { if (!window.getSelection?.()?.toString()) input.focus({ preventScroll: true }); });
    inputEl = input;
    box.append(tabs, screen, form, keys);
    requestAnimationFrame(() => { screen.scrollTop = screen.scrollHeight; screen.scrollLeft = 0; });
    return box;
  }

  return kit;
}
