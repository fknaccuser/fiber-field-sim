import { describe, expect, it } from 'vitest';
import { listScenarios } from './registry';
import { loadScenarioYaml } from './loader';
import { ScenarioDefinitionSchema } from './schema';

describe('1. schema parses every bundled scenario', () => {
  it('each bundled scenario YAML parses through ScenarioDefinitionSchema', () => {
    for (const { id } of listScenarios()) {
      expect(() => loadScenarioYaml(requireRawScenario(id))).not.toThrow();
    }
  });

  it('a definition missing referenceSolution fails with a path pointing at it', () => {
    const minimal = {
      id: 't1-missing-reference-solution',
      title: 'Missing reference solution',
      tier: 1,
      description: 'test',
      today: '2026-01-01',
      profiles: { network: 'n', oltVendor: 'o', switchVendor: 's', hostShell: 'h', equipment: 'e', otdrInstrument: 'i', region: 'r' },
      environment: { weather: 'clear', timeOfDay: 'day' },
      truckInventory: [],
      startLocationNodeId: 'n1',
      topology: { nodes: [], spans: [] },
      customerReports: [],
      // referenceSolution intentionally omitted
    };
    const result = ScenarioDefinitionSchema.safeParse(minimal);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('referenceSolution'))).toBe(true);
    }
  });
});

// Re-reads a bundled scenario's raw YAML text by id, via the same glob the registry uses,
// so this test exercises the real parse path rather than re-deriving fixtures by hand.
function requireRawScenario(id: string): string {
  const modules = import.meta.glob('./library/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  for (const [path, text] of Object.entries(modules)) {
    if (path.includes(id)) return text;
  }
  throw new Error(`No bundled YAML found for scenario id "${id}"`);
}
