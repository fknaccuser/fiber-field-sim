import {
  createInitialState,
  submitOpeningCommand,
  completeInitialization,
  boot,
  persistProfile,
  startConfigureSession,
  exitMission,
  resumeMission,
  selectDevice,
  applyMissionActions,
  beginReconnect,
  chooseReconnectSource,
  cancelReconnect,
  confirmReconnect,
  recordTestEvent,
  terminalSessionFor,
  setTerminalSession,
  markTerminalBuilderOrigin,
  attemptStartMission,
  confirmReplaceMission,
  cancelReplaceMission,
  replayMission,
  startNewVariation,
  requestHint,
  pauseMissionTimer,
  resumeMissionTimer,
  toggleFinding,
  setCompletionNote,
  completeRun,
} from './app.js';
import { openStore } from './store.js';
import { renderHome, renderMission, renderDebrief, renderProgress } from './view.js';
import { runMissionTest } from './devices.js';
import { executeCommand } from './cli.js';
import { recommendMission, recommendedTier } from './progress.js';

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
        onContinue: continueMission,
        onStartCode: startCode,
        onStartVariation: startSkillVariation,
        onStartRecommended: startRecommended,
        onConfirmReplace: confirmReplace,
        onCancelReplace: cancelReplace,
        onOpenProgress: openProgress,
        recommendation: recommendMission(state.profile),
      }),
    );
  } else if (state.screen === 'progress') {
    root.appendChild(renderProgress(state, { onHome: progressToHome }));
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
          onSubmitCommand: submitTerminalCommand,
          onInsertBuilderCommand: insertBuilderCommand,
          onReplay: replay,
          onNewVariation: newVariation,
          onConfirmReplace: confirmReplace,
          onCancelReplace: cancelReplace,
          onRequestHint: requestHintAction,
          onToggleFinding: toggleFindingAction,
          onNoteChange: noteChange,
          onSubmit: submitCompletion,
        },
        missionTab,
      ),
    );
  } else if (state.screen === 'debrief') {
    root.appendChild(
      renderDebrief(state, {
        onReplay: replay,
        onNewVariation: newVariation,
        onHome: debriefToHome,
      }),
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

// Starting/replaying/varying a mission changes both the mission and the
// profile's recentFingerprints together: use the atomic saveLocal pair
// (DATA_CONTRACTS.md) so they can never diverge.
async function persistProfileAndMission() {
  state = { ...state, saveStatus: 'saving' };
  render();
  try {
    await store.saveLocal(state.profile, state.mission);
    state = { ...state, saveStatus: 'saved' };
  } catch {
    state = { ...state, saveStatus: 'error' };
  }
  render();
}

function startConfigure(layoutId) {
  const before = state.mission;
  state = startConfigureSession(state, layoutId);
  missionTab = 'network';
  render();
  if (state.mission !== before) persistProfileAndMission();
}

function continueMission() {
  state = resumeMission(state);
  render();
}

function startCode(caseCode) {
  const before = state.mission;
  state = attemptStartMission(state, caseCode);
  missionTab = 'network';
  render();
  if (state.mission !== before) persistProfileAndMission();
}

// Jumps straight to whatever tier progress.js currently recommends for this
// family (S14.md: recommendation influences the quick skill buttons, not
// just the Home summary text); tier4 is always the mixed family
// (SCENARIOS.md: "tier 4 must use M"). Every tier stays reachable manually
// through the seed-entry field regardless of this shortcut.
function startSkillVariation(family) {
  const tier = recommendedTier(state.profile, family);
  const effectiveFamily = tier === 4 ? 'M' : family;
  const before = state.mission;
  state = startNewVariation(state, 'BR', tier, effectiveFamily);
  missionTab = 'network';
  render();
  if (state.mission !== before) persistProfileAndMission();
}

// Home's "Recommended job" Start button: the fixed first job by code, or a
// generated variation at the least-practiced family's recommended tier
// (progress.js's recommendMission) once any run has completed.
function startRecommended() {
  const recommendation = recommendMission(state.profile);
  const before = state.mission;
  state =
    recommendation.kind === 'code'
      ? attemptStartMission(state, recommendation.code)
      : startNewVariation(state, 'BR', recommendation.tier, recommendation.family);
  missionTab = 'network';
  render();
  if (state.mission !== before) persistProfileAndMission();
}

function openProgress() {
  state = { ...state, screen: 'progress' };
  render();
}

function progressToHome() {
  state = { ...state, screen: 'home' };
  render();
}

function familyForRecipe(recipeId) {
  return recipeId[0]; // P1/P2 -> 'P', I1/I2 -> 'I', V1/V2 -> 'V', D1/D2 -> 'D'
}

function newVariation() {
  if (!state.mission?.caseCode) return;
  const layout = state.mission.network.layoutId;
  const tier = state.mission.tier ?? 1;
  const family = state.mission.recipeIds.length > 1 ? 'M' : familyForRecipe(state.mission.recipeIds[0]);
  const before = state.mission;
  state = startNewVariation(state, layout, tier, family);
  missionTab = 'network';
  render();
  if (state.mission !== before) persistProfileAndMission();
}

function replay() {
  const before = state.mission;
  state = replayMission(state);
  missionTab = 'network';
  render();
  if (state.mission !== before) persistMission();
}

function confirmReplace() {
  const before = state.mission;
  state = confirmReplaceMission(state);
  missionTab = 'network';
  render();
  if (state.mission !== before) persistProfileAndMission();
}

function cancelReplace() {
  state = cancelReplaceMission(state);
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
  // checkProtected always verifies the protected client regardless of which
  // device's Tests panel triggered it; log the event against the client it
  // actually verified, not the one clicked, so grade.js can find it.
  const loggedDeviceId = testKind === 'checkProtected' ? state.mission.protectedClientId : deviceId;
  state = recordTestEvent(state, testKind, loggedDeviceId, result);
  render();
  persistMission();
}

function requestHintAction() {
  state = requestHint(state);
  render();
  persistMission();
}

function toggleFindingAction(eventId) {
  state = toggleFinding(state, eventId);
  render();
  persistMission();
}

function noteChange(text) {
  state = setCompletionNote(state, text);
  // Not persisted on every keystroke (UI_AND_STORAGE.md: "Never persist on
  // every cursor blink or animation frame"); it's captured on the next
  // autosave-triggering action (a test, a config change, or Submit itself).
}

function submitCompletion() {
  const { state: nextState, result } = completeRun(state);
  state = nextState;
  missionTab = 'network';
  render();
  if (result.ok) {
    persistProfileAndMission();
  }
}

function debriefToHome() {
  state = { ...state, screen: 'home' };
  render();
}

// Leaving the tab (backgrounding, switching apps) pauses elapsed time the
// same way leaving the workspace does (MASTER_DESIGN.md §10); returning
// resumes it only if a mission is actually on screen.
document.addEventListener('visibilitychange', () => {
  if (!state.mission) return;
  if (document.hidden) {
    state = pauseMissionTimer(state);
    persistMission();
  } else if (state.screen === 'mission') {
    state = resumeMissionTimer(state);
  }
});

function submitTerminalCommand(deviceId, deviceKind, text) {
  const session = terminalSessionFor(state, deviceId, deviceKind);
  const { state: nextState, terminal } = executeCommand(state, session, text, session.builderOrigin);
  state = setTerminalSession(nextState, deviceId, terminal);
  render();
  persistMission();
}

// Inserting a builder suggestion only sets provenance for the next submission
// (devices.js already wrote the suggestion text into the input directly): no
// render() here, since a full re-render would rebuild the input and discard
// whatever the person is about to edit.
function insertBuilderCommand(deviceId, deviceKind) {
  state = markTerminalBuilderOrigin(state, deviceId, deviceKind);
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
