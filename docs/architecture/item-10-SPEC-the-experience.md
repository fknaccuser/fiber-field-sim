# BUILD SPEC — the experience layer

**This supersedes `item-9-SPEC-simulator-shell.md` as the active brief.** Item 9 is still
accurate about geometry and behaviour; it failed at the thing that actually mattered, which
was telling anyone what this is supposed to *look and feel like*. It said "stylised realism"
and stopped. Three build items later the UI was still default flat panels, because nothing
in writing asked for anything else.

Do not repeat that. **This document is a visual and experiential brief first and a technical
one second.** If you finish an item and the screen does not look meaningfully different from
the screenshot in your head when you started, you have not finished it.

---

## 0. State of play — what is real today

Read `README.md` and `docs/architecture/README.md` first. Then know this:

**Built and working.** The engine (world model, 30-fault taxonomy, OTDR physics, CLI, power
meter, VFL, scope, five-axis scoring, decision replay), unlimited procedural scenarios from
`id + seed`, a 3D outside-plant world bound to real topology, instruments held in hand with
power/dust-cap/lead gating, stow/raise, and — as of the last commit — a field-console theme
and a truck/tool-shelf replacing the tab strip.

**Specified and NOT built.** Everything in this document that is not marked "partly done".

**Never even specified until now.** The loading screen, the dispatch dashboard, the
first-person framing, and — most importantly — **the teaching layer in §7.**

---

## 1. What has been asked for repeatedly and is still missing

Read this list as the acceptance test for the whole item. These are the owner's words,
collected across the project:

1. *"I wanted it to be like a simulator"* — Car Mechanic Simulator, Flight Simulator. You are
   a person having a shift, not a user operating a dashboard.
2. *"The aesthetic and theme updated"* — partly done. §2 finishes it and adds the second
   register.
3. *"A POV of a technician"* — **not done.** §5.
4. *"The phone or tablet with dispatch orders"* — **not done.** §4 and §5.
5. *"The toolbag holding the VFL, the OTDR, the power meter, and the laptop"* — partly done
   (§6). The shelf exists; it is not yet a place you *are*.
6. *"Tiered, with tier 1 and 2 having steps and hints along the way"* — **not done. §7.**
7. *"The correct order and explanations of why at the end after I submit the diagnosis, along
   with the correct diagnosis"* — **not done. §7. This is the highest-value item in the
   document.**

---

## 2. Two visual registers — and they are deliberately different

The product has two surfaces and they must not look the same. This is not an
inconsistency; it is the point.

### Register A — DISPATCH: the company's software

Where: loading screen, morning dispatch, work-order queue, scenario laboratory, training
record, post-job debrief. This is software your employer bought. It is calm, modern, legible,
rounded, confident.

**Copy the reference deployment exactly:** `https://fiber-sim.okimrollin.workers.dev`

Exact tokens, pulled from that build:

```css
--bg:      #020617;   /* near-black navy */
--panel:   #08111f;
--panel-2: #0f1d2e;
--bezel:   #243247;   /* hairline borders */
--grid:    #162337;
--text:    #e2e8f0;
--muted:   #7c8aa0;
--cursor-b:#22d3ee;   /* cyan — the primary accent */
--cursor-a:#34d399;   /* emerald — healthy/nominal */
--trace:   #ffb000;   /* amber — time, warnings */
--led-alarm:#ff4d4d;
```

- Display type: **system-ui, 48px, weight 600**, tight leading. Sans, not mono.
- Labels, IDs, seeds, counters: **JetBrains Mono / ui-monospace**, ~10–11px, `letter-spacing: 2–3px`, uppercase.
- Cards: `border-radius: 12px`, 1px `--bezel` hairline, subtle inner glow on the active one.
- Buttons: full-width cyan fill with dark text for the primary action; cyan pill with chevron
  (`Enter field ›`) for row actions.

### Register B — FIELD: the equipment

Where: everything from the moment you enter a work order — the 3D world, the held
instruments, the cabinet, the terminal. This is a CRT-lit console at 3am. Squared corners,
machined corner brackets, survey grid, scanlines, monospace on every label.

Already implemented in `src/ui/app/theme.css`. Palette: `#070c12` ground, `#3be8d8` cyan,
`#ff6a13` orange, `#2ee58a` green, `#ffb020` amber, `#ff4d5e` red.

**The transition between registers is a moment.** Tapping `Enter field ›` on a work order
should feel like stepping out of the truck cab: dispatch fades, the console boots.

---

## 3. The loading screen

Reproduce it exactly. Near-black `#020617` with a soft teal radial glow bleeding in from the
top-right. Dead centre, small, cyan (`#22d3ee`), monospace, `letter-spacing: 3px`, uppercase:

```
INITIALIZING FIELD SYSTEMS…
```

Nothing else. No spinner, no logo, no progress bar. The ellipsis may blink. It should hold
long enough to read (~600–900ms minimum) even when the app is ready sooner — this is the
moment the fiction starts.

---

## 4. The dispatch dashboard

Reproduce the reference deployment. Structure, top to bottom:

**Header.** Left: a rounded-square mark with a cyan pulse/waveform glyph and a small green
status dot, then `FIBER//OPS` (bold, letterspaced, white) over `FIELD SIMULATION ENGINE`
(tiny, uppercase, muted). Right: a pill — `● SOC-07 ONLINE`, green dot, monospace.

**Hero.** A cyan monospace kicker with a broadcast glyph: `((•)) MORNING DISPATCH // 06:30`.
Then the headline in two lines, 48px, weight 600 — first line white, second line muted:

> **Enter the field.**
> **Bring back evidence.**

Then a sentence of orientation: the in-fiction date, the district, and one honest line about
the engine — *"Every reading is generated from the same plant, fault, and network models used
for scoring."*

**Shift card.** Rounded panel with an amber rounded-square icon. Before the day starts:
`SHIFT NOT STARTED` (amber, mono, letterspaced) / **"Your queue is waiting."** / a line about
seeded days / a full-width cyan **`▶ Start day`** button. After starting, the same card
becomes the day's character — `MIXED LOAD` / **"Normal operations. Stay sharp."** / *"Customer-impact
and plant work are both in the queue. Prioritize before you roll."* Vary this by what the
generator actually rolled: a single P1 outage reads differently from a queue of drops.

**Stat row.** Three cards: `WORK ORDER PROGRESS` (cyan, `0/2`, "% of shift queue closed"),
`TIME REMAINING` (amber, `08:00`, "Simulated shift time · 00:00 elapsed"), `NETWORK STABILITY`
(emerald, `72%`, "Active service risk requires attention"). Each with a small outline glyph
top-right and a thin progress bar beneath.

**Today's queue.** `TODAY'S QUEUE` kicker over **"Assigned work orders"**, with `DAY SEED
2506011756` right-aligned in mono. Then one card per job:

- A rounded-square glyph that differs by work type (plant / network / customer).
- A `P1` badge (crimson pill) and the ticket id `WO-37699` in mono.
- Title: **"Wrong Roll at Closure 7"**.
- 📍 `Antonio Pkwy · Closure 7`.
- A divider, then the dispatch summary — what the customer said and what you are being
  asked to do, in two lines.
- Footer: `EST 90 MIN` · `SEED 637699` in mono, and a cyan **`Enter field ›`** pill.
- The next job you should take gets a cyan left-edge glow.

**Below the fold.** `CURRENT STREAK` (big number + "days", personal best beneath),
`WEAKEST DOMAIN` (from the existing competency map — "No Baseline / Complete a work order to
establish it" until there is data), a `Scenario laboratory` row ("Practice a specific seed
outside your dispatch queue") with a chevron, and a footer: `⛊ LOCAL-FIRST · OFFLINE READY`
and a `Training record` link.

**Wire it to real data.** Work orders come from the generator (§7 tiers). `EST` is the
scenario's time budget. `SEED` is the real seed. Streak and weakest domain already exist in
`src/ui/store/progress.ts`. Network stability should be derived from actual affected
customers, not decoration.

---

## 5. First-person: the POV that was asked for three times

Right now you look *at* panels. You should look *out of a technician's eyes*.

**The frame.** Every field screen is composed as though you are standing there:
- The 3D world fills the view at eye height (already true — `camera.ts` `EYE_HEIGHT`).
- A held instrument occupies the lower half **in your hands**, angled slightly, with the
  equipment you are working on visible behind and above it (already true; keep it).
- The **phone** is a physical object you raise: a slab that rises from the bottom edge with
  the dispatch order, the customer's words, and incoming messages on it. Not a tab — a thing
  you lift and lower, same gesture language as stow/raise.
- The **laptop** opens on the tailgate: the console fills its screen, with the lid, bezel and
  a sliver of truck bed visible around it.

**Hands and consequence.** Every action should have a physical antecedent that is already
half-built: the dust cap comes off before the connector lands, the lid slides off before you
reach into the handhole, the cabinet doors swing before you touch a port. Extend this — do
not let any new interaction be a button that just *happens*.

**Ambient truth.** Time of day tints the scene (the scenario already carries
`environment.timeOfDay`). Weather is in there too and currently unused.

---

## 6. The truck and the toolbag — finish it

**Partly done.** `src/ui/truck/` has a shelf that draws the OTDR, power meter, VFL, scope and
laptop as recognisable instruments, shows an empty dashed slot for anything missing from
`truckInventory`, and opens the tool you tap. The dock is now `LOOK / PRINT / TRUCK / PHONE`.

**What is left:**
- Make the shelf a *place*, not a grid — the inside of a service body: roll-up door, shelf
  rails with real depth, tools sitting in foam cutouts and clipped brackets, a fibre reel on
  its spindle, the laptop bag. It should read as somewhere you are standing.
- Opening the truck should **animate**: the door rolls, the interior lights come up.
- Tools should show **condition** physically — a red battery pip on a low OTDR, a smudged
  scope tip, an empty reel — feeding §9's readiness failures.
- `LOOK` should become a real compass/orientation control, per the original request
  (*"world is a compass map on the top left"*), not just a tab.

---

## 7. TIERED SCENARIOS AND THE TEACHING LAYER — the most important item here

This is the thing that makes it a trainer instead of a puzzle. It has been asked for
explicitly and has never been built. **Do not ship this item without it.**

### 7.1 What a tier means to the trainee

| Tier | Guidance during the job | Hints | Debrief |
|---|---|---|---|
| **1** | **Full step list, visible from the start.** Each step says what to do and what question it answers. Steps tick off as you complete them. Dispatch will tell you the next one on request. | Unlimited, free | Full |
| **2** | **Step list visible but not pre-filled** — the method is named ("establish whether light reaches the demarc") without naming the instrument or the location. Steps tick off. | 3, small cost | Full |
| **3** | No step list. Dispatch confirms facts you already observed. | 2, real cost | Full |
| **4** | Nothing. | 1 | Full |
| **5–6** | Nothing, and the scenario actively misleads. | 0 | Full |

**The debrief is full at every tier.** Difficulty controls how much help you get *during*
the job, never how much you learn *after* it.

### 7.2 During the job — tiers 1 and 2

A **step rail** on the field screen (collapsible, remembers its state):

```
STEP 2 OF 5                                    ● ● ○ ○ ○
Ask the OLT what it thinks of this ONT.
  → Answers: is the ONT dark because it lost power, or because it lost light?
  [ show me where ]        (tier 1 only)
```

Rules:
- A step names the **question**, never the answer. "Check the ONT's input power" — not
  "the ONT is unpowered".
- Steps tick off when the action log satisfies them (reuse the same matching the validator
  uses to replay a reference solution).
- The trainee may work out of order or do things not on the list. The rail never blocks
  anything; it does not gate the session.
- `show me where` (tier 1) highlights the relevant object in the 3D world. It does not
  perform the action.

### 7.3 After submitting the diagnosis — the debrief

**This is the payoff and it must be excellent.** When the trainee submits, do not just show
five axis scores. Show them, in this order, in Register A:

**1. The verdict.** Did you get it? Then, plainly:

> **The fault was:** a wrong tube rolled at Closure 7 — the feeder's BLUE/ORANGE strand was
> spliced through onto the dark BLUE/GREEN fiber, breaking continuity to FDH-B.
> **You said:** wrong-tube continuity on `sp-feeder-main`, strand blue/orange. **Correct.**

Use `FaultDefinition.description` from `src/world/faultTaxonomy.ts` — every one of the 30
faults already carries a written explanation. Surface it. Add the specific instance: which
span, which strand, which position, which device.

**2. The correct order, with the why.** The reference solution as a numbered walkthrough.
For every step: what a competent technician does, **and why they do it there**:

```
1  Call two of the affected customers                    ~4 min
   WHY  Four addresses on one FDH is a very different problem from one dark ONT.
        You are establishing scope before you spend a truck roll.

2  Pull the port assignments and the Closure 7 splice sheet   ~2 min
   WHY  The paperwork tells you which strand is supposed to feed FDH-B.
        You need that before a meter reading means anything.

3  Ask the OLT for ONT status                             ~1 min
   WHY  Confirms all four are LOS rather than offline — light is missing,
        not power. This rules out the CPE entirely.

4  Meter at the FDH-B splitter input                      ~1 min + 20 min drive
   WHY  No light here puts the fault upstream of the cabinet. If there had
        been light, everything after this step would have been wrong.

5  Meter the blue/orange strand at Closure 7              ~1 min + 8 min drive
   WHY  Light at the closure but none at the cabinet localises the break to
        the splice itself. That is the whole diagnosis.
```

**3. What you actually did, against that.** `computeReplay` in `src/scoring/replay.ts`
already classifies every logged action as necessary / unnecessary / missing. Render it as a
two-column alignment — the reference on one side, your run on the other — and call out:
- steps you skipped, and what you were guessing without them
- actions that cost time and proved nothing
- the point where you diverged from the productive path

**4. Your evidence.** Which of your observations actually proved the fault, from
`EVIDENCE_RULES` in `src/scoring/evidenceRules.ts`. If you were right but cited the wrong
actions, say so — being right for the wrong reason is a specific failure and the scorer
already detects it.

**5. Then** the five axes, and what to practise next (the weakest-domain map already exists).

### 7.4 Data model — the one change the engine needs

The generator already emits a reference solution and the validator already proves it solves
the scenario. The only missing piece is the **why**.

Do **not** change `referenceSolution.steps` from `Intent[]` — the validator, the scorer and
every scenario replay that step array, and changing its element type will break all of them
at once. Add a parallel array instead:

```ts
interface ReferenceSolution {
  steps: Intent[];                 // unchanged
  /** Aligned by index with `steps`. Why a competent tech does this, here, now. */
  rationales: string[];            // NEW
  totalSeconds: number;
  affectedCustomerMinutes: number;
}
```

- `src/scenarios/generate/generate.ts` writes a rationale as it pushes each step — the
  generator knows exactly why it is adding that step, so this is cheap and honest.
- The three authored YAML scenarios get rationales authored by hand.
- Extend the validator: **fail any scenario whose rationale count does not match its step
  count, or whose rationales are empty.** An unexplained step is a bug, not a nicety.

Write rationales in the second person, present tense, one or two sentences, naming the
question the step answers and what it eliminates. Never name the fault.

---

## 8. The cabinet from the photographs

Unchanged from item 9 §4, and still the single biggest visual win available. The
photographs are **not committed** (they show a real operator's plant) — ask the owner for
`docs/reference/cabinet-*.jpg` before starting. Item 9 §4 carries a detailed written
description if you cannot get them: cream body, dark drip-edge top cap wide enough to set an
OTDR on, ~6×12 green SC/APC grid mostly unpopulated, stacked adapter modules, purple 1RU
chassis, teal MM against yellow SM, D-ring column, yellow slack coil, empty bottom shelf,
white flag labels on nearly every cord.

---

## 9. Roles, preparation, and live comms

Unchanged from item 9 §6–§8. Summary so they are not forgotten:

- **Roles at dispatch** — L1 / L2 / L3 / Senior / Manager, orthogonal to scenario tier. Role
  shapes *your day* (guidance, hints, truck rolls, time, actions, interruption load); tier
  shapes *the fault*.
- **Prep phase** — night-before and morning pre-trip. Skipping it can leave you without a
  VFL, with a flat OTDR battery, or with a dirty scope tip. **The tool shelf already renders
  missing tools as empty slots — the mechanism is built, the cause is not.** L1/L2 get a
  coaching line and a recovery drive; L3+ get neither.
- **Live comms** — seeded, replayable events: extra customers calling with useful or useless
  information; texts from senior techs and managers; at L3+ blocking calls you must answer,
  including a CTO wanting a status. **Response options are filtered against your own action
  log — you cannot report an observation you never made.**

---

## 10. Invariants — breaking any of these fails the delivery

1. **The UI never sees the answer key.** `src/session/redaction.test.ts` greps `src/ui/**`
   for `appliedFaults`, `groundTruth`, `hidden.` and fails the build. This includes the new
   teaching layer: the step rail and the debrief must be built from `meta.referenceSolution`
   and the action log — both of which are already redaction-safe — never from the fault list.
   **The debrief runs after the session has ended, which is exactly when the scorer's output
   is allowed to name the fault. Route it through `ScoreReport`, not through the world.**
2. **Determinism.** `scenarioId + seed (+ role)` reproduces a run exactly, comms events
   included. All randomness through `createRng(deriveSeed(...))`. Never `Math.random()`.
3. **One WebGL context.** Anything holding a *GL* canvas is an `'unmount'` viewport. A 2D
   canvas alongside it is fine — see `HANDOFF.md`, which has the correct check.
4. **The validator stays green.** It replays each reference solution through the real runner
   and fails unless it scores 100 on accuracy/evidence/safety. Every generated combination at
   several seeds runs through it in CI.
5. **Offline.** No runtime asset downloads. All geometry and data bundled. PWA precache intact.
6. **Phone-first.** ≥44px targets, works at 390×844, reduced-graphics mode, and the non-3D
   accessible list stays a complete alternative.
7. **No borrowed IP.** Original FiberOps branding. Credible form, never copied marks.
8. **Tests stay green.** 628 today. Add tests for every pure module — step matching, rationale
   completeness, debrief assembly, role policy, event scheduling.

---

## 11. Build order

1. **§7 the teaching layer.** Highest value, most asked for, and it is mostly wiring existing
   engine output (`referenceSolution`, `computeReplay`, `EVIDENCE_RULES`,
   `FaultDefinition.description`) into a screen that does not exist yet. Do the rationales
   and the debrief first, then the step rail.
2. **§3 + §4 loading screen and dispatch dashboard.** Self-contained, transforms first
   impression, and gives the app a front door.
3. **§8 the cabinet.** One file, biggest visual jump in the field.
4. **§5 first-person framing** — the phone slab and the laptop-on-tailgate.
5. **§6 finish the truck.**
6. **§9 roles, prep, comms.**

Keep `npx tsc -b` and `npm test` green between items. **Run the dev server and look at every
item before calling it done** — this is a visual product and type-checking proves nothing
about whether it looks right. If you cannot run a browser, say so plainly rather than
claiming a visual change works.

## 12. Definition of done

- A loading screen and a dispatch dashboard that match the reference deployment.
- Two visual registers that both look deliberate, and a transition between them that lands.
- Tier 1 and 2 walk you through the job with steps that name questions, not answers.
- **Every submitted diagnosis ends in a debrief that tells you the correct diagnosis, the
  correct order of steps, and why each step exists — at every tier, whether you were right
  or wrong.**
- The cabinet is recognisably the one in the photographs.
- You are looking out of a technician's eyes, holding their tools, standing at their truck.
- `tsc` clean, suite green, one GL context, offline intact, redaction test passing.
- `docs/architecture/item-10-*.md` written the way items 7 and 8 are: what was built, how it
  works, and an honest list of what was not finished.
