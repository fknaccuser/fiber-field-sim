# Item 6 — UI shell, PWA, local persistence, and progress views

Status: architecture, ready to implement. Depends on items 2–5. This item adds no physics, no scoring logic, and no new fault semantics; every number on screen comes from a pure function in `src/instruments`, `src/session`, or `src/scoring`.

## Open questions (defaults stated; not blocking)

1. **Palette and type.** "Dark field-equipment palette" is specified; exact colors are not. Default tokens are given in §9 and can be swapped in one file.
2. **Trainee identity.** Solo practice only, but the persistence schema carries a local `traineeId` (random UUID created on first launch) so a supervisor dashboard can attribute sessions later without a migration. Default: yes, stored in `settings`.
3. **Head-to-head UX.** Default: a share code `t4-wrong-roll-closure-7:42`; comparing two *local* sessions by code is supported; cross-device comparison waits for the dashboard stage.

## 1. Purpose and boundaries

Compose items 2–5 into an installable, offline PWA for phones and tablets that looks like equipment, not a dashboard about equipment. The UI holds a `SessionState` (item 4) in a reducer, dispatches `Intent`s through `perform()`, and renders `PerformResult`s. It never imports from `src/world/faultTaxonomy.ts` to *look up* answers, never reads `OtdrTraceResult.hidden` (which `perform` strips), and never computes a score.

## 2. Amendments to earlier items (additive)

- `src/session/runner.ts`: `perform` already strips `hidden` from the OTDR result it returns; add `redactForUi(state: SessionState): UiSessionState` that removes `initialWorld.appliedFaults` and every `ActionEvent.groundTruth` from what the UI receives. The UI store holds a `UiSessionState`; the full `SessionState` lives only inside the store module and is passed back into `perform`.
- `src/scoring/replay.ts`: labels must be human-readable with node/span `label`s, not ids (already specified; confirm).
- Dev dependencies: `fake-indexeddb` (Dexie tests), `@testing-library/react` + `jsdom` **only if** a component test is written (see §11 — the default is none).

## 3. Module layout

```
src/ui/
  app/
    App.tsx               router + providers
    routes.tsx            route table
    theme.css             tokens (§9) — the only place colors are defined
    ServiceWorkerBridge.tsx  update prompt
  store/
    sessionStore.ts       useReducer + context; holds SessionState privately, exposes UiSessionState + dispatch(intent)
    persistence.ts        Dexie db, repositories
    progress.ts           streaks, personal bests, competency map (pure functions over stored sessions)
  screens/
    Home.tsx              streak, competency map, continue/last result, scenario picker entry
    ScenarioPicker.tsx    tiers, seeds, share-code entry
    FieldSession.tsx      the main screen: location bar, instrument dock, phone, records, diagnose
    Replay.tsx            five axes + decision replay
    History.tsx           sessions over time, per-domain trend
    DevOtdr.tsx           re-exports item 2's DevOtdrPreview behind /dev
  field/
    LocationBar.tsx       current node, simulated clock, budget, truck-roll picker (map-less list grouped by kind)
    InstrumentDock.tsx    tabbed dock: OTDR | Power meter | VFL | Scope | Terminal | Phone | Records | Diagnose
    Phone.tsx             customer reports (call = customer-contact intent), hint button (tier-aware)
    Records.tsx           plant-records viewer (records intent)
    Diagnose.tsx          claim builder + escalate + no-fault
  otdr/
    OtdrPanel.tsx         MaxTester-style tablet chrome around item 2's OtdrTraceCanvas
    OtdrControls.tsx      wavelength / pulse / range / averaging / IOR / cables chips
    EventTable.tsx
    AccessPicker.tsx      node → incident span → strand chips
  meters/
    PowerMeter.tsx  Vfl.tsx  Scope.tsx
  terminal/
    Terminal.tsx          output pane + input row + TokenChips
    TokenChips.tsx        tap-token suggestions from item 3's help()
    EndpointPicker.tsx    devices (remote) and hosts (presence/remote)
  components/             Chip, SoftKey, Led, SevenSeg (numeric readouts), Sheet (bottom sheet), AxisGauge
```

## 4. Routes

| path | screen | notes |
|---|---|---|
| `/` | Home | streak, competency map, "Continue" if an unfinished session is persisted |
| `/scenarios` | ScenarioPicker | tier filter; seed field (default random 1..999999); share-code input `id:seed` |
| `/run/:scenarioId?seed=N` | FieldSession | creates or resumes the session for that id+seed |
| `/replay/:sessionId` | Replay | from persistence |
| `/history` | History | table + per-domain trend |
| `/compare/:a/:b` | Replay (side-by-side) | two session ids with identical scenario+seed |
| `/dev/otdr` | DevOtdr | not linked from the UI |

Router: `react-router-dom` (add dependency, v7). Hash routing is **not** used; the PWA `navigateFallback` serves `index.html` for all routes.

## 5. Store (`sessionStore.ts`)

```ts
type StoreState = { session: SessionState | null; lastResult: PerformResult | null; pendingSave: boolean };
type StoreAction = { type: 'start'; scenarioId: string; seed: number } | { type: 'perform'; intent: Intent } | { type: 'restore'; session: SessionState } | { type: 'clear' };
export function useSessionStore(): { ui: UiSessionState | null; lastResult: PerformResult | null; dispatch(intent: Intent): void; start(id, seed): void; abandon(): void; };
```
Reducer: `perform` → `runner.perform(state.session, intent)`; after each perform, `persistence.saveSession(session)` (debounced 500 ms; also immediately on `diagnosis`). On `diagnosis`, navigate to `/replay/:sessionId` with the `ScoreReport` in `lastResult`. The store is the **only** module importing `startSession`/`perform`.

Immediate feedback (engagement requirement, functional): every `perform` result is rendered within the same tick in the active dock tab and a one-line toast in `LocationBar` (e.g. "OTDR: 6 events, 38 s"). No result is ever deferred to the end.

## 6. Persistence (`persistence.ts`) — Dexie schema, designed for a future dashboard

```ts
export interface StoredSession {
  id: string;                     // uuid
  traineeId: string;
  scenarioId: string;
  seed: number;
  tier: number;
  startedAt: string;              // ISO
  endedAt: string | null;
  endedBy: 'diagnosis' | 'safety-strike' | null;
  simulatedSeconds: number;
  scores: Record<AxisScore['axis'], number> | null;
  total: number | null;
  faultDomains: FaultDomain[];    // domains present in the scenario's true faults — for the competency map
  matchedFaultKinds: string[]; missedFaultKinds: string[]; falsePositives: number;
  actionCount: number;
  log: ActionEvent[];             // full log (without groundTruth)
  report: ScoreReport | null;
  schemaVersion: 1;
}
export interface StoredSetting { key: string; value: unknown }
export interface PersonalBest { key: string /* `${scenarioId}:${seed}` */; sessionId: string; total: number; simulatedSeconds: number }

class FiberSimDb extends Dexie {
  sessions!: Table<StoredSession, string>;
  settings!: Table<StoredSetting, string>;
  personalBests!: Table<PersonalBest, string>;
  constructor() { super('fiber-sim'); this.version(1).stores({ sessions: 'id, traineeId, scenarioId, seed, tier, startedAt, endedAt, total', settings: 'key', personalBests: 'key, total' }); }
}
```
Rules: sessions are append-only records plus updates to the *same id* while in progress; large blobs (`SessionState.blobs`, trace samples) are **not** stored — the replay re-runs `trace()` deterministically from the world + settings when a trace is opened (same seed ⇒ same trace). `saveSession(session)` maps `SessionState → StoredSession`; `loadUnfinished()` returns the most recent with `endedAt === null`; `listSessions(filter)`; `getSession(id)`. Dashboard-readiness: every field a supervisor would filter on (`traineeId`, `scenarioId`, `tier`, `startedAt`, `total`) is indexed; a future sync adds a `synced` flag via `version(2)` without touching existing rows.

## 7. Progress views (`progress.ts`, pure)

- **Streak**: consecutive calendar days (local time) with ≥1 finished session; `currentStreak`, `bestStreak`.
- **Personal best** per `scenarioId:seed`: highest `total`, ties broken by lower `simulatedSeconds`; upsert on finish.
- **Competency map**: for each `FaultDomain` ∈ {optical, network, compliance, cpe}: `accuracy = mean(diagnosticAccuracy)` and `evidence = mean(evidenceQuality)` over the last 10 finished sessions whose `faultDomains` include it; plus per-fault-kind `matched/(matched+missed)`; and per-instrument usage counts. Render as a grid of `AxisGauge`s per domain, weakest first — never a single aggregate.
- **Head-to-head**: `/compare/:a/:b` shows both replays side by side with a per-axis delta; enabled when `scenarioId` and `seed` match.
- **History trend**: per-domain accuracy over time (last 30 sessions), sparkline per domain.

## 8. Field session composition (`FieldSession.tsx`)

Layout (portrait phone first): `LocationBar` (top, fixed): node label, LED for "on site", simulated clock `HH:MM`, budget remaining if any. `InstrumentDock` (fills the rest) with a bottom tab strip of large touch targets. Each tab dispatches intents:
- **OTDR** (`OtdrPanel`): tablet-style chrome per the instrument profile `uiStyle` (`tablet-touchscreen` ⇒ soft keys along the right edge: *Start*, *Cursors A/B*, *Zoom*, *Auto*, *Events*; `button-panel` ⇒ a keypad row — implement only the tablet variant now, keep the switch). Top strip: `OtdrControls` chips populated from profiles: wavelengths = `network.otdrTestWavelengthsNm ∪ otdrInstrument.liveTestOutOfBandNm` (the latter styled "OOB"); pulse widths = `network.otdrPulseWidthsNs` filtered to `pulseWidthsNsRange`; averaging = `averagingSecondsOptions`; range presets `[1, 2.5, 5, 10, 20, 40] km`; IOR numeric field defaulting to `network.iorDefault` for the chosen wavelength (editable — the teachable); launch/receive cable chips from `truckInventory`. `AccessPicker`: current location node → its incident spans → strand chips if stranded. *Start* dispatches `otdr-shot`; while "acquiring" the canvas animates a sweep for `min(averagingSeconds, 3)` real seconds (cosmetic only; the result is already computed). `EventTable` below the canvas; tapping a row moves cursor A. Cursor readout uses item 2's `cursorReadout`. "Send to diagnosis" on an event opens `Diagnose` pre-filled with `distanceToSpanPosition(...)`.
- **Power meter / VFL / Scope** (`meters/`): `SevenSeg` readouts; node/span/strand pickers restricted to the current location; wavelength chips (`serviceDownstreamNm`, `serviceUpstreamNm`, test wavelengths).
- **Terminal** (`terminal/`): `EndpointPicker` lists devices (remote-reachable per `remoteCliAccess`) and hosts (present or `remoteHostAccess`); the pane shows `prompt + echoed command` then output lines in a monospace `<pre>`; input row with a real text field (tablet/desktop) plus `TokenChips` built from `help(world, profiles, session, currentInput)`; tapping a chip appends the token and a space; a `?` chip inserts `?`; ↵ dispatches `cli`. Syntax errors render the caret line exactly as returned (`caretColumn`). Never auto-corrects.
- **Phone** (`Phone.tsx`): customer list from `world.customerReports` (symptom hidden until called: a call dispatches `customer-contact` and reveals the text); hint button shows remaining hints and cost per `HINT_POLICY[tier]`, disabled at 0.
- **Records** (`Records.tsx`): pick a node/span → dispatches `records`; renders `PlantRecord.lines` in a clipboard-style sheet.
- **Diagnose** (`Diagnose.tsx`): claim builder: fault kind (searchable list from `FAULT_TAXONOMY` labels — labels only, no descriptions that hint), target picker by `appliesTo`, position (m) and strand where applicable, evidence multi-select from the action log (labels from `replay.ts` label templates); *Escalate* with reason; *No fault in my scope*; **Submit** dispatches `diagnosis` → Replay.
- **Truck roll**: from `LocationBar`, a bottom `Sheet` listing nodes grouped by kind with travel time from `travelSeconds`; dispatches `truck-roll`.
- **Excavate**: available only when the current node has `locateTicket` in attributes or a compliance fault is present; method + distance inputs; the strike ends the session and routes to Replay with the strike banner.
- Time budget: when `clockSeconds > timeBudgetMinutes·60`, the clock turns amber and a banner says "Over budget — efficiency is now 0"; the session continues.
- Tier 1–2 pacing: default view opens on Phone with the single report already "ringing" so a guided scenario reaches its first instrument within two taps.

## 9. Visual direction tokens (`theme.css`)

```
--bg: #0b0f14; --panel: #121821; --panel-2: #1a2230; --bezel: #2a3441; --text: #d7dee8; --muted: #8a96a6;
--trace: #ffb000 (amber); --grid: #1f2a38; --cursor-a: #3ddc97; --cursor-b: #5ab0ff; --marker: #ff5c5c; --noise: #4a5568;
--led-ok: #37d67a; --led-warn: #ffb000; --led-alarm: #ff4d4d; --seg: #ff9d00 (seven-segment glow)
font: system-ui for chrome; "JetBrains Mono", ui-monospace for terminal/readouts (self-hosted woff2 in /public/fonts, precached).
```
Rules: bezels and soft keys have 1-px inner highlights and 2-px shadows (equipment, not cards); no gradients on data surfaces; the trace canvas is the brightest element; minimum touch target 44 px; no text block longer than three lines anywhere in FieldSession (the Replay may use short paragraphs).

## 10. PWA (`vite.config.ts` + `public/`)

`vite-plugin-pwa`: `registerType: 'autoUpdate'`, `injectRegister: 'auto'`, `workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,yaml}'], navigateFallback: '/index.html', runtimeCaching: [] }` (everything is precached; there are no network calls). Manifest: `name: 'Field Sim'`, `short_name: 'FieldSim'`, `display: 'standalone'`, `orientation: 'any'`, `background_color: '#0b0f14'`, `theme_color: '#0b0f14'`, icons 192/512 (+ maskable) generated into `public/icons/`. `ServiceWorkerBridge` shows a "Update ready — reload" chip when a new SW is waiting. YAML profile/scenario files are bundled as strings via `?raw`, so they are inside the JS bundle; the `yaml` glob entry is belt-and-braces.

## 11. Minigame hooks — what exists, what is missing (do not build now)

Existing hooks a Stage-2 minigame can write to through `applyFault`/direct world mutation:
- `FiberEvent.lossDb` + `causeTag` (`fusion-splice-degraded` from a bad cleave/contamination), `FiberEvent.lossDbByWavelength` + `causeTag: 'tray-bend-radius-violation'` (`macrobend` from tray dressing), `FiberStrand.continuityBroken` / `unexpectedlyActivated` and `TopologyNode.attributes.spliceMap` (tube-tracing outcome), `TopologyNode.attributes.locateTicket` (one-call minigame), `Intent.excavate` (dig safety).
Missing (define in Stage 2, not now): a `SpliceWorkRecord { cleaveAngleDeg, contaminated, sleevePresent, arcCount, electrodeWear, estimatedLossDb, actualLossDb }` attached to a `FiberEvent`; an `Intent.splice`/`Intent.dressTray` pair; splicer state on `truckInventory` (electrode wear persists across sessions ⇒ needs a `truckState` table in Dexie `version(2)`).

## 12. Integration checks (no physics tests here)

1. `npm run build` succeeds; `dist/manifest.webmanifest` and `dist/sw.js` exist; `dist/index.html` references the manifest (Vitest test that runs the build in CI is too slow — make this an npm script `check:pwa` run by the reviewer).
2. `persistence.test.ts` with `fake-indexeddb`: `saveSession` → `getSession` round-trips a finished t1 session (`toEqual` on `StoredSession` minus `id`); `loadUnfinished` returns an in-progress session; `personalBests` upsert keeps the higher total.
3. `progress.test.ts`: streak computation over fixture dates (gap ⇒ reset; same-day multiples ⇒ one); competency map excludes domains absent from a scenario.
4. `redaction.test.ts`: `redactForUi(state)` contains no `appliedFaults`, no `groundTruth`, no `hidden`; a source-grep test asserts no file under `src/ui/**` contains the strings `hidden.`, `appliedFaults`, or `groundTruth`.
5. `routes.test.ts`: `/run/t1-dark-ont-vista-court?seed=5` resolves the scenario and seed; an unknown id renders the picker with an error chip.
6. Manual acceptance (reviewer, phone-width, offline): install to home screen; airplane mode; run t1 end-to-end in under 8 minutes; run t4 and confirm the trace, event table, cursors, and diagnosis flow; kill and relaunch mid-session and confirm "Continue" restores it.

## 13. Definition of done
Items 1–5 suites pass unchanged; §12 checks pass; the three reference scenarios are playable end-to-end offline on a phone; no UI file reads hidden ground truth; the OTDR panel is recognizably a touchscreen OTDR and the terminal is recognizably a terminal.
