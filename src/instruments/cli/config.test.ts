import { describe, expect, it } from 'vitest';
import { execute } from './execute';
import type { CliSession } from './types';
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
  hostShell: 'host-windows',
  region: 'ca-south-oc-digalert',
};

function switchWorld(): WorldState {
  const world = createEmptyWorld(1, activeProfiles);
  world.devices.push({
    id: 'sw-1',
    hostname: 'ACCESS-SW-1',
    vendorProfileId: 'switch-cisco-ios',
    interfaces: [{ id: 'GigabitEthernet0/1', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', accessVlan: 10 }],
    vlans: [{ id: 10, name: 'CUSTOMERS' }],
    macTable: [],
    routeTable: [],
  });
  return world;
}

function baseSession(): CliSession {
  return { endpoint: { kind: 'device', deviceId: 'sw-1' }, mode: 'priv-exec' };
}

describe('interface configuration flow', () => {
  it('walks configure terminal -> interface -> switchport access vlan -> end, mutating a clone and progressing prompts', () => {
    const world = switchWorld();
    const snapshot = structuredClone(world);
    let session = baseSession();

    let r = execute(world, profiles, session, 'configure terminal');
    expect(r.prompt).toBe('ACCESS-SW-1(config)#');
    session = r.session;

    r = execute(r.world, profiles, session, 'interface Gi0/1');
    expect(r.prompt).toBe('ACCESS-SW-1(config-if)#');
    session = r.session;

    r = execute(r.world, profiles, session, 'switchport access vlan 20');
    session = r.session;

    r = execute(r.world, profiles, session, 'end');
    expect(r.prompt).toBe('ACCESS-SW-1#');

    const finalIface = r.world.devices[0].interfaces[0];
    expect(finalIface.accessVlan).toBe(20);
    expect(world).toEqual(snapshot); // the original world object was never mutated
  });
});

describe('shutdown / no shutdown recovery', () => {
  it('clears an err-disabled port and brings the line back up when the link peer is up', () => {
    let world = switchWorld();
    world.devices.push({
      id: 'peer-1',
      hostname: 'PEER-1',
      vendorProfileId: 'switch-cisco-ios',
      interfaces: [{ id: 'GigabitEthernet0/1', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', accessVlan: 10 }],
      vlans: [],
      macTable: [],
      routeTable: [],
    });
    world.links.push({ id: 'l1', a: { deviceId: 'sw-1', interfaceId: 'GigabitEthernet0/1' }, b: { deviceId: 'peer-1', interfaceId: 'GigabitEthernet0/1' } });
    world = applyFault(world, {
      instanceId: 'f1',
      kind: 'port-security-violation-errdisabled',
      target: { type: 'device-interface', deviceId: 'sw-1', interfaceId: 'GigabitEthernet0/1' },
      params: {},
    });

    let session = baseSession();
    let r = execute(world, profiles, session, 'configure terminal');
    session = r.session;
    r = execute(r.world, profiles, session, 'interface GigabitEthernet0/1');
    session = r.session;
    r = execute(r.world, profiles, session, 'shutdown');
    session = r.session;
    r = execute(r.world, profiles, session, 'no shutdown');

    const iface = r.world.devices[0].interfaces[0];
    expect(iface.portSecurity?.state).toBe('ok');
    expect(iface.lineStatus).toBe('up');
  });
});

describe('static route configuration', () => {
  it('adds a default route and shows it correctly under show ip route', () => {
    const world = switchWorld();
    let session = baseSession();
    let r = execute(world, profiles, session, 'configure terminal');
    session = r.session;
    r = execute(r.world, profiles, session, 'ip route 0.0.0.0 0.0.0.0 10.0.0.1');
    session = r.session;
    r = execute(r.world, profiles, session, 'end');
    session = r.session;
    r = execute(r.world, profiles, session, 'show ip route');

    expect(r.output).toContain('S*    0.0.0.0/0 [1/0] via 10.0.0.1');
    expect(r.output).toContain('Gateway of last resort is 10.0.0.1 to network 0.0.0.0');
  });
});

describe('show running-config reflects ip helper-address', () => {
  it('shows the helper address under the correct SVI', () => {
    const world = switchWorld();
    let session = baseSession();
    let r = execute(world, profiles, session, 'configure terminal');
    session = r.session;
    r = execute(r.world, profiles, session, 'interface Vlan10');
    session = r.session;
    r = execute(r.world, profiles, session, 'ip helper-address 10.0.0.50');
    session = r.session;
    r = execute(r.world, profiles, session, 'end');
    session = r.session;
    r = execute(r.world, profiles, session, 'show running-config');

    const vlanIfaceIndex = r.output.findIndex((l) => l === 'interface Vlan10');
    expect(vlanIfaceIndex).toBeGreaterThanOrEqual(0);
    const nextBang = r.output.findIndex((l, i) => i > vlanIfaceIndex && l === '!');
    const block = r.output.slice(vlanIfaceIndex, nextBang);
    expect(block).toContain(' ip helper-address 10.0.0.50');
  });
});
