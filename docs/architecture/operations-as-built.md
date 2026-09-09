# Operations layer — as built

The simulator began as a fault-diagnosis trainer. This layer is the rest of the job:
construction, maintenance, splicing, dressing, testing, and the planning that gates all of
it. Written after the crew asked for "the day to day of a network field technician, from
L1 duties to manager".

This file says what exists, what is reachable, and what is still only an engine — so nobody
has to discover the gaps by clicking.

---

## Reachable and working

| Bench | Route | What it teaches |
| --- | --- | --- |
| **Ribbon splice** | `/bench/splice` | The 22-step procedure. The loss chart's *shape* is the diagnosis. |
| **Tray dressing** | `/bench/tray` | A 3D tray you route the ribbon on. Radius against slack, and what holds it down. |
| **Acceptance testing** | `/bench/test` | Gainers, and why one direction is not a measurement. |
| **Locate and mark** | `/bench/locate` | Answering a DigAlert. You mark the cable, not the drawing. |
| **Backbone cut-in** | `/bench/cut-in` | How you get into a live cable, and whose fibres are whose. |
| **Emergency restoration** | `/bench/restore` | How far the damage really goes, against whether the ends reach. |
| **POP turn-up** | `/bench/turnup` | Redundancy you paid for and did not get. |
| **Construction board** | `/` (under the fault queue) | Triage: kit, grade, locate — reported together. |

All seven benches record. A run is scored, written to IndexedDB against the same trainee as
a field session, and surfaces on dispatch and in the training record. Practice that leaves
no trace teaches only whoever happens to be watching.

## Engine modules

| Module | Reachable from |
| --- | --- |
| `ribbon.ts` — 22 steps, 3 phases, ~30 mistakes | splice bench |
| `tray.ts` — dressing inspection | tray bench |
| `acceptance.ts` — profiles, gainers, link generator | acceptance bench, tray footer |
| `catalog.ts` — FOSC 450, FIST-GC02, HexDomes, HexDome FDH | tray bench (closure picker) |
| `dispatch.ts` — job templates, readiness, `STANDARD_RIG` | construction board |
| `digalert.ts` — §4216, working days, paint colours | construction board (locate chips) |
| `locate.ts` — incoming tickets, the wand, mark judging | locate bench |
| `dressing.ts` — tray geometry, route measurement | tray bench (3D) |
| `backbone.ts` — cut-in method, fibre assignment | cut-in bench |
| `restoration.ts` — damage reach, cut-back against slack | restoration bench |
| `popTurnup.ts` — power and path diversity, bonding, load | turn-up bench |
| `benchRecord.ts` — scoring and standings | all benches, dispatch, history |
| `crew.ts` — stretch, fatigue, morale, crew flags | **nothing.** See below. |

---

## Not built

Stated plainly rather than left to be discovered.

- **The manager board.** `crew.ts` is complete and tested — skill moves on the *stretch*
  between job and person, fatigue and morale are tracked separately, and `crewNotes` flags
  stagnation as loudly as burnout. It has no screen because the crew asked to keep the
  manager board off for now. This is a deliberate hold, not an oversight.
- **FDH build, IDF prep, POP turn-up, outgoing locate requests.** Job templates, durations,
  kit and grade gates all exist and the board schedules them. None has a bench. Their cards say
  "bench not built yet — engine only" rather than offering a button that goes nowhere.
- **Nothing carries between work orders.** The cut-in and restoration chains tick their
  stages off recorded bench runs, so those are real, but a day of work orders is still not
  one continuous shift and the drive back to the yard does not exist.
- **Configuration.** The POP bench plans the physical turn-up — power, bonding, paths — and
  stops where the console session would start. The CLI engine exists and the field session
  uses it; nothing connects the two.
- **Aerial work.** Everything here is underground or in a room. Strand, lashing, sag and
  clearance are in the fault taxonomy and have no bench.

---

## What only the crew can close

These are not engineering gaps. They need information this project does not have.

1. **Acceptance thresholds.** The default is `OSP_TYPICAL` — 0.10 dB mean, 0.20 dB max —
   marked `industry-typical`, and its own source line says it is **not this employer's
   document**. A test asserts that sentence stays there. When the real specification turns
   up it becomes a third profile marked `employer-specified`; nothing else changes.
2. **Five unverified capacities.** Every entry in `catalog.ts` carries `verified: false`,
   and the tray bench prints `CAPACITY UNVERIFIED` on screen. The families and designations
   are right; the per-variant tray counts and splice capacities have not been checked
   against installation manuals.
3. **Closure open and seal.** The transcript that grounds `ribbon.ts` picks up with the case
   already open, so anchoring, gasket seating and sealing remain inference. One video of a
   case being opened and closed would settle them.
4. **How often the as-builts are wrong.** `locate.ts` re-routes a run behind the records
   about one job in three, and that figure is invented. It is high enough that sweeping is
   never optional and low enough that the print cannot simply be assumed wrong — but the
   crew knows the real rate on this plant and this project does not.
5. **What the wand does on a bad day.** `signalAt` is a clean Gaussian with no coupling, no
   bleed-over from a parallel utility and no null over a deep line. Those are real and each
   needs a number somebody measured; inventing them would teach a trainee to distrust a
   reading for the wrong reason, so the model stays honest about being simple.
6. **How far each kind of damage reaches.** `DAMAGE_REACH` in `restoration.ts` is inference.
   The *ordering* is sound — water wicks further than a dragged tooth, which reaches further
   than a rodent bite — and that ordering is what the bench teaches. The metre figures are
   placeholders and every line says so. The crew has seen how far back they actually had to
   cut; this project has not.
7. **Electrical figures.** `popTurnup.ts` encodes the shape of continuous-load derating and
   nothing more. Breaker sizing and conductor selection are code territory and an electrician's
   job; what a technician needs from this bench is the habit of asking what is already on the
   circuit and what is behind it, which is what it teaches.

---

## Conventions worth keeping

- **Nothing is reported that cannot happen.** A mistake with no consequence, a signature with
  no defect behind it, a button with no bench — each of those is a lie to the trainee. Two
  guard tests enforce it: one fails if any loss signature is orphaned, one fails on filenames
  that differ only by case. Both were written after the failure they prevent.
- **Provenance travels with the number.** Thresholds carry `confidence`; catalog entries
  carry `verified`; the statute carries a caveat that statutes get amended. A trainer that
  invents a figure teaches somebody to argue with their foreman using a number nobody can
  source.
- **Blockers are reported together.** Kit, grade and locate all at once — finding the second
  one after driving out is the wasted roll the whole simulator exists to prevent.
- **Defect and workmanship stay apart.** One attenuates now; the other costs somebody else
  later. Collapsing them teaches that they are the same kind of wrong.
