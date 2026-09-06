import type { FiberEventKind, FiberTubeColor } from '../../world';
import type { StrandRef } from '../shared/opticalPath';

export type OtdrWavelengthKey = '1310' | '1550' | '1625';

export interface OtdrAccess {
  /** Node where the OTDR is connected (terminal, FDH, closure, OLT patch panel, ONT-side NID...). */
  accessNodeId: string;
  /** The incident span to launch into. Determines direction. */
  launchSpanId: string;
  /** Required when the launch span has `strands`; selects which fiber the OTDR is on. */
  strand?: StrandRef;
}

export interface OtdrSettings {
  wavelengthNm: number;
  pulseWidthNs: number;
  rangeMeters: number;
  /** User-entered group index used for the *displayed* distance axis -- a wrong value here is the IOR teachable. */
  iorSetting: number;
  averagingSeconds: number;
  launchCableMeters: number;
  receiveCableMeters: number;
}

export interface TraceSample {
  /** Displayed distance, computed with settings.iorSetting (so a wrong IOR shifts this). */
  distanceMeters: number;
  /** One-way level in dB relative to the launch level (0 at d=0 before the front-panel pulse). */
  levelDb: number;
}

export type DetectedEventKind = 'launch' | 'reflective' | 'non-reflective' | 'end-of-fiber' | 'echo';

export interface DetectedEvent {
  /** 1-based, as an OTDR numbers them. */
  index: number;
  kind: DetectedEventKind;
  distanceMeters: number;
  lossDb: number | null;
  reflectanceDb: number | null;
  cumulativeLossDb: number;
  sectionAttenuationDbPerKm: number | null;
  quality: 'ok' | 'near-noise-floor';
}

export type OtdrViolation = { kind: 'in-band-test-on-live-pon'; wavelengthNm: number; liveSpanIds: string[] };

export type OtdrWarning =
  | { kind: 'pulse-too-long-for-range'; pulseWidthNs: number; rangeMeters: number }
  | { kind: 'range-shorter-than-path'; rangeMeters: number; pathLengthMeters: number }
  | { kind: 'no-launch-cable' };

export type GroundTruthKind = FiberEventKind | 'front-panel' | 'splitter-node' | 'unterminated-end';

export interface GroundTruthEvent {
  eventId: string | null;
  spanId: string | null;
  kind: GroundTruthKind;
  trueDistanceMeters: number;
  displayDistanceMeters: number;
  trueLossDb: number;
  reflectanceDb: number | null;
  resolved: boolean;
  branchPath: string[];
}

export interface GhostArtifact {
  sourceEventDistanceMeters: number;
  order: number;
  distanceMeters: number;
  peakDb: number;
}

/** Ground truth for scoring only. UI code MUST NOT render anything under `hidden`. */
export interface OtdrHidden {
  groundTruth: GroundTruthEvent[];
  ghosts: GhostArtifact[];
  pathSpanIds: string[];
  trueTotalLengthMeters: number;
}

/** Everything a trace result carries except the hidden ground truth -- what a renderer or a stashed-per-shot blob is allowed to hold. Named so call sites (and the UI's own source-grep guard) never have to spell out the redacted field itself. */
export interface PublicOtdrTraceResult {
  access: OtdrAccess;
  settings: OtdrSettings;
  samples: TraceSample[];
  events: DetectedEvent[];
  noiseFloorDb: number;
  eventDeadZoneMeters: number;
  attenuationDeadZoneMeters: number;
  simulatedSecondsElapsed: number;
  violations: OtdrViolation[];
  warnings: OtdrWarning[];
}

export interface OtdrTraceResult extends PublicOtdrTraceResult {
  hidden: OtdrHidden;
}

export interface BidirectionalEvent {
  distanceFromAMeters: number;
  lossAbDb: number;
  lossBaDb: number;
  averagedLossDb: number;
  matched: boolean;
}

export type { FiberTubeColor, StrandRef };
