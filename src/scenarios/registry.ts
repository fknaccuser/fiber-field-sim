/** Bundles every scenario YAML shipped under ./library and indexes it by id. */
import { loadScenarioYaml } from './loader';
import type { ScenarioDefinition } from './schema';

const rawModules = import.meta.glob('./library/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

let cachedIndex: Map<string, ScenarioDefinition> | null = null;

function index(): Map<string, ScenarioDefinition> {
  if (!cachedIndex) {
    cachedIndex = new Map();
    for (const text of Object.values(rawModules)) {
      const def = loadScenarioYaml(text);
      cachedIndex.set(def.id, def);
    }
  }
  return cachedIndex;
}

export interface ScenarioSummary {
  id: string;
  title: string;
  tier: number;
}

/** Every bundled scenario's id/title/tier, sorted by tier ascending (ties broken by id). */
export function listScenarios(): ScenarioSummary[] {
  return Array.from(index().values())
    .map((def) => ({ id: def.id, title: def.title, tier: def.tier }))
    .sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
}

export class ScenarioNotFoundError extends Error {
  readonly code = 'SCENARIO_NOT_FOUND';
  readonly id: string;
  constructor(id: string) {
    super(`No bundled scenario with id "${id}"`);
    this.name = 'ScenarioNotFoundError';
    this.id = id;
  }
}

export function getScenario(id: string): ScenarioDefinition {
  const def = index().get(id);
  if (!def) throw new ScenarioNotFoundError(id);
  return def;
}
