import { describe, expect, it } from 'vitest';
import { getScenario, instantiateScenario } from '../../scenarios';
import { resolveProfileSet } from '../../profiles';
import { perform, redactForUi, startSession } from '../../session/runner';
import { buildMapOverlay, dominantNodeMark, dominantSpanMark } from './mapOverlay';

function t1Session() {
  const def = getScenario('t1-dark-ont-vista-court');
  const { world, meta } = instantiateScenario(def, 1);
  return startSession(world, resolveProfileSet(def.profiles), meta);
}

describe('buildMapOverlay', () => {
  it('marks only the start location before anything happens', () => {
    const ui = redactForUi(t1Session());
    const overlay = buildMapOverlay(ui, []);
    expect(overlay.nodes[ui.locationNodeId]).toEqual(expect.arrayContaining(['visited', 'current']));
    expect(Object.keys(overlay.spans)).toHaveLength(0);
  });

  it('reflects what the trainee observed: a failed scope is an alarm, a passed one is tested', () => {
    let s = t1Session();
    const drop = s.world.topology.spans.find((sp) => sp.toNodeId === s.locationNodeId || sp.fromNodeId === s.locationNodeId)!;
    const connector = drop.events.find((e) => e.kind.startsWith('connector'))!;
    s = perform(s, { type: 'scope', spanId: drop.id, eventId: connector.id }).state;
    const ui = redactForUi(s);
    const last = ui.log[ui.log.length - 1];
    const overlay = buildMapOverlay(ui, []);
    expect(dominantSpanMark(overlay.spans[drop.id])).toBe(last.type === 'scope' && last.grade === 'fail' ? 'alarm' : 'tested');
  });

  it('shows draft and submitted claims, and claims outrank everything else', () => {
    const ui = redactForUi(t1Session());
    const overlay = buildMapOverlay(ui, [{ faultKind: 'ont-unpowered', target: { type: 'site', nodeId: ui.locationNodeId }, evidenceActionIds: [] }]);
    expect(dominantNodeMark(overlay.nodes[ui.locationNodeId])).toBe('claimed');
  });

  it('never carries anything that is not derivable from the log or the claims', () => {
    const ui = redactForUi(t1Session());
    const serialized = JSON.stringify(buildMapOverlay(ui, []));
    expect(serialized).not.toContain('fault');
  });
});
