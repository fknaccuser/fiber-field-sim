import {
  createInitialState,
  submitOpeningCommand,
  completeInitialization,
  boot,
  persistProfile,
  startConfigureSession,
  exitMission,
  selectDevice,
  applyMissionActions,
  beginReconnect,
  chooseReconnectSource,
  cancelReconnect,
  confirmReconnect,
  recordTestEvent,
} from './app.js';
import { openStore } from './store.js';
import { renderHome, renderMission } from './view.js';
import { runMissionTest } from './devices.js';

const INIT_LINES = ['Initializing local session.', 'Preparing The Field.', 'Ready.'];
const INIT_LINE_DELAY_MS = 200;

const store = openStore();
let state = createInitialState();
// Which mission tab is visible below 900px. Transient view state, not part of
// the tracked app state (UI_AND_STORAGE.md's App state shape has no tab field):
// switching tabs never discards terminal or selection state because nothing
// is unmounted, only hidden (see renderMission).
let missionTab = 'network';

function render() {
  const root = document.getElementById('root');
  root.textContent = '';
  if (state.screen === 'opening') {
    root.appendChild(renderOpening());
  } else if (state.screen === 'initializing') {
    root.appendChild(renderInitializing());
  } else if (state.screen === 'home') {
    root.appendChild(
      renderHome(state, {
        onRetrySave: retrySave,
        onStartConfigure: startConfigure,
      }),
    );
  } else if (state.screen === 'mission') {
    root.appendChild(
      renderMission(
        state,
        {
          onExit: exitToHome,
          onTabChange: changeMissionTab,
          onSelectDevice: pickDevice,
          onSelectLink: pickLink,
          onChooseReconnectSource: chooseSource,
          onConfirmReconnect: confirmReconnectFlow,
          onCancelReconnect: cancelReconnectFlow,
          onApplyDeviceForm: applyDeviceForm,
          onRunTest: runTest,
        },
        missionTab,
      ),
    );
  }
}

async function retrySave() {
  state = await persistProfile(state, store);
  render();
}

// One active mission autosaves after every accepted configuration change and
// test (MASTER_DESIGN.md §10). Reuses the same saveStatus indicator as the
// profile save.
async function persistMission() {
  state = { ...state, saveStatus: 'saving' };
  render();
  try {
    await store.saveMission(state.mission);
    state = { ...state, saveStatus: 'saved' };
  } catch {
    state = { ...state, saveStatus: 'error' };
  }
  render();
}

function startConfigure(layoutId) {
  state = startConfigureSession(state, layoutId);
  missionTab = 'network';
  render();
}

function exitToHome() {
  state = exitMission(state);
  missionTab = 'network';
  render();
}

function changeMissionTab(tab) {
  missionTab = tab;
  render();
}

function pickDevice(deviceId) {
  state = selectDevice(state, deviceId);
  missionTab = 'device';
  render();
}

function pickLink(linkId) {
  state = beginReconnect(state, linkId);
  render();
}

function chooseSource(portId) {
  state = chooseReconnectSource(state, portId);
  render();
}

function cancelReconnectFlow() {
  state = cancelReconnect(state);
  render();
}

function confirmReconnectFlow(destinationPortId) {
  const { state: nextState, result } = confirmReconnect(state, destinationPortId);
  state = result.ok ? { ...nextState, error: null } : { ...state, error: result.message || 'Could not reconnect that cable.' };
  render();
  if (result.ok) persistMission();
}

function applyDeviceForm(actions) {
  const { state: nextState, result } = applyMissionActions(state, actions, { deviceId: state.selectedDeviceId });
  state = result.ok ? { ...nextState, error: null } : { ...state, error: result.message || 'Could not apply that change.' };
  render();
  if (result.ok && actions.length > 0) persistMission();
}

function runTest(testKind, deviceId) {
  const result = runMissionTest(state.mission, testKind, deviceId);
  state = recordTestEvent(state, testKind, deviceId, result);
  render();
  persistMission();
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

async function start() {
  state = await boot(store);
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
