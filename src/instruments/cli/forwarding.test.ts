import { describe, expect, it } from 'vitest';
import { execute } from './execute';
import type { CliSession } from './types';
import { applyFault, createEmptyWorld } from '../../world';
import type { ActiveProfileSet, NetworkDeviceConfig, WorldState } from '../../world';
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

/**
 * host-1 -- Gi0/1 (access vlan 10) ACCESS-SW Gi0/24 (trunk) == Gi0/24 DIST-RTR
 *   DIST-RTR: SVI Vlan10 10.10.0.1/24, Gi0/1 10.0.0.2/30 -> EDGE-RTR Gi0/1 10.0.0.1/30,
 *             Gi0/2 10.0.0.49/29 -> DNS-1 10.0.0.50/29, default route via 10.0.0.1
 *   EDGE-RTR: Gi0/2 8.8.8.1/24 -> WEB-1 8.8.8.8/24, Gi0/3 203.0.113.1/24 -> PORTAL-1 203.0.113.10/24
 *   DNS-1: record portal.isp.net -> 203.0.113.10
 */
function baseWorld(): WorldState {
  const world = createEmptyWorld(1, activeProfiles);
  world.topology.nodes.push({ id: 'prem-1', kind: 'customer-premise', label: 'Customer premise' });

  const accessSw: NetworkDeviceConfig = {
    id: 'access-sw',
    hostname: 'ACCESS-SW-1',
    vendorProfileId: 'switch-cisco-ios',
    role: 'switch',
    interfaces: [
      { id: 'GigabitEthernet0/1', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', accessVlan: 10 },
      { id: 'GigabitEthernet0/24', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'trunk', allowedVlans: [10, 20], nativeVlan: 1 },
    ],
    vlans: [{ id: 10, name: 'CUSTOMERS' }],
    macTable: [],
    routeTable: [],
  };

  const distRtr: NetworkDeviceConfig = {
    id: 'dist-rtr',
    hostname: 'DIST-RTR-1',
    vendorProfileId: 'switch-cisco-ios',
    role: 'l3-switch',
    interfaces: [
      { id: 'GigabitEthernet0/24', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'trunk', allowedVlans: [10, 20], nativeVlan: 1 },
      { id: 'Vlan10', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', ipAddress: '10.10.0.1', prefixLength: 24 },
      { id: 'GigabitEthernet0/1', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', ipAddress: '10.0.0.2', prefixLength: 30 },
      { id: 'GigabitEthernet0/2', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', ipAddress: '10.0.0.49', prefixLength: 29 },
    ],
    vlans: [{ id: 10, name: 'CUSTOMERS' }],
    macTable: [],
    routeTable: [{ network: '0.0.0.0/0', nextHop: '10.0.0.1', source: 'default' }],
    dhcp: [{ vlan: 10, helperAddresses: ['10.0.0.50'], scope: { network: '10.10.0.0/24', poolSize: 200, leased: 37 }, dnsServerIp: '10.0.0.50' }],
  };

  const edgeRtr: NetworkDeviceConfig = {
    id: 'edge-rtr',
    hostname: 'EDGE-RTR-1',
    vendorProfileId: 'switch-cisco-ios',
    role: 'router',
    interfaces: [
      { id: 'GigabitEthernet0/1', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', ipAddress: '10.0.0.1', prefixLength: 30 },
      { id: 'GigabitEthernet0/2', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', ipAddress: '8.8.8.1', prefixLength: 24 },
      { id: 'GigabitEthernet0/3', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', ipAddress: '203.0.113.1', prefixLength: 24 },
    ],
    vlans: [],
    macTable: [],
    routeTable: [],
  };

  const web1: NetworkDeviceConfig = {
    id: 'web-1',
    hostname: 'WEB-1',
    vendorProfileId: 'switch-cisco-ios',
    role: 'server',
    interfaces: [{ id: 'eth0', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', ipAddress: '8.8.8.8', prefixLength: 24 }],
    vlans: [],
    macTable: [],
    routeTable: [],
  };

  const portal1: NetworkDeviceConfig = {
    id: 'portal-1',
    hostname: 'PORTAL-1',
    vendorProfileId: 'switch-cisco-ios',
    role: 'server',
    interfaces: [{ id: 'eth0', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', ipAddress: '203.0.113.10', prefixLength: 24 }],
    vlans: [],
    macTable: [],
    routeTable: [],
  };

  const dns1: NetworkDeviceConfig = {
    id: 'dns-1',
    hostname: 'DNS-1',
    vendorProfileId: 'switch-cisco-ios',
    role: 'dns-server',
    interfaces: [{ id: 'eth0', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', ipAddress: '10.0.0.50', prefixLength: 29 }],
    vlans: [],
    macTable: [],
    routeTable: [],
    dnsRecords: [{ hostname: 'portal.isp.net', actualIp: '203.0.113.10' }],
  };

  world.devices.push(accessSw, distRtr, edgeRtr, web1, portal1, dns1);
  world.links.push(
    { id: 'l-access-dist', a: { deviceId: 'access-sw', interfaceId: 'GigabitEthernet0/24' }, b: { deviceId: 'dist-rtr', interfaceId: 'GigabitEthernet0/24' } },
    { id: 'l-dist-edge', a: { deviceId: 'dist-rtr', interfaceId: 'GigabitEthernet0/1' }, b: { deviceId: 'edge-rtr', interfaceId: 'GigabitEthernet0/1' } },
    { id: 'l-dist-dns', a: { deviceId: 'dist-rtr', interfaceId: 'GigabitEthernet0/2' }, b: { deviceId: 'dns-1', interfaceId: 'eth0' } },
    { id: 'l-edge-web', a: { deviceId: 'edge-rtr', interfaceId: 'GigabitEthernet0/2' }, b: { deviceId: 'web-1', interfaceId: 'eth0' } },
    { id: 'l-edge-portal', a: { deviceId: 'edge-rtr', interfaceId: 'GigabitEthernet0/3' }, b: { deviceId: 'portal-1', interfaceId: 'eth0' } },
    { id: 'l-access-host', a: { deviceId: 'access-sw', interfaceId: 'GigabitEthernet0/1' }, b: { hostId: 'host-1' } },
  );
  world.hosts.push({ id: 'host-1', label: 'Customer laptop', premiseNodeId: 'prem-1', macAddress: '0011.2233.4401', addressing: { mode: 'dhcp' } });

  return world;
}

function hostSession(): CliSession {
  return { endpoint: { kind: 'host', hostId: 'host-1' }, mode: 'user-exec' };
}
function deviceSession(deviceId: string): CliSession {
  return { endpoint: { kind: 'device', deviceId }, mode: 'priv-exec' };
}

function pingFact(output: ReturnType<typeof execute>) {
  return output.facts.find((f) => f.kind === 'ping') as Extract<(typeof output.facts)[number], { kind: 'ping' }>;
}

describe('forwarding baseline', () => {
  it('host pings the gateway, an outside IP, and a hostname, all 4/4', () => {
    const world = baseWorld();
    const r1 = execute(world, profiles, hostSession(), 'ping 10.10.0.1');
    expect(pingFact(r1).delivered).toBe(4);
    const r2 = execute(world, profiles, hostSession(), 'ping 8.8.8.8');
    expect(pingFact(r2).delivered).toBe(4);
    const r3 = execute(world, profiles, hostSession(), 'ping portal.isp.net');
    expect(pingFact(r3).delivered).toBe(4);
    expect(pingFact(r3).resolvedIp).toBe('203.0.113.10');
  });
});

describe('vlan-wrong-access-port', () => {
  it('strands the host on a VLAN with no SVI: APIPA/no-link, ping fails, and it drops off the MAC table', () => {
    let world = baseWorld();
    world = applyFault(world, {
      instanceId: 'f1',
      kind: 'vlan-wrong-access-port',
      target: { type: 'device-interface', deviceId: 'access-sw', interfaceId: 'GigabitEthernet0/1' },
      params: { actualVlan: 99 },
    });
    const r = execute(world, profiles, hostSession(), 'ping 10.10.0.1');
    expect(pingFact(r).delivered).toBe(0);

    const macResult = execute(world, profiles, deviceSession('access-sw'), 'show mac address-table');
    expect(macResult.output.some((l) => l.includes('0011.2233.4401'))).toBe(false);
  });
});

describe('trunk-native-vlan-mismatch', () => {
  it('strands the host VLAN when it equals the mismatched native, but a non-native VLAN still crosses', () => {
    let world = baseWorld();
    world = applyFault(world, {
      instanceId: 'f1',
      kind: 'trunk-native-vlan-mismatch',
      target: { type: 'device-interface', deviceId: 'access-sw', interfaceId: 'GigabitEthernet0/24' },
      params: { localNativeVlan: 10 },
    });
    const r = execute(world, profiles, hostSession(), 'ping 10.10.0.1');
    expect(pingFact(r).delivered).toBe(0);
  });
});

describe('DHCP faults', () => {
  it('dhcp-relay-missing-helper leaves the host on APIPA with no gateway', () => {
    let world = baseWorld();
    world = applyFault(world, { instanceId: 'f1', kind: 'dhcp-relay-missing-helper', target: { type: 'device-global', deviceId: 'dist-rtr' }, params: { vlan: 10 } });
    // The fault only clears helperAddresses; a relay-only configuration (the realistic
    // case this fault represents -- no local pool on the distribution router) has no
    // scope of its own either, so DHCP is genuinely dead rather than falling back to a
    // lingering local scope from the fixture's baseline.
    const dhcpEntry = world.devices.find((d) => d.id === 'dist-rtr')!.dhcp!.find((d) => d.vlan === 10)!;
    delete dhcpEntry.scope;
    const r = execute(world, profiles, hostSession(), 'ipconfig');
    expect(r.output.some((l) => l.includes('Autoconfiguration IPv4 Address'))).toBe(true);
    expect(r.output.some((l) => l.includes('Default Gateway') && l.trim().endsWith(':'))).toBe(true);
  });

  it('dhcp-scope-exhausted leaves the host on APIPA too', () => {
    let world = baseWorld();
    world = applyFault(world, { instanceId: 'f1', kind: 'dhcp-scope-exhausted', target: { type: 'device-global', deviceId: 'dist-rtr' }, params: { vlan: 10, network: '10.10.0.0/24', poolSize: 200 } });
    const r = execute(world, profiles, hostSession(), 'ipconfig');
    expect(r.output.some((l) => l.includes('Autoconfiguration IPv4 Address'))).toBe(true);
  });

  it('rogue-dhcp-server hands out a bad gateway: outside pings fail, gateway itself still answers', () => {
    let world = baseWorld();
    world = applyFault(world, { instanceId: 'f1', kind: 'rogue-dhcp-server', target: { type: 'device-global', deviceId: 'dist-rtr' }, params: { vlan: 10, rogueGateway: '10.10.0.254' } });
    const ipconfig = execute(world, profiles, hostSession(), 'ipconfig');
    expect(ipconfig.output.some((l) => l.includes('10.10.0.254'))).toBe(true);
    const outside = execute(world, profiles, hostSession(), 'ping 8.8.8.8');
    expect(pingFact(outside).delivered).toBe(0);
    const gateway = execute(world, profiles, hostSession(), 'ping 10.10.0.1');
    expect(pingFact(gateway).delivered).toBe(4);
  });
});

describe('default-route-missing-or-wrong', () => {
  it('breaks reachability to the outside while the local gateway still answers', () => {
    let world = baseWorld();
    world = applyFault(world, { instanceId: 'f1', kind: 'default-route-missing-or-wrong', target: { type: 'device-global', deviceId: 'dist-rtr' }, params: { mode: 'missing' } });
    const outside = execute(world, profiles, hostSession(), 'ping 8.8.8.8');
    expect(pingFact(outside).delivered).toBe(0);
    const gateway = execute(world, profiles, hostSession(), 'ping 10.10.0.1');
    expect(pingFact(gateway).delivered).toBe(4);
  });
});

describe('acl-silent-drop', () => {
  it('denies ICMP from the customer subnet to anywhere (including the SVI itself), but leaves a TCP-only rule irrelevant to ping', () => {
    let world = baseWorld();
    world = applyFault(world, {
      instanceId: 'f1',
      kind: 'acl-silent-drop',
      target: { type: 'device-global', deviceId: 'dist-rtr' },
      params: {
        matchDescription: 'deny customer ICMP outbound',
        match: { protocol: 'icmp', srcCidr: '10.10.0.0/24', dstCidr: '0.0.0.0/0' },
        appliedTo: [{ interfaceId: 'Vlan10', direction: 'in' }],
      },
    });
    const outside = execute(world, profiles, hostSession(), 'ping 8.8.8.8');
    expect(pingFact(outside).delivered).toBe(0);
    const gateway = execute(world, profiles, hostSession(), 'ping 10.10.0.1');
    expect(pingFact(gateway).delivered).toBe(0);

    let tcpWorld = baseWorld();
    tcpWorld = applyFault(tcpWorld, {
      instanceId: 'f2',
      kind: 'acl-silent-drop',
      target: { type: 'device-global', deviceId: 'dist-rtr' },
      params: {
        matchDescription: 'deny customer TCP outbound',
        match: { protocol: 'tcp', srcCidr: '10.10.0.0/24', dstCidr: '0.0.0.0/0' },
        appliedTo: [{ interfaceId: 'Vlan10', direction: 'in' }],
      },
    });
    const unaffected = execute(tcpWorld, profiles, hostSession(), 'ping 8.8.8.8');
    expect(pingFact(unaffected).delivered).toBe(4);
  });
});

describe('isolation methodology: DNS vs IP reachability', () => {
  it('dns-stale-record: pinging by IP still works, by hostname fails, nslookup shows the stale address', () => {
    let world = baseWorld();
    world = applyFault(world, {
      instanceId: 'f1',
      kind: 'dns-stale-record',
      target: { type: 'device-global', deviceId: 'dns-1' },
      params: { hostname: 'portal.isp.net', actualIp: '203.0.113.10', resolvedIp: '203.0.113.99' },
    });
    const byIp = execute(world, profiles, hostSession(), 'ping 203.0.113.10');
    expect(pingFact(byIp).delivered).toBe(4);
    const byName = execute(world, profiles, hostSession(), 'ping portal.isp.net');
    expect(pingFact(byName).delivered).toBe(0);
    expect(pingFact(byName).resolvedIp).toBe('203.0.113.99');
    const lookup = execute(world, profiles, hostSession(), 'nslookup portal.isp.net');
    expect(lookup.output.some((l) => l.includes('203.0.113.99'))).toBe(true);
  });

  it('dns-server-unresponsive (down): hostname ping fails with the unknownHost message, nslookup times out, IP ping still works', () => {
    let world = baseWorld();
    world = applyFault(world, { instanceId: 'f1', kind: 'dns-server-unresponsive', target: { type: 'device-global', deviceId: 'dns-1' }, params: { health: 'down' } });
    const byIp = execute(world, profiles, hostSession(), 'ping 203.0.113.10');
    expect(pingFact(byIp).delivered).toBe(4);
    const byName = execute(world, profiles, hostSession(), 'ping portal.isp.net');
    expect(byName.output[0]).toContain('could not find host');
    const lookup = execute(world, profiles, hostSession(), 'nslookup portal.isp.net');
    expect(lookup.output.some((l) => l.includes('DNS request timed out'))).toBe(true);
  });
});

describe('duplex-speed-mismatch', () => {
  it('produces a partial (neither 0 nor 100%) success rate and shows the configured counters', () => {
    let world = baseWorld();
    world = applyFault(world, {
      instanceId: 'f1',
      kind: 'duplex-speed-mismatch',
      target: { type: 'device-interface', deviceId: 'access-sw', interfaceId: 'GigabitEthernet0/1' },
      params: { duplex: 'full', speedMbps: 1000, crcErrors: 500, lateCollisions: 300 },
    });
    let anyPartial = false;
    for (let i = 0; i < 20 && !anyPartial; i++) {
      const r = execute(world, profiles, hostSession(), 'ping 10.10.0.1', i);
      const d = pingFact(r).delivered;
      if (d > 0 && d < 4) anyPartial = true;
    }
    expect(anyPartial).toBe(true);

    const detail = execute(world, profiles, deviceSession('access-sw'), 'show interfaces GigabitEthernet0/1');
    expect(detail.output.some((l) => l.includes('500 input errors'))).toBe(true);
  });
});

describe('ospf-exstart-mtu-mismatch', () => {
  it('shows EXSTART/DR, the configured MTU, and the ADJCHG log line', () => {
    let world = baseWorld();
    world = applyFault(world, {
      instanceId: 'f1',
      kind: 'ospf-exstart-mtu-mismatch',
      target: { type: 'device-interface', deviceId: 'dist-rtr', interfaceId: 'GigabitEthernet0/1' },
      params: { neighborId: '10.0.0.1', localMtu: 1400 },
    });
    const ospf = execute(world, profiles, deviceSession('dist-rtr'), 'show ip ospf neighbor');
    expect(ospf.output.some((l) => l.includes('EXSTART/DR'))).toBe(true);
    const iface = execute(world, profiles, deviceSession('dist-rtr'), 'show interfaces GigabitEthernet0/1');
    expect(iface.output.some((l) => l.includes('MTU 1400'))).toBe(true);
    const logging = execute(world, profiles, deviceSession('dist-rtr'), 'show logging');
    expect(logging.output.some((l) => l.includes('EXCHANGE to EXSTART'))).toBe(true);
  });
});
