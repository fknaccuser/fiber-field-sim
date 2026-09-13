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
