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

export function createInitialProfile() {
  return {
    schema: 1,
    openingEnabled: true,
    textScale: 1,
    completedRuns: [],
    studyAnswers: [],
    cardReviews: [],
    recentFingerprints: [],
    counters: { runs: 0, assisted: 0, independent: 0 },
    evidence: { P: {}, I: {}, V: {}, D: {} },
    countedAttemptIds: [],
  };
}

// Loads the saved profile/mission through `store`, creating and persisting an
// initial profile when none exists yet. Honors the skip-opening preference by
// starting straight on Home instead of the opening screen.
export async function boot(store) {
  let state = createInitialState();
  let profile = null;
  let mission = null;
  try {
    const loaded = await store.loadLocal();
    profile = loaded.profile;
    mission = loaded.mission;
  } catch {
    profile = null;
    mission = null;
  }
  if (!profile) {
    profile = createInitialProfile();
    try {
      await store.saveProfile(profile);
    } catch {
      // Nothing was persisted yet, so there is nothing to retry losing here;
      // the fresh in-memory profile still lets the session continue.
    }
  }
  state = { ...state, profile, mission };
  if (profile.openingEnabled === false) {
    state = { ...state, screen: 'home' };
  }
  return state;
}

// Pure: applies a profile change to in-memory state and marks it saving.
// Does not touch storage.
export function applyProfileUpdate(state, updates) {
  return {
    ...state,
    profile: { ...state.profile, ...updates },
    saveStatus: 'saving',
    error: null,
  };
}

// Persists the current in-memory profile. Safe to call again as a Retry:
// it re-attempts the save without re-deriving the update.
export async function persistProfile(state, store) {
  try {
    await store.saveProfile(state.profile);
    return { ...state, saveStatus: 'saved' };
  } catch {
    return { ...state, saveStatus: 'error', error: 'Save failed' };
  }
}

export async function updateAndPersistProfile(state, store, updates) {
  return persistProfile(applyProfileUpdate(state, updates), store);
}
