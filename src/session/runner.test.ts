import { describe, expect, it } from 'vitest';
import { createEmptyWorld } from '../world';
import type { ActiveProfileSet, WorldState } from '../world';
import { loadDefaultProfileSet } from '../profiles';
import { perform, startSession } from './runner';
import type { ScenarioMeta } from './types';

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

function baseWorld(): WorldState {
  const world = createEmptyWorld(1, activeProfiles);
  world.topology.nodes.push(
    { id: 'fdh-1', kind: 'fdh', label: 'FDH 1' },
    { id: 'ont-1', kind: 'ont', label: 'ONT' },
    { id: 'dig-valid', kind: 'terminal', label: 'Dig site (valid ticket)', attributes: { locateTicket: { expired: false } } },
    { id: 'dig-expired', kind: 'terminal', label: 'Dig site (expired ticket)', attributes: { locateTicket: { expired: true } } },
  );
  world.topology.spans.push({ id: 'test-span', fromNodeId: 'fdh-1', toNodeId: 'ont-1', lengthMeters: 500, events: [] });
  world.devices.push({
    id: 'sw-1',
    hostname: 'ACCESS-SW-1',
    vendorProfileId: 'switch-cisco-ios',
    interfaces: [{ id: 'GigabitEthernet0/1', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', accessVlan: 10 }],
    vlans: [{ id: 10, name: 'CUSTOMERS' }, { id: 20, name: 'ALT' }],
    macTable: [],
    routeTable: [],
  });
  world.truckInventory.push('otdr');
  return world;
}

function baseMeta(overrides: Partial<ScenarioMeta> = {}): ScenarioMeta {
  return {
    scenarioId: 'test-scenario',
    title: 'Test scenario',
    tier: 2,
    seed: 1,
    startLocationNodeId: 'ont-1',
    remoteCliAccess: true,
    remoteHostAccess: true,
    positionToleranceMeters: 10,
    serviceCheckHostname: 'portal.isp.net',
    travelSeconds: { default: 300, pairs: [{ from: 'ont-1', to: 'fdh-1', seconds: 400 }] },
    hints: ['h0', 'h1', 'h2', 'h3'],
    referenceSolution: { steps: [], totalSeconds: 600, affectedCustomerMinutes: 0 },
    today: '2026-01-01',
    ...overrides,
  };
}

const otdrSettings = { wavelengthNm: 1550, pulseWidthNs: 100, rangeMeters: 2000, iorSetting: 1.4682, averagingSeconds: 15, launchCableMeters: 0, receiveCableMeters: 0 };

describe('1. otdr-shot presence and clock', () => {
  it('is refused away from the access node, and succeeds after rolling there', () => {
    const state0 = startSession(baseWorld(), profiles, baseMeta());
    const { state: state1, result: r1 } = perform(state0, { type: 'otdr-shot', access: { accessNodeId: 'fdh-1', launchSpanId: 'test-span' }, settings: otdrSettings });
    expect(r1.type).toBe('refused');
    expect(state1.log[0].type).toBe('refused');
    expect(state1.log[0].durationSeconds).toBe(0);
    expect(state1.clockSeconds).toBe(0);

    const { state: state2 } = perform(state1, { type: 'truck-roll', toNodeId: 'fdh-1' });
    expect(state2.clockSeconds).toBe(400);

    const { state: state3, result: r3 } = perform(state2, { type: 'otdr-shot', access: { accessNodeId: 'fdh-1', launchSpanId: 'test-span' }, settings: otdrSettings });
    expect(r3.type).toBe('otdr-shot');
    expect(state3.clockSeconds).toBe(400 + otdrSettings.averagingSeconds + 20);
  });
});

describe('2. launch cable inventory', () => {
  it('is refused without a long enough cable, allowed with one', () => {
    const settings500 = { ...otdrSettings, launchCableMeters: 500 };
    const world = baseWorld();
    world.topology.nodes.push({ id: 'fdh-1b', kind: 'fdh', label: 'FDH' });
    const state0 = startSession(world, profiles, baseMeta({ startLocationNodeId: 'fdh-1' }));
    const { result: r1 } = perform(state0, { type: 'otdr-shot', access: { accessNodeId: 'fdh-1', launchSpanId: 'test-span' }, settings: settings500 });
    expect(r1.type).toBe('refused');

    const worldWithCable = baseWorld();
    worldWithCable.truckInventory.push('launch-cable-500m');
    const state1 = startSession(worldWithCable, profiles, baseMeta({ startLocationNodeId: 'fdh-1' }));
    const { result: r2 } = perform(state1, { type: 'otdr-shot', access: { accessNodeId: 'fdh-1', launchSpanId: 'test-span' }, settings: settings500 });
    expect(r2.type).toBe('otdr-shot');
  });
});

describe('3. hint policy by tier', () => {
  it('tier 2 allows exactly 3 non-refused hints at cost 5, the fourth is refused', () => {
    let state = startSession(baseWorld(), profiles, baseMeta({ tier: 2 }));
    for (let i = 0; i < 3; i++) {
      const r = perform(state, { type: 'hint' });
      state = r.state;
      const action = state.log[state.log.length - 1];
      expect(action.type).toBe('hint');
      if (action.type === 'hint') {
        expect(action.refused).toBe(false);
        expect(action.cost).toBe(5);
      }
    }
    const r4 = perform(state, { type: 'hint' });
    const last = r4.state.log[r4.state.log.length - 1];
    expect(last.type).toBe('hint');
    if (last.type === 'hint') expect(last.refused).toBe(true);
  });

  it('tier 5 refuses the first hint', () => {
    const state0 = startSession(baseWorld(), profiles, baseMeta({ tier: 5 }));
    const { state: state1 } = perform(state0, { type: 'hint' });
    const action = state1.log[0];
    expect(action.type).toBe('hint');
    if (action.type === 'hint') expect(action.refused).toBe(true);
  });
});

describe('4. excavate safety strikes', () => {
  it('machine digging inside the tolerance zone strikes and ends the session', () => {
    const state0 = startSession(baseWorld(), profiles, baseMeta({ startLocationNodeId: 'dig-valid' }));
    const { state: state1, result } = perform(state0, { type: 'excavate', nodeId: 'dig-valid', method: 'machine', distanceFromMarksInches: 10 });
    expect(result.type).toBe('excavate');
    if (result.type === 'excavate') expect(result.strike).toBe(true);
    expect(state1.ended).toEqual({ by: 'safety-strike', atSimSeconds: state1.clockSeconds });

    const { result: after } = perform(state1, { type: 'truck-roll', toNodeId: 'fdh-1' });
    expect(after.type).toBe('refused');
  });

  it('hand digging at the same distance does not strike', () => {
    const state0 = startSession(baseWorld(), profiles, baseMeta({ startLocationNodeId: 'dig-valid' }));
    const { state: state1, result } = perform(state0, { type: 'excavate', nodeId: 'dig-valid', method: 'hand', distanceFromMarksInches: 10 });
    expect(result.type).toBe('excavate');
    if (result.type === 'excavate') expect(result.strike).toBe(false);
    expect(state1.ended).toBeNull();
  });

  it('machine digging outside the tolerance zone with an expired ticket still strikes', () => {
    const state0 = startSession(baseWorld(), profiles, baseMeta({ startLocationNodeId: 'dig-expired' }));
    const { result } = perform(state0, { type: 'excavate', nodeId: 'dig-expired', method: 'machine', distanceFromMarksInches: 40 });
    expect(result.type).toBe('excavate');
    if (result.type === 'excavate') expect(result.strike).toBe(true);
  });
});

describe('5. cli config vs show commands', () => {
  it('a show command leaves state.world untouched; a config change replaces it', () => {
    const state0 = startSession(baseWorld(), profiles, baseMeta());
    const endpoint = { kind: 'device' as const, deviceId: 'sw-1' };

    const { state: state1 } = perform(state0, { type: 'cli', endpoint, command: 'enable' });
    const { state: state1b } = perform(state1, { type: 'cli', endpoint, command: 'show running-config' });
    expect(state1b.world).toBe(state1.world);

    const { state: state2 } = perform(state1b, { type: 'cli', endpoint, command: 'configure terminal' });
    const { state: state3 } = perform(state2, { type: 'cli', endpoint, command: 'interface Gi0/1' });
    const { state: state4 } = perform(state3, { type: 'cli', endpoint, command: 'switchport access vlan 20' });
    expect(state4.world).not.toBe(state3.world);
    expect(state4.world.devices[0].interfaces[0].accessVlan).toBe(20);
  });
});

describe('6. perform never mutates its input state', () => {
  it('leaves the prior state deep-equal to a snapshot taken before the call', () => {
    const state0 = startSession(baseWorld(), profiles, baseMeta());
    const snapshot = structuredClone(state0);
    perform(state0, { type: 'truck-roll', toNodeId: 'fdh-1' });
    expect(state0).toEqual(snapshot);
  });
});
