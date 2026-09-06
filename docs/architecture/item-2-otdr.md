# Item 2 — OTDR physics module, companion optical instruments, and canvas trace renderer

Status: architecture, ready to implement. Implementer: follow literally; where this document says "default", the value is a named exported constant, never an inline literal.

## Open questions (answer before or during implementation; defaults are stated so work is not blocked)

1. **Exact MaxTester model.** Dynamic range (36/39 dB) and the pulse-width range come from the 730C profile. If the crew's unit is a 715D/720C, only `src/profiles/instrument/*.yaml` changes; nothing in this item's code does. Default: proceed with the 730C profile as seeded.
2. **Auto event table vs. manual measurement.** Real MaxTesters auto-generate an event table. If the product wants trainees to *earn* the table by placing cursors, the UI (item 6) can hide `result.events` behind an "Analyze" soft-key that costs simulated time. Default: the physics module always computes the table; the visibility/time-cost decision is item 6's.
3. **Superposition from the OLT side.** Testing downstream through a splitter sums backscatter from every leg. This is modeled exactly (Section 6.4). Confirm the product wants OLT-side shots to be possible at all in Stage 1 scenarios; if not, item 5 scenarios simply never grant OLT-side access. Default: modeled and allowed.

## 1. Purpose and boundaries

`otdr.trace()` is a pure function from `(WorldState, ProfileSet subset, access point, instrument settings)` to an `OtdrTraceResult`. It never reads global state, never touches the DOM, and never knows a "fault" was placed — it walks `FiberSpan.events` and topology. The canvas renderer is a React component that consumes an `OtdrTraceResult` and a viewport; it contains no physics.

This item also delivers three small companion instruments that share the same path/loss physics and are required by later scoring: the optical power meter, the VFL, and the connector inspection scope. They are tiny once the path resolver exists, and item 4's evidence rules depend on them.

Everything vendor/instrument-specific is read from `ProfileSet.otdrInstrument` and `ProfileSet.network`. No numeric constant that describes the instrument or the fiber may appear in engine code unless listed in `constants.ts` under "physics constants" (speed of light, dB conversions) or "model defaults" with an explicit profile override hook.

## 2. Amendments to item 1 (do these first; all additive; existing 31 tests must still pass unchanged)

### 2.1 `src/world/random.ts` (new)

```ts
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal via Box–Muller (cache the second value). */
  nextGaussian(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}
/** mulberry32. Same seed ⇒ identical sequence across Node and browsers. */
export function createRng(seed: number): Rng;
/** FNV-1a 32-bit over `${baseSeed}|${labels.join('|')}`; returns an unsigned 32-bit int. Used so every sub-system derives an independent, reproducible stream. */
export function deriveSeed(baseSeed: number, ...labels: string[]): number;
```

Tests (`random.test.ts`): same seed ⇒ identical first 100 values; different labels ⇒ different derived seeds; `nextGaussian` over 10k samples has mean within ±0.05 and stdev within 0.95–1.05.

### 2.2 `src/profiles/registry.ts` (new)

Bundles every profile YAML via `import.meta.glob('./**/*.yaml', { query: '?raw', import: 'default', eager: true })`, parses each with the matching loader (choose the loader by the directory segment: `network/`, `vendor/`, `equipment/`, `instrument/`, `region/`; skip any path containing `__fixtures__`), and indexes by `id`.

```ts
export function resolveProfileSet(active: ActiveProfileSet): ProfileSet; // throws ProfileNotFoundError(kind, id)
export function listProfiles(kind: keyof ProfileSet): Array<{ id: string; displayName: string }>;
```

Test: `resolveProfileSet` on the ids used in `faultTaxonomy.test.ts` returns the same objects as `loadDefaultProfileSet()` (deep-equal); an unknown id throws with the kind and id in the message.

### 2.3 Schema additions (`src/profiles/schema.ts`) — all optional with defaults applied by Zod `.default()`, so existing YAML still validates

NetworkProfileSchema:
- `backscatterCoefficientDb1ns: wavelengthTriple` default `{ '1310': -79.4, '1550': -81.9, '1625': -82.5 }` — round-trip backscatter level relative to incident for a 1 ns pulse (SMF-28 class values).
- `iorDefault['1625']` — add `1.4685` to `xgs-pon.yaml` (the schema already allows it).
- `waterPeakExcessDbPerKm: number` default `1.0`; `waterPeakSigmaNm: number` default `30`.
- `oltTxPowerDbm: number` default `4.0` (XGS-PON OLT launch power; used by the power meter and item 3's ONT-state derivation).

InstrumentProfileSchema:
- `attenuationDeadZoneFactor: number` default `5` (spec range 5–10).
- `dynamicRangeSpecConditions: { pulseWidthNs: number; averagingSeconds: number }` default `{ 20000, 180 }` — the conditions at which `dynamicRangeDb` is quoted.
- `averagingSecondsOptions: number[]` default `[5, 15, 30, 60, 180]`.
- `frontPanelReflectanceDb: number` default `-45`.
- `saturationHeadroomDb: number` default `3` (max displayed level above the launch level).
- `liveTrafficNoisePenaltyDb: number` default `10`.
- `ghostThresholdReflectanceDb: number` default `-35`; `ghostDecayDbPerOrder: number` default `6`.
- `sampleCount: number` default `4096`.

### 2.4 World type additions (`src/world/types.ts`)

```ts
export interface FiberSpan {
  // …existing…
  /** True when this span currently carries live PON service. Scenario-authored (item 5 validator defaults it — see item 5). */
  liveService?: boolean;
  /** 'legacy' fiber has the 1383 nm water peak; default 'low-water-peak'. */
  fiberGeneration?: 'legacy' | 'low-water-peak';
  /** Relative backscatter offset for this span's fiber in round-trip dB (default 0). Needed only for authored gainers where the far fiber differs. */
  backscatterOffsetDb?: number;
}

export interface FiberEvent {
  // …existing…
  /** For 'mismatched-fiber-splice': the true splice loss that bidirectional averaging recovers. Default MISMATCH_TRUE_LOSS_DB (0.05). */
  trueLossDb?: number;
}

export interface FiberStrand {
  // …existing…
  /** True when this individual fiber carries live service. Overrides the span-level liveService on stranded cables (Section 6.7). Item 5's loader derives it. */
  live?: boolean;
}

/** How fibers continue through a node with more than one incident span. Stored at TopologyNode.attributes.spliceMap; typed accessor in worldState.ts. */
export interface SpliceMapEntry {
  fromSpanId: string;
  fromStrand?: { tubeColor: FiberTubeColor; fiberColor: FiberTubeColor };
  toSpanId: string;
  toStrand?: { tubeColor: FiberTubeColor; fiberColor: FiberTubeColor };
}
```

Add to `worldState.ts`: `getSpliceMap(node): SpliceMapEntry[]` (returns `[]` if absent), `getSplitRatio(node): string` (reads `attributes.splitRatio`, throws `MissingSplitRatioError(nodeId)` for a `'splitter'` node without it), `spansAtNode(world, nodeId): FiberSpan[]`.

Conventions (document in `types.ts` header; enforced by item 5's validator):
- A span's `fromNodeId` is the OLT/upstream side, `toNodeId` the customer/downstream side.
- A splitter is a `TopologyNode` of kind `'splitter'` with `attributes.splitRatio` (e.g. `'1x32'`), exactly one incident span arriving (`toNodeId === splitter.id`) and one or more leaving (`fromNodeId === splitter.id`). The OTDR module inserts its loss step. The `'splitter'` `FiberEventKind` remains valid for an *inline* non-branching splitter authored on a span (loss from `lossDb`, or from the network `splitterLadder` by `splitRatio` when `lossDb` is absent). An author uses one representation per physical splitter.

## 3. Module layout

```
src/instruments/
  shared/
    opticalPath.ts        resolveTestPath, pathLossDb (shared by OTDR, power meter, VFL, and item 3's ONT-state derivation)
    opticalPath.test.ts
  otdr/
    types.ts
    constants.ts
    physics.ts            attenuation, dead zones, noise floor, reflection peak, event steps
    trace.ts              trace() orchestrator
    eventTable.ts         detectEvents()
    ghosts.ts             deriveGhosts()
    bidirectional.ts      bidirectionalAverage()
    viewport.ts           pure renderer math (no DOM)
    index.ts
    physics.test.ts  trace.test.ts  eventTable.test.ts  ghosts.test.ts  bidirectional.test.ts  viewport.test.ts
  powerMeter/  powerMeter.ts  powerMeter.test.ts
  vfl/         vfl.ts         vfl.test.ts
  inspectionScope/ inspectionScope.ts inspectionScope.test.ts
  index.ts
src/ui/otdr/OtdrTraceCanvas.tsx      the canvas renderer component (no physics)
src/ui/dev/DevOtdrPreview.tsx        dev-only harness route, replaced by item 6's routing
```

## 4. Types (`src/instruments/otdr/types.ts`)

```ts
export type OtdrWavelengthKey = '1310' | '1550' | '1625';

export interface OtdrAccess {
  /** Node where the OTDR is connected (terminal, FDH, closure, OLT patch panel, ONT-side NID…). */
  accessNodeId: string;
  /** The incident span to launch into. Determines direction. */
  launchSpanId: string;
  /** Required when the launch span has `strands`; selects which fiber the OTDR is on. */
  strand?: { tubeColor: FiberTubeColor; fiberColor: FiberTubeColor };
}

export interface OtdrSettings {
  wavelengthNm: number;          // must be in network.wavelengths.otdrTestWavelengthsNm ∪ otdrInstrument.liveTestOutOfBandNm
  pulseWidthNs: number;          // must be within otdrInstrument.pulseWidthsNsRange (inclusive)
  rangeMeters: number;           // > 0
  iorSetting: number;            // user-entered group index used for the *displayed* distance axis
  averagingSeconds: number;      // must be one of otdrInstrument.averagingSecondsOptions
  launchCableMeters: number;     // 0 = none
  receiveCableMeters: number;    // 0 = none
}

export interface TraceSample {
  /** Displayed distance, computed with settings.iorSetting (so a wrong IOR shifts this). */
  distanceMeters: number;
  /** One-way level in dB relative to the launch level (0 at d=0 before the front-panel pulse). */
  levelDb: number;
}

export type DetectedEventKind = 'launch' | 'reflective' | 'non-reflective' | 'end-of-fiber' | 'echo';

export interface DetectedEvent {
  index: number;                 // 1-based, as an OTDR numbers them
  kind: DetectedEventKind;
  distanceMeters: number;        // displayed distance
  lossDb: number | null;         // measured loss; null when not measurable (inside a dead zone at launch, or end-of-fiber)
  reflectanceDb: number | null;  // null for non-reflective
  cumulativeLossDb: number;
  /** Slope of the section preceding this event, dB/km, from a least-squares fit of samples; null if the section is shorter than 2×EDZ. */
  sectionAttenuationDbPerKm: number | null;
  /** Instrument-side quality flag: 'ok' or 'near-noise-floor' (measured with < 6 dB SNR). Never reveals ground truth. */
  quality: 'ok' | 'near-noise-floor';
}

export type OtdrViolation =
  | { kind: 'in-band-test-on-live-pon'; wavelengthNm: number; liveSpanIds: string[] };

export type OtdrWarning =
  | { kind: 'pulse-too-long-for-range'; pulseWidthNs: number; rangeMeters: number }
  | { kind: 'range-shorter-than-path'; rangeMeters: number; pathLengthMeters: number }
  | { kind: 'no-launch-cable' };

/** Ground truth for scoring only. UI MUST NOT render anything under `hidden`. */
export interface OtdrHidden {
  groundTruth: GroundTruthEvent[];
  ghosts: GhostArtifact[];
  pathSpanIds: string[];
  trueTotalLengthMeters: number;
}
export interface GroundTruthEvent {
  eventId: string | null;        // FiberEvent.id, or null for synthetic (front panel, splitter node, fiber-end at a node)
  spanId: string | null;
  kind: FiberEventKind | 'front-panel' | 'splitter-node' | 'unterminated-end';
  trueDistanceMeters: number;
  trueLossDb: number;
  reflectanceDb: number | null;
  resolved: boolean;             // false ⇒ merged into a dead zone or below the noise floor
  branchPath: string[];          // span ids from the access point to this event (for superposed traces)
}
export interface GhostArtifact { sourceEventDistanceMeters: number; order: number; distanceMeters: number; peakDb: number; }

export interface OtdrTraceResult {
  access: OtdrAccess;
  settings: OtdrSettings;
  samples: TraceSample[];        // length = otdrInstrument.sampleCount, evenly spaced 0..rangeMeters (displayed)
  events: DetectedEvent[];
  noiseFloorDb: number;
  eventDeadZoneMeters: number;
  attenuationDeadZoneMeters: number;
  simulatedSecondsElapsed: number; // averagingSeconds + OTDR_SETUP_OVERHEAD_SECONDS (20)
  violations: OtdrViolation[];
  warnings: OtdrWarning[];
  hidden: OtdrHidden;
}
```

Errors (`src/instruments/otdr/errors.ts`): `OtdrSettingsError(field, message)` (settings outside profile constraints), `AmbiguousPathError(nodeId)`, `MissingSplitRatioError(nodeId)`, `StrandRequiredError(spanId)`. All extend `Error` with a `code` string.

## 5. Shared optical path (`src/instruments/shared/opticalPath.ts`)

```ts
export interface PathSegment {
  spanId: string;
  reversed: boolean;               // true when traversed toNode→fromNode (customer side toward OLT)
  startMeters: number;             // cumulative true distance at the segment's start
  strand?: { tubeColor; fiberColor };
  /** Steps inserted at the segment's *end* node: split loss when passing a splitter node. */
  nodeStepAtEnd?: { nodeId: string; kind: 'splitter-node'; lossDb: number } | { nodeId: string; kind: 'unterminated-end'; reflectanceDb: number };
  children: PathSegment[];         // 0 = path ends here; 1 = continues; >1 = splitter superposition (downstream)
}
export interface ResolvedPath { root: PathSegment; totalLengthMeters: number /* longest branch */; spanIds: string[]; }

export function resolveTestPath(world: WorldState, network: NetworkProfile, access: OtdrAccess): ResolvedPath;
/** One-way loss from the OLT-side end of a linear path to `toNodeId`, at a service or test wavelength, excluding nothing. Used by power meter and item 3. */
export function pathLossDb(world, network, fromNodeId, toNodeId, wavelengthNm): { lossDb: number; broken: boolean; spanIds: string[] };
```

Resolution algorithm, starting with `current = access.launchSpanId`, `arrivingFrom = access.accessNodeId`, `cum = 0`:

1. `reversed = (span.toNodeId === arrivingFrom)`. If the span has `strands` and `access.strand` is absent → `StrandRequiredError`. If `strands` present, `strand = access.strand` for the first segment, else the strand carried in from the splice map.
2. Emit a segment with `startMeters = cum`; `cum += span.lengthMeters`; `nextNode = reversed ? span.fromNodeId : span.toNodeId`.
3. Termination at the arriving strand: if the segment's strand is defined and that `FiberStrand.continuityBroken === true`, set `nodeStepAtEnd = { kind: 'unterminated-end', reflectanceDb: UNTERMINATED_END_REFLECTANCE_DB (-14) }`, `children = []`, stop this branch.
4. At `nextNode`, `continuing = spansAtNode(nextNode)` minus the current span.
   - `nextNode.kind === 'splitter'`: `lossDb = splitterLadder[splitRatio].nominalLossDb` (throw if the ratio is absent from the ladder). Set `nodeStepAtEnd = { kind: 'splitter-node', lossDb }`. If `!reversed` (arrived via the upstream span): `children = ` one child per span in `continuing` (superposition). If `reversed`: `children = ` the single span with `toNodeId === nextNode` (the upstream span); if none → `children = []`.
   - Otherwise, `continuing.length === 0` → `children = []` and, if the node kind is `'ont'` or `'olt'` **and** the arriving strand (if any) has `role` other than `'dark'`/`'spare'`, `nodeStepAtEnd = { kind: 'unterminated-end', reflectanceDb: END_CONNECTOR_REFLECTANCE_DB (-50) }` (an APC/UPC-terminated end at equipment); a dark/spare strand at equipment, or any other node kind → `reflectanceDb: -14` (an unpatched/open fiber end in a tray). This difference (−50 vs −14 at the OLT distance) is how a tech tells "patched to a PON port" from "a dead fiber nobody patched."
   - `continuing.length === 1` and the current span has no strands → `children = [that span]`.
   - Otherwise consult `getSpliceMap(nextNode)`: find the entry whose `fromSpanId === current.spanId` and, when strands exist, whose `fromStrand` equals the current strand. If found → `children = [entry.toSpanId]` carrying `entry.toStrand`. If not found → `AmbiguousPathError(nodeId)` when the current span has no strands and `continuing.length > 1`; when strands exist and no entry matches → `nodeStepAtEnd = unterminated-end (-14)`, `children = []` (a dark or un-spliced fiber ends in the tray — exactly what a wrong roll looks like on an OTDR).
5. Recurse into children with `arrivingFrom = nextNode`. Guard against cycles with a visited-span set; a revisit → `AmbiguousPathError`.

`spanIds` is the depth-first list; `totalLengthMeters` is the max cumulative length over leaves.

`pathLossDb` runs the same walk from `fromNodeId` toward `toNodeId` (choosing at each splitter the child that leads to `toNodeId`; precompute reachability by DFS) and sums: fiber attenuation per segment (Section 6.1 at the requested wavelength, mapping a service wavelength to the nearest table key: 1270→'1310', 1577→'1550', 1650→'1625'), every event's one-way loss (Section 6.3, forward direction), every `splitter-node` step. `broken = true` if any `fiber-break` event or `unterminated-end` occurs before reaching `toNodeId`, or `toNodeId` is unreachable.

## 6. Physics (`src/instruments/otdr/physics.ts`)

All internal computation is in **round-trip linear power** relative to the launch; display is `levelDb = 5·log10(pRoundTrip)` (the one-way convention: a 0.1 dB splice displays as a 0.1 dB step).

Constants (`constants.ts`): `C_M_PER_S = 299_792_458`, `OTDR_SETUP_OVERHEAD_SECONDS = 20`, `MISMATCH_TRUE_LOSS_DB = 0.05`, `UNTERMINATED_END_REFLECTANCE_DB = -14`, `END_CONNECTOR_REFLECTANCE_DB = -50`, `FIBER_BREAK_LOSS_DB = 60`, `NOISE_CLAMP_FRACTION = 0.1`, `MIN_SECTION_FOR_SLOPE_EDZ_MULTIPLE = 2`, `SNR_NEAR_FLOOR_DB = 6`.

### 6.1 Attenuation per span, dB/km, at wavelength λ
`alpha(span, λ) = network.fiberAttenuationDbPerKm[key(λ)] + (span.fiberGeneration === 'legacy' ? waterPeakExcessDbPerKm · exp(−((λ − waterPeakNm)/waterPeakSigmaNm)²) : 0)`. `key(λ)` = the nearest of 1310/1550/1625. Note honestly in code: at the standard test wavelengths the water-peak term is < 0.01 dB/km; it exists for correctness and future 1383/CWDM work, and no Stage-1 scenario may depend on it.

### 6.2 Time of flight and the IOR teachable
True distance `d` (meters along the path) ↔ time `t = 2·n_true·d / c`, where `n_true = span.iorOverride?.[key] ?? network.iorDefault[key]`. Samples are generated on a **time grid** `t_i = i · (2 · n_setting · rangeMeters / c) / sampleCount` and displayed at `distanceMeters = c·t_i / (2·n_setting)` with `n_setting = settings.iorSetting`. Ground-truth positions map to displayed positions by `d_disp = d_true · (n_true / n_setting)`. **This single ratio is the IOR teachable and is what the test asserts.**

### 6.3 Dead zones
`eventDeadZoneMeters = pulseWidthNs·1e-9 · c / (2·n_setting)`; `attenuationDeadZoneMeters = attenuationDeadZoneFactor · eventDeadZoneMeters`. (Both are displayed-distance quantities.)

### 6.4 Baseline (backscatter) and superposition
For a segment, incident round-trip power at true distance `d` from the launch: `pInc(d) = 10^(−2·(Σ attenuation up to d + Σ event losses before d + Σ node steps before d)/10)`. Backscatter returned from `d` is `pBs(d) = pInc(d) · 10^((bsCoef + span.backscatterOffsetDb)/10)` with `bsCoef = network.backscatterCoefficientDb1ns[key] + 10·log10(pulseWidthNs)`. The **displayed baseline** normalizes this so that the level at d=0 (just after the front panel) is 0 dB: `level(d) = 5·log10(pBs(d) / pBs(0⁺))`. Consequence: the trace slope is exactly `−alpha` dB/km and each event's step is exactly its one-way loss, while the *reflection peak heights* (6.5) depend on pulse width through `bsCoef` — this is why short pulses show tall spikes.

Superposition at a downstream splitter with children `k = 1..N`: for displayed sample distances beyond the node, `pBs(d) = Σ_k pBs_k(d)` where each child's incident power already includes the split loss step (each leg receives the split loss once on the way out, and its backscatter suffers it again on the way back — this falls out of the round-trip formulation). Branches shorter than `d` contribute 0 beyond their end. The apparent step at the splitter will be smaller than the ladder value when all legs return light; this is physically correct and is *not* to be "corrected."

### 6.5 Events
For a `FiberEvent` `e` on a segment (position `p = reversed ? span.lengthMeters − e.positionMeters : e.positionMeters`, true distance `D = segment.startMeters + p`):
- One-way loss `L(e, λ)`: `lossDbByWavelength` present → value at `key(λ)`; if that key is missing, linearly interpolate between the nearest defined keys on the wavelength axis, or use the single defined value; else `lossDb ?? 0`; `'splitter'` kind with no `lossDb` → ladder value for `splitRatio`; `'fiber-break'` → `FIBER_BREAK_LOSS_DB` (and everything beyond is at the noise floor).
- `'mismatched-fiber-splice'`: `forwardStep = e.lossDb` (negative = gainer), `reverseStep = −e.lossDb + 2·(e.trueLossDb ?? MISMATCH_TRUE_LOSS_DB)`; use `reversed ? reverseStep : forwardStep`. (`bidirectionalAverage` recovers `trueLossDb`.)
- Non-reflective step: applied as a linear ramp in dB over `[D, D + EDZ_true]` (pulse smear), where `EDZ_true = pulseWidthNs·1e-9·c/(2·n_true)`.
- Reflective event (`reflectanceDb = R` present): peak height above the local baseline in displayed dB `H = (R − bsCoef)/2`, clamped so that `baseline + H ≤ saturationHeadroomDb`. Trace shape: `[D, D+EDZ]` at `baseline + H`; `(D+EDZ, D+ADZ]` linear recovery in dB from `baseline + H` down to the post-event baseline (which already includes the event's loss). The front panel is a reflective event at `D = 0` with `R = frontPanelReflectanceDb`.
- `nodeStepAtEnd` of kind `splitter-node` is a non-reflective step at the node distance; `unterminated-end` is a reflective event at the node distance followed by the noise floor.
- Launch cable: if `launchCableMeters > 0`, prepend a synthetic segment of that length (attenuation of the network default fiber) ending with a reflective `connector-upc` event (`R = −50`, loss 0.3) at its end — that is the access-point connector. Receive cable: append a synthetic segment after the far end similarly, so the last real connector's loss is measurable. Synthetic segments appear in `hidden.groundTruth` with `spanId: null`.
- Without a launch cable, the access connector sits at `D ≈ 0`, inside the front panel's ADZ, and therefore is not resolvable (Section 7). Emit warning `no-launch-cable`.

### 6.6 Noise floor and noise
`dynamicRangeEff = dynamicRangeDb[key] + 5·log10(pulseWidthNs / specConditions.pulseWidthNs) + 2.5·log10(averagingSeconds / specConditions.averagingSeconds) − (liveInBand ? liveTrafficNoisePenaltyDb : 0)`; `noiseFloorDb = −dynamicRangeEff`. Noise: `pNoise = 10^(noiseFloorDb/5)` (round-trip linear); per sample `pMeas = max(pBs + pNoise·g, pNoise·NOISE_CLAMP_FRACTION)` with `g ~ N(0,1)` from `createRng(deriveSeed(world.seed, 'otdr', access.accessNodeId, access.launchSpanId, JSON.stringify(settings)))`. Display `5·log10(pMeas)`. This makes short averaging visibly noisy and long averaging clean, deterministically per (world, settings).

### 6.7 Live-PON enforcement
Live-ness is per fiber, not per cable: add `live?: boolean` to `FiberStrand` (amendment 2.4). A path segment is live iff (`span.strands` present and the traversed strand has `live === true`) or (no strands and `span.liveService === true`). `liveSpanIds = span ids of live segments`. If non-empty and `settings.wavelengthNm ∉ otdrInstrument.liveTestOutOfBandNm` → push `in-band-test-on-live-pon` violation and set `liveInBand = true` (raises the noise floor per 6.6). Out-of-band wavelengths use the `'1625'` attenuation/IOR keys.

### 6.8 Settings validation (throw `OtdrSettingsError` before any computation)
`wavelengthNm` ∈ `network.otdrTestWavelengthsNm ∪ otdrInstrument.liveTestOutOfBandNm`; `pulseWidthNs` within `pulseWidthsNsRange`; `averagingSeconds` ∈ `averagingSecondsOptions`; `rangeMeters > 0`; `0.3 < iorSetting < 3`; cable lengths ≥ 0. Warnings (not errors): `pulse-too-long-for-range` when `attenuationDeadZoneMeters > rangeMeters/10`; `range-shorter-than-path` when `rangeMeters < totalLengthMeters·(n_true/n_setting)`.

## 7. Event table (`eventTable.ts`)

`detectEvents(resolved, groundTruth, samples, ctx): DetectedEvent[]` — derived from ground truth filtered by what the trace can physically show; never from pattern-matching the noisy samples (deterministic and testable).

Walk `groundTruth` sorted by displayed distance (superposed branches are merged into one list). Maintain `lastDetected`. An event `g` is **resolved** iff:
1. its displayed distance ≥ `lastDetected.distance + (lastDetected.reflective ? ADZ : EDZ)`, and
2. its pre-event baseline is ≥ `noiseFloorDb + SNR_NEAR_FLOOR_DB/2`, and
3. for non-reflective events, `|trueLossDb| ≥ minDetectableLossDb` where `minDetectableLossDb = 0.02 + 0.05·10^((noiseFloorDb − baseline + 30)/20)` clamped to `[0.02, 2]` (loss detection worsens as the baseline approaches the floor).
Unresolved events get `resolved = false` in `hidden.groundTruth` and, if within a dead zone of `lastDetected`, their loss is **added into** `lastDetected.lossDb` (a merged event shows the combined loss — exactly what a real OTDR does).

Measured values for resolved events: `lossDb = trueLoss + σ·g` with `σ = 0.01 + 0.02·10^((noiseFloorDb − baseline + 30)/20)` clamped `[0.01, 0.5]`, `g` from the same RNG stream; `reflectanceDb = R + 1.0·g` for reflective; `distanceMeters` = displayed distance + `g·EDZ/8`. `cumulativeLossDb` = Σ measured losses so far. `sectionAttenuationDbPerKm` = least-squares slope over samples strictly between `prev.distance + (prev.reflective ? ADZ : EDZ)` and `this.distance`, or null if that window < `MIN_SECTION_FOR_SLOPE_EDZ_MULTIPLE·EDZ`. `quality = 'near-noise-floor'` when `baseline − noiseFloorDb < SNR_NEAR_FLOOR_DB`.

Kinds: index 1 is always `'launch'` (the front panel; `lossDb: null`). The last event is `'end-of-fiber'` (`lossDb: null`, `reflectanceDb` per its termination). Ghosts (Section 8) are inserted as `'reflective'` with `lossDb` drawn from `N(0, σ)` — **no flag**. The `'echo'` kind is reserved and not produced in Stage 1 (real instruments only label echoes when they can prove them).

## 8. Ghosts (`ghosts.ts`)

`deriveGhosts(detected, resolved, ctx): GhostArtifact[]`. For each resolved reflective ground-truth event with `reflectanceDb ≥ ghostThresholdReflectanceDb` at displayed distance `D` and peak `H`: for `k = 2, 3, …` while `k·D < rangeMeters`: `peakDb = H − (k−1)·ghostDecayDbPerOrder`; include if `baseline(k·D) + peakDb > noiseFloorDb + SNR_NEAR_FLOOR_DB`. Ghost peaks are added to `samples` (same shape as a reflective event with **zero loss**) and to `events` per Section 7, and recorded in `hidden.ghosts`. They exist only in the result — world state is never touched.

## 9. Bidirectional averaging (`bidirectional.ts`)

`bidirectionalAverage(ab: OtdrTraceResult, ba: OtdrTraceResult): BidirectionalEvent[]` where `BidirectionalEvent = { distanceFromAMeters, lossAbDb, lossBaDb, averagedLossDb, matched: boolean }`. Precondition: both results have the same `hidden.pathSpanIds` reversed and `settings` equal except direction; else throw `BidirectionalMismatchError`. Match `ab.events[i]` to `ba` events by `|ab.distance − (L − ba.distance)| ≤ EDZ` with `L = ab.hidden.trueTotalLengthMeters·(n_true/n_setting)`. `averagedLossDb = (lossAb + lossBa)/2`. A gainer (negative in one direction) averages to its `trueLossDb`.

## 10. Orchestrator (`trace.ts`)

```ts
export function trace(world: WorldState, profiles: Pick<ProfileSet, 'network' | 'otdrInstrument'>, access: OtdrAccess, settings: OtdrSettings): OtdrTraceResult;
```
Order: validate settings → resolve path → build ground-truth list (events + node steps + synthetic cables + front panel) with true and displayed distances → compute noise floor (needs liveInBand) → generate samples (baseline with steps/peaks, superposition, then noise) → detect events → derive ghosts (mutates samples/events) → assemble result. Pure: same inputs ⇒ deep-equal output (test).

Companion instruments (`src/instruments/powerMeter/`, `vfl/`, `inspectionScope/`):
- `powerMeter.read(world, network, nodeId, wavelengthNm): { dbm: number | null; simulatedSeconds: 60 }` — `dbm = network.oltTxPowerDbm − pathLossDb(olt→node).lossDb`, `null` if `broken` or no OLT upstream; reads the node's `attributes.opticalPowerDbm` override first if present (the `fat-power-out-of-spec` fault writes this). Add ±0.2 dB seeded noise.
- `vfl.inspect(world, spanId, fromNodeId): { leaks: Array<{ positionMeters; kind: 'macrobend' | 'fiber-break' | 'connector-dirty' }>; simulatedSeconds: 120 }` — events within `VFL_RANGE_METERS` (5000) of `fromNodeId` whose kind is one of those three; a macrobend leaks only if its `'1550'` loss ≥ 0.3 dB.
- `inspectionScope.inspect(world, spanId, eventId): { grade: 'pass' | 'fail'; zones: { core: n; cladding: n; adhesive: n; contact: n }; simulatedSeconds: 90 }` — IEC 61300-3-35 style: `connector-dirty` → fail with defect counts scaled from `reflectanceDb` (−35 → 1 core defect; −14 → 5+); clean `connector-upc/apc` → pass with 0–2 contact-zone specks (seeded). Any other event id → throws `NotAConnectorError`.

## 11. Renderer (`viewport.ts` + `src/ui/otdr/OtdrTraceCanvas.tsx`)

Pure helpers (tested, no DOM):
```ts
export interface Viewport { xMinMeters: number; xMaxMeters: number; yMinDb: number; yMaxDb: number; }
export function defaultViewport(result): Viewport;             // x: 0..rangeMeters; y: noiseFloorDb−5 .. saturationHeadroomDb+2
export function toPixel(vp, widthPx, heightPx, distanceMeters, levelDb): { x: number; y: number };
export function fromPixelX(vp, widthPx, xPx): number;
export function levelAt(result, distanceMeters): number;        // nearest sample
export function cursorReadout(result, aMeters, bMeters): { aLevelDb; bLevelDb; deltaMeters; deltaDb; twoPointLossDb; slopeDbPerKm | null };
export function zoomAround(vp, focusMeters, factor): Viewport;  // clamps to [0, rangeMeters]
export function pan(vp, deltaMeters): Viewport;
export function hitTestEvent(result, vp, widthPx, xPx, toleranceX = 8): DetectedEvent | null;
export function downsampleForWidth(samples, vp, widthPx): TraceSample[]; // min/max decimation so peaks survive
```
Component contract:
```ts
interface OtdrTraceCanvasProps {
  result: OtdrTraceResult | null;
  viewport: Viewport;
  cursors: { a: number; b: number };
  activeCursor: 'a' | 'b';
  showEventMarkers: boolean;
  onCursorMove(which: 'a' | 'b', meters: number): void;
  onViewportChange(vp: Viewport): void;
  onEventSelect(event: DetectedEvent | null): void;
  theme: { background; grid; trace; cursorA; cursorB; marker; text };   // colors injected by item 6 (dark equipment palette)
}
```
Drawing order: background → grid (major every 10 dB / nice-number distance step) → axis labels → trace polyline from `downsampleForWidth` → event markers (triangles at the top edge, numbered) → cursors (vertical lines + readout box) → noise-floor dashed line. Handle `devicePixelRatio`. Pointer handling: single drag moves the active cursor; two-finger pinch or wheel → `zoomAround`; two-finger drag → `pan`. The component never reads `result.hidden` (add an ESLint-style guard: a unit test greps the component source for the string `hidden` and fails if present).

`DevOtdrPreview.tsx`: builds a demo world (one 3 km span with a UPC connector, a splitter node 1x32, a macrobend, a fiber end), a settings form, and the canvas — enough to eyeball item 2 before item 6 exists.

## 12. Required tests (exact assertions)

physics.test.ts
1. Doubling `pulseWidthNs` exactly doubles `eventDeadZoneMeters` and `attenuationDeadZoneMeters` (assert ratio 2 within 1e-9).
2. `alpha(span,'1550') === 0.21` for default fiber; for `fiberGeneration:'legacy'` the difference at 1550 is < 0.01 dB/km (documents the honest smallness).
3. Reflection peak height is larger for a 10 ns pulse than for 1 µs pulse for the same `reflectanceDb`.
4. Noise floor: 10× averaging raises `dynamicRangeEff` by 2.5 dB; 10× pulse width by 5 dB.

trace.test.ts
5. **Wrong IOR ratio:** trace a 2000 m span with one event at 1000 m using `iorSetting = n_true·1.02`; the detected event's `distanceMeters` equals `1000/1.02` within 1 EDZ. Then `iorSetting = n_true` gives 1000 ± EDZ.
6. **Macrobend wavelength differential surfaces unchanged:** a `macrobend` event with `lossDbByWavelength {1310: 0.2, 1550: 1.5}`; the detected event's `lossDb` at 1550 is greater than at 1310 by 1.3 ± 0.1 (long averaging, 100 ns pulse).
7. **Dead-zone failure mode:** two non-reflective 0.5 dB events at 1000 m and 1040 m with `pulseWidthNs = 20000` (EDZ ≈ 2040 m) ⇒ exactly one detected event between them with `lossDb ≈ 1.0 ± 0.1`; with `pulseWidthNs = 30` ⇒ two detected events with ≈ 0.5 each.
8. **Superposition:** splitter node 1x4 with four legs of 500/600/700/800 m; from the upstream side the trace shows steps (end-of-leg drops) at those four distances and the apparent splitter step is < the ladder's 7.2 dB; from any single leg toward the OLT the step equals 7.2 ± 0.1.
9. **Wrong roll shows as a fiber end:** a two-span path with strands and a `spliceMap`; apply `wrong-tube-continuity` to the strand; the trace from downstream ends at the closure distance with a reflective `end-of-fiber` event (reflectance ≈ −14) and `hidden.groundTruth` contains an `unterminated-end`. Without the fault, the path continues.
10. **Fiber break:** samples beyond the break are within 3 dB of `noiseFloorDb`; the event table ends there with a non-reflective `end-of-fiber`.
11. **Launch cable:** with `launchCableMeters = 0` the access connector is unresolved (`hidden.groundTruth` has `resolved:false` for it and it is absent from `events`); with `launchCableMeters = 500` it is resolved with `lossDb ≈ 0.3`.
12. **Live PON:** span `liveService:true`, wavelength 1550 ⇒ one `in-band-test-on-live-pon` violation and a noise floor 10 dB higher than at 1625; wavelength 1625 ⇒ no violation.
13. **Determinism:** two calls with identical inputs are `toEqual`; changing `averagingSeconds` changes samples.
14. Settings validation: each invalid field throws `OtdrSettingsError` naming the field.
15. `simulatedSecondsElapsed === averagingSeconds + 20`.

ghosts.test.ts
16. A −20 dB reflector at 700 m on a 3000 m range produces ghost artifacts at 1400 m and 2100 m (±EDZ) with decreasing peaks; `events` contains reflective entries at those distances with `|lossDb| < 0.1`; a −55 dB reflector produces none.

bidirectional.test.ts
17. A `mismatched-fiber-splice` with `lossDb −0.3`, `trueLossDb 0.05`: A→B measured ≈ −0.3, B→A ≈ +0.4, averaged ≈ 0.05 (±0.05).

opticalPath.test.ts
18. `pathLossDb` through 2 km of fiber at 1577 nm (→'1550' key), one 1x32 splitter, one UPC connector = 0.42 + 17.5 + 0.3 ± 0.01; `broken:true` when a `fiber-break` is upstream of the target.
19. `AmbiguousPathError` at a non-splitter node with two continuing spans and no splice map; `StrandRequiredError` when launching into a stranded span without `access.strand`.

viewport.test.ts
20. `toPixel`/`fromPixelX` round-trip; `zoomAround` never exceeds `[0, rangeMeters]`; `cursorReadout` two-point loss equals the level difference; `downsampleForWidth` preserves the max sample of a reflective peak.

Companion instruments
21. Power meter at an ONT behind 2 km + 1x32 + 2 connectors reads `4.0 − (0.42 + 17.5 + 0.6) ± 0.3`; `null` when a break is upstream; a `fat-power-out-of-spec` fault's `opticalPowerDbm` overrides the computed value.
22. VFL reports a macrobend at its position only when its 1550 loss ≥ 0.3; inspection scope fails a `connector-dirty` and passes a `connector-apc`.
23. Renderer guard: `OtdrTraceCanvas.tsx` source does not contain `hidden`.

## 13. Definition of done
All tests above pass; `npm run build` and `tsc -b` clean; `DevOtdrPreview` renders a recognizable trace with cursors and event markers on a phone-width viewport; the 31 item-1 tests are untouched and pass.
