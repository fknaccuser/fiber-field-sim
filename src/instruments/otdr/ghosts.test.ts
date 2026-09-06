import { describe, expect, it } from 'vitest';
import { trace } from './trace';
import { createEmptyWorld } from '../../world';
import type { ActiveProfileSet, WorldState } from '../../world';
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

function worldWithReflector(reflectanceDb: number): WorldState {
  const world = createEmptyWorld(20, activeProfiles);
  world.topology.nodes.push({ id: 'a', kind: 'terminal', label: 'A' }, { id: 'b', kind: 'terminal', label: 'B' });
  world.topology.spans.push({
    id: 'main',
    fromNodeId: 'a',
    toNodeId: 'b',
    lengthMeters: 3600,
    events: [{ id: 'refl', kind: 'connector-dirty', positionMeters: 700, lossDb: 1.0, reflectanceDb }],
  });
  return world;
}

const settings: OtdrSettings = {
  wavelengthNm: 1550,
  pulseWidthNs: 30,
  rangeMeters: 3000,
  iorSetting: profiles.network.iorDefault['1550']!,
  averagingSeconds: 180,
  launchCableMeters: 0,
  receiveCableMeters: 0,
};

describe('ghost derivation', () => {
  it('a strong (-20 dB) reflector at 700 m produces decreasing ghosts near 1400 m and 2100 m on a 3000 m range', () => {
    const world = worldWithReflector(-20);
    const result = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, settings);

    expect(result.hidden.ghosts.length).toBeGreaterThan(0);
    const edz = result.eventDeadZoneMeters;

    const ghost1400 = result.hidden.ghosts.find((g) => Math.abs(g.distanceMeters - 1400) <= edz);
    const ghost2100 = result.hidden.ghosts.find((g) => Math.abs(g.distanceMeters - 2100) <= edz);
    expect(ghost1400).toBeDefined();
    expect(ghost2100).toBeDefined();
    expect(ghost1400!.peakDb).toBeGreaterThan(ghost2100!.peakDb);

    const eventNear1400 = result.events.find((e) => e.kind === 'reflective' && Math.abs(e.distanceMeters - 1400) <= edz);
    const eventNear2100 = result.events.find((e) => e.kind === 'reflective' && Math.abs(e.distanceMeters - 2100) <= edz);
    expect(eventNear1400).toBeDefined();
    expect(eventNear2100).toBeDefined();
    expect(Math.abs(eventNear1400!.lossDb ?? 0)).toBeLessThan(0.1);
    expect(Math.abs(eventNear2100!.lossDb ?? 0)).toBeLessThan(0.1);
  });

  it('a weak (-55 dB) reflector produces no ghosts', () => {
    const world = worldWithReflector(-55);
    const result = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, settings);
    expect(result.hidden.ghosts.length).toBe(0);
  });
});
