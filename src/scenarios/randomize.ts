/**
 * Resolves every per-seed random choice a scenario definition declares -- span lengths,
 * fault parameter ranges/choices, the red-herring pool pick, and customer-report
 * phrasing -- into concrete values. Kept separate from `loader.ts` so the "what varies
 * per seed" logic can be tested (and reasoned about) without building a whole WorldState.
 */
import { createRng, deriveSeed } from '../world';
import type { FaultInstance } from '../world';
import type { ScenarioDefinition, ScenarioFaultInstance } from './schema';

export interface ResolvedScenario {
  /** spanId -> resolved lengthMeters (only spans with `randomize.lengthMeters` are randomized; others keep their authored length). */
  spanLengths: Map<string, number>;
  /** Ids of fiber events clamped to their span's resolved length (informational, W4). */
  clampedEventIds: string[];
  /** Authored faults in file order, with `randomize` resolved and stripped. */
  faults: FaultInstance[];
  /** Faults picked from `redHerringPool`, each with `isRedHerring: true`. */
  redHerrings: FaultInstance[];
  /** customerId -> the chosen wording (either `reportedSymptom` itself or one of `phrasingVariants`). */
  customerSymptoms: Map<string, string>;
}

function scenarioRng(seed: number, scenarioId: string, label: string) {
  return createRng(deriveSeed(seed, 'scenario', scenarioId, label));
}

function resolveParam(rng: ReturnType<typeof createRng>, spec: { min: number; max: number } | unknown[]): unknown {
  if (Array.isArray(spec)) return rng.pick(spec);
  const { min, max } = spec;
  const raw = min + rng.next() * (max - min);
  // Integer-valued ranges (both bounds whole numbers) round to an integer; otherwise 2 decimals.
  if (Number.isInteger(min) && Number.isInteger(max)) return Math.round(raw);
  return Math.round(raw * 100) / 100;
}

function resolveFaultParams(seed: number, scenarioId: string, fault: ScenarioFaultInstance): FaultInstance {
  const params = { ...fault.params };
  if (fault.randomize) {
    for (const [key, spec] of Object.entries(fault.randomize)) {
      const paramRng = scenarioRng(seed, scenarioId, `fault:${fault.instanceId}:${key}`);
      params[key] = resolveParam(paramRng, spec as { min: number; max: number } | unknown[]);
    }
  }
  const { randomize: _randomize, ...rest } = fault;
  return { ...rest, params };
}

function pickWithoutReplacement<T>(rng: ReturnType<typeof createRng>, items: readonly T[], n: number): T[] {
  const pool = [...items];
  const result: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = rng.int(0, pool.length - 1);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}

export function resolveRandomization(def: ScenarioDefinition, seed: number): ResolvedScenario {
  const spanLengths = new Map<string, number>();
  const clampedEventIds: string[] = [];

  for (const span of def.topology.spans) {
    const range = span.randomize?.lengthMeters;
    const resolvedLength = range ? Math.round(range.min + scenarioRng(seed, def.id, `span:${span.id}`).next() * (range.max - range.min)) : span.lengthMeters;
    spanLengths.set(span.id, resolvedLength);
    for (const event of span.events) {
      if (event.positionMeters > resolvedLength) clampedEventIds.push(event.id);
    }
  }

  const faults = def.faults.map((fault) => resolveFaultParams(seed, def.id, fault));

  const redHerrings: FaultInstance[] = [];
  if (def.redHerringPool && def.redHerringPool.pick > 0) {
    const poolRng = scenarioRng(seed, def.id, 'red-herrings');
    const chosen = pickWithoutReplacement(poolRng, def.redHerringPool.from, def.redHerringPool.pick);
    for (const fault of chosen) {
      const resolved = resolveFaultParams(seed, def.id, fault);
      redHerrings.push({ ...resolved, isRedHerring: true });
    }
  }

  const customerSymptoms = new Map<string, string>();
  for (const report of def.customerReports) {
    const choices = [report.reportedSymptom, ...(report.phrasingVariants ?? [])];
    customerSymptoms.set(report.customerId, scenarioRng(seed, def.id, `report:${report.customerId}`).pick(choices));
  }

  return { spanLengths, clampedEventIds, faults, redHerrings, customerSymptoms };
}
