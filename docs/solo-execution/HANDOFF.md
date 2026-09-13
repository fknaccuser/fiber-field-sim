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

No profile/mission persistence exists yet — that's S02. Reload always returns to the opening
screen, which matches S01's acceptance line exactly ("reload shows opening by default").

## Actual results (see docs/solo-execution/STATE.json for machine-readable form)

- `npx tsc -b` — exit 0, clean (unchanged from baseline).
- `npm run solo:test` — exit 0, 6/6 passing.
- `npm run build` — exit 0. Bundle dropped from the baseline 851 modules / ~850KB main chunk to
  6 modules / ~3KB main chunk, confirming the old React/Three.js code is no longer reachable
  from the new entry (it is still present on disk, untouched, per S01's "without deleting old
  modules").
- `npm test -- --run` (pre-existing Vitest suite) — exit 0, 73 files / 1030 tests, unaffected
  (baseline was identical: recorded before any change, same numbers).
- Manual scripted check with the pre-installed Chromium via Playwright (not committed; a
  throwaway script under the session scratchpad, not part of this repo) against `npm run dev`:
  opening screen renders; typing `nope` + Enter shows "Command not recognized." and stays on
  opening; typing `  ENABLE  ` + Enter reaches Home (`<h1>The Field</h1>`) after the init
  sequence; a full page reload returns to the opening screen; the command input is a real
  `<input type="text">` (computed `display: block`, not `none`) with an associated `<label>`.
  No console errors.

No baseline failures existed to preserve — `tsc -b`, the Vitest suite, and `npm run build` were
all green before S01 started.

## Next task: S02 — Local save foundation

Read (only): `the-field-solo-week/tasks/S02.md`, `DATA_CONTRACTS.md`, `UI_AND_STORAGE.md`.

Files: `src/solo/store.js`, `src/solo/app.js`, `src/solo/view.js`.

Exact next steps per S02.md:
1. Implement `openStore`, `loadProfile`, `saveProfile`, `loadMission`, `saveMission`,
   `exportData`, `replaceData` against the IndexedDB stores named in UI_AND_STORAGE.md
   (`the-field-solo` v1; `profile` key `"local"`, `mission` key `"active"`, `recovery` key ISO
   timestamp). Resolve writes on `transaction.oncomplete`, not on request success. Keep storage
   behind a small adapter so Node tests can inject memory storage — do not attempt to emulate
   IndexedDB in engine code.
2. Create an initial profile when none exists; persist the opening-skip preference and text
   scale; implement Saved/Saving/"Save failed" states with Retry on failure.
3. Render Home (in the new `view.js`) with a disabled Continue until a real mission exists.

Acceptance: refresh preserves the skip-opening preference and text size; a forced storage
failure shows failure, not Saved. (Real IndexedDB reload coverage is deferred to S18's browser
tests, per DATA_CONTRACTS.md/S02.md.)

Next command: `npm run solo:test` after implementing store.js/app.js/view.js additions.
