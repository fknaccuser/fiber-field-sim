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

## Next task: S03

Read (only): `the-field-solo-week/tasks/S03.md` and whatever contracts it names. Per
BUILD_AND_HANDOFF.md's Day1 row, S03 is the remaining Day1 piece: "exact healthy network
fixture." `fixtures/healthy-branch.json` in the package (not yet copied into the repo) is almost
certainly the referenced contract — copy it into `src/solo/` (or wherever S03 says) rather than
inventing a network shape ahead of the model.js/ip.js/forward.js engine tasks that consume it.

Next command: read `the-field-solo-week/tasks/S03.md`, then `npm run solo:test` once its files
are in place. DAY1 checkpoint (S01–S03) closes once S03's acceptance passes.
