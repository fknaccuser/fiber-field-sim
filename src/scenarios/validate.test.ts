import { describe, expect, it } from 'vitest';
import { getScenario } from './registry';
import { ScenarioDefinitionSchema } from './schema';
import type { ScenarioDefinition } from './schema';
import { validateScenario } from './validate';

const profiles = { network: 'xgs-pon-default', oltVendor: 'olt-calix-e7-2', switchVendor: 'switch-cisco-ios', hostShell: 'host-windows', equipment: 'hexatronic-commscope-default', otdrInstrument: 'otdr-exfo-maxtester-730c', region: 'ca-south-oc-digalert' };

function parse(def: unknown): ScenarioDefinition {
  return ScenarioDefinitionSchema.parse(def);
}

describe('6. a fault targeting a nonexistent span', () => {
  it('fails with E3/E4 and a message naming the fault id and span id', () => {
    const def = parse({
      id: 't1-bad-span-target',
      title: 'Bad span target',
      tier: 1,
      description: 'test',
      today: '2026-01-01',
      profiles,
      environment: { weather: 'clear', timeOfDay: 'day' },
      truckInventory: [],
      startLocationNodeId: 'n1',
      topology: { nodes: [{ id: 'n1', kind: 'fdh', label: 'N1' }], spans: [] },
      customerReports: [],
      faults: [{ instanceId: 'f-ghost-span', kind: 'fusion-splice-degraded', target: { type: 'fiber-span', spanId: 'sp-does-not-exist' }, params: { positionMeters: 10, lossDb: 0.2 } }],
      referenceSolution: { rationales: ['Cite the evidence supporting your conclusion.'], steps: [{ type: 'diagnosis', diagnosis: { claims: [], noFaultInScope: true } }] },
    });

    const issues = validateScenario(def);
    const codes = new Set(issues.map((i) => i.code));
    expect(codes.has('E3') || codes.has('E4')).toBe(true);
    const relevant = issues.filter((i) => i.code === 'E3' || i.code === 'E4');
    expect(relevant.some((i) => i.message.includes('f-ghost-span') && i.message.includes('sp-does-not-exist'))).toBe(true);
  });
});

describe('7. structural errors', () => {
  it('a splitter node missing splitRatio fails E5', () => {
    const def = parse({
      id: 't1-missing-split-ratio',
      title: 'Missing split ratio',
      tier: 1,
      description: 'test',
      today: '2026-01-01',
      profiles,
      environment: { weather: 'clear', timeOfDay: 'day' },
      truckInventory: [],
      startLocationNodeId: 'olt-1',
      topology: {
        nodes: [
          { id: 'olt-1', kind: 'olt', label: 'OLT' },
          { id: 'splitter-1', kind: 'splitter', label: 'Splitter' },
          { id: 'ont-1', kind: 'ont', label: 'ONT' },
        ],
        spans: [
          { id: 'sp-feeder', fromNodeId: 'olt-1', toNodeId: 'splitter-1', lengthMeters: 100, events: [] },
          { id: 'sp-drop', fromNodeId: 'splitter-1', toNodeId: 'ont-1', lengthMeters: 50, events: [] },
        ],
      },
      customerReports: [],
      referenceSolution: { rationales: ['Cite the evidence supporting your conclusion.'], steps: [{ type: 'diagnosis', diagnosis: { claims: [], noFaultInScope: true } }] },
    });
    expect(validateScenario(def).some((i) => i.code === 'E5')).toBe(true);
  });

  it('reversing a span so an ONT is unreachable from any OLT fails E6', () => {
    const def = parse({
      id: 't1-reversed-span',
      title: 'Reversed span',
      tier: 1,
      description: 'test',
      today: '2026-01-01',
      profiles,
      environment: { weather: 'clear', timeOfDay: 'day' },
      truckInventory: [],
      startLocationNodeId: 'olt-1',
      topology: {
        nodes: [
          { id: 'olt-1', kind: 'olt', label: 'OLT' },
          { id: 'ont-1', kind: 'ont', label: 'ONT' },
        ],
        // Reversed: the span leaves the ONT and arrives at the OLT, so nothing is
        // reachable from olt-1 along fromNodeId -> toNodeId.
        spans: [{ id: 'sp-drop', fromNodeId: 'ont-1', toNodeId: 'olt-1', lengthMeters: 50, events: [] }],
      },
      customerReports: [],
      referenceSolution: { rationales: ['Cite the evidence supporting your conclusion.'], steps: [{ type: 'diagnosis', diagnosis: { claims: [], noFaultInScope: true } }] },
    });
    expect(validateScenario(def).some((i) => i.code === 'E6')).toBe(true);
  });

  it('deleting a closure\'s splice map surfaces E7 (AmbiguousPathError)', () => {
    const build = (spliceMap: unknown[]) =>
      parse({
        id: 't1-splice-ambiguity',
        title: 'Splice ambiguity',
        tier: 1,
        description: 'test',
        today: '2026-01-01',
        profiles,
        environment: { weather: 'clear', timeOfDay: 'day' },
        truckInventory: [],
        startLocationNodeId: 'olt-1',
        topology: {
          nodes: [
            { id: 'olt-1', kind: 'olt', label: 'OLT' },
            { id: 'closure-1', kind: 'splice-closure', label: 'Closure', attributes: { spliceMap } },
            { id: 'ont-1', kind: 'ont', label: 'ONT' },
            { id: 'decoy-1', kind: 'terminal', label: 'Decoy' },
          ],
          spans: [
            { id: 'sp-feeder', fromNodeId: 'olt-1', toNodeId: 'closure-1', lengthMeters: 100, events: [] },
            { id: 'sp-out', fromNodeId: 'closure-1', toNodeId: 'ont-1', lengthMeters: 50, events: [] },
            { id: 'sp-decoy', fromNodeId: 'closure-1', toNodeId: 'decoy-1', lengthMeters: 50, events: [] },
          ],
        },
        customerReports: [],
        referenceSolution: { rationales: ['Cite the evidence supporting your conclusion.'], steps: [{ type: 'diagnosis', diagnosis: { claims: [], noFaultInScope: true } }] },
      });

    const withMap = build([{ fromSpanId: 'sp-feeder', toSpanId: 'sp-out' }]);
    expect(validateScenario(withMap).some((i) => i.code === 'E7')).toBe(false);

    const withoutMap = build([]);
    expect(validateScenario(withoutMap).some((i) => i.code === 'E7')).toBe(true);
  });

  it('a reference solution that skips the power-meter cl-7 step fails E11 with the achieved evidence score', () => {
    const t4 = getScenario('t4-wrong-roll-closure-7');
    const withoutPowerMeterAtClosure: ScenarioDefinition = {
      ...t4,
      referenceSolution: {
        ...t4.referenceSolution,
        steps: t4.referenceSolution.steps.filter((step) => !(step.type === 'power-meter' && step.nodeId === 'cl-7')),
        rationales: t4.referenceSolution.rationales.filter((_, i) => !(t4.referenceSolution.steps[i].type === 'power-meter' && 'nodeId' in t4.referenceSolution.steps[i] && t4.referenceSolution.steps[i].nodeId === 'cl-7')),
      },
    };
    const issues = validateScenario(withoutPowerMeterAtClosure);
    const e11 = issues.filter((i) => i.code === 'E11');
    expect(e11.length).toBeGreaterThan(0);
    expect(e11.some((i) => /evidenceQuality=(?!100)\d+/.test(i.message))).toBe(true);
  });
});

describe('8. warnings', () => {
  it('t1 (tier 1) does not produce W2', () => {
    const t1 = getScenario('t1-dark-ont-vista-court');
    expect(validateScenario(t1).some((i) => i.code === 'W2')).toBe(false);
  });

  it('t4 with the red-herring pool and the STP red herring both removed produces W2', () => {
    const t4 = getScenario('t4-wrong-roll-closure-7');
    const withoutRedHerrings: ScenarioDefinition = {
      ...t4,
      faults: t4.faults.filter((f) => !f.isRedHerring),
      redHerringPool: undefined,
    };
    expect(validateScenario(withoutRedHerrings).some((i) => i.code === 'W2')).toBe(true);
  });
});
