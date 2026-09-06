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
    interfaces: [
      { id: 'GigabitEthernet0/1', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', accessVlan: 10 },
      { id: 'GigabitEthernet0/2', adminStatus: 'administratively-down', lineStatus: 'down', speedMbps: 1000, duplex: 'auto', mode: 'access' },
    ],
    vlans: [{ id: 10, name: 'CUSTOMERS' }],
    macTable: [],
    routeTable: [],
  });
  return world;
}

function session(): CliSession {
  return { endpoint: { kind: 'device', deviceId: 'sw-1' }, mode: 'priv-exec' };
}

describe('show ip interface brief', () => {
  it('renders the exact expected row for an administratively down interface', () => {
    const world = switchWorld();
    const result = execute(world, profiles, session(), 'show ip interface brief');
    const row = result.output.find((l) => l.startsWith('GigabitEthernet0/2'));
    expect(row).toBe('GigabitEthernet0/2     unassigned      YES unset  administratively down down');
  });
});

describe('show interfaces status', () => {
  it('shows err-disabled for a port after the port-security fault, and a-full/a-1000 for a connected auto port', () => {
    let world = switchWorld();
    // Bring Gi0/1 to a connected, auto-negotiated state and mark Gi0/2 err-disabled via the fault taxonomy.
    world.devices[0].interfaces[0].lineStatus = 'up';
    world = applyFault(world, {
      instanceId: 'f1',
      kind: 'port-security-violation-errdisabled',
      target: { type: 'device-interface', deviceId: 'sw-1', interfaceId: 'GigabitEthernet0/2' },
      params: {},
    });
    const result = execute(world, profiles, session(), 'show interfaces status');
    const gi1 = result.output.find((l) => l.startsWith('Gi0/1'));
    const gi2 = result.output.find((l) => l.startsWith('Gi0/2'));
    expect(gi1).toContain('a-full');
    expect(gi1).toContain('a-1000');
    expect(gi2).toContain('err-disabled');
  });
});

describe('show interfaces transceiver detail', () => {
  it('flags -- when rxPowerDbm is below the profile Rx low alarm, using the vendor profile thresholds', () => {
    const world = switchWorld();
    world.devices[0].interfaces[0].transceiver = { present: true, rxPowerDbm: -30, txPowerDbm: 1, temperatureC: 30 };
    const result = execute(world, profiles, session(), 'show interfaces transceiver detail');
    const rxLine = result.output.find((l) => l.startsWith('Gi0/1') && l.includes('--'));
    expect(rxLine).toBeDefined();
  });

  it('changes output when the vendor profile thresholds differ', () => {
    const world = switchWorld();
    world.devices[0].interfaces[0].transceiver = { present: true, rxPowerDbm: -30, txPowerDbm: 1, temperatureC: 30 };
    const loosened = {
      ...profiles,
      switchVendor: { ...profiles.switchVendor, transceiverThresholds: { temperatureC: [999, 999, -999, -999] as [number, number, number, number], txDbm: [999, 999, -999, -999] as [number, number, number, number], rxDbm: [999, 999, -999, -999] as [number, number, number, number] } },
    };
    const result = execute(world, loosened, session(), 'show interfaces transceiver detail');
    const rxLine = result.output.find((l) => l.startsWith('Gi0/1'));
    expect(rxLine).toBeDefined();
    expect(rxLine).not.toContain('--');
  });
});
