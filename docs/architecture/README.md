# Architecture — build items 2 through 9

Item 1 (world model, fault taxonomy, profiles layer) is implemented and tested in `src/world` and `src/profiles`. Items 2–8 are **implemented**. Item 9 is **partially implemented**: [stow/raise and Back](item-9-stow-raise.md), the field-console theme and the truck/tool shelf are done; the cabinet, blueprint map, roles, prep and comms are not. **Item 10 is the active brief.**

Items 2–6 were written as forward specs and implemented in order. Items 7–8 are written after the fact: what was built, how it works, and an honest list of what was not finished. Item 9 is a work order for a fresh session.

| Item | Document | Status | Delivers |
|---|---|---|---|
| 2 | [item-2-otdr.md](item-2-otdr.md) | built | Seeded PRNG, profile registry, shared optical-path resolver, OTDR physics + event table + ghosts + bidirectional averaging, power meter / VFL / inspection scope, canvas trace renderer, dev preview |
| 3 | [item-3-cli.md](item-3-cli.md) | built | Vendor-profile-driven command matcher, Cisco IOS handlers, Calix OLT handlers with derived ONT status, Windows host shell, L2/L3 forwarding, DNS and DHCP derivation |
| 4 | [item-4-scoring.md](item-4-scoring.md) | built | Session runner (intents → action log, presence/inventory/time rules), five-axis scorer, evidence rules for every fault kind, decision replay |
| 5 | [item-5-scenarios.md](item-5-scenarios.md) | built | Scenario YAML schema, seeded instantiation, validator (incl. reference-solution proof), three fully specified reference scenarios (tiers 1, 4, 5) |
| 6 | [item-6-ui.md](item-6-ui.md) | built | PWA shell, Dexie persistence, field session screen, MaxTester-style OTDR panel, tap-token terminal, replay and progress views |
| 7 | [item-7-viewports.md](item-7-viewports.md) | built | Viewport architecture (mount policy, state that survives unmounting), 3D topology map bound to the action log, procedural fiber-scope end-face |
| 8 | [item-8-generator-and-world.md](item-8-generator-and-world.md) | built | Unlimited procedural scenarios from parameters + seed, and the physical 3D outside-plant world (street, houses, NID, ONT, handhole, splice closure, FDH, POP) with instruments you hold |
| 9 | [item-9-SPEC-simulator-shell.md](item-9-SPEC-simulator-shell.md) | partly built | Truck-and-tool-shelf navigation, stow/raise, the real cabinet modelled from photographs, blueprint map, role-based difficulty, prep phase, live comms. Built: [stow/raise](item-9-stow-raise.md), the console theme, the truck/tool shelf. |
| 10 | [item-10-SPEC-the-experience.md](item-10-SPEC-the-experience.md) | **spec only — active brief** | The teaching layer (tiered step guidance + the post-diagnosis debrief), the loading screen and dispatch dashboard, first-person framing, the two visual registers |

**Starting work?** Read item 7 and item 8 for the current state of the UI and world layers, then **item 10 — it is the active brief and supersedes item 9**. Item 9 stays authoritative for the cabinet description and for roles/prep/comms.

`docs/reference/*.jpg` are photographs of the real cabinet the world must emulate. They are deliberately **not committed** (they show a real operator's plant) — ask the project owner for them.

## Cross-item amendments to item 1 (all additive)

Each document opens with an "Amendments to item 1" section. Collected here so the implementer can see the whole surface; apply each in the item that introduces it.

- **Item 2:** `src/world/random.ts` (mulberry32 + FNV-1a `deriveSeed`); `src/profiles/registry.ts` (`resolveProfileSet`); network-profile defaults for backscatter coefficient, water peak, OLT/ONT Tx power; instrument-profile defaults for dead-zone factor, spec conditions, averaging options, front-panel reflectance, saturation, live-traffic penalty, ghost thresholds, sample count; `FiberSpan.liveService/fiberGeneration/backscatterOffsetDb`; `FiberEvent.trueLossDb`; `FiberStrand.live`; `SpliceMapEntry` at `TopologyNode.attributes.spliceMap`; splitter-node convention (`attributes.splitRatio`, one upstream span).
- **Item 3:** `InterfaceState.ipAddress/prefixLength/description/macAddress/mtu`; `DhcpConfig.dnsServerIp`; structured `AclRule.match/appliedTo`; `PonPortState`/`OntRecord` (+ `PonPortState.strand`, added in item 5); `NetworkDeviceConfig.role/platform/topologyNodeId/ponPorts/dnsResolverIp/dnsServerHealth`; `WorldState.links` and `hosts`; new faults `ont-unpowered` (domain `cpe`), `ont-serial-mismatch`, `rogue-ont`, `dns-server-unresponsive`; param extensions on four existing faults; `VendorProfileSchema` rewritten (mode prompts, handlers, messages, interface families, thresholds) with all three vendor YAMLs; `ProfileSet.hostShell`.
- **Item 4:** `FaultInstance.isRedHerring/outOfScope`; `PlantRecord` and `WorldState.plantRecords`.
- **Item 5:** `NodeKind` gains `'yard'` and `'pop'`; documented `TopologyNode.attributes` keys with typed accessors.
- **Item 6:** `redactForUi` in the runner; `fake-indexeddb` dev dependency.

## Invariants every item must keep

1. Instruments are pure functions of `WorldState` + settings + profiles. No canned output anywhere.
2. Anything vendor-, model-, or region-specific lives in `src/profiles/*.yaml`. Engine code may not contain such constants.
3. `hidden`/ground-truth data (`OtdrTraceResult.hidden`, `ActionEvent.groundTruth`, `WorldState.appliedFaults`) never reaches `src/ui/**`. A source-grep test enforces it.
4. Same seed ⇒ identical world, identical trace, identical score.
5. Item 1's existing tests keep passing with only the adjustments each document explicitly names.

## Confirmed facts baked into the profiles (do not re-derive)

XGS-PON only (1577/1270 nm service; 1310/1550/1625 nm OTDR test; 1625/1650 nm out-of-band live test; N1/N2/E1/E2 budgets; 1x2–1x64 splitters). OLT: Calix E7-2 (AXOS). Hexatronic splitters/splice hardware; CommScope ~450-series cabinet; 32-port distribution terminals (confirmed); 192 at the POP (needs confirmation — plausibly six E7-2 chassis × 32 ports). OTDR: EXFO MaxTester 730C (exact model needs confirmation). Region: South Orange County, DigAlert (USA South) under Cal. Gov. Code §4216. Cisco IOS dialect for switches/routers, access/distribution layer only; backbone routing deferred. Tube/fiber rolling and continuity tracing is a first-class scenario type.
