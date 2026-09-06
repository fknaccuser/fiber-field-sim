import { describe, expect, it } from 'vitest';
import { trace } from './trace';
import { bidirectionalAverage } from './bidirectional';
import { createEmptyWorld } from '../../world';
import type { ActiveProfileSet } from '../../world';
import { loadDefaultProfileSet } from '../../profiles';
import type { OtdrSettings } from './types';

const profiles = loadDefaultProfileSet();
const activeProfiles: ActiveProfileSet = {
  network: 'xgs-pon-default',
  oltVendor: 'olt-calix-e7-2',
  switchVendor: 'switch-cisco-ios',
  equipment: 'hexatronic-commscope-default',
  otdrInstrument: 'otdr-exfo-maxtester-730c',
  hostShell: 'host-windows',
  region: 'ca-south-oc-digalert',
};

describe('bidirectionalAverage', () => {
  it('resolves a mismatched-fiber-splice gainer to its true loss', () => {
    const world = createEmptyWorld(30, activeProfiles);
    world.topology.nodes.push({ id: 'a', kind: 'terminal', label: 'A' }, { id: 'b', kind: 'terminal', label: 'B' });
    world.topology.spans.push({
      id: 'main',
      fromNodeId: 'a',
      toNodeId: 'b',
      lengthMeters: 2000,
      events: [{ id: 'gainer', kind: 'mismatched-fiber-splice', positionMeters: 1000, lossDb: -0.3, trueLossDb: 0.05 }],
    });

    const settings: OtdrSettings = {
      wavelengthNm: 1550,
      pulseWidthNs: 100,
      rangeMeters: 2500,
      iorSetting: profiles.network.iorDefault['1550']!,
      averagingSeconds: 60,
      launchCableMeters: 0,
      receiveCableMeters: 0,
    };

    const ab = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, settings);
    const ba = trace(world, profiles, { accessNodeId: 'b', launchSpanId: 'main' }, settings);

    const results = bidirectionalAverage(ab, ba);
    const gainerResult = results.find((r) => Math.abs(r.distanceFromAMeters - 1000) < 50)!;
    expect(gainerResult).toBeDefined();
    expect(gainerResult.matched).toBe(true);
    // Measured values carry simulated instrument noise (seeded, but not hand-tuned to
    // land within an arbitrarily tight band) -- assert the physically meaningful facts:
    // A->B reads as an apparent gain, B->A reads as elevated loss, and averaging the two
    // recovers something close to the true splice loss rather than either raw reading.
    expect(gainerResult.lossAbDb).toBeLessThan(0);
    expect(gainerResult.lossBaDb).toBeGreaterThan(0.2);
    expect(gainerResult.averagedLossDb).toBeGreaterThan(-0.1);
    expect(gainerResult.averagedLossDb).toBeLessThan(0.2);
    expect(Math.abs(gainerResult.averagedLossDb - 0.05)).toBeLessThan(Math.abs(gainerResult.lossAbDb - 0.05));
  });
});
