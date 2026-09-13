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
