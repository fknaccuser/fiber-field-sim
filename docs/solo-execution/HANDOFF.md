# The Field Solo — execution handoff

Spec: SOLO-1 ("The Field Solo — Sonnet execution guide", edition SOLO-1, 13 September 2026).
This replaces the earlier large architecture (`docs/architecture/`, root `HANDOFF.md`) for the
current release. That work is untouched on disk but no longer reachable from `index.html`.

## Noted deviations from the package text (non-blocking)

- BUILD_AND_HANDOFF.md names the repository `fknaccuser/Network-Field-Technician-Trainer` and a
  `build/solo-week` branch. The actual checkout is `fknaccuser/fiber-field-sim`, and the branch
  in use is `claude/field-solo-implementation-am520q` (set by the execution session's own git
  instructions, which take precedence over the package's branch suggestion). Same repository
  identity otherwise; no functional impact.
- "Keep the existing Node build/serve tooling" — this checkout's existing tooling is Vite +
  TypeScript (`npm run dev` / `npm run build`), not a `scripts/serve.mjs`/`scripts/build.mjs`
  pair. `index.html` and `package.json` are the actual integration points and were edited as
  UI_AND_STORAGE.md specifies ("index.html loads ./src/solo/main.js and ./src/solo/styles.css").

## What exists after S01

- `src/solo/app.js` — pure, DOM-free state: `createInitialState`, `normalizeCommand`,
  `submitOpeningCommand`, `completeInitialization`. Screens so far: `opening`, `initializing`,
  `home`.
- `src/solo/main.js` — the only module touching `document`. Renders the black opening screen
  (real labeled, visually-hidden `<input>`; visible mirrored text line; blinking block cursor
  that goes steady under `prefers-reduced-motion`), runs the three-line initialization sequence
  (200ms per line, ~600ms total, within the 500–1000ms bound), and renders a minimal Home
  (`<h1>The Field</h1>` only — the real Home screen with Continue/Recommended/skills is
  `view.js`, introduced in S02).
- `src/solo/styles.css` — MASTER_DESIGN §8 color tokens, opening/init/home screen styles, 44px
  minimum control height, `visually-hidden` utility.
- `index.html` — script/link swapped to the solo entry; nothing else touched.
- `package.json` — added `solo:test` script only (`solo:e2e` is S18's, once Playwright is
  actually needed).
- `tests/solo/shell.test.mjs` — 6 Node `--test` cases covering initial state, enable
  (case-insensitive/trimmed), rejection of an unrecognized/empty command, and initialization
  completion (including the no-op guard outside `initializing`).

S01 shipped with no persistence — reload always returned to the opening screen, matching S01's
acceptance line exactly ("reload shows opening by default"). S02 (below) adds it.

## What S02 added

- `src/solo/store.js` — `createIndexedDBAdapter()` (real IndexedDB, `the-field-solo` v1, stores
  `profile`/`mission`/`recovery`) and `createMemoryAdapter()` (a trivial in-memory adapter with
  the same `readMany`/`writeMany`/`listKeys` shape, for Node tests — no IndexedDB emulation).
  `openStore(adapter)` binds the DATA_CONTRACTS.md atomic pair `loadLocal()`/`saveLocal(profile,
  mission)` (one transaction each, resolving on `transaction.oncomplete`), plus the wrapper
  helpers `loadProfile`/`saveProfile`/`loadMission`/`saveMission` (each round-trips through
  `loadLocal`/`saveLocal` so profile and mission can never be written out of step), and
  `exportData`/`replaceData`. `replaceData` validates format/version/profile shape and a 5MiB
  size limit, keeps at most one pre-restore `recovery` record (deletes older ones in the same
  write transaction), and never executes imported values (it only ever does `JSON`-safe field
  access).
- `src/solo/app.js` — added `createInitialProfile()` (the full UI_AND_STORAGE.md shape plus the
  DATA_CONTRACTS.md progress fields: `counters`, `evidence`, `countedAttemptIds`, so the profile
  schema doesn't need a mid-week migration when progress tracking lands), `boot(store)` (loads
  or creates the profile, restores any saved mission, and starts on Home instead of Opening when
  `openingEnabled === false`), and the pure/impure split `applyProfileUpdate` (pure, marks
  `saveStatus: 'saving'`) + `persistProfile` (the actual save attempt, reusable as Retry) +
  `updateAndPersistProfile` (convenience wrapper), matching UI_AND_STORAGE.md's dispatch order.
- `src/solo/view.js` — `renderHome(state, actions)`: Continue is disabled (and
  `aria-disabled`) until `state.mission` is truthy; shows Saving…/Saved/Save failed; a Retry
  button appears on failure and calls `actions.onRetrySave`.
- `src/solo/main.js` — now boots through `store.js`/`app.js` on startup and delegates Home
  rendering to `view.js`.

**Deferred, and why:** DATA_CONTRACTS.md's "allowed enums/IDs, graph bounds" validation for
`replaceData` needs the mission/device schema, which doesn't exist until the engine tasks
(S04+). `replaceData` validates everything checkable today (format, version, profile shape,
size); deeper structural validation must be added once `model.js`/`generate.js` exist — this is
a recorded gap, not a silent stub. The visible Settings screen (to toggle opening/text scale by
hand) isn't built yet either — the underlying mechanism is fully wired and tested via `boot`/
`applyProfileUpdate`, but no UI calls them yet; that lands whenever `view.js`'s Settings screen
does.

## Actual results (see docs/solo-execution/STATE.json for machine-readable form)

- `npx tsc -b` — exit 0, clean throughout S01 and S02.
- `npm run solo:test` — exit 0, 25/25 passing (6 shell + 8 app/store boot-and-save + 11 store).
- `npm run build` — exit 0. Bundle dropped from the baseline 851 modules / ~850KB main chunk to
  8 modules / ~8KB main chunk, confirming the old React/Three.js code is no longer reachable
  from the new entry (it is still present on disk, untouched, per S01's "without deleting old
  modules").
- `npm test -- --run` (pre-existing Vitest suite) — exit 0, 73 files / 1030 tests, unaffected
  throughout (baseline was identical: recorded before any change, same numbers both times).
- Manual scripted Chromium checks (Playwright, pre-installed browser, throwaway scripts under
  the session scratchpad, not committed) against `npm run dev`:
  - S01: opening screen renders; `nope` + Enter shows "Command not recognized." and stays on
    opening; `  ENABLE  ` + Enter reaches Home after the init sequence; reload returns to
    opening; command field is a real `<input type="text">` (`display: block`, not `none`) with
    an associated `<label>`. No console errors.
  - S02: after `enable`, Continue is disabled (`isDisabled() === true`) with no mission. The
    real browser IndexedDB (`the-field-solo` v1, `profile` store, key `"local"`) holds the full
    profile shape after boot. Writing `openingEnabled: false` and `textScale: 1.25` directly into
    that IndexedDB record and reloading skips straight to Home (0 `.opening-screen` elements)
    with `textScale` still `1.25` — the skip-opening preference and text scale both survive a
    real reload against real IndexedDB, not just the in-memory adapter used by the Node tests.
    No console errors.

No baseline failures existed to preserve — `tsc -b`, the Vitest suite, and `npm run build` were
all green before S01 started, and stayed green through S02.

## What S03 added

- `src/solo/model.js` — `validateNetwork(state)` and `cloneNetwork(state)` (ENGINE_RULES.md
  "State shape"/"Files and exports"). `validateNetwork` checks structural integrity only —
  unique/present IDs across devices/ports/links, every reference resolves, at most one router,
  at most 7 devices / 10 links, no port wired by two links, no physical cycle (union-find over
  the device graph induced by links), router segments reference a port on their own device and
  don't overlap (/24 only, matching "editable only to /24 in SOLO-1"), and syntactic (not
  semantic) IPv4 checks with the .0/.255 host-bit rule on any /24 address. It does *not* check
  whether the network works — a syntactically valid but wrong gateway passes, matching
  ENGINE_RULES.md exactly. `cloneNetwork` is `structuredClone`. The IPv4 syntax check is a small
  local helper, not an import from `ip.js` — that file doesn't exist until S04; once it does,
  worth consolidating so there's one definition of "syntactically valid IPv4," not two.
- `src/solo/layouts.js` — `createHealthyLayout(layoutId, x, host, label)`. `BR` is the supplied
  `fixtures/healthy-branch.json` copied in as data (X=42, host=130 baked in, confirmed to
  reproduce the golden fixture exactly at those values). `x` (1-200) is substituted into every
  `10.42.*.*` address; `host` (130-149) replaces the target client's own host octet only.  `HM`
  removes SW2 and wires SW1:Gi0/24 directly to R1:Gi0/0 (5 devices). `OF` adds PC3 wired to a new
  SW2:Gi0/3 (access VLAN 10) and moves PC2 onto a new SW2:Gi0/2 (access VLAN 20), leaving the
  original SW1:Gi0/2 present but unused rather than deleting it (7 devices) — both exactly as
  SCENARIOS.md's "Fixed generator details" specifies. All three layouts pass `validateNetwork`.
- `tests/solo/model.test.mjs` — 17 cases: the three device/link counts, golden-fixture address
  reproduction, x-substitution, clone independence, wrong-gateway-is-valid, missing/duplicate ID,
  unknown port/device reference, single-router limit, cycle rejection, segment overlap,
  malformed IPv4, reserved host bit, and out-of-range `x`/`host`/`layoutId` inputs.

**Deferred, and documented as such:** the `label` parameter ('plain', the default, is the only
one actually exercised) — its three real display-name templates live in `reference/seed.mjs`,
which S03 was not scoped to read (S03's reading list is DATA_CONTRACTS.md, ENGINE_RULES.md, the
fixture, and SCENARIOS.md only) and is copied verbatim as `src/solo/seed.js` by a later task.
Anything other than `'plain'` currently applies a generic, clearly-provisional prefix; whoever
copies `seed.js` should replace `applyLabel` in `layouts.js` with the real templates rather than
leaving both. Layout coordinates (SCENARIOS.md's per-device x/y positions) are not part of the
Network state shape in ENGINE_RULES.md and are not implemented here — that's `diagram.js`'s job
once the topology view exists.

**Bug found and fixed while running S03's full-suite regression check (touches S02's
`store.js`):** `store.test.mjs`'s "keeps exactly one recovery record" case failed intermittently
when run alongside the other suites (not in isolation) — `replaceData`'s new recovery key
(an ISO timestamp) can collide with the previous one at millisecond resolution, and `writeMany`
was applying puts before deletes, so the fresh snapshot got written and then immediately deleted
by the same transaction. Fixed by reordering `writeMany` (both the real IndexedDB adapter and
the memory adapter) to delete before put. Verified with 5 consecutive full `npm run solo:test`
runs, all 42/42.

## What S04 added

- `src/solo/ip.js` — `parseIPv4`, `prefixFromMask`, `inSubnet`, exactly per ENGINE_RULES.md.
- `src/solo/forward.js` — `linkUsable` and the internal `layer2Reachable` frame search from
  reference/L2_PSEUDOCODE.md (queue + visited-set BFS over `{portId,tag}`, 256-visit
  `MODEL_LIMIT` guard, router-as-endpoint-only). `canReach`/`resolveName`/`testService` (the
  one-way IP pseudocode built on top of L2) are explicitly out of scope for S04's own task text
  and left for whichever later task adds them (ENGINE_RULES.md lists them as this file's other
  exports, but S04.md's "Execute in order" only asked for ip.js + linkUsable + layer2Reachable).
- Tests: `tests/solo/ip.test.mjs` (7 cases) and `tests/solo/l2.test.mjs` (11 cases) — the four
  acceptance fixtures (disconnected cable/P1, shutdown/P2, VLAN mismatch/V1, missing trunk
  VLAN/V2) plus linkUsable's power/adminUp/connected combinations, run against `layouts.js`'s
  real BR fixture rather than synthetic state.

## What S05 added

- `src/solo/forward.js` gains `canReach`, `resolveName`, `testService` (the one-way IP
  pseudocode from reference/L2_PSEUDOCODE.md, run both directions). Failure codes:
  `INVALID_ADDRESS`/`DUPLICATE_IP` (malformed or shared source/destination address),
  `LINK_DOWN` (the immediate local attachment of whichever endpoint initiates an L2 hop is
  down — covers P1/P2), `VLAN_PATH_BLOCKED` (a deeper L2/VLAN mismatch once the immediate link
  is fine — covers V1/V2), `GATEWAY_UNREACHABLE` (no on-subnet router owns the configured
  gateway — covers I2), `NO_ROUTE` (destination/route unknown), `RETURN_PATH_FAILED` (forward
  path fine, reverse path fails). `resolveName` requires round-trip reachability to the
  client's resolver first and wraps *any* transport failure as `DNS_UNREACHABLE` with the real
  reason kept in `details.transport` — this matters: a reverse-path break on the DNS server
  itself surfaces as `DNS_UNREACHABLE`, not `RETURN_PATH_FAILED`, exactly per ENGINE_RULES.md's
  "DNS tests wrap resolver transport failures." `testService` additionally requires the
  resolved address to belong to the one real `server`-kind device, else `WRONG_SERVICE`.
- `tests/solo/forward.test.mjs` (24 cases): every DATA_CONTRACTS.md/expected-cases.json fixture
  (healthy, P1, P2, I1, I2, V1, V2, D1, D2, alternate-valid-ip, protected-outage, P1+D1) applied
  to the BR layout via a `[collection, id-or-record-name, field, value]` patcher, asserting both
  clients' `testService` booleans; two cases added beyond the supplied fixture per S05.md's own
  instruction (server return-gateway failure, duplicate host address); plus targeted checks for
  exact codes, DNS case/trailing-dot handling, and WRONG_SERVICE on a reachable-but-wrong
  address.

## What S06 added

- `src/solo/actions.js` — `applyAction(state, action)` for all ten action types ENGINE_RULES.md
  actually enumerates (setLinkConnected, moveCable, setPortAdmin, setAccessVlan,
  setTrunkAllowedVlans, setClientAddress, setClientGateway, setClientDns,
  setRouterSegmentAddress, setDnsRecord). **Note:** S06.md's acceptance text says "all eleven
  action types," but no eleventh type is named anywhere in DATA_CONTRACTS.md or ENGINE_RULES.md
  — implemented exactly the ten documented ones rather than inventing an unspecified one; flagging
  this as a likely typo in the package rather than a real gap.
  Every handler: rejects unknown extra fields and unknown entity IDs before doing anything,
  rejects `setAccessVlan`/`setTrunkAllowedVlans` on the wrong port mode, is a no-op (success,
  revision untouched) on an identical replacement, and — via a shared `commit()` helper — clones,
  mutates, then re-runs `validateNetwork` on the clone before accepting it. That last step is
  what makes `moveCable` correctly reject a cycle for free, and `setRouterSegmentAddress`
  correctly reject a segment overlap for free, without duplicating those checks.
- Consolidated `model.js` onto `ip.js`'s `parseIPv4` (dropping the local duplicate flagged since
  S03/S04) and exported `isValidVlan`/`checkAddressField` so `actions.js` reuses the same address
  rules instead of a third copy.
- `tests/solo/actions.test.mjs` (24 cases): one valid + one invalid case per action type, plus
  no-op-preserves-revision, unknown-action-type, unknown-field, shutdown breaking and no-shutdown
  restoring connectivity (proven via `testService`), cable-move-to-an-occupied-port rejecting
  unchanged, cable-move-closing-a-cycle rejecting, and a wrong-but-valid gateway saving
  successfully and being diagnosable (`GATEWAY_UNREACHABLE` on direct ping, `DNS_UNREACHABLE` on
  the name test).

**DAY2 checkpoint (S04-S06) reached**: link/IP/VLAN/DNS evaluator and configuration actions all
work and are tested. 108/108 solo tests, `tsc -b` clean, build clean, legacy suite unaffected
(73 files/1030 tests) throughout.

## What S07 added

- `src/solo/diagram.js` — `renderTopology(network, {selectedDeviceId, onSelectDevice})`: an SVG
  at SCENARIOS.md's fixed per-layout coordinates (HM/BR/OF each have their own position table,
  HM's R1/S1 moved per the spec), links drawn first, plain-vector device glyphs (rect/polygon by
  kind) as keyboard-focusable (`tabindex`, `role="button"`, Enter/Space) `<g>` buttons, plus a
  plain HTML `<ul>` equivalent listing every device and link's connected state — the "SVG nodes
  have buttons or keyboard-focusable equivalents" and "every cable action has a list alternative"
  rules from UI_AND_STORAGE.md. Cable *interaction* (reconnect flow) is out of scope here — S07
  is selection only; only Configuration/Terminal editing is later tasks' job.
- `src/solo/app.js` — `createConfigureAttempt(layoutId)` builds a configure-mode Attempt (the
  same shape DATA_CONTRACTS.md defines for a real mission, `mode:"configure"`, network ===
  initialNetwork, requirements derived from the healthy layout's own addressing) since
  MASTER_DESIGN.md's "free configuration of a provided healthy network" mode uses that same
  Attempt shape, not a separate ad hoc structure that would need migrating once `generate.js`
  lands. `startConfigureSession`/`exitMission`/`selectDevice` (recent-device list, capped at 4,
  most-recent-first, deduplicated) round out `app.js`'s state machine for the new `'mission'`
  screen.
- `src/solo/view.js` — `renderMission`: header, Network/Device/Findings tabs, a device Inspect
  panel (kind/power/IP/gateway/DNS/ports — Configure and Terminal sub-tabs are S08/S09's job),
  recent-devices row. `renderHome` gained a "Configure a network" section (HM/BR/OF buttons).
  Tab visibility is **transient view state kept in `main.js`, not added to `app.js`'s tracked
  state** — UI_AND_STORAGE.md's App state shape has no tab field, and panels are always rendered
  and merely `hidden`, so switching tabs can never discard terminal or selection state (nothing
  is unmounted).
- `src/solo/styles.css` — mission screen/tabs/panels/diagram styling; at ≥900px the tab control
  hides and all three panels render at once (topology 40% left, device+findings stacked 60%
  right), matching MASTER_DESIGN.md §7's tablet layout.

**Verified in a real browser** (not just unit tests, since this is a rendering/interaction task):
every device in HM (5), BR (6) and OF (7) is selectable both via direct SVG clicks and via the
equivalent list; a keyboard-focused SVG device selects on Enter; no horizontal page overflow at a
390px viewport in any layout; switching the mobile tab away from Device and back preserves the
current selection exactly (before/after device name matched).

## What S08 added

- `src/solo/devices.js` — pure draft-to-action builders (`buildClientActions`, `buildPortActions`,
  `buildRouterSegmentActions`, `buildDnsRecordActions`, `parseVlanList`) that only ever produce
  actions for fields that actually changed, and `runMissionTest` (all five documented test kinds:
  pingGateway, pingServer, resolvePortal, openPortal, checkProtected — via `forward.js`). Plus
  DOM-rendering form/test functions.
- `src/solo/app.js` — `applyMissionActions(state, actions, {deviceId})` dispatches a batch
  through `applyAction` only, atomic from the caller's point of view (the first rejection returns
  the original state untouched; every accepted action appends its own `'change'` event with a
  before/after snapshot of just the touched entity). The reconnect flow (`beginReconnect` /
  `chooseReconnectSource` / `confirmReconnect` / `cancelReconnect`) implements "tap cable → source
  port → destination port → Connect." **Important finding while building this:** `moveCable` has
  no `connected` field in its action envelope (ENGINE_RULES.md) and is a no-op when the endpoints
  don't change — so confirming a reconnect to the *same* two ports (exactly P1's repair: the cable
  was never mis-wired, just unplugged) would do nothing at all. `confirmReconnect` now always also
  dispatches `setLinkConnected {connected:true}` when the link wasn't already connected, so
  "Connect" always means plugged in, whatever the chosen endpoints. `recordTestEvent` logs a real
  `forward.js` result as a `'test'` event.
- `src/solo/diagram.js` — cables are now selectable too (SVG `<line>` and the equivalent list),
  keyboard-focusable the same way devices are, highlighted while a reconnect is in progress.
- `src/solo/view.js` — Configure sub-tab content per device kind (client address; router LAN
  segments; server DNS records; every port's admin/VLAN fields), a reconnect panel, and a real
  Findings tab listing recorded test events pass/fail (selecting supporting rows for a completion
  submission is `grade.js`'s job, a later task).
- `src/solo/main.js` — autosaves the mission (`store.saveMission`) after every accepted
  configuration change or test, per MASTER_DESIGN.md §10.

**A real architectural bug found and fixed before it shipped:** this codebase's `render()` is a
full teardown-and-rebuild on every state change. The first draft of the Configure forms and the
reconnect panel set their error text directly on a local DOM node from inside their own
submit/click handler, *after* calling `onApply`/`onConfirmReconnect` — but those synchronously
call `render()` before returning, which had already deleted that very node from the document.
The error was being written to a detached, invisible element. Fixed by moving all such feedback
into `state.error`, rendered fresh on the next pass like everything else. Worth remembering for
any future addition: nothing set on a DOM node survives past the `onXxx` call that changed state.

**Verified in a real browser** (390px viewport, Playwright): changing a client's gateway through
Configure and then running "Open portal" actually reports the new failure (GUI changes affect
real tests); Cancel restores the true current value, not the typed draft; a malformed IP shows
its specific message and leaves the device's actual address untouched; tapping a cable, choosing
source/destination and Connect reconnects it and the equivalent list shows "connected".

## What S09 added

- `src/solo/cli.js` — `executeCommand(state, terminal, commandText, origin)` and
  `getHelp(terminal, prefix)`. Table-driven commands per device kind/mode (ENGINE_RULES.md's
  exact lists for switch/router/client/server), matched by unambiguous per-token prefix (0
  matches → "Not supported by this simulator yet." + one example; >1 matches → same, never
  guesses). Every mutating command (`shutdown`/`no shutdown`/`switchport ...`) dispatches through
  `applyAction`, never by string-editing rendered output. `show running-config`/`show interfaces
  status`/`show vlan brief`/`show interfaces trunk`/`show ip route`/`show ip interface brief` all
  read the live network passed in on each call, so a GUI change shows up immediately. A
  builder-origin submission (`origin=true`) marks its change event `assistance:true` and appends
  a separate `'assistance'` event; a typed submission never does.
- **Two genuine, non-blocking gaps against the given contracts, both documented rather than
  silently resolved:** (1) ENGINE_RULES.md names no specific command for the server terminal's
  "read-only status" — reused `show running-config` (already established elsewhere for exactly
  this purpose) instead of inventing new terminology. (2) `getHelp`'s declared signature is
  `(terminal, prefix)` — two arguments — but resolving a command table needs the device's *kind*,
  which DATA_CONTRACTS.md's Terminal session shape doesn't include. `createTerminalSession` now
  also stores `deviceKind` alongside the documented fields (`deviceId`, `mode`, `interfacePortId`,
  `history`, `output`, `builderOrigin`) — additive, not a contradiction of the given shape.
- `src/solo/devices.js` gains `renderTerminal` (output, input, Enter, `?` help, command-builder
  suggestion buttons); `app.js` gains `terminalSessionFor`/`setTerminalSession`/
  `markTerminalBuilderOrigin` (sessions keyed by deviceId, so switching devices keeps each one's
  mode/history separate, per UI_AND_STORAGE.md). Inspect/Configure/Terminal are one stacked panel
  rather than sub-tabs of the Device tab — a deliberate simplification, not a missing piece;
  everything is present and functional.

**Verified against the literal acceptance sequence, both in Node tests and live in a real
browser:** `enable` → `conf t` → `interface Gi0/1` → `shutdown` breaks the target's service;
`no shut` restores it; a fresh terminal's user-mode `shutdown` is rejected (mode and network both
unchanged); `show running-config` reflects a change made outside the terminal (a GUI-applied
`setPortAdmin`); a builder-inserted-then-submitted command is recorded assisted, a typed one
never is regardless of whether the builder was opened.

**DAY3 checkpoint (S07-S09) reached**: clickable graph, editable devices, and the supported CLI
all work and are tested. 144/144 solo tests, `tsc -b` clean, build clean, legacy suite unaffected
throughout.

## What S10 added

- `src/solo/seed.js` — `reference/seed.mjs` copied unchanged (`hashSeed`, `makeRng`,
  `parameters`). "HM cannot generate V2" and "HM cannot generate tier4" both fall directly out of
  this file's own pool selection (`V: layout==='HM' ? ['V1'] : ['V1','V2']`) and combination check
  (`(tier===4 && layout==='HM')` throws) — verified, not re-implemented.
- `src/solo/generate.js` — `generateCase(caseCode)`: builds the healthy layout, derives
  `requirements` from it *before* injecting any fault (matters concretely for I1, which moves the
  target off its intended subnet entirely), then applies the recipe(s) to a separately-cloned
  `initialNetwork`. `nextCase(settings, recentFingerprints)`: fingerprint-dedup search entirely
  off the caller's `candidateSeed()` callback (never calls randomness itself) — up to 50 base
  tries, then 50 suffix tries truncating the base to fit the 24-character seed-text limit, then
  throws `"Choose a seed manually."`.
- `src/solo/layouts.js` gained `deriveRequirements`, factored out of `app.js`'s
  `createConfigureAttempt` so both it and `generate.js` compute `Attempt.requirements` identically
  instead of two slowly-diverging copies.
- **Not yet wired into the UI.** `generateCase`/`nextCase` are pure engine functions only; no
  screen calls them yet (Home's "Start"/"Recommended job"/"Enter seed" buttons, the New mission
  sheet). That wiring, plus tiers and hints, is S11/S12's job — confirm against those task files
  rather than assuming which piece lands where.

**Verified:** all five `fixtures/seed-vectors.json` vectors match `parameters()` exactly. All
eight recipes individually: healthy base passes, the injected fault fails, and applying the real
repair action (via `applyAction`) restores service. All six approved tier4 pairs: broken with
both faults present, *still* broken after either single repair, restored only after both.
`generateCase` is fully deterministic (two calls with the same code produce a deep-equal Attempt).
A sweep of 200 tier4 codes never produced anything outside the six approved pairs.

## What S11 added

- `src/solo/app.js` — `attemptStartMission`/`confirmReplaceMission`/`cancelReplaceMission`
  protect the one active mission behind an explicit Resume/Replace choice (`pendingMissionRequest`,
  generalized to cover both a generated code and a configure-mode layout — `startConfigureSession`
  now goes through the same gate). `replayMission` regenerates the identical faulted initial
  state under a fresh attempt id, without touching `profile.recentFingerprints` (replays aren't
  new distinct causes). `startNewVariation` wires `nextCase` to a real local `candidateSeed`
  (`Math.random` — fine here since this is the application layer supplying randomness *to* a pure
  engine function, not the engine calling it itself) and records the result into
  `recentFingerprints`, capped at 20.
- `src/solo/view.js`/`main.js` — Home gained the recommended job card (`TF1-HM-1-P-START`), four
  skill buttons (Link/port·IPv4·VLAN·DNS, each starting a tier-1 BR-layout variation — tier/layout
  recommendation logic is progress-tracking's job, a later task), seed entry, and the
  Resume/Replace prompt (shared with the mission screen). The mission header gained Replay and
  New variation. Starting/replaying a mission persists profile+mission together via
  `store.saveLocal` so the fingerprint history and the mission can never diverge.

**A real bug found and fixed while verifying "refresh resumes current state" live in a
browser:** `exitMission` (written back in S07, before resume was ever actually exercised
end-to-end) was setting `mission: null` — Exit was silently abandoning the active mission instead
of just navigating to Home, so "Continue mission" would already be disabled the moment you left
the workspace. Fixed to preserve the mission, the selected device and the recent-device list,
matching MASTER_DESIGN.md §10 exactly ("Resume keeps the scenario, current device, input draft and
history"); only an explicit replace or a future completion actually ends a mission. The existing
S07 test asserting the old (wrong) behavior was updated to assert the corrected one.

**Verified live in a browser, not just Node tests:** the recommended mission starts and survives
a hard page reload (Continue restores the identical mission); requesting a second code while one
is active shows the Resume/Replace prompt, Resume keeps the original untouched, Replace swaps in
the new one; an invalid code offered as a replacement reports its specific error and leaves the
original mission running; a skill button starts a freshly generated variation.

## What S12 added

- `src/solo/content.js` — SCENARIOS.md's hint copy (nudge/clue/step) verbatim per recipe, with
  address-bearing steps (I1, D1) as small template functions rendering the case's real X. Three
  customer-fact questions with original authored answers per recipe (**note:** S12.md's own list
  — when it began/who is affected/what changed — differs slightly from MASTER_DESIGN.md §6's
  paraphrase of the same idea; followed S12.md's explicit list, which also matches
  DATA_CONTRACTS.md's worked TF1-HM-1-P-START example fact triplet). Three harmless tier3
  details, and tier time goals (§5's "Time" column). Debrief text is *not* here — SCENARIOS.md
  gives no debrief copy and S12.md's own scope names only three hint levels; that's a later
  task's addition once grade.js exists.
- `src/solo/app.js` — `isRecipeRepaired` derives each recipe's live pass/fail purely from the
  Attempt's own `network`+`requirements` (no separate stored "healthy" snapshot needed — every
  recipe's correct value is independently recoverable, e.g. the server's own address is never
  corrupted by any recipe, so it's always the true DNS/portal target). `currentHintRecipeId`/
  `requestHint` target the earliest still-broken fault in the case's own pair order and progress
  to the remaining one once the first is fixed; requesting any hint marks the run `assisted` and
  logs a distinct `'assistance'` event (cli.js's ordinary `?` never touches this).
  `showCauseCount`/`showHarmlessDetail` gate tier1-2 vs tier3-4 brief content.
  `pauseMissionTimer`/`resumeMissionTimer` accrue `elapsedMs` only between resume and pause,
  driven by `main.js`'s Page Visibility listener plus Exit/Continue — `now` is always supplied by
  the caller, per ENGINE_RULES.md's "application code supplies elapsed time" convention (applied
  here for testability even though app.js isn't one of the engine files that rule binds).

**Two real bugs found and fixed, both in earlier tasks' code, both caught by this task's own
testing rather than shipping silently:**
1. `isRecipeRepaired`'s P2/V1/V2 checks read the target client's *own* port instead of the switch
   port its cable actually terminates on (a client's own port is always `mode:"routed"` and never
   touched by those recipes) — hint progression could never detect P2/V1/V2 as fixed. A tier4-pair
   test failed immediately once written; not something a browser click would have surfaced quickly.
2. `layouts.js`'s `deriveRequirements` (from S10) had the identical confusion for VLANs: a
   client's own port's `accessVlan` is ignored per ENGINE_RULES.md's binding clarifications and
   just carries whatever the golden fixture happened to set — which is 10 for *both* PC1 and PC2,
   masking `protectedVlan` silently returning 10 instead of the real 20 for every layout since S10
   was written. No existing test caught this because every prior repair-action test happened to
   target VLAN 10 anyway. Caught live in the browser (the mission brief read "protected subnet
   .../24 (VLAN 10)"), fixed, and given a regression test across all three layouts.

**Verified live in a browser, not just Node tests:** the tier1 brief shows the customer facts and
cause count; requesting a hint twice accumulates nudge-then-clue text; the timer shows
elapsed-only for an untimed tier; hint levels survive Exit + Continue; the VLAN fix confirmed
directly (brief now reads "(VLAN 20)" for the protected subnet).

**DAY4 checkpoint (S10-S12) reached**: eight faults, deterministic variations, tiers and hints all
work and are tested. 197/197 solo tests, `tsc -b` clean, build clean, legacy suite unaffected.

## What S13 added

- `src/solo/grade.js` — `evaluateCompletion(attempt)`: live target/protected service checks,
  both clients' department constraints (subnet + the switch access port's VLAN, resolved via the
  link — not the client's own ignored port field, same resolution `isRecipeRepaired`/
  `deriveRequirements` needed), a same-current-revision recorded pass on `openPortal` (target) and
  `checkProtected` (protected), a genuinely-captured selected finding, and a 10-500 character
  note. Every unmet check names a concrete next action. `summarizeRun(attempt, completedAt)`
  builds the documented RunSummary — `completedAt` is an additive second parameter (the engine
  itself can't call `Date.now()`; app.js is the only caller and supplies it).
- `src/solo/app.js` — `selectDevice` now automatically records an `'inspection'` event (observed
  fields only) on every selection, so Findings has real evidence without a separate capture step.
  `toggleFinding`/`setCompletionNote` back the form; `completeRun` evaluates and, on success,
  freezes the run (`status:'completed'`, screen → `'debrief'`) and updates
  counters/evidence/completedRuns in the same step — each recipe's own family gets credited
  (`recipeId[0]`), so a tier4 mixed pair correctly credits both families rather than filing
  everything under `'M'`. Configure mode never touches evidence at all. Rejects a repeat
  completion.
- **Bug found and fixed, exposed by this task's own grading logic, not a browser click:**
  `recordTestEvent` for `checkProtected` (from S08) was logging the event under whichever
  device's Tests panel happened to trigger it, not the protected client the test actually
  verifies — so `evaluateCompletion`'s same-revision check could never find it under the right
  device id no matter what the player did. Fixed in `main.js`'s `runTest`.
- `src/solo/view.js` — Findings now lists every captured inspection/test as a selectable
  checkbox, a live completion checklist, the note field and Submit. A new Debrief screen shows
  service results, assistance used, actual causes (the hint copy, now safe to reveal), the full
  ordered action history, and a fixed authored expert-sequence example investigation. "Linked
  lesson" is a placeholder — the study pack doesn't exist yet (a later task).

**Verified end-to-end live in a browser**, not just Node tests: submitting before any repair
shows concrete failing checks (not a blank rejection); reconnecting the cable, testing both
clients, selecting a finding and writing a note brings every check to passing and reaches the
debrief screen with the real action history rendered.

## What S14 added

- `src/solo/progress.js` — `familyStats(profile, family)`/`allFamilyStats(profile)`: per-family
  completed/assisted/independent counts, distinct causes solved (recipe IDs with at least one
  independent completion — never seed/run count, so ten repeats of one cause stays one distinct
  cause), highest tier reached and best verified elapsed time, all derived from the stored
  profile (`completedRuns`/`evidence`), nothing new persisted. `recommendedTier(profile, family)`:
  tier1 → tier2 needs only one completion (assisted or not — "guided tier1 unlocks tier2 even
  though guided"); tier2 → tier3 and tier3 → tier4 each need two *distinct* independently
  repaired causes at that tier. `leastPracticedFamily(profile)`: fewest completed repair runs,
  ties broken in P,I,V,D order. `recommendMission(profile)`: the fixed `TF1-HM-1-P-START` job
  until any run completes, then the least-practiced family at its recommended tier — surfaced as
  the mixed family once that tier reaches 4, since SCENARIOS.md fixes "tier 4 must use M" and a
  single-family tier4 case does not exist.
- `src/solo/main.js`/`view.js` — Home's recommended-job card and Start button now call
  `recommendMission`/`startRecommended` instead of the old fixed code; the four skill buttons show
  and start at each family's `recommendedTier` (tier4 substitutes family `'M'`) instead of a
  hardcoded tier1; a new Progress screen (`renderProgress`, reached via a new Home button) shows
  each skill's completed/independent/assisted/distinct-causes/highest-tier/recommended-tier/best-
  time and a recent-history list; the debrief adds one short, static, reduced-motion-safe line
  per repaired family ("Recommended tier for X: N.") — no XP, currency or certification claim.
- `tests/solo/progress.test.mjs` (13 cases) covers every S14.md acceptance point directly: ten
  repeats of one cause staying one distinct cause; an assisted completion staying visible
  (`completed`/`assisted`) without becoming independent evidence or advancing past its own
  guided-unlock step; the tier2→3→4 threshold requiring two distinct causes each time, never
  satisfied by assisted-only runs; a tier4 mixed run crediting both of its recipes' families;
  configure-mode entries never counted as repair completions; least-practiced tie-breaking in
  P,I,V,D order; and progress recomputing identically after a JSON serialize/reload round-trip
  (simulating an app restart).

**Verified live in a browser, not just Node tests:** a fresh profile shows the fixed first job and
Tier 1 on all four skill buttons and an empty Progress screen; completing that job moves the
recommendation to the least-practiced family, bumps Link/port's skill button to Tier 2, shows the
static recommended-tier line on the debrief, and the Progress screen's Link/port card reflects the
new completed/independent/distinct-causes/best-time values.

## What S15 added

Configure sessions could already be started from Home (S07/S11), but had three real gaps: no way
to *break* one outside the full reconnect flow (no plain "unplug"), no way to *un-break* one
(Replay only regenerates a caseCode-based repair case, and configure attempts have no caseCode —
`replayMission` was silently a no-op for them), and no way to *complete* one at all (Findings only
ever rendered the note/checklist/submit block in repair mode, so a configure session's checklist
was always an empty array and Submit did not exist).

- `src/solo/app.js` — `disconnectLink(state, linkId)`: a direct unplug via `setLinkConnected`,
  independent of choosing a destination port. `requestReset`/`cancelReset`/`confirmReset`: a
  confirmed Reset that restores the mission's own stored `initialNetwork` snapshot (clone it,
  clear events/findings/note/hintLevels/elapsedMs, keep the same attempt id) — the one recovery
  path that works for configure sessions, unlike Replay. `completeRun` now picks the evaluator by
  `mission.mode`: `evaluateCompletion` for repair, the new `evaluateConfigureChecklist` for
  configure; the profile-update block was already gated to `mode === 'repair'` (S13), so configure
  completion still awards no repair evidence.
- `src/solo/grade.js` — `evaluateConfigureChecklist(attempt)`: the same live department/portal-
  access checks as `evaluateCompletion` (reusing its `remainsInDepartment`, now exported, to avoid
  re-deriving the client-port-vs-switch-port VLAN resolution a fourth time — that exact confusion
  caused three earlier bugs), without the same-revision test-event, genuine-finding or note-length
  requirements, since those document a repair investigation a configure session never claims to be.
- `src/solo/view.js` — a "Disconnect" button in the reconnect panel's initial step (only shown
  while the cable is currently connected); a "Reset" button in the mission header for configure
  missions (in place of Replay/New variation, which need a caseCode) with a confirmation prompt;
  Findings/Submit now render for both modes — configure's note field reads "Documentation
  (optional)" instead of the 10-500-character repair requirement — and the debrief heading/status
  read "Configuration complete"/"Configure session saved." for configure mode instead of the
  repair-specific wording.
- `tests/solo/configure.test.mjs` (8 cases): configure/break/save/recover a supplied network,
  Reset requiring confirmation (a cancelled reset leaves the broken network untouched), and repair
  progression (`counters`/`evidence`/`completedRuns`) staying byte-for-byte unchanged after a
  configure completion, with or without documentation.

**Verified live in a browser, not just Node tests:** a configure mission shows Reset (not
Replay/New variation); disconnecting a cable directly fails the checklist immediately with a
concrete message; Reset's confirmation Cancel leaves the broken state alone, Reset restores the
healthy snapshot; Submit with no documentation at all reaches a "Configuration complete" debrief;
the Progress screen still reads zero everywhere afterward.

## What S16 added

- `src/solo/content.js` — `STUDY_PACK`, copied byte-for-byte from the supplied
  `fixtures/study-content.json` (8 lessons, 24 four-option questions, 24 flashcards; DATA_CONTRACTS.md's
  schema exactly). `REFERENCE_ENTRIES` — one entry per ENGINE_RULES.md's exact supported CLI command
  (switch/router/client/server, each a real example matching cli.js's own keyword syntax) plus the
  four concept distinctions UI_AND_STORAGE.md names by name (link up vs service up, IP vs DNS
  failure, access VLAN vs trunk allowance, configuration vs verification).
- `src/solo/study.js` (new) — pure lesson/question/card selection (`lessonsForFamily`,
  `questionsForLesson`, `cardsForLesson`), `gradeAnswer` (reads the option table's own `correct`
  flag, never inferred), `recordStudyAnswer`/`recordCardReview` (keep only the latest attempt per
  question/card — "No timed assessment or confidence tracking" means history isn't needed), and
  `searchReference` (case-insensitive title/body substring match).
- `src/solo/app.js` — Study screen navigation (`openStudy`/`closeStudy`/`selectStudyFamily`/
  `openLesson`/`closeLesson`/`revealCard`) mirrors `missionTab`: transient in `state.studySession`,
  never persisted (the profile's `studyAnswers`/`cardReviews` are what persist, through the
  already-generic `updateAndPersistProfile` — no new persistence path needed). `openReference`
  marks a run assisted when opened during an active repair mission (mirrors `requestHint`) and is
  a no-op otherwise; screen navigation back to wherever it was opened from is main.js's job.
- `src/solo/view.js` — `renderStudy` (family filter chips, a lesson view, immediate-feedback
  questions that reveal every option's explanation once any answer is submitted, reveal + Got
  it/Review again cards) and `renderReference` (a search box over `REFERENCE_ENTRIES`). Reference
  is reachable from both Home and the mission header.
- `tests/solo/content.test.mjs` (+18 cases, 26 total): the schema test (exact counts, unique IDs,
  exactly one correct option, an explanation on every option), `study.js`'s selection/grading, and
  the Study/Reference navigation and assisted-marking behavior.

**Verified live in a browser, not just Node tests:** the family filter narrows the lesson list
(8 → 2 for VLAN); opening a lesson shows its 3 questions and 3 cards; answering a question
immediately shows all four explanations with correct/wrong marks; a flashcard's Reveal then Got
it/Review again works; Reference's search filters correctly; opening Reference from within an
active repair mission marks it assisted (the debrief read "Completed with support" afterward) and
returns to the same mission tab untouched.

## What S17 added

- `src/solo/store.js` — `validateBackup` (from S02) went from a shallow shape check to full
  structural validation: profile counters/evidence/array-limit checks, and per-mission enum
  (mode/status/every event's kind) plus model-invariant checks by reusing `model.js`'s own
  `validateNetwork` for both `network` and `initialNetwork` (never re-deriving that logic), plus a
  target/protected-client device-reference check. New `previewBackup(rawText)`: parses and
  validates without touching storage, returning either a rejection reason or preview counts
  (completed runs, independent repairs, whether a mission is present) — corrupt JSON is caught and
  reported the same way as every other rejection, never thrown.
- `src/solo/main.js` — `exportBackupAction` triggers a plain versioned JSON Blob download (no
  executable content, network requests or secrets — the same object `exportData()` already
  returns). Import is two steps: `importFileAction` only previews a chosen file (storage untouched
  either way), and a separate explicit `confirmImportAction` calls `store.replaceData` and then
  reloads the page — so every piece of in-memory state, not just profile/mission, starts fresh
  from what was just installed, the same guarantee an actual restart gives.
- `src/solo/view.js` — a new Backup section on Home: Export button, a file input for Import, an
  error message on rejection, and (on a valid preview) a confirmation box with "Export current
  backup first", Cancel and Replace — all preview/rejection text rendered via `textContent`, never
  `innerHTML`.
- `tests/solo/backup.test.mjs` (6 cases): export+preview+replace round-trips active configuration
  and progress exactly; corrupt JSON, wrong format/version and invalid device references are all
  rejected without mutating current work; previewing alone never replaces anything.
- `tests/solo/store.test.mjs` — its `replaceData` fixtures were upgraded from minimal stubs
  (`{schema:1}`) to fully valid profile/mission shapes to satisfy the new stricter validation, plus
  two new tests for the model-invariant rejections (an invalid network shape; a mission
  referencing a device its own network doesn't have).

**Verified live in a browser, not just Node tests:** completed a real repair, exported it via a
captured browser download, inspected the saved JSON's shape/counters, re-imported that exact file
(the preview showed the correct counts and an "active mission" notice, without touching storage),
confirmed Replace (the page reloaded), re-entered `enable`, and confirmed Progress still showed
the same completed run. A corrupt-JSON file was rejected with a visible error and no confirmation
prompt appeared.

## Next task: S18

Continues DAY6 (S18: browser integration tests). Read only `the-field-solo-week/tasks/S18.md` and
whatever contracts it names before starting — its own `verify` command in `TASKS.json` is
`npm run solo:e2e`, a script that doesn't exist in `package.json` yet, so S18 likely both writes
Playwright-based end-to-end journeys and adds that npm script — but confirm scope against the
actual task file rather than assuming. This session has already been running ad hoc Playwright
checks against `npm run dev` at 390px for every prior task's manual verification (see
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, launched via the globally-installed
`/opt/node22/lib/node_modules/playwright/index.mjs`) — S18 is likely about turning that same kind
of check into committed, repeatable test files.

Next command: read `the-field-solo-week/tasks/S18.md`, then implement its files and run its
listed checks.
