/**
 * The session runner: a pure reducer from (SessionState, Intent) to a new SessionState
 * plus a UI-facing result. It is the only thing that calls the pure instruments with
 * trainee-driven settings, enforces presence/inventory rules first, and records every
 * action for the replay. Never mutates its input.
 */
import { cloneWorld, findNode } from '../world';
import type { CustomerReport, PlantRecord, WorldState } from '../world';
import { trace } from '../instruments/otdr';
import type { OtdrTraceResult, PublicOtdrTraceResult } from '../instruments/otdr';
import { read as powerMeterRead } from '../instruments/powerMeter/powerMeter';
import { inspect as vflInspect } from '../instruments/vfl/vfl';
import type { VflLeakKind } from '../instruments/vfl/vfl';
import { inspect as scopeInspect } from '../instruments/inspectionScope/inspectionScope';
import { execute as cliExecute } from '../instruments/cli';
import type { CliResult, CliSession } from '../instruments/cli';
import { scoreSession } from '../scoring/score';
import type { ScoreReport } from '../scoring/types';
import { CUSTOMER_CONTACT_SECONDS, EXCAVATE_SECONDS, HINT_POLICY, HINT_SECONDS, RECORDS_SECONDS } from './costs';
import { checkPresence, travelTimeSeconds } from './location';
import { lookupRecords } from './records';
import type { ActionEvent, Intent, ScenarioMeta, SessionState } from './types';

export type PerformResult =
  | { type: 'otdr-shot'; result: Omit<OtdrTraceResult, 'hidden'> }
  | { type: 'power-meter'; dbm: number | null }
  | { type: 'vfl'; leaks: Array<{ positionMeters: number; kind: VflLeakKind }> }
  | { type: 'scope'; grade: 'pass' | 'fail'; zones: { core: number; cladding: number; adhesive: number; contact: number } }
  | { type: 'cli'; result: CliResult }
  | { type: 'truck-roll' }
  | { type: 'records'; records: PlantRecord[] }
  | { type: 'customer-contact'; report: CustomerReport }
  | { type: 'hint'; text: string | null }
  | { type: 'excavate'; strike: boolean }
  | { type: 'diagnosis'; report: ScoreReport }
  | { type: 'refused'; reason: string };

export function startSession(world: WorldState, profiles: SessionState['profiles'], meta: ScenarioMeta): SessionState {
  return {
    meta,
    world,
    initialWorld: cloneWorld(world),
    profiles,
    clockSeconds: 0,
    locationNodeId: meta.startLocationNodeId,
    log: [],
    blobs: {},
    hintsUsed: 0,
    cliSessions: {},
    ended: null,
  };
}

function nextActionBase(state: SessionState): Pick<ActionEvent, 'id' | 'index' | 'atSimSeconds' | 'locationNodeId'> {
  return { id: `a${state.log.length}`, index: state.log.length, atSimSeconds: state.clockSeconds, locationNodeId: state.locationNodeId };
}

function appendAction(state: SessionState, action: ActionEvent, worldOverride?: WorldState): SessionState {
  return { ...state, world: worldOverride ?? state.world, log: [...state.log, action], clockSeconds: state.clockSeconds + action.durationSeconds };
}

function refuse(state: SessionState, intent: Intent, reason: string): { state: SessionState; result: PerformResult } {
  const action: ActionEvent = { ...nextActionBase(state), durationSeconds: 0, type: 'refused', intent, reason };
  return { state: appendAction(state, action), result: { type: 'refused', reason } };
}

interface InventoryCheck {
  ok: boolean;
  reason?: string;
}

function checkInventory(world: WorldState, intent: Intent): InventoryCheck {
  switch (intent.type) {
    case 'otdr-shot': {
      if (!world.truckInventory.includes('otdr')) return { ok: false, reason: 'no OTDR in the truck' };
      if (intent.settings.launchCableMeters > 0) {
        const needed = intent.settings.launchCableMeters;
        const has = world.truckInventory.some((item) => {
          const m = /^launch-cable-(\d+)m$/.exec(item);
          return m !== null && Number(m[1]) >= needed;
        });
        if (!has) return { ok: false, reason: `no launch cable of at least ${needed}m in the truck` };
      }
      return { ok: true };
    }
    case 'power-meter':
      return world.truckInventory.includes('power-meter') ? { ok: true } : { ok: false, reason: 'no power meter in the truck' };
    case 'vfl':
      return world.truckInventory.includes('vfl') ? { ok: true } : { ok: false, reason: 'no VFL in the truck' };
    case 'scope':
      return world.truckInventory.includes('inspection-scope') ? { ok: true } : { ok: false, reason: 'no inspection scope in the truck' };
    default:
      return { ok: true };
  }
}

export function perform(state: SessionState, intent: Intent): { state: SessionState; result: PerformResult } {
  if (state.ended) {
    return { state, result: { type: 'refused', reason: 'scenario has ended' } };
  }

  const presence = checkPresence(state.world, state.meta, state.locationNodeId, intent);
  if (!presence.ok) return refuse(state, intent, presence.reason!);

  const inventory = checkInventory(state.world, intent);
  if (!inventory.ok) return refuse(state, intent, inventory.reason!);

  switch (intent.type) {
    case 'otdr-shot':
      return performOtdrShot(state, intent);
    case 'power-meter':
      return performPowerMeter(state, intent);
    case 'vfl':
      return performVfl(state, intent);
    case 'scope':
      return performScope(state, intent);
    case 'cli':
      return performCli(state, intent);
    case 'truck-roll':
      return performTruckRoll(state, intent);
    case 'records':
      return performRecords(state, intent);
    case 'customer-contact':
      return performCustomerContact(state, intent);
    case 'hint':
      return performHint(state, intent);
    case 'excavate':
      return performExcavate(state, intent);
    case 'diagnosis':
      return performDiagnosis(state, intent);
  }
}

function performOtdrShot(state: SessionState, intent: Extract<Intent, { type: 'otdr-shot' }>) {
  const result = trace(state.world, { network: state.profiles.network, otdrInstrument: state.profiles.otdrInstrument }, intent.access, intent.settings);
  const traceRef = `trace:${state.log.length}`;
  const action: ActionEvent = {
    ...nextActionBase(state),
    durationSeconds: result.simulatedSecondsElapsed,
    type: 'otdr-shot',
    access: intent.access,
    settings: intent.settings,
    events: result.events,
    violations: result.violations,
    groundTruth: result.hidden.groundTruth,
    pathSpanIds: result.hidden.pathSpanIds,
    traceRef,
  };
  const nextState: SessionState = { ...appendAction(state, action), blobs: { ...state.blobs, [traceRef]: result } };
  const { hidden: _hidden, ...redacted } = result;
  return { state: nextState, result: { type: 'otdr-shot' as const, result: redacted } };
}

function performPowerMeter(state: SessionState, intent: Extract<Intent, { type: 'power-meter' }>) {
  const reading = powerMeterRead(state.world, state.profiles.network, intent.nodeId, intent.wavelengthNm);
  const action: ActionEvent = {
    ...nextActionBase(state),
    durationSeconds: reading.simulatedSeconds,
    type: 'power-meter',
    nodeId: intent.nodeId,
    wavelengthNm: intent.wavelengthNm,
    strand: intent.strand,
    dbm: reading.dbm,
  };
  return { state: appendAction(state, action), result: { type: 'power-meter' as const, dbm: reading.dbm } };
}

function performVfl(state: SessionState, intent: Extract<Intent, { type: 'vfl' }>) {
  const result = vflInspect(state.world, intent.spanId, intent.fromNodeId);
  const action: ActionEvent = { ...nextActionBase(state), durationSeconds: result.simulatedSeconds, type: 'vfl', spanId: intent.spanId, fromNodeId: intent.fromNodeId, leaks: result.leaks };
  return { state: appendAction(state, action), result: { type: 'vfl' as const, leaks: result.leaks } };
}

function performScope(state: SessionState, intent: Extract<Intent, { type: 'scope' }>) {
  const result = scopeInspect(state.world, intent.spanId, intent.eventId);
  const action: ActionEvent = { ...nextActionBase(state), durationSeconds: result.simulatedSeconds, type: 'scope', spanId: intent.spanId, eventId: intent.eventId, grade: result.grade, zones: result.zones };
  return { state: appendAction(state, action), result: { type: 'scope' as const, grade: result.grade, zones: result.zones } };
}

function performCli(state: SessionState, intent: Extract<Intent, { type: 'cli' }>) {
  const key = intent.endpoint.kind === 'device' ? `device:${intent.endpoint.deviceId}` : `host:${intent.endpoint.hostId}`;
  const existingSession: CliSession = state.cliSessions[key] ?? { endpoint: intent.endpoint, mode: 'user-exec' };
  const attemptCounter = state.log.length;
  const result = cliExecute(state.world, state.profiles, existingSession, intent.command, attemptCounter);
  const outputRef = `cli-output:${state.log.length}`;
  const action: ActionEvent = {
    ...nextActionBase(state),
    durationSeconds: result.simulatedSeconds,
    type: 'cli',
    endpoint: intent.endpoint,
    command: intent.command,
    recognized: result.recognized,
    handlerId: result.handlerId,
    facts: result.facts,
    outputRef,
  };
  const nextState: SessionState = {
    ...appendAction(state, action, result.world),
    cliSessions: { ...state.cliSessions, [key]: result.session },
    blobs: { ...state.blobs, [outputRef]: result.output },
  };
  return { state: nextState, result: { type: 'cli' as const, result } };
}

function performTruckRoll(state: SessionState, intent: Extract<Intent, { type: 'truck-roll' }>) {
  if (intent.toNodeId === state.locationNodeId) return refuse(state, intent, 'already there');
  const duration = travelTimeSeconds(state.meta, state.locationNodeId, intent.toNodeId);
  const action: ActionEvent = { ...nextActionBase(state), durationSeconds: duration, type: 'truck-roll', fromNodeId: state.locationNodeId, toNodeId: intent.toNodeId };
  const nextState: SessionState = { ...appendAction(state, action), locationNodeId: intent.toNodeId };
  return { state: nextState, result: { type: 'truck-roll' as const } };
}

function performRecords(state: SessionState, intent: Extract<Intent, { type: 'records' }>) {
  const records = lookupRecords(state.world, { nodeId: intent.nodeId, spanId: intent.spanId });
  const action: ActionEvent = { ...nextActionBase(state), durationSeconds: RECORDS_SECONDS, type: 'records', nodeId: intent.nodeId, spanId: intent.spanId, recordIds: records.map((r) => r.id) };
  return { state: appendAction(state, action), result: { type: 'records' as const, records } };
}

function performCustomerContact(state: SessionState, intent: Extract<Intent, { type: 'customer-contact' }>) {
  const report = state.world.customerReports.find((r) => r.customerId === intent.customerId);
  if (!report) return refuse(state, intent, `no customer report for ${intent.customerId}`);
  const action: ActionEvent = { ...nextActionBase(state), durationSeconds: CUSTOMER_CONTACT_SECONDS, type: 'customer-contact', customerId: intent.customerId, symptom: report.reportedSymptom };
  return { state: appendAction(state, action), result: { type: 'customer-contact' as const, report } };
}

function performHint(state: SessionState, _intent: Extract<Intent, { type: 'hint' }>) {
  const policy = HINT_POLICY[state.meta.tier];
  const level = state.hintsUsed;
  const text = state.meta.hints[level] ?? null;
  const refused = level >= policy.max || text === null;
  const cost = refused ? 0 : policy.cost;
  const action: ActionEvent = { ...nextActionBase(state), durationSeconds: HINT_SECONDS, type: 'hint', level, cost, text: text ?? '', refused };
  const nextState: SessionState = { ...appendAction(state, action), hintsUsed: refused ? state.hintsUsed : state.hintsUsed + 1 };
  return { state: nextState, result: { type: 'hint' as const, text: refused ? null : text } };
}

function performExcavate(state: SessionState, intent: Extract<Intent, { type: 'excavate' }>) {
  const node = findNode(state.world, intent.nodeId);
  const ticket = node.attributes?.locateTicket as { expired?: boolean } | undefined;
  const ticketValid = !!ticket && !ticket.expired;
  const strike = (intent.method === 'machine' && intent.distanceFromMarksInches < state.profiles.region.toleranceZoneInches) || !ticketValid;
  const action: ActionEvent = {
    ...nextActionBase(state),
    durationSeconds: EXCAVATE_SECONDS,
    type: 'excavate',
    nodeId: intent.nodeId,
    method: intent.method,
    distanceFromMarksInches: intent.distanceFromMarksInches,
    strike,
  };
  let nextState = appendAction(state, action);
  if (strike) nextState = { ...nextState, ended: { by: 'safety-strike', atSimSeconds: nextState.clockSeconds } };
  return { state: nextState, result: { type: 'excavate' as const, strike } };
}

function performDiagnosis(state: SessionState, intent: Extract<Intent, { type: 'diagnosis' }>) {
  const action: ActionEvent = { ...nextActionBase(state), durationSeconds: 0, type: 'diagnosis', diagnosis: intent.diagnosis };
  const nextState: SessionState = { ...appendAction(state, action), ended: { by: 'diagnosis', atSimSeconds: state.clockSeconds } };
  const report = scoreSession(nextState);
  return { state: nextState, result: { type: 'diagnosis' as const, report } };
}

/** Force-scores an unfinished session (e.g. time budget expiry in the UI), as if the trainee submitted "no fault in scope" with no claims. Item 6's "give up" button only. */
export function endSession(state: SessionState): { state: SessionState; result: PerformResult } {
  return perform(state, { type: 'diagnosis', diagnosis: { claims: [], noFaultInScope: true } });
}

// --- UI redaction ------------------------------------------------------------------------
//
// `perform`'s own return value already strips `OtdrTraceResult.hidden` from the result it
// hands back for the *current* action, but `SessionState` itself carries two other places
// the answer key hides: `world`/`initialWorld.appliedFaults` (the true fault list) and
// `state.blobs[traceRef]` (the full, unredacted `OtdrTraceResult` stashed so a later re-open
// of that trace doesn't need to recompute it). `redactForUi` strips all of it in one pass;
// the UI store holds only what this returns, never a raw `SessionState`.

export type UiWorldState = Omit<WorldState, 'appliedFaults'>;

/** `ActionEvent`, distributed over its own union, with `groundTruth` (present only on the otdr-shot member) removed. */
export type UiActionEvent = ActionEvent extends infer T ? (T extends { groundTruth: unknown } ? Omit<T, 'groundTruth'> : T) : never;

export type UiBlobs = Record<string, string[] | PublicOtdrTraceResult>;

export interface UiSessionState {
  meta: ScenarioMeta;
  world: UiWorldState;
  initialWorld: UiWorldState;
  profiles: SessionState['profiles'];
  clockSeconds: number;
  locationNodeId: string;
  log: UiActionEvent[];
  blobs: UiBlobs;
  hintsUsed: number;
  cliSessions: Record<string, CliSession>;
  ended: SessionState['ended'];
}

function redactWorld(world: WorldState): UiWorldState {
  const { appliedFaults: _appliedFaults, ...rest } = world;
  return rest;
}

/** `ActionEvent` with `groundTruth` removed (a no-op for every variant but otdr-shot, the only one that carries it). Also used by persistence.ts: a stored session's log is answer-key-free too. */
export function stripGroundTruth(action: ActionEvent): UiActionEvent {
  if (action.type === 'otdr-shot') {
    const { groundTruth: _groundTruth, ...rest } = action;
    return rest;
  }
  return action;
}

function isOtdrTraceBlob(value: unknown): value is OtdrTraceResult {
  return !!value && typeof value === 'object' && 'hidden' in value;
}

function redactBlobs(blobs: Record<string, unknown>): UiBlobs {
  const redacted: UiBlobs = {};
  for (const [key, value] of Object.entries(blobs)) {
    if (isOtdrTraceBlob(value)) {
      const { hidden: _hidden, ...rest } = value;
      redacted[key] = rest;
    } else {
      redacted[key] = value as string[];
    }
  }
  return redacted;
}

/** Strips every place a `SessionState` carries the answer key. This is the only shape the UI store may hold or pass to a component. */
export function redactForUi(state: SessionState): UiSessionState {
  return {
    meta: state.meta,
    world: redactWorld(state.world),
    initialWorld: redactWorld(state.initialWorld),
    profiles: state.profiles,
    clockSeconds: state.clockSeconds,
    locationNodeId: state.locationNodeId,
    log: state.log.map(stripGroundTruth),
    blobs: redactBlobs(state.blobs),
    hintsUsed: state.hintsUsed,
    cliSessions: state.cliSessions,
    ended: state.ended,
  };
}
