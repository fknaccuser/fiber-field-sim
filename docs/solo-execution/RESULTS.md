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
