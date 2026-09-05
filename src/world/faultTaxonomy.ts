/**
 * The fault taxonomy: the catalog of diagnosable problems a scenario author can place
 * into a WorldState. Each entry validates its own instance parameters (Zod) and applies
 * itself as a pure mutation of a *cloned* world state — never as canned instrument text.
 * Instruments (OTDR, CLI — built in later stages) read the resulting state; they never
 * know a "fault" was placed at all.
 *
 * This is NOT the full vocabulary of things that can exist on a fiber span — ordinary,
 * in-spec splices/connectors/splitters are just FiberEvents (see world/types.ts) that a
 * scenario author places directly. This file only covers the subset that are the
 * trainee's actual problem to find, per the spec's minimum fault lists.
 */
import { z } from 'zod';
import type { DhcpConfig, FaultInstance, FaultTarget, FiberTubeColor, NetworkDeviceConfig, WorldState } from './types';
import { addFiberEvent, cloneWorld, findDevice, findInterface, findNode, findSpan } from './worldState';

export type FaultDomain = 'optical' | 'network' | 'compliance';

export interface FaultDefinition<P = Record<string, unknown>> {
  id: string;
  domain: FaultDomain;
  label: string;
  description: string;
  appliesTo: FaultTarget['type'];
  /** Lowest difficulty tier (1-6) this fault is appropriate for, per the spec's difficulty ladder. */
  minTier: number;
  paramsSchema: z.ZodType<P>;
  apply: (world: WorldState, instance: FaultInstance & { params: P }) => WorldState;
}

const tubeColor = z.enum([
  'blue', 'orange', 'green', 'brown', 'slate', 'white',
  'red', 'black', 'yellow', 'violet', 'rose', 'aqua',
]) satisfies z.ZodType<FiberTubeColor>;

function span(instance: FaultInstance, world: WorldState) {
  if (instance.target.type !== 'fiber-span') {
    throw new Error(`Fault ${instance.kind} requires a fiber-span target`);
  }
  return findSpan(world, instance.target.spanId);
}

function deviceIface(instance: FaultInstance, world: WorldState) {
  if (instance.target.type !== 'device-interface') {
    throw new Error(`Fault ${instance.kind} requires a device-interface target`);
  }
  const device = findDevice(world, instance.target.deviceId);
  const iface = findInterface(device, instance.target.interfaceId);
  return { device, iface };
}

function deviceOnly(instance: FaultInstance, world: WorldState) {
  if (instance.target.type !== 'device-global') {
    throw new Error(`Fault ${instance.kind} requires a device-global target`);
  }
  return findDevice(world, instance.target.deviceId);
}

function siteNode(instance: FaultInstance, world: WorldState) {
  if (instance.target.type !== 'site') {
    throw new Error(`Fault ${instance.kind} requires a site target`);
  }
  return findNode(world, instance.target.nodeId);
}

/** Finds this device's DHCP config entry for a VLAN, creating an empty one if absent. */
function dhcpEntryForVlan(device: NetworkDeviceConfig, vlan: number): DhcpConfig {
  const list = device.dhcp ?? (device.dhcp = []);
  const existing = list.find((d) => d.vlan === vlan);
  if (existing) return existing;
  const created: DhcpConfig = { vlan, helperAddresses: [] };
  list.push(created);
  return created;
}

// ---------------------------------------------------------------------------
// Optical / outside-plant faults
// ---------------------------------------------------------------------------

const opticalFaults: FaultDefinition<any>[] = [
  {
    id: 'fusion-splice-degraded',
    domain: 'optical',
    label: 'Degraded fusion splice',
    description:
      'A fusion splice with loss elevated above the normal 0.02-0.10 dB range, typically from a bad cleave, contamination, or a miscalibrated arc.',
    appliesTo: 'fiber-span',
    minTier: 2,
    paramsSchema: z.object({
      positionMeters: z.number().nonnegative(),
      lossDb: z.number().min(0.1),
      causeTag: z.string().optional(),
    }),
    apply(world, instance) {
      const w = world;
      const s = span(instance, w);
      addFiberEvent(s, {
        id: instance.instanceId,
        kind: 'fusion-splice',
        positionMeters: instance.params.positionMeters,
        lossDb: instance.params.lossDb,
        causeTag: instance.params.causeTag,
      });
      return w;
    },
  },
  {
    id: 'connector-dirty',
    domain: 'optical',
    label: 'Dirty or damaged connector',
    description:
      'Elevated loss and reflectance rising toward -35 dB, worst case approaching the glass-to-air value near -14 dB.',
    appliesTo: 'fiber-span',
    minTier: 2,
    paramsSchema: z.object({
      positionMeters: z.number().nonnegative(),
      lossDb: z.number().min(0.75),
      reflectanceDb: z.number().max(-14).min(-35),
    }),
    apply(world, instance) {
      const s = span(instance, world);
      addFiberEvent(s, {
        id: instance.instanceId,
        kind: 'connector-dirty',
        positionMeters: instance.params.positionMeters,
        lossDb: instance.params.lossDb,
        reflectanceDb: instance.params.reflectanceDb,
      });
      return world;
    },
  },
  {
    id: 'macrobend',
    domain: 'optical',
    label: 'Macrobend',
    description:
      'Non-reflective loss that is strongly wavelength-dependent (much larger at 1550 nm than 1310 nm) — the differential a competent tech uses to rule out a bad splice.',
    appliesTo: 'fiber-span',
    minTier: 2,
    paramsSchema: z.object({
      positionMeters: z.number().nonnegative(),
      severity: z.enum(['light', 'moderate', 'severe']).default('moderate'),
      /** Explicit override; if omitted, derived from severity below. */
      lossDbByWavelength: z
        .object({ '1310': z.number(), '1550': z.number(), '1625': z.number() })
        .partial()
        .optional(),
      causeTag: z.string().optional(),
    }),
    apply(world, instance) {
      const s = span(instance, world);
      const severity = instance.params.severity as 'light' | 'moderate' | 'severe';
      const preset = MACROBEND_SEVERITY_PRESETS[severity];
      addFiberEvent(s, {
        id: instance.instanceId,
        kind: 'macrobend',
        positionMeters: instance.params.positionMeters,
        lossDbByWavelength: instance.params.lossDbByWavelength ?? preset,
        causeTag: instance.params.causeTag,
      });
      return world;
    },
  },
  {
    id: 'fiber-break',
    domain: 'optical',
    label: 'Fiber break',
    description: 'Crushed, shattered, or severed fiber. Loss drops to the noise floor with little or no reflection.',
    appliesTo: 'fiber-span',
    minTier: 4,
    paramsSchema: z.object({
      positionMeters: z.number().nonnegative(),
      cause: z.enum(['dig-strike', 'vehicle-strike', 'rodent', 'weather', 'unknown']).default('unknown'),
    }),
    apply(world, instance) {
      const s = span(instance, world);
      addFiberEvent(s, {
        id: instance.instanceId,
        kind: 'fiber-break',
        positionMeters: instance.params.positionMeters,
        lossDb: 60, // effectively opaque; OTDR module treats this as "to the noise floor"
        causeTag: instance.params.cause,
      });
      return world;
    },
  },
  {
    id: 'mismatched-fiber-splice',
    domain: 'optical',
    label: 'Mismatched-fiber splice (gainer)',
    description:
      'A splice between fibers with different backscatter coefficients reads as apparent gain in one test direction. Bidirectional averaging resolves it.',
    appliesTo: 'fiber-span',
    minTier: 5,
    paramsSchema: z.object({
      positionMeters: z.number().nonnegative(),
      backscatterDeltaDb: z.number(),
    }),
    apply(world, instance) {
      const s = span(instance, world);
      addFiberEvent(s, {
        id: instance.instanceId,
        kind: 'mismatched-fiber-splice',
        positionMeters: instance.params.positionMeters,
        lossDb: -Math.abs(instance.params.backscatterDeltaDb),
        backscatterDeltaDb: instance.params.backscatterDeltaDb,
      });
      return world;
    },
  },
  {
    id: 'wrong-tube-continuity',
    domain: 'optical',
    label: 'Wrong tube/fiber rolled at a splice point',
    description:
      "A technician spliced through the wrong tube or fiber at a closure — feeder/distribution/backbone/dark-spare confused — breaking continuity even though the splice itself may measure fine.",
    appliesTo: 'fiber-span',
    minTier: 4,
    paramsSchema: z.object({
      tubeColor,
      fiberColor: tubeColor,
      rollType: z.enum(['wrong-tube', 'wrong-fiber', 'spliced-into-dark-spare']),
      actualTubeColor: tubeColor.optional(),
      actualFiberColor: tubeColor.optional(),
    }),
    apply(world, instance) {
      const s = span(instance, world);
      const strands = s.strands ?? [];
      const target = strands.find(
        (st) => st.tubeColor === instance.params.tubeColor && st.fiberColor === instance.params.fiberColor,
      );
      if (!target) {
        throw new Error(
          `wrong-tube-continuity: no strand ${instance.params.tubeColor}/${instance.params.fiberColor} on span ${s.id}`,
        );
      }
      target.continuityBroken = true;
      if (instance.params.actualTubeColor && instance.params.actualFiberColor) {
        const wrongTarget = strands.find(
          (st) =>
            st.tubeColor === instance.params.actualTubeColor && st.fiberColor === instance.params.actualFiberColor,
        );
        if (wrongTarget) wrongTarget.unexpectedlyActivated = true;
      }
      return world;
    },
  },
  {
    id: 'fat-power-out-of-spec',
    domain: 'optical',
    label: 'FAT optical power out of spec',
    description: 'Optical power measured at a field access terminal test point is too high or too low relative to the expected window.',
    appliesTo: 'site',
    minTier: 2,
    paramsSchema: z.object({
      measuredDbm: z.number(),
      direction: z.enum(['high', 'low']),
    }),
    apply(world, instance) {
      const node = siteNode(instance, world);
      node.attributes = {
        ...node.attributes,
        opticalPowerDbm: instance.params.measuredDbm,
        powerFaultDirection: instance.params.direction,
      };
      return world;
    },
  },
];

const MACROBEND_SEVERITY_PRESETS: Record<'light' | 'moderate' | 'severe', { '1310': number; '1550': number; '1625': number }> = {
  light: { '1310': 0.05, '1550': 0.3, '1625': 0.6 },
  moderate: { '1310': 0.2, '1550': 1.5, '1625': 3.0 },
  severe: { '1310': 1.0, '1550': 6.0, '1625': 10.0 },
};

// ---------------------------------------------------------------------------
// Network / device-config faults (access-distribution layer; see Stage 1 scope flag —
// backbone-layer BGP/MPLS faults are explicitly deferred to a later stage)
// ---------------------------------------------------------------------------

const networkFaults: FaultDefinition<any>[] = [
  {
    id: 'vlan-wrong-access-port',
    domain: 'network',
    label: 'Access port in the wrong VLAN',
    description: 'An access port is assigned to a VLAN other than the one the customer/service expects.',
    appliesTo: 'device-interface',
    minTier: 2,
    paramsSchema: z.object({ actualVlan: z.number().int().positive() }),
    apply(world, instance) {
      const { iface } = deviceIface(instance, world);
      iface.mode = 'access';
      iface.accessVlan = instance.params.actualVlan;
      return world;
    },
  },
  {
    id: 'trunk-missing-allowed-vlan',
    domain: 'network',
    label: 'Trunk missing an allowed VLAN',
    description: 'A trunk port\'s allowed-VLAN list is missing a VLAN that traffic needs to cross.',
    appliesTo: 'device-interface',
    minTier: 3,
    paramsSchema: z.object({ allowedVlans: z.array(z.number().int().positive()), missingVlan: z.number().int().positive() }),
    apply(world, instance) {
      const { iface } = deviceIface(instance, world);
      iface.mode = 'trunk';
      iface.allowedVlans = instance.params.allowedVlans.filter((v: number) => v !== instance.params.missingVlan);
      return world;
    },
  },
  {
    id: 'trunk-native-vlan-mismatch',
    domain: 'network',
    label: 'Native VLAN mismatch across a trunk',
    description: "This side's native VLAN differs from the far end's, which a scenario's paired device config establishes.",
    appliesTo: 'device-interface',
    minTier: 3,
    paramsSchema: z.object({ localNativeVlan: z.number().int().positive() }),
    apply(world, instance) {
      const { iface } = deviceIface(instance, world);
      iface.mode = 'trunk';
      iface.nativeVlan = instance.params.localNativeVlan;
      return world;
    },
  },
  {
    id: 'duplex-speed-mismatch',
    domain: 'network',
    label: 'Duplex or speed mismatch',
    description: 'Produces late collisions and CRC errors on the link.',
    appliesTo: 'device-interface',
    minTier: 2,
    paramsSchema: z.object({
      duplex: z.enum(['full', 'half', 'auto']),
      speedMbps: z.number().positive(),
      crcErrors: z.number().nonnegative().default(0),
      lateCollisions: z.number().nonnegative().default(0),
    }),
    apply(world, instance) {
      const { iface } = deviceIface(instance, world);
      iface.duplex = instance.params.duplex;
      iface.speedMbps = instance.params.speedMbps;
      iface.crcErrors = instance.params.crcErrors;
      iface.lateCollisions = instance.params.lateCollisions;
      return world;
    },
  },
  {
    id: 'port-security-violation-errdisabled',
    domain: 'network',
    label: 'Port security violation (err-disabled)',
    description: 'A port security violation has left the port err-disabled.',
    appliesTo: 'device-interface',
    minTier: 3,
    paramsSchema: z.object({ maxMac: z.number().int().positive().default(1) }),
    apply(world, instance) {
      const { device, iface } = deviceIface(instance, world);
      iface.portSecurity = { enabled: true, maxMac: instance.params.maxMac, state: 'err-disabled' };
      iface.lineStatus = 'down';
      device.logLines = [...(device.logLines ?? []), `%PORT_SECURITY-2-PSECURE_VIOLATION: on interface ${iface.id}`];
      return world;
    },
  },
  {
    id: 'stp-unexpected-blocking',
    domain: 'network',
    label: 'Spanning tree blocking an unexpected port',
    description: 'STP is blocking a port after a topology change, in a way the trainee did not expect.',
    appliesTo: 'device-interface',
    minTier: 3,
    paramsSchema: z.object({}),
    apply(world, instance) {
      const { iface } = deviceIface(instance, world);
      iface.stpState = 'blocking';
      return world;
    },
  },
  {
    id: 'dhcp-relay-missing-helper',
    domain: 'network',
    label: 'Missing ip helper-address',
    description: 'DHCP is broken across a VLAN boundary because the relay helper address is missing.',
    appliesTo: 'device-global',
    minTier: 3,
    paramsSchema: z.object({ vlan: z.number().int().positive() }),
    apply(world, instance) {
      const device = deviceOnly(instance, world);
      dhcpEntryForVlan(device, instance.params.vlan).helperAddresses = [];
      return world;
    },
  },
  {
    id: 'dhcp-scope-exhausted',
    domain: 'network',
    label: 'DHCP scope exhaustion',
    description: 'The DHCP pool for a VLAN has no addresses left to lease.',
    appliesTo: 'device-global',
    minTier: 3,
    paramsSchema: z.object({ vlan: z.number().int().positive(), network: z.string(), poolSize: z.number().int().positive() }),
    apply(world, instance) {
      const device = deviceOnly(instance, world);
      const entry = dhcpEntryForVlan(device, instance.params.vlan);
      entry.scope = { network: instance.params.network, poolSize: instance.params.poolSize, leased: instance.params.poolSize };
      return world;
    },
  },
  {
    id: 'rogue-dhcp-server',
    domain: 'network',
    label: 'Rogue DHCP server',
    description: 'An unauthorized DHCP server is handing out a wrong gateway.',
    appliesTo: 'device-global',
    minTier: 4,
    paramsSchema: z.object({ vlan: z.number().int().positive(), rogueGateway: z.string() }),
    apply(world, instance) {
      const device = deviceOnly(instance, world);
      const entry = dhcpEntryForVlan(device, instance.params.vlan);
      entry.rogueDetected = { rogueGateway: instance.params.rogueGateway };
      device.logLines = [...(device.logLines ?? []), `%DHCP_SNOOPING-4-DHCP_SNOOPING_UNTRUSTED_PORT: rogue server offering gateway ${instance.params.rogueGateway}`];
      return world;
    },
  },
  {
    id: 'default-route-missing-or-wrong',
    domain: 'network',
    label: 'Default route absent or pointing at the wrong next hop',
    description: 'No default route exists, or it points somewhere it should not.',
    appliesTo: 'device-global',
    minTier: 3,
    paramsSchema: z.object({ mode: z.enum(['missing', 'wrong-next-hop']), wrongNextHop: z.string().optional() }),
    apply(world, instance) {
      const device = deviceOnly(instance, world);
      device.routeTable = device.routeTable.filter((r) => r.network !== '0.0.0.0/0');
      if (instance.params.mode === 'wrong-next-hop') {
        device.routeTable.push({ network: '0.0.0.0/0', nextHop: instance.params.wrongNextHop, source: 'static' });
      }
      return world;
    },
  },
  {
    id: 'subnet-mask-typo-overlap',
    domain: 'network',
    label: 'Subnet mask typo creating an overlap',
    description: 'A mistyped subnet mask on a connected route creates an address overlap with another route.',
    appliesTo: 'device-global',
    minTier: 3,
    paramsSchema: z.object({ interfaceId: z.string(), wrongCidr: z.string() }),
    apply(world, instance) {
      const device = deviceOnly(instance, world);
      device.routeTable = device.routeTable.filter(
        (r) => !(r.source === 'connected' && r.interfaceId === instance.params.interfaceId),
      );
      device.routeTable.push({ network: instance.params.wrongCidr, interfaceId: instance.params.interfaceId, source: 'connected' });
      return world;
    },
  },
  {
    id: 'acl-silent-drop',
    domain: 'network',
    label: 'ACL silently dropping traffic',
    description: 'An access list is dropping the traffic in question without any obvious error to the customer.',
    appliesTo: 'device-global',
    minTier: 4,
    paramsSchema: z.object({ matchDescription: z.string() }),
    apply(world, instance) {
      const device = deviceOnly(instance, world);
      device.acls = [
        ...(device.acls ?? []),
        { id: instance.instanceId, action: 'deny', matchDescription: instance.params.matchDescription },
      ];
      return world;
    },
  },
  {
    id: 'ospf-exstart-mtu-mismatch',
    domain: 'network',
    label: 'OSPF adjacency stuck in EXSTART (MTU mismatch)',
    description: 'An MTU mismatch between neighbors stalls the adjacency in EXSTART.',
    appliesTo: 'device-interface',
    minTier: 4,
    paramsSchema: z.object({ neighborId: z.string() }),
    apply(world, instance) {
      const { device, iface } = deviceIface(instance, world);
      device.ospfNeighbors = [
        ...(device.ospfNeighbors ?? []).filter((n) => n.interfaceId !== iface.id),
        { neighborId: instance.params.neighborId, interfaceId: iface.id, state: 'exstart', mtuMismatch: true },
      ];
      return world;
    },
  },
  {
    id: 'dns-stale-record',
    domain: 'network',
    label: 'DNS resolving to a stale record',
    description: 'DNS resolves a hostname to a stale IP while the host remains reachable directly by its real IP.',
    appliesTo: 'device-global',
    minTier: 5,
    paramsSchema: z.object({ hostname: z.string(), actualIp: z.string(), resolvedIp: z.string() }),
    apply(world, instance) {
      const device = deviceOnly(instance, world);
      device.dnsRecords = [
        ...(device.dnsRecords ?? []).filter((r) => r.hostname !== instance.params.hostname),
        { hostname: instance.params.hostname, actualIp: instance.params.actualIp, stale: true, resolvedIp: instance.params.resolvedIp },
      ];
      return world;
    },
  },
  {
    id: 'transceiver-rx-power-low',
    domain: 'network',
    label: 'Optical transceiver with receive power below threshold',
    description: 'The SFP/optic on this interface is reporting receive power below the acceptable range.',
    appliesTo: 'device-interface',
    minTier: 2,
    paramsSchema: z.object({ rxPowerDbm: z.number(), txPowerDbm: z.number().optional(), temperatureC: z.number().optional() }),
    apply(world, instance) {
      const { iface } = deviceIface(instance, world);
      iface.transceiver = {
        present: true,
        rxPowerDbm: instance.params.rxPowerDbm,
        txPowerDbm: instance.params.txPowerDbm ?? iface.transceiver?.txPowerDbm ?? 2.0,
        temperatureC: instance.params.temperatureC ?? iface.transceiver?.temperatureC ?? 35,
      };
      return world;
    },
  },
];

// ---------------------------------------------------------------------------
// Outside-plant compliance / safety faults
// ---------------------------------------------------------------------------

const complianceFaults: FaultDefinition<any>[] = [
  {
    id: 'locate-ticket-expired',
    domain: 'compliance',
    label: 'Locate ticket expired',
    description: 'The one-call ticket has expired and the marks need to be refreshed before digging.',
    appliesTo: 'site',
    minTier: 3,
    paramsSchema: z.object({ ticketOpenedDaysAgo: z.number().nonnegative(), validityDays: z.number().positive() }),
    apply(world, instance) {
      const node = siteNode(instance, world);
      node.attributes = {
        ...node.attributes,
        locateTicket: {
          openedDaysAgo: instance.params.ticketOpenedDaysAgo,
          validityDays: instance.params.validityDays,
          expired: instance.params.ticketOpenedDaysAgo > instance.params.validityDays,
        },
      };
      return world;
    },
  },
  {
    id: 'dig-inside-tolerance-zone',
    domain: 'compliance',
    label: 'Digging inside the tolerance zone',
    description: 'Machine digging occurred inside the marked tolerance zone around a facility.',
    appliesTo: 'site',
    minTier: 3,
    paramsSchema: z.object({ toleranceZoneInches: z.number().positive(), actualDistanceInches: z.number().nonnegative() }),
    apply(world, instance) {
      const node = siteNode(instance, world);
      node.attributes = {
        ...node.attributes,
        safetyViolation: {
          type: 'dig-inside-tolerance-zone',
          toleranceZoneInches: instance.params.toleranceZoneInches,
          actualDistanceInches: instance.params.actualDistanceInches,
          triggered: instance.params.actualDistanceInches < instance.params.toleranceZoneInches,
        },
      };
      return world;
    },
  },
  {
    id: 'aerial-strand-lasher-degraded',
    domain: 'compliance',
    label: 'Aerial strand/lasher condition',
    description: 'The support strand or lashing wire is corroded, loose, or broken.',
    appliesTo: 'site',
    minTier: 4,
    paramsSchema: z.object({ condition: z.enum(['corroded', 'loose', 'broken']) }),
    apply(world, instance) {
      const node = siteNode(instance, world);
      node.attributes = { ...node.attributes, aerialStrandLasher: instance.params.condition };
      return world;
    },
  },
  {
    id: 'aerial-midspan-sag',
    domain: 'compliance',
    label: 'Aerial mid-span sag',
    description: 'The cable sags below the expected clearance mid-span.',
    appliesTo: 'site',
    minTier: 4,
    paramsSchema: z.object({ sagInches: z.number().positive(), spanLengthFt: z.number().positive() }),
    apply(world, instance) {
      const node = siteNode(instance, world);
      node.attributes = {
        ...node.attributes,
        aerialMidspanSag: { sagInches: instance.params.sagInches, spanLengthFt: instance.params.spanLengthFt },
      };
      return world;
    },
  },
  {
    id: 'aerial-down-guy-damage',
    domain: 'compliance',
    label: 'Down guy damage',
    description: 'A down guy has been damaged, commonly from a vehicle strike.',
    appliesTo: 'site',
    minTier: 4,
    paramsSchema: z.object({ cause: z.string() }),
    apply(world, instance) {
      const node = siteNode(instance, world);
      node.attributes = { ...node.attributes, downGuyDamaged: { cause: instance.params.cause } };
      return world;
    },
  },
  {
    id: 'aerial-clearance-violation',
    domain: 'compliance',
    label: 'Roadway clearance violation',
    description: 'Cable clearance over the roadway is below the required minimum.',
    appliesTo: 'site',
    minTier: 4,
    paramsSchema: z.object({ clearanceFt: z.number().positive(), requiredClearanceFt: z.number().positive() }),
    apply(world, instance) {
      const node = siteNode(instance, world);
      node.attributes = {
        ...node.attributes,
        clearanceViolation: {
          clearanceFt: instance.params.clearanceFt,
          requiredClearanceFt: instance.params.requiredClearanceFt,
          triggered: instance.params.clearanceFt < instance.params.requiredClearanceFt,
        },
      };
      return world;
    },
  },
];

export const FAULT_TAXONOMY: FaultDefinition<any>[] = [...opticalFaults, ...networkFaults, ...complianceFaults];

export const FAULT_TAXONOMY_BY_ID: Record<string, FaultDefinition<any>> = Object.fromEntries(
  FAULT_TAXONOMY.map((f) => [f.id, f]),
);

/** Validates a fault instance's params against its taxonomy entry's schema and applies it to a clone of the world (the input is never mutated). Throws on an unknown kind or invalid params. */
export function applyFault(world: WorldState, instance: FaultInstance): WorldState {
  const def = FAULT_TAXONOMY_BY_ID[instance.kind];
  if (!def) throw new Error(`Unknown fault kind: ${instance.kind}`);
  const parsed = def.paramsSchema.parse(instance.params);
  const validated = { ...instance, params: parsed } as FaultInstance & { params: typeof parsed };
  const next = def.apply(cloneWorld(world), validated);
  next.appliedFaults = [...next.appliedFaults, validated];
  return next;
}
