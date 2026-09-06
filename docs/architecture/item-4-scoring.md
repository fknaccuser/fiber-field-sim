# Item 4 — Session runner, action log, and the five-axis scoring engine

Status: architecture, ready to implement. Depends on items 2 and 3 (pure instrument functions) and `src/world/random.ts`.

## Open questions (defaults stated; not blocking)

1. **Axis weighting for the personal-best number.** The five axes are displayed separately by design. Item 6 shows a *sixth* "session total" only for streaks/personal bests. Default: unweighted mean of the five, with `safetyCompliance === 0` forcing the total to 0.
2. **Physical presence for CLI.** Default: switches/routers/OLT are reachable remotely from the truck (`scenarioMeta.remoteCliAccess: true`); host shells require presence at the premise unless `remoteHostAccess: true` (tier-5 "walk the customer through it" cases). Both are scenario-authored.
3. **Beating the reference path.** If a trainee finishes faster than the authored reference, efficiency is 100 and `beatReference: true` is recorded. Default: allowed; item 5's validator warns when a reference solution is beatable by trivially skipping evidence.

## 1. Purpose and boundaries

Scoring needs a complete, ordered record of everything the trainee did and what each action revealed. Instruments are pure and know nothing about sessions, so this item adds the **session runner**: a pure reducer that takes a trainee *intent*, enforces the physical rules (you must be at a node to plug an OTDR into it), calls the pure instrument, appends an `ActionEvent`, and advances the simulated clock. The scorer is a pure function of `(SessionState, WorldState, ProfileSet, ScenarioMeta)`.

Nothing in the runner or scorer renders text for the UI beyond short human labels in the replay; the UI (item 6) owns presentation.

## 2. Amendments to item 1 (additive)

```ts
export interface FaultInstance {
  // …existing…
  /** Applied to the world and visible to instruments, but NOT the answer. Claiming it is a false positive. */
  isRedHerring?: boolean;
  /** Real cause, but outside the field tech's authority (NOC/IT). Correct answer: claim it AND escalate. */
  outOfScope?: boolean;
}
export interface PlantRecord {
  id: string;
  kind: 'splice-sheet' | 'work-order' | 'port-assignment' | 'as-built';
  title: string;
  date: string;                  // ISO date, relative to scenario "today" (item 5 sets it)
  nodeId?: string;
  spanId?: string;
  lines: string[];               // rendered verbatim by the records viewer
}
export interface WorldState { /* …existing… */ plantRecords: PlantRecord[]; }   // createEmptyWorld ⇒ []
```

## 3. Module layout

```
src/session/
  types.ts        Intent, ActionEvent, SessionState, Diagnosis, ScenarioMeta
  costs.ts        time-cost table (exported constants)
  location.ts     presence rules and travel time
  records.ts      lookupRecords(world, { nodeId? , spanId? })
  runner.ts       startSession(), perform(), endSession()
  runner.test.ts  costs.test.ts  location.test.ts
src/scoring/
  types.ts        AxisScore, ScoreReport, DecisionReplay, ReplayStep
  accuracy.ts     evidence.ts  evidenceRules.ts  efficiency.ts  customerImpact.ts  safety.ts  hints.ts  replay.ts
  score.ts        scoreSession() orchestrator
  *.test.ts
```

## 4. Session types (`src/session/types.ts`)

```ts
export interface ScenarioMeta {
  scenarioId: string;
  title: string;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  seed: number;
  startLocationNodeId: string;
  timeBudgetMinutes?: number;
  remoteCliAccess: boolean;
  remoteHostAccess: boolean;
  positionToleranceMeters: number;            // default 10
  serviceCheckHostname: string;               // default 'portal.isp.net'
  travelSeconds: { default: number; pairs: Array<{ from: string; to: string; seconds: number }> };
  hints: string[];                            // ordered, least→most specific
  referenceSolution: { steps: Intent[]; totalSeconds: number; affectedCustomerMinutes: number }; // totals computed by item 5's validator
  today: string;                              // ISO date for plant-record ages
}

export type Intent =
  | { type: 'otdr-shot'; access: OtdrAccess; settings: OtdrSettings }
  | { type: 'power-meter'; nodeId: string; wavelengthNm: number; strand?: { tubeColor: FiberTubeColor; fiberColor: FiberTubeColor } }
  | { type: 'vfl'; spanId: string; fromNodeId: string }
  | { type: 'scope'; spanId: string; eventId: string }
  | { type: 'cli'; endpoint: Endpoint; command: string }
  | { type: 'truck-roll'; toNodeId: string }
  | { type: 'records'; nodeId?: string; spanId?: string }
  | { type: 'customer-contact'; customerId: string }
  | { type: 'hint' }
  | { type: 'excavate'; nodeId: string; method: 'hand' | 'machine'; distanceFromMarksInches: number }
  | { type: 'diagnosis'; diagnosis: Diagnosis };

export interface DiagnosisClaim {
  faultKind: string;                          // taxonomy id
  target: FaultTarget;
  positionMeters?: number;                    // fiber-span faults: position *on the span* (the UI converts from cursor distance; see 6.1)
  strand?: { tubeColor: FiberTubeColor; fiberColor: FiberTubeColor };
  evidenceActionIds: string[];
}
export interface Diagnosis {
  claims: DiagnosisClaim[];
  escalate?: { reason: string; evidenceActionIds: string[] };
  noFaultInScope?: boolean;                    // "nothing wrong in my scope"
}

export type ActionEvent = {
  id: string;                                  // `a${index}`
  index: number;
  atSimSeconds: number;                        // clock when the action started
  durationSeconds: number;
  locationNodeId: string;
} & (
  | { type: 'otdr-shot'; access: OtdrAccess; settings: OtdrSettings; events: DetectedEvent[]; violations: OtdrViolation[]; groundTruth: GroundTruthEvent[]; pathSpanIds: string[]; traceRef: string }
  | { type: 'power-meter'; nodeId: string; wavelengthNm: number; strand?: …; dbm: number | null }
  | { type: 'vfl'; spanId: string; fromNodeId: string; leaks: Array<{ positionMeters: number; kind: string }> }
  | { type: 'scope'; spanId: string; eventId: string; grade: 'pass' | 'fail' }
  | { type: 'cli'; endpoint: Endpoint; command: string; recognized: boolean; handlerId: string | null; facts: CliFact[]; outputRef: string }
  | { type: 'truck-roll'; fromNodeId: string; toNodeId: string }
  | { type: 'records'; nodeId?: string; spanId?: string; recordIds: string[] }
  | { type: 'customer-contact'; customerId: string; symptom: string }
  | { type: 'hint'; level: number; cost: number; text: string; refused: boolean }
  | { type: 'excavate'; nodeId: string; method: 'hand' | 'machine'; distanceFromMarksInches: number; strike: boolean }
  | { type: 'diagnosis'; diagnosis: Diagnosis }
  | { type: 'refused'; intent: Intent; reason: string }     // presence/inventory rule blocked it; costs 0; still logged for the replay
);
```
`traceRef`/`outputRef` are keys into `SessionState.blobs` (the full `OtdrTraceResult.samples` and CLI `output` lines), kept out of the action log so the log stays small enough to persist and to diff in tests.

```ts
export interface SessionState {
  meta: ScenarioMeta;
  world: WorldState;                           // current (config commands mutate it)
  initialWorld: WorldState;                    // frozen snapshot for scoring accuracy against appliedFaults
  profiles: ProfileSet;
  clockSeconds: number;
  locationNodeId: string;
  log: ActionEvent[];
  blobs: Record<string, unknown>;
  hintsUsed: number;
  cliSessions: Record<string, CliSession>;    // keyed by endpoint key `device:${id}` / `host:${id}`
  ended: null | { by: 'diagnosis' | 'safety-strike'; atSimSeconds: number };
}
```

## 5. Runner (`runner.ts`)

```ts
export function startSession(world: WorldState, profiles: ProfileSet, meta: ScenarioMeta): SessionState;
export function perform(state: SessionState, intent: Intent): { state: SessionState; result: PerformResult };
export type PerformResult =
  | { type: 'otdr-shot'; result: OtdrTraceResult }        // full result incl. samples for the UI; `hidden` is stripped here (UI never receives it)
  | { type: 'power-meter'; dbm: number | null }
  | { type: 'vfl'; leaks: … } | { type: 'scope'; grade; zones }
  | { type: 'cli'; result: CliResult }
  | { type: 'truck-roll' } | { type: 'records'; records: PlantRecord[] } | { type: 'customer-contact'; report: CustomerReport }
  | { type: 'hint'; text: string | null } | { type: 'excavate'; strike: boolean }
  | { type: 'diagnosis'; report: ScoreReport }
  | { type: 'refused'; reason: string };
```
Rules, in order, for every `perform`:
1. If `state.ended` → return `refused` ("scenario has ended") without logging.
2. Presence (`location.ts`): `otdr-shot` requires `locationNodeId === access.accessNodeId`; `power-meter`/`excavate` require presence at `nodeId`; `vfl` at `fromNodeId`; `scope` at either end node of the span; `cli` to a device requires `remoteCliAccess || presence at device.topologyNodeId (or the 'network-device' node whose attributes.deviceId matches)`; `cli` to a host requires presence at `host.premiseNodeId || remoteHostAccess`. Violations → log a `refused` event (duration 0) and return `refused`.
3. Inventory: `otdr-shot` requires `'otdr'` in `world.truckInventory`; a non-zero `launchCableMeters` requires an inventory item matching `/^launch-cable-(\d+)m$/` with length ≥ requested; `power-meter` requires `'power-meter'`; `vfl` `'vfl'`; `scope` `'inspection-scope'`. Missing → `refused`.
4. Execute the pure function, build the `ActionEvent` with `durationSeconds` from `costs.ts`, push, `clockSeconds += duration`.
5. `truck-roll` sets `locationNodeId`; duration = `travelSeconds.pairs` match (either direction) or `travelSeconds.default`. A roll to the current location is `refused`.
6. `hint`: policy `HINT_POLICY: Record<tier, { max: number; cost: number }>` = `{1:{max:∞,cost:0}, 2:{max:3,cost:5}, 3:{max:2,cost:10}, 4:{max:1,cost:15}, 5:{max:0,cost:0}, 6:{max:0,cost:0}}`; `level = hintsUsed`; text = `meta.hints[level] ?? null`; refused (logged with `refused:true`, cost 0) when `hintsUsed >= max` or no text remains.
7. `excavate`: `strike = (method === 'machine' && distanceFromMarksInches < region.toleranceZoneInches) || !ticketValid(node)` where `ticketValid` = `node.attributes.locateTicket` exists and `!expired` (the `locate-ticket-expired` fault writes this; a node with no ticket at all is invalid). A strike sets `ended = { by: 'safety-strike' }`.
8. `diagnosis`: sets `ended = { by: 'diagnosis' }`, then returns `scoreSession(state)`.
9. `cli`: uses `state.cliSessions[key]` (default `{ endpoint, mode: 'user-exec' }` — hosts always user-exec); stores the returned session; if `result.world !== state.world`, replace `state.world`.
`endSession(state)` = force-score an unfinished session (time budget expiry in the UI) as if `noFaultInScope` were submitted with no claims — used only by item 6's "give up" button.

Costs (`costs.ts`, seconds): `otdr-shot` = `result.simulatedSecondsElapsed`; `power-meter` 60; `vfl` 120; `scope` 90; `cli` = `result.simulatedSeconds`; `records` 60; `customer-contact` 120; `hint` 0; `excavate` 1800; `diagnosis` 0; `truck-roll` per meta; `refused` 0.

## 6. Scoring (`src/scoring/`)

```ts
export interface AxisScore { axis: 'diagnosticAccuracy' | 'evidenceQuality' | 'efficiency' | 'customerImpact' | 'safetyCompliance'; score: number; details: string[]; }
export interface ScoreReport {
  axes: Record<AxisScore['axis'], AxisScore>;
  total: number;                               // Open question 1
  endedBy: 'diagnosis' | 'safety-strike';
  overBudget: boolean;
  beatReference: boolean;
  matchedFaultIds: string[]; falsePositiveClaims: number; missedFaultIds: string[];
  replay: DecisionReplay;
}
export function scoreSession(state: SessionState): ScoreReport;   // pure
```

### 6.1 Diagnostic accuracy (`accuracy.ts`)
`trueFaults = initialWorld.appliedFaults.filter(f => !f.isRedHerring)`. A claim **matches** a fault iff `claim.faultKind === fault.kind` and targets match: `fiber-span` ⇒ same `spanId` ∧ (fault params have `positionMeters` ⇒ `|claim.positionMeters − params.positionMeters| ≤ meta.positionToleranceMeters`) ∧ (fault params have `tubeColor` ⇒ `claim.strand` equals `{tubeColor, fiberColor}`); `device-interface` ⇒ same device and interface; `device-global` ⇒ same device; `site` ⇒ same node. Greedy one-to-one matching in claim order. `TP`, `FP = unmatched claims`, `FN = unmatched true faults`.
- `trueFaults.length === 0`: score 100 if `noFaultInScope || escalate` and `claims.length === 0`; else `max(0, 100 − 50·claims.length)`.
- Otherwise `base = 100 · clamp((TP − 0.5·FP) / (TP + FN), 0, 1)`.
- Out-of-scope handling: for each matched fault with `outOfScope`, if `!diagnosis.escalate` subtract 20 ("found it, but it isn't yours to touch — escalate"). If every true fault is out of scope and the trainee escalated with zero claims, score 60 ("right instinct, no diagnosis").
- Hints: subtract `Σ hint.cost` over non-refused hints. Clamp to [0, 100].
The UI converts an OTDR cursor distance to a span position via `hidden`-free data: the UI knows the access node and launch span the trainee used; item 6 provides `distanceToSpanPosition(world, access, displayedMeters, iorSetting, network)` (pure, in `src/instruments/shared/opticalPath.ts`), which walks the same path with `n_true/n_setting` scaling and returns `{ spanId, positionMeters }`. A wrong IOR therefore produces a wrong claimed position — the teachable lands in the score.

### 6.2 Evidence quality (`evidence.ts`, `evidenceRules.ts`)
Vocabulary of **evidence predicates** over `(ActionEvent, fault, world)`:
- `otdrResolves(fault)`: an `otdr-shot` whose `groundTruth` has an entry with `eventId === fault.instanceId` and `resolved === true`.
- `otdrResolvesAtWavelengths(fault, n)`: `otdrResolves` satisfied by shots at ≥ n distinct `settings.wavelengthNm`.
- `otdrBidirectional(fault)`: `otdrResolves` satisfied by two shots whose `pathSpanIds` are reverses of each other.
- `otdrUnterminatedEndAt(nodeId)`: an `otdr-shot` whose `groundTruth` has `kind === 'unterminated-end'` with `resolved` and whose path ends at `nodeId` (the last `pathSpanIds` entry touches `nodeId`).
- `powerMeterAt(nodeId, pred: (dbm|null) => boolean)`.
- `vflLeakAt(spanId, positionMeters ± tolerance)`; `scopeFail(spanId, eventId)`.
- `records(nodeId | spanId)`.
- `cliFact(pred: (CliFact) => boolean)` and `cliFactOnDevice(deviceId, kind)`.
- `hostPing(hostId, target, delivered: 'all' | 'none' | 'partial')`; `hostApipa(hostId, reason?)`; `hostDnsFail(hostId)`.
- `ontStatus(ontId, status)`.
Rules: `EVIDENCE_RULES: Record<faultKind, EvidenceSet[]>` where an `EvidenceSet` is a list of predicates that must all hold (any set suffices). Exact table:

| fault kind | sufficient sets |
|---|---|
| fusion-splice-degraded | `[otdrResolves]` |
| connector-dirty | `[otdrResolves]` ; `[scopeFail]` |
| macrobend | `[otdrResolvesAtWavelengths(2)]` ; `[vflLeakAt]` ; `[otdrResolves, powerMeterAt(any downstream customer node, dbm < receivePower.minDbm)]` |
| fiber-break | `[otdrResolves]` ; `[powerMeterAt(downstream node, null), vflLeakAt]` |
| mismatched-fiber-splice | `[otdrBidirectional]` |
| wrong-tube-continuity | `[otdrUnterminatedEndAt(closure), records(closure)]` ; `[powerMeterAt(downstream node, null), powerMeterAt(closure, dbm ≠ null), records(closure)]` ; `[otdrUnterminatedEndAt(closure), otdrResolves? — n/a]` → use two sets only |
| fat-power-out-of-spec | `[powerMeterAt(node, dbm outside receivePower window)]` |
| ont-unpowered | `[ontStatus(ont,'offline'), powerMeterAt(ontNode, dbm ≥ receivePower.minDbm)]` ; `[cliFact host-addressing-observed no-link, powerMeterAt(ontNode, healthy)]` |
| ont-serial-mismatch | `[ontStatus(ont,'serial-mismatch')]` |
| rogue-ont | `[ontStatus(rogue,'rogue')]` ; `[cliFactOnDevice(olt,'ont-status-observed') ×≥2 with status los, cliFact(log-observed on olt)]` |
| vlan-wrong-access-port | `[cliFactOnDevice(dev,'interface-observed' ∨ 'vlan-table-observed'), hostApipa ∨ hostPing(gateway,'none')]` |
| trunk-missing-allowed-vlan | `[cliFactOnDevice(dev,'interface-observed') for the trunk, hostPing(gateway,'none')]` |
| trunk-native-vlan-mismatch | `[interface-observed on both trunk ends, hostPing(gateway,'none')]` |
| duplex-speed-mismatch | `[interface-observed(dev, iface) , hostPing(gateway,'partial') ∨ ping fact partial]` |
| port-security-violation-errdisabled | `[interface-observed ∨ log-observed on dev]` |
| stp-unexpected-blocking | `[interface-observed(dev, iface)]` |
| dhcp-relay-missing-helper | `[hostApipa('no-helper'), route-table-observed(dev) ∨ config-observed via show running-config]` |
| dhcp-scope-exhausted | `[hostApipa('scope-exhausted') ∨ hostApipa]`, `[cliFactOnDevice(dev,'route-table-observed')]` → single set `[hostApipa, any cli fact on dev]` |
| rogue-dhcp-server | `[host-addressing-observed (gateway ≠ SVI), hostPing(outside,'none'), hostPing(gateway ip of rogue,'none')]` → `[hostApipa? no]` → `[cliFact host-addressing-observed, hostPing(any outside IP,'none')]` |
| default-route-missing-or-wrong | `[route-table-observed(dev), hostPing(outside,'none') ∨ ping fact from dev to outside 'none', hostPing(gateway,'all')]` |
| subnet-mask-typo-overlap | `[route-table-observed(dev) ∨ interface-observed(dev, iface)]` |
| acl-silent-drop | `[config-observed(dev) (show running-config → route-table-observed & vlan-table-observed both from that action), hostPing(outside,'none'), hostPing(gateway,'all' ∨ 'none')]` |
| ospf-exstart-mtu-mismatch | `[cliFact ospf observed (handler show-ip-ospf-neighbor on dev), interface-observed(dev, iface)]` |
| dns-stale-record | `[dns-lookup fact with stale ∨ resolvedIp ≠ actual, hostPing(actualIp,'all')]` |
| dns-server-unresponsive | `[dns-lookup fact with serverHealth ∈ {down,degraded} ∨ hostDnsFail, hostPing(any IP,'all')]` ; `[hostDnsFail, ping fact from any device to the DNS server IP 'all']` |
| transceiver-rx-power-low | `[transceiver-observed(dev, iface) with rxPowerDbm < lowAlarm]` |
| locate-ticket-expired, dig-inside-tolerance-zone, aerial-* | `[records(node)]` ; `[truck-roll to node]` (presence = observation) |

Where a row above says "→", the *final* set listed is authoritative; implementer: encode exactly one or two sets per kind as the last clause states. Per matched claim: `1.0` if some set is satisfied using only actions in `claim.evidenceActionIds`; `0.6` if satisfied by any actions in the log; `0.3` if at least one predicate of some set is satisfied by cited actions; else `0`. Axis = `100 · mean` over matched claims. Special cases: correct escalation with zero claims on an all-out-of-scope world → evaluate the out-of-scope faults' rules against `escalate.evidenceActionIds`; correct `noFaultInScope` → 100 if the log contains ≥1 optical observation (otdr/power-meter/vfl/scope) **and** ≥1 logical observation (any cli fact) touching an affected customer's path, else 50; no matched claims and not a correct escalation → 0.

### 6.3 Efficiency (`efficiency.ts`)
`actual = state.clockSeconds` at diagnosis (or at strike). `ref = meta.referenceSolution.totalSeconds`. `score = 100 · clamp(ref / actual, 0, 1)`; `beatReference = actual < ref`. `overBudget = timeBudgetMinutes && actual > timeBudgetMinutes·60` ⇒ score = 0 (details explain). Details list the top three cost items by duration.

### 6.4 Customer impact (`customerImpact.ts`)
`affectedCustomerIds(world, profiles, meta)`: for each `customer-premise` node: affected if (its ONT's `deriveOntStatus` ≠ `'online'`) ∨ (its host's `resolveHostAddressing` is `apipa`) ∨ (`forward(host → gateway)` not delivered) ∨ (`resolveName(host, meta.serviceCheckHostname).ip === null`). Evaluated on `initialWorld` (faults persist; Stage 1 has no repairs). `customerMinutes = affected.length · actual/60`; `refMinutes = meta.referenceSolution.affectedCustomerMinutes` (= `affected.length · ref/60`, computed by item 5). `score = 100 · clamp(refMinutes / customerMinutes, 0, 1)` (100 when no customers are affected).

### 6.5 Safety and compliance (`safety.ts`)
Start at 100. `excavate` with `strike` ⇒ score 0, `endedBy = 'safety-strike'`. Each `otdr-shot` with an `in-band-test-on-live-pon` violation ⇒ −25. Each aerial compliance fault (`aerial-*`) on a node the trainee **rolled to** and did not include as a claim ⇒ −15 ("unreported hazard"). Each `excavate` with `method:'hand'` inside the tolerance zone ⇒ 0 penalty (that is the correct method). Clamp to [0, 100].

### 6.6 Decision replay (`replay.ts`)
```ts
export interface ReplayStep { actionId: string; index: number; atSimSeconds: number; durationSeconds: number; label: string; revealed: string[]; classification: 'on-path' | 'useful' | 'redundant' | 'unnecessary' | 'violation' | 'refused'; }
export interface DecisionReplay { steps: ReplayStep[]; referencePath: Array<{ label: string; matchedActionId: string | null }>; divergenceIndex: number | null; summary: string[]; }
```
Signature of an intent/action for matching: `otdr-shot` → `accessNodeId|launchSpanId|wavelengthNm|strand`; `power-meter` → `nodeId|strand`; `vfl` → `spanId`; `scope` → `eventId`; `cli` → `endpointKey|handlerId` (fall back to the first two tokens of the command); `truck-roll` → `toNodeId`; `records` → `nodeId|spanId`; `customer-contact` → `customerId`; `hint`/`excavate`/`diagnosis` → type. Classification: `violation` if the action carries a violation/strike; `refused` for refused events; `on-path` if its signature matches an as-yet-unmatched reference step (mark it matched); `redundant` if its signature equals an earlier action's; `useful` if it satisfies ≥1 evidence predicate for any true fault; else `unnecessary`. `divergenceIndex` = index of the first step not `on-path`. `revealed` = the predicate names it satisfied (e.g. `otdrResolves:f-macrobend-1`, `hostPing:gateway:none`). `label` templates live in `replay.ts` (e.g. `OTDR from ${nodeLabel} into ${spanLabel} @${wl} nm, ${pw} ns, ${avg}s`). `summary` = up to five sentences: accuracy verdict, the decisive evidence step, the first divergence and what the reference did instead, time vs. reference, safety note if any.

### 6.7 Orchestrator (`score.ts`)
Order: accuracy → evidence (needs matched pairs) → efficiency → customerImpact → safety → replay → total. Deterministic; no RNG.

## 7. Required tests (exact)

runner.test.ts
1. `otdr-shot` when not at the access node is logged as `refused` with duration 0 and does not advance the clock; after `truck-roll` to that node it succeeds and the clock advances by travel + `averagingSeconds + 20`.
2. `launchCableMeters: 500` is refused when inventory lacks `launch-cable-≥500m`, allowed with `launch-cable-500m`.
3. Hints: tier 2 allows exactly 3 non-refused hints at cost 5; the fourth is `refused`; tier 5 refuses the first.
4. `excavate` machine at 10 in with a 24-in tolerance zone ⇒ `strike`, `ended.by === 'safety-strike'`, subsequent intents refused; hand digging at 10 in ⇒ no strike; machine at 40 in with an expired ticket ⇒ strike.
5. A `cli` config command replaces `state.world`; a show command does not (`toBe` same reference).
6. `perform` never mutates its input state (`toEqual` snapshot before/after).

accuracy.test.ts
7. Correct kind + span + position within tolerance ⇒ 100; position off by `tolerance + 1` ⇒ 0 (FN 1, FP 1 ⇒ `(0 − 0.5)/1` clamps to 0).
8. Two true faults, one correct claim ⇒ 50; one correct + one wrong claim on a single-fault world ⇒ 50.
9. Red herring claimed alongside the true fault ⇒ 50; escalating on an all-out-of-scope world with the correct claim ⇒ 100, without escalating ⇒ 80, escalating with no claim ⇒ 60.
10. Empty true-fault world: `noFaultInScope` ⇒ 100; one claim ⇒ 50.
11. Hints subtract their cost (two tier-3 hints ⇒ −20).

evidence.test.ts
12. **Correct guess, no evidence ⇒ low:** macrobend claimed correctly with `evidenceActionIds: []` and an empty log ⇒ evidence 0; with two OTDR shots at 1310 and 1550 that resolve it, uncited ⇒ 60; cited ⇒ 100; a single-wavelength shot cited ⇒ 30.
13. `dns-stale-record`: cited `nslookup` (stale) + cited host ping to the actual IP (4/4) ⇒ 100; only the nslookup ⇒ 30.
14. `wrong-tube-continuity`: cited OTDR showing `unterminated-end` at the closure + cited records lookup ⇒ 100; records alone ⇒ 30.
15. Rule coverage: every id in `FAULT_TAXONOMY` has an `EVIDENCE_RULES` entry with ≥1 set (registry test).

efficiency.test.ts / customerImpact.test.ts / safety.test.ts
16. Efficiency: two sessions identical except one OTDR shot at 180 s vs 15 s averaging ⇒ the longer one scores strictly lower; `actual < ref` ⇒ 100 and `beatReference`.
17. Over budget ⇒ efficiency 0 with `overBudget: true`.
18. Customer impact: 4 affected customers for 30 simulated minutes vs a 10-minute reference ⇒ `100·(40/120) = 33`; a world with no affected customers ⇒ 100.
19. **Strike dominates:** a session with a perfect diagnosis but a machine dig inside the tolerance zone ⇒ `safetyCompliance 0`, `total 0`, `endedBy 'safety-strike'`, accuracy still reported as computed.
20. Two in-band live-PON shots ⇒ safety 50.

replay.test.ts
21. A session that follows the reference exactly ⇒ every step `on-path`, `divergenceIndex null`; inserting an unrelated `show vlan brief` at step 2 ⇒ that step `unnecessary` and `divergenceIndex === 1`; repeating an OTDR shot with identical settings ⇒ `redundant`.

## 8. Definition of done
All tests pass; `tsc -b` clean; `scoreSession` is deterministic (test runs it twice and `toEqual`s); the item-1/2/3 suites are untouched and pass (apart from the item-1 `createEmptyWorld` gaining `plantRecords: []`).
