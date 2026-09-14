# Network workspace

The current entry point is `src/solo/main.js`. The opening terminal sequence is
preserved. Training and network design share original shaded SVG equipment,
a navy/cyan palette, a zoomable canvas, and contextual controls.

## Training

The network occupies the main workspace. Inspect, Configure, and Console share
one device inspector; Findings holds evidence and completion notes. Mobile uses
Network, Device, and Findings tabs with a portrait topology. Test results also
appear immediately beneath the test controls.

Guidance follows recorded inspection, test, and change events. It begins expanded,
becomes optional coaching after three completed repairs, and defaults to collapsed
after eight repairs with at least four independently resolved fault causes. Help
remains available at every level. Configuration exercises do not establish repair
mastery. Existing training generation, simulation, persistence, and scoring are
unchanged.

## Network Studio

Choose **Design a network** from the home screen. Start empty or load the
32-device, six-site campus example. Add equipment from the palette, connect two
devices, drag equipment or move it with arrow keys, and edit names and address
annotations in the inspector. Use **Apply details** to save text edits.

Sites can be collapsed for an overview; expanding restores their equipment and
internal links. Removing a site ungroups its members. Pan, zoom, Fit, and Labels
control canvas density. Undo/redo covers edits, deletion, and replacing a design.
The design saves locally and supports validated JSON import/export.

Design limits are 200 devices, 600 links, and 40 sites. Studio is a topology and
annotation editor; it does not simulate multi-router routing or score custom
networks. The existing scored training engine retains its seven-device,
single-router constraints. Studio's separate schema and storage keep large custom
designs outside those simulation invariants.

## Validation

- `npm run solo:test`: 255 tests passed, including design validation, deletion,
  site collapse, and progression thresholds.
- `npm run build`: production bundle and PWA precache generated successfully.
- `npm run lint`: passed with existing repository warnings.
- Interactive browser checks: completed a real repair and evidence submission;
  added, renamed, connected, moved, deleted, undid, and restored saved designs;
  verified site collapse and desktop/mobile layouts down to 320 px.
- Browser test selectors were updated for the new canvas and inspector. The
  Playwright runner suite was not executed; UI checks used the interactive browser.
