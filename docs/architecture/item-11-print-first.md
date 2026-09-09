# Item 11 — the print-first revamp

Written against a request from the crew that changed the shape of the product rather than
adding to it. This file records what was removed, what replaced it, and — importantly —
which of those removals were judgement calls that can be argued with later.

The brief, in the crew's own framing:

- Drop the 3D world view and put the whole session on the print.
- Make the topology on the print actually work, and roll the truck from it.
- Drop customer contact. Infrastructure talks to NOC for outages and escalations, and
  never to customers. NOC sees who is down; infra does not phone them.
- Make DigAlerts a first-class task, because they are done constantly.
- Drop the dust cap, the jumper and press-and-hold power from the instruments.
- Ribbon splicing, DigAlerts, and building and repairing POPs and terminals with backbone
  are the biggest tasks.
- Ribbon splicing should be a 3D model of the terminal and the splice tray, dressed by
  dragging the ribbon through the holes.

---

## Increment 1 — the 3D world is gone

**Deleted:** `WorldViewport`, `PlantScene`, `AccessibleList`, `CompassRose`, `compass.ts`,
`camera.ts`, `sceneState.ts`, the whole `scene/models/` layer (street, premises, plant
furniture), and `SceneBackdrop`.

**Kept, moved:** `sceneLayout.ts` → `src/ui/map/layout.ts`. This was never scenery. It is
the only source of position in the session: the print draws from it and truck-roll distances
are measured on it. It has no renderer dependency and never did.

**Kept, reduced:** `ambient.ts` → `src/ui/field/conditions.ts`. The full lighting model —
sun elevation through the day, fog distance per weather, hemisphere fill — existed to light
a street that no longer exists, so it went with the street. What survives is the part a
technician acts on: `Marine layer · 07:15`, now printed in the header. Every scenario has
carried `environment.weather` since the generator was written and it would otherwise have
gone back to reaching nobody.

**Consequence for the invariants.** The "one WebGL context" rule in the README was load-
bearing for three build items and is now vacuous: nothing in the field session holds a GL
context at all. It has been restated as the mount-policy rule it actually was. Three.js
comes back for the splice bench and nowhere else.

**What this cost.** The street was the only thing that made the plant feel like a place. The
argument for removing it is that it was never how the work got done — the drawing is — and
that maintaining a plant-model layer to sit blurred behind a power meter was paying scenery
prices for scenery value. If that trade turns out wrong, the deleted files are one revert
away in git history; the layout they were built from is still here and unchanged.

**The dock** went from four slots to three. `LOOK` is gone; `PRINT` leads, because the print
is where the job is read.

## Increment 2 — the instruments stopped asking permission

`deviceState.ts` and its tests are gone. It modelled three gates in front of every reading:
press and hold the power key, swing the dust cap off the port, land a jumper on it. Each was
correct about the hardware. Together they cost three taps between the trainee and every
single measurement, on every raise, for the whole session.

The case for deleting them: a technician learns to take a dust cap off by taking a dust cap
off. Tapping a picture of one does not build the habit, and the simulator has limited
attention to spend — it should spend it on the judgements that are actually hard, like
reading a trace or deciding a splice is worth re-burning.

The boot banner survives, because it is not a gate. It plays once per instrument per session
(remembered in viewport state, not replayed on every raise), prints the model and the
calibration date, and hands over.

Behind the instrument, where the 3D equipment used to render, is now a flat tailgate panel
naming the node you are standing at. Taking a good reading at the wrong location is the
mistake that screen can actually prevent.

## Still to come

Increments 3–6: customer contact → NOC and the fifth scoring axis; the print's topology and
roll-truck; incoming DigAlert locate-and-mark; the 3D tray bench; backbone into a new
terminal. This file grows as they land.
