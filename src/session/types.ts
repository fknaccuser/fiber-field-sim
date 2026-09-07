/**
 * The session runner's own vocabulary: what a trainee can *intend* to do, what actually
 * happened (the action log), and the state that ties a scenario, a world, and an
 * ongoing session together. Instruments (items 2-3) know nothing about any of this --
 * the runner is the only thing that calls them with trainee-driven settings and records
 * what came back.
 */
import type { FaultTarget, FiberTubeColor, WorldState } from '../world';
import type { ProfileSet } from '../profiles';
import type { Role } from './roles';
import type { Readiness } from './readiness';
import type { CommsEvent } from './comms';
import type { CliFact, CliSession, Endpoint } from '../instruments/cli';
import type { DetectedEvent, GroundTruthEvent, OtdrAccess, OtdrSettings, OtdrViolation } from '../instruments/otdr';
import type { VflLeakKind } from '../instruments/vfl/vfl';

export interface ScenarioMeta {
  scenarioId: string;
  title: string;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  seed: number;
  /** What did or did not make it onto the truck this morning. Safe for the UI: it names
   *  kit, never the fault. */
  readiness?: Readiness;
  startLocationNodeId: string;
  timeBudgetMinutes?: number;
  remoteCliAccess: boolean;
  remoteHostAccess: boolean;
  /** Meters; default 10. */
  positionToleranceMeters: number;
  /** Default 'portal.isp.net'. */
  serviceCheckHostname: string;
  travelSeconds: { default: number; pairs: Array<{ from: string; to: string; seconds: number }> };
  /** Ordered, least to most specific. */
  hints: string[];
  /** Totals computed by item 5's validator. */
  referenceSolution: { steps: Intent[]; rationales: string[]; stepSeconds?: number[]; totalSeconds: number; affectedCustomerMinutes: number };
  /** ISO date, for plant-record ages. */
  today: string;
  /** Who the trainee is working as today. Absent means the default (L1). */
  role?: Role;
}

export type StrandRef = { tubeColor: FiberTubeColor; fiberColor: FiberTubeColor };

export type Intent =
  | { type: 'otdr-shot'; access: OtdrAccess; settings: OtdrSettings }
  | { type: 'power-meter'; nodeId: string; wavelengthNm: number; strand?: StrandRef }
  | { type: 'vfl'; spanId: string; fromNodeId: string }
  | { type: 'scope'; spanId: string; eventId: string }
  | { type: 'cli'; endpoint: Endpoint; command: string }
  | { type: 'truck-roll'; toNodeId: string }
  | { type: 'records'; nodeId?: string; spanId?: string }
  | { type: 'customer-contact'; customerId: string }
  | { type: 'hint' }
  | { type: 'excavate'; nodeId: string; method: 'hand' | 'machine'; distanceFromMarksInches: number }
  | { type: 'comms'; eventId: string; replyId: string; seconds: number }
  | { type: 'clean-probe' }
  | { type: 'diagnosis'; diagnosis: Diagnosis };

export interface DiagnosisClaim {
  /** A FAULT_TAXONOMY id. */
  faultKind: string;
  target: FaultTarget;
  /** fiber-span faults: position *on the span*, converted from a displayed OTDR cursor distance by the UI (item 6). */
  positionMeters?: number;
  strand?: StrandRef;
  evidenceActionIds: string[];
}

export interface Diagnosis {
  claims: DiagnosisClaim[];
  escalate?: { reason: string; evidenceActionIds: string[] };
  /** "Nothing wrong in my scope." */
  noFaultInScope?: boolean;
}

interface ActionEventBase {
  /** `a${index}`. */
  id: string;
  index: number;
  /** Simulated clock when the action started. */
  atSimSeconds: number;
  durationSeconds: number;
  locationNodeId: string;
}

/**
 * `traceRef`/`outputRef` are keys into `SessionState.blobs` (the full `OtdrTraceResult`
 * and CLI `output` lines) -- kept out of the action log itself so the log stays small
 * enough to persist and to diff in tests.
 */
export type ActionEvent = ActionEventBase &
  (
    | { type: 'otdr-shot'; access: OtdrAccess; settings: OtdrSettings; events: DetectedEvent[]; violations: OtdrViolation[]; groundTruth: GroundTruthEvent[]; pathSpanIds: string[]; traceRef: string }
    | { type: 'power-meter'; nodeId: string; wavelengthNm: number; strand?: StrandRef; dbm: number | null }
    | { type: 'vfl'; spanId: string; fromNodeId: string; leaks: Array<{ positionMeters: number; kind: VflLeakKind }> }
    | { type: 'scope'; spanId: string; eventId: string; grade: 'pass' | 'fail'; zones: { core: number; cladding: number; adhesive: number; contact: number } }
    | { type: 'cli'; endpoint: Endpoint; command: string; recognized: boolean; handlerId: string | null; facts: CliFact[]; outputRef: string }
    | { type: 'truck-roll'; fromNodeId: string; toNodeId: string }
    | { type: 'records'; nodeId?: string; spanId?: string; recordIds: string[] }
    | { type: 'customer-contact'; customerId: string; symptom: string }
    | { type: 'hint'; level: number; cost: number; text: string; refused: boolean }
    | { type: 'excavate'; nodeId: string; method: 'hand' | 'machine'; distanceFromMarksInches: number; strike: boolean }
    | { type: 'comms'; eventId: string; replyId: string; from: string; subject: string; reply: string }
    | { type: 'clean-probe'; cleaned: boolean; reason: string | null }
    | { type: 'diagnosis'; diagnosis: Diagnosis }
    /** A presence/inventory rule blocked the intent; costs 0 time but is still logged for the replay. */
    | { type: 'refused'; intent: Intent; reason: string }
  );

export interface SessionState {
  meta: ScenarioMeta;
  /** Current world; config CLI commands mutate it (a new object each time, never in place). */
  world: WorldState;
  /** Frozen snapshot from startSession, scored against for diagnostic accuracy. */
  initialWorld: WorldState;
  profiles: ProfileSet;
  clockSeconds: number;
  locationNodeId: string;
  log: ActionEvent[];
  blobs: Record<string, unknown>;
  hintsUsed: number;
  /** Keyed by endpoint key `device:${id}` / `host:${id}`. */
  cliSessions: Record<string, CliSession>;
  /** The day's inbound traffic, scheduled once at session start. */
  commsEvents: CommsEvent[];
  /** Ids of messages already dealt with. */
  commsHandled: string[];
  /** A contaminated probe tip reads dirt onto every endface until it is cleaned. */
  probeTipDirty: boolean;
  ended: null | { by: 'diagnosis' | 'safety-strike'; atSimSeconds: number };
}
