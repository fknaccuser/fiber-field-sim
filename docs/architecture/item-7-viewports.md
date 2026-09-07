# Item 7 — Viewport architecture, 3D topology map, procedural fiber scope

Status: implemented on the `fiber-sim-viewports` copy. Items 1–6 unchanged except for one
additive session-layer change (the `scope` action now logs the instrument's zone counts).

This document answers three questions: how the field screen swaps heavy visualizations
without leaks or stutter, how the 3D map reads the existing store, and how a connector
end-face is generated procedurally. Every rule below is enforced by code or tests that
already exist; file paths are given so nothing here has to be taken on faith.

---

## 0. One correction to the premise

The prompt assumed a Zustand store holding "fault nodes" that the 3D map could highlight.
This codebase deliberately has neither:

- State is a `useReducer` + context store (`src/ui/store/sessionStore.tsx`) that holds the
  real `SessionState` privately and hands components a **redacted** `UiSessionState`.
- The answer key (`WorldState.appliedFaults`, `ActionEvent.groundTruth`,
  `OtdrTraceResult.hidden`) never reaches `src/ui/**`. `src/session/redaction.test.ts`
  greps every rendered UI file for those identifiers and fails the build if one appears.

So the map cannot "highlight the faulty splitter" — that would print the answer key on a
training tool. It highlights **what the trainee has observed and what the trainee claims**
(section 2). That is the honest version of the feature and it is what was built.

---

## 1. Viewport architecture

### Layout

```
FieldSession
├─ LocationBar                     (always mounted; location, clock, budget, toast)
└─ InstrumentDock                  src/ui/field/InstrumentDock.tsx
   └─ ViewportHost<TabId>          src/ui/viewport/ViewportHost.tsx
      ├─ stage  (position:relative, flex:1, minHeight:0)
      │    one <div position:absolute inset:0> per viewport, see policy below
      └─ tab strip (bottom bezel)
```

`InstrumentDock` is now a *declaration*: an array of `{ id, label, policy, render }`.
Adding a viewport is one array entry. The host owns nothing about the tools themselves.

### Mount policy: `display:none` vs conditional rendering — use both, by weight

| Viewport | Policy | Why |
|---|---|---|
| Map (R3F/WebGL) | `unmount` | A WebGL context, its buffers, and a render loop must be *destroyed*, not parked. `display:none` keeps the GPU context alive and the frame loop scheduled. R3F disposes on Canvas unmount (`THREE.WebGLRenderer: Context Lost` in the console is that disposal). |
| OTDR (2D canvas + trace) | `unmount` | Large sample arrays and a canvas backing store; cheap to rebuild from the blob already in the session. |
| Scope (2D canvas) | `unmount` | Same reasoning, smaller. |
| Power, VFL, Terminal, Phone, Records, Diagnose, Excavate | `keep-alive` | Plain DOM with live inputs. Keeping them mounted (`hidden` attribute ⇒ `display:none`) preserves scroll position, focus, and half-typed commands at ~zero cost. They mount lazily on first activation and stay. |

Rules the host enforces (`ViewportHost.tsx`):
- `unmount` viewports render only while active.
- `keep-alive` viewports render after their first activation and are toggled with the
  `hidden` attribute thereafter.
- Every viewport lives in an absolutely-positioned box over the same stage, so switching
  never reflows the location bar or the tab strip (no layout thrash ⇒ no stutter).

### Where a heavy viewport's *state* lives when it is unmounted

`src/ui/viewport/viewportStore.ts` — a UI-only module store built on
`useSyncExternalStore`. `useViewportState(key, initial)` has the `useState` signature, but
the value survives the component. What is stored:

- `map.camera` — OrbitControls position/target, written on `onEnd`, read as the initial
  camera on remount (verified: orbit → Scope → Map returns to the same pose).
- `map.selected` — selected node id.
- `otdr.settings / otdr.access / otdr.cursors / otdr.activeCursor / otdr.viewport` —
  everything the OTDR panel used to lose on a tab switch.
- `scope.selected / scope.zones` — connector under the scope, zone-overlay toggle.
- `diagnose.claims / diagnose.prefill / dock.tab` — draft claims used to be local state
  and vanished when you looked at the OTDR mid-diagnosis; now they persist, and the map can
  read them.

`FieldSession` calls `clearViewportState()` before starting or restoring a session, so
nothing leaks across scenarios. This store never holds session data — the session store is
still the only owner of `SessionState`.

### Heavy code, not just heavy DOM

`InstrumentDock` loads the map with `React.lazy` + `Suspense`. Vite emits it as its own
chunk (`MapViewport-*.js`, 931 kB with three/R3F/drei) and the main bundle stays at 720 kB
— the same size as before this item. The PWA precaches both, so it still works offline.

### Frame loop discipline

- `frameloop="demand"`: the map renders only on interaction or state change; an idle map
  costs nothing.
- `KickFirstFrame` inside the Canvas requests exactly one frame after mount so a remounted
  map is never blank while idle.
- `dpr={[1, 1.5]}` and `powerPreference: 'low-power'` — this is a phone tool.

---

## 2. Connecting the 3D scene to the existing state

### Data flow

```
UiSessionState (redacted)  ─┐
                            ├─▶ buildMapOverlay()  ─▶  { nodes: {id: marks[]}, spans: {id: marks[]} }
draft claims (viewportStore)┘        pure, tested                       │
                                                                        ▼
topology.nodes/spans ─▶ layoutTopology() ─▶ positions ─▶ <TopologyMap>  meshes + <Line>s
                        pure, tested
```

- `src/ui/map/topologyLayout.ts` — nodes have no coordinates, so a tidy-tree layout is
  derived from the span graph (`fromNodeId` = upstream parent). Leaves take slots along x,
  parents center over children, depth maps to z. Off-plant nodes (yard, POP) sit on their
  own row at depth −1. Cycle-safe, deterministic, verified against all three reference
  scenarios.
- `src/ui/map/mapOverlay.ts` — the only "highlight" source. Marks and their origin:

  | Mark | Comes from |
  |---|---|
  | `current` | `ui.locationNodeId` |
  | `visited` | start location, every `truck-roll` |
  | `tested` | OTDR `pathSpanIds`, power-meter node, VFL span, scope span, CLI device node |
  | `alarm` | power meter read `null`; VFL found leaks; scope graded `fail`; CLI observed an ONT not `online` or a transceiver with no Rx |
  | `claimed` | targets of draft claims and of every submitted diagnosis |

  Priority when a thing has several: `claimed > alarm > current > tested > visited`.
  A test asserts the serialized overlay never contains the substring `fault`.

### The conceptual example (as actually written)

```tsx
// src/ui/map/TopologyMap.tsx (abridged)
const layout  = useMemo(() => layoutTopology(ui.world.topology.nodes, ui.world.topology.spans), [...]);
const [draftClaims] = useViewportState<DiagnosisClaim[]>('diagnose.claims', []);
const overlay = useMemo(() => buildMapOverlay(ui, draftClaims), [ui, draftClaims]);

{layout.nodes.map((n) => (
  <NodeMesh key={n.id} node={n} mark={dominantNodeMark(overlay.nodes[n.id])} … />
))}

function NodeMesh({ node, mark }) {
  const color    = mark && mark !== 'visited' ? MARK_COLOR[mark] : KIND_COLOR[node.kind];
  const emissive = mark === 'current' || mark === 'alarm' || mark === 'claimed' ? MARK_COLOR[mark] : '#000';
  return (
    <group position={[node.x, node.y + 0.3, node.z]}>
      <mesh onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}>
        <NodeShape kind={node.kind} />                 {/* box / octahedron / capsule / cone by kind */}
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.55} />
      </mesh>
      {mark === 'current' && <mesh rotation={[-Math.PI/2,0,0]}><ringGeometry …/></mesh>}
      <Html center distanceFactor={14}>{node.label}</Html>   {/* DOM label: no font fetch, works offline */}
    </group>
  );
}
```

Spans are drei `<Line>`s colored by `dominantSpanMark`; a *claimed* span is dashed so the
trainee's hypothesis reads differently from a measured alarm.

### Interaction back into the session

Tapping a node opens a card; "Roll truck here" dispatches the ordinary
`{ type: 'truck-roll', toNodeId }` intent through the existing `store.dispatch`. The map
is just another instrument: it never mutates anything, it only dispatches intents.

### Why this cannot leak

The map's inputs are `UiSessionState` (already redacted) and the trainee's own claims. There
is no third input. The redaction grep test covers `src/ui/map/**` like every other UI dir.

---

## 3. The fiber-scope engine

### Two layers: a pure model, then a dumb renderer

`src/ui/scope/endFaceModel.ts` → `buildEndFaceModel({ seed, spanId, eventId, grade, zones })`

- Zones are IEC 61300-3-35 single-mode radii: A core 0–25 µm, B cladding 25–120 µm,
  C adhesive 120–130 µm, D contact 130–250 µm.
- The instrument already reports **per-zone defect counts** (`inspect()` in
  `src/instruments/inspectionScope`). The `scope` action now logs them (the one session
  change in this item), so the picture is reproducible from the persisted log.
- For each zone the model places exactly the reported number of *counted* defects inside
  that annulus: ~30 % scratches (thin, slightly curved lines) and ~70 % particles, core
  defects drawn larger. A face that failed with ≥3 core defects also gets one *oil film*
  (an irregular 12-lobe blob, low alpha) and every face gets 0–3 sub-threshold dust specks
  in the contact zone so "clean" still looks photographed, not vector-drawn.
- Randomness is `createRng(deriveSeed(seed, 'scope-endface', spanId, eventId))` — the same
  mulberry32 stream the physics uses — so the same connector always looks the same, a
  re-inspection shows the same dirt, and two connectors never share a picture.
- Tests (`endFaceModel.test.ts`): deterministic; per-zone counted defects equal the
  reported counts and each lies inside its zone; a pass has nothing in core/cladding and no
  oil; a heavy core failure gets exactly one oil film.

`src/ui/scope/EndFaceCanvas.tsx` — HTML5 Canvas 2D, DPR-aware, redraws only when the
model or the overlay toggle changes:

1. Dark-field background (radial gradient) and the ferrule/contact disc.
2. Cladding disc with an off-center radial gradient (the slight sheen a real scope shows),
   then the core as a small lighter dot with a dark rim.
3. Defects: particles are radial-gradient specks with a soft halo; scratches are a dark
   under-stroke plus a 1 px bright stroke along a quadratic curve; oil is the lobed
   polygon at ~0.25 alpha with a brighter rim.
4. Optional zone overlay: dashed A/B/C/D circles in the trace-blue accent.

`src/ui/meters/Scope.tsx` composes them: connector chips → end-face → PASS/FAIL stamp →
zone table with **Found vs Pass limit** columns (core: none; cladding: few small; adhesive:
not graded; contact: small tolerated) → a one-line reading guide ("bright specks are
particles, thin lines are scratches, a soft haze is oil…"). This is the "what does
passable look like" teaching surface the product asked for.

### Why Canvas rather than CSS/shaders

- CSS: dozens of positioned pseudo-elements per face, no soft edges without filters, and
  filters are the slow path on phones.
- A fragment shader would be the most photographic option, but it needs the WebGL context
  we are deliberately tearing down when the scope is not on screen, and it is the one
  approach that cannot be unit-tested in Node. The model/renderer split keeps every
  decision about *what* is on the face testable; only pixels are untested.

---

## Verification performed

- `tsc -b` clean; `vitest`: 43 files / 242 tests (13 new) including the redaction grep.
- `npm run build`: main chunk 720 kB, map chunk 931 kB (lazy), PWA precache OK.
- Browser (t1, seed 1): map renders the OLT→FDH→splitter→NAP→ONT tree with the current
  location ringed; node tap → card → "Roll truck here" moves the truck and re-marks the
  map; orbit → Scope → Map restores the camera pose; Scope → Inspect renders a PASS face
  with zone rings and a zeroed zone table.

## Follow-ups (not done)

- A React error boundary around each viewport so one crashing tool cannot unmount the dock.
- Frustum-fit the camera to the layout on first open for very wide plants (t5).
- Label decluttering (hide leaf labels beyond a camera distance).
- A `fail` end-face needs a scenario with a `connector-dirty` event to be seen in the UI;
  the model is covered by tests today.
