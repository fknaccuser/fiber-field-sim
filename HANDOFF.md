# Handoff — paste this into the new session

## Update after the first Codex increment

Stow/raise and Back are implemented. Current baseline: **49 files / 623 tests** and clean
TypeScript. Read `docs/architecture/item-9-stow-raise.md` for implementation details,
browser verification and limits. Continue with **§3.1–3.2 truck and tool shelf** next.
The instructions below describe the original incoming handoff; its test counts and
"Start with" section are historical.

You are picking up an in-progress project: a training simulator for outside-plant fiber
technicians. React + TypeScript + Vite, offline PWA, phone-first, no backend. There is a
large working engine already here and most of the value in your work is **not breaking it**.

## Read in this order before writing any code

1. `README.md` — what the engine is and the four rules.
2. `docs/architecture/README.md` — the index of every build item.
3. `docs/architecture/item-7-viewports.md` — how the viewport and 3D layers are wired.
4. `docs/architecture/item-8-generator-and-world.md` — the scenario generator and the
   physical 3D world.
5. `docs/architecture/item-9-SPEC-simulator-shell.md` — **this is your work order.**
6. `docs/reference/*.jpg` — photographs of the real cabinet the world must emulate, and the
   most important reference in the spec. **Not committed** (they show a real operator's
   plant); ask the project owner for them before starting spec §4. The written description
   in §4 is detailed enough to work from without them.

## Verify your environment first

```bash
npm install
npx tsc -b      # must be clean
npm test        # must be 48 files / 618 tests passing
npm run dev     # http://localhost:5173
```

If that baseline is not green before you start, stop and say so. Do not build on a red tree.

## Four invariants — breaking any of these is a failed delivery

1. **The UI never sees the answer key.** `src/ui/store/sessionStore.tsx` is the only module
   holding an unredacted `SessionState`. `src/session/redaction.test.ts` greps `src/ui/**`
   for `appliedFaults`, `groundTruth` and `hidden.` and fails the build if one appears.
   Anything you render must be derived from the action log (what the trainee observed) or
   the trainee's own claims — never from the fault list.
2. **Determinism.** `scenarioId + seed` reproduces a run exactly. Resume, replay and share
   codes depend on it. All randomness goes through `createRng(deriveSeed(...))` in
   `src/world/random.ts`. Never call `Math.random()` in engine, scenario or event code.
3. **One WebGL context.** Viewports declare a mount policy; anything holding a *WebGL*
   canvas must be `'unmount'`, so only one GL context is ever alive.

   This is about **GL contexts, not `<canvas>` elements.** A 2D canvas — the OTDR trace, the
   fiber-scope end-face — is cheap and does not count. It is normal and correct for a held
   OTDR to have two canvas elements on screen: one WebGL backdrop plus one 2D trace.

   Verify by switching through every view ten times and counting canvases that actually
   hold a GL context:

   ```js
   [...document.querySelectorAll('canvas')]
     .filter(c => { try { return !!(c.getContext('webgl2') || c.getContext('webgl')); }
                    catch { return false; } }).length   // must never exceed 1
   ```

   (An earlier version of this file said "count `document.querySelectorAll('canvas')`, never
   exceed 1". That was wrong, and it cost real fidelity — see the follow-ups below.)
4. **The scenario validator stays green.** It replays each scenario's reference solution
   through the real runner and fails unless it scores 100 on accuracy/evidence/safety. If
   you touch action costs, presence rules or inventory rules, run the full generator suite.

## How to work

- **One work item at a time**, in the order §10 of the spec suggests. Stop after each and
  report: what you built, what you verified, what you did not finish.
- Keep `npx tsc -b` and `npm test` green between items. Add tests for every pure module you
  write (layout, camera, policy tables, event scheduling).
- **This is a visual product — type-checking proves nothing about whether it looks right.**
  Run the dev server and actually look at it after each item. If you cannot run a browser,
  say so explicitly rather than claiming a visual change works.
- Do not add manufacturer logos, CAD, photographs or proprietary UI. Original "FiberOps"
  branding only. Credible form is fine; copied marks are not.

## Start with

Two corrections to the stow/raise increment, **before** any new feature work. Both are
specified in detail in
[`docs/architecture/item-9-stow-raise.md`](docs/architecture/item-9-stow-raise.md) under
"Follow-ups — do these first":

1. **Un-gate the instrument screen and restore the live backdrop.** The screen currently
   does not render until a 3D snapshot succeeds, with no timeout. If no frame is ever
   produced, the instrument is permanently blank.
2. **Stop the device collapsing at short viewport heights.** At 739×313 the screen is 4 px
   tall and the Measure button is not rendered.

Then continue with spec §3.1–3.2 — the persistent HUD, the truck, and the physical tool
shelf — and replace the tab strip.

*(Historical: the original "start with" for this handoff was spec §3.3, stow/raise. That
increment is implemented; see the document above.)*
