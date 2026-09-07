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

### Compass (spec §6, last bullet)

`src/ui/scene/compass.ts` + `CompassRose.tsx`. Derived from the camera pose, which was
already pure, so it needs no render loop.

---

## Not built

Stated plainly so the next session does not have to discover it.

- **First-person framing (spec §5).** Partly there: the world is at eye height, and held
  instruments have `raised` / `stowed` / `enlarged`. Not there: the **phone as a slab you
  physically raise**, and the **laptop opening on the tailgate** with lid and bezel around
  the console. Both are still tabs.
- **The truck as a place (spec §6).** `src/ui/truck/` draws the tools and the empty slots,
  but it is still a grid, not the inside of a service body. No roll-up door animation, no
  foam cutouts, no fibre reel on its spindle, no interior lights coming up.
- **Tool condition shown physically (spec §6).** `readiness.ts` already produces
  `dirty-scope-tip` and `flat-otdr-battery`, but the shelf does not render a battery pip or
  a smudged tip — the state exists with no physical expression.
- **Ambient truth (spec §5).** `environment.timeOfDay` and weather are carried by the
  scenario and still unused by the renderer.
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

---

## Traps this codebase has already fallen into

- **Filenames differing only by case.** Windows is case-insensitive, TypeScript module
  resolution is not. `HeldDevice`/`heldDevice`, `ToolShelf`/`toolShelf`,
  `Blueprint`/`blueprint` — three separate debugging cycles. There is now a guard,
  `src/caseCollisions.test.ts`. Convention: a component is `Thing.tsx`; its pure companion
  gets its own noun (`deviceState.ts`, `shelfState.ts`, `sheet.ts`), never `thing.ts`.
- **Stale Vite module cache after a rename** produces a blank page with no console error.
  Kill the server, delete `node_modules/.vite`, restart.
- **`ResizeObserver` does not fire in a document that is not being rendered** (a background
  tab, or a keep-alive viewport behind another). Measure synchronously first, then observe.
- **Structural checks can pass while the drawing is wrong.** Element counts said the print
  was fine; reading the generated markup showed the whole block crushed into a 60px band,
  duplicate labels on the same pixel, and splitters printed over their own cabinets. Look
  at the output, not just the shape of it.
