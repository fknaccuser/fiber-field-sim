# The Field Solo — task results log

One entry per completed task. See STATE.json for the current machine-readable status and
HANDOFF.md for narrative context and the exact next step.

## S01 — Baseline and launch shell (Day 1)

**Baseline, recorded before any change:**
- `git status --short` — clean, on `claude/field-solo-implementation-am520q`.
- `npm ci` — 431 packages installed, 0 vulnerabilities.
- `npx tsc -b` — exit 0.
- `npm test -- --run` (Vitest) — exit 0, 73 files / 1030 tests passing.
- `npm run build` — exit 0, 851 modules transformed, PWA precache 21 entries.

**Built:** `src/solo/app.js`, `src/solo/main.js`, `src/solo/styles.css`,
`tests/solo/shell.test.mjs`; edited `index.html` (script/link swap only) and `package.json`
(added `solo:test` only).

**Checks run after the change:**
- `npm run solo:test` — exit 0, 6/6 passing.
- `npx tsc -b` — exit 0 (unchanged; old `.tsx` modules still typecheck, untouched).
- `npm run build` — exit 0, 6 modules transformed (old React/Three.js code no longer reachable
  from the new entry, still present on disk), PWA precache 17 entries.
- `npm test -- --run` (Vitest) — exit 0, 73 files / 1030 tests, unaffected.
- Manual scripted Chromium check (Playwright, pre-installed browser, throwaway script not
  committed) against `npm run dev`: opening → bad command shows "Command not recognized." and
  stays → `  ENABLE  ` (case-insensitive, trimmed) reaches Home after the init sequence → reload
  returns to opening → command field is a real labeled, non-`display:none` input. No console
  errors.

**Acceptance (S01.md):** met. "enable opens Home" — yes. "reload shows opening by default" —
yes (no persistence exists yet, by design; that's S02). "no old module imports are invoked from
new entry" — confirmed by the build's module count. "Native mobile keyboard can type enable" —
verified indirectly: the command field is a real `<input type="text">`, which is what makes the
native mobile keyboard appear; there is no device lab in this session to confirm on physical
hardware.

**Deviations recorded (non-blocking):** see "Noted deviations" in HANDOFF.md — repo/branch name
in the package text vs. the actual checkout, and Vite/TypeScript tooling vs. the package's
assumed `scripts/build.mjs`/`scripts/serve.mjs`.

**Status:** complete.

## S02 — Local save foundation (Day 1)

**Built:** `src/solo/store.js` (IndexedDB adapter + memory adapter + `openStore` binding
`loadLocal`/`saveLocal`/`loadProfile`/`saveProfile`/`loadMission`/`saveMission`/`exportData`/
`replaceData`), `src/solo/view.js` (`renderHome`), extended `src/solo/app.js`
(`createInitialProfile`, `boot`, `applyProfileUpdate`, `persistProfile`,
`updateAndPersistProfile`), extended `src/solo/main.js` to boot through storage and delegate
Home rendering to `view.js`. Tests: `tests/solo/store.test.mjs` (11 cases),
`tests/solo/app.store.test.mjs` (8 cases).

**Checks run:**
- `npm run solo:test` — exit 0, 25/25 passing (includes S01's 6).
- `npx tsc -b` — exit 0.
- `npm run build` — exit 0, 8 modules transformed.
- `npm test -- --run` (Vitest) — exit 0, 73 files / 1030 tests, unaffected.
- Manual scripted Chromium check against real `npm run dev` + real browser IndexedDB (not
  the memory adapter the Node tests use): Continue disabled with no mission; the saved profile
  in IndexedDB has the full contract shape (`schema`, `openingEnabled`, `textScale`,
  `completedRuns`, `studyAnswers`, `cardReviews`, `recentFingerprints`, `counters`, `evidence`,
  `countedAttemptIds`); writing `openingEnabled: false` + `textScale: 1.25` into that record and
  reloading skips straight to Home with `textScale` still `1.25`. No console errors.

**Acceptance (S02.md):** met. "Refresh preserves the skip-opening preference and text size" —
confirmed against real IndexedDB, not just the in-memory test adapter. "Forced storage failure
displays failure rather than Saved" — confirmed by `tests/solo/app.store.test.mjs`'s failing-store
case (`saveStatus` becomes `'error'`, message `'Save failed'`, and the in-memory profile change is
retained rather than rolled back, matching UI_AND_STORAGE.md's dispatch order). "Real IndexedDB
reload coverage is completed in S18" — the manual browser check here already exercises real
IndexedDB as a sanity check; S18 is where this becomes a committed, repeatable browser test.

**Deferred, and why (recorded in HANDOFF.md):** `replaceData`'s validation of "allowed enums/IDs,
graph bounds" per DATA_CONTRACTS.md needs the mission/device schema that doesn't exist until the
engine tasks (S04+); everything checkable today (format, version, profile shape, 5MiB size) is
validated now. No visible Settings screen yet to hand-toggle opening/text scale — the underlying
`boot`/`applyProfileUpdate` mechanism is complete and tested, but nothing in the UI calls it yet.

**Status:** complete.

## S03 — Network model and fixed fixture (Day 1)

**Built:** `src/solo/model.js` (`validateNetwork`, `cloneNetwork`), `src/solo/layouts.js`
(`createHealthyLayout`), `tests/solo/model.test.mjs` (17 cases).

**Bug found and fixed (in S02's `store.js`, caught by this task's full-suite regression run):**
`replaceData`'s "keep exactly one recovery record" guarantee could fail when the new recovery
key (an ISO timestamp) collided with the one being pruned at millisecond resolution, because
`writeMany` applied puts before deletes. Fixed by deleting before putting in both adapters.
Verified stable across 5 consecutive full `npm run solo:test` runs (42/42 each time) after the
fix; it had failed intermittently before.

**Checks run:**
- `node --test tests/solo/model.test.mjs` — exit 0, 17/17 passing.
- `npm run solo:test` (full suite) — exit 0, 42/42 passing, confirmed stable over 5 runs.
- `npx tsc -b` — exit 0.
- `npm run build` — exit 0, 8 modules transformed (engine files aren't imported by the UI yet,
  so bundle size is unchanged from S02).
- `npm test -- --run` (Vitest) — exit 0, 73 files / 1030 tests, unaffected.

**Acceptance (S03.md):** met. "BR has six devices and five links" — confirmed, and BR at
x=42/host=130 reproduces the golden fixture's exact addresses. "HM has five devices; OF seven" —
confirmed. "Changing the clone never changes the source" — confirmed (mutating a cloned
network's devices/links/revision leaves the source's untouched). "Wrong gateway is valid
structure" — confirmed (`validateNetwork` accepts a syntactically valid but unassigned gateway).
"Missing device ID is invalid" — confirmed (`MISSING_ID`). The task body's own "Test IDs,
endpoint references, single-router limit, cycle rejection and clone independence" is also
covered: duplicate device ID, unknown port/device reference, a second router, and a link closing
a physical loop (via union-find over the device graph) all correctly fail.

**Deferred, and why (recorded in HANDOFF.md):** the `label` parameter's real three display-name
templates live in `reference/seed.mjs`, out of scope for S03's reading list and copied verbatim
as `src/solo/seed.js` by a later task; only `'plain'` (identity, no-op) is exercised now, and a
generic placeholder prefix stands in for the other two until that file lands. Layout x/y
coordinates from SCENARIOS.md aren't part of ENGINE_RULES.md's Network state shape and are left
for the topology/diagram task.

**Status:** complete. **DAY1 checkpoint (S01-S03) reached**: small app shell, save/reload, and
the exact healthy network fixture all work and are tested.

## S04 — IPv4 and layer-2 reachability (Day 2)

**Built:** `src/solo/ip.js` (`parseIPv4`, `prefixFromMask`, `inSubnet`), `src/solo/forward.js`
(`linkUsable`, internal `layer2Reachable`). Tests: `tests/solo/ip.test.mjs` (7),
`tests/solo/l2.test.mjs` (11).

**Checks:** `node --test tests/solo/ip.test.mjs tests/solo/l2.test.mjs` — exit 0, 18/18.
`npm run solo:test` — exit 0, 60/60, stable over 3 runs. `npx tsc -b` — exit 0. `npm run build`
— exit 0. `npm test -- --run` (Vitest) — exit 0, 73/1030, unaffected.

**Acceptance:** met exactly. `10.42.10.130` in `10.42.10.0/24` true, `.20.20` false.
`255.255.254.0` → 23; `255.0.255.0` → null. Removing VLAN10 from the SW1↔SW2 trunk blocks PC1's
L2 path to the router's VLAN10 segment while PC2's VLAN20 path stays reachable.

**Deferred, and why:** `canReach`/`resolveName`/`testService` (forward.js's other declared
exports) need the one-way IP pseudocode on top of L2, which S04.md's own task text didn't ask
for — left for the next task that lists them.

**Status:** complete.

## S05 — Routed connectivity and DNS (Day 2)

**Built:** `canReach`, `resolveName`, `testService` added to `src/solo/forward.js`.
`tests/solo/forward.test.mjs` (24 cases).

**Checks:** `node --test tests/solo/forward.test.mjs` — exit 0, 24/24. `npm run solo:test` —
exit 0, 84/84, stable over 3 runs. `npx tsc -b`/`npm run build` — exit 0. Vitest — 73/1030,
unaffected.

**Acceptance:** met. Healthy target/protected pass. D1 fails name tests (`DNS_UNREACHABLE`)
while a direct server ping works. D2 fails both clients. A missing server return-gateway breaks
the return path (surfaces as `DNS_UNREACHABLE` with `details.transport: 'RETURN_PATH_FAILED'`
for the name test, and directly as `RETURN_PATH_FAILED` for a raw ping — verified both ways).
Alternate valid target IP (.131) passes.

**Status:** complete.

## S06 — Configuration actions (Day 2)

**Built:** `src/solo/actions.js` (`applyAction`, all ten documented action types).
`tests/solo/actions.test.mjs` (24 cases). Consolidated `model.js` onto `ip.js`'s `parseIPv4`;
exported `isValidVlan`/`checkAddressField` for reuse.

**Checks:** `node --test tests/solo/actions.test.mjs` — exit 0, 24/24. `npm run solo:test` —
exit 0, 108/108, stable over 3 runs. `npx tsc -b`/`npm run build` — exit 0. Vitest — 73/1030,
unaffected.

**Acceptance:** met, with one documented discrepancy. S06.md's acceptance text says "all eleven
action types have one valid and one invalid-input case," but ENGINE_RULES.md's Action envelope
and Configuration actions sections both enumerate exactly ten, and no eleventh is named anywhere
in DATA_CONTRACTS.md either — implemented and tested all ten actually specified rather than
inventing one. "Applying a no-op preserves revision" — confirmed. "Invalid actions return the
original state unchanged" — confirmed (`assert.deepEqual(result.state, network)` on rejections).
"A wrong but valid gateway can be saved and diagnosed" — confirmed (saves, then `GATEWAY_UNREACHABLE`
on direct ping / `DNS_UNREACHABLE` on the name test). Shutdown breaking and no-shutdown restoring
connectivity, and a cable move to an occupied port rejecting unchanged, both confirmed via the
evaluator (`testService`) as instructed.

**Status:** complete. **DAY2 checkpoint (S04-S06) reached**: link/IP/VLAN/DNS evaluator and
configuration actions all work and are tested.

## S07 — Clickable topology (Day 3)

**Built:** `src/solo/diagram.js` (`renderTopology`), `app.js` additions
(`createConfigureAttempt`, `startConfigureSession`, `exitMission`, `selectDevice`), `view.js`
additions (`renderMission`, device Inspect panel, Home's "Configure a network" section),
`styles.css` mission/diagram/responsive rules. `tests/solo/app.mission.test.mjs` (8 cases).

**Checks:** `node --test tests/solo/app.mission.test.mjs` — exit 0, 8/8. `npm run solo:test` —
exit 0, 116/116. `npm run build` — exit 0. `npx tsc -b` — exit 0. Vitest — 73/1030, unaffected.
Manual scripted Chromium check at a 390px viewport (real browser, not committed): every device
in HM/BR/OF selectable via SVG click and via the equivalent list; keyboard focus + Enter selects;
no horizontal overflow in any layout; hiding/re-showing the Device tab preserves the selection.

**Acceptance:** met. "Every device in all three layouts is reachable by touch and keyboard" —
confirmed for all 5+6+7 devices, both input modes. "No horizontal page overflow at 390px" —
confirmed for all three layouts. "Hidden tabs do not discard terminal or selection state" —
confirmed (panels are hidden via the `hidden` attribute, never unmounted; a real terminal exists
starting S09, so this is re-verified then).

**Status:** complete.

## S08 — Device inspection and editing (Day 3)

**Built:** `src/solo/devices.js` (action-builders, `runMissionTest`, form/test rendering),
`app.js` additions (`applyMissionActions`, reconnect flow, `recordTestEvent`), `diagram.js`
cable selection, `view.js` Configure forms + reconnect panel + real Findings, `main.js` autosave.
`tests/solo/devices.test.mjs`, `tests/solo/app.editing.test.mjs` (17 cases together).

**Bug found and fixed while building this:** error feedback for forms/reconnect was being
written to DOM nodes already discarded by this app's full-teardown `render()`, called
synchronously inside the same handler before the error text was ever set. Moved to `state.error`.

**Checks:** `node --test tests/solo/devices.test.mjs tests/solo/app.editing.test.mjs` — exit 0,
17/17. `npm run solo:test` — exit 0, 133/133, stable over 3 runs. `npx tsc -b`/`npm run build` —
exit 0. Vitest — 73/1030, unaffected. Manual scripted Chromium check (390px, not committed):
Configure change alters a real Test result; Cancel restores the true value; invalid IP shows its
specific error and leaves the network untouched; cable tap/source/destination/Connect reconnects.

**Acceptance:** met. "GUI changes affect actual tests" — confirmed (breaking a gateway via
Configure changed "Open portal" from passed to failed). "Cancel changes nothing" — confirmed both
at the form level (input reverts) and the network level (failed Apply never touches the device).
"Invalid forms show specific errors" — confirmed (`ip is not a valid IPv4 address.`, etc., one
per action's real rejection code). "Reconnecting P1 fixes link state" — confirmed at the engine
level (`tests/solo/app.editing.test.mjs`) and the reconnect UI wiring confirmed live in-browser.
"Setting a valid but wrong gateway causes a real failed test" — confirmed
(`applyMissionActions` + `testService` test, and live in-browser).

**Status:** complete.

## S09 — Terminal and command builder (Day 3)

**Built:** `src/solo/cli.js` (`executeCommand`, `getHelp`, `createTerminalSession`),
`devices.js`'s `renderTerminal`, `app.js` terminal-session helpers. `tests/solo/cli.test.mjs`
(11 cases).

**Documented gaps against the given contracts (non-blocking, both recorded in HANDOFF.md):**
no specific server "status" command is named anywhere — reused `show running-config`. `getHelp`'s
declared 2-arg signature can't resolve a command table without the device's kind, which the
documented Terminal session shape doesn't carry — added `deviceKind` to it.

**Checks:** `node --test tests/solo/cli.test.mjs` — exit 0, 11/11. `npm run solo:test` — exit 0,
144/144, stable over 3 runs. `npx tsc -b`/`npm run build` — exit 0. Vitest — 73/1030, unaffected.
Manual scripted Chromium check (390px, not committed): the full enable/conf t/interface/shutdown
sequence breaks then (no shut) restores PC1's service; user-mode shutdown rejected on a fresh
terminal; a builder-inserted command fills the input and submits correctly.

**Acceptance:** met exactly. "enable then conf t then interface Gi0/1 then shutdown breaks the
link; no shut restores it" — confirmed both at the engine level and live in-browser. "User-mode
shutdown rejects" — confirmed (network and mode both unchanged, explicit unsupported message).
"show run reflects GUI changes" — confirmed (a `setPortAdmin` applied outside the terminal shows
up in the next `show running-config`). "Builder-edited execution is assisted" — confirmed (a
builder-then-edited-then-submitted command records `assistance:true`; the same text typed by
hand never does).

**Status:** complete. **DAY3 checkpoint (S07-S09) reached**: clickable graph, editable devices,
and the supported CLI all work and are tested.
