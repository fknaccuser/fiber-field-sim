# Ribbon splicing — where the model comes from

`src/operations/ribbon.ts` was first written from general fibre practice plus the crew's
own description of the glue method. It was then audited against an hour of a splicer
working a **432-to-432 butt splice** — 36 ribbon splices, 12 fibres to a ribbon, 12 ribbons
to a tray, three trays.

The audit changed the model substantially. This file records what and why, so the next
person can tell which parts are grounded in observed work and which are still inference.

---

## The structural miss

The first version was **one flat list of steps**. The real job has three cadences:

| Phase | How often | Examples |
| --- | --- | --- |
| `setup` | Once a day, or on changing from singles to ribbon | Splice mode, arc test, open the case, lay both sides out |
| `per-ribbon` | 36 times on this case | Strip, clean, tap, cleave, clear grooves, load, fuse, read, inspect, shrink, cool |
| `closeout` | Once per tray | Seat the ribbons, dress slack, label, seal |

Flattening those teaches a trainee to arc-test every ribbon — or, worse, that a per-ribbon
habit is a once-a-day one. `caseSeconds()` now costs a case correctly: setup once, the loop
per ribbon, closeout per tray.

---

## The biggest single omission: the arc test

The model had **no arc test at all**. It is the one calibration that decides whether the
whole case comes back clean, it is done at least once a day and again whenever the machine
changes from singles to ribbon, and it is done on scrap ribbon before any production splice.

The machine reports the result plainly — *"arc too strong"* — and the correct response is to
lower it and test again, not to start splicing. Ignoring it lifts loss on every splice that
follows, which is exactly the failure mode that produces a tray full of re-burns. Both
`no-arc-test` and `arc-too-strong` are now modelled as **uniform** defects for that reason.

---

## Steps added because they were observed

- **Splice mode** — the machine has to be in 12-count ribbon mode. Checked first, since
  everything calibrated afterwards depends on it.
- **Lay out and match both sides** — feed 1–6 against distribution 1–6, blue orange green
  brown slate white, matched before a single splice. Getting this wrong fuses perfectly and
  connects the wrong customers, so it is now the most expensive mistake in the procedure.
- **Tap to separate** — fibres crisscross after wiping, and cleaving them crossed snaps them
  in the tool. Seconds to prevent, a whole ribbon to fix.
- **Clear the V-grooves** — was previously only a mistake, not a step. Dust lifts a fibre out
  of alignment and the machine rejects on offset *naming the fibre*. A brush works; so does
  running freshly cleaved scrap through the grooves at an angle.
- **Inspect the weld** — separate from reading the number. Cracking the lid and reading the
  welds through the machine's own camera is what lets a splicer accept a reading that looks a
  little high, because the estimate is inferred and the image is direct evidence. This is a
  judgement call the model previously had no way to represent.
- **Cool before handling** — a hot sleeve is still soft, and pushing on it breaks the splice
  inside the thing meant to protect it. Invisible until the tray is tested.
- **Seat in the tray** — loose tube in first so the lid does not bear on it, ribbons on top.
  Factory ribbon comes off the reel blue-up and needs a half turn to lie flat.

---

## Mistakes added because they were watched happening

- `dirty-cleaver-pads` — debris on the pads causes chipped and broken fibres cleave after
  cleave. Observed more often than blade wear, and previously not modelled at all.
- `dull-blade` — the fix is rotating to a fresh blade position, which the model now says.
- `overclamped-stripper` — clamping hard on ribbon glued up on site pulls the matrix apart:
  re-glue, wait for it to dry, start the ribbon again.
- `pulled-through` — the ribbon slides in the holder and coating ends up on the cleaver pads,
  guaranteeing a bad cleave. Pull it back *before* cleaving.
- `lost-blue-up` — blue stays up from the transport tube into the machine. A twist splices
  fine and then fights the tray forever.
- `sleeve-upside-down` — ceramic under, clear on top when running blue up.
- `pushed-sleeve-centre` — handle the coated ends, never the middle where the bare glass is.
- `stowed-hot`, `no-flip`, `tube-on-top`, `too-much-alcohol` (blow it off — 99% IPA flashes
  in seconds), `skipped-weld-check`.

---

## Still inference, not observation

- **Loss values in dB.** The magnitudes attached to each defect are plausible and correctly
  *ordered*, but they are not measured. What is grounded is the shape: a clean job on a
  calibrated machine reads in hundredths, a tenth on one fibre is worth a second look.
- **Signatures.** That contamination lifts the whole set, a tired blade takes a scattered
  few, and an uneven matrix takes the outer fibres is sound fibre physics, but the split was
  not derived from this source.
- **Closure-level steps** — anchoring, sealing, gasket checks. The source picks up with the
  case already open.
- **Acceptance thresholds** live in `acceptance.ts` and are industry-typical, explicitly
  **not** this employer's specification. See that file's header.

---

## Vocabulary worth keeping

A **"reb"** is a re-burn: a splice that has to be cut out and redone. The whole discipline of
arc testing and offset checking is described in terms of finishing a case with zero rebs.
