# Item 8 — Unlimited scenarios, and a physical 3D plant

Two things landed together, because the second is only worth building if the first exists:
an unlimited supply of scenarios (rather than three authored ones), and a world you look at
rather than a list of labelled boxes.

Status: implemented on the `fiber-sim-viewports` copy, on top of item 7's viewport
architecture. `tsc -b` clean, 48 test files / 618 tests, production build splits three.js
out of the main bundle. Section 4 lists what is done against the acceptance criteria and
what is honestly not.

---

## 1. Unlimited scenarios from parameters + seed

### The shape of it

A generated scenario is addressed by an id that *encodes its parameters*:

```
t3-gen-plant-medium        tier 3 · outside-plant fault · a neighbourhood
t5-gen-network-small       tier 5 · network/OLT fault · one street
t4-gen-any-large           tier 4 · surprise me · two hubs
```

`getScenario(id, seed)` returns a bundled YAML definition for an authored id, and for a
`*-gen-*` id calls `generateScenario(params, seed)`. Because the id carries the parameters
and the seed carries everything else, **every existing mechanism keeps working unchanged**:
`/run/:scenarioId?seed=N`, resume-from-IndexedDB, replay, scoring, and share codes
(`t3-gen-plant-medium:4821`) all treat a generated scenario exactly like an authored one.
No new persistence, no new routes, no stored blob of generated content.

### What varies

`src/scenarios/generate/generate.ts` builds, from one RNG stream seeded by
`deriveSeed(seed, 'generate', id)`:

- **The plant.** One or two hubs; a POP and OLT; per hub an FDH cabinet + splitter, an
  optional splice closure in a handhole, 2–4 NAP ports, and a house/NID/ONT per port.
  Span lengths, splice positions, drop lengths and NID positions are all drawn per seed.
- **Addresses.** Streets from a South-OC pool, house numbers deduplicated per hub, so
  `112 Camino del Avion` and `738 Rancho Viejo Rd` are this seed's customers.
- **The fault plan.** One of 13 plans, filtered by the tier's fault ladder and the chosen
  focus (`cpe / drop / plant / network / compliance / any`). Each plan places its fault(s),
  writes the plant records that make it findable, chooses the customer reports, and — the
  part that matters — **emits a reference solution that actually solves it**.
- **Red herrings.** From tier 3: a light macrobend or an in-spec-ish splice on an
  *unaffected* drop, plus an STP-blocked spare port at tier 4+.
- **Trim.** Weather, time of day, travel times between real pairs of nodes, and a time
  budget scaled by tier and by how much driving the reference run needs.

### Why it can be trusted

The generator emits a `ScenarioDefinition` and hands it to the **same Zod schema and the
same item-5 validator** an authored YAML goes through. The validator is not a formality: it
instantiates the world, applies the faults, replays the reference solution through the real
runner, and **fails unless that run scores 100 on accuracy, evidence and safety**.

`generate.test.ts` runs every (tier × focus × size) combination at six seeds — 342 cases —
through that validator. A generated scenario that is unsolvable, that cites evidence the
rules do not accept, or whose fault lands on top of an existing event, fails the build.

That is what makes "unlimited" safe: the supply is unbounded, but nothing reaches a trainee
that has not been solved once, by machine, on the way out.

### Using it

`RandomDispatch` (on Home and on the scenario picker) is three chips and a seed: difficulty,
what kind of trouble, plant size. It shows the share code it is about to run and has a
Reroll. The three authored scenarios stay where they were, under "Authored scenarios" —
they are the hand-tuned teaching set; the generator is the practice range.

---

## 2. The 3D outside-plant world

### One topology, no decorative second one

`src/ui/scene/sceneLayout.ts` turns the *real* topology into a street. It is pure (no React,
no three.js) and tested. Every drawn object carries the `TopologyNode` it stands for, and
selecting it selects that entity:

| Drawn | Bound to |
|---|---|
| POP building + OLT rack, cards, PON port LEDs | `olt` node, its `NetworkDeviceConfig`, its `ponPorts` |
| FDH cabinet, splitter module, port field | `fdh` node + `splitter` node (`splitRatio`) |
| Handhole (rim, pit, conduit, slack) | `splice-closure` node with `attributes.handhole` |
| Splice closure, trays, buffer tubes, sleeves | the same node's incident spans' `strands` |
| NAP pedestal, one port per terminal | `terminal` nodes grouped by `attributes.napId` |
| House, NID on the side wall, ONT indoors | `customer-premise` + `ont` node |
| Buried cable along the trench, drop up to the NID | `FiberSpan`, coloured by its `strands` |

There is no second graph. `sceneLayout.test.ts` asserts every non-premise node is placed
exactly once, every span gets a route, NAP ports of one NAP share one pedestal, and the
layout is deterministic.

Distances are *not* to scale — a 2 km feeder is drawn as tens of metres — so
`pointAlongRoute()` maps a real distance-along-span onto the drawn polyline
proportionally. That is what puts OTDR events in the right physical place.

### The environment

A residential South-OC street: asphalt with a dashed lane line, curbs, sidewalk, parkway
strip, dirt lots, stucco houses with hip tile roofs / garages / windows, dry landscaping,
a back fence, a truck yard with a bucket truck, and orange locate paint + a flag wherever a
node carries a `locateTicket`.

The parkway is **cut around every handhole** (`turfPatches`, unit-tested) so an open pit is
a hole you look down into, not a rim sitting on unbroken turf.

### Camera

`src/ui/scene/camera.ts` is pure and tested. Five modes:

- **Field** — technician eye height (1.7 m) in the street.
- **Equipment** — close on the selected object, from the side a technician approaches it.
  Wall-mounted NIDs and ONTs are approached from the wall side, not through the house.
- **Cutaway** — tighter still, enclosures forced open, ground and walls turned translucent.
- **Overview** — the whole plant.
- **Trace** — frames the spans the last OTDR shot actually traversed.

The scene eases to whatever pose the mode + selection asks for, then hands control to
OrbitControls (one finger rotate, two finger pan/zoom, pinch) and stops fighting the user
until the mode or selection changes again. Cabinets, pedestals and the POP are oriented to
face that approach direction, so opening a cabinet shows you its port field rather than its
back panel.

### What the visual layer may show

`src/ui/scene/sceneState.ts` is the rule. An ONT's LEDs:

- **Not on site** → all dark. "Too far away to read the LEDs; roll to the premise."
- **On site, unpowered** → all dark, and that is the answer to a tier-1 scenario.
- **On site, powered, nothing measured yet** → power LED only. *"Read the optical LEDs with
  a meter or the OLT before you trust them."*
- **After a power-meter reading or an OLT status line** → PON green / PON amber / LOS red,
  with a one-line basis stating which observation it came from.

So the optical LEDs light up because *the trainee measured*, never because the engine knows.
Highlights on nodes and cables come from item 7's `mapOverlay`, which is built only from the
action log and the trainee's own claims. `redaction.test.ts` greps `src/ui/**` for the
answer-key identifiers and covers the new directories like every other.

---

## 3. Instruments you hold

Selecting an instrument no longer opens a form. `src/ui/instrument/HeldDevice.tsx` renders
a rugged tester in the foreground with **the equipment you are standing at behind it** —
the real `SceneContents`, framed on your current location in cutaway, not a picture of one.
This costs nothing extra: item 7's `unmount` policy means only one viewport is mounted, so
there is still exactly one WebGL context alive (verified: ten rapid tab switches, one canvas
throughout, zero on plain-DOM tabs).

The device is off, capped and unplugged until you do something about it. `deviceState.ts` is
a small pure reducer, unit-tested:

- Press **and hold** the power key → boot banner prints line by line → screen wakes.
- The **dust cap** hinges off the optical port. You cannot land a connector on a capped
  port; you cannot re-cap a port with a lead in it.
- Connecting the **lead** draws a yellow jumper from the port off toward the equipment.
- A measurement before all that is refused with the reason the hardware would give.

| Instrument | Form | Model | Lead |
|---|---|---|---|
| OTDR | rugged tablet | FiberOps MX-730 | launch cable |
| Power meter | handheld | FiberOps PM-320 | jumper |
| VFL | pen | FiberOps VL-7 | pigtail — the emitter glows red, CW or 2 Hz |
| Inspection scope | handheld | FiberOps FS-400 | none (captive probe) |

Branding is original FiberOps throughout; the OTDR uses an EXFO-*class* rugged form factor,
not EXFO's marks or design assets. The OTDR screen **enlarges** to the full viewport for
cursor work and folds back into the held device with the same cursors and zoom intact.

---

## 4. Against the acceptance criteria

Done and checked in a browser:

- ONT is a mounted device with LED row, ports, power brick, on a wall shelf beside the
  gateway; LEDs behave per section 2.
- NID is a grey exterior enclosure on the house's side wall, with a hinged cover, fiber
  slack, an adapter, provider/customer sides, and a warning label.
- The customer drop leaves the pedestal, runs the trench, turns up the side yard, lands on
  the NID, and a jumper continues through the wall to the ONT.
- A parkway handhole opens (lid slides aside) and contains a **separate** splice closure
  that opens independently.
- FDH is a passive cabinet — doors, drip lip, pad, splitter module, port field, parking
  lot, patch cords. No fans, no switches.
- OLT is rack-mounted in a POP with line cards and per-PON LEDs.
- Cables and equipment map to real spans and nodes; selection selects the entity.
- Field → equipment → cutaway → trace navigation, touch controls, reset/focus.
- Reduced-graphics toggle and a full non-3D list view with the same selection and actions.
- Offline/PWA intact (19 precached entries); no runtime asset downloads — every model is
  geometry in code.
- The visual layer never reveals hidden ground truth.

Not done, and worth saying plainly:

- **Splice-tray interaction is shallow.** Trays render, lift, and show buffer tubes,
  strand colours and fusion sleeves, but selecting an individual fiber does not yet drive a
  repair action, and bend-radius routing is stylised rather than enforced.
- **Aerial plant is not modelled** — no poles, strand, lashing or down guys. The aerial
  fault kinds exist in the taxonomy but have no physical representation, so the generator
  does not emit them.
- **Distinct enclosure types are partly shared.** Pedestal, terminal and NAP use one model;
  powered remote cabinets, cross-connect cabinets and wall-mounted enclosures do not have
  their own yet.
- **Excavation has no scene representation** — it is still the Excavate panel, not a dig in
  the world.
- **Phone-viewport verification is by construction, not observation.** The preview pane
  does not reflow under viewport emulation, so mobile layout was made to work at the pane's
  own 739×312 (a harsher constraint than 390×844) rather than confirmed on a 390 px device.
  Worth a real-device pass.
- The OTDR's screen is genuinely cramped at very short viewport heights; **Enlarge** is the
  answer there, and it works, but the default held view wants a taller screen.
