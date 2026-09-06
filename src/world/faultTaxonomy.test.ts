import { describe, expect, it } from 'vitest';
import { applyFault, FAULT_TAXONOMY, FAULT_TAXONOMY_BY_ID } from './faultTaxonomy';
import { createEmptyWorld, findDevice, findInterface, findNode, findSpan } from './worldState';
import type { ActiveProfileSet, WorldState } from './types';

const profiles: ActiveProfileSet = {
  network: 'xgs-pon-default',
  oltVendor: 'olt-calix-e7-2',
  switchVendor: 'switch-cisco-ios',
  equipment: 'hexatronic-commscope-default',
  otdrInstrument: 'otdr-exfo-maxtester-730c',
  hostShell: 'host-windows',
  region: 'ca-south-oc-digalert',
};

function worldWithSpan(): WorldState {
  const world = createEmptyWorld(1, profiles);
  world.topology.nodes.push(
    { id: 'fdh-1', kind: 'fdh', label: 'FDH 1' },
    { id: 'closure-1', kind: 'splice-closure', label: 'Closure 1' },
  );
  world.topology.spans.push({
    id: 'span-1',
    fromNodeId: 'fdh-1',
    toNodeId: 'closure-1',
    lengthMeters: 1200,
    events: [],
    strands: [
      { tubeColor: 'blue', fiberColor: 'orange', role: 'distribution' },
      { tubeColor: 'blue', fiberColor: 'green', role: 'dark' },
    ],
  });
  return world;
}

function worldWithDevice(): WorldState {
  const world = createEmptyWorld(2, profiles);
  world.devices.push({
    id: 'sw-1',
    hostname: 'ACCESS-SW-1',
    vendorProfileId: 'switch-cisco-ios',
    interfaces: [
      {
        id: 'GigabitEthernet0/1',
        adminStatus: 'up',
        lineStatus: 'up',
        speedMbps: 1000,
        duplex: 'full',
        mode: 'access',
        accessVlan: 10,
      },
    ],
    vlans: [{ id: 10, name: 'CUSTOMERS' }],
    macTable: [],
    routeTable: [{ network: '0.0.0.0/0', nextHop: '10.0.0.1', source: 'static' }],
  });
  return world;
}

describe('fault taxonomy registry', () => {
  it('has no duplicate ids', () => {
    const ids = FAULT_TAXONOMY.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers the network fault list minimum from the spec (>= 15 kinds)', () => {
    const networkIds = FAULT_TAXONOMY.filter((f) => f.domain === 'network').map((f) => f.id);
    expect(networkIds).toEqual(
      expect.arrayContaining([
        'vlan-wrong-access-port',
        'trunk-missing-allowed-vlan',
        'trunk-native-vlan-mismatch',
        'duplex-speed-mismatch',
        'port-security-violation-errdisabled',
        'stp-unexpected-blocking',
        'dhcp-relay-missing-helper',
        'dhcp-scope-exhausted',
        'rogue-dhcp-server',
        'default-route-missing-or-wrong',
        'subnet-mask-typo-overlap',
        'acl-silent-drop',
        'ospf-exstart-mtu-mismatch',
        'dns-stale-record',
        'transceiver-rx-power-low',
      ]),
    );
    expect(networkIds.length).toBeGreaterThanOrEqual(15);
  });

  it('includes the tube/fiber continuity-rolling fault as a first-class optical fault', () => {
    expect(FAULT_TAXONOMY_BY_ID['wrong-tube-continuity']).toBeDefined();
    expect(FAULT_TAXONOMY_BY_ID['wrong-tube-continuity'].domain).toBe('optical');
  });

  it('rejects an unknown fault kind', () => {
    const world = worldWithSpan();
    expect(() =>
      applyFault(world, { instanceId: 'x', kind: 'not-a-real-fault', target: { type: 'fiber-span', spanId: 'span-1' }, params: {} }),
    ).toThrow(/Unknown fault kind/);
  });

  it('rejects invalid params via the fault\'s own schema', () => {
    const world = worldWithSpan();
    expect(() =>
      applyFault(world, {
        instanceId: 'x',
        kind: 'macrobend',
        target: { type: 'fiber-span', spanId: 'span-1' },
        params: { positionMeters: -5 }, // negative position is invalid
      }),
    ).toThrow();
  });
});

describe('applyFault never mutates its input world', () => {
  it('leaves the original world state untouched', () => {
    const world = worldWithSpan();
    const before = JSON.stringify(world);
    applyFault(world, {
      instanceId: 'f1',
      kind: 'macrobend',
      target: { type: 'fiber-span', spanId: 'span-1' },
      params: { positionMeters: 300, severity: 'moderate' },
    });
    expect(JSON.stringify(world)).toBe(before);
  });
});

describe('macrobend physics: wavelength dependence', () => {
  it('loses more at 1550 nm than at 1310 nm, and at least as much at 1625 nm as 1550 nm', () => {
    const world = worldWithSpan();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'macrobend',
      target: { type: 'fiber-span', spanId: 'span-1' },
      params: { positionMeters: 300, severity: 'severe' },
    });
    const event = findSpan(next, 'span-1').events.find((e) => e.kind === 'macrobend')!;
    expect(event.lossDbByWavelength!['1550']!).toBeGreaterThan(event.lossDbByWavelength!['1310']!);
    expect(event.lossDbByWavelength!['1625']!).toBeGreaterThanOrEqual(event.lossDbByWavelength!['1550']!);
  });

  it('accepts an explicit lossDbByWavelength override instead of the severity preset', () => {
    const world = worldWithSpan();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'macrobend',
      target: { type: 'fiber-span', spanId: 'span-1' },
      params: { positionMeters: 300, lossDbByWavelength: { '1310': 0.11, '1550': 2.2, '1625': 4.4 } },
    });
    const event = findSpan(next, 'span-1').events.find((e) => e.kind === 'macrobend')!;
    expect(event.lossDbByWavelength).toEqual({ '1310': 0.11, '1550': 2.2, '1625': 4.4 });
  });
});

describe('optical faults write into fiber span events, sorted by position', () => {
  it('inserts a degraded fusion splice at the right position, keeping events ordered', () => {
    let world = worldWithSpan();
    world = applyFault(world, {
      instanceId: 'a',
      kind: 'fusion-splice-degraded',
      target: { type: 'fiber-span', spanId: 'span-1' },
      params: { positionMeters: 800, lossDb: 0.6 },
    });
    world = applyFault(world, {
      instanceId: 'b',
      kind: 'connector-dirty',
      target: { type: 'fiber-span', spanId: 'span-1' },
      params: { positionMeters: 200, lossDb: 1.2, reflectanceDb: -20 },
    });
    const positions = findSpan(world, 'span-1').events.map((e) => e.positionMeters);
    expect(positions).toEqual([200, 800]);
  });

  it('a fiber break records an effectively opaque loss with a cause tag', () => {
    const world = worldWithSpan();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'fiber-break',
      target: { type: 'fiber-span', spanId: 'span-1' },
      params: { positionMeters: 500, cause: 'dig-strike' },
    });
    const event = findSpan(next, 'span-1').events[0];
    expect(event.kind).toBe('fiber-break');
    expect(event.lossDb).toBeGreaterThan(30);
    expect(event.causeTag).toBe('dig-strike');
  });

  it('a mismatched-fiber splice records a negative loss (apparent gainer) and preserves the backscatter delta', () => {
    const world = worldWithSpan();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'mismatched-fiber-splice',
      target: { type: 'fiber-span', spanId: 'span-1' },
      params: { positionMeters: 600, backscatterDeltaDb: 0.15 },
    });
    const event = findSpan(next, 'span-1').events[0];
    expect(event.lossDb).toBeLessThan(0);
    expect(event.backscatterDeltaDb).toBe(0.15);
  });
});

describe('wrong-tube-continuity fault', () => {
  it('breaks continuity on the matching strand and flags a wrongly activated one', () => {
    const world = worldWithSpan();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'wrong-tube-continuity',
      target: { type: 'fiber-span', spanId: 'span-1' },
      params: {
        tubeColor: 'blue',
        fiberColor: 'orange',
        rollType: 'spliced-into-dark-spare',
        actualTubeColor: 'blue',
        actualFiberColor: 'green',
      },
    });
    const span = findSpan(next, 'span-1');
    const distributionStrand = span.strands!.find((s) => s.fiberColor === 'orange')!;
    const darkStrand = span.strands!.find((s) => s.fiberColor === 'green')!;
    expect(distributionStrand.continuityBroken).toBe(true);
    expect(darkStrand.unexpectedlyActivated).toBe(true);
  });

  it('throws a clear error when the referenced strand does not exist on the span', () => {
    const world = worldWithSpan();
    expect(() =>
      applyFault(world, {
        instanceId: 'f1',
        kind: 'wrong-tube-continuity',
        target: { type: 'fiber-span', spanId: 'span-1' },
        params: { tubeColor: 'red', fiberColor: 'black', rollType: 'wrong-tube' },
      }),
    ).toThrow(/no strand/);
  });
});

describe('network faults mutate device/interface state realistically', () => {
  it('vlan-wrong-access-port sets the interface access VLAN', () => {
    const world = worldWithDevice();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'vlan-wrong-access-port',
      target: { type: 'device-interface', deviceId: 'sw-1', interfaceId: 'GigabitEthernet0/1' },
      params: { actualVlan: 99 },
    });
    expect(findInterface(findDevice(next, 'sw-1'), 'GigabitEthernet0/1').accessVlan).toBe(99);
  });

  it('port-security-violation-errdisabled sets state and brings the line down, and logs it', () => {
    const world = worldWithDevice();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'port-security-violation-errdisabled',
      target: { type: 'device-interface', deviceId: 'sw-1', interfaceId: 'GigabitEthernet0/1' },
      params: {},
    });
    const iface = findInterface(findDevice(next, 'sw-1'), 'GigabitEthernet0/1');
    expect(iface.portSecurity?.state).toBe('err-disabled');
    expect(iface.lineStatus).toBe('down');
    expect(findDevice(next, 'sw-1').logLines?.length).toBe(1);
  });

  it('default-route-missing-or-wrong removes the default route in "missing" mode', () => {
    const world = worldWithDevice();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'default-route-missing-or-wrong',
      target: { type: 'device-global', deviceId: 'sw-1' },
      params: { mode: 'missing' },
    });
    expect(findDevice(next, 'sw-1').routeTable.find((r) => r.network === '0.0.0.0/0')).toBeUndefined();
  });

  it('dns-stale-record keeps the host reachable by IP while DNS resolves elsewhere', () => {
    const world = worldWithDevice();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'dns-stale-record',
      target: { type: 'device-global', deviceId: 'sw-1' },
      params: { hostname: 'billing.internal', actualIp: '10.5.5.5', resolvedIp: '10.5.5.9' },
    });
    const record = findDevice(next, 'sw-1').dnsRecords!.find((r) => r.hostname === 'billing.internal')!;
    expect(record.actualIp).toBe('10.5.5.5');
    expect(record.resolvedIp).toBe('10.5.5.9');
    expect(record.stale).toBe(true);
  });
});

describe('compliance faults', () => {
  it('flags a dig inside the tolerance zone as triggered', () => {
    const world = worldWithSpan();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'dig-inside-tolerance-zone',
      target: { type: 'site', nodeId: 'closure-1' },
      params: { toleranceZoneInches: 24, actualDistanceInches: 10 },
    });
    const node = findNode(next, 'closure-1');
    expect((node.attributes as any).safetyViolation.triggered).toBe(true);
  });

  it('does not flag a dig outside the tolerance zone', () => {
    const world = worldWithSpan();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'dig-inside-tolerance-zone',
      target: { type: 'site', nodeId: 'closure-1' },
      params: { toleranceZoneInches: 24, actualDistanceInches: 40 },
    });
    const node = findNode(next, 'closure-1');
    expect((node.attributes as any).safetyViolation.triggered).toBe(false);
  });

  it('marks an expired locate ticket', () => {
    const world = worldWithSpan();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'locate-ticket-expired',
      target: { type: 'site', nodeId: 'closure-1' },
      params: { ticketOpenedDaysAgo: 40, validityDays: 28 },
    });
    expect((findNode(next, 'closure-1').attributes as any).locateTicket.expired).toBe(true);
  });
});

describe('cpe faults', () => {
  it('ont-unpowered marks the ONT node as unpowered', () => {
    const world = worldWithSpan();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'ont-unpowered',
      target: { type: 'site', nodeId: 'closure-1' },
      params: {},
    });
    expect((findNode(next, 'closure-1').attributes as any).powered).toBe(false);
  });
});

function worldWithOnt(): WorldState {
  const world = worldWithDevice();
  const device = findDevice(world, 'sw-1');
  device.ponPorts = [
    {
      id: '1/1/xp1',
      adminStatus: 'up',
      spanId: 'span-1',
      onts: [
        { ontId: '1/1/xp1/1', serial: 'CXNK00A1B2C3', ontNodeId: 'ont-1' },
        { ontId: '1/1/xp1/2', serial: 'CXNK00A1B2C4', ontNodeId: 'ont-2' },
      ],
    },
  ];
  return world;
}

describe('ont faults', () => {
  it('ont-serial-mismatch sets the provisioned serial on the matching ONT record', () => {
    const world = worldWithOnt();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'ont-serial-mismatch',
      target: { type: 'device-global', deviceId: 'sw-1' },
      params: { ontId: '1/1/xp1/1', provisionedSerial: 'CXNK00ZZZZZZ' },
    });
    const ont = findDevice(next, 'sw-1').ponPorts![0].onts.find((o) => o.ontId === '1/1/xp1/1')!;
    expect(ont.provisionedSerial).toBe('CXNK00ZZZZZZ');
  });

  it('rogue-ont flags the ONT as misbehaving', () => {
    const world = worldWithOnt();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'rogue-ont',
      target: { type: 'device-global', deviceId: 'sw-1' },
      params: { ontId: '1/1/xp1/2' },
    });
    const ont = findDevice(next, 'sw-1').ponPorts![0].onts.find((o) => o.ontId === '1/1/xp1/2')!;
    expect(ont.misbehaving).toBe('rogue-tx');
  });
});

describe('dns-server-unresponsive fault', () => {
  it('sets the device dnsServerHealth', () => {
    const world = worldWithDevice();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'dns-server-unresponsive',
      target: { type: 'device-global', deviceId: 'sw-1' },
      params: { health: 'down' },
    });
    expect(findDevice(next, 'sw-1').dnsServerHealth).toBe('down');
  });
});

describe('amended fault behavior', () => {
  it('subnet-mask-typo-overlap also sets the interface prefixLength from the wrong CIDR', () => {
    const world = worldWithDevice();
    const device = findDevice(world, 'sw-1');
    device.interfaces[0].ipAddress = '10.0.0.5';
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'subnet-mask-typo-overlap',
      target: { type: 'device-global', deviceId: 'sw-1' },
      params: { interfaceId: 'GigabitEthernet0/1', wrongCidr: '10.0.0.0/8' },
    });
    const iface = findInterface(findDevice(next, 'sw-1'), 'GigabitEthernet0/1');
    expect(iface.prefixLength).toBe(8);
  });

  it('acl-silent-drop accepts a structured match and appliedTo', () => {
    const world = worldWithDevice();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'acl-silent-drop',
      target: { type: 'device-global', deviceId: 'sw-1' },
      params: {
        matchDescription: 'ICMP from customers to anywhere',
        match: { protocol: 'icmp', srcCidr: '10.0.0.0/24', dstCidr: '0.0.0.0/0' },
        appliedTo: [{ interfaceId: 'Vlan10', direction: 'in' }],
      },
    });
    const acl = findDevice(next, 'sw-1').acls![0];
    expect(acl.match).toEqual({ protocol: 'icmp', srcCidr: '10.0.0.0/24', dstCidr: '0.0.0.0/0' });
    expect(acl.appliedTo).toEqual([{ interfaceId: 'Vlan10', direction: 'in' }]);
  });

  it('ospf-exstart-mtu-mismatch sets the interface MTU and logs the ADJCHG line', () => {
    const world = worldWithDevice();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'ospf-exstart-mtu-mismatch',
      target: { type: 'device-interface', deviceId: 'sw-1', interfaceId: 'GigabitEthernet0/1' },
      params: { neighborId: '10.0.0.2', localMtu: 1400 },
    });
    const device = findDevice(next, 'sw-1');
    expect(findInterface(device, 'GigabitEthernet0/1').mtu).toBe(1400);
    expect(device.logLines!.some((l) => l.includes('EXCHANGE to EXSTART'))).toBe(true);
  });

  it('transceiver-rx-power-low also logs an SFF8472 threshold violation', () => {
    const world = worldWithDevice();
    const next = applyFault(world, {
      instanceId: 'f1',
      kind: 'transceiver-rx-power-low',
      target: { type: 'device-interface', deviceId: 'sw-1', interfaceId: 'GigabitEthernet0/1' },
      params: { rxPowerDbm: -27 },
    });
    const device = findDevice(next, 'sw-1');
    expect(device.logLines!.some((l) => l.includes('THRESHOLD_VIOLATION'))).toBe(true);
  });
});
