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

## Increment 5 — DigAlerts, the direction they actually run

The brief said DigAlerts are done constantly and should be a bigger part of the trainer. The
engine already had `digalert.ts` — but that models the ticket *you* open before *you* break
ground: notify, wait two working days, dig. That is the law, and it is the rarer half.

The half the crew does constantly runs the other way. A ticket lands because somebody else
is excavating near your plant, and you go out and mark your own facilities before their dig
date. Planning and locating are different jobs with different failure modes, so
`locate.ts` is a new module rather than an option on the old one, and the two keep their
numbers apart: `MARK_TOLERANCE_M` is how close a traced mark must be to count in this
trainer, `TOLERANCE_ZONE_INCHES` is the statutory hand-dig zone, and conflating them would
hand a technician a wrong figure to argue with.

**The lesson the bench is built around.** Every run has a `recorded` route and an `actual`
route. Most of the time they are the same array. Roughly one job in three they are not,
because a re-route never made it back to the as-builts — and a trainee who traces the print
finishes in ninety seconds with a tidy ticket and a cut cable. So the drawing gives you the
recorded routes for free and makes you sweep for the real ones. The wand reports the signal
under your finger and nothing else; joining the peaks into a facility is the trainee's job,
which is what locating is.

`judgeLocate` names that failure specifically — `marked-the-record`, not a generic
`unmarked-facility` — because "you missed a bit" and "you trusted the print" are different
admissions.

**What else it catches.** Facilities nobody swept for (the drop, the abandoned stub — what
actually gets hit). Paint with nothing under it, which is as dangerous as no paint. Wrong
colour, which is a defect rather than a strike risk: the cable is marked, it is just claimed
by somebody else. And a ticket answered after the dig date, which protected nothing.

**Honest about the model.** `signalAt` is a clean Gaussian — no coupling onto a parallel
water main, no bleed-over, no null over a deep line. Those are real, and each needs a number
somebody measured. Inventing them would teach a trainee to distrust a reading for the wrong
reason, so the wand stays simple and the difficulty stays where it belongs: nothing tells you
when you have swept enough.

**Caught by running it.** The bench's page projection was not invertible — the forward
transform rotated the drawing and the inverse did not, so every stroke was laid down
transposed. It only showed up on a screen. `groundProjector` now lives in `locate.ts` with a
round-trip test, which is one assertion and would have caught it before it got there.

The board weights `locate-mark` alongside ribbon splicing, `STANDARD_RIG` gained a locator
and paint (a truck that answers these weekly carries them; the console cable is still
deliberately absent so POP turn-up keeps the one honest kit gate), and two tests assert the
board's distribution rather than trusting it.

## Increment 6 — the tray, in 3D, dressed by hand

The brief asked for ribbon splicing to be a 3D model of the terminal and the splice tray,
with the ribbon dragged through the holes to dress it. The holes the crew named were the
tray's own: the entry slot and the retention fingers.

**The split that makes it safe.** The 3D bench is an *input device*. `dressing.ts` turns the
path a finger dragged into numbers — slack, tightest bend, which features captured it, which
holder it ends in — and `judgeTray` grades those, as it already did and still does without a
renderer. A rendering bug can make the bench feel wrong; it cannot make it grade wrong.

**Three hardware types, one tray.** The tray is the same job inside a FOSC 450, a HexDome and
an FDH cabinet; what changes is the case around it and how you stand at it. So the tray model
is shared and the shell is context, which made "all three" cheap. Only the minimum bend
radius comes from the catalog — everything else about the shape is shape, and shape is not a
specification.

**The trade the bench is built on.** Slack is arc length; radius is curvature. Every extra
lap round the limiters buys the 900 mm the next technician needs and costs you room, and
winding tighter to fit more laps in is exactly how a tidy-looking tray ends up attenuating.
That is not scored as two rules — it falls out of measuring one shape.

**Smoothing is modelling, not forgiving.** Raw curvature on a dragged polyline reads as a
2 mm bend every few samples, because fingers jitter and ribbon does not. The path is
resampled to even spacing (otherwise curvature measures hand speed) and smoothed before it is
measured, and the ends are held because the ends are held.

**The design flaw the tests caught.** The entry slot started centred on the end wall, and the
tray was quietly *unpassable*: a ribbon entering on the centreline has to S-bend across to the
routing channel within the tray's width, and that S is tighter than the radius limit however
carefully it is laid. Nothing in the app said so — you would simply never score well and
never learn why. It only surfaced because there is a test asserting a passing dressing exists
at all, which is now the most important test in the file. Real trays put the slot over the
channel so the ribbon comes in already running the right way, and so does this one.

`tray.ts` gained two optional facts a hand-dressed route can report and a typed placement
cannot: `viaEntry` (over the wall, so the lid bears on it) and `retained` (nothing holding it
down when somebody lifts the tray). Both default to true when absent, so a placement given as
plain numbers is unaffected.

The old checkbox tray bench is gone. It asked two questions per fibre and was honest about
being a set of choices; dressing is a shape you make with your hands.

## Increment 7 — a terminal off the backbone

The crew named "building and repairing POPs and terminals with backbone" as one of the big
jobs. The splice bench already teaches the twenty-two steps and the tray bench teaches the
dressing; neither covers the hour before anybody switches a splicer on, and that hour is
where the outages come from.

`backbone.ts` judges a cut-in **as a plan**, before any glass is cut, because every mistake
in it is knowable from the records and the cable in front of you and every one is cheaper to
catch now than after thirty-six splices:

- **How you get in.** A mid-span window brings out one tube and leaves the rest up. A full
  cut on a live cable takes down every circuit in it — the verdict counts them, because that
  is the number a foreman asks for first. On a dead cable a full cut is fine; the mistake is
  not knowing which cable you are standing at.
- **Which fibres.** A live fibre is somebody's service, it fuses perfectly while you
  disconnect them, and nothing on the splicer says so.
- **How many.** Short is a second trip with a second crew; long burns spares somebody was
  keeping.

Colour order is reported as *workmanship*, explicitly because it is convention rather than
physics — a scattered set splices exactly as well and reads as a mess for twenty years.
Everything scored service-affecting is physics.

The generator is asserted to always admit a clean plan. A trainer that can deal an
unwinnable hand teaches that the right answer is sometimes to give up.

Committing a sound plan opens the rest of the job — splice, dress, prove — and those stages
tick off **recorded bench runs**, not a local flag, so the work counts because it was done.
Which exposed that the acceptance bench was the one bench that never recorded anything: the
lesson it teaches best, that one direction is not a measurement, was the one lesson that
never reached anybody's training record. It records now.

## Increment 8 — repairing what somebody else hit

The brief said building **and repairing**. `restoration.ts` is the repair half, and it closes
a loop: the callout it deals you is usually a dig-in, which is the failure the locate bench
exists to prevent, arriving from the other direction.

The whole job is one number. Damage extends past what you can see — a backhoe tooth drags,
and the sheath twenty inches back looks sound while the glass inside it is stressed — so how
far you cut back is pulled two ways at once. Short of the damage and you splice onto stressed
glass, which passes acceptance, gets signed off, and fails in six months on somebody else's
night shift with no attributable cause. Far past it and the ends will not reach, which you
discover after the cable is cut.

The correct answer is never "cut back a lot": it is find out how far it goes, cut past that,
and if that exceeds your slack then insert a section *on purpose*. The generator deals both
mornings deliberately and a test asserts it, because a trainee who only ever sees one of them
learns a habit instead of a decision.

Skipping the check on the exposed fibre is scored as workmanship when the fibre happens to be
sound and as a blocker when it is not — the same act, judged by what it was covering, because
that is the difference between a shortcut and luck.

## Increment 9 — POPs

The last of the four. Nothing in a turn-up is difficult and everything in it is skippable,
which is exactly why it needs a bench: none of these mistakes bites while you are standing in
the room.

It is about redundancy that was paid for and not delivered. Two power supplies on one feed is
one feed and a spare supply. Two breakers in different panels off one transfer switch read as
diverse on a drawing and are not. Two uplinks through two vaults and one duct are one uplink.
A chassis that is not bonded works perfectly until the first storm. So the bench shows the
*source* behind every circuit and the *duct* behind every route — the things a drawing hides
and a phone call reveals — and scores the diversity failures **above** the ones that stop the
job, which is the opposite of how they feel: an overloaded circuit announces itself the first
time you close the breaker, and a single-fed chassis comes up green and stays green for years.

**A knock-on worth recording.** The console cable had been deliberately left off
`STANDARD_RIG` so the readiness gate had one job to fire on. Once POP turn-up had a bench,
that stopped being a lesson and became a locked door — a card on the board nobody could ever
take. The cable went on the truck, and the gate needed a truthful reason to exist instead. It
has one: the board now builds the day's rig from the **same seeded morning readiness** the
field session uses, so the morning that leaves the VFL on the bench leaves it off this board
too. One model of a short truck, read in both places. Two tests hold the line — no job is
unworkable from a full rig, and the gate still fires on the mornings it should.

## What the brief asked for, and where it landed

| Asked | Where |
| --- | --- |
| Remove the 3D world view | Increment 1 — gone, with the instrument backdrop |
| Focus on the print, topology working, roll truck from it | Increment 3 |
| Eliminate customer contact | Increment 4 — NOC ticket, `serviceImpact` |
| Make DigAlerts a bigger part, implement the tasks | Increment 5 — incoming locate-and-mark |
| Drop cap / jumper / hold-to-power | Increment 2 |
| Ribbon splicing as a 3D terminal and tray, dragged to dress | Increment 6 |
| Building terminals with backbone | Increment 7 |
| Repairing terminals with backbone | Increment 8 |
| Building POPs | Increment 9 |

Every item in the brief has landed. What is open now is stated in
[`operations-as-built.md`](operations-as-built.md) and is not part of it: a shift that
accumulates across work orders, configuration after the physical turn-up, and aerial work,
which has faults in the taxonomy and no bench anywhere.
