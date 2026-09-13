// Pure, DOM-free application state and transitions for The Field Solo shell.
// main.js is the only module allowed to touch `document`.

import { createHealthyLayout } from './layouts.js';
import { cloneNetwork } from './model.js';

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

function subnetOf(ip) {
  return `${ip.split('.').slice(0, 3).join('.')}.0`;
}

// Configure mode (MASTER_DESIGN.md §2: "free configuration of a provided
// healthy network") uses the same Attempt shape as a repair mission
// (DATA_CONTRACTS.md "Attempt creation"), mode:"configure", no fault: network
// starts identical to initialNetwork. Full fault-driven missions (mode:"repair")
// are generateCase's job, a later task.
export function createConfigureAttempt(layoutId, { x = 42, host = 130, label = 'plain' } = {}) {
  const network = createHealthyLayout(layoutId, x, host, label);
  const pc1 = network.devices.find((d) => d.id === 'PC1');
  const pc2 = network.devices.find((d) => d.id === 'PC2');
  const pc1Port = network.ports.find((p) => p.deviceId === 'PC1');
  const pc2Port = network.ports.find((p) => p.deviceId === 'PC2');
  return {
    schema: 1,
    id: crypto.randomUUID(),
    caseCode: null,
    initialNetwork: cloneNetwork(network),
    network,
    recipeIds: [],
    targetClientId: 'PC1',
    protectedClientId: 'PC2',
    targetName: 'portal.northline.test',
    startedAt: new Date().toISOString(),
    elapsedMs: 0,
    assisted: false,
    events: [],
    selectedFindingIds: [],
    completionNote: null,
    status: 'active',
    mode: 'configure',
    requirements: {
      targetSubnet: subnetOf(pc1.ip),
      targetPrefix: 24,
      targetVlan: pc1Port.accessVlan,
      protectedSubnet: subnetOf(pc2.ip),
      protectedPrefix: 24,
      protectedVlan: pc2Port.accessVlan,
      portalServerId: 'S1',
    },
    hintLevels: {},
    compactedEventCount: 0,
  };
}

const KNOWN_LAYOUTS = new Set(['HM', 'BR', 'OF']);

export function startConfigureSession(state, layoutId) {
  if (!KNOWN_LAYOUTS.has(layoutId)) return state;
  return {
    ...state,
    screen: 'mission',
    mission: createConfigureAttempt(layoutId),
    selectedDeviceId: null,
    recentDevices: [],
  };
}

export function exitMission(state) {
  return { ...state, screen: 'home', mission: null, selectedDeviceId: null, recentDevices: [] };
}

const RECENT_DEVICES_LIMIT = 4;

export function selectDevice(state, deviceId) {
  if (!state.mission) return state;
  const exists = state.mission.network.devices.some((d) => d.id === deviceId);
  if (!exists) return state;
  const recentDevices = [deviceId, ...state.recentDevices.filter((id) => id !== deviceId)].slice(
    0,
    RECENT_DEVICES_LIMIT,
  );
  return { ...state, selectedDeviceId: deviceId, recentDevices };
}
