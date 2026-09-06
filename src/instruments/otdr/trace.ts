/**
 * The OTDR trace orchestrator: validates settings, resolves the physical path, builds
 * the ground-truth event list (real fiber events plus synthetic front-panel/cable/node
 * steps), generates the sampled backscatter trace (with superposition and noise), runs
 * event detection, and derives ghosts. Pure: identical inputs produce a deep-equal
 * result every time.
 *
 * Backscatter is evaluated by recursing down a tree whose nodes are the resolved
 * path's segments (one node per physical span, plus synthetic launch/receive-cable and
 * front-panel nodes). At any queried true distance, exactly one branch of the tree
 * contains it until a fork is passed -- recursing this way (rather than flattening into
 * independent root-to-leaf branch lists) is what keeps a shared upstream prefix from
 * being counted once per descendant leg.
 */
import type { FiberEventKind, WorldState } from '../../world';
import { createRng, deriveSeed, findSpan } from '../../world';
import type { InstrumentProfile, NetworkProfile } from '../../profiles';
import { resolveTestPath, type PathSegment } from '../shared/opticalPath';
import { eventOneWayLossDb, wavelengthKey } from '../shared/eventLoss';
import {
  alpha,
  attenuationDeadZoneMeters,
  backscatterCoefficientDb,
  clampPeakHeightDb,
  displayDistanceMeters,
  eventDeadZoneMeters,
  noiseFloorDb,
  reflectionPeakHeightDbRaw,
  trueIor,
} from './physics';
import { NOISE_CLAMP_FRACTION, SYNTHETIC_CONNECTOR_LOSS_DB } from './constants';
import { detectEvents, type DetectionContext } from './eventTable';
import { deriveGhosts, type GhostContext } from './ghosts';
import { OtdrSettingsError } from './errors';
import type {
  DetectedEvent,
  GroundTruthEvent,
  GroundTruthKind,
  OtdrAccess,
  OtdrSettings,
  OtdrTraceResult,
  OtdrViolation,
  OtdrWarning,
  TraceSample,
} from './types';

// --- Settings validation -----------------------------------------------------

function validateSettings(network: NetworkProfile, instrument: InstrumentProfile, settings: OtdrSettings): void {
  const validWavelengths = new Set([...network.wavelengths.otdrTestWavelengthsNm, ...instrument.liveTestOutOfBandNm]);
  if (!validWavelengths.has(settings.wavelengthNm)) {
    throw new OtdrSettingsError('wavelengthNm', `must be one of ${Array.from(validWavelengths).join(', ')}`);
  }
  if (settings.pulseWidthNs < instrument.pulseWidthsNsRange.minNs || settings.pulseWidthNs > instrument.pulseWidthsNsRange.maxNs) {
    throw new OtdrSettingsError('pulseWidthNs', `must be within [${instrument.pulseWidthsNsRange.minNs}, ${instrument.pulseWidthsNsRange.maxNs}] ns`);
  }
  if (!instrument.averagingSecondsOptions.includes(settings.averagingSeconds)) {
    throw new OtdrSettingsError('averagingSeconds', `must be one of ${instrument.averagingSecondsOptions.join(', ')}`);
  }
  if (!(settings.rangeMeters > 0)) throw new OtdrSettingsError('rangeMeters', 'must be greater than 0');
  if (!(settings.iorSetting > 0.3 && settings.iorSetting < 3)) throw new OtdrSettingsError('iorSetting', 'must be between 0.3 and 3');
  if (settings.launchCableMeters < 0) throw new OtdrSettingsError('launchCableMeters', 'must be >= 0');
  if (settings.receiveCableMeters < 0) throw new OtdrSettingsError('receiveCableMeters', 'must be >= 0');
}

// --- The optical tree --------------------------------------------------------------

interface FlatEvent {
  trueDistance: number;
  nTrue: number;
  oneWayLossDb: number;
  reflectanceDb: number | null;
  kind: GroundTruthKind;
  eventId: string | null;
  spanId: string | null;
}

interface TreeNode {
  spanId: string | null;
  startTrue: number;
  endTrue: number;
  alphaDbPerKm: number;
  backscatterOffsetDb: number;
  nTrue: number;
  /** This node's own events (real FiberEvents on its span plus its trailing node step), sorted ascending. Does not include ancestors' events. */
  events: FlatEvent[];
  children: TreeNode[];
}

function buildTreeFromSegment(seg: PathSegment, world: WorldState, network: NetworkProfile, wavelengthNm: number): TreeNode {
  const span = findSpan(world, seg.spanId);
  const nTrue = trueIor(span, network, wavelengthNm);
  const a = alpha(span, network, wavelengthNm);
  const startTrue = seg.startMeters;
  const endTrue = startTrue + span.lengthMeters;

  const events: FlatEvent[] = [];
  for (const ev of span.events) {
    const p = seg.reversed ? span.lengthMeters - ev.positionMeters : ev.positionMeters;
    const trueDistance = startTrue + p;
    const oneWayLossDb = eventOneWayLossDb(ev, network, wavelengthKey(wavelengthNm), seg.reversed ? 'reverse' : 'forward');
    events.push({ trueDistance, nTrue, oneWayLossDb, reflectanceDb: ev.reflectanceDb ?? null, kind: ev.kind as FiberEventKind, eventId: ev.id, spanId: seg.spanId });
  }
  if (seg.nodeStepAtEnd) {
    if (seg.nodeStepAtEnd.kind === 'splitter-node') {
      events.push({ trueDistance: endTrue, nTrue, oneWayLossDb: seg.nodeStepAtEnd.lossDb, reflectanceDb: null, kind: 'splitter-node', eventId: null, spanId: null });
    } else {
      events.push({ trueDistance: endTrue, nTrue, oneWayLossDb: 0, reflectanceDb: seg.nodeStepAtEnd.reflectanceDb, kind: 'unterminated-end', eventId: null, spanId: null });
    }
  }
  events.sort((x, y) => x.trueDistance - y.trueDistance);

  return {
    spanId: seg.spanId,
    startTrue,
    endTrue,
    alphaDbPerKm: a,
    backscatterOffsetDb: span.backscatterOffsetDb ?? 0,
    nTrue,
    events,
    children: seg.children.map((c) => buildTreeFromSegment(c, world, network, wavelengthNm)),
  };
}

function shiftSegment(seg: PathSegment, offset: number): PathSegment {
  if (offset === 0) return seg;
  return { ...seg, startMeters: seg.startMeters + offset, children: seg.children.map((c) => shiftSegment(c, offset)) };
}

function appendReceiveCableToLeaves(node: TreeNode, receiveCableMeters: number, alphaDbPerKm: number, nTrue: number): void {
  if (receiveCableMeters <= 0) return;
  if (node.children.length === 0) {
    const newEnd = node.endTrue + receiveCableMeters;
    node.children.push({
      spanId: null,
      startTrue: node.endTrue,
      endTrue: newEnd,
      alphaDbPerKm,
      backscatterOffsetDb: 0,
      nTrue,
      events: [{ trueDistance: newEnd, nTrue, oneWayLossDb: 0, reflectanceDb: -50, kind: 'fiber-end', eventId: null, spanId: null }],
      children: [],
    });
    return;
  }
  for (const c of node.children) appendReceiveCableToLeaves(c, receiveCableMeters, alphaDbPerKm, nTrue);
}

function buildFullTree(world: WorldState, network: NetworkProfile, instrument: InstrumentProfile, access: OtdrAccess, settings: OtdrSettings): { root: TreeNode; path: ReturnType<typeof resolveTestPath> } {
  const wavelengthNm = settings.wavelengthNm;
  const key = wavelengthKey(wavelengthNm);
  const defaultNTrue = network.iorDefault[key] ?? 1.47;
  const defaultAlpha = network.fiberAttenuationDbPerKm[key] ?? 0;

  const path = resolveTestPath(world, network, access);
  const shiftedRoot = shiftSegment(path.root, settings.launchCableMeters);
  const realTree = buildTreeFromSegment(shiftedRoot, world, network, wavelengthNm);

  // The access-point connector always exists, at true distance = launchCableMeters (0
  // when there's no cable). Without a cable it sits coincident with the front panel and
  // is swallowed by its dead zone; a cable moves it far enough out to be measurable.
  const underFrontPanel: TreeNode = {
    spanId: null,
    startTrue: 0,
    endTrue: settings.launchCableMeters,
    alphaDbPerKm: defaultAlpha,
    backscatterOffsetDb: 0,
    nTrue: defaultNTrue,
    events: [{ trueDistance: settings.launchCableMeters, nTrue: defaultNTrue, oneWayLossDb: SYNTHETIC_CONNECTOR_LOSS_DB, reflectanceDb: -50, kind: 'connector-upc', eventId: null, spanId: null }],
    children: [realTree],
  };

  appendReceiveCableToLeaves(underFrontPanel, settings.receiveCableMeters, defaultAlpha, defaultNTrue);

  const root: TreeNode = {
    spanId: null,
    startTrue: 0,
    endTrue: 0,
    alphaDbPerKm: 0,
    backscatterOffsetDb: 0,
    nTrue: defaultNTrue,
    events: [{ trueDistance: 0, nTrue: defaultNTrue, oneWayLossDb: 0, reflectanceDb: instrument.frontPanelReflectanceDb, kind: 'front-panel', eventId: null, spanId: null }],
    children: [underFrontPanel],
  };

  return { root, path };
}

// --- Live-PON detection --------------------------------------------------------

function isSegmentLive(seg: PathSegment, world: WorldState): boolean {
  const span = findSpan(world, seg.spanId);
  if (seg.strand) {
    const strandObj = span.strands?.find((s) => s.tubeColor === seg.strand!.tubeColor && s.fiberColor === seg.strand!.fiberColor);
    return !!strandObj?.live;
  }
  return !!span.liveService;
}

function collectLiveSpanIds(seg: PathSegment, world: WorldState, acc: string[]): void {
  if (isSegmentLive(seg, world)) acc.push(seg.spanId);
  for (const c of seg.children) collectLiveSpanIds(c, world, acc);
}

// --- Backscatter power (recursive; avoids double-counting a shared prefix) --------

/** Normalized (relative to the d=0 reference) linear backscatter power at true distance `dTrue`, recursing from `node` with `cumLossBefore` already accumulated from every ancestor. */
function contributionAt(node: TreeNode, dTrue: number, cumLossBefore: number, bsCoefDb: number, pBsAtZeroRef: number): number {
  if (dTrue < node.startTrue) return 0;
  let loss = cumLossBefore;
  const reach = Math.min(dTrue, node.endTrue);
  loss += ((reach - node.startTrue) / 1000) * node.alphaDbPerKm;
  for (const ev of node.events) {
    if (ev.trueDistance < dTrue) loss += ev.oneWayLossDb;
  }
  if (dTrue <= node.endTrue) {
    const pInc = Math.pow(10, (-2 * loss) / 10);
    return (pInc * Math.pow(10, (bsCoefDb + node.backscatterOffsetDb) / 10)) / pBsAtZeroRef;
  }
  if (node.children.length === 0) return 0;
  let total = 0;
  for (const c of node.children) total += contributionAt(c, dTrue, loss, bsCoefDb, pBsAtZeroRef);
  return total;
}

function cleanLevelDbAtTrue(root: TreeNode, dTrue: number, bsCoefDb: number): number {
  const pBsAtZeroRef = Math.pow(10, bsCoefDb / 10);
  const p = contributionAt(root, dTrue, 0, bsCoefDb, pBsAtZeroRef);
  return 5 * Math.log10(Math.max(p, 1e-12));
}

function cleanLevelDbAtDisplay(root: TreeNode, displayDistanceQuery: number, bsCoefDb: number, nTrueForDisplay: number, nSetting: number): number {
  const dTrue = displayDistanceQuery * (nSetting / nTrueForDisplay);
  return cleanLevelDbAtTrue(root, dTrue, bsCoefDb);
}

// --- Ground truth assembly -------------------------------------------------------

function collectGroundTruth(node: TreeNode, ancestorSpanIds: string[], nSetting: number, out: GroundTruthEvent[]): void {
  const spanIds = node.spanId ? [...ancestorSpanIds, node.spanId] : ancestorSpanIds;
  for (const ev of node.events) {
    out.push({
      eventId: ev.eventId,
      spanId: ev.spanId,
      kind: ev.kind,
      trueDistanceMeters: ev.trueDistance,
      displayDistanceMeters: displayDistanceMeters(ev.trueDistance, ev.nTrue, nSetting),
      trueLossDb: ev.oneWayLossDb,
      reflectanceDb: ev.reflectanceDb,
      resolved: false,
      branchPath: spanIds,
    });
  }
  for (const c of node.children) collectGroundTruth(c, spanIds, nSetting, out);
}

const SUPERPOSITION_EPSILON_METERS = 0.001;

/** Splitter-node steps are point events on every tree branch, but their *apparent* loss depends on how many legs return light past them from this particular access point -- recompute it from the actual before/after continuity of the resolved tree rather than trusting the flat ladder value. */
function recomputeSplitterApparentLoss(root: TreeNode, groundTruth: GroundTruthEvent[], bsCoefDb: number): void {
  for (const g of groundTruth) {
    if (g.kind !== 'splitter-node') continue;
    const before = cleanLevelDbAtTrue(root, g.trueDistanceMeters - SUPERPOSITION_EPSILON_METERS, bsCoefDb);
    const after = cleanLevelDbAtTrue(root, g.trueDistanceMeters + SUPERPOSITION_EPSILON_METERS, bsCoefDb);
    g.trueLossDb = before - after;
  }
}

// --- Sample generation -----------------------------------------------------------

function generateSamples(
  root: TreeNode,
  settings: OtdrSettings,
  bsCoefDb: number,
  noiseFloorDbValue: number,
  sampleCount: number,
  nTrueForDisplay: number,
  rng: ReturnType<typeof createRng>,
): TraceSample[] {
  const pBsAtZeroRef = Math.pow(10, bsCoefDb / 10);
  const nSetting = settings.iorSetting;
  const pNoiseNorm = Math.pow(10, noiseFloorDbValue / 5);

  const samples: TraceSample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const distanceMeters = (i / (sampleCount - 1)) * settings.rangeMeters;
    const dTrue = distanceMeters * (nSetting / nTrueForDisplay);
    const pBsNorm = contributionAt(root, dTrue, 0, bsCoefDb, pBsAtZeroRef);
    const g = rng.nextGaussian();
    const pMeasNorm = Math.max(pBsNorm + pNoiseNorm * g, pNoiseNorm * NOISE_CLAMP_FRACTION);
    samples.push({ distanceMeters, levelDb: 5 * Math.log10(pMeasNorm) });
  }
  return samples;
}

// --- Reflective peak overlay (visual only; does not affect event detection) -------

function overlayReflectivePeaks(
  samples: TraceSample[],
  groundTruth: GroundTruthEvent[],
  bsCoefDb: number,
  saturationHeadroomDb: number,
  eventDeadZoneMetersValue: number,
  root: TreeNode,
  nTrueForDisplay: number,
  nSetting: number,
): void {
  for (const g of groundTruth) {
    if (!g.resolved || g.reflectanceDb === null) continue;
    const baseline = cleanLevelDbAtDisplay(root, g.displayDistanceMeters, bsCoefDb, nTrueForDisplay, nSetting);
    const H = clampPeakHeightDb(reflectionPeakHeightDbRaw(g.reflectanceDb, bsCoefDb), baseline, saturationHeadroomDb);
    if (H <= 0) continue;
    for (const s of samples) {
      if (s.distanceMeters >= g.displayDistanceMeters && s.distanceMeters <= g.displayDistanceMeters + eventDeadZoneMetersValue) {
        s.levelDb = Math.max(s.levelDb, baseline + H);
      }
    }
  }
}

function overlayGhostPeaks(samples: TraceSample[], ghosts: ReturnType<typeof deriveGhosts>): void {
  if (samples.length < 2) return;
  const step = samples[1].distanceMeters - samples[0].distanceMeters;
  for (const gh of ghosts) {
    for (const s of samples) {
      if (Math.abs(s.distanceMeters - gh.distanceMeters) <= step / 2 + 1e-9) {
        s.levelDb = s.levelDb + gh.peakDb;
      }
    }
  }
}

// --- Orchestrator ------------------------------------------------------------------

export function trace(
  world: WorldState,
  profiles: { network: NetworkProfile; otdrInstrument: InstrumentProfile },
  access: OtdrAccess,
  settings: OtdrSettings,
): OtdrTraceResult {
  const { network, otdrInstrument: instrument } = profiles;
  validateSettings(network, instrument, settings);

  const key = wavelengthKey(settings.wavelengthNm);
  const nTrueForDisplay = network.iorDefault[key] ?? 1.4682;
  const nSetting = settings.iorSetting;

  const { root, path } = buildFullTree(world, network, instrument, access, settings);

  const liveSpanIds: string[] = [];
  collectLiveSpanIds(path.root, world, liveSpanIds);
  const liveInBand = liveSpanIds.length > 0 && !instrument.liveTestOutOfBandNm.includes(settings.wavelengthNm);
  const violations: OtdrViolation[] = [];
  if (liveSpanIds.length > 0 && liveInBand) {
    violations.push({ kind: 'in-band-test-on-live-pon', wavelengthNm: settings.wavelengthNm, liveSpanIds });
  }

  const groundTruthRaw: GroundTruthEvent[] = [];
  collectGroundTruth(root, [], nSetting, groundTruthRaw);

  const edz = eventDeadZoneMeters(settings.pulseWidthNs, nSetting);
  const adz = attenuationDeadZoneMeters(settings.pulseWidthNs, nSetting, instrument.attenuationDeadZoneFactor);
  const noiseFloor = noiseFloorDb(instrument, settings.wavelengthNm, settings.pulseWidthNs, settings.averagingSeconds, liveInBand);
  const bsCoefDb = backscatterCoefficientDb(network, settings.wavelengthNm, settings.pulseWidthNs);

  recomputeSplitterApparentLoss(root, groundTruthRaw, bsCoefDb);

  const rng = createRng(deriveSeed(world.seed, 'otdr', access.accessNodeId, access.launchSpanId, JSON.stringify(settings)));

  const samples = generateSamples(root, settings, bsCoefDb, noiseFloor, instrument.sampleCount, nTrueForDisplay, rng);

  const baselineBefore = (g: GroundTruthEvent): number => cleanLevelDbAtTrue(root, Math.max(0, g.trueDistanceMeters - SUPERPOSITION_EPSILON_METERS), bsCoefDb);

  const detectionCtx: DetectionContext = { eventDeadZoneMeters: edz, attenuationDeadZoneMeters: adz, noiseFloorDb: noiseFloor, rng };
  const { detected: detectedBeforeGhosts, groundTruth } = detectEvents(groundTruthRaw, baselineBefore, samples, detectionCtx);

  const ghostCtx: GhostContext = {
    rangeMeters: settings.rangeMeters,
    ghostThresholdReflectanceDb: instrument.ghostThresholdReflectanceDb,
    ghostDecayDbPerOrder: instrument.ghostDecayDbPerOrder,
    bsCoefDb,
    saturationHeadroomDb: instrument.saturationHeadroomDb,
    noiseFloorDb: noiseFloor,
    baselineAt: (d) => cleanLevelDbAtDisplay(root, d, bsCoefDb, nTrueForDisplay, nSetting),
  };
  const ghosts = deriveGhosts(detectedBeforeGhosts, ghostCtx);

  let events: DetectedEvent[] = detectedBeforeGhosts;
  if (ghosts.length > 0) {
    const ghostDetected: DetectedEvent[] = ghosts.map((gh) => ({
      index: 0,
      kind: 'reflective',
      distanceMeters: gh.distanceMeters,
      lossDb: 0.03 * rng.nextGaussian(),
      reflectanceDb: 2 * gh.peakDb + bsCoefDb + 1.0 * rng.nextGaussian(),
      cumulativeLossDb: 0,
      sectionAttenuationDbPerKm: null,
      quality: 'ok',
    }));
    events = [...detectedBeforeGhosts, ...ghostDetected]
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .map((e, i) => ({ ...e, index: i + 1 }));
    overlayGhostPeaks(samples, ghosts);
  }

  overlayReflectivePeaks(samples, groundTruth, bsCoefDb, instrument.saturationHeadroomDb, edz, root, nTrueForDisplay, nSetting);

  const warnings: OtdrWarning[] = [];
  if (settings.launchCableMeters === 0) warnings.push({ kind: 'no-launch-cable' });
  if (adz > settings.rangeMeters / 10) warnings.push({ kind: 'pulse-too-long-for-range', pulseWidthNs: settings.pulseWidthNs, rangeMeters: settings.rangeMeters });
  const displayedPathLength = displayDistanceMeters(path.totalLengthMeters, nTrueForDisplay, nSetting);
  if (settings.rangeMeters < displayedPathLength) {
    warnings.push({ kind: 'range-shorter-than-path', rangeMeters: settings.rangeMeters, pathLengthMeters: displayedPathLength });
  }

  return {
    access,
    settings,
    samples,
    events,
    noiseFloorDb: noiseFloor,
    eventDeadZoneMeters: edz,
    attenuationDeadZoneMeters: adz,
    simulatedSecondsElapsed: settings.averagingSeconds + 20,
    violations,
    warnings,
    hidden: {
      groundTruth,
      ghosts,
      pathSpanIds: path.spanIds,
      trueTotalLengthMeters: path.totalLengthMeters,
    },
  };
}
