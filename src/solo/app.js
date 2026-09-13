// Pure, DOM-free application state and transitions for The Field Solo shell.
// main.js is the only module allowed to touch `document`.

import { createHealthyLayout, deriveRequirements } from './layouts.js';
import { cloneNetwork } from './model.js';
import { applyAction } from './actions.js';
import { createTerminalSession } from './cli.js';
import { generateCase, nextCase, fingerprintForCode } from './generate.js';
import { inSubnet } from './ip.js';

export const RECOMMENDED_CODE = 'TF1-HM-1-P-START';
const RECENT_FINGERPRINT_LIMIT = 20;

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
    // tap-cable-then-source-then-destination flow (S08); "pendingMissionRequest"
    // gates starting a new mission (repair or configure) behind an explicit
    // Resume/Replace choice when one is already active (S11).
    reconnect: null,
    pendingMissionRequest: null,
    // Wall-clock timestamp (Date.now()) the mission was last (re)entered, or
    // null while paused; main.js supplies `now` so this file never calls the
    // clock itself. Elapsed time accrues only between resume and pause
    // (S12.md: "Paused app time does not increase active elapsed time").
    sessionResumedAt: null,
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

// Configure mode (MASTER_DESIGN.md §2: "free configuration of a provided
// healthy network") uses the same Attempt shape as a repair mission
// (DATA_CONTRACTS.md "Attempt creation"), mode:"configure", no fault: network
// starts identical to initialNetwork. Fault-driven missions (mode:"repair")
// are generate.js's generateCase (S10).
export function createConfigureAttempt(layoutId, { x = 42, host = 130, label = 'plain' } = {}) {
  const network = createHealthyLayout(layoutId, x, host, label);
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
    requirements: deriveRequirements(network),
    hintLevels: {},
    compactedEventCount: 0,
  };
}

const KNOWN_LAYOUTS = new Set(['HM', 'BR', 'OF']);

export function startConfigureSession(state, layoutId) {
  if (!KNOWN_LAYOUTS.has(layoutId)) return state;
  if (state.mission && state.mission.status === 'active') {
    return { ...state, pendingMissionRequest: { kind: 'configure', layoutId }, error: null };
  }
  return startConfigureNow(state, layoutId);
}

// Exit returns to Home without abandoning the mission — it stays the one
// active mission, resumable via Continue with its current device selection
// and history intact (MASTER_DESIGN.md §10: "Resume keeps the scenario,
// current device, input draft and history"). Only an explicit replace or
// completion (grade.js, a later task) actually ends a mission.
// Elapsed time accrues only while sessionResumedAt is set; pausing folds the
// active delta into mission.elapsedMs and clears it. `now` is always supplied
// by the caller (main.js), never read here (ENGINE_RULES.md's "Application
// code supplies elapsed time" convention, applied here too for testability).
export function pauseMissionTimer(state, now = Date.now()) {
  if (state.sessionResumedAt == null || !state.mission) return state;
  const delta = Math.max(0, now - state.sessionResumedAt);
  return {
    ...state,
    sessionResumedAt: null,
    mission: { ...state.mission, elapsedMs: state.mission.elapsedMs + delta },
  };
}

export function resumeMissionTimer(state, now = Date.now()) {
  if (!state.mission || state.sessionResumedAt != null) return state;
  return { ...state, sessionResumedAt: now };
}

// Leaving the workspace pauses elapsed time automatically (MASTER_DESIGN.md
// §10); the mission itself stays active and resumable (see exitMission's own
// note above about not discarding it).
export function exitMission(state, now = Date.now()) {
  return {
    ...pauseMissionTimer(state, now),
    screen: 'home',
    reconnect: null,
    pendingMissionRequest: null,
    error: null,
  };
}

export function resumeMission(state, now = Date.now()) {
  if (!state.mission) return state;
  return resumeMissionTimer({ ...state, screen: 'mission', error: null }, now);
}

// Records the fingerprint of a freshly started (non-replay) case into the
// profile's freshness history, capped at 20 (SCENARIOS.md: "rejecting a
// complete fingerprint found in the last 20 runs"). "Replays do not consume
// freshness history as new distinct causes" — replayMission never calls this.
function recordFingerprint(state, caseCode) {
  let fingerprint;
  try {
    fingerprint = fingerprintForCode(caseCode);
  } catch {
    return state;
  }
  const recentFingerprints = [fingerprint, ...(state.profile.recentFingerprints ?? [])].slice(
    0,
    RECENT_FINGERPRINT_LIMIT,
  );
  return { ...state, profile: { ...state.profile, recentFingerprints } };
}

function enterMission(state, attempt, now = Date.now()) {
  return {
    ...state,
    screen: 'mission',
    mission: { ...attempt, id: crypto.randomUUID(), startedAt: new Date().toISOString() },
    selectedDeviceId: null,
    recentDevices: [],
    reconnect: null,
    pendingMissionRequest: null,
    error: null,
    sessionResumedAt: now,
  };
}

function startCaseNow(state, caseCode) {
  let attempt;
  try {
    attempt = generateCase(caseCode);
  } catch (error) {
    return { ...state, pendingMissionRequest: null, error: error.message };
  }
  return recordFingerprint(enterMission(state, attempt), caseCode);
}

function startConfigureNow(state, layoutId) {
  if (!KNOWN_LAYOUTS.has(layoutId)) return { ...state, pendingMissionRequest: null };
  return enterMission(state, createConfigureAttempt(layoutId));
}

// Starts a case by code, generating it fresh. If a mission is already active,
// defers to an explicit Resume/Replace choice instead of silently discarding
// it (S11.md: "Protect the single active mission with explicit Resume/Replace
// choices"). An invalid code leaves the active mission untouched and reports
// the specific error.
export function attemptStartMission(state, caseCode) {
  if (state.mission && state.mission.status === 'active') {
    return { ...state, pendingMissionRequest: { kind: 'code', caseCode }, error: null };
  }
  return startCaseNow(state, caseCode);
}

export function confirmReplaceMission(state) {
  const request = state.pendingMissionRequest;
  if (!request) return state;
  if (request.kind === 'code') return startCaseNow(state, request.caseCode);
  if (request.kind === 'configure') return startConfigureNow(state, request.layoutId);
  return { ...state, pendingMissionRequest: null };
}

export function cancelReplaceMission(state) {
  return { ...state, pendingMissionRequest: null, error: null };
}

// Exact replay: same code, same deterministic faulted initial state, but a
// new attempt id — and, per SCENARIOS.md, never counted as a new distinct
// cause in the freshness history.
export function replayMission(state) {
  if (!state.mission?.caseCode) return state;
  let attempt;
  try {
    attempt = generateCase(state.mission.caseCode);
  } catch (error) {
    return { ...state, error: error.message };
  }
  return enterMission(state, attempt);
}

// New variation: a fresh local seed via candidateSeed, deduplicated against
// the profile's recent fingerprints. candidateSeed is supplied here (the
// application layer), never called by generate.js's nextCase itself.
export function startNewVariation(state, layout, tier, family) {
  const candidateSeed = () => Math.random().toString(36).slice(2, 10);
  let code;
  try {
    code = nextCase({ layout, tier, family, candidateSeed }, state.profile.recentFingerprints ?? []);
  } catch (error) {
    return { ...state, error: error.message };
  }
  return attemptStartMission(state, code);
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

// Selecting another device maintains a separate terminal mode and output
// history (UI_AND_STORAGE.md): sessions are keyed by deviceId and created on
// first use.
export function terminalSessionFor(state, deviceId, deviceKind) {
  return state.terminalSessions[deviceId] ?? createTerminalSession(deviceId, deviceKind);
}

export function setTerminalSession(state, deviceId, terminal) {
  return { ...state, terminalSessions: { ...state.terminalSessions, [deviceId]: terminal } };
}

// Marks the given device's terminal session as builder-originated without
// otherwise touching it (UI_AND_STORAGE.md/ENGINE_RULES.md: "Builder insertion
// sets provenance; manual edits retain it until submission/clear").
export function markTerminalBuilderOrigin(state, deviceId, deviceKind) {
  const session = terminalSessionFor(state, deviceId, deviceKind);
  return setTerminalSession(state, deviceId, { ...session, builderOrigin: true });
}

// --- Tiered guidance (S12) ---

// Whether a specific recipe's fault is currently fixed, derived only from
// data already on the Attempt (current network + requirements) — no separate
// stored "healthy" snapshot is needed, since every recipe's correct value is
// independently recoverable: the server's own address is never corrupted by
// any recipe, so it's always available as the true DNS/portal target, and
// the router's real target-segment address is always findable by VLAN.
export function isRecipeRepaired(mission, recipeId) {
  const network = mission.network;
  const requirements = mission.requirements;
  const pc1 = network.devices.find((d) => d.id === mission.targetClientId);
  const pc1OwnPort = network.ports.find((p) => p.deviceId === mission.targetClientId);
  const link = network.links.find((l) => l.aPortId === pc1OwnPort.id || l.bPortId === pc1OwnPort.id);
  const switchPortId = link ? (link.aPortId === pc1OwnPort.id ? link.bPortId : link.aPortId) : null;
  const switchPort = switchPortId ? network.ports.find((p) => p.id === switchPortId) : null;
  const server = network.devices.find((d) => d.id === requirements.portalServerId);
  switch (recipeId) {
    case 'P1':
      return Boolean(link?.connected);
    case 'P2':
      return switchPort?.adminUp === true;
    case 'I1':
      return inSubnet(pc1.ip, requirements.targetSubnet, requirements.targetPrefix);
    case 'I2': {
      const router = network.devices.find((d) => d.kind === 'router');
      const targetSegment = router?.routerSegments?.find((s) => s.vlanId === requirements.targetVlan);
      return targetSegment != null && pc1.gateway === targetSegment.ip;
    }
    case 'V1':
      return switchPort?.mode === 'access' && switchPort.accessVlan === requirements.targetVlan;
    case 'V2': {
      const trunkPort = switchPort
        ? network.ports.find((p) => p.mode === 'trunk' && p.deviceId === switchPort.deviceId)
        : null;
      return Boolean(trunkPort?.allowedVlans.includes(requirements.targetVlan));
    }
    case 'D1':
      return pc1.dns === server?.ip;
    case 'D2': {
      const record = network.dnsRecords.find((r) => r.name === mission.targetName);
      return record?.address === server?.ip;
    }
    default:
      return false;
  }
}

// Hints target the earliest still-broken fault in the case's own recipe pair
// order (SCENARIOS.md: "request hints for the earliest still-unresolved
// recipe according to pair order"); once it's fixed, requesting hints again
// progresses to the remaining fault (S12.md acceptance, tier4).
export function currentHintRecipeId(mission) {
  for (const recipeId of mission.recipeIds) {
    if (!isRecipeRepaired(mission, recipeId)) return recipeId;
  }
  return mission.recipeIds[mission.recipeIds.length - 1];
}

const MAX_HINT_LEVEL = 3;

// Requesting a hint (any level) marks the run assisted and records a
// distinct assistance event; ordinary CLI `?` never does (cli.js has no path
// that calls this). Hints remain available at every tier including 4.
export function requestHint(state) {
  if (!state.mission) return state;
  const recipeId = currentHintRecipeId(state.mission);
  const currentLevel = state.mission.hintLevels[recipeId] ?? 0;
  const level = Math.min(currentLevel + 1, MAX_HINT_LEVEL);
  const mission = state.mission;
  const index = mission.compactedEventCount + mission.events.length;
  const event = {
    id: String(index),
    index,
    kind: 'assistance',
    revision: mission.network.revision,
    deviceId: mission.targetClientId,
    details: { type: 'hint', recipeId, level },
    assistance: true,
  };
  return {
    ...state,
    mission: {
      ...mission,
      hintLevels: { ...mission.hintLevels, [recipeId]: level },
      assisted: true,
      events: [...mission.events, event],
    },
  };
}

export function showCauseCount(mission) {
  return mission.mode !== 'repair' || mission.tier <= 2;
}

export function showHarmlessDetail(mission) {
  return mission.mode === 'repair' && mission.tier === 3;
}
