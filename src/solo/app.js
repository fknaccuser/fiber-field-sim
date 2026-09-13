// Pure, DOM-free application state and transitions for The Field Solo shell.
// main.js is the only module allowed to touch `document`.

export function createInitialState() {
  return {
    screen: 'opening',
    selectedDeviceId: null,
    recentDevices: [],
    terminalSessions: {},
    mission: null,
    profile: null,
    studySession: null,
    saveStatus: 'idle',
    error: null,
  };
}

export function normalizeCommand(rawText) {
  return String(rawText ?? '').trim().toLowerCase();
}

export function submitOpeningCommand(state, rawText) {
  if (state.screen !== 'opening') {
    return state;
  }
  if (normalizeCommand(rawText) === 'enable') {
    return { ...state, screen: 'initializing', error: null };
  }
  return { ...state, error: 'Command not recognized.' };
}

export function completeInitialization(state) {
  if (state.screen !== 'initializing') {
    return state;
  }
  return { ...state, screen: 'home', error: null };
}
