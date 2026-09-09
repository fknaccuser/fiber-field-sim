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

## Increment 3 — the print got the screen

Three separate faults, all of them the print's.

The teaching rail opened expanded with every step and its full rationale. On a 414×896 phone
that was about 38% of the viewport, permanently, above a drawing squeezed into a strip. It
opens as one line now — what step you are on and what it is — with **Where** and **Why**
beside it. The reasoning is worth reading; it is not worth staring at while you work.

Roll-truck existed and was invisible: it appeared only when you managed to hit a nine-pixel
plan symbol, and a block sheet can have two symbols on it. There is now a permanent footer
(where you are parked, or the selection and its travel time) and a **plant index** listing
everything the topology holds. The index does not roll the truck. It puts the thing under
your finger on the site sheet, and then the footer offers the roll — finding it and driving
to it are two decisions, and only the second one costs an hour.

And the site sheet printed labels in full, so `FDH A — CAMINO DEL AVION & VIA LADERA` ran
straight through `CLOSURE A1 — VIA LADERA` eleven metres away, and every ONT overprinted its
own NID. `sheetLabel` now returns the designation at every scale, the way a drawing letters a
symbol and puts the address in the schedule; here the schedule is the footer and the index.
Lettering is collected during layout and drawn in its own layer, de-collided by `stackLabels`
— greedy, bounded, deterministic, and unit-tested, so the same drawing always letters the
same way.

One real bug fell out of this: `frameFor` was passed the truck's location rather than the
selection, so "show me where" selected a node and then framed a different part of the
drawing.

## Increment 4 — customer contact became NOC

The crew's own words: infrastructure only communicates with NOC, for outages and
escalations, and never with customers. NOC sees the outages and sees who went down; infra
and NOC talk, infra and the subscriber do not.

**The action.** `customer-contact` (which took a `customerId`) is now `noc-contact`, which
takes nothing. There is nothing to choose: NOC hands over the whole alarm picture in one
conversation. Cost went from 120 s per subscriber to 150 s once.

That is not just a rename, it removes a step from every reference solution that called two
customers to compare them. The reasoning those calls stood for — do these premises share an
upstream path — survives intact; you now do it against the full list instead of by dialling
twice. Red herrings still arrive on the ticket, because NOC cannot tell you which report
belongs to your outage either.

**The data.** `WorldState.customerReports` → `nocReports`, `CustomerReport` → `NocReport`,
same fields. It was always the NOC's ticket; it was only ever named after who originally
rang. `customerId` stays, because the subscriber is still a subscriber.

**The axis.** `customerImpact` → `serviceImpact`. The old name read as though the
technician's relationship with those subscribers were being scored; it never was, and now
they cannot even speak to them. It measures the one thing the technician controls: how long
service stayed down. Premises out are still counted, derived from the world.

Rows written before the rename are already on trainees' devices, so `migrateStored` reads a
legacy `customerImpact` across to `serviceImpact` on the way out. A rename should not quietly
delete somebody's score.

**The day.** `comms.ts` lost `CommsFrom = 'customer'` and `CommsKind = 'customer-call'`. The
subscriber who used to ring the technician mid-job now reaches NOC, who relays it — and the
useful-versus-noise split survives, which was the only thing that call was teaching.

**What to watch.** Collapsing two reference steps into one shifted every `$n` evidence
reference in the authored scenarios down by one. `t4` and `t5` both carried them. The
validator replays each reference solution through the real runner and would have caught a
mistake here, which is exactly what it is for.

## Still to come

Increments 5–7: incoming DigAlert locate-and-mark; the 3D tray bench; backbone into a new
terminal. This file grows as they land.
