/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getScenario, instantiateScenario } from '../scenarios';
import { resolveProfileSet } from '../profiles';
import { perform, redactForUi, startSession } from './runner';

describe('4. redactForUi', () => {
  it('carries no appliedFaults, groundTruth, or hidden ground truth after a full reference run', () => {
    const def = getScenario('t4-wrong-roll-closure-7');
    const { world, meta } = instantiateScenario(def, 1);
    const profiles = resolveProfileSet(def.profiles);
    let state = startSession(world, profiles, meta);
    for (const step of meta.referenceSolution.steps) {
      state = perform(state, step).state;
    }

    const ui = redactForUi(state);
    const serialized = JSON.stringify(ui);
    expect(serialized).not.toContain('appliedFaults');
    expect(serialized).not.toContain('groundTruth');
    expect(serialized).not.toContain('"hidden"');
  });

  /**
   * The three greps above were not enough. `ScenarioMeta.referenceSolution.steps` ends in a
   * `diagnosis` intent carrying the correct claims, and `meta` used to be handed to the UI
   * whole -- so `ui.meta.referenceSolution` was the complete answer key, reachable from any
   * component, and `ui.meta.hints` handed over every hint without paying its score cost.
   * This asserts the shape rather than a spelling, so a future field carrying the answer
   * fails here too.
   */
  it('carries neither the reference solution nor the hint texts, at any point in a run', () => {
    const def = getScenario('t4-wrong-roll-closure-7');
    const { world, meta } = instantiateScenario(def, 1);
    const profiles = resolveProfileSet(def.profiles);
    const trueFault = world.appliedFaults.find((f) => !f.isRedHerring)!;
    let state = startSession(world, profiles, meta);

    // Check after every action, not just at the end: a leak that only exists mid-run counts.
    for (const step of [null, ...meta.referenceSolution.steps]) {
      if (step) state = perform(state, step).state;
      const ui = redactForUi(state);
      expect(ui.meta).not.toHaveProperty('referenceSolution');
      expect(ui.meta).not.toHaveProperty('hints');

      const serialized = JSON.stringify(ui.meta);
      expect(serialized).not.toContain(trueFault.kind);
      for (const hint of meta.hints) expect(serialized).not.toContain(hint);
    }
  });
});

describe('4. no rendered ui source file reads hidden ground truth', () => {
  // `ui/store/` is the one deliberate exception: `sessionStore.ts` holds a full,
  // unredacted `SessionState` privately (per its own design -- see its file header), and
  // `persistence.ts` computes competency-map statistics (matched/missed fault kinds,
  // domains) that genuinely require the true fault list. Neither ever hands that data to
  // a component; everything that actually renders (screens, field, otdr, meters,
  // terminal, components, app) must never reference it at all.
  const EXEMPT_DIRS = new Set(['store']);

  it('src/ui/** (outside store/) never references hidden., appliedFaults, or groundTruth', () => {
    const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');
    // `referenceSolution` is the answer key in a different costume: its last step is the
    // correct diagnosis. Rendered UI reads `teachingSteps` (a redaction-safe projection)
    // or the post-session `ScoreReport.debrief` instead.
    const forbidden = ['hidden.', 'appliedFaults', 'groundTruth', 'referenceSolution'];
    const offenders: string[] = [];

    function walk(dir: string, topLevel: boolean): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (topLevel && entry.isDirectory() && EXEMPT_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, false);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        for (const term of forbidden) {
          if (text.includes(term)) offenders.push(`${path.relative(uiRoot, full)}: contains "${term}"`);
        }
      }
    }

    if (fs.existsSync(uiRoot)) walk(uiRoot, true);
    expect(offenders).toEqual([]);
  });
});
