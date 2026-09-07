# BUILD SPEC — "Network Field Technician Simulator"

**This document is a work order for a fresh session.** It assumes you have the repository
and have read nothing else. Read §1 before touching anything: there is a large, working,
well-tested engine underneath, and most of the value in this task is *not* breaking it.

The goal of this item is to stop the app feeling like a web tool with tabs, and make it
feel like **Car Mechanic Simulator** or **Microsoft Flight Simulator** for an outside-plant
fiber technician: you are a person, with a truck, with tools in the back of it, standing in
front of real equipment, having a day that pushes back at you.

---

## 0. How to use this document

- §1 is orientation. §2 is the design north star. §3–§8 are the six work items.
- Each work item has **Why**, **What to build**, **Data model**, **Acceptance**.
- §9 lists invariants. Breaking any of them is a failed delivery regardless of how good
  the new work looks.
- §10 is the suggested order. §11 is the definition of done.
- `docs/reference/*.jpg` are photographs of the real cabinet this must emulate. They are the
  single most important reference in this document — but they are **deliberately not
  committed** (they show a real operator's plant with readable labels). Ask the project owner
  for them before starting §4. §4's written description is detailed enough to work from if
  you cannot get them, but the photographs are much better.

Build incrementally and keep the suite green between items. Do not attempt all six at once.

---

## 1. What already exists — read this first

### 1.1 The shape of the codebase

```
src/
  world/          Ground-truth world model + fault taxonomy (30 fault kinds). Pure.
  instruments/    OTDR physics, power meter, VFL, inspection scope, CLI. All pure functions
                  of (world, settings). No instrument knows a "fault" was placed.
  session/        The runner: a pure reducer (SessionState, Intent) -> SessionState + result.
                  Enforces presence/inventory rules. Records an action log.
  scoring/        Five axes + a decision replay. Pure.
  scenarios/      Zod schema, YAML loader, validator, 3 authored scenarios,
                  and generate/ — the procedural scenario generator (unlimited scenarios).
  profiles/       Swappable YAML: network (XGS-PON), OLT vendor, switch vendor, equipment,
                  OTDR instrument, region (DigAlert). No hardcoded vendor behaviour.
  ui/
    store/        sessionStore.tsx — the ONLY module holding an unredacted SessionState.
    viewport/     ViewportHost — mount/unmount policy per viewport; viewportStore — UI state
                  that survives unmounting.
    scene/        sceneLayout.ts (topology -> street), camera.ts, sceneState.ts (what the
                  visual layer may show), PlantScene.tsx, models/*.tsx
    instrument/   HeldDevice.tsx (the in-hand device chrome), deviceState.ts, SceneBackdrop
    otdr/ meters/ terminal/ field/ screens/ map/ scope/
docs/architecture/  item-2 .. item-8 — read item-7 and item-8 at minimum.
docs/reference/     Photographs of the real cabinet. Look at these.
```

Current state: `tsc -b` clean, **48 test files / 618 tests**, production build splits
three.js out of the main bundle, PWA offline works.

### 1.2 The three rules that constrain everything

**Rule 1 — The UI never sees the answer key.** `sessionStore.tsx` holds the real
`SessionState`; every component gets a redacted `UiSessionState` with `appliedFaults`,
`groundTruth` and `OtdrTraceResult.hidden` stripped. `src/session/redaction.test.ts` greps
every file under `src/ui/**` for those identifiers and **fails the build** if one appears.
Anything you add under `src/ui/` inherits this. If you need to know something in the UI,
derive it from the action log (what the trainee observed) or the trainee's own claims.

**Rule 2 — Determinism.** `scenarioId + seed` fully determines a run. Resume, replay and
share codes depend on it. All randomness goes through `createRng(deriveSeed(seed, ...labels))`
from `src/world/random.ts`. Never call `Math.random()` in engine or scenario code. If you
add random events (§8), they must be seeded and replayable.

**Rule 3 — One WebGL context.** `ViewportHost` gives each viewport a mount policy:
`'unmount'` (subtree removed when inactive — mandatory for anything holding a canvas) or
`'keep-alive'` (kept in the DOM, for cheap panels with live inputs). Because only one
canvas-bearing viewport is ever mounted, there is exactly one WebGL context alive. Verified
by switching tabs rapidly and counting `document.querySelectorAll('canvas')`. Keep it that
way: if you add a new 3D surface, it must be `'unmount'`.

### 1.3 Things that will bite you

- **Windows case-collision.** `HeldDevice.tsx` and `heldDevice.ts` in one directory breaks
  `tsc` on Windows. The state module is deliberately named `deviceState.ts`.
- **`frameloop="demand"`.** The scene only draws when something calls `invalidate()`. Any
  animation you add must request frames while it moves (see `Hinge`/`Slide` in
  `scene/models/common.tsx`) and stop when it settles.
- **drei `<Html>` labels.** Do not use `distanceFactor` — labels then balloon when the
  camera gets close. They are annotations; keep them constant screen size.
- **Ground planes occlude anything below them.** The parkway plane hid the handhole until
  `turfPatches()` cut a bite out of it. Same trap applies to any new below-grade object.
- **Approach direction.** `camera.ts` frames equipment from −z. Cabinets, pedestals and the
  POP are rotated 180° so their doors/ports face that way. New equipment must do the same
  or you will be looking at its back panel.
- **The scenario validator is not a formality.** It replays the reference solution through
  the real runner and fails unless it scores 100 on accuracy/evidence/safety. Anything that
  changes action costs, inventory rules or presence rules can break every scenario at once.

---

## 2. Design north star

Three references, and what to take from each:

- **Car Mechanic Simulator** — the *tool ritual*. You do not "select the diagnostic
  function"; you walk to the toolbox, open the drawer, pick up the specific tool, and it is
  in your hands. The tool has weight and presence. Putting it away is a deliberate act.
- **Microsoft Flight Simulator** — the *cockpit and the checklist*. Instruments are physical
  objects in a physical space. Preparation before you move matters. You are interrupted by
  radio traffic you did not ask for and must handle while still flying the aircraft.
- **Real field work** — the *day*. A dispatch, a drive, a cabinet, a measurement, a phone
  that will not stop, a manager who wants a status, and a clock.

The player is a **person having a shift**, not a user operating a dashboard. Every screen
should answer "where am I standing and what is in my hands?"

**Anti-goal:** do not add photorealism at the cost of phone performance. Stylised realism
with accurate silhouettes, correct relative scale, good materials and good lighting beats
high polygon counts. Target: usable on an average phone at 390×844.

---

## 3. Work item 1 — Navigation shell: the truck, the tool shelf, stow/raise, back

### Why

Today the bottom of the screen is a strip of ten text tabs
(`World | Map | OTDR | Power | VFL | Scope | Terminal | Phone | Records | Diagnose`). That is
the single biggest thing making this read as a web app. It also has no way to *put a tool
down* — once you are in the OTDR you cannot see the world behind it without leaving the
instrument entirely, and there is no consistent back.

### What to build

**Delete the tab strip.** Replace the whole navigation model with a small persistent HUD
over the 3D world plus a navigation stack.

#### 3.1 The HUD

Four persistent affordances, over the 3D scene, sized for thumbs (≥44 px targets):

| Position | Affordance | Opens |
|---|---|---|
| Top-left | **Compass rose** | World view / re-orient. Tapping recentres on you; long-press opens the Map (§5). |
| Bottom-right | **Truck** (small vehicle icon or a 3D truck in the scene you can walk to) | The tool shelf (§3.2) |
| Bottom-left | **Phone** (in your pocket) | Comms (§8). Badges when something is waiting. |
| Top-left, under compass | **Back** (only when the stack is deeper than the world) | Pops one level |

The Map is reachable from the compass. The laptop lives in the truck (§3.2). Diagnose moves
onto the laptop as the work-order form — it is paperwork, not a tool.

#### 3.2 The tool shelf

Tapping the truck **opens the utility body** — the shelving on the truck bed — as a 3D view.
Do not make this a menu with icons; make it a shelf with objects on it, lit and shadowed,
that you tap to pick up. Model the truck body as a real service body: roll-up or hinged
compartment door that animates open, three shelves, tools laid out with a little disorder.

Objects on the shelf and what each becomes:

| Object on the shelf | Replaces today's tab | Notes |
|---|---|---|
| Rugged OTDR in a soft case | OTDR | Already modelled as a held device |
| Handheld power meter | Power | Already a held device |
| VFL pen | VFL | Already a held device |
| Inspection scope w/ captive probe | Scope | Already a held device |
| **Laptop** | Terminal **+** Records **+** Diagnose | Opens as a laptop you set on the tailgate; tabs *inside* the laptop UI |
| Fusion splicer, cleaver, cleaning kit, launch reel, spare jumpers | — | Present as props; wire up later if useful. They make the shelf read as real. |

Rules:

- A tool **missing from `world.truckInventory` is visibly absent from the shelf**, with an
  empty outline where it should be. This is how §7's "you forgot the VFL" reads without a
  dialog box.
- A tool with a **readiness problem** (dead OTDR battery, dirty scope tip) shows it
  physically — a red battery pip on the OTDR, a smudged tip on the scope.
- Picking up a tool pushes it on the nav stack and puts it in your hands (existing
  `HeldDevice`).

#### 3.3 Stow / raise — the thing that is missing today

While holding an instrument, the player must be able to **lower it out of the way**, see and
interact with the full 3D scene, and **raise it back** with its state intact.

- Add a **stow** control to `HeldDevice`: a grab handle / chevron on the device's top bezel,
  plus a downward swipe gesture on the device body.
- Stowing animates the device down out of frame (~250 ms ease), leaving a small **raise tab**
  at the bottom edge showing the device's name and a live status pip (e.g. the power meter's
  current reading) so you know what you are holding.
- **While stowed the scene is fully interactive**: orbit, select objects, open enclosures,
  move. The device is still "in your hands" — its power state, dust cap, lead connection,
  settings and last reading all persist. This is a view change, not a put-away.
- **Putting a tool away** is separate: back out to the shelf, which returns the tool to it.

This is the single most requested fix. Do it first and do it well.

#### 3.4 The navigation stack

```
World  (3D, free look, HUD visible)
├─ Truck ─ Tool shelf  (3D, tools on shelves)
│   └─ Tool in hand    (HeldDevice + scene behind)
│       ├─ stowed      (device lowered, scene interactive, raise tab visible)
│       └─ enlarged    (instrument screen full-viewport — already exists on the OTDR)
├─ Compass ─ Map       (blueprint, §5)
└─ Phone               (overlay, reachable from anywhere, §8)
```

- Back pops exactly one level. Hardware/browser back should map to it.
- The stack lives in `viewportStore` so it survives viewport unmount/remount.

### Data model

Replace `TabId` in `src/ui/field/InstrumentDock.tsx` with a nav-stack model. Suggested:

```ts
type Place =
  | { kind: 'world' }
  | { kind: 'shelf' }
  | { kind: 'tool'; tool: ToolId; stowed: boolean; enlarged: boolean }
  | { kind: 'map' };

type ToolId = 'otdr' | 'power-meter' | 'vfl' | 'scope' | 'laptop';
// The phone is an overlay flag, not a Place — it can open over any of them.
```

Keep `ViewportHost`'s mount policies: `world`, `shelf`, `tool` and `map` all carry canvases
or heavy 2D and must be `'unmount'`. The laptop's inner tabs (terminal / records / diagnose)
are cheap DOM and can be `'keep-alive'` *inside* the laptop.

### Acceptance

- No text tab strip anywhere in the field session.
- From the world you can reach every instrument in ≤2 taps (truck → tool).
- Holding any instrument, you can stow it, orbit the scene, select and open an enclosure,
  and raise the instrument with power/cap/lead/settings/reading unchanged.
- Back works from every depth and never strands you.
- A tool missing from `truckInventory` is visibly absent from the shelf.
- Still exactly one WebGL context at any time (switch through every place ten times,
  count canvases).

---

## 4. Work item 2 — The cabinet, modelled from the photographs

### Why

`docs/reference/cabinet-full-with-otdr.jpg` and `cabinet-interior-closeup.jpg` are what the
player's daily workplace actually looks like. The current `FdhCabinet` model is a credible
generic cabinet; it is not *this*. The trainee must be able to recognise the real thing from
having used the simulator.

**Look at both photographs before writing any geometry.**

### What the photographs show

**Exterior**
- Pad-mounted outdoor cabinet, roughly **1.8 m tall × 0.9 m wide × 0.55 m deep**, standing
  on a concrete pad, mulch/soil landscaping around it, palms and broadleaf trees behind.
- Body is **cream / bone / light beige** powder-coated aluminium, lightly weathered and
  chalked. Not white, not grey — warm off-white.
- A **dark brown / near-black top cap** with a drip edge overhanging the body by ~30 mm, and
  a flat top wide enough for a technician to set an OTDR on it. This ledge is important —
  it is where the tester lives while you work.
- **Double doors**, full height. In the photo the near door is swung fully open and the far
  one stands open at ~120°; a black gasket channel runs the inside of each door edge.
- Latch hardware bottom-left of the door frame, hinge barrels on the outer edges.
- The open doors reveal the frame's black weather seal all the way round.

**Interior, top third — fiber distribution**
- Left: **four to five stacked adapter modules**, each a horizontal row of **green SC/APC
  adapters**, populated with **yellow simplex patch cords**. Essentially every cord carries a
  **white flag label** — this density of labelling is characteristic and must be modelled.
- Centre-right: a **large bulkhead field of green SC/APC adapters**, roughly **6 rows × 12
  columns (~72 positions)**, largely unpopulated so you see the bare green adapter bodies in
  a grid. This is the distribution port field.
- Black plastic **radius limiters / fanning fingers** behind and above the panels.
- Far right: a vertical column of about **ten to twelve black cable-management D-rings**.
- Two prominent white flag labels on cords exiting to the right read **"TO DH#8 POP"** and
  **"TO A 1A6B0C PCP"**. Use label text of this shape — destination-coded, hand-printed.

**Interior, middle — the active shelf**
- A 1RU panel of small **orange/beige adapters** (patch/splice panel).
- A management panel on the left with **RJ45 jacks** and small plug-in modules.
- **Two to three 1RU chassis in a distinctive purple/violet**, with green status LEDs and
  small front displays. One is labelled "BUSH PO…". This is the OLT/aggregation gear —
  purple is the signature colour and should be reproduced.
- **Teal / aqua duplex LC multimode patch cords** looping across the middle.
- A single white simplex cord.

**Interior, lower**
- More purple chassis with a **dense fan of yellow LC patch cords**, every one flag-labelled.
- Left: black panels with white printed port labels — **"PORT 0/1", "0/3", "0/5"** etc.
- Teal cords down the left side.
- A **large coil of yellow slack** resting at the bottom left.
- Bottom: an **empty light-grey equipment shelf / tray** — free space for a future card.

**The tester on top**
- **EXFO MaxTester**: blue-grey rugged body, darker rubber bumpers, ~7″ touchscreen, two
  physical buttons below the screen, soft carry case with shoulder strap alongside.
- Screen shows an OTDR trace — declining backscatter line, reflective events, noise tail —
  above a results table.
- On the ledge beside it: a **green SC/APC connector with a red dust cap**, a black launch
  reel/adapter, and a hand tool.
- A **white launch cable** runs from the tester down over the cabinet lip into the interior.

### What to build

Rewrite `FdhCabinet` in `src/ui/scene/models/plant.tsx` (or add `StreetCabinet`) to match.
Keep it low-poly with good materials — no imported CAD, no manufacturer logos. Original
"FiberOps" branding only; the purple chassis colour and general form are fine, vendor marks
are not.

Required, driven by real topology:

1. **Adapter port field** where each adapter position maps to a real distribution span
   leaving the splitter. Occupied positions get a cord; free positions show a bare green
   adapter. Port count comes from the equipment profile's catalog entry
   (`profiles/equipment/*.yaml`, `portCount`), not a magic number.
2. **Splitter modules** as physical cassettes on a shelf, one per `splitter` node, labelled
   with the real `attributes.splitRatio`.
3. **Patch cords** with **flag labels carrying real ids** — the span id or the destination
   node's label, abbreviated. Cord colour follows the strand's real `tubeColor`/`fiberColor`
   where the span has strands, else yellow SM / aqua MM by role.
4. **The active shelf**: purple 1RU chassis for each `network-device`/`olt` present at this
   node, with per-PON-port LEDs driven the same way the existing OLT rack does it (LOS only
   after the trainee has observed it — see Rule 1).
5. **The flat top ledge** as a real surface you can set the OTDR on — this is where the
   held-device view should stage the tester when you are working at a cabinet.
6. **Cable management**: D-ring column, radius limiters, a slack coil at the bottom, conduit
   entering the base from below the pad.
7. **Weathering**: subtle chalking on the body, dirt at the base, a slightly sun-faded top.

Doors must open toward the technician's approach (−z; see §1.3). Opening should be a
two-stage animation: latch releases, then both doors swing.

### Data model

Add to the equipment profile catalog so cabinet layout is data, not code:

```yaml
catalog:
  - id: fdh-cabinet-450-series
    kind: fdh-cabinet
    portCount: 288
    layout:                       # NEW
      bodyColor: "#ded3c0"
      capColor: "#2b2622"
      heightM: 1.8
      widthM: 0.9
      depthM: 0.55
      adapterGrid: { rows: 6, cols: 12 }
      splitterShelfCount: 2
      activeShelfCount: 3
      dRingCount: 11
```

Different `equipmentRef` values then produce visibly different cabinets with no code change.

### Acceptance

- Side-by-side with `docs/reference/cabinet-full-with-otdr.jpg`, a person who works on these
  recognises it: proportions, colour, door behaviour, the green adapter grid, the yellow
  cord bundles with white flags, the purple chassis, the D-rings, the empty bottom shelf.
- Every drawn adapter position and cord maps to a real topology entity; selecting one
  selects that entity.
- Port field size comes from the equipment profile.
- The OTDR can be staged on the cabinet's top ledge.
- No manufacturer logos or copied industrial design.

---

## 5. Work item 3 — The blueprint map

### Why

"Map" today is a 3D node-and-line graph. It should be **a print** — the thing a technician
actually carries: an as-built drawing of the plant over the street geometry.

### What to build

A 2D, zoomable, pannable blueprint. Not 3D — this is deliberately a different visual
language from the world view, and it is cheap on a phone.

**Three zoom levels**, transitioning smoothly:

1. **Site** (closest) — the street you are on. Lot lines, house footprints with addresses,
   sidewalk, parkway, the trench line, handholes with their designations, pedestals with NAP
   ids and port counts, the cabinet with its id. Your position as a marker with heading.
2. **Neighbourhood** — several streets, the FDH/cabinet and everything it feeds, distribution
   routes with cable ids and fiber counts, splice closures.
3. **Branch** (furthest) — the whole PON branch: POP/OLT, feeder route, every downstream
   cabinet and its NAPs as a schematic tree, with the OLT PON port each hangs off.

**Visual treatment:** blueprint. A deep blue-grey ground, white/cyan line work, a title
block in a corner (scenario/plant name, date, "AS-BUILT", sheet number), a north arrow and a
scale bar, hatching for structures, dashed for proposed/spare. Line weights matter more than
colour.

**Bound to real data**, same rule as the 3D world: geometry from `sceneLayout`, ids and
labels from the real topology, overlay marks from `mapOverlay` (observed/claimed only). The
map is also where **records** annotations surface — a span with a plant record gets a small
document glyph you can tap to read it.

**Interaction:** pinch/scroll zoom, drag pan, tap to select (selection is shared with the
world view — the same `world.selected` key), a "you are here" recentre, and a "roll truck
here" affordance on a selected site.

### Acceptance

- Reads as a drawing, not a diagram.
- Three zoom levels, all bound to real topology, transitions are smooth.
- Selection is shared with the 3D world both ways.
- Zooming out to Branch shows the full PON tree and which OLT port feeds what.
- Renders at 60 fps on a phone; no WebGL required (Canvas 2D or SVG).

---

## 6. Work item 4 — Roles and difficulty tiers

### Why

Difficulty is currently a property of the *scenario* (tier 1–6). It should also be a property
of **who you are today**. The player picks a role at dispatch and the whole day changes shape.

### What to build

A **role selection at the start of the day**, before the first ticket. Five roles:

| Role | Guidance | Hints | Truck rolls | Time | Actions | Comms load |
|---|---|---|---|---|---|---|
| **Level 1 Technician** | Dispatch walks you through step by step, on request | Unlimited, free | Generous | Generous | Unlimited | None |
| **Level 2 Technician** | Dispatch answers direct questions | 3, small cost | Generous | Comfortable | Unlimited | Occasional inbound |
| **Level 3 Technician** | Dispatch confirms facts only | 2, real cost | Limited | Tight | Soft cap | Must answer some |
| **Senior Technician** | None. You *are* who others ask | 0 | Tight | Tight | Capped | Heavy; you answer other techs |
| **Manager / NOC Lead** | None | 0 | Very tight | Very tight | Capped | Heaviest; execs, escalations, coordinating others |

What each lever actually does:

- **Guidance.** At L1 a dispatch panel offers "what should I do next?" and gives a concrete
  next action tied to the current state (not the answer — the *method*: "you have not
  established whether light reaches the ONT; a power meter reading at the demarc would tell
  you"). At L2 it answers narrower questions. At L3 it only confirms things you already
  observed. At Senior/Manager it is gone.
- **Hints.** Reuse `HINT_POLICY` in `src/session/costs.ts` — it already tiers max and cost.
  Extend it to key off role as well as scenario tier (take the stricter of the two).
- **Truck rolls.** New budget. Exceeding it is allowed but penalised on efficiency, and at
  Senior/Manager a hard cap refuses the roll ("you cannot justify another roll today").
- **Time.** Scale `timeBudgetMinutes` by role.
- **Actions.** A soft cap that starts costing efficiency, mirroring "you don't get unlimited
  shots at this".
- **Information richness.** At L1 the customer report is detailed and the relevant plant
  records are pre-pulled. At Manager the report is one vague line and you fetch everything.

**Progression.** Roles unlock by demonstrated competence, using the existing per-domain
competency map in `src/ui/store/progress.ts`. Do not gate hard — let a player choose a
harder role early, but show the unlock state.

### Data model

```ts
export type Role = 'l1' | 'l2' | 'l3' | 'senior' | 'manager';

export interface RolePolicy {
  id: Role;
  displayName: string;
  hints: { max: number; cost: number };
  truckRollBudget: number;          // Infinity for L1
  truckRollHardCap: boolean;        // refuse beyond budget
  timeBudgetMultiplier: number;
  actionSoftCap: number;
  guidance: 'guided' | 'answers' | 'confirms' | 'none';
  informationRichness: 'full' | 'normal' | 'sparse';
  commsIntensity: 0 | 1 | 2 | 3;    // feeds §8
  mustAnswerComms: boolean;
}
```

Put this in `src/session/roles.ts` as a pure table, mirroring how `HINT_POLICY` works. Carry
the chosen role on `ScenarioMeta` so it reaches the runner, the scorer and the replay, and
persist it on `StoredSession` so history can show "solved this as a Level 3".

**Important:** the scenario generator (`src/scenarios/generate/`) already takes a tier. Role
and tier are orthogonal — role shapes *your day*, tier shapes *the fault*. The dispatch
screen should let you pick both, or pick a role and let the tier follow.

### Acceptance

- Role is chosen before the day starts and visibly changes guidance, hints, budgets and
  comms load.
- The reference solution for every generated scenario still validates at every role (the
  validator should run at the most permissive role; role limits must never make a scenario
  unsolvable).
- Role is persisted and shown in history.
- Scoring accounts for role — a Manager solving a tier-4 fault under interruption should not
  score the same as an L1 doing it guided.

---

## 7. Work item 5 — Preparation, and the "newbie" mechanics

### Why

Half of being good at this job is what you did before you left the yard. The simulator
should teach that by letting it go wrong.

### What to build

#### 7.1 The prep phase

Two optional moments, both skippable:

- **The night before** — a short screen: charge the OTDR, restock consumables (cleaning
  sticks, connectors, splice sleeves), check tomorrow's ticket list, load the truck.
- **The morning** — a quick pre-trip: walk the truck, confirm what is on the shelf.

Skipping is allowed and is the *point* — it is how the failures below occur.

#### 7.2 Readiness state

Add a `TruckState` alongside `truckInventory`:

```ts
interface TruckState {
  otdrBatteryPct: number;        // drains per shot; below ~10% the OTDR dies mid-acquisition
  scopeTipClean: boolean;        // dirty tip -> false FAIL results on inspection
  cleaningSupplies: number;      // consumed by cleaning a connector
  launchReelMeters: number;      // 0 = no launch cable, existing rule already refuses
  spareJumpers: number;
  missingTools: ToolId[];        // deliberately left behind
}
```

Each failure must surface **physically on the shelf** (§3.2), not as a modal.

#### 7.3 The newbie mechanics

For **L1 and L2 only**, with a seeded probability per day, one readiness fault is injected:

- Left the VFL on the bench → the VFL is absent from the shelf, empty outline.
- Did not charge the OTDR → battery pip red; dies partway through the first long average.
- Scope tip dirty → inspections read FAIL until you clean it.
- No launch cable on the reel → OTDR refuses (rule already exists).

When one bites, the game **coaches**: a short, non-condescending line from dispatch or a
senior tech — *"Happens to everyone. Next time run the pre-trip before you leave the yard:
battery, reel, cleaning kit."* Then it offers the recovery (drive back to the yard at a real
time cost, or borrow from another tech if one is nearby).

At **L3 and above** the same failures occur with **no reminder and no coaching**. You notice
or you lose the day.

### Acceptance

- Skipping prep can produce a readiness failure, seeded and replayable.
- Every readiness failure is visible on the tool shelf before you drive.
- L1/L2 get a coaching line and a recovery path; L3+ get neither.
- The OTDR genuinely dies mid-acquisition when the battery is flat, and the partial result
  is discarded (not a silent success).

---

## 8. Work item 6 — Live events: customers, comms, interruptions

### Why

A real outage is not a quiet lab. Information and noise arrive while you work, and at senior
levels *handling people is the job*.

### What to build

An **event scheduler** that emits timed events during a session. Seeded from
`deriveSeed(seed, 'events', ...)` so a replay reproduces the same day exactly.

#### 8.1 Event kinds

**Inbound customer calls** — additional premises calling in.
- *Useful*: "my neighbour at 740 is out too" → confirms a shared NAP/splitter, narrows scope.
- *Useless / misleading*: "my WiFi is slow at night" → an unrelated complaint (the red-herring
  machinery already exists; reuse `isRedHerring`).
- Each takes real clock time to take.

**Texts and calls from colleagues**
- *Senior tech*: "what are you seeing?" · "did you check the splice sheet at CL-7?" ·
  "I'm sending Dave, he'll be there in 20."
- *Manager*: "status?" · "customer escalated, I need an ETA."
- *Another tech asking for help* (Senior/Manager roles): a described symptom you must advise
  on — a mini-diagnosis inside your diagnosis, costing time and scored on whether your advice
  matched the evidence they gave you.
- *CTO / exec* (Manager role): "what's the holdup on this outage?" — wants a status, not a
  theory. Answering badly costs you.
- *Personal*: partner texting about dinner. No mechanical penalty; it is there because the
  day is not sterile, and because deciding what to ignore is a real skill. Ignoring it is
  fine; ignoring the CTO is not.

**Field events**
- "Locate crew just marked the street" · "traffic control is set up" · "it started raining".
  Flavour with occasional mechanical bite (rain slows aerial work).

#### 8.2 How they arrive

- Everything lands on the **phone** (§3.1) with a badge and a distinct notification per kind.
- **L1/L2**: informational. You can read them whenever; nothing is forced.
- **L3+ (`mustAnswerComms`)**: some events are **blocking**. A ringing phone must be
  answered or declined; declining has a cost. Answering pauses what you were doing and costs
  clock time. This is the interruption pressure the player asked for and it is the whole
  point of the senior roles.

#### 8.3 Answering

Answers are **multiple choice built from your own action log** — never free text. E.g. a
status request offers:
- "Confirmed loss of signal on the PON, I'm at the cabinet now" (only offered if you actually
  observed LOS)
- "Still isolating, I've ruled out the drop" (only if you tested the drop)
- "Nothing yet" (always available, costs credibility)

This keeps the comms system honest: **you cannot report something you have not observed**,
which is the same rule as everything else in this codebase.

#### 8.4 Scoring

Add an optional sixth axis, active only for roles with `commsIntensity > 0`:

```ts
communication: {
  responsiveness: number;   // blocking comms answered in reasonable time
  accuracy: number;         // did your status match your evidence
  judgement: number;        // did you triage — CTO before partner, help a tech when free
}
```

Fold into the total only for L3+. Do not let it dominate — diagnosis is still the job.

### Data model

```ts
interface DayEvent {
  id: string;
  atSimSeconds: number;              // scheduled; seeded
  kind: 'customer-call' | 'text' | 'phone-call' | 'email' | 'field-note';
  from: { name: string; role: 'customer'|'senior'|'manager'|'tech'|'exec'|'personal' };
  blocking: boolean;
  body: string;
  /** Options are filtered at render time against the action log. */
  responses?: Array<{ id: string; text: string; requires?: EvidencePredicate }>;
  /** For useful customer calls: what it actually tells you. */
  reveals?: { premiseNodeId: string; symptom: string };
}
```

Events are generated per scenario+seed+role, appended to `ScenarioMeta`, and delivered by
the runner as the clock passes their `atSimSeconds`. Handling one is an `Intent` so it lands
in the action log and replays deterministically.

### Acceptance

- Events are seeded: same scenario+seed+role → same day, same interruptions, replayable.
- L3+ blocking calls genuinely interrupt and cost time; declining costs something.
- Response options are filtered by the action log — you cannot claim an observation you did
  not make.
- Useful customer calls actually narrow the problem; useless ones actually waste time.
- Comms scoring only applies to roles that carry comms load.

---

## 9. Invariants you must not break

1. **Redaction.** Nothing under `src/ui/**` may reference `appliedFaults`, `groundTruth` or
   `hidden.`. `redaction.test.ts` enforces it. New UI derives from the action log or claims.
2. **Determinism.** `scenarioId + seed (+ role)` reproduces a run exactly, including events.
   No `Math.random()` outside a `createRng` stream.
3. **One WebGL context.** Any new 3D surface is an `'unmount'` viewport.
4. **The validator stays green.** Every generated scenario at every (tier × focus × size ×
   seed) must still replay its reference solution to 100 on accuracy/evidence/safety. If you
   change action costs, presence rules or inventory rules, run the full generator suite.
5. **Offline.** No runtime asset downloads. All geometry in code, all data bundled. PWA
   precache must still cover everything.
6. **Phone-first.** ≥44 px touch targets, works at 390×844, reduced-graphics mode still
   available, and the non-3D accessible list view keeps working as a full alternative.
7. **No borrowed IP.** No manufacturer logos, CAD, photographs or proprietary UI. Original
   FiberOps branding. Credible *form* is fine; copied *marks* are not.
8. **Tests stay green.** 618 passing today. Add tests for every pure module you write —
   layout, camera, policy tables, event scheduling, response filtering.

---

## 10. Suggested build order

1. **§3.3 stow/raise + back** — smallest, highest relief, unblocks everything else.
2. **§3.1–3.2 truck and tool shelf** — the identity change. Delete the tab strip here.
3. **§6 roles** — pure policy tables; touches dispatch, costs, scoring. Cheap and high value.
4. **§4 the cabinet** — the biggest visual win; self-contained in one model file.
5. **§7 prep and readiness** — depends on the shelf being real (§3.2).
6. **§8 events and comms** — the largest new system; do it last, on solid ground.
7. **§5 blueprint map** — independent; slot in wherever convenient.

Keep `tsc -b` and the suite green between each. Verify in a browser after each — this is a
visual product and type-checking proves nothing about whether it looks right.

---

## 11. Definition of done

- The tab strip is gone; the truck and its tool shelf are the way you reach instruments.
- You can put a tool down without leaving it, and pick it back up unchanged.
- The cabinet is recognisably the one in `docs/reference/`.
- The map is a blueprint with three real zoom levels.
- You pick a role at dispatch and the day is measurably different because of it.
- Skipping prep can cost you, visibly, on the shelf.
- The phone rings and, at senior levels, you have to deal with it.
- `tsc -b` clean, full suite green, production build splits three.js out of the main chunk,
  PWA offline intact, one WebGL context, redaction test passing.
- A short `docs/architecture/item-9-*.md` written the way items 2–8 are: what was built, how
  it works, and an honest list of what was not finished.
