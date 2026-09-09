# Fiber Field Simulator

A training simulator for outside-plant fiber technicians. The trainee is dispatched to a
fault they cannot see, and has to find it the way it is found in the field: read the print,
pull the plant records, ask the OLT, measure light, shoot an OTDR, inspect a connector, and
then commit to a diagnosis backed by cited evidence.

React + TypeScript + Vite, offline-capable PWA, phone-first. No backend.

---

## Start here

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 49 files, 623 tests
npx tsc -b         # type-check
npm run build      # production build + PWA precache
```

Then read **`docs/architecture/README.md`** — it indexes every build item and states the
invariants. If you only read two documents, read
[item-7](docs/architecture/item-7-viewports.md) (how viewports and the 3D layer are wired)
and [item-8](docs/architecture/item-8-generator-and-world.md) (the scenario generator and
the physical world).

**If you are here to build the next thing:** the work order is
[`docs/architecture/item-9-SPEC-simulator-shell.md`](docs/architecture/item-9-SPEC-simulator-shell.md).
It is written for a cold start and assumes no prior context.

The first item-9 increment, stow/raise and Back, is now implemented. Read
[`item-9-stow-raise.md`](docs/architecture/item-9-stow-raise.md) for verified behavior and
remaining work. The next increment is the truck and tool shelf (§3.1–3.2).

---

## What the engine is

The important idea: **nothing is scripted**. There is no canned instrument output anywhere.

- `src/world/` holds a `WorldState` — topology, fiber spans with events, device configs,
  hosts, plant records — plus a taxonomy of 30 fault kinds. A fault is a *mutation of that
  state*, never a pre-written symptom.
- `src/instruments/` are pure functions of `(world, settings, profiles)`. The OTDR computes
  a real backscatter trace with dead zones, ghosts and noise; the power meter walks the same
  optical path resolver; ONT status is derived from actual path loss. No instrument knows a
  "fault" was placed.
- `src/session/` is a pure reducer from `(SessionState, Intent)` to a new state plus a
  result, enforcing presence ("you must be at the ONT to meter it") and inventory rules, and
  recording an action log.
- `src/scoring/` grades five axes — diagnostic accuracy, evidence quality, efficiency,
  customer impact, safety compliance — and produces a decision replay.
- `src/scenarios/` validates authored YAML scenarios *and* generates unlimited ones
  procedurally. Both go through a validator that replays the reference solution through the
  real runner and fails unless it scores 100.
- `src/ui/` puts the trainee on the print — a scaled plan drawing of the plant at three
  sheet scales — with instruments they raise and lower over it.

## The four rules

1. **The UI never sees the answer key.** `src/ui/store/sessionStore.tsx` is the only module
   holding an unredacted `SessionState`; components get a redacted view.
   `src/session/redaction.test.ts` greps `src/ui/**` for the ground-truth identifiers and
   fails the build if one appears. UI derives what it shows from the action log (what the
   trainee observed) or the trainee's own claims — never from the fault list.
2. **Determinism.** `scenarioId + seed` reproduces a run exactly — same world, same trace,
   same score. Resume, replay and share codes depend on it. All randomness flows through
   `createRng(deriveSeed(...))` in `src/world/random.ts`. Never `Math.random()`.
3. **Anything vendor-, model- or region-specific lives in `src/profiles/*.yaml`.** Engine
   code contains no such constants. Swapping the OLT vendor or the one-call region is a YAML
   change.
4. **Viewports declare a mount policy.** Anything holding a canvas is `'unmount'`, so its
   resources are released when you switch away; cheap panels are `'keep-alive'` and keep
   their scroll, focus and drafts. See item-7.

   There used to be a fourth rule here about holding only one WebGL context, because the UI
   rendered a 3D street you could walk down. That street is gone — see
   [item-11](docs/architecture/item-11-print-first.md) — and nothing in the field session
   holds a GL context any more. Three.js returns for the splice bench, which is the one
   place a 3D model earns its cost.

## Layout

```
src/
  world/         World model, fault taxonomy, seeded PRNG
  instruments/   OTDR physics, power meter, VFL, inspection scope, CLI (vendor-driven)
  session/       Runner, presence/inventory rules, action log, redaction
  scoring/       Five axes + decision replay
  scenarios/     Schema, loader, validator, 3 authored + generate/ (unlimited)
  profiles/      Swappable YAML: network, vendors, equipment, instrument, region
  ui/
    store/       Session store (the trusted boundary) + Dexie persistence
    viewport/    Mount policy host + state that survives unmounting
    map/         The print: plant layout, sheet framing, the drawing itself
    instrument/  Held-device chrome
docs/
  architecture/  One document per build item — read the README there first
  reference/     Field photographs the world models (not committed — see HANDOFF.md)
```

## Scenarios

Three hand-authored scenarios ship in `src/scenarios/library/*.yaml` (tiers 1, 4, 5).
Everything else is generated: a scenario id encodes its parameters
(`t3-gen-plant-medium` = tier 3, outside-plant fault, neighbourhood-sized), and the seed
determines the rest. Run one directly:

```
/run/t3-gen-plant-medium?seed=7
/run/t1-dark-ont-vista-court?seed=42
```
