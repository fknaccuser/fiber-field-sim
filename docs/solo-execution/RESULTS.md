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

## S10 — Fault injection and deterministic generation (Day 4)

**Built:** `src/solo/seed.js` (reference copy, unchanged), `src/solo/generate.js`
(`generateCase`, `nextCase`, `applyRecipe`), `layouts.js`'s `deriveRequirements` (factored out of
`app.js`'s `createConfigureAttempt`). `tests/solo/generate.test.mjs` (25 cases).

**Checks:** `node --test tests/solo/generate.test.mjs` — exit 0, 25/25. `npm run solo:test` —
exit 0, 169/169, stable over 3 runs. `npx tsc -b`/`npm run build` — exit 0. Vitest — 73/1030,
unaffected. No UI wiring in this task, so no browser check applies.

**Acceptance:** met. "START is P1" — confirmed. "HM cannot generate V2 or tier4" — confirmed (10
HM V-family codes all resolve to V1; an HM+tier4 code throws). "Every tier4 pair stays broken
after either repair alone and succeeds after both" — confirmed for all 6 approved pairs. "No
generated task uses unsupported protocols" — the engine only models Ethernet/IPv4/VLAN/DNS, so
this holds by construction; also confirmed generated faulted networks stay `validateNetwork`-valid.

**Status:** complete.

## S11 — New mission, replay and seed entry (Day 4)

**Built:** `app.js` mission-lifecycle functions (`attemptStartMission`, `confirmReplaceMission`,
`cancelReplaceMission`, `replayMission`, `startNewVariation`, `resumeMission`), Home/mission UI in
`view.js`/`main.js` (recommended job, skill buttons, seed entry, Resume/Replace prompt, Replay/New
variation). `tests/solo/app.session.test.mjs` (13 cases).

**Bug found and fixed while verifying live in a browser:** `exitMission` was clearing
`mission: null` on Exit, silently abandoning the active mission instead of just navigating home —
"Continue mission" was disabled the instant you left the workspace. Fixed to preserve the mission,
selected device and recent-device history; updated the one S07 test that asserted the old (wrong)
behavior.

**Checks:** `node --test tests/solo/app.session.test.mjs` — exit 0, 13/13. `npm run solo:test` —
exit 0, 182/182, stable over 3 runs. `npx tsc -b`/`npm run build` — exit 0. Vitest — 73/1030,
unaffected. Manual scripted Chromium check (390px, not committed): recommended mission survives a
hard reload; Resume/Replace prompt on a second code; Resume keeps the original, Replace swaps in
the new one; an invalid replacement reports its error and leaves the original mission running; a
skill button starts a fresh generated variation.

**Acceptance:** met. "Invalid code keeps the active mission" — confirmed both directly (no active
mission) and as a rejected replacement (active mission untouched, error surfaced). "Same code on a
new profile yields the same network" — confirmed (two independent starts of the same code produce
deep-equal `initialNetwork`/`requirements`). "Variation differs from recent fingerprints or
produces a bounded visible error" — confirmed (a normal variation records a new fingerprint; an
always-invalid layout/tier combination exhausts `nextCase`'s 100 tries and surfaces
`"Choose a seed manually."` rather than looping). "Refresh resumes current state" — confirmed via
a real `boot()`/`saveLocal()` round-trip and live in the browser.

**Status:** complete.

## S12 — Tiered guidance and customer facts (Day 4)

**Built:** `src/solo/content.js` (hints, customer facts, harmless details, tier goals), `app.js`
(`isRecipeRepaired`, `currentHintRecipeId`, `requestHint`, `showCauseCount`,
`showHarmlessDetail`, `pauseMissionTimer`, `resumeMissionTimer`), mission-brief UI in `view.js`,
Page Visibility wiring in `main.js`. `tests/solo/content.test.mjs` (17 cases), plus a regression
case added to `tests/solo/model.test.mjs`.

**Two real bugs found and fixed (in S08/S10 code, caught by this task's testing):**
1. `isRecipeRepaired`'s P2/V1/V2 checks read the target client's own port instead of the switch
   port it connects through — hint progression could never detect those three as repaired. Caught
   by a failing tier4-pair test before any browser check.
2. `layouts.js`'s `deriveRequirements` had the same confusion for VLANs — `protectedVlan` silently
   returned 10 instead of 20 for every layout since S10, masked because every prior test happened
   to use VLAN 10 as its target anyway. Caught live in the browser, fixed, regression-tested
   across HM/BR/OF.

**Checks:** `node --test tests/solo/content.test.mjs` — exit 0, 17/17 (14 in this file + 3 added
elsewhere counted separately). `npm run solo:test` — exit 0, 197/197, stable over 3 runs (after
both fixes). `npx tsc -b`/`npm run build` — exit 0. Vitest — 73/1030, unaffected. Manual scripted
Chromium check (390px, not committed): tier1 brief shows facts/cause count; two hint requests
accumulate nudge-then-clue text and survive Exit+Continue; untimed tier shows elapsed-only;
protected-VLAN fix confirmed live.

**Acceptance:** met. "Hints remain available at tier4" — confirmed. "Tier3 starts without a cause
label" — confirmed (`showCauseCount` false at tier3; no recipe ID ever appears in customer-facing
text). "Tier4 progresses hints to the remaining fault after the first is repaired" — confirmed for
all six approved pairs. "Paused app time does not increase active elapsed time" — confirmed with
injected fake clock values (active-active-paused-active sequencing).

**Status:** complete. **DAY4 checkpoint (S10-S12) reached**: eight faults, deterministic
variations, tiers and hints all work and are tested.

## S13 — Findings, completion and debrief (Day 5)

**Built:** `src/solo/grade.js` (new — `evaluateCompletion` checks live target/protected service
tests, department subnet+VLAN constraints for both clients, a same-current-revision recorded test
event so a stale pass after further changes doesn't count, a genuinely-captured selected finding,
and a 10-500 char note; `summarizeRun`). `app.js` (`captureObservedFields`, `selectDevice` now
also logs an `'inspection'` event, `toggleFinding`, `setCompletionNote`, `completeRun` — on pass,
moves to the debrief screen, updates profile counters/evidence/completedRuns for repair-mode
missions). `view.js` (`renderFindings` rewritten to show selectable findings, a live completion
checklist, note field and submit; new `renderDebrief`). `main.js` (findings/submit/debrief
handlers; `noteChange` deliberately skips `render()` to avoid destroying the textarea and losing
focus/cursor position mid-edit). `tests/solo/grade.test.mjs` (new).

**Bug found and fixed while verifying live in a browser:** `runTest`'s `'checkProtected'` calls
were logging the test event under whichever device's Tests panel triggered the click, not
`mission.protectedClientId` — the client the test actually verifies — so `grade.js`'s
same-current-revision check could never find a matching event no matter what the player did.
Fixed by special-casing the logged device id for `checkProtected` in `main.js`.

**Checks:** `node --test tests/solo/grade.test.mjs` — exit 0. `npm run solo:test` — exit 0,
208/208, stable over 3 runs. `npx tsc -b`/`npm run build` — exit 0. Vitest — 73/1030, unaffected.
Manual scripted Chromium check (390px, not committed): submitting before any repair shows a
checklist with failing items; reconnecting the workstation cable, running both service tests,
selecting a finding and writing a note brings every check to passing and Submit reaches the
debrief screen.

**Acceptance:** met. "Submission is blocked until every check passes" — confirmed (checklist
shows `✗` pre-repair, submit is refused with `CHECKS_FAILED`). "A stale test from before a change
does not count" — confirmed via a test that bumps the network revision after a passing test and
finds the completion check now failing. "A genuinely selected finding and a note of adequate
length are both required" — confirmed. "Repair-mode completion updates skill evidence and counts
independent vs. assisted runs" — confirmed.

**Status:** complete.

## S14 — Progress and recommendation (Day 5)

**Built:** `src/solo/progress.js` (new — `familyStats`/`allFamilyStats`, `recommendedTier`,
`leastPracticedFamily`, `recommendMission`, all pure functions of the stored profile). `main.js`/
`view.js` (Home's recommended-job card and skill buttons now reflect real progress instead of a
fixed code/tier1; a new Progress screen; a short static recommended-tier line on the debrief).
`tests/solo/progress.test.mjs` (13 cases).

**No app bugs found this task** — S14 builds entirely on data S13 already produces correctly
(`completedRuns`, `evidence`, `counters`); no defects were exposed in either direction.

**Checks:** `node --test tests/solo/progress.test.mjs` — exit 0, 13/13. `npm run solo:test` —
exit 0, 221/221, stable over 3 runs. `npx tsc -b`/`npm run build` — exit 0. Vitest — 73/1030,
unaffected. Manual scripted Chromium check (390px, not committed): fresh profile shows the fixed
first job and Tier 1 on every skill button and an empty Progress screen; completing that job
updates the recommendation to the least-practiced family, bumps that family's skill button to
Tier 2, shows the static recommended-tier line on the debrief, and the Progress screen reflects
the new stats.

**Acceptance:** met. "Ten repeats of one cause do not become two distinct causes" — confirmed
(distinct causes come from evidence/recipe-ID keys, never a run tally). "Assisted success remains
visible but is not independent evidence" — confirmed (`completed`/`assisted` count it;
`distinctCauses`/`independent` and the tier2-3/3-4 thresholds never do). "Restart preserves
progress" — confirmed via a JSON serialize/reload round-trip producing identical stats. "Configure
runs do not inflate repair counts" — confirmed (every derivation filters to `mode === 'repair'`).

**Status:** complete.

## S15 — Configure a supplied network (Day 5)

**Built:** `src/solo/app.js` (`disconnectLink`, `requestReset`/`cancelReset`/`confirmReset`,
`completeRun` now selects `evaluateCompletion` vs. the new `evaluateConfigureChecklist` by mode).
`src/solo/grade.js` (`evaluateConfigureChecklist` — department/portal-access checks only, reusing
`remainsInDepartment`, now exported, rather than re-deriving its VLAN resolution). `view.js` (a
Disconnect button in the reconnect panel; a confirmed Reset button in the mission header for
configure missions; Findings/Submit now render for both modes with mode-appropriate wording).
`tests/solo/configure.test.mjs` (8 cases).

**Gaps found and fixed, all pre-existing rather than introduced by this task:** configure sessions
had no way to disconnect a cable outside the full reconnect flow; `replayMission` was silently a
no-op for configure attempts (no caseCode to regenerate from), leaving no way to recover a broken
configure session at all; and Findings only ever rendered its note/checklist/submit block in
repair mode, so a configure session's checklist was always empty and Submit did not exist for it.

**Checks:** `node --test tests/solo/configure.test.mjs` — exit 0, 8/8. `npm run solo:test` —
exit 0, 229/229, stable over 3 runs. `npx tsc -b`/`npm run build` — exit 0. Vitest — 73/1030,
unaffected. Manual scripted Chromium check (390px, not committed): a configure mission shows
Reset instead of Replay/New variation; disconnecting a cable directly fails the checklist with a
concrete message; Reset's Cancel leaves the broken network untouched, confirming restores the
healthy snapshot; Submit with no documentation reaches a "Configuration complete" debrief;
Progress stays at zero afterward.

**Acceptance:** met. "Learner can configure, break, save, reload and recover a supplied network"
— confirmed (disconnect/field changes break it, autosave persists it, Reset recovers it). "Reset
requires confirmation" — confirmed (a cancelled reset leaves the broken network byte-for-byte
unchanged). "Repair progression does not change after a configure session" — confirmed
(`counters`/`evidence`/`completedRuns` are deep-equal before and after, with or without a note).

**Status:** complete.

## S16 — Small study and reference pack (Day 6)

**Built:** `content.js` (`STUDY_PACK` copied exactly from the supplied fixture; `REFERENCE_ENTRIES`
covering every ENGINE_RULES.md CLI command plus four named concept distinctions). `study.js` (new
— lesson/question/card selection, table-driven grading, latest-attempt-only answer/review
recording, reference search). `app.js` (Study navigation, `openReference`). `view.js`
(`renderStudy`, `renderReference`). `tests/solo/content.test.mjs` (+18 cases, 26 total).

**No app bugs found this task.**

**Checks:** `node --test tests/solo/content.test.mjs` — exit 0, 26/26. `npm run solo:test` —
exit 0, 241/241, stable over 3 runs. `npx tsc -b`/`npm run build` — exit 0 (study pack bundles into
the built JS, precached by the PWA build). Vitest — 73/1030, unaffected. Manual scripted Chromium
check (390px, not committed): family filter narrows lessons; a lesson's questions show every
option's explanation with correct/wrong marks once answered; flashcard reveal + Got it/Review
again works; reference search filters correctly; opening Reference mid-repair marks the run
assisted (confirmed via the debrief's "Completed with support") and returns to the same mission
tab.

**Acceptance:** met. "Schema test verifies counts, unique IDs, one correct option and all
explanations" — confirmed directly. "Study is fully local" — confirmed (no fetch anywhere in
study.js/content.js). "Returning from reference preserves mission state" — confirmed (same
mission id/network/selectedDeviceId/tab before and after). "Quiz correctness is not a
prerequisite gate" — confirmed (`recordStudyAnswer` never blocks on correctness; nothing reads
`studyAnswers` to gate any other feature).

**Status:** complete.

## S17 — Backup and restore (Day 6)

**Built:** `store.js` (`validateBackup` strengthened to full structural validation reusing
`model.js`'s `validateNetwork`; new `previewBackup`). `main.js` (`exportBackupAction` — Blob
download; `importFileAction`/`confirmImportAction` — preview then explicit Replace, reloading the
page on success). `view.js` (Home's Backup section: Export, Import, error, and a preview/Replace
confirmation, all `textContent`-rendered). `tests/solo/backup.test.mjs` (6 cases). `store.test.mjs`
fixtures upgraded to fully valid shapes plus 2 new model-invariant rejection tests.

**No app bugs found this task** — S02's `exportData`/`replaceData`/recovery-record mechanism
already worked; this task deepened its validation and built the UI on top of it.

**Checks:** `node --test tests/solo/backup.test.mjs` — exit 0, 6/6. `node --test
tests/solo/store.test.mjs` — exit 0, 13/13. `npm run solo:test` — exit 0, 249/249, stable over 3
runs. `npx tsc -b`/`npm run build` — exit 0. Vitest — 73/1030, unaffected. Manual scripted
Chromium check (390px, not committed): completed a real repair, exported it via a captured
browser download, re-imported that exact file (preview showed correct counts, no storage
mutation), confirmed Replace (page reloaded), and Progress showed the same completed run
afterward; a corrupt-JSON file was rejected with a visible error and no confirmation prompt.

**Acceptance:** met. "Corrupt JSON, wrong format/version and invalid references reject without
mutation" — confirmed directly (each leaves `loadLocal()` byte-for-byte unchanged). "Export/import
round trip preserves active configuration and progress" — confirmed (profile and mission are
deep-equal after a full export→preview→replace cycle). "Restore requires explicit Replace" —
confirmed (`previewBackup` alone never calls `replaceData`; a separate test proves a preview never
mutates storage).

**Status:** complete.

## S18 — Browser integration tests (Day 6)

**Built:** `@playwright/test` devDependency; `playwright.solo.config.mjs` (webServer builds then
serves `dist/` via the existing `preview` script; explicit Chromium `executablePath` pointing at
the pre-installed browser; 390px phone-first default viewport). `tests/solo-browser/solo.spec.mjs`
(9 tests). `package.json`'s new `solo:e2e` script.

**Three bugs found and fixed, all in the test file itself (not the app), caught only by running it
against the actual built app:**
1. Several assertions expected "passed" text directly under a Tests button; test results only
   ever render as Findings rows.
2. An assertion checked the completion checklist immediately after filling the note field, which
   deliberately skips re-rendering (to avoid destroying the textarea/losing focus) — a real,
   documented, intentional lag, not a bug to assert against.
3. The Playwright project config's `...devices['Desktop Chrome']` spread silently overrode the
   declared phone-first default viewport with its own 1280x720 — fixed by restating the viewport
   after the spread.

**Checks:** `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm run solo:e2e` — exit 0, 9/9, stable over 2
runs, against the real production build (not the dev server). `npm run solo:test` — exit 0,
249/249. `npx tsc -b`/`npm run build` — exit 0. Vitest — 73/1030, unaffected.

**Acceptance:** met. "All browser flows execute against the production build" — confirmed
(`webServer` always runs `npm run build` first; `baseURL` points at the `preview` server serving
`dist/`, never `vite dev`). "Failures produce screenshot/trace artifacts" — confirmed via
`use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' }` (exercised directly while
debugging this task's own selector fixes, before they were corrected). "Record actual command
outcome; do not call a test passed if browsers could not install" — no browser install was
attempted (the pre-installed Chromium was used directly via `executablePath`); the actual
`npm run solo:e2e` command was run to completion and its real 9/9 result is what's recorded here.

**Status:** complete.

## S19 — Offline installation and update behavior (Day 7)

**Built:** `vite.config.ts` (`registerType: 'prompt'`, `injectRegister: false`). `main.js`
(`setupServiceWorkerRegistration`/`reloadForUpdate` via `virtual:pwa-register`'s `registerSW`).
`view.js` (`renderUpdateBanner`; `renderSaveStatusBanner` shared between Home and the mission
screen; a "Ready offline" note on Home). `app.js` (`isQuotaExceeded`; `persistProfile` now sets
`saveStatus:'quota'` for a quota failure specifically). `tests/solo-browser/offline.spec.mjs`
(4 tests).

**Gap found and fixed, pre-existing rather than introduced by this task:** save failures (of any
kind, not just quota) were only ever surfaced on the Home screen — a failure while a mission was
active had no visible Retry/Export anywhere and Exit was never blocked, contradicting
UI_AND_STORAGE.md's own stated rule. Fixed by rendering the same save-status banner inside the
mission screen and refusing to navigate away from an unresolved failure there.

**Checks:** `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm run solo:e2e` — exit 0, 13/13 (9 from S18 plus
4 new), stable over 2 runs, against the real production build. `npm run solo:test` — exit 0,
249/249, stable over 3 runs. `npx tsc -b`/`npm run build` — exit 0. Vitest — 73/1030, unaffected.
Manual scripted Chromium check against `npx vite preview` (not committed): a simulated
`QuotaExceededError` on the next IndexedDB write produces "Storage is full — not saved" with
visible Retry/Export inside the mission screen, and Exit is refused with an explanatory message.

**Acceptance:** met. "Released scenarios and study work without network after initial download"
— confirmed (offline.spec.mjs's fresh-seeded-case-offline test). "An update does not silently
regenerate an existing attempt" — confirmed both by inspecting the built `sw.js` directly (no
unconditional `skipWaiting()`) and by the queued-reload flow only ever activating on an explicit
user Reload after a flush. "Quota failures offer export rather than false Saved" — confirmed
(`saveStatus:'quota'` renders Retry and Export, never a false "Saved").

**Status:** complete.

## S20 — Owner phone acceptance and repairs (Day 7)

**Built:** `docs/solo-execution/PHONE_CHECK.md` (new). No app code changed — nothing was found to
repair, because nothing could be genuinely tested on real hardware.

**No physical device available.** Per S20.md's own explicit instruction ("If no physical device
is available mark this task blocked on owner check and provide exact steps; do not fabricate
phone validation"), this task is recorded as **blocked**, not complete.

**Checks:** `npm run solo:test` — exit 0, 249/249. `npm run solo:e2e`
(`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) — exit 0, 13/13. `npm run build` — exit 0. All three real,
against the actual production build.

**Best-effort emulated pass (Chromium "iPhone 13" device profile, touch + mobile UA, `tap()`
throughout, explicitly not a substitute):** START through debrief; a VLAN scenario with typed CLI;
a tier4 pair (correctly triggered the Keep-current/Replace prompt); a viewport rotation swap;
an Export download. Zero console errors. Full breakdown, including what remains genuinely
unverified (real software keyboard, real touch comfort, real airplane mode/install flow, real
device rotation) and exact steps for the owner, in `docs/solo-execution/PHONE_CHECK.md`.

**Acceptance:** **not evaluated** — "Owner can complete at least one whole mission offline with
mobile keyboard and save/reopen it," "No critical overlay traps or disappearing controls," and
"Any unverified platform is explicitly marked unverified" all require an actual device to confirm
or deny; the third is satisfied by explicitly marking the platform unverified in PHONE_CHECK.md
rather than assuming pass or fail.

**Status:** blocked on owner check. See `docs/solo-execution/PHONE_CHECK.md` for exact steps.
