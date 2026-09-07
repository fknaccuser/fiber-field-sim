# item 10 — as built

Companion to `item-10-SPEC-the-experience.md`. That file is the brief; this one is the
honest record of what exists in the tree, what does not, and where the build knowingly
departed from the spec.

Read the spec for *why*. Read this for *what you will actually find*.

---

## Built

### Visual identity (spec §2)

A design system delivered as CSS custom properties rather than a Tailwind config, because
the standing constraint was "don't use tailwind or anything else if it'll require an
overhaul". `src/ui/app/theme.css` carries the tokens, the utilities (`.glass`, `.bezel`,
`.scan`, `.hud-btn`, `.hud-chip`, `.eyebrow`, `.hud-title`, `.pulse-dot`, `.pulse-ring`)
and the keyframes.

The reskin reached ~200 existing files without editing them by keeping the old token names
as aliases onto the new palette (`--text`, `--muted`, `--panel`, `--bezel`, `--led-*`,
`--trace`, `--seg`). New work should use the new names.

Fonts are **bundled, not fetched**: `public/fonts/` holds Orbitron 700, Rajdhani 600/700
and JetBrains Mono, all four in the service-worker precache. The app is offline-first; a
webfont CDN would have broken that.

- `Panel` / `Readout` — `src/ui/components/Panel.tsx`
- `SoftKey`, `Chip` — restyled onto `.hud-btn` / `.hud-chip`

### Loading screen (spec §3)

`src/ui/app/BootScreen.tsx` — `useBootHold(900)` plus a boot log. Deliberately a *hold*,
not a fake progress bar: it covers real lazy-chunk loading and then gets out of the way.

### Dispatch (spec §4)

`src/ui/dispatch/Dispatch.tsx` replaces the old `Home` at `/`. The day itself is a pure,
seeded module — `src/ui/dispatch/day.ts` — so a given day always produces the same board:
`buildDay(daySeed)` yields 2–3 work orders that each resolve to a **real** `scenarioId +
seed`, with ticket numbers, priorities, characters and locations read off the actual start
node. Role is chosen here and travels into the run as `&role=`.

### Roles, readiness, comms (spec §9)

- `src/session/roles.ts` — `ROLE_POLICY` for l1 → manager: hint allowance, truck-roll
  budget and hard cap, comms intensity, whether you must answer.
  `effectiveHintPolicy` takes the **stricter** of role and tier, so a junior grade can
  never soften a hard scenario.
- `src/session/readiness.ts` — the morning that went wrong (VFL on the bench, flat OTDR).
  Wired in `sessionStore.tsx`, and the *narrative* is carried through on
  `ScenarioMeta.readiness`, not just its effect — so the shelf says "The VFL is not on the
  truck. It is still on the bench where you tested it." rather than only showing a gap.
  Seeded, and bounded by a property that is unit-tested: **a readiness failure never
  removes a tool the reference solution needs**, so it can cost you time but can never
  make a work order unsolvable. Junior grades get coaching; from L3 up the same morning
  happens silently.
- `src/session/comms.ts` — the day interrupting you. Seeded from the run, so a replay
  reproduces the same interruptions at the same moments. The rule that makes it teach:
  **a reply is only offered when the action log already contains the observation it
  claims**, so you cannot tell the CTO you confirmed LOS before you have asked the OLT.
  Answering costs simulated clock time. Surfaced in `src/ui/field/Phone.tsx`.

`canClaim`/`availableReplies` take a structurally-minimal readonly array, not
`ActionEvent`, specifically so the **redacted** UI log can ask the question without ever
being handed the full one.

### Teaching layer (spec §7)

`src/session/teaching.ts` (`buildTeachingSteps`, `dispatchAdvice`) with
`src/ui/field/TeachingRail.tsx`, and `referenceSolution.rationales` carrying the *why* for
each step into the debrief.

### The cabinet (spec §8)

`src/ui/scene/models/plant.tsx` — `FdhCabinet` rebuilt from the photographs: cream body on
a plinth, hinged doors with gasket and latch, and an interior built **only when open**
(stacked SC/APC adapter modules, instanced port field, D-rings, splitter cassettes, a 1RU
chassis with per-port LEDs, jumper fan, slack coil). Cabinet geometry is data —
`profiles/equipment/*.yaml` carries an optional `layout` block.

### The print (spec §5 partially, item 9's map)

`src/ui/map/` — the Map tab became **Print**: a plan view at three drawing scales
(SITE / BLOCK / PON BRANCH) with a title block, north arrow, scale bar and dimensioned
cable runs.

Two decisions worth keeping:

- It is drawn from `layoutScene` — the *same* coordinates the 3D world is built from — so
  what you measure on the sheet is where you walk. There is no second topology.
- It is **SVG, not a second WebGL view**. A drawing is line work and lettering; this way
  it costs no GL context, which keeps the one-context invariant intact and let the tab
  become `keep-alive`, so it holds its sheet and selection while you go and take a reading.

Geometry is pure and tested in `src/ui/map/sheet.ts`. The sheet turns sideways when the
drawing is wide and the page is tall, the way you would turn the paper.

### The truck, and the phone in your hand (spec §5, §6)

`src/ui/field/PhoneSlab.tsx` — the phone is a slab that rises from the bottom edge, with a
carrier strip, the shift clock and a battery that drains across the day. Same gesture
language as the instruments. Not built on `HeldDevice`: a phone has no dust cap, launch
lead or boot sequence.

`src/ui/truck/ToolShelf.tsx` — the service body is a place: the roll-up door rolls, the
interior lights come up behind it, the shelves have lit top lips and dark undersides, the
instruments sit in foam cutouts (an empty one is outlined in red), and the launch reel
stands on its spindle.

### Ambient truth (spec §5)

`src/ui/scene/ambient.ts` — `timeOfDay` and `weather` had been carried by every scenario
since the generator was written and read by nothing but a shift label. They now drive sky
colour, fog distance, sun position, intensity and colour. `t5-everyones-down` is a 19:45
callout and now looks like one; `t4` at 14:10 overcast is flat and grey; a marine layer
closes the fog to 110 m so you cannot see down the street. The phone's clock reads from the
same value, so the screen in your hand agrees with the sky.

Pure and tested, including that the sun never drops below the horizon and an unknown
weather string falls back to clear rather than producing a black scene.

### Compass (spec §6, last bullet)

`src/ui/scene/compass.ts` + `CompassRose.tsx`. Derived from the camera pose, which was
already pure, so it needs no render loop.

---

## Not built

Stated plainly so the next session does not have to discover it.

- **The laptop on the tailgate (spec §5).** Still a tab. The phone is now a held slab
  (`src/ui/field/PhoneSlab.tsx`) and instruments have `raised`/`stowed`/`enlarged`, but the
  console does not open on a lid with a sliver of truck bed around it.
- **Tool condition shown physically (spec §6).** No battery pip, no smudged tip. Related:
  `dirty-scope-tip` was **removed** from the readiness table rather than displayed. It took
  nothing off the truck, no instrument read differently because of it, and there was no
  action to clean a tip with — so it announced a consequence that never arrived. A pip
  saying `TIP DIRTY` above an instrument that reads normally is a lie to the trainee. Put
  it back when `scopeInspect` can be told about it and the shelf can offer a cleaning stick.
- **Prep phase.** The night-before / morning pre-trip screens, and the drive back to the
  yard, are not built. Readiness is decided by seed rather than by anything you did.

---

## Deviations from the spec, and why

**Tailwind config → CSS custom properties.** The spec asked for a Tailwind config plus
utilities. The standing instruction was to avoid anything requiring an overhaul. Tokens in
`theme.css` gave the same design vocabulary with a token-alias layer that reskinned the
existing files untouched.

**3D topology map → 2D print.** The spec (and the original request) asked for "blueprint
topography". The existing map was a WebGL tidy-tree. Rebuilding it in SVG on the real
scene coordinates was both closer to what a technician carries and cheaper in GL contexts.

---

## Invariants this work had to respect

These are enforced, not aspirational. Breaking one should fail a test.

1. **One WebGL context.** GL contexts, not `<canvas>` elements. The print holds none.
2. **Redaction.** `sessionStore.tsx` is the only holder of unredacted `SessionState`.
   `redactForUi` strips `appliedFaults`, `groundTruth`, `OtdrTraceResult.hidden`,
   `referenceSolution` and `hints`. `redaction.test.ts` asserts this by shape after every
   action in a run — and it was proven to fail when the leak is reintroduced.
   *(This one is not theoretical: `ui.meta.referenceSolution` did leak the answer key,
   including every hint text, and was reachable by walking the React tree in the running
   app.)*
3. **Determinism.** `scenarioId + seed (+ role)` reproduces a run, comms and readiness
   included. All randomness through `createRng(deriveSeed(...))`.
4. **The map never leaks.** `buildMapOverlay` marks only what the trainee has *observed*
   (the action log) or *claimed* (draft/submitted diagnosis). It never sees the answer key.

### One accepted trade-off

A readiness failure is guaranteed never to remove a tool the reference solution needs.
That guarantee is what keeps every work order solvable — but it means a missing VFL also
weakly tells you the VFL is not on the reference path. The tell is pre-existing (the empty
slot on the shelf already said it) and the alternative — sometimes handing out an
unsolvable job — is worse. Worth knowing it is there.

---

## Traps this codebase has already fallen into

- **Filenames differing only by case.** Windows is case-insensitive, TypeScript module
  resolution is not. `HeldDevice`/`heldDevice`, `ToolShelf`/`toolShelf`,
  `Blueprint`/`blueprint` — three separate debugging cycles. There is now a guard,
  `src/caseCollisions.test.ts`. Convention: a component is `Thing.tsx`; its pure companion
  gets its own noun (`deviceState.ts`, `shelfState.ts`, `sheet.ts`), never `thing.ts`.
- **Stale Vite module cache after a rename** produces a blank page with no console error.
  Kill the server, delete `node_modules/.vite`, restart.
- **Nothing that gates first paint may depend on the frame loop.** `ResizeObserver`
  callbacks are only delivered during a rendering update, and `requestAnimationFrame` is
  throttled to zero — in a background tab, or a keep-alive viewport behind another. Both
  bit here: a blank print, and a roll-up door stuck shut over the shelf. Measure
  synchronously then observe; set reveal state directly in an effect, not inside rAF.
- **Structural checks can pass while the drawing is wrong.** Element counts said the print
  was fine; reading the generated markup showed the whole block crushed into a 60px band,
  duplicate labels on the same pixel, and splitters printed over their own cabinets. Look
  at the output, not just the shape of it.
