import { describe, expect, it } from 'vitest';
import { getScenario, instantiateScenario } from '../scenarios';
import { resolveProfileSet } from '../profiles';
import { perform, startSession } from './runner';
import type { ScenarioMeta, SessionState } from './types';

/** A scenario with connectors to look at, and every connector on it. */
function bench(readiness?: ScenarioMeta['readiness']) {
  const def = getScenario('t4-wrong-roll-closure-7');
  const { world, meta } = instantiateScenario(def, 1);
  const connectors: Array<{ spanId: string; eventId: string }> = [];
  for (const span of world.topology.spans) {
    for (const ev of span.events) {
      if (ev.kind === 'connector-upc' || ev.kind === 'connector-apc' || ev.kind === 'connector-dirty') {
        connectors.push({ spanId: span.id, eventId: ev.id });
      }
    }
  }
  const state = startSession(world, resolveProfileSet(def.profiles), readiness ? { ...meta, readiness } : meta);
  return { state, connectors };
}

const DIRTY: ScenarioMeta['readiness'] = {
  fault: 'dirty-scope-tip',
  removes: [],
  headline: 'The scope tip is filthy.',
  coaching: null,
};

/** You have to be standing at the connector to look at it, so roll there first. */
function scope(state: SessionState, c: { spanId: string; eventId: string }) {
  const span = state.world.topology.spans.find((s) => s.id === c.spanId)!;
  const at = perform(state, { type: 'truck-roll', toNodeId: span.fromNodeId }).state;
  const { state: next, result } = perform(at, { type: 'scope', spanId: c.spanId, eventId: c.eventId });
  if (result.type !== 'scope') throw new Error(`expected a scope reading, got ${result.type}: ${JSON.stringify(result)}`);
  return { state: next, grade: result.grade, zones: result.zones };
}

describe('a contaminated probe tip', () => {
  it('follows the morning into the field', () => {
    expect(bench(DIRTY).state.probeTipDirty).toBe(true);
    expect(bench().state.probeTipDirty).toBe(false);
  });

  it('condemns every connector, including the ones that are fine', () => {
    const { state, connectors } = bench(DIRTY);
    expect(connectors.length).toBeGreaterThan(1);
    for (const c of connectors) expect(scope(state, c).grade).toBe('fail');
  });

  it('prints the SAME debris on every endface — which is the tell', () => {
    // Clean tip: two different connectors can read differently.
    const clean = bench();
    const dirty = bench(DIRTY);

    // The difference a dirty tip makes is a constant, identical for every connector it sees.
    const deltas = clean.connectors.map((c) => {
      const a = scope(clean.state, c).zones;
      const b = scope(dirty.state, c).zones;
      return `${b.core - a.core}/${b.cladding - a.cladding}/${b.adhesive - a.adhesive}/${b.contact - a.contact}`;
    });
    expect(new Set(deltas).size).toBe(1);
  });

  it('clears when you clean it, and the readings go back to the truth', () => {
    const { state, connectors } = bench(DIRTY);
    const c = connectors[0];
    const before = scope(state, c);

    const { state: cleaned, result } = perform(state, { type: 'clean-probe' });
    expect(result).toMatchObject({ type: 'clean-probe', cleaned: true });
    expect(cleaned.probeTipDirty).toBe(false);
    expect(cleaned.clockSeconds).toBeGreaterThan(state.clockSeconds);

    const after = scope(cleaned, c);
    expect(after.zones.contact).toBeLessThan(before.zones.contact);
    expect(scope(bench().state, c).zones).toEqual(after.zones);
  });
});

describe('cleaning the tip', () => {
  it('is refused with no cleaning kit on the truck — the two bad mornings compound', () => {
    const def = getScenario('t4-wrong-roll-closure-7');
    const { world, meta } = instantiateScenario(def, 1);
    const stripped = { ...world, truckInventory: world.truckInventory.filter((i) => i !== 'cleaning-kit') };
    const state = startSession(stripped, resolveProfileSet(def.profiles), { ...meta, readiness: DIRTY });

    const { state: after, result } = perform(state, { type: 'clean-probe' });
    expect(result).toMatchObject({ type: 'clean-probe', cleaned: false });
    expect(after.probeTipDirty).toBe(true);
  });

  it('says so rather than silently costing you time when the tip is already clean', () => {
    const { state } = bench();
    const { result } = perform(state, { type: 'clean-probe' });
    expect(result).toMatchObject({ type: 'clean-probe', cleaned: false, reason: 'The tip is already clean.' });
  });

  it('is written into the log, so the debrief can see you did it', () => {
    const { state } = bench(DIRTY);
    const after = perform(state, { type: 'clean-probe' }).state;
    expect(after.log.at(-1)).toMatchObject({ type: 'clean-probe', cleaned: true });
  });
});
