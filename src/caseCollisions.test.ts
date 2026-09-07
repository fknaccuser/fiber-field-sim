/**
 * A guard earned the hard way.
 *
 * This project is developed on Windows, where the filesystem is case-insensitive but
 * TypeScript's module resolution is not. Two files in one directory whose names differ
 * only by case — `Blueprint.tsx` beside `blueprint.ts` — cannot both exist cleanly: the
 * build dies with TS1149/TS1261, and on a case-sensitive CI box it fails differently
 * again. It happened three times in this codebase (`HeldDevice`/`heldDevice`,
 * `ToolShelf`/`toolShelf`, `Blueprint`/`blueprint`), each time costing a debugging cycle.
 *
 * The convention that avoids it: a component is `Thing.tsx`, and its pure companion
 * module gets its own noun — `deviceState.ts`, `shelfState.ts`, `sheet.ts` — never
 * `thing.ts`.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function collisionsIn(dir: string): string[] {
  const found: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  const seen = new Map<string, string>();
  for (const e of entries) {
    // Compare the stem, not the full name: `x.ts` and `X.tsx` collide as modules even
    // though the full filenames differ, because `import './x'` resolves either one.
    const stem = e.name.replace(/\.(ts|tsx|js|jsx|css)$/, '').toLowerCase();
    const key = e.isDirectory() ? `dir:${e.name.toLowerCase()}` : `mod:${stem}`;
    const prior = seen.get(key);
    if (prior && prior !== e.name) found.push(`${dir}: "${prior}" vs "${e.name}"`);
    else seen.set(key, e.name);
  }

  for (const e of entries) if (e.isDirectory()) found.push(...collisionsIn(join(dir, e.name)));
  return found;
}

describe('filenames', () => {
  it('never differ only by case within a directory', () => {
    expect(collisionsIn(ROOT)).toEqual([]);
  });
});
