/**
 * The session store: the ONLY module that imports `startSession`/`perform` and holds a
 * full, unredacted `SessionState`. Every component reads `ui` (a `UiSessionState`,
 * answer-key-free) and calls `dispatch(intent)`; nothing outside this file ever touches
 * the real session.
 */
import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScenario, instantiateScenario } from '../../scenarios';
import { resolveProfileSet } from '../../profiles';
import { perform as runnerPerform, redactForUi, startSession } from '../../session/runner';
import type { PerformResult, UiActionEvent, UiSessionState } from '../../session/runner';
import type { Intent, SessionState } from '../../session/types';
import type { ScoreReport } from '../../scoring/types';
import { getOrCreateTraineeId, saveSession, type SessionIdentity, type StoredSession } from './persistence';

/** The intent that produced a logged action -- recovers everything `perform` needs to replay it, so a stored session can be rebuilt by re-running the same steps through a fresh, deterministic instantiation. */
function intentFromActionEvent(action: UiActionEvent): Intent {
  switch (action.type) {
    case 'otdr-shot':
      return { type: 'otdr-shot', access: action.access, settings: action.settings };
    case 'power-meter':
      return { type: 'power-meter', nodeId: action.nodeId, wavelengthNm: action.wavelengthNm, strand: action.strand };
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
    case 'customer-contact':
      return { type: 'customer-contact', customerId: action.customerId };
    case 'hint':
      return { type: 'hint' };
    case 'excavate':
      return { type: 'excavate', nodeId: action.nodeId, method: action.method, distanceFromMarksInches: action.distanceFromMarksInches };
    case 'diagnosis':
      return { type: 'diagnosis', diagnosis: action.diagnosis };
    case 'refused':
      return action.intent;
  }
}

/** Rebuilds a live `SessionState` from a stored row: instantiate the same scenario+seed, then replay every logged action's original intent. Same seed -> same RNG streams -> byte-identical result. */
export function resumeSession(stored: StoredSession): SessionState {
  const def = getScenario(stored.scenarioId);
  const { world, meta } = instantiateScenario(def, stored.seed);
  const profiles = resolveProfileSet(def.profiles);
  let state = startSession(world, profiles, meta);
  for (const action of stored.log) {
    state = runnerPerform(state, intentFromActionEvent(action)).state;
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
  start(scenarioId: string, seed: number): void;
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
    const run = () => void saveSession(identity, session, report);
    if (immediate) run();
    else saveTimer.current = setTimeout(run, SAVE_DEBOUNCE_MS);
  }, []);

  const start = useCallback(
    (scenarioId: string, seed: number) => {
      const def = getScenario(scenarioId);
      const { world, meta } = instantiateScenario(def, seed);
      const profiles = resolveProfileSet(def.profiles);
      const session = startSession(world, profiles, meta);
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
      scheduleSave(nextSession, identity, report, intent.type === 'diagnosis');
      if (result.type === 'diagnosis') navigate(`/replay/${identity.id}`);
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
