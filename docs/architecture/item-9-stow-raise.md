# Item 9, first increment — stow/raise and Back

Implemented September 6, 2026. This completes the first increment in the suggested build
order, not the entire simulator-shell specification.

## Behavior

- OTDR, power meter, VFL and scope each have a top-bezel Stow button and a downward bezel
  swipe. A 250 ms transition lowers the body. Reduced-motion users get an immediate change.
- The raise tab names the instrument and shows power/boot state or its observed status:
  the meter's last reading, OTDR acquisition/trace status, VFL emission mode, or scope grade.
- While stowed, the ordinary WorldViewport supports orbiting, selection, opening equipment,
  travel, reduced graphics and the accessible list. Its selection and enclosure state are
  shared with the World tab.
- Hardware state is controlled by each instrument and held in viewportStore. Power, cap,
  lead, settings, cursor values, selections and recorded results survive stow/raise and
  viewport changes. The scope keeps the previous image after travel and refuses a new
  inspection until the selected connector is reachable.
- Hidden device controls are inert. Focus transfers between the Stow and Raise buttons.
  Touch targets for the new controls are at least 44 px. Swipe recognition excludes the
  instrument screen and controls, preserving scrolling and trace interaction.
- Back and browser Back follow the same navigation entries. Enlargement adds one level;
  stow/raise replaces the current presentation so repeated gestures do not add Back steps.
  The existing tabs remain until the truck/shelf increment. Back currently returns to the
  preceding viewport, not a shelf that has not been implemented yet.

## Implementation

`field/navigation.ts` contains the pure navigation and swipe rules. InstrumentDock records
UI-only stack entries in React Router history and mirrors the active stack in
viewportStore. Browser history therefore handles back/forward without a competing popstate
listener or changes to the scenario/seed URL. New sessions clear the viewport state.

HeldDevice remains mounted while stowing or enlarging, so boot timers continue. Device
screen subtrees unmount while stowed, releasing their canvases; their controls and results
live in the instrument component, viewportStore or the existing redacted session log.

The original held OTDR/scope could simultaneously have a WebGL backdrop and a 2D canvas.
To satisfy the stricter *one canvas total* check in the handoff, SceneBackdrop now renders
one frame of the real scene into a local data URL, disposes its canvas, and only then enables
the instrument screen. Stowing instead mounts the live WorldViewport. Raising captures a
fresh backdrop at the current location. No external assets or requests are involved.

The raised backdrop is intentionally frozen. It uses the existing current-location cutaway
framing; arbitrary free-look camera orientation still resets when WorldViewport remounts.
This increment does not change that existing camera behavior. Boot/device state is retained
within the running session, not persisted as new IndexedDB fields across full reloads.

## Verified

- Original baseline: TypeScript clean; 48 files / 618 tests passed after npm ci.
- Updated: TypeScript clean; 49 files / 623 tests passed, including redaction and generator
  reference-solution validation. Five new tests cover navigation and swipe rules.
- Production build and `npm run check:pwa` pass; 19 precached entries. Three.js remains in
  a separate lazy chunk. Existing large-chunk build warnings remain.
- Browser at 390×844, authored tier-1 scenario, seed 42:
  - Measured -15.53 dBm, stowed/raised by button and downward swipe, retained reading,
    wavelength, open port and connected lead.
  - Selected and opened a NID while stowed; travelled to the FDH, opened its cabinet and
    orbited the camera without raising the meter. The last meter reading stayed visible.
  - Acquired an OTDR trace with a 500 m launch cable at 1625 nm; stowed during acquisition,
    raised and enlarged; the settings and four-event result survived. Browser Back returned
    to the powered device with its lead still connected.
  - Scope PASS result and Zones off setting survived stow/raise; VFL raise tab reported its
    active 2 Hz mode.
  - Cycled World, Map, OTDR, Power, VFL, Scope, Terminal, Phone, Records and Diagnose ten
    times (100 switches). Canvas count sampled after every switch never exceeded one;
    no browser error logs. Excavate is unavailable in this scenario and was not exercised.

## Follow-ups — do these first

Found in review after this increment landed. Both are regressions introduced here; fix them
before starting §3.1–3.2.

### F1. Un-gate the instrument screen, and restore the live backdrop

**What happened.** The incoming handoff stated the invariant as "count
`document.querySelectorAll('canvas')`, never exceed 1". That wording was wrong — the
invariant is about **WebGL contexts**, and a 2D canvas (the OTDR trace, the scope end-face)
does not count. A held OTDR having two canvas elements, one GL + one 2D, was always fine.

Satisfying the mis-stated rule cost real fidelity and introduced a hard failure mode.
`SceneBackdrop` now renders one frame, `toDataURL('image/png')`s it, swaps in an `<img>`,
and calls `onReady()`. `HeldDevice` holds `backdropReady` and **renders nothing inside the
device screen until that fires.**

**Why it is a problem.**

- *No timeout.* If a frame is never produced, `onReady()` never fires and the instrument is
  permanently blank — no readout, no Measure button, no recovery. Reproduced in review: in a
  hidden browser tab `requestAnimationFrame` is throttled to zero, so the capture never ran
  and the power meter was dead until a forced repaint. A backgrounded tab, an app switch
  mid-measurement, or a driver hiccup does the same on a real device.
- *Main-thread cost.* `toDataURL('image/png')` is a synchronous full-resolution PNG encode,
  paid on every raise. On a phone that is a visible hitch.
- *`preserveDrawingBuffer: true`* disables driver optimisations and costs memory.
- *Frame-1 capture.* `Capture` grabs the first rendered frame, which risks snapshotting a
  scene before it is fully composed.

**What to do.**

1. Correct the invariant check (already corrected in `HANDOFF.md`): count only canvases that
   hold a GL context.
2. Restore `SceneBackdrop` to render `SceneContents` live inside its `<Canvas>`. Delete
   `Capture`, the `snapshot` state, `preserveDrawingBuffer`, and the `onReady` prop.
3. Delete `backdropReady` from `HeldDevice`. **The instrument screen must render
   independently of the backdrop, always.** A missing backdrop degrades to the existing
   gradient placeholder; it must never block the device.
4. Keep the header comment in `SceneBackdrop.tsx` truthful. It currently claims "the same
   scene and the same models the World tab uses — not a picture of one", which the snapshot
   approach made exactly false.

An idle `frameloop="demand"` canvas costs nothing once it has drawn, so the capture was
solving a problem that did not exist.

*If you still want a still image later* — for battery on long instrument sessions — that is
defensible, but only with: no gating of the screen on it, a timeout fallback, `toBlob` off
the main thread, and a capture taken after the scene settles rather than on frame 1.

**Acceptance.** Holding the OTDR shows two canvases (one GL backdrop, one 2D trace) and
exactly one GL context. The instrument screen renders with the backdrop stalled, absent, or
failing. Switching through every view ten times never exceeds one GL context.

### F2. The device collapses at short viewport heights

**What happens.** At a 739×313 viewport the device screen measures **4 px tall** and the
Measure button is not rendered at all — the instrument is unusable. At 375×812 the same
screen is 442 px and fine.

**Why.** The device body is `top: clamp(40px, 20%, 150px)` with `bottom: 6`, and the screen
is `flex: 1; minHeight: 0` — so the screen is the first thing to lose space, and it can
shrink to zero. This increment added a breadcrumb row and a Stow row, costing roughly 40 px
of vertical space and tipping short viewports from cramped to broken.

**What to do.** Give the screen a floor and let the device absorb the overflow — a
`minHeight` on the screen with the device body scrolling, and/or collapse the chrome rows
(brand line, key row) when available height is below a threshold. The screen is the point of
the device; it should be the last thing to give up space, not the first.

**Acceptance.** At both 375×812 and 739×313: the screen is usable, the Measure/Start control
is reachable, and the physical key row is either visible or deliberately collapsed. No
control renders outside the device body.

## Next

After F1 and F2: implement spec sections 3.1–3.2 — persistent HUD, truck and physical tool
shelf. Then replace the tab strip and make Back return a tool to the shelf. Cabinet redesign,
roles, preparation, live communications and the blueprint map remain unimplemented.

Offline artifact generation was checked; an actual disconnected-browser session and a
physical-phone performance pass were not performed.

## Review notes (independent verification)

Re-verified from a clean `npm install`: TypeScript clean, 49 files / 623 tests passing. The
power meter read −15.53 dBm, matching the figure recorded above, so determinism held across
machines. Stow/raise, the raise-tab status line, hardware-state persistence, focus transfer,
Back, and the one-context rule under repeated view switching all behaved as documented.
F1 and F2 above are the only defects found.
