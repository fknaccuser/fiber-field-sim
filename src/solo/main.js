import { createInitialState, submitOpeningCommand, completeInitialization } from './app.js';

const INIT_LINES = ['Initializing local session.', 'Preparing The Field.', 'Ready.'];
const INIT_LINE_DELAY_MS = 200;

let state = createInitialState();

function render() {
  const root = document.getElementById('root');
  root.textContent = '';
  if (state.screen === 'opening') {
    root.appendChild(renderOpening());
  } else if (state.screen === 'initializing') {
    root.appendChild(renderInitializing());
  } else if (state.screen === 'home') {
    root.appendChild(renderHome());
  }
}

function renderOpening() {
  const container = document.createElement('div');
  container.className = 'opening-screen';

  const line = document.createElement('div');
  line.className = 'opening-line';
  line.setAttribute('aria-hidden', 'true');

  const prompt = document.createElement('span');
  prompt.className = 'opening-prompt';
  prompt.textContent = '> ';

  const typed = document.createElement('span');
  typed.className = 'opening-typed';

  const cursor = document.createElement('span');
  cursor.className = 'opening-cursor';

  line.append(prompt, typed, cursor);

  const label = document.createElement('label');
  label.className = 'visually-hidden';
  label.setAttribute('for', 'opening-command');
  label.textContent = 'Command';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'opening-command';
  input.className = 'opening-input visually-hidden';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;

  const errorLine = document.createElement('div');
  errorLine.className = 'opening-error';
  errorLine.setAttribute('role', 'alert');
  if (state.error) {
    errorLine.textContent = state.error;
  }

  input.addEventListener('input', () => {
    typed.textContent = input.value;
  });

  container.addEventListener('click', () => {
    input.focus();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    state = submitOpeningCommand(state, input.value);
    if (state.screen === 'initializing') {
      render();
      runInitializationSequence();
    } else {
      render();
      document.getElementById('opening-command').focus();
    }
  });

  container.append(line, label, input, errorLine);

  queueMicrotask(() => input.focus());

  return container;
}

function renderInitializing() {
  const container = document.createElement('div');
  container.className = 'init-screen';
  container.setAttribute('aria-live', 'polite');

  const list = document.createElement('ul');
  list.className = 'init-lines';
  list.id = 'init-lines';
  container.appendChild(list);

  return container;
}

function runInitializationSequence() {
  const list = document.getElementById('init-lines');
  INIT_LINES.forEach((text, index) => {
    setTimeout(() => {
      if (!list) return;
      const item = document.createElement('li');
      item.textContent = text;
      list.appendChild(item);
      if (index === INIT_LINES.length - 1) {
        setTimeout(() => {
          state = completeInitialization(state);
          render();
        }, INIT_LINE_DELAY_MS);
      }
    }, INIT_LINE_DELAY_MS * index);
  });
}

function renderHome() {
  const container = document.createElement('div');
  container.className = 'home-screen';

  const heading = document.createElement('h1');
  heading.textContent = 'The Field';
  container.appendChild(heading);

  return container;
}

function start() {
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
