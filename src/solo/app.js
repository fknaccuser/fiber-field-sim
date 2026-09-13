// Pure, DOM-free application state and transitions for The Field Solo shell.
// main.js is the only module allowed to touch `document`.

import { createHealthyLayout } from './layouts.js';
import { cloneNetwork } from './model.js';
import { applyAction } from './actions.js';

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
    // Transient flows kept in app state (not in UI_AND_STORAGE.md's abbreviated
    // App state list) so a full re-render never loses them, the same way
    // terminalSessions must survive re-renders: "reconnect" tracks the
    // tap-cable-then-source-then-destination flow (S08).
    reconnect: null,
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
    reconnect: null,
    error: null,
  };
}

export function exitMission(state) {
  return {
    ...state,
    screen: 'home',
    mission: null,
    selectedDeviceId: null,
    recentDevices: [],
    reconnect: null,
    error: null,
  };
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
  return { ...state, selectedDeviceId: deviceId, recentDevices, error: null };
}

// The specific entity an action touches, before/after — not the whole network
// (DATA_CONTRACTS.md's 500-event budget rules out huge per-event snapshots).
function extractEntity(network, action) {
  switch (action.type) {
    case 'setLinkConnected':
    case 'moveCable':
      return network.links.find((l) => l.id === action.linkId) ?? null;
    case 'setPortAdmin':
    case 'setAccessVlan':
    case 'setTrunkAllowedVlans':
      return network.ports.find((p) => p.id === action.portId) ?? null;
    case 'setClientAddress':
    case 'setClientGateway':
    case 'setClientDns':
      return network.devices.find((d) => d.id === action.deviceId) ?? null;
    case 'setRouterSegmentAddress': {
      const device = network.devices.find((d) => d.id === action.deviceId);
      return (
        device?.routerSegments?.find((s) => s.portId === action.portId && s.vlanId === (action.vlanId ?? null)) ??
        null
      );
    }
    case 'setDnsRecord':
      return network.dnsRecords.find((r) => r.serverId === action.serverId && r.name === action.name) ?? null;
    default:
      return null;
  }
}

function nextEventId(mission) {
  return mission.compactedEventCount + mission.events.length;
}

function appendChangeEvent(mission, action, before, after, deviceId) {
  const index = nextEventId(mission);
  const event = {
    id: String(index),
    index,
    kind: 'change',
    revision: after.revision,
    deviceId: deviceId ?? undefined,
    details: { action, before: extractEntity(before, action), after: extractEntity(after, action) },
    assistance: false,
  };
  return { ...mission, events: [...mission.events, event] };
}

// Dispatches a batch of actions through applyAction only (DATA_CONTRACTS.md/
// S08.md), atomically from the caller's point of view: on the first rejected
// action, the original state is returned untouched — "invalid input preserves
// the prior network" — and every accepted change appends its own event.
export function applyMissionActions(state, actions, { deviceId = null } = {}) {
  if (!state.mission || actions.length === 0) {
    return { state, result: { ok: true } };
  }
  let network = state.mission.network;
  let mission = state.mission;
  for (const action of actions) {
    const before = network;
    const result = applyAction(network, action);
    if (!result.ok) {
      return { state, result: { ok: false, code: result.code, message: result.message } };
    }
    network = result.state;
    if (network.revision !== before.revision) {
      mission = appendChangeEvent(mission, action, before, network, deviceId);
    }
  }
  mission = { ...mission, network };
  return { state: { ...state, mission }, result: { ok: true } };
}

export function beginReconnect(state, linkId) {
  if (!state.mission) return state;
  const exists = state.mission.network.links.some((l) => l.id === linkId);
  if (!exists) return state;
  return { ...state, reconnect: { linkId, sourcePortId: null }, error: null };
}

export function chooseReconnectSource(state, portId) {
  if (!state.reconnect) return state;
  return { ...state, reconnect: { ...state.reconnect, sourcePortId: portId }, error: null };
}

export function cancelReconnect(state) {
  return { ...state, reconnect: null, error: null };
}

export function confirmReconnect(state, destinationPortId) {
  if (!state.reconnect?.sourcePortId || !state.mission) {
    return { state, result: { ok: false, code: 'INVALID_STATE', message: 'No reconnect in progress.' } };
  }
  const { linkId, sourcePortId } = state.reconnect;
  const link = state.mission.network.links.find((l) => l.id === linkId);
  const actions = [];
  // moveCable has no `connected` field (ENGINE_RULES.md's Action envelope) and
  // is a no-op when the endpoints don't change, so tapping Connect on an
  // unplugged-but-correctly-wired cable (P1) would otherwise leave it
  // unplugged. "Connect" always means plugged in at the chosen endpoints,
  // whether or not they differ from the current ones.
  if (link && (link.aPortId !== sourcePortId || link.bPortId !== destinationPortId)) {
    actions.push({ type: 'moveCable', linkId, aPortId: sourcePortId, bPortId: destinationPortId });
  }
  if (!link || !link.connected) {
    actions.push({ type: 'setLinkConnected', linkId, connected: true });
  }
  const { state: nextState, result } = applyMissionActions(state, actions);
  if (!result.ok) {
    return { state: nextState, result };
  }
  return { state: { ...nextState, reconnect: null }, result };
}

function nextTestEventId(mission) {
  return nextEventId(mission);
}

// Records a 'test' event for a run through forward.js (canReach/resolveName/
// testService all share the {ok,code,trace} shape well enough to log directly).
export function recordTestEvent(state, testKind, targetDeviceId, testResult) {
  if (!state.mission) return state;
  const index = nextTestEventId(state.mission);
  const event = {
    id: String(index),
    index,
    kind: 'test',
    revision: state.mission.network.revision,
    deviceId: targetDeviceId,
    details: { testKind, target: targetDeviceId, result: testResult },
    assistance: false,
  };
  return { ...state, mission: { ...state.mission, events: [...state.mission.events, event] } };
}
