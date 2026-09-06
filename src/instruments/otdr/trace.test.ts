import { describe, expect, it } from 'vitest';
import { trace } from './trace';
import { OtdrSettingsError } from './errors';
import { eventDeadZoneMeters } from './physics';
import type { OtdrSettings } from './types';
import { applyFault, createEmptyWorld } from '../../world';
import type { ActiveProfileSet, WorldState } from '../../world';
import { loadDefaultProfileSet } from '../../profiles';

const profiles = loadDefaultProfileSet();
const activeProfiles: ActiveProfileSet = {
  network: 'xgs-pon-default',
  oltVendor: 'olt-calix-e7-2',
  switchVendor: 'switch-cisco-ios',
  equipment: 'hexatronic-commscope-default',
  otdrInstrument: 'otdr-exfo-maxtester-730c',
  region: 'ca-south-oc-digalert',
};

function baseSettings(overrides: Partial<OtdrSettings> = {}): OtdrSettings {
  return {
    wavelengthNm: 1550,
    pulseWidthNs: 100,
    rangeMeters: 3000,
    iorSetting: profiles.network.iorDefault['1550']!,
    averagingSeconds: 30,
    launchCableMeters: 0,
    receiveCableMeters: 0,
    ...overrides,
  };
}

function twoNodeWorld(seed: number, lengthMeters: number): WorldState {
  const world = createEmptyWorld(seed, activeProfiles);
  world.topology.nodes.push({ id: 'a', kind: 'terminal', label: 'A' }, { id: 'b', kind: 'terminal', label: 'B' });
  world.topology.spans.push({ id: 'main', fromNodeId: 'a', toNodeId: 'b', lengthMeters, events: [] });
  return world;
}

describe('trace: IOR ratio', () => {
  it('a wrong IOR setting shifts the detected distance by exactly the true/setting ratio', () => {
    const world = twoNodeWorld(1, 2000);
    world.topology.spans[0].events.push({ id: 'splice', kind: 'fusion-splice', positionMeters: 1000, lossDb: 0.15 });
    const nTrue = profiles.network.iorDefault['1550']!;

    const wrongSettings = baseSettings({ iorSetting: nTrue * 1.02 });
    const wrongResult = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, wrongSettings);
    const wrongEvent = wrongResult.events.find((e) => e.kind === 'non-reflective')!;
    const wrongEdz = eventDeadZoneMeters(wrongSettings.pulseWidthNs, wrongSettings.iorSetting);
    expect(Math.abs(wrongEvent.distanceMeters - 1000 / 1.02)).toBeLessThanOrEqual(wrongEdz);

    const correctSettings = baseSettings({ iorSetting: nTrue });
    const correctResult = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, correctSettings);
    const correctEvent = correctResult.events.find((e) => e.kind === 'non-reflective')!;
    const correctEdz = eventDeadZoneMeters(correctSettings.pulseWidthNs, correctSettings.iorSetting);
    expect(Math.abs(correctEvent.distanceMeters - 1000)).toBeLessThanOrEqual(correctEdz);
  });
});

describe('trace: macrobend wavelength differential', () => {
  it('surfaces the 1550 vs 1310 loss differential unchanged from the fault-authored values', () => {
    const world = twoNodeWorld(2, 2000);
    world.topology.spans[0].events.push({
      id: 'bend',
      kind: 'macrobend',
      positionMeters: 1000,
      lossDbByWavelength: { '1310': 0.2, '1550': 1.5 },
    });
    const settings1310 = baseSettings({ wavelengthNm: 1310, pulseWidthNs: 100, averagingSeconds: 180, iorSetting: profiles.network.iorDefault['1310']! });
    const settings1550 = baseSettings({ wavelengthNm: 1550, pulseWidthNs: 100, averagingSeconds: 180 });
    const r1310 = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, settings1310);
    const r1550 = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, settings1550);
    const e1310 = r1310.events.find((e) => e.kind === 'non-reflective')!.lossDb!;
    const e1550 = r1550.events.find((e) => e.kind === 'non-reflective')!.lossDb!;
    expect(e1550 - e1310).toBeGreaterThan(1.2);
    expect(e1550 - e1310).toBeLessThan(1.4);
  });
});

describe('trace: dead-zone failure mode', () => {
  it('merges two events closer together than the dead zone into one, and resolves them separately with a short pulse', () => {
    // Positions are chosen well beyond the *front panel's* own attenuation dead zone at
    // 20us (~10.2km with the default profile), so what's under test is purely whether
    // the two events resolve from *each other* -- not from the launch pulse itself.
    const world = twoNodeWorld(3, 15000);
    world.topology.spans[0].events.push(
      { id: 'e1', kind: 'fusion-splice', positionMeters: 12000, lossDb: 0.5 },
      { id: 'e2', kind: 'fusion-splice', positionMeters: 12040, lossDb: 0.5 },
    );

    const longPulse = baseSettings({ pulseWidthNs: 20000, rangeMeters: 15500, averagingSeconds: 180 });
    const longResult = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, longPulse);
    const nonReflectiveLong = longResult.events.filter((e) => e.kind === 'non-reflective');
    expect(nonReflectiveLong.length).toBe(1);
    expect(nonReflectiveLong[0].lossDb).toBeGreaterThan(0.85);
    expect(nonReflectiveLong[0].lossDb).toBeLessThan(1.15);

    const shortPulse = baseSettings({ pulseWidthNs: 30, rangeMeters: 15500, averagingSeconds: 180 });
    const shortResult = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, shortPulse);
    const nonReflectiveShort = shortResult.events.filter((e) => e.kind === 'non-reflective');
    expect(nonReflectiveShort.length).toBe(2);
    for (const e of nonReflectiveShort) {
      expect(e.lossDb).toBeGreaterThan(0.3);
      expect(e.lossDb).toBeLessThan(0.7);
    }
  });
});

describe('trace: splitter superposition', () => {
  function splitterWorld(seed: number): WorldState {
    const world = createEmptyWorld(seed, activeProfiles);
    world.topology.nodes.push(
      { id: 'olt', kind: 'olt', label: 'OLT' },
      { id: 'spl', kind: 'splitter', label: 'Splitter', attributes: { splitRatio: '1x4' } },
      { id: 'l1', kind: 'terminal', label: 'L1' },
      { id: 'l2', kind: 'terminal', label: 'L2' },
      { id: 'l3', kind: 'terminal', label: 'L3' },
      { id: 'l4', kind: 'terminal', label: 'L4' },
    );
    world.topology.spans.push(
      { id: 'feeder', fromNodeId: 'olt', toNodeId: 'spl', lengthMeters: 500, events: [] },
      { id: 'leg1', fromNodeId: 'spl', toNodeId: 'l1', lengthMeters: 500, events: [] },
      { id: 'leg2', fromNodeId: 'spl', toNodeId: 'l2', lengthMeters: 600, events: [] },
      { id: 'leg3', fromNodeId: 'spl', toNodeId: 'l3', lengthMeters: 700, events: [] },
      { id: 'leg4', fromNodeId: 'spl', toNodeId: 'l4', lengthMeters: 800, events: [] },
    );
    return world;
  }

  it('shows a smaller-than-nominal splitter step from the OLT side, and the full nominal step from a single leg', () => {
    const world = splitterWorld(4);
    const settings = baseSettings({ pulseWidthNs: 30, rangeMeters: 2000, averagingSeconds: 180 });

    const fromOlt = trace(world, profiles, { accessNodeId: 'olt', launchSpanId: 'feeder' }, settings);
    const splitterStep = fromOlt.events.find((e) => e.kind === 'non-reflective' && Math.abs(e.distanceMeters - 500) < 20);
    expect(splitterStep).toBeDefined();
    // Four legs return light simultaneously to the OLT-side trace, so the apparent step
    // is well under the 7.2 dB ladder value -- not just marginally, since combined
    // returned power from four legs is roughly 6 dB more than any single leg alone.
    expect(splitterStep!.lossDb).toBeLessThan(5);

    const fromLeg = trace(world, profiles, { accessNodeId: 'l1', launchSpanId: 'leg1' }, settings);
    const legSplitterStep = fromLeg.events.find((e) => e.kind === 'non-reflective');
    expect(legSplitterStep).toBeDefined();
    expect(legSplitterStep!.lossDb).toBeGreaterThan(7.0);
    expect(legSplitterStep!.lossDb).toBeLessThan(7.4);
  });
});

describe('trace: wrong roll shows as an unterminated end', () => {
  function strandedWorld(seed: number): WorldState {
    const world = createEmptyWorld(seed, activeProfiles);
    world.topology.nodes.push(
      { id: 'fdh', kind: 'fdh', label: 'FDH' },
      { id: 'closure', kind: 'splice-closure', label: 'Closure', attributes: {} },
      { id: 'term', kind: 'terminal', label: 'Term' },
    );
    world.topology.spans.push(
      {
        id: 'feeder',
        fromNodeId: 'fdh',
        toNodeId: 'closure',
        lengthMeters: 1000,
        strands: [{ tubeColor: 'blue', fiberColor: 'orange', role: 'distribution' }],
        events: [],
      },
      { id: 'drop', fromNodeId: 'closure', toNodeId: 'term', lengthMeters: 200, events: [] },
    );
    (world.topology.nodes.find((n) => n.id === 'closure')!.attributes as Record<string, unknown>).spliceMap = [
      { fromSpanId: 'feeder', fromStrand: { tubeColor: 'blue', fiberColor: 'orange' }, toSpanId: 'drop' },
    ];
    return world;
  }

  it('ends at the closure with a reflective unterminated-end once the roll is wrong, but continues without the fault', () => {
    const settings = baseSettings({ rangeMeters: 2000 });
    const access = { accessNodeId: 'fdh', launchSpanId: 'feeder', strand: { tubeColor: 'blue' as const, fiberColor: 'orange' as const } };

    const healthyWorld = strandedWorld(5);
    const healthyResult = trace(healthyWorld, profiles, access, settings);
    expect(healthyResult.hidden.pathSpanIds).toEqual(['feeder', 'drop']);

    let brokenWorld = strandedWorld(5);
    brokenWorld = applyFault(brokenWorld, {
      instanceId: 'f1',
      kind: 'wrong-tube-continuity',
      target: { type: 'fiber-span', spanId: 'feeder' },
      params: { tubeColor: 'blue', fiberColor: 'orange', rollType: 'wrong-tube' },
    });
    const brokenResult = trace(brokenWorld, profiles, access, settings);
    expect(brokenResult.hidden.pathSpanIds).toEqual(['feeder']);
    const endEvent = brokenResult.events.find((e) => e.kind === 'end-of-fiber')!;
    expect(Math.abs(endEvent.distanceMeters - 1000)).toBeLessThan(50);
    expect(endEvent.reflectanceDb).not.toBeNull();
    expect(endEvent.reflectanceDb!).toBeLessThan(-8);
    expect(endEvent.reflectanceDb!).toBeGreaterThan(-20);
    const unterminated = brokenResult.hidden.groundTruth.find((g) => g.kind === 'unterminated-end');
    expect(unterminated).toBeDefined();
  });
});

describe('trace: fiber break', () => {
  it('drops to near the noise floor beyond the break, ending in a non-reflective end-of-fiber', () => {
    const world = twoNodeWorld(6, 2000);
    world.topology.spans[0].events.push({ id: 'brk', kind: 'fiber-break', positionMeters: 500, lossDb: 60 });
    const settings = baseSettings({ rangeMeters: 2000, averagingSeconds: 180 });
    const result = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, settings);
    const farSamples = result.samples.filter((s) => s.distanceMeters > 700);
    for (const s of farSamples) {
      expect(s.levelDb).toBeLessThan(result.noiseFloorDb + 3);
    }
    const last = result.events[result.events.length - 1];
    expect(last.kind).toBe('end-of-fiber');
    expect(last.reflectanceDb).toBeNull();
  });
});

describe('trace: launch cable', () => {
  it('makes the access-point connector measurable only when a launch cable is present', () => {
    const world = twoNodeWorld(7, 2000);

    const withoutCable = baseSettings({ launchCableMeters: 0 });
    const rWithout = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, withoutCable);
    const groundConn = rWithout.hidden.groundTruth.find((g) => g.kind === 'connector-upc' && g.eventId === null)!;
    expect(groundConn).toBeDefined();
    expect(groundConn.resolved).toBe(false);
    expect(rWithout.events.some((e) => e.kind === 'reflective' && Math.abs(e.distanceMeters) < 5)).toBe(false);
    expect(rWithout.warnings.some((w) => w.kind === 'no-launch-cable')).toBe(true);

    const withCable = baseSettings({ launchCableMeters: 500 });
    const rWith = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, withCable);
    const groundConnWith = rWith.hidden.groundTruth.find((g) => g.kind === 'connector-upc' && g.eventId === null)!;
    expect(groundConnWith.resolved).toBe(true);
    const detected = rWith.events.find((e) => Math.abs(e.distanceMeters - 500) < 20);
    expect(detected).toBeDefined();
    expect(detected!.lossDb).toBeGreaterThan(0.1);
    expect(detected!.lossDb).toBeLessThan(0.5);
    expect(rWith.warnings.some((w) => w.kind === 'no-launch-cable')).toBe(false);
  });
});

describe('trace: live PON enforcement', () => {
  it('flags an in-band shot on a live span and raises the noise floor relative to an out-of-band shot', () => {
    const world = twoNodeWorld(8, 1000);
    world.topology.spans[0].liveService = true;
    const inBand = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, baseSettings({ wavelengthNm: 1550 }));
    expect(inBand.violations).toHaveLength(1);
    expect(inBand.violations[0].kind).toBe('in-band-test-on-live-pon');

    const outOfBand = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, baseSettings({ wavelengthNm: 1625, iorSetting: profiles.network.iorDefault['1625']! }));
    expect(outOfBand.violations).toHaveLength(0);
    expect(inBand.noiseFloorDb).toBeGreaterThan(outOfBand.noiseFloorDb + 5);
  });
});

describe('trace: determinism', () => {
  it('produces identical results for identical inputs, and different samples when averaging changes', () => {
    const world = twoNodeWorld(9, 1500);
    world.topology.spans[0].events.push({ id: 'e', kind: 'fusion-splice', positionMeters: 700, lossDb: 0.2 });
    const settings = baseSettings();
    const r1 = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, settings);
    const r2 = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, settings);
    expect(r1).toEqual(r2);

    const r3 = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, baseSettings({ averagingSeconds: 5 }));
    expect(r3.samples).not.toEqual(r1.samples);
  });
});

describe('trace: settings validation', () => {
  const world = twoNodeWorld(10, 1000);
  const access = { accessNodeId: 'a', launchSpanId: 'main' };

  it('rejects an invalid wavelength', () => {
    expect(() => trace(world, profiles, access, baseSettings({ wavelengthNm: 1234 }))).toThrow(OtdrSettingsError);
  });
  it('rejects a pulse width outside the instrument range', () => {
    expect(() => trace(world, profiles, access, baseSettings({ pulseWidthNs: 1 }))).toThrow(OtdrSettingsError);
  });
  it('rejects an averaging time not in the instrument list', () => {
    expect(() => trace(world, profiles, access, baseSettings({ averagingSeconds: 7 }))).toThrow(OtdrSettingsError);
  });
  it('rejects a non-positive range', () => {
    expect(() => trace(world, profiles, access, baseSettings({ rangeMeters: 0 }))).toThrow(OtdrSettingsError);
  });
  it('rejects an IOR outside [0.3, 3]', () => {
    expect(() => trace(world, profiles, access, baseSettings({ iorSetting: 0.1 }))).toThrow(OtdrSettingsError);
  });
  it('rejects negative cable lengths', () => {
    expect(() => trace(world, profiles, access, baseSettings({ launchCableMeters: -1 }))).toThrow(OtdrSettingsError);
  });
});

describe('trace: simulated time', () => {
  it('equals averagingSeconds + 20', () => {
    const world = twoNodeWorld(11, 500);
    const result = trace(world, profiles, { accessNodeId: 'a', launchSpanId: 'main' }, baseSettings({ averagingSeconds: 60 }));
    expect(result.simulatedSecondsElapsed).toBe(80);
  });
});
