# The Field Solo — execution handoff

Spec: SOLO-1 ("The Field Solo — Sonnet execution guide", edition SOLO-1, 13 September 2026).
This replaces the earlier large architecture (`docs/architecture/`, root `HANDOFF.md`) for the
current release. That work is untouched on disk but no longer reachable from `index.html`.

## Noted deviations from the package text (non-blocking)

- BUILD_AND_HANDOFF.md names the repository `fknaccuser/Network-Field-Technician-Trainer` and a
  `build/solo-week` branch. The actual checkout is `fknaccuser/fiber-field-sim`, and the branch
  in use is `claude/field-solo-implementation-am520q` (set by the execution session's own git
  instructions, which take precedence over the package's branch suggestion). Same repository
  identity otherwise; no functional impact.
- "Keep the existing Node build/serve tooling" — this checkout's existing tooling is Vite +
  TypeScript (`npm run dev` / `npm run build`), not a `scripts/serve.mjs`/`scripts/build.mjs`
  pair. `index.html` and `package.json` are the actual integration points and were edited as
  UI_AND_STORAGE.md specifies ("index.html loads ./src/solo/main.js and ./src/solo/styles.css").

## What exists after S01

- `src/solo/app.js` — pure, DOM-free state: `createInitialState`, `normalizeCommand`,
  `submitOpeningCommand`, `completeInitialization`. Screens so far: `opening`, `initializing`,
  `home`.
- `src/solo/main.js` — the only module touching `document`. Renders the black opening screen
  (real labeled, visually-hidden `<input>`; visible mirrored text line; blinking block cursor
  that goes steady under `prefers-reduced-motion`), runs the three-line initialization sequence
  (200ms per line, ~600ms total, within the 500–1000ms bound), and renders a minimal Home
  (`<h1>The Field</h1>` only — the real Home screen with Continue/Recommended/skills is
  `view.js`, introduced in S02).
- `src/solo/styles.css` — MASTER_DESIGN §8 color tokens, opening/init/home screen styles, 44px
  minimum control height, `visually-hidden` utility.
- `index.html` — script/link swapped to the solo entry; nothing else touched.
- `package.json` — added `solo:test` script only (`solo:e2e` is S18's, once Playwright is
  actually needed).
- `tests/solo/shell.test.mjs` — 6 Node `--test` cases covering initial state, enable
  (case-insensitive/trimmed), rejection of an unrecognized/empty command, and initialization
  completion (including the no-op guard outside `initializing`).

S01 shipped with no persistence — reload always returned to the opening screen, matching S01's
acceptance line exactly ("reload shows opening by default"). S02 (below) adds it.

## What S02 added

- `src/solo/store.js` — `createIndexedDBAdapter()` (real IndexedDB, `the-field-solo` v1, stores
  `profile`/`mission`/`recovery`) and `createMemoryAdapter()` (a trivial in-memory adapter with
  the same `readMany`/`writeMany`/`listKeys` shape, for Node tests — no IndexedDB emulation).
  `openStore(adapter)` binds the DATA_CONTRACTS.md atomic pair `loadLocal()`/`saveLocal(profile,
  mission)` (one transaction each, resolving on `transaction.oncomplete`), plus the wrapper
  helpers `loadProfile`/`saveProfile`/`loadMission`/`saveMission` (each round-trips through
  `loadLocal`/`saveLocal` so profile and mission can never be written out of step), and
  `exportData`/`replaceData`. `replaceData` validates format/version/profile shape and a 5MiB
  size limit, keeps at most one pre-restore `recovery` record (deletes older ones in the same
  write transaction), and never executes imported values (it only ever does `JSON`-safe field
  access).
- `src/solo/app.js` — added `createInitialProfile()` (the full UI_AND_STORAGE.md shape plus the
  DATA_CONTRACTS.md progress fields: `counters`, `evidence`, `countedAttemptIds`, so the profile
  schema doesn't need a mid-week migration when progress tracking lands), `boot(store)` (loads
  or creates the profile, restores any saved mission, and starts on Home instead of Opening when
  `openingEnabled === false`), and the pure/impure split `applyProfileUpdate` (pure, marks
  `saveStatus: 'saving'`) + `persistProfile` (the actual save attempt, reusable as Retry) +
  `updateAndPersistProfile` (convenience wrapper), matching UI_AND_STORAGE.md's dispatch order.
- `src/solo/view.js` — `renderHome(state, actions)`: Continue is disabled (and
  `aria-disabled`) until `state.mission` is truthy; shows Saving…/Saved/Save failed; a Retry
  button appears on failure and calls `actions.onRetrySave`.
- `src/solo/main.js` — now boots through `store.js`/`app.js` on startup and delegates Home
  rendering to `view.js`.

**Deferred, and why:** DATA_CONTRACTS.md's "allowed enums/IDs, graph bounds" validation for
`replaceData` needs the mission/device schema, which doesn't exist until the engine tasks
(S04+). `replaceData` validates everything checkable today (format, version, profile shape,
size); deeper structural validation must be added once `model.js`/`generate.js` exist — this is
a recorded gap, not a silent stub. The visible Settings screen (to toggle opening/text scale by
hand) isn't built yet either — the underlying mechanism is fully wired and tested via `boot`/
`applyProfileUpdate`, but no UI calls them yet; that lands whenever `view.js`'s Settings screen
does.

## Actual results (see docs/solo-execution/STATE.json for machine-readable form)

- `npx tsc -b` — exit 0, clean throughout S01 and S02.
- `npm run solo:test` — exit 0, 25/25 passing (6 shell + 8 app/store boot-and-save + 11 store).
- `npm run build` — exit 0. Bundle dropped from the baseline 851 modules / ~850KB main chunk to
  8 modules / ~8KB main chunk, confirming the old React/Three.js code is no longer reachable
  from the new entry (it is still present on disk, untouched, per S01's "without deleting old
  modules").
- `npm test -- --run` (pre-existing Vitest suite) — exit 0, 73 files / 1030 tests, unaffected
  throughout (baseline was identical: recorded before any change, same numbers both times).
- Manual scripted Chromium checks (Playwright, pre-installed browser, throwaway scripts under
  the session scratchpad, not committed) against `npm run dev`:
  - S01: opening screen renders; `nope` + Enter shows "Command not recognized." and stays on
    opening; `  ENABLE  ` + Enter reaches Home after the init sequence; reload returns to
    opening; command field is a real `<input type="text">` (`display: block`, not `none`) with
    an associated `<label>`. No console errors.
  - S02: after `enable`, Continue is disabled (`isDisabled() === true`) with no mission. The
    real browser IndexedDB (`the-field-solo` v1, `profile` store, key `"local"`) holds the full
    profile shape after boot. Writing `openingEnabled: false` and `textScale: 1.25` directly into
    that IndexedDB record and reloading skips straight to Home (0 `.opening-screen` elements)
    with `textScale` still `1.25` — the skip-opening preference and text scale both survive a
    real reload against real IndexedDB, not just the in-memory adapter used by the Node tests.
    No console errors.

No baseline failures existed to preserve — `tsc -b`, the Vitest suite, and `npm run build` were
all green before S01 started, and stayed green through S02.

## What S03 added

- `src/solo/model.js` — `validateNetwork(state)` and `cloneNetwork(state)` (ENGINE_RULES.md
  "State shape"/"Files and exports"). `validateNetwork` checks structural integrity only —
  unique/present IDs across devices/ports/links, every reference resolves, at most one router,
  at most 7 devices / 10 links, no port wired by two links, no physical cycle (union-find over
  the device graph induced by links), router segments reference a port on their own device and
  don't overlap (/24 only, matching "editable only to /24 in SOLO-1"), and syntactic (not
  semantic) IPv4 checks with the .0/.255 host-bit rule on any /24 address. It does *not* check
  whether the network works — a syntactically valid but wrong gateway passes, matching
  ENGINE_RULES.md exactly. `cloneNetwork` is `structuredClone`. The IPv4 syntax check is a small
  local helper, not an import from `ip.js` — that file doesn't exist until S04; once it does,
  worth consolidating so there's one definition of "syntactically valid IPv4," not two.
- `src/solo/layouts.js` — `createHealthyLayout(layoutId, x, host, label)`. `BR` is the supplied
  `fixtures/healthy-branch.json` copied in as data (X=42, host=130 baked in, confirmed to
  reproduce the golden fixture exactly at those values). `x` (1-200) is substituted into every
  `10.42.*.*` address; `host` (130-149) replaces the target client's own host octet only.  `HM`
  removes SW2 and wires SW1:Gi0/24 directly to R1:Gi0/0 (5 devices). `OF` adds PC3 wired to a new
  SW2:Gi0/3 (access VLAN 10) and moves PC2 onto a new SW2:Gi0/2 (access VLAN 20), leaving the
  original SW1:Gi0/2 present but unused rather than deleting it (7 devices) — both exactly as
  SCENARIOS.md's "Fixed generator details" specifies. All three layouts pass `validateNetwork`.
- `tests/solo/model.test.mjs` — 17 cases: the three device/link counts, golden-fixture address
  reproduction, x-substitution, clone independence, wrong-gateway-is-valid, missing/duplicate ID,
  unknown port/device reference, single-router limit, cycle rejection, segment overlap,
  malformed IPv4, reserved host bit, and out-of-range `x`/`host`/`layoutId` inputs.

**Deferred, and documented as such:** the `label` parameter ('plain', the default, is the only
one actually exercised) — its three real display-name templates live in `reference/seed.mjs`,
which S03 was not scoped to read (S03's reading list is DATA_CONTRACTS.md, ENGINE_RULES.md, the
fixture, and SCENARIOS.md only) and is copied verbatim as `src/solo/seed.js` by a later task.
Anything other than `'plain'` currently applies a generic, clearly-provisional prefix; whoever
copies `seed.js` should replace `applyLabel` in `layouts.js` with the real templates rather than
leaving both. Layout coordinates (SCENARIOS.md's per-device x/y positions) are not part of the
Network state shape in ENGINE_RULES.md and are not implemented here — that's `diagram.js`'s job
once the topology view exists.

**Bug found and fixed while running S03's full-suite regression check (touches S02's
`store.js`):** `store.test.mjs`'s "keeps exactly one recovery record" case failed intermittently
when run alongside the other suites (not in isolation) — `replaceData`'s new recovery key
(an ISO timestamp) can collide with the previous one at millisecond resolution, and `writeMany`
was applying puts before deletes, so the fresh snapshot got written and then immediately deleted
by the same transaction. Fixed by reordering `writeMany` (both the real IndexedDB adapter and
the memory adapter) to delete before put. Verified with 5 consecutive full `npm run solo:test`
runs, all 42/42.

## What S04 added

- `src/solo/ip.js` — `parseIPv4`, `prefixFromMask`, `inSubnet`, exactly per ENGINE_RULES.md.
- `src/solo/forward.js` — `linkUsable` and the internal `layer2Reachable` frame search from
  reference/L2_PSEUDOCODE.md (queue + visited-set BFS over `{portId,tag}`, 256-visit
  `MODEL_LIMIT` guard, router-as-endpoint-only). `canReach`/`resolveName`/`testService` (the
  one-way IP pseudocode built on top of L2) are explicitly out of scope for S04's own task text
  and left for whichever later task adds them (ENGINE_RULES.md lists them as this file's other
  exports, but S04.md's "Execute in order" only asked for ip.js + linkUsable + layer2Reachable).
- Tests: `tests/solo/ip.test.mjs` (7 cases) and `tests/solo/l2.test.mjs` (11 cases) — the four
  acceptance fixtures (disconnected cable/P1, shutdown/P2, VLAN mismatch/V1, missing trunk
  VLAN/V2) plus linkUsable's power/adminUp/connected combinations, run against `layouts.js`'s
  real BR fixture rather than synthetic state.

## What S05 added

- `src/solo/forward.js` gains `canReach`, `resolveName`, `testService` (the one-way IP
  pseudocode from reference/L2_PSEUDOCODE.md, run both directions). Failure codes:
  `INVALID_ADDRESS`/`DUPLICATE_IP` (malformed or shared source/destination address),
  `LINK_DOWN` (the immediate local attachment of whichever endpoint initiates an L2 hop is
  down — covers P1/P2), `VLAN_PATH_BLOCKED` (a deeper L2/VLAN mismatch once the immediate link
  is fine — covers V1/V2), `GATEWAY_UNREACHABLE` (no on-subnet router owns the configured
  gateway — covers I2), `NO_ROUTE` (destination/route unknown), `RETURN_PATH_FAILED` (forward
  path fine, reverse path fails). `resolveName` requires round-trip reachability to the
  client's resolver first and wraps *any* transport failure as `DNS_UNREACHABLE` with the real
  reason kept in `details.transport` — this matters: a reverse-path break on the DNS server
  itself surfaces as `DNS_UNREACHABLE`, not `RETURN_PATH_FAILED`, exactly per ENGINE_RULES.md's
  "DNS tests wrap resolver transport failures." `testService` additionally requires the
  resolved address to belong to the one real `server`-kind device, else `WRONG_SERVICE`.
- `tests/solo/forward.test.mjs` (24 cases): every DATA_CONTRACTS.md/expected-cases.json fixture
  (healthy, P1, P2, I1, I2, V1, V2, D1, D2, alternate-valid-ip, protected-outage, P1+D1) applied
  to the BR layout via a `[collection, id-or-record-name, field, value]` patcher, asserting both
  clients' `testService` booleans; two cases added beyond the supplied fixture per S05.md's own
  instruction (server return-gateway failure, duplicate host address); plus targeted checks for
  exact codes, DNS case/trailing-dot handling, and WRONG_SERVICE on a reachable-but-wrong
  address.

## Next task: S06

Closes DAY2 (S04–S06: link/IP/VLAN/DNS evaluator and configuration actions). Read only
`the-field-solo-week/tasks/S06.md` and whatever contracts it names before starting — this is
most likely `src/solo/actions.js` (`applyAction`), per ENGINE_RULES.md's "Configuration actions"
and "Action envelope" sections, but confirm against the actual task file rather than assuming.

Next command: read `the-field-solo-week/tasks/S06.md`, then implement its files and run its
listed checks.
