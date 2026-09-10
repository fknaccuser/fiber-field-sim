/**
 * The session store: the ONLY module that imports `startSession`/`perform` and holds a
 * full, unredacted `SessionState`. Every component reads `ui` (a `UiSessionState`,
 * answer-key-free) and calls `dispatch(intent)`; nothing outside this file ever touches
 * the real session.
 */
import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScenario, instantiateScenario } from '../../scenarios';
import { DEFAULT_ROLE, ROLE_POLICY, type Role } from '../../session/roles';
import { applyReadiness, readinessFor, type ReadinessFault } from '../../session/readiness';
import { resolveProfileSet } from '../../profiles';
import { perform as runnerPerform, redactForUi, startSession } from '../../session/runner';
import type { PerformResult, UiActionEvent, UiSessionState } from '../../session/runner';
import type { Intent, SessionState } from '../../session/types';
import type { ScoreReport } from '../../scoring/types';
import { getOrCreateTraineeId, getSession, saveSession, type SessionIdentity, type StoredSession } from './persistence';
import { scoreSession } from '../../scoring/score';

/** Upgrade the presentation of old finished sessions without rewriting historical scores. */
export async function loadDebriefSession(id: string): Promise<StoredSession | undefined> {
  const stored = await getSession(id);
  if (stored?.endedAt && stored.report && !stored.report.debrief) {
    const updated = scoreSession(resumeSession(stored));
    return { ...stored, report: { ...stored.report, debrief: updated.debrief, replay: updated.replay } };
  }
  return stored;
}

/** The intent that produced a logged action -- recovers everything `perform` needs to replay it, so a stored session can be rebuilt by re-running the same steps through a fresh, deterministic instantiation. */
/**
 * Names this app used to write down, and what they are called now.
 *
 * A stored log is not current data -- it is whatever the build that wrote it believed, still
 * sitting on a device. `customer-contact` became `noc-contact` when infra stopped talking to
 * customers, and every run recorded before that carries the old name.
 */
const RENAMED_ACTIONS: Record<string, UiActionEvent['type']> = {
  'customer-contact': 'noc-contact',
};

/**
 * Turn a stored action back into the intent that produced it, or `null` if this build cannot.
 *
 * The `null` is the whole point, and its absence is what broke the deployed site. This was an
 * exhaustive switch with no `default`, which TypeScript will happily prove correct: it is
 * exhaustive over the union *as it is today*. But the input does not come from today. It comes
 * out of IndexedDB, written by whatever version of this app the trainee last ran, and a name
 * that has since been renamed matches no case at all. The switch then fell off the end and
 * returned `undefined`, the runner read `.type` off it, and the app would not open for anyone
 * carrying such a row -- with an error naming a minified variable.
 *
 * So: renames are carried forward, and anything genuinely unrecognisable is dropped with a
 * warning rather than becoming an `undefined` for someone else to trip over. A missing action
 * costs a little clock time in a resumed run. Returning `undefined` costs the whole app.
 */
function intentFromActionEvent(stored: UiActionEvent): Intent | null {
  const renamed = RENAMED_ACTIONS[stored.type];
  const action = (renamed ? { ...stored, type: renamed } : stored) as UiActionEvent;
  switch (action.type) {
    case 'otdr-shot':
      return { type: 'otdr-shot', access: action.access, settings: action.settings };
    case 'power-meter':
      return { type: 'power-meter', nodeId: action.nodeId, wavelengthNm: action.wavelengthNm, strand: action.strand };
    case 'clean-probe':
      return { type: 'clean-probe' };
    case 'vfl':
      return { type: 'vfl', spanId: action.spanId, fromNodeId: action.fromNodeId };
    case 'scope':
      return { type: 'scope', spanId: action.spanId, eventId: action.eventId };
    case 'cli':
      return { type: 'cli', endpoint: action.endpoint, command: action.command };
    case 'truck-roll':
      return { type: 'truck-roll', toNodeId: action.toNodeId };
    case 'records':
      return { type: 'records', nodeId: action.nodeId, spanId: action.spanId };
    case 'noc-contact':
      return { type: 'noc-contact' };
    case 'hint':
      return { type: 'hint' };
    case 'excavate':
      return { type: 'excavate', nodeId: action.nodeId, method: action.method, distanceFromMarksInches: action.distanceFromMarksInches };
    case 'comms':
      // Replay needs the same clock cost the original answer took.
      return { type: 'comms', eventId: action.eventId, replyId: action.replyId, seconds: action.durationSeconds };
    case 'diagnosis':
      return { type: 'diagnosis', diagnosis: action.diagnosis };
    case 'refused': {
      // The refused intent is stored data too, and can carry a name from before a rename.
      const inner = action.intent as Intent & { type: string };
      const innerRenamed = RENAMED_ACTIONS[inner.type];
      return (innerRenamed ? { ...inner, type: innerRenamed } : inner) as Intent;
    }
    default:
      console.warn(`[session] stored action "${(action as { type: string }).type}" is not something this build can replay; skipping it.`);
      return null;
  }
}

/** Rebuilds a live `SessionState` from a stored row: instantiate the same scenario+seed, then replay every logged action's original intent. Same seed -> same RNG streams -> byte-identical result. */
export function resumeSession(stored: StoredSession): SessionState {
  const def = getScenario(stored.scenarioId, stored.seed);
  const { world, meta } = instantiateScenario(def, stored.seed);
  const profiles = resolveProfileSet(def.profiles);
  let state = startSession(world, profiles, meta);
  for (const action of stored.log) {
    const intent = intentFromActionEvent(action);
    if (intent === null) continue;
    state = runnerPerform(state, intent).state;
  }
  return state;
}

interface StoreState {
  session: SessionState | null;
  lastResult: PerformResult | null;
  identity: SessionIdentity | null;
}

type StoreAction =
  | { type: 'start'; session: SessionState; identity: SessionIdentity }
  | { type: 'perform'; session: SessionState; result: PerformResult }
  | { type: 'restore'; session: SessionState; identity: SessionIdentity }
  | { type: 'clear' };

function reducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'start':
      return { session: action.session, lastResult: null, identity: action.identity };
    case 'perform':
      return { ...state, session: action.session, lastResult: action.result };
    case 'restore':
      return { session: action.session, lastResult: null, identity: action.identity };
    case 'clear':
      return { session: null, lastResult: null, identity: null };
  }
}

export interface SessionStore {
  ui: UiSessionState | null;
  lastResult: PerformResult | null;
  sessionId: string | null;
  dispatch(intent: Intent): void;
  start(scenarioId: string, seed: number, role?: Role, prepared?: readonly ReadinessFault[]): void;
  restore(session: SessionState, identity: SessionIdentity): void;
  abandon(): void;
}

const SAVE_DEBOUNCE_MS = 500;

function useSessionStoreInternal(): SessionStore {
  const [state, dispatchAction] = useReducer(reducer, { session: null, lastResult: null, identity: null });
  const navigate = useNavigate();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback((session: SessionState, identity: SessionIdentity, report: ScoreReport | null, immediate: boolean) => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const run = () => saveSession(identity, session, report);
    if (immediate) return run();
    saveTimer.current = setTimeout(() => { void run(); }, SAVE_DEBOUNCE_MS);
    return Promise.resolve();
  }, []);

  const start = useCallback(
    (scenarioId: string, seed: number, role: Role = DEFAULT_ROLE, prepared: readonly ReadinessFault[] = []) => {
      const def = getScenario(scenarioId, seed);
      const { world, meta: baseMeta } = instantiateScenario(def, seed);
      const policy = ROLE_POLICY[role];
      // Role shapes the day: it carries onto the meta and scales the clock the scenario asked for.
      const meta = {
        ...baseMeta,
        role,
        timeBudgetMinutes: baseMeta.timeBudgetMinutes === undefined ? undefined : Math.round(baseMeta.timeBudgetMinutes * policy.timeBudgetMultiplier),
      };
      // The morning: what actually made it onto the truck. Seeded, and guaranteed never to
      // remove a tool this job needs.
      const readiness = readinessFor(seed, role, baseMeta.referenceSolution.steps, prepared);
      const loadedWorld = readiness.removes.length > 0 ? { ...world, truckInventory: applyReadiness(world.truckInventory, readiness) } : world;
      // Carry the morning through, not just its effect: the shelf should be able to say
      // *why* the VFL is missing rather than only showing a gap where it should be.
      if (readiness.fault) meta.readiness = readiness;
      const profiles = resolveProfileSet(def.profiles);
      const session = startSession(loadedWorld, profiles, meta);
      void (async () => {
        const traineeId = await getOrCreateTraineeId();
        const identity: SessionIdentity = { id: crypto.randomUUID(), traineeId, startedAt: new Date().toISOString() };
        dispatchAction({ type: 'start', session, identity });
        scheduleSave(session, identity, null, true);
      })();
    },
    [scheduleSave],
  );

  const restore = useCallback((session: SessionState, identity: SessionIdentity) => {
    dispatchAction({ type: 'restore', session, identity });
  }, []);

  const dispatch = useCallback(
    (intent: Intent) => {
      if (!state.session || !state.identity) return;
      const identity = state.identity;
      const { state: nextSession, result } = runnerPerform(state.session, intent);
      dispatchAction({ type: 'perform', session: nextSession, result });
      const report = result.type === 'diagnosis' ? result.report : null;
      const saved = scheduleSave(nextSession, identity, report, intent.type === 'diagnosis');
      if (result.type === 'diagnosis') {
        void saved.then(() => navigate(`/replay/${identity.id}`)).catch(() => {
          // The result is still available in memory if browser storage is unavailable.
          navigate(`/replay/${identity.id}`, { state: { saveFailed: true } });
        });
      }
    },
    [state.session, state.identity, scheduleSave, navigate],
  );

  const abandon = useCallback(() => dispatchAction({ type: 'clear' }), []);

  const ui = useMemo(() => (state.session ? redactForUi(state.session) : null), [state.session]);

  return { ui, lastResult: state.lastResult, sessionId: state.identity?.id ?? null, dispatch, start, restore, abandon };
}

const SessionStoreContext = createContext<SessionStore | null>(null);

export function SessionStoreProvider({ children }: { children: ReactNode }) {
  const store = useSessionStoreInternal();
  return <SessionStoreContext.Provider value={store}>{children}</SessionStoreContext.Provider>;
}

export function useSessionStore(): SessionStore {
  const ctx = useContext(SessionStoreContext);
  if (!ctx) throw new Error('useSessionStore must be used within a SessionStoreProvider');
  return ctx;
}
