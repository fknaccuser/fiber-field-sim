import {
  createInitialState,
  submitOpeningCommand,
  completeInitialization,
  boot,
  startConfigureSession,
  exitMission,
  resumeMission,
  selectDevice,
  applyMissionActions,
  beginReconnect,
  chooseReconnectSource,
  cancelReconnect,
  confirmReconnect,
  disconnectLink,
  requestReset,
  cancelReset,
  confirmReset,
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
  openReference,
  openStudy,
  closeStudy,
  selectStudyFamily,
  openLesson,
  closeLesson,
  revealCard,
  updateAndPersistProfile,
  isQuotaExceeded,
} from './app.js';
import { openStore, previewBackup } from './store.js';
import {
  renderHome,
  renderMission,
  renderDebrief,
  renderProgress,
  renderStudy,
  renderReference,
  renderUpdateBanner,
} from './view.js';
import { runMissionTest } from './devices.js';
import { executeCommand } from './cli.js';
import { recommendMission, recommendedTier } from './progress.js';
import { recordStudyAnswer, recordCardReview } from './study.js';

const INIT_LINES = ['Initializing local session.', 'Preparing The Field.', 'Ready.'];
const INIT_LINE_DELAY_MS = 200;

const store = openStore();
let state = createInitialState();
// Which mission tab is visible below 900px. Transient view state, not part of
// the tracked app state (UI_AND_STORAGE.md's App state shape has no tab field):
// switching tabs never discards terminal or selection state because nothing
// is unmounted, only hidden (see renderMission).
let missionTab = 'network';
// Which screen Reference was opened from ('home' or 'mission'), so closing
// it returns there with that screen's own state untouched (S16.md: "Returning
// from reference preserves mission state"). Transient, like missionTab.
let screenBeforeReference = 'home';
// Reference's search text. Transient view state, not persisted or part of
// the tracked app state.
let referenceQuery = '';
// Import's staged candidate (S17.md: preview before an explicit Replace).
// Transient — nothing here is persisted unless/until confirmImportAction
// actually calls store.replaceData.
let importPreview = null;
let importBackup = null;
let importError = null;
// Service worker lifecycle (S19.md), all transient view state like the rest
// of this block: offlineReady flips true once Workbox's onOfflineReady
// fires; updateAvailable flips true once a new version has installed and is
// waiting (onNeedRefresh); updateServiceWorkerFn is registerSW()'s own
// returned callback, used only once the learner explicitly chooses Reload.
let offlineReady = false;
let updateAvailable = false;
let updateServiceWorkerFn = null;

function render() {
  const root = document.getElementById('root');
  root.textContent = '';
  if (updateAvailable) {
    root.appendChild(renderUpdateBanner({ onReload: reloadForUpdate }));
  }
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
        onOpenStudy: openStudyScreen,
        onOpenReference: openReferenceScreen,
        recommendation: recommendMission(state.profile),
        onExportBackup: exportBackupAction,
        offlineReady,
        onImportFile: importFileAction,
        onCancelImport: cancelImportAction,
        onConfirmImport: confirmImportAction,
        importPreview,
        importError,
      }),
    );
  } else if (state.screen === 'progress') {
    root.appendChild(renderProgress(state, { onHome: progressToHome }));
  } else if (state.screen === 'study') {
    root.appendChild(
      renderStudy(state, {
        onHome: closeStudyScreen,
        onSelectFamily: pickStudyFamily,
        onOpenLesson: openStudyLesson,
        onCloseLesson: closeStudyLesson,
        onAnswerQuestion: answerStudyQuestion,
        onRevealCard: revealStudyCard,
        onReviewCard: reviewStudyCard,
      }),
    );
  } else if (state.screen === 'reference') {
    root.appendChild(
      renderReference(state, {
        onClose: closeReferenceScreen,
        onSearch: searchReferenceAction,
        query: referenceQuery,
      }),
    );
  } else if (state.screen === 'mission') {
    root.appendChild(
      renderMission(
        state,
        {
          onExit: exitToHome,
          onRetrySave: retrySave,
          onExportBackup: exportBackupAction,
          onTabChange: changeMissionTab,
          onSelectDevice: pickDevice,
          onSelectLink: pickLink,
          onChooseReconnectSource: chooseSource,
          onConfirmReconnect: confirmReconnectFlow,
          onCancelReconnect: cancelReconnectFlow,
          onDisconnectLink: disconnectLinkAction,
          onRequestReset: requestResetAction,
          onConfirmReset: confirmResetAction,
          onCancelReset: cancelResetAction,
          onOpenReference: openReferenceScreen,
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

// Retries whatever the last failure actually was: a mission autosave writes
// both profile and mission together (persistMission/persistProfileAndMission
// use saveMission/saveLocal), so retrying with saveProfile alone would leave
// a still-unsaved mission looking falsely resolved. Saving both here covers
// every failure site with one Retry action.
async function retrySave() {
  state = { ...state, saveStatus: 'saving' };
  render();
  try {
    if (state.mission) {
      await store.saveLocal(state.profile, state.mission);
    } else {
      await store.saveProfile(state.profile);
    }
    state = { ...state, saveStatus: 'saved' };
  } catch (error) {
    state = { ...state, saveStatus: isQuotaExceeded(error) ? 'quota' : 'error' };
  }
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
  } catch (error) {
    state = { ...state, saveStatus: isQuotaExceeded(error) ? 'quota' : 'error' };
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
  } catch (error) {
    state = { ...state, saveStatus: isQuotaExceeded(error) ? 'quota' : 'error' };
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

function openStudyScreen() {
  state = openStudy(state);
  render();
}

function closeStudyScreen() {
  state = closeStudy(state);
  render();
}

function pickStudyFamily(family) {
  state = selectStudyFamily(state, family);
  render();
}

function openStudyLesson(lessonId) {
  state = openLesson(state, lessonId);
  render();
}

function closeStudyLesson() {
  state = closeLesson(state);
  render();
}

async function answerStudyQuestion(questionId, optionId) {
  const { studyAnswers } = recordStudyAnswer(state.profile, questionId, optionId);
  state = await updateAndPersistProfile(state, store, { studyAnswers });
  render();
}

function revealStudyCard(cardId) {
  state = revealCard(state, cardId);
  render();
}

async function reviewStudyCard(cardId, remembered) {
  const { cardReviews } = recordCardReview(state.profile, cardId, remembered);
  state = await updateAndPersistProfile(state, store, { cardReviews });
  render();
}

// Reachable from Home or from within a mission (MASTER_DESIGN.md §7's
// per-mission "Reference" bottom action); opening it during an active
// repair mission marks the run assisted (app.js's openReference), then
// navigation returns to whichever screen it was opened from, leaving that
// screen's own state (mission tab, selection, drafts) untouched.
function openReferenceScreen() {
  const hadRepairMission = state.mission?.mode === 'repair' && state.mission.status === 'active';
  state = openReference(state);
  screenBeforeReference = state.screen;
  referenceQuery = '';
  state = { ...state, screen: 'reference' };
  render();
  if (hadRepairMission) persistMission();
}

function closeReferenceScreen() {
  state = { ...state, screen: screenBeforeReference };
  render();
}

function searchReferenceAction(query) {
  referenceQuery = query;
  render();
}

// Export/import (S17.md). Export is a plain versioned JSON Blob download —
// no executable content, network requests or secrets, just the same object
// store.exportData() already returns. A download failing (e.g. Blob/URL
// unsupported) is surfaced as an import-area error rather than thrown.
async function exportBackupAction() {
  try {
    const backup = await store.exportData();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `the-field-solo-backup-${backup.exportedAt.replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    importError = 'Could not export a backup.';
    render();
  }
}

// Parses and validates without touching storage; only sets up the preview
// (S17.md: "show preview counts and replacement notice" before any
// replacement — Replace is a separate, explicit action).
async function importFileAction(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    importError = 'Could not read that file.';
    importPreview = null;
    importBackup = null;
    render();
    return;
  }
  const result = previewBackup(text);
  if (!result.ok) {
    importError = result.error;
    importPreview = null;
    importBackup = null;
  } else {
    importError = null;
    importPreview = result;
    importBackup = result.backup;
  }
  render();
}

function cancelImportAction() {
  importPreview = null;
  importBackup = null;
  importError = null;
  render();
}

// Restore requires this explicit call (S17.md acceptance) — previewing
// alone (importFileAction) never touches storage. On success, reloads the
// page (S17.md: "reload validated state") so every piece of in-memory state
// — not just profile/mission, but terminal sessions, the reconnect flow,
// missionTab and the rest — starts completely fresh from what was just
// installed, the same guarantee an actual restart gives.
async function confirmImportAction() {
  const result = await store.replaceData(importBackup);
  if (!result.ok) {
    importPreview = null;
    importBackup = null;
    importError = result.error;
    render();
    return;
  }
  window.location.reload();
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

// UI_AND_STORAGE.md: "On failure ... block closing that mission through
// in-app navigation until handled" — a save failure (quota or otherwise)
// keeps the mission on screen with its Retry/Export prompt until the
// learner resolves it, rather than silently losing the unsaved change.
function exitToHome() {
  if (state.saveStatus === 'error' || state.saveStatus === 'quota') {
    state = { ...state, error: 'Resolve the save failure above before leaving this job.' };
    render();
    return;
  }
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

function disconnectLinkAction(linkId) {
  const { state: nextState, result } = disconnectLink(state, linkId);
  state = result.ok ? { ...nextState, error: null } : { ...state, error: result.message || 'Could not disconnect that cable.' };
  render();
  if (result.ok) persistMission();
}

function requestResetAction() {
  state = requestReset(state);
  render();
}

function cancelResetAction() {
  state = cancelReset(state);
  render();
}

function confirmResetAction() {
  state = confirmReset(state);
  render();
  persistMission();
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

// Manual registration (vite.config.ts's registerType: 'prompt',
// injectRegister: false) — the auto-injected script would call
// skipWaiting()/reload the instant an update installs; this instead only
// flips a flag and waits for reloadForUpdate to be invoked explicitly.
// `virtual:pwa-register` only resolves in a PWA-enabled build (plain
// `vite dev`/a non-PWA build has no service worker at all), so a failed
// import just means there is no offline/update behavior to wire up.
async function setupServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) return;
  // onOfflineReady only fires the moment precaching first completes, not on
  // every later load — a page already controlled by an active worker from a
  // prior visit is just as ready offline, so that state needs checking too.
  if (navigator.serviceWorker.controller) {
    offlineReady = true;
    render();
  }
  try {
    const { registerSW } = await import('virtual:pwa-register');
    updateServiceWorkerFn = registerSW({
      immediate: true,
      onOfflineReady() {
        offlineReady = true;
        render();
      },
      onNeedRefresh() {
        updateAvailable = true;
        render();
      },
    });
  } catch {
    // No installed PWA plugin/service worker in this build — nothing to do.
  }
}

// S19.md: "Queue update activation until current state is saved and user
// chooses Reload." Flushes whatever the active screen would otherwise still
// be autosaving before handing control to the new service worker, so an
// update never races an in-flight save.
async function reloadForUpdate() {
  try {
    if (state.mission) {
      await store.saveLocal(state.profile, state.mission);
    } else if (state.profile) {
      await store.saveProfile(state.profile);
    }
  } catch {
    // A failed final flush still shouldn't block the update the learner
    // explicitly asked for; whatever synced before this point is safe.
  }
  updateAvailable = false;
  await updateServiceWorkerFn?.();
}

async function start() {
  state = await boot(store);
  render();
  setupServiceWorkerRegistration();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
