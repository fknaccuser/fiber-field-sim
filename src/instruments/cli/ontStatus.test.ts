import { describe, expect, it } from 'vitest';
import { execute } from './execute';
import type { CliSession } from './types';
import { applyFault, createEmptyWorld } from '../../world';
import type { ActiveProfileSet, NetworkDeviceConfig, WorldState } from '../../world';
import { loadDefaultProfileSet } from '../../profiles';
import { read as powerMeterRead } from '../powerMeter/powerMeter';

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

/** OLT -- 2km feeder -- 1x32 splitter -- 300m drop -- ONT, host behind the ONT on vlan 100. */
function baseWorld(): WorldState {
  const world = createEmptyWorld(1, activeProfiles);
  world.topology.nodes.push(
    { id: 'olt-1', kind: 'olt', label: 'OLT' },
    { id: 'spl-1', kind: 'splitter', label: 'Splitter', attributes: { splitRatio: '1x32' } },
    { id: 'ont-1', kind: 'ont', label: 'ONT' },
  );
  world.topology.spans.push(
    { id: 'feeder', fromNodeId: 'olt-1', toNodeId: 'spl-1', lengthMeters: 2000, events: [] },
    { id: 'drop', fromNodeId: 'spl-1', toNodeId: 'ont-1', lengthMeters: 300, events: [] },
  );

  const oltDevice: NetworkDeviceConfig = {
    id: 'olt-dev',
    hostname: 'OLT-POP1-1',
    vendorProfileId: 'olt-calix-e7-2',
    role: 'olt',
    topologyNodeId: 'olt-1',
    interfaces: [{ id: 'TenGigabitEthernet1/1', adminStatus: 'up', lineStatus: 'up', speedMbps: 10000, duplex: 'full', mode: 'trunk', allowedVlans: [100], nativeVlan: 1 }],
    vlans: [],
    macTable: [],
    routeTable: [],
    ponPorts: [{ id: '1/1/xp1', adminStatus: 'up', spanId: 'feeder', onts: [{ ontId: '1/1/xp1/1', serial: 'CXNK00A1B2C3', ontNodeId: 'ont-1' }] }],
  };

  const distRtr: NetworkDeviceConfig = {
    id: 'dist-rtr',
    hostname: 'DIST-RTR-1',
    vendorProfileId: 'switch-cisco-ios',
    role: 'l3-switch',
    interfaces: [
      { id: 'TenGigabitEthernet1/1', adminStatus: 'up', lineStatus: 'up', speedMbps: 10000, duplex: 'full', mode: 'trunk', allowedVlans: [100], nativeVlan: 1 },
      { id: 'Vlan100', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', ipAddress: '10.100.0.1', prefixLength: 24 },
    ],
    vlans: [{ id: 100, name: 'PON-VLAN' }],
    macTable: [],
    routeTable: [],
    dhcp: [{ vlan: 100, helperAddresses: [], scope: { network: '10.100.0.0/24', poolSize: 200, leased: 10 } }],
  };

  world.devices.push(oltDevice, distRtr);
  world.links.push({ id: 'l-olt-dist', a: { deviceId: 'olt-dev', interfaceId: 'TenGigabitEthernet1/1' }, b: { deviceId: 'dist-rtr', interfaceId: 'TenGigabitEthernet1/1' } });
  world.hosts.push({ id: 'host-1', label: 'Customer laptop', premiseNodeId: 'ont-1', macAddress: '0011.2233.4402', attachedOntNodeId: 'ont-1', vlan: 100, addressing: { mode: 'dhcp' } });

  return world;
}

function oltSession(): CliSession {
  return { endpoint: { kind: 'device', deviceId: 'olt-dev' }, mode: 'priv-exec' };
}
function hostSession(): CliSession {
  return { endpoint: { kind: 'host', hostId: 'host-1' }, mode: 'user-exec' };
}

describe('baseline ONT status', () => {
  it('is online with the expected Rx power, and the host behind it can ping its gateway', () => {
    const world = baseWorld();
    const r = execute(world, profiles, oltSession(), 'show ont status');
    const row = r.output.find((l) => l.includes('1/1/xp1/1'))!;
    expect(row).toContain('online');
    const rxMatch = /online\s+(-?\d+\.\d+)/.exec(row);
    expect(rxMatch).not.toBeNull();
    const rx = Number(rxMatch![1]);
    expect(rx).toBeGreaterThan(4.0 - (0.42 + 17.5 + 0.06) - 0.3);
    expect(rx).toBeLessThan(4.0 - (0.42 + 17.5 + 0.06) + 0.3);

    const ping = execute(world, profiles, hostSession(), 'ping 10.100.0.1');
    const fact = ping.facts.find((f) => f.kind === 'ping') as Extract<(typeof ping.facts)[number], { kind: 'ping' }>;
    expect(fact.delivered).toBe(4);
  });
});

describe('optical faults become ONT/host symptoms', () => {
  it('a severe macrobend on the drop takes the ONT LOS and the host offline', () => {
    let world = baseWorld();
    // An explicit override well beyond the "severe" preset -- this short-reach topology
    // has generous margin, so the preset alone doesn't push Rx below the LOS threshold.
    world = applyFault(world, {
      instanceId: 'f1',
      kind: 'macrobend',
      target: { type: 'fiber-span', spanId: 'drop' },
      params: { positionMeters: 100, lossDbByWavelength: { '1310': 2, '1550': 20, '1625': 25 } },
    });
    const status = execute(world, profiles, oltSession(), 'show ont status');
    expect(status.output.find((l) => l.includes('1/1/xp1/1'))).toContain('los');
    const alarms = execute(world, profiles, oltSession(), 'show alarms');
    expect(alarms.output.some((l) => l.includes('LOS'))).toBe(true);
    const ping = execute(world, profiles, hostSession(), 'ping 10.100.0.1');
    const fact = ping.facts.find((f) => f.kind === 'ping') as Extract<(typeof ping.facts)[number], { kind: 'ping' }>;
    expect(fact.delivered).toBe(0);
  });

  it('a fiber break on the feeder takes every ONT on the port LOS, and the port shows Oper down', () => {
    let world = baseWorld();
    world = applyFault(world, { instanceId: 'f1', kind: 'fiber-break', target: { type: 'fiber-span', spanId: 'feeder' }, params: { positionMeters: 500 } });
    const status = execute(world, profiles, oltSession(), 'show ont status');
    expect(status.output.find((l) => l.includes('1/1/xp1/1'))).toContain('los');
    const port = execute(world, profiles, oltSession(), 'show pon port');
    const row = port.output.find((l) => l.startsWith('1/1/xp1'))!;
    expect(row).toMatch(/down/);
  });
});

describe('ont-unpowered', () => {
  it('shows offline and a DYING-GASP alarm, while the power meter at the ONT input still reads healthy', () => {
    let world = baseWorld();
    world = applyFault(world, { instanceId: 'f1', kind: 'ont-unpowered', target: { type: 'site', nodeId: 'ont-1' }, params: {} });
    const status = execute(world, profiles, oltSession(), 'show ont status');
    expect(status.output.find((l) => l.includes('1/1/xp1/1'))).toContain('offline');
    const alarms = execute(world, profiles, oltSession(), 'show alarms');
    expect(alarms.output.some((l) => l.includes('DYING-GASP'))).toBe(true);

    const reading = powerMeterRead(world, profiles.network, 'ont-1', profiles.network.wavelengths.serviceDownstreamNm);
    expect(reading.dbm).not.toBeNull();
    expect(reading.dbm!).toBeGreaterThan(profiles.network.receivePower.minDbm);
  });
});

describe('ont-serial-mismatch and rogue-ont', () => {
  it('serial-mismatch shows the provisioned serial distinct from the physical one', () => {
    let world = baseWorld();
    world = applyFault(world, { instanceId: 'f1', kind: 'ont-serial-mismatch', target: { type: 'device-global', deviceId: 'olt-dev' }, params: { ontId: '1/1/xp1/1', provisionedSerial: 'CXNK00ZZZZZZ' } });
    const status = execute(world, profiles, oltSession(), 'show ont status');
    const row = status.output.find((l) => l.includes('1/1/xp1/1'))!;
    expect(row).toContain('serial-mismatch');
    expect(row).toContain('CXNK00ZZZZZZ');
  });

  it('rogue-ont marks itself rogue and takes every other ONT on the PON to LOS, named in the alarms', () => {
    let world = baseWorld();
    world.devices[0].ponPorts![0].onts.push({ ontId: '1/1/xp1/2', serial: 'CXNK00B2C3D4', ontNodeId: 'ont-1' });
    world = applyFault(world, { instanceId: 'f1', kind: 'rogue-ont', target: { type: 'device-global', deviceId: 'olt-dev' }, params: { ontId: '1/1/xp1/1' } });
    const status = execute(world, profiles, oltSession(), 'show ont status');
    const rogueRow = status.output.find((l) => l.includes('1/1/xp1/1'))!;
    const otherRow = status.output.find((l) => l.includes('1/1/xp1/2'))!;
    expect(rogueRow).toContain('rogue');
    expect(otherRow).toContain('los');
    const alarms = execute(world, profiles, oltSession(), 'show alarms');
    expect(alarms.output.some((l) => l.includes('ROGUE-ONT') && l.includes('1/1/xp1/1'))).toBe(true);
  });
});

describe('transceiver-rx-power-low on the OLT uplink', () => {
  it('flags -- on show interfaces transceiver detail and logs the threshold violation', () => {
    let world = baseWorld();
    world = applyFault(world, {
      instanceId: 'f1',
      kind: 'transceiver-rx-power-low',
      target: { type: 'device-interface', deviceId: 'olt-dev', interfaceId: 'TenGigabitEthernet1/1' },
      params: { rxPowerDbm: -30 },
    });
    const transceiver = execute(world, profiles, oltSession(), 'show interfaces transceiver detail');
    expect(transceiver.output.some((l) => l.startsWith('TenGigabitEthernet1/1') && l.includes('--'))).toBe(true);
    const logging = execute(world, profiles, oltSession(), 'show logging');
    expect(logging.output.some((l) => l.includes('THRESHOLD_VIOLATION'))).toBe(true);
  });
});
