import { describe, expect, it } from 'vitest';
import { createEmptyWorld } from '../world';
import type { ActiveProfileSet, WorldState } from '../world';
import { checkPresence, deviceLocationNodeId, travelTimeSeconds } from './location';
import type { ScenarioMeta } from './types';

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
    { id: 'splitter-1', kind: 'splitter', label: 'Splitter' },
    { id: 'ont-1', kind: 'ont', label: 'ONT' },
    { id: 'sw-node', kind: 'network-device', label: 'Access switch node', attributes: { deviceId: 'sw-1' } },
  );
  world.topology.spans.push({ id: 'drop', fromNodeId: 'splitter-1', toNodeId: 'ont-1', lengthMeters: 300, events: [] });
  world.devices.push(
    { id: 'olt-dev', hostname: 'OLT-1', vendorProfileId: 'olt-calix-e7-2', role: 'olt', topologyNodeId: 'fdh-1', interfaces: [], vlans: [], macTable: [], routeTable: [] },
    { id: 'sw-1', hostname: 'SW-1', vendorProfileId: 'switch-cisco-ios', role: 'switch', interfaces: [], vlans: [], macTable: [], routeTable: [] },
  );
  world.hosts.push({ id: 'host-1', label: 'Customer laptop', premiseNodeId: 'ont-1', macAddress: '0011.2233.4401', addressing: { mode: 'dhcp' } });
  return world;
}

function baseMeta(overrides: Partial<ScenarioMeta> = {}): ScenarioMeta {
  return {
    scenarioId: 's', title: 't', tier: 2, seed: 1, startLocationNodeId: 'fdh-1',
    remoteCliAccess: false, remoteHostAccess: false, positionToleranceMeters: 10,
    serviceCheckHostname: 'portal.isp.net',
    travelSeconds: { default: 300, pairs: [{ from: 'fdh-1', to: 'ont-1', seconds: 900 }] },
    hints: [], referenceSolution: { steps: [], totalSeconds: 0, affectedCustomerMinutes: 0 }, today: '2026-01-01',
    ...overrides,
  };
}

describe('deviceLocationNodeId', () => {
  it('uses the device\'s own topologyNodeId when set', () => {
    expect(deviceLocationNodeId(baseWorld(), 'olt-dev')).toBe('fdh-1');
  });
  it('falls back to the network-device node whose attributes.deviceId matches', () => {
    expect(deviceLocationNodeId(baseWorld(), 'sw-1')).toBe('sw-node');
  });
});

describe('checkPresence', () => {
  it('otdr-shot requires presence at the access node', () => {
    const world = baseWorld();
    const meta = baseMeta();
    expect(checkPresence(world, meta, 'ont-1', { type: 'otdr-shot', access: { accessNodeId: 'fdh-1', launchSpanId: 'drop' }, settings: {} as never }).ok).toBe(false);
    expect(checkPresence(world, meta, 'fdh-1', { type: 'otdr-shot', access: { accessNodeId: 'fdh-1', launchSpanId: 'drop' }, settings: {} as never }).ok).toBe(true);
  });

  it('scope requires presence at either end of the span', () => {
    const world = baseWorld();
    const meta = baseMeta();
    expect(checkPresence(world, meta, 'splitter-1', { type: 'scope', spanId: 'drop', eventId: 'e1' }).ok).toBe(true);
    expect(checkPresence(world, meta, 'ont-1', { type: 'scope', spanId: 'drop', eventId: 'e1' }).ok).toBe(true);
    expect(checkPresence(world, meta, 'fdh-1', { type: 'scope', spanId: 'drop', eventId: 'e1' }).ok).toBe(false);
  });

  it('cli to a device requires on-site presence unless remoteCliAccess', () => {
    const world = baseWorld();
    const onSite = baseMeta();
    expect(checkPresence(world, onSite, 'sw-node', { type: 'cli', endpoint: { kind: 'device', deviceId: 'sw-1' }, command: 'show version' }).ok).toBe(true);
    expect(checkPresence(world, onSite, 'fdh-1', { type: 'cli', endpoint: { kind: 'device', deviceId: 'sw-1' }, command: 'show version' }).ok).toBe(false);
    const remote = baseMeta({ remoteCliAccess: true });
    expect(checkPresence(world, remote, 'fdh-1', { type: 'cli', endpoint: { kind: 'device', deviceId: 'sw-1' }, command: 'show version' }).ok).toBe(true);
  });

  it('cli to a host requires presence at the premise unless remoteHostAccess', () => {
    const world = baseWorld();
    const onSite = baseMeta();
    expect(checkPresence(world, onSite, 'ont-1', { type: 'cli', endpoint: { kind: 'host', hostId: 'host-1' }, command: 'ipconfig' }).ok).toBe(true);
    expect(checkPresence(world, onSite, 'fdh-1', { type: 'cli', endpoint: { kind: 'host', hostId: 'host-1' }, command: 'ipconfig' }).ok).toBe(false);
    const remote = baseMeta({ remoteHostAccess: true });
    expect(checkPresence(world, remote, 'fdh-1', { type: 'cli', endpoint: { kind: 'host', hostId: 'host-1' }, command: 'ipconfig' }).ok).toBe(true);
  });

  it('carries no presence requirement for truck-roll, records, customer-contact, hint, diagnosis', () => {
    const world = baseWorld();
    const meta = baseMeta();
    expect(checkPresence(world, meta, 'fdh-1', { type: 'truck-roll', toNodeId: 'ont-1' }).ok).toBe(true);
    expect(checkPresence(world, meta, 'fdh-1', { type: 'records', nodeId: 'ont-1' }).ok).toBe(true);
    expect(checkPresence(world, meta, 'fdh-1', { type: 'hint' }).ok).toBe(true);
  });
});

describe('travelTimeSeconds', () => {
  it('uses a matching pair (either direction) over the default', () => {
    const meta = baseMeta();
    expect(travelTimeSeconds(meta, 'fdh-1', 'ont-1')).toBe(900);
    expect(travelTimeSeconds(meta, 'ont-1', 'fdh-1')).toBe(900);
  });
  it('falls back to the default when no pair matches', () => {
    const meta = baseMeta();
    expect(travelTimeSeconds(meta, 'fdh-1', 'splitter-1')).toBe(300);
  });
});
