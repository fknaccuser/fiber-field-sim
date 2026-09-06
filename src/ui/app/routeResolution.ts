/** Pure route-parameter resolution for `/run/:scenarioId?seed=N`, kept separate from the routed component so it's testable without rendering anything. */
export interface RunRouteParams {
  scenarioId: string;
  seed: number;
}

export type RunRouteResolution = { ok: true; params: RunRouteParams } | { ok: false; error: string };

export function resolveRunRoute(scenarioId: string | undefined, seedParam: string | null, scenarioExists: (id: string) => boolean): RunRouteResolution {
  if (!scenarioId) return { ok: false, error: 'No scenario specified.' };
  if (!scenarioExists(scenarioId)) return { ok: false, error: `Unknown scenario "${scenarioId}".` };

  if (seedParam === null) {
    return { ok: true, params: { scenarioId, seed: 1 + Math.floor(Math.random() * 999_999) } };
  }
  const seed = Number(seedParam);
  if (!Number.isInteger(seed) || seed < 1) return { ok: false, error: `Invalid seed "${seedParam}".` };
  return { ok: true, params: { scenarioId, seed } };
}
