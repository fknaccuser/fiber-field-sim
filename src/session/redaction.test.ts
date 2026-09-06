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
    const forbidden = ['hidden.', 'appliedFaults', 'groundTruth'];
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
