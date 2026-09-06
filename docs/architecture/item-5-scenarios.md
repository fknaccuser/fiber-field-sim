# Item 5 — Scenario schema, loader, validator, and three reference scenarios

Status: architecture, ready to implement. Depends on items 2–4 (the validator runs each scenario's reference solution through the session runner and scorer).

## Open questions (defaults stated; not blocking)

1. **Place names.** The reference scenarios use fictional South-OC-flavored street names and RFC 5737/1918 addressing. If real plant labels/IP plans should be mirrored, that is YAML content only. Default: fictional.
2. **Live-service default.** When a span has no explicit `liveService`/strand `live`, the loader derives it (rule E15). Confirm that is acceptable rather than requiring explicit authoring. Default: derive, with a validator warning listing what was derived.
3. **Tier-5 remote host access.** The tier-5 scenario assumes the tech can talk a customer through `ipconfig`/`ping` by phone (`remoteHostAccess: true`). Default: allowed at tier ≥ 5.

## 1. Purpose and boundaries

A scenario is a YAML file, never code. It declares the world (topology, devices, links, hosts, records, reports), the fault set (with randomization ranges and red herrings), session metadata (tier, time budget, hints, travel, start location), and the authored reference solution. `instantiateScenario(definition, seed)` produces a `WorldState` + `ScenarioMeta` deterministically. The validator runs at load time (and in CI over every bundled scenario) so a trainee never sees a broken scenario.

## 2. Amendments to item 1 (additive)

- `FiberEvent.randomize?: never` — randomization lives in the *scenario* schema, not the world; nothing to add to world types beyond item 2–4 amendments.
- `src/world/types.ts`: add `TopologyNode.attributes` documented keys used by scenarios: `splitRatio`, `spliceMap`, `powered`, `requiresProvisioning`, `deviceId` (for `'network-device'` nodes), `opticalPowerDbm`, `locateTicket`. Add typed accessors in `worldState.ts` for `powered` and `deviceId`.

## 3. Module layout

```
src/scenarios/
  schema.ts            Zod: ScenarioDefinitionSchema and sub-schemas
  loader.ts            loadScenarioYaml(text): ScenarioDefinition; instantiateScenario(def, seed): { world, meta }
  randomize.ts         resolveRandomization(def, seed): ResolvedScenario
  validate.ts          validateScenario(def, profiles): ValidationIssue[]
  registry.ts          import.meta.glob of bundled ./library/*.yaml → listScenarios(), getScenario(id)
  library/
    t1-dark-ont-vista-court.yaml
    t4-wrong-roll-closure-7.yaml
    t5-everyones-down-nothings-broken.yaml
  index.ts
  schema.test.ts loader.test.ts randomize.test.ts validate.test.ts library.test.ts
```

## 4. Schema (`schema.ts`) — authoritative shape

```ts
const StrandRef = z.object({ tubeColor: TubeColor, fiberColor: TubeColor });
const NumberRange = z.object({ min: z.number(), max: z.number() });

export const ScenarioDefinitionSchema = z.object({
  id: z.string().regex(/^t[1-6]-[a-z0-9-]+$/),
  title: z.string(),
  tier: z.number().int().min(1).max(6),
  description: z.string(),
  today: z.string(),                                  // ISO date; plant-record dates are relative to this
  profiles: z.object({ network: z.string(), oltVendor: z.string(), switchVendor: z.string(), hostShell: z.string(), equipment: z.string(), otdrInstrument: z.string(), region: z.string() }),
  environment: z.object({ weather: z.string(), timeOfDay: z.string() }),
  truckInventory: z.array(z.string()),
  timeBudgetMinutes: z.number().positive().optional(),
  startLocationNodeId: z.string(),
  remoteCliAccess: z.boolean().default(true),
  remoteHostAccess: z.boolean().default(false),
  positionToleranceMeters: z.number().positive().default(10),
  serviceCheckHostname: z.string().default('portal.isp.net'),
  travelSeconds: z.object({ default: z.number().positive().default(900), pairs: z.array(z.object({ from: z.string(), to: z.string(), seconds: z.number().positive() })).default([]) }).default({}),
  topology: z.object({
    nodes: z.array(z.object({ id: z.string(), kind: NodeKind, label: z.string(), equipmentRef: z.string().optional(), attributes: z.record(z.unknown()).optional() })),
    spans: z.array(z.object({
      id: z.string(), fromNodeId: z.string(), toNodeId: z.string(), lengthMeters: z.number().positive(),
      randomize: z.object({ lengthMeters: NumberRange.optional() }).optional(),
      iorOverride: WavelengthTriple.optional(), fiberGeneration: z.enum(['legacy','low-water-peak']).optional(),
      liveService: z.boolean().optional(), backscatterOffsetDb: z.number().optional(),
      events: z.array(FiberEventSchema).default([]),          // FiberEventSchema mirrors world FiberEvent; kind 'splitter' allowed (inline)
      strands: z.array(z.object({ tubeColor: TubeColor, fiberColor: TubeColor, role: FiberRole, live: z.boolean().optional() })).optional(),
    })),
  }),
  devices: z.array(NetworkDeviceConfigSchema),        // mirrors world types incl. ponPorts, role, topologyNodeId, dnsResolverIp, dnsServerHealth
  links: z.array(NetworkLinkSchema).default([]),
  hosts: z.array(HostConfigSchema).default([]),
  plantRecords: z.array(PlantRecordSchema).default([]),
  customerReports: z.array(z.object({
    customerId: z.string(), premiseNodeId: z.string(),
    reportedSymptom: z.string(),
    phrasingVariants: z.array(z.string()).optional(),   // seed picks one (including reportedSymptom itself)
    isRedHerring: z.boolean().optional(),
  })),
  faults: z.array(FaultInstanceSchema.extend({
    isRedHerring: z.boolean().optional(), outOfScope: z.boolean().optional(),
    randomize: z.record(z.union([NumberRange, z.array(z.unknown())])).optional(),  // per-param: numeric range or choice list
  })),
  redHerringPool: z.object({ pick: z.number().int().min(0), from: z.array(FaultInstanceSchema) }).optional(),
  hints: z.array(z.string()).default([]),
  referenceSolution: z.object({ steps: z.array(IntentSchema), expectedClaims: z.array(DiagnosisClaimSchema.omit({ evidenceActionIds: true })).default([]) }),
});
```
`FaultInstanceSchema`: `{ instanceId, kind, target (discriminated union), params: record }`. `IntentSchema` mirrors item 4's `Intent` (a `diagnosis` step may reference evidence by **step index** with the syntax `"$3"` — the loader rewrites these to action ids when replaying, since ids are assigned at run time).

## 5. Instantiation (`loader.ts`, `randomize.ts`)

`instantiateScenario(def, seed)`:
1. `rng(label) = createRng(deriveSeed(seed, 'scenario', def.id, label))`.
2. Spans: for each with `randomize.lengthMeters`, `length = min + rng('span:'+id).next()·(max−min)` rounded to 1 m; events with `positionMeters > length` are clamped to `length` (validator W4 warns when any would clamp).
3. Faults: for each param in `randomize`: range ⇒ uniform (rounded to 2 decimals; integers when the schema field is `int`), list ⇒ `rng('fault:'+instanceId+':'+param).pick`. Red herrings: `rng('red-herrings').pick` without replacement `pick` times; each gets `isRedHerring: true`.
4. Customer reports: `reportedSymptom = rng('report:'+customerId).pick([reportedSymptom, ...phrasingVariants])`.
5. Build `WorldState` via `createEmptyWorld(seed, activeProfiles)` and fill; `world.id = ${def.id}#${seed}`.
6. Derive `liveService` (E15): DFS from every `olt` node along `from→to`; a span on such a path gets `liveService = true` unless authored; strands on such spans with `role ∈ {feeder, distribution, backbone}` get `live = true` unless authored.
7. Apply faults in file order (then red herrings) with `applyFault` — this is where item 1's runtime checks throw; the validator surfaces them as errors.
8. `ScenarioMeta` from the definition; `referenceSolution.totalSeconds` and `affectedCustomerMinutes` are **computed** by running the steps through `startSession`/`perform` on a fresh instantiation with the same seed (see validator E13) and cached on the meta.
Determinism test: `instantiateScenario(def, 42)` twice ⇒ `JSON.stringify` identical; seed 43 differs.

## 6. Validation (`validate.ts`) — `ValidationIssue = { severity: 'error' | 'warning'; code: string; path: string; message: string }`

Errors:
- E1 unique ids across nodes, spans, devices, hosts, links, faults, records, customer ids.
- E2 every span's `fromNodeId`/`toNodeId` exists; every link endpoint exists (device+interface or host); every host has exactly one attachment (`attachedOntNodeId` xor a link with `b.hostId`); `startLocationNodeId` exists; every `travelSeconds.pairs` node exists.
- E3 every fault `kind` ∈ `FAULT_TAXONOMY_BY_ID`; `params` parse against its schema (after randomization with the *minimum* of each range — and again with the maximum); target exists.
- E4 dry-run: instantiate with seeds `[def.seedProbe ?? 1, 2, 3]` and apply all faults; any throw ⇒ error with the fault id and message (catches missing strands, unknown interfaces).
- E5 splitter nodes: `attributes.splitRatio` present and in the network profile ladder; exactly one span with `toNodeId === splitter`.
- E6 orientation: every `ont` node is reached by DFS from some `olt` node along `from→to`; every `ponPorts[].spanId` exists and has `fromNodeId === olt.topologyNodeId`; every `OntRecord.ontNodeId` exists and is reachable from that port's span.
- E7 non-splitter nodes with > 1 continuing span must have `spliceMap` entries covering every strand of every stranded span incident to it that is *meant* to continue — operationally: `resolveTestPath` from each ONT toward the OLT and from each OLT port span toward each ONT must not throw `AmbiguousPathError`/`StrandRequiredError`.
- E8 `devices[].vendorProfileId` resolves in the referenced profile set; every device with `ponPorts` has `role: 'olt'` and `topologyNodeId`; every `dhcp` entry with helpers has a `scope`.
- E9 `profiles` ids resolve via `resolveProfileSet`.
- E10 `truckInventory` contains every instrument the reference solution uses, and any `launch-cable-Nm` it needs.
- E11 `referenceSolution`: run the steps through the runner on a fresh instantiation (seed 1); no step may be `refused`; the final step must be a `diagnosis`; `scoreSession` must yield `diagnosticAccuracy === 100`, `evidenceQuality === 100`, `safetyCompliance === 100`. `expectedClaims`, if given, must equal the diagnosis step's claims (minus evidence ids).
- E12 `hints.length ≥ HINT_POLICY[tier].max` when `max` is finite and > 0; tier 1 requires ≥ 3 hints.
- E13 fiber events on a span are within `[0, lengthMeters]` and sorted; `wrong-tube-continuity` fault params name a strand that exists on the target span; `spliceMap` entries reference incident spans.
- E14 red-herring pool items pass E3/E4 individually.

Warnings: W1 `'splitter'` event within 1 m of a splitter node end (double count); W2 tier ≥ 3 with no red herrings (`faults[].isRedHerring` or pool); W3 tier ≥ 2 without `timeBudgetMinutes`; W4 randomized span length would clamp an event; W5 derived live-service list (informational); W6 the reference solution has no `truck-roll` while `remoteCliAccess` is false (impossible to be anywhere).

`library.test.ts` loads every bundled scenario and asserts zero errors (warnings printed).

## 7. Reference scenarios — full specifications

Shared infrastructure block used by all three (author once; copy into each YAML — scenarios are self-contained files):

**Core devices**
- `dist-rtr-1` — `switch-cisco-ios`, role `l3-switch`, hostname `DIST-RTR-1`, platform `C9300-24T`. Interfaces: `TenGigabitEthernet1/0/1` trunk allowed `[100]` native 1 (to OLT uplink; transceiver present rx −7.9 tx 1.8 temp 41); `GigabitEthernet1/0/48` trunk allowed `[10]` (to `srv-sw-1`); `Vlan100` `10.100.0.1/24`; `Vlan10` `10.0.0.1/24`; `GigabitEthernet1/0/47` `203.0.113.1/24` (to `web-1`). Routes: none static (all connected). DHCP: `{ vlan: 100, helperAddresses: ['10.0.0.50'], scope: { network: '10.100.0.0/24', poolSize: 200, leased: 37 }, dnsServerIp: '10.0.0.53' }`. `dnsResolverIp: 10.0.0.53`. `logLines: []`.
- `srv-sw-1` — Cisco, role `switch`, `SRV-SW-1`: `Gi0/1` access 10 (dhcp-1), `Gi0/2` access 10 (dns-1), `Gi0/24` trunk allowed `[10]`.
- `dhcp-1` — Cisco profile as a stand-in "server" (role `server`, hostname `DHCP-1`): `eth0` (`GigabitEthernet0/0`) `10.0.0.50/24`; route `0.0.0.0/0 via 10.0.0.1`.
- `dns-1` — role `dns-server`, `DNS-1`: `GigabitEthernet0/0` `10.0.0.53/24`; default via `10.0.0.1`; `dnsRecords: [{ hostname: 'portal.isp.net', actualIp: '203.0.113.10' }, { hostname: 'speedtest.isp.net', actualIp: '203.0.113.20' }]`; `dnsServerHealth: 'ok'`.
- `web-1` — role `server`, `WEB-1`: `GigabitEthernet0/0` `203.0.113.10/24`; default via `203.0.113.1`. (A second address `203.0.113.20` on `GigabitEthernet0/1` linked to nothing is *not* allowed — instead `speedtest.isp.net` is served by `web-1` too: add interface `Loopback0`? Keep simple: only `portal.isp.net` is pingable; `speedtest.isp.net` resolves but is unreachable — a deliberate realism detail the reference never uses.)
- `olt-1-dev` — `olt-calix-e7-2`, role `olt`, hostname `OLT-POP1-E72-1`, `topologyNodeId: olt-1`: `TenGigabitEthernet1/1` trunk allowed `[100]` (uplink; transceiver rx −8.2 tx 2.1), `ponPorts` per scenario.
**Links**: `olt-1-dev Te1/1 ↔ dist-rtr-1 Te1/0/1`; `dist Gi1/0/48 ↔ srv-sw-1 Gi0/24`; `srv-sw-1 Gi0/1 ↔ dhcp-1 Gi0/0`; `srv-sw-1 Gi0/2 ↔ dns-1 Gi0/0`; `dist Gi1/0/47 ↔ web-1 Gi0/0`.
**Common nodes**: `olt-1` (kind olt, label "POP 1 — OLT rack"), `yard-1` (kind `network-device`? no — use kind `'terminal'` is wrong; add `NodeKind` value `'yard'` **(amendment: extend `NodeKind` with `'yard'` and `'pop'`)** label "Truck yard").
**Profiles**: `{ network: xgs-pon-default, oltVendor: olt-calix-e7-2, switchVendor: switch-cisco-ios, hostShell: host-windows, equipment: hexatronic-commscope-default, otdrInstrument: otdr-exfo-maxtester-730c, region: ca-south-oc-digalert }`.
**Truck inventory**: `[otdr, power-meter, vfl, inspection-scope, launch-cable-500m, laptop]`.

### 7.1 `t1-dark-ont-vista-court` — tier 1, guided, `ont-unpowered`

`today: 2026-09-05`, weather `clear`, `timeOfDay: 10:30`, no time budget, `startLocationNodeId: prem-vista-114`, `remoteCliAccess: true`, `hints`:
1. "Before you test anything: what do the ONT's status LEDs tell you about power versus light?"
2. "Ask the OLT. `show ont status` tells you whether the ONT is reporting loss of signal or simply went dark."
3. "If the OLT says the ONT went dark and your power meter still sees healthy light at the ONT's input, the fiber isn't the problem."

Topology nodes: `olt-1`; `fdh-a` (`fdh`, "FDH A — Vista Ct & Calle Sol", equipmentRef `fdh-cabinet-450-series`); `fdh-a-spl1` (`splitter`, attributes `{ splitRatio: '1x32' }`); `term-a-12` (`terminal`, equipmentRef `distribution-terminal-32`, "NAP A-12, 114 Vista Ct pedestal"); `ont-vista-114` (`ont`, attributes `{ powered: true }` — the fault flips it); `prem-vista-114` (`customer-premise`, "114 Vista Court").
Spans (from → to): `sp-feeder-a` `olt-1 → fdh-a-spl1` 2100 m, events `[connector-apc @0 loss 0.25 refl −60 (id ev-olt-panel), fusion-splice @1200 loss 0.05 (ev-f1)]`; `sp-dist-a-12` `fdh-a-spl1 → term-a-12` 850 m, events `[connector-apc @0 0.3 −60 (ev-spl-out-12), fusion-splice @400 0.04]`; `sp-drop-114` `term-a-12 → ont-vista-114` 65 m, events `[connector-apc @0 0.3 −60 (ev-nap-port), connector-apc @65 0.3 −60 (ev-ont-jack)]`.
Devices: core block; `olt-1-dev.ponPorts = [{ id: '1/1/xp1', adminStatus: up, spanId: sp-feeder-a, onts: [{ ontId: '1/1/xp1/14', serial: 'CXNK00A1B2C3', provisionedSerial: 'CXNK00A1B2C3', ontNodeId: ont-vista-114 }] }]`.
Hosts: `laptop-114` — premise `prem-vista-114`, mac `02:11:4a:00:01:14`, `attachedOntNodeId: ont-vista-114`, vlan 100, dhcp.
Customer report: `cust-114`, premise `prem-vista-114`, "All the lights on the fiber box are off and the internet's out." variants: ["The internet's down and that little box on the wall is completely dark.", "No internet since this morning; the box has no lights at all."]
Faults: `[{ instanceId: f-ont-114-unpowered, kind: ont-unpowered, target: { type: site, nodeId: ont-vista-114 }, params: {} }]`.
Expected optics (documents the physics; used by the tests): path loss OLT→ONT at 1577 (→'1550' table) = 0.25 + 0.05 + 2.1·0.21 (0.441) + 17.5 + 0.3 + 0.04 + 0.85·0.21 (0.179) + 0.3 + 0.065·0.21 (0.014) + 0.3 = **19.42 dB** ⇒ power at the ONT input ≈ **−15.4 dBm** (healthy, inside −8…−27).
Reference solution: `[ cli olt-1-dev "show ont status" , power-meter @ ont-vista-114 1577 , diagnosis { claims: [{ faultKind: ont-unpowered, target: site ont-vista-114, evidenceActionIds: ["$0","$1"] }] } ]`. Expected result: accuracy 100, evidence 100 (`ontStatus offline` + healthy power), efficiency 100 (≈ 75 s).

### 7.2 `t4-wrong-roll-closure-7` — tier 4, `wrong-tube-continuity` with red herrings

`today: 2026-09-05`, weather `overcast`, `timeOfDay: 14:10`, `timeBudgetMinutes: 90`, `startLocationNodeId: yard-1`, `remoteCliAccess: true`, `travelSeconds: { default: 900, pairs: [ {yard-1, fdh-b, 1200}, {fdh-b, cl-7, 480}, {yard-1, cl-7, 1080}, {fdh-b, fdh-c, 420} ] }`, `hints: ["What do the four affected addresses have in common? Check the port assignments."]` (tier 4 allows 1 hint, cost 15).

Nodes: `olt-1`, `yard-1`; `cl-7` (`splice-closure`, "Closure 7 — Antonio Pkwy @ Cow Camp", attributes `spliceMap` below); `fdh-b`, `fdh-b-spl1` (splitter 1x32); `fdh-c`, `fdh-c-spl1` (splitter 1x32); terminals `term-b-3`, `term-b-8`, `term-c-2`; ONTs `ont-b-301`, `ont-b-305`, `ont-b-812`, `ont-b-819`, `ont-c-204`; premises `prem-b-301` "301 Paseo Vista", `prem-b-305`, `prem-b-812` "812 Camino Alto", `prem-b-819`, `prem-c-204` "204 Via Ladera".
Spans:
- `sp-feeder-main` `olt-1 → cl-7` **1980 m**, `randomize: { lengthMeters: { min: 1900, max: 2100 } }`, `strands: [ {blue,blue,feeder}, {blue,orange,distribution}, {blue,green,dark}, {blue,brown,spare} ]`, events `[connector-apc @0 0.25 −60 (ev-panel-main)]`.
- `sp-cl7-fdhc` `cl-7 → fdh-c-spl1` 410 m, strands `[{blue,blue,feeder}]`, events `[connector-apc @410 0.3 −60]`.
- `sp-cl7-fdhb` `cl-7 → fdh-b-spl1` 640 m, strands `[{blue,orange,distribution}]`, events `[connector-apc @640 0.3 −60 (ev-fdhb-in)]`.
- `sp-dist-b-3` `fdh-b-spl1 → term-b-3` 520 m: `[connector-upc @0 loss 0.65 refl −48 (ev-b3-out — the within-spec dirty-ish connector red herring; NOT a fault)]`; `sp-dist-b-8` `fdh-b-spl1 → term-b-8` 910 m: `[connector-apc @0 0.3 −60, fusion-splice @450 0.06]`; `sp-dist-c-2` `fdh-c-spl1 → term-c-2` 730 m: `[connector-apc @0 0.3 −60]`.
- Drops (terminal → ONT, all `[connector-apc @0 0.3 −60, connector-apc @end 0.3 −60]`): `sp-drop-b-301` 48 m, `sp-drop-b-305` 71 m, `sp-drop-b-812` 55 m, `sp-drop-b-819` 92 m, `sp-drop-c-204` 60 m.
`cl-7.attributes.spliceMap` (the **actual, wrong** state of the tray):
```yaml
spliceMap:
  - { fromSpanId: sp-feeder-main, fromStrand: {tubeColor: blue, fiberColor: blue},  toSpanId: sp-cl7-fdhc, toStrand: {tubeColor: blue, fiberColor: blue} }
  - { fromSpanId: sp-feeder-main, fromStrand: {tubeColor: blue, fiberColor: green}, toSpanId: sp-cl7-fdhb, toStrand: {tubeColor: blue, fiberColor: orange} }
```
(No entry for feeder blue/orange — it was left unspliced in the tray.)
Devices: core block; `olt-1-dev.ponPorts = [ { id: '1/1/xp1', spanId: sp-feeder-main, onts: [b-301 '1/1/xp1/1' CXNK00B30100, b-305 '…/2', b-812 '…/3', b-819 '…/4'] }, { id: '1/1/xp2', spanId: sp-feeder-main, onts: [c-204 '1/1/xp2/1'] } ]` — **note** two PON ports on one feeder *cable* is fine: port xp1 is patched to strand blue/orange, xp2 to blue/blue. Add `PonPortState.strand?: StrandRef` (**amendment to item 3's type**; `pathLossDb` from the OLT starts on that strand). Also a **red-herring network fault**: `dist-rtr-1` gets an unused `GigabitEthernet1/0/20` (access 100, notconnect).
Hosts: `laptop-b-301`, `laptop-b-812` (behind their ONTs, vlan 100, dhcp); `laptop-c-204` likewise.
Plant records:
- `rec-fdhb-ports` (`port-assignment`, node `fdh-b`, date 2026-03-14): "FDH B fed from CL-7 splice, feeder cable 144f, TUBE BLUE / FIBER ORANGE → FDH-B splitter input", "Splitter 1x32 SPL1X32-B, ports 1–32 → NAP B-1..B-8".
- `rec-cl7-wo` (`work-order`, node `cl-7`, date **2026-09-03**): "WO 44812: Roll FDH-B distribution to new 96f cable (sp-cl7-fdhb). Splice feeder BLUE/ORANGE → new cable BLUE/ORANGE. Tech: [redacted]. Closed 09-03 16:40."
- `rec-cl7-sheet` (`splice-sheet`, node `cl-7`, date 2026-09-03): "Tray 1: BLUE tube. Blue→Blue (FDH-C feed) OK. Orange→ Orange (FDH-B feed) OK. Green: dark. Brown: spare." (the sheet is *what the tech wrote*, not what he did — a classic).
Customer reports (all premises on FDH-B, `isRedHerring` false): `cust-b-301` "Internet dead since yesterday evening, box light is red." variants ["No service since about 5 last night.", "The fiber box has a red light and nothing works."]; `cust-b-305` "Everything went out around dinner time."; `cust-b-812` "TV and internet down. Neighbor's out too."; `cust-b-819` "Red alarm light on the ONT, no internet." Red herring report: `cust-c-204` (`isRedHerring: true`) "Internet gets slow every night around 8." variants ["Wi-Fi drops in the evenings.", "Streaming buffers at night."].
Faults:
```yaml
- instanceId: f-cl7-wrong-roll
  kind: wrong-tube-continuity
  target: { type: fiber-span, spanId: sp-feeder-main }
  params: { tubeColor: blue, fiberColor: orange, rollType: spliced-into-dark-spare, actualTubeColor: blue, actualFiberColor: green }
- instanceId: rh-stp-unused-port
  kind: stp-unexpected-blocking
  isRedHerring: true
  target: { type: device-interface, deviceId: dist-rtr-1, interfaceId: GigabitEthernet1/0/20 }
  params: {}
```
`redHerringPool: { pick: 1, from: [ { rh-fusion-b8: fusion-splice-degraded on sp-dist-b-8 @450 lossDb 0.18 } , { rh-macrobend-c: macrobend light on sp-drop-c-204 @30 } ] }`.
What the instruments show (documents expected behavior; the validator's reference run asserts the scoring outcome, `trace.test`-style assertions live in `library.test.ts`):
- OLT `show ont status`: xp1's four ONTs `los`; xp2's `online`.
- Power meter at `fdh-b-spl1` (input, strand n/a: the span `sp-cl7-fdhb` has one strand) at 1577 ⇒ **null** (the FDH-B feed is the dark green fiber).
- OTDR from `fdh-b-spl1` into `sp-cl7-fdhb` strand blue/orange, 1550 nm, 100 ns, range 5000, launch 500: launch connector at 500, fusion splice (the wrong roll, ~0.05, non-reflective) at 500 + 640 = 1140, then 1980 m of feeder (on the *green* fiber, dark) ending **unterminated (−14 dB) at ≈ 3120 m** — in a healthy plant this end would be at the OLT panel with −60 dB and there would be light.
- OTDR from `cl-7` into `sp-feeder-main` strand blue/orange toward the OLT at **1625 nm** (blue/blue on the same cable is live; orange itself is dead so 1550 is also legal — the validator's derived-live rule marks only blue/blue live): ends at 1980 m with −60 dB (patched to xp1) — light *is* arriving on orange at cl-7: power meter at `cl-7` on strand blue/orange (`Intent.power-meter.strand`) reads `4.0 − 0.25 − 0.416 ≈ +3.3 dBm`.
- OTDR from `olt-1` into `sp-feeder-main` blue/orange downstream: **unterminated end at 1980 m** (no splice-map entry for orange; the fault also set `continuityBroken`).
Reference solution (9 steps, ≈ 46 min): `customer-contact cust-b-301`, `customer-contact cust-b-812`, `records fdh-b` (port assignment ⇒ common element FDH-B, fed via CL-7 blue/orange), `records cl-7` (work order two days ago), `cli olt-1-dev "show ont status"`, `truck-roll fdh-b`, `power-meter fdh-b-spl1 1577` (null), `otdr-shot from fdh-b-spl1 into sp-cl7-fdhb strand blue/orange {1550, 100 ns, 5000 m, ior 1.4682, 30 s, launch 500, receive 0}` (ends −14 at OLT distance), `diagnosis { claims: [{ faultKind: wrong-tube-continuity, target: fiber-span sp-feeder-main, strand: {blue, orange}, evidenceActionIds: ["$3","$7"] }] }` ⇒ evidence set A (`otdrUnterminatedEndAt(cl-7)`… **note**: the unterminated end observed from FDH-B is at the *OLT* node, not the closure — so set A must be satisfied by the OLT-side or closure-side shot. Adjust the reference: after step 7, add `truck-roll cl-7`, `power-meter cl-7 1577 strand blue/orange` (+3.3 dBm — light present upstream of the splice), then diagnosis citing `["$3","$6","$9"]` ⇒ set B (`powerMeterAt(fdh-b-spl1, null)`, `powerMeterAt(cl-7, ≠ null)`, `records(cl-7)`). Total ≈ 58 min, within the 90-min budget. The shorter OTDR-only path is *useful* but not sufficient alone — by design: the tech must prove light exists upstream of the roll.
Expected claims: as above. Affected customers: 4 (all FDH-B) ⇒ `affectedCustomerMinutes ≈ 4 × 58`.

### 7.3 `t5-everyones-down-nothings-broken` — tier 5, `dns-server-unresponsive` (out of scope), optical-vs-logical

`today: 2026-09-05`, weather `clear`, `timeOfDay: 19:45`, `timeBudgetMinutes: 60`, `startLocationNodeId: yard-1`, `remoteCliAccess: true`, **`remoteHostAccess: true`**, `travelSeconds.default: 900`, `hints: []` (tier 5: none).
Nodes: `olt-1`, `yard-1`, `fdh-a`/`fdh-a-spl1` (1x32), `fdh-b`/`fdh-b-spl1` (1x32), terminals `term-a-2`, `term-a-7`, `term-b-4`, ONTs `ont-a-201`, `ont-a-209`, `ont-a-716`, `ont-b-402`, `ont-b-411`, `ont-b-433`, premises for each.
Spans: `sp-feeder-a` `olt-1 → fdh-a-spl1` 2100 m `[connector-apc @0 0.25 −60]`; `sp-feeder-b` `olt-1 → fdh-b-spl1` 2620 m `[connector-apc @0 0.25 −60, fusion-splice @1980 0.05]`; distribution `sp-dist-a-2` 600 m, `sp-dist-a-7` 1150 m, `sp-dist-b-4` 880 m (each `[connector-apc @0 0.3 −60]`); drops 40–95 m as in 7.2. `ont-b-433`'s drop `sp-drop-b-433` is **95 m + 3 × connector pairs** (an extra mid-drop connector: `connector-apc @40 0.35 −58`) so its ONT reads ≈ −26.4 dBm — in spec, near the edge: the optical red herring nobody should chase.
Devices: core block with `ponPorts = [ { '1/1/xp1', sp-feeder-a, onts a-201/a-209/a-716 }, { '1/1/xp2', sp-feeder-b, onts b-402/b-411/b-433 } ]`; OLT gets a second uplink `TenGigabitEthernet1/2` **administratively down** with `transceiver { present, rxPowerDbm: −31 }` (red herring: a low-Rx alarm on a shut, unused port). `dns-1.dnsServerHealth` is the fault target.
Hosts: `laptop-a-201`, `laptop-a-716`, `laptop-b-402`, `laptop-b-433` (behind ONTs, vlan 100, dhcp).
Plant records: `rec-pop1-uplinks` (`as-built`, node `olt-1`): "OLT-POP1-E72-1 uplinks: Te1/1 active → DIST-RTR-1 Te1/0/1; Te1/2 spare (unpatched, admin down)."
Customer reports (none are red herrings — everyone really is down): `cust-a-201` "Internet says connected but nothing loads." variants ["Wi-Fi's connected, pages just spin.", "Netflix says 'no internet' but the box lights are all green."]; `cust-a-716` "Can't get to any websites since about 7:30."; `cust-b-402` "Work VPN won't connect, browser won't load anything."; `cust-b-433` "Internet's been flaky since the storm last week and now it's dead." (the misleading detail is inside a true report).
Faults:
```yaml
- instanceId: f-dns-down
  kind: dns-server-unresponsive
  outOfScope: true
  target: { type: device-global, deviceId: dns-1 }
  params: { health: down }
- instanceId: rh-olt-te12-rx
  kind: transceiver-rx-power-low
  isRedHerring: true
  target: { type: device-interface, deviceId: olt-1-dev, interfaceId: TenGigabitEthernet1/2 }
  params: { rxPowerDbm: -31 }
```
`redHerringPool: { pick: 1, from: [ macrobend light on sp-drop-a-209 @20 (ONT still online), fusion-splice-degraded on sp-dist-a-7 @600 lossDb 0.15 ] }`.
What the instruments show: OLT `show ont status` — all six `online`, Rx between −15 and −26.4; `show alarms` — `RX-LOW` is **not** raised (the port is admin down; the alarm derivation must skip admin-down interfaces — **rule for item 3's `olt-show-alarms`: only admin-up interfaces contribute transceiver alarms**; `show interfaces transceiver detail` still shows `--` on Te1/2). Host `laptop-a-201`: `ipconfig` normal (10.100.0.1xx, gateway 10.100.0.1, DNS 10.0.0.53); `ping 10.100.0.1` 4/4; `ping 203.0.113.10` 4/4; `ping portal.isp.net` ⇒ "could not find host"; `nslookup portal.isp.net` ⇒ `DNS request timed out` ×2 then `*** UnKnown can't find`. From `dist-rtr-1`: `ping 10.0.0.53` 4/4 (the server is up at L3; the *service* is dead). 
Reference solution (≈ 14 min, no truck roll): `customer-contact cust-a-201`, `customer-contact cust-b-402` (two FDHs ⇒ not a plant segment), `cli olt-1-dev "show ont status"` (all online ⇒ optical ruled out), `cli host laptop-a-201 "ipconfig"`, `cli host laptop-a-201 "ping 10.100.0.1"`, `cli host laptop-a-201 "ping 203.0.113.10"`, `cli host laptop-a-201 "ping portal.isp.net"`, `cli host laptop-a-201 "nslookup portal.isp.net"`, `cli dist-rtr-1 "ping 10.0.0.53"`, `diagnosis { claims: [{ faultKind: dns-server-unresponsive, target: device-global dns-1, evidenceActionIds: ["$7","$5"] }], escalate: { reason: "DNS service down on DNS-1; hosts resolve nothing, IP connectivity intact, all ONTs online. Needs NOC/IT.", evidenceActionIds: ["$2","$5","$7","$8"] } }`. Expected: accuracy 100 (claim + escalate), evidence 100 (set 1: dns-lookup with serverHealth down + host ping by IP 4/4), efficiency 100. A trainee who rolls a truck to FDH-A "because 433 has low light" pays 15 min and gets nothing.

## 8. Required tests (exact)

schema.test.ts
1. Each bundled YAML parses through `ScenarioDefinitionSchema`; a YAML missing `referenceSolution` fails with a path pointing at it.

loader.test.ts / randomize.test.ts
2. **Determinism:** `instantiateScenario(t4, 42)` twice ⇒ identical `JSON.stringify(world)` and identical `meta`; seed 43 ⇒ a different `sp-feeder-main.lengthMeters` (with overwhelming probability — assert over seeds 1..20 that at least two distinct lengths occur) and all lengths within `[1900, 2100]`.
3. Red herring pick is deterministic per seed and always exactly `pick` items, each with `isRedHerring: true`.
4. Customer phrasing for `cust-b-301` under seed 7 equals the value chosen by `createRng(deriveSeed(7,'scenario','t4-wrong-roll-closure-7','report:cust-b-301')).pick([...])` (the test recomputes it independently).
5. Derived live-service: in t4, `sp-cl7-fdhc` is live; feeder strand blue/blue `live: true`, blue/orange `live` false (dead after the roll — **the derivation must run after faults are applied**: a strand with `continuityBroken` downstream of the break is not live; specify: derive before applying faults, then after applying faults clear `live` on strands with `continuityBroken`), green/brown not live.

validate.test.ts
6. A scenario whose fault targets a nonexistent span fails with `E3`/`E4` and a message containing the fault id and span id.
7. Removing `splitRatio` from a splitter node ⇒ `E5`; reversing a span's from/to so an ONT is unreachable ⇒ `E6`; deleting the `cl-7` spliceMap ⇒ `E7` (`AmbiguousPathError` surfaced); a reference solution that skips the `power-meter cl-7` step ⇒ `E11` (evidence < 100) with the achieved axis values in the message.
8. Warnings: t1 produces `W2`? No — tier 1; t4 with `redHerringPool` removed and the STP red herring removed ⇒ `W2`.

library.test.ts (the three reference scenarios are the integration suite for items 2–4)
9. All three validate with zero errors.
10. t1: reference run ⇒ `diagnosticAccuracy 100`, `evidenceQuality 100`, `safetyCompliance 100`, `efficiency 100`; the power-meter step reads `−15.4 ± 0.4` dBm; `show ont status` output contains `offline`.
11. t4: reference run scores 100/100/100 on accuracy/evidence/safety; the OTDR step's event table ends with an `end-of-fiber` whose `reflectanceDb ≤ −12` at `3120 ± 40` m (seed 1 length 1980 — pin the seed); the `cl-7` power meter reads `> +2` dBm; `show ont status` lists exactly four `los`; an alternate session that submits the same claim citing only the FDH-B OTDR shot scores evidence `30`.
12. t5: reference run scores 100/100/100 with **zero** `truck-roll` actions; `show ont status` shows six `online`; an alternate session that adds `truck-roll fdh-a` scores efficiency `< 100`; an alternate diagnosis that claims `transceiver-rx-power-low` on `Te1/2` instead scores accuracy `0` (red herring) and the replay marks the transceiver observation `unnecessary`; claiming the DNS fault **without** `escalate` scores accuracy `80`.
13. `listScenarios()` returns the three ids sorted by tier.

## 9. Definition of done
All tests pass; `tsc -b` clean; `docs/architecture/item-5-scenarios.md` §7's expected numbers match the implementation (if a physics constant makes a documented expected value drift by more than the stated tolerance, fix the *document* only after confirming the implementation matches items 2–3 exactly — the doc is not the source of truth for physics, items 2–3 are).
