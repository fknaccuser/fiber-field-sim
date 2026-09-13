# S20 — Owner phone acceptance check

**Status: BLOCKED on owner check. No physical iPhone or Android device is available in this
execution environment (a sandboxed cloud container with no attached hardware).** Per S20.md's own
instruction — "If no physical device is available mark this task blocked on owner check and
provide exact steps; do not fabricate phone validation" — nothing below claims real-device
acceptance. What follows is (1) the automated gates, which did run for real, and (2) a best-effort
*emulated* mobile pass in headless Chromium, clearly marked as a proxy, not a substitute.

## 1. Automated gates (real, run in this environment)

Command: `npm run solo:test && npm run solo:e2e && npm run build`

| Check | Result |
|---|---|
| `npm run solo:test` | exit 0, 249/249 |
| `npm run solo:e2e` (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) | exit 0, 13/13, against the real production build |
| `npm run build` | exit 0 |

Observed: 2026-09-13.

## 2. Emulated mobile pass (Chromium device emulation — NOT a physical device)

Run with Playwright's Chromium (`/opt/pw-browsers/chromium-1194`) using the built-in "iPhone 13"
device profile (touch input, mobile user agent, device pixel ratio, `hasTouch: true`) against
`npx vite preview` serving the real `dist/` build. Every interaction used `tap()`, not `click()`.

| Step (S20.md's list) | Result | Caveat |
|---|---|---|
| START (`TF1-HM-1-P-START`) via tap, full repair, evidence selection, note, submit | Reached debrief screen, no errors | Text entry used Playwright's `fill()`, not a real iOS/Android software keyboard |
| A VLAN scenario (`TF1-BR-2-V-...`) with typed CLI | CLI command accepted and echoed | Typed via `fill()`+`press('Enter')`, not an on-screen keyboard |
| A tier4 pair (`TF1-BR-4-M-...`, two combined faults) | Started correctly; correctly triggered the Keep current/Replace prompt when a prior mission was still active | — |
| Tap targets throughout (buttons, checkboxes, selects) | All reachable and functional via `tap()` | Chromium's touch emulation does not verify real 44px-minimum physical comfort on glass |
| Pause/resume | Not independently exercised in this pass (already covered structurally by `tests/solo/content.test.mjs`'s "paused app time does not increase active elapsed time", which drives `pauseMissionTimer`/`resumeMissionTimer` directly) | The actual OS-level backgrounding trigger (home button / app switch) cannot be simulated headlessly; only the `visibilitychange` DOM event and its handler are covered |
| Rotation (viewport swap, portrait → landscape) | Home/mission screens remained visible and interactive after a `setViewportSize` swap | This changes the CSS viewport only; it does not exercise real device orientation/accelerometer events or a real on-screen re-layout animation |
| Export | Produced a real downloadable file via `tap()` on Export | — |
| Offline (airplane mode) | Covered separately and thoroughly in `tests/solo-browser/offline.spec.mjs` (S19) via `browserContext.setOffline(true)`, including a full close-and-reopen persistence check | Browser-level network cut, not a real device's airplane mode toggle or a real "install to home screen then open with Wi-Fi off" flow |

No console errors were observed during this pass.

## 3. What is genuinely unverified and needs the owner's own device

None of the above substitutes for real hardware. Specifically still unverified:

- **Real software keyboard behavior**: whether the iOS/Android on-screen keyboard obscures the
  completion-note textarea, the CLI input, or the Submit button when it opens (UI_AND_STORAGE.md:
  "Keep the input and Submit visible above the phone keyboard") — this can only be seen with a
  real keyboard, not `fill()`.
- **Real touch target comfort**: whether every 44px-minimum control (MASTER_DESIGN.md §8) is
  actually comfortable to tap with a finger on real glass, not just programmatically clickable.
- **Real "download then switch to airplane mode"**: the actual PWA install-to-home-screen flow,
  then genuinely toggling the device's airplane mode (not a Playwright network flag) and opening
  the installed icon.
- **Real rotation**: actual device orientation change (not a viewport-size swap), including any
  layout jump or dropped input focus during the transition.
- **Any overlay/keyboard trap specific to a real mobile browser** (Safari's viewport-resize-on-
  keyboard-open behavior in particular is known to differ from desktop Chromium's headless model).

## 4. Exact steps for the owner to complete this check

1. Deploy or serve the current build (`npm run build`, then serve `dist/` — see S21 for the actual
   deployment step, which is separately gated on explicit authorization).
2. On an iPhone or Android phone, open that URL in the phone's browser, download/install it (Add
   to Home Screen), then switch the phone to airplane mode.
3. Open the installed app from the home screen icon, fully offline.
4. Run through: START, then a VLAN scenario using the on-screen keyboard to type a CLI command,
   then a tier4 (mixed) pair — for each, confirm every tap target is comfortable, the on-screen
   keyboard never covers the Submit button or the field being typed into, and no control
   disappears or traps you on an overlay.
5. Select evidence, write a completion note with the real keyboard, submit, and confirm the
   debrief renders correctly.
6. Rotate the phone during an active mission and confirm nothing breaks or loses focus.
7. Background the app (home button / switch apps) mid-mission, wait, then return and confirm the
   timer paused correctly and nothing was lost.
8. Export a backup from the phone and confirm the file actually saves/downloads on that device.
9. Record: device model, OS and version, browser, the date, and the actual pass/fail result for
   each step above. Fix only reproduced release blockers — do not speculate about hypothetical
   phone issues without a reproduction.

Until an owner performs the above, mobile hardware acceptance for The Field Solo remains
**explicitly unverified** — this is stated plainly here rather than assumed complete.
