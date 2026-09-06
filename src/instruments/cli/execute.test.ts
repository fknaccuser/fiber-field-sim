import { describe, expect, it } from 'vitest';
import { execute } from './execute';
import { HANDLER_IDS } from './handlers';
import type { CliSession } from './types';
import { createEmptyWorld } from '../../world';
import type { ActiveProfileSet, WorldState } from '../../world';
import { loadDefaultProfileSet } from '../../profiles';

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

function worldWithAllEndpoints(): WorldState {
  const world = createEmptyWorld(1, activeProfiles);
  world.topology.nodes.push({ id: 'prem-1', kind: 'customer-premise', label: 'Prem' });
  world.devices.push(
    { id: 'sw-1', hostname: 'SW-1', vendorProfileId: 'switch-cisco-ios', interfaces: [], vlans: [], macTable: [], routeTable: [] },
    { id: 'olt-1', hostname: 'OLT-1', vendorProfileId: 'olt-calix-e7-2', role: 'olt', interfaces: [], vlans: [], macTable: [], routeTable: [] },
  );
  world.hosts.push({ id: 'host-1', label: 'Laptop', premiseNodeId: 'prem-1', macAddress: '0011.2233.4403', addressing: { mode: 'static', ip: '10.0.0.5', prefixLength: 24, gateway: '10.0.0.1', dns: '10.0.0.1' } });
  return world;
}

describe('unrecognized commands use each endpoint\'s own vendor template', () => {
  const world = worldWithAllEndpoints();

  it('the OLT uses its own syntax error template', () => {
    const session: CliSession = { endpoint: { kind: 'device', deviceId: 'olt-1' }, mode: 'priv-exec' };
    const r = execute(world, profiles, session, 'bogus command');
    expect(r.output[1]).toBe('% Invalid command.');
    expect(r.recognized).toBe(false);
  });

  it('the switch uses the IOS syntax error template', () => {
    const session: CliSession = { endpoint: { kind: 'device', deviceId: 'sw-1' }, mode: 'priv-exec' };
    const r = execute(world, profiles, session, 'bogus command');
    expect(r.output[1]).toBe(`% Invalid input detected at '^' marker.`);
  });

  it('the host shell substitutes the input into the Windows-style message', () => {
    const session: CliSession = { endpoint: { kind: 'host', hostId: 'host-1' }, mode: 'user-exec' };
    const r = execute(world, profiles, session, 'bogus');
    expect(r.output.join('\n')).toContain("'bogus' is not recognized");
  });
});

describe('world reference identity', () => {
  it('a non-config command returns the same world reference; a config command returns a clone and leaves the input untouched', () => {
    const world = createEmptyWorld(2, activeProfiles);
    world.devices.push({
      id: 'sw-1',
      hostname: 'SW-1',
      vendorProfileId: 'switch-cisco-ios',
      interfaces: [{ id: 'GigabitEthernet0/1', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', accessVlan: 10 }],
      vlans: [],
      macTable: [],
      routeTable: [],
    });
    const snapshot = structuredClone(world);
    const session: CliSession = { endpoint: { kind: 'device', deviceId: 'sw-1' }, mode: 'priv-exec' };

    const showResult = execute(world, profiles, session, 'show ip interface brief');
    expect(showResult.world).toBe(world);

    let s = session;
    let r = execute(world, profiles, s, 'configure terminal');
    s = r.session;
    r = execute(r.world, profiles, s, 'interface Gi0/1');
    s = r.session;
    r = execute(r.world, profiles, s, 'switchport access vlan 30');

    expect(r.world).not.toBe(world);
    expect(world).toEqual(snapshot);
  });
});

describe('handler registry completeness', () => {
  it('every handler id referenced by every bundled vendor profile exists in HANDLER_IDS', () => {
    const missing: string[] = [];
    for (const profile of [profiles.oltVendor, profiles.switchVendor, profiles.hostShell]) {
      for (const entry of profile.commandSet) {
        if (!HANDLER_IDS.includes(entry.handler)) missing.push(`${profile.id}: ${entry.handler}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
