/**
 * Zod schema for a scenario definition -- the authored YAML shape. A scenario is never
 * code: everything the trainee experiences (topology, devices, faults, hints, the
 * reference solution) is data here, validated once at load time so a broken scenario
 * never reaches a trainee. Mirrors the world (item 1), instrument (items 2-3), and
 * session (item 4) types; where a scenario field can be randomized per-seed, it grows an
 * optional `randomize` sibling instead of a second parallel type.
 */
import { z } from 'zod';

// --- Shared small schemas ----------------------------------------------------------

const TubeColorSchema = z.enum(['blue', 'orange', 'green', 'brown', 'slate', 'white', 'red', 'black', 'yellow', 'violet', 'rose', 'aqua']);
const FiberRoleSchema = z.enum(['feeder', 'distribution', 'backbone', 'dark', 'spare']);
const StrandRefSchema = z.object({ tubeColor: TubeColorSchema, fiberColor: TubeColorSchema });
const NumberRangeSchema = z.object({ min: z.number(), max: z.number() });
const WavelengthTripleSchema = z.object({ '1310': z.number().optional(), '1550': z.number().optional(), '1625': z.number().optional() });

const NodeKindSchema = z.enum(['olt', 'fdh', 'splitter', 'splice-closure', 'terminal', 'fat', 'ont', 'customer-premise', 'network-device', 'yard', 'pop']);

const FaultTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fiber-span'), spanId: z.string() }),
  z.object({ type: z.literal('device-interface'), deviceId: z.string(), interfaceId: z.string() }),
  z.object({ type: z.literal('device-global'), deviceId: z.string() }),
  z.object({ type: z.literal('site'), nodeId: z.string() }),
]);

// --- Topology -----------------------------------------------------------------------

const TopologyNodeSchema = z.object({
  id: z.string(),
  kind: NodeKindSchema,
  label: z.string(),
  equipmentRef: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

const FiberEventKindSchema = z.enum(['fusion-splice', 'mechanical-splice', 'connector-upc', 'connector-apc', 'connector-dirty', 'macrobend', 'splitter', 'fiber-end', 'fiber-break', 'mismatched-fiber-splice']);

const FiberEventSchema = z.object({
  id: z.string(),
  kind: FiberEventKindSchema,
  positionMeters: z.number().nonnegative(),
  lossDb: z.number().optional(),
  lossDbByWavelength: WavelengthTripleSchema.optional(),
  reflectanceDb: z.number().optional(),
  backscatterDeltaDb: z.number().optional(),
  splitRatio: z.string().optional(),
  causeTag: z.string().optional(),
  trueLossDb: z.number().optional(),
});

const FiberStrandSchema = z.object({
  tubeColor: TubeColorSchema,
  fiberColor: TubeColorSchema,
  role: FiberRoleSchema,
  live: z.boolean().optional(),
});

const FiberSpanSchema = z.object({
  id: z.string(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  lengthMeters: z.number().positive(),
  randomize: z.object({ lengthMeters: NumberRangeSchema.optional() }).optional(),
  iorOverride: WavelengthTripleSchema.optional(),
  fiberGeneration: z.enum(['legacy', 'low-water-peak']).optional(),
  liveService: z.boolean().optional(),
  backscatterOffsetDb: z.number().optional(),
  events: z.array(FiberEventSchema).default([]),
  strands: z.array(FiberStrandSchema).optional(),
});

// --- Devices, links, hosts ------------------------------------------------------------

const InterfaceStateSchema = z.object({
  id: z.string(),
  adminStatus: z.enum(['up', 'administratively-down']),
  lineStatus: z.enum(['up', 'down']),
  speedMbps: z.number(),
  duplex: z.enum(['full', 'half', 'auto']),
  mode: z.enum(['access', 'trunk']),
  accessVlan: z.number().int().positive().optional(),
  nativeVlan: z.number().int().positive().optional(),
  allowedVlans: z.array(z.number().int().positive()).optional(),
  portSecurity: z.object({ enabled: z.boolean(), maxMac: z.number().int().positive(), state: z.enum(['ok', 'err-disabled']) }).optional(),
  stpState: z.enum(['forwarding', 'blocking', 'listening', 'learning', 'disabled']).optional(),
  crcErrors: z.number().nonnegative().optional(),
  lateCollisions: z.number().nonnegative().optional(),
  transceiver: z.object({ present: z.boolean(), rxPowerDbm: z.number().optional(), txPowerDbm: z.number().optional(), temperatureC: z.number().optional() }).optional(),
  description: z.string().optional(),
  ipAddress: z.string().optional(),
  prefixLength: z.number().int().positive().optional(),
  macAddress: z.string().optional(),
  mtu: z.number().int().positive().optional(),
});

const OntRecordSchema = z.object({
  ontId: z.string(),
  serial: z.string(),
  provisionedSerial: z.string().optional(),
  ontNodeId: z.string(),
  misbehaving: z.literal('rogue-tx').optional(),
});

const PonPortStateSchema = z.object({
  id: z.string(),
  adminStatus: z.enum(['up', 'administratively-down']),
  spanId: z.string(),
  strand: StrandRefSchema.optional(),
  onts: z.array(OntRecordSchema),
});

const NetworkDeviceConfigSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  vendorProfileId: z.string(),
  interfaces: z.array(InterfaceStateSchema).default([]),
  vlans: z.array(z.object({ id: z.number().int().positive(), name: z.string() })).default([]),
  macTable: z.array(z.object({ mac: z.string(), vlan: z.number().int().positive(), interfaceId: z.string() })).default([]),
  routeTable: z.array(z.object({ network: z.string(), nextHop: z.string().optional(), interfaceId: z.string().optional(), source: z.enum(['connected', 'static', 'ospf', 'default']) })).default([]),
  dhcp: z
    .array(
      z.object({
        vlan: z.number().int().positive(),
        helperAddresses: z.array(z.string()).default([]),
        scope: z.object({ network: z.string(), poolSize: z.number().int().positive(), leased: z.number().int().nonnegative() }).optional(),
        rogueDetected: z.object({ rogueGateway: z.string() }).optional(),
        dnsServerIp: z.string().optional(),
      }),
    )
    .optional(),
  acls: z
    .array(
      z.object({
        id: z.string(),
        action: z.enum(['permit', 'deny']),
        matchDescription: z.string(),
        match: z.object({ protocol: z.enum(['ip', 'icmp', 'tcp', 'udp']), srcCidr: z.string(), dstCidr: z.string(), dstPort: z.number().int().positive().optional() }).optional(),
        appliedTo: z.array(z.object({ interfaceId: z.string(), direction: z.enum(['in', 'out']) })).optional(),
      }),
    )
    .optional(),
  ospfNeighbors: z.array(z.object({ neighborId: z.string(), interfaceId: z.string(), state: z.enum(['down', 'init', '2way', 'exstart', 'exchange', 'loading', 'full']), mtuMismatch: z.boolean().optional() })).optional(),
  dnsRecords: z.array(z.object({ hostname: z.string(), actualIp: z.string(), stale: z.boolean().optional(), resolvedIp: z.string().optional() })).optional(),
  runningConfigLines: z.array(z.string()).optional(),
  logLines: z.array(z.string()).optional(),
  role: z.enum(['switch', 'router', 'l3-switch', 'olt', 'server', 'dns-server']).optional(),
  platform: z.string().optional(),
  topologyNodeId: z.string().optional(),
  ponPorts: z.array(PonPortStateSchema).optional(),
  dnsResolverIp: z.string().optional(),
  dnsServerHealth: z.enum(['ok', 'degraded', 'down']).optional(),
});

const NetworkLinkSchema = z.object({
  id: z.string(),
  a: z.object({ deviceId: z.string(), interfaceId: z.string() }),
  b: z.union([z.object({ deviceId: z.string(), interfaceId: z.string() }), z.object({ hostId: z.string() })]),
});

const HostAddressingSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('static'), ip: z.string(), prefixLength: z.number().int().positive(), gateway: z.string(), dns: z.string() }),
  z.object({ mode: z.literal('dhcp') }),
]);

const HostConfigSchema = z.object({
  id: z.string(),
  label: z.string(),
  premiseNodeId: z.string(),
  macAddress: z.string(),
  attachedOntNodeId: z.string().optional(),
  vlan: z.number().int().positive().optional(),
  addressing: HostAddressingSchema,
});

const PlantRecordSchema = z.object({
  id: z.string(),
  kind: z.enum(['splice-sheet', 'work-order', 'port-assignment', 'as-built']),
  title: z.string(),
  date: z.string(),
  nodeId: z.string().optional(),
  spanId: z.string().optional(),
  lines: z.array(z.string()),
});

// --- Faults, customer reports ---------------------------------------------------------

const FaultInstanceSchema = z.object({
  instanceId: z.string(),
  kind: z.string(),
  target: FaultTargetSchema,
  params: z.record(z.string(), z.unknown()).default({}),
  isRedHerring: z.boolean().optional(),
  outOfScope: z.boolean().optional(),
  randomize: z.record(z.string(), z.union([NumberRangeSchema, z.array(z.unknown())])).optional(),
});

const CustomerReportSchema = z.object({
  customerId: z.string(),
  premiseNodeId: z.string(),
  reportedSymptom: z.string(),
  phrasingVariants: z.array(z.string()).optional(),
  isRedHerring: z.boolean().optional(),
});

// --- Session vocabulary (mirrors item 4's Intent/Diagnosis) ---------------------------

const EndpointSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('device'), deviceId: z.string() }), z.object({ kind: z.literal('host'), hostId: z.string() })]);

const OtdrAccessSchema = z.object({ accessNodeId: z.string(), launchSpanId: z.string(), strand: StrandRefSchema.optional() });

const OtdrSettingsSchema = z.object({
  wavelengthNm: z.number(),
  pulseWidthNs: z.number(),
  rangeMeters: z.number(),
  iorSetting: z.number(),
  averagingSeconds: z.number(),
  launchCableMeters: z.number(),
  receiveCableMeters: z.number(),
});

const DiagnosisClaimSchema = z.object({
  faultKind: z.string(),
  target: FaultTargetSchema,
  positionMeters: z.number().optional(),
  strand: StrandRefSchema.optional(),
  /** Real ids at runtime; in an authored `referenceSolution`, `"$3"` references the reference step at that index -- the loader rewrites these once action ids are assigned. */
  evidenceActionIds: z.array(z.string()),
});

const DiagnosisSchema = z.object({
  claims: z.array(DiagnosisClaimSchema).default([]),
  escalate: z.object({ reason: z.string(), evidenceActionIds: z.array(z.string()) }).optional(),
  noFaultInScope: z.boolean().optional(),
});

const IntentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('otdr-shot'), access: OtdrAccessSchema, settings: OtdrSettingsSchema }),
  z.object({ type: z.literal('power-meter'), nodeId: z.string(), wavelengthNm: z.number(), strand: StrandRefSchema.optional() }),
  z.object({ type: z.literal('vfl'), spanId: z.string(), fromNodeId: z.string() }),
  z.object({ type: z.literal('scope'), spanId: z.string(), eventId: z.string() }),
  z.object({ type: z.literal('cli'), endpoint: EndpointSchema, command: z.string() }),
  z.object({ type: z.literal('truck-roll'), toNodeId: z.string() }),
  z.object({ type: z.literal('records'), nodeId: z.string().optional(), spanId: z.string().optional() }),
  z.object({ type: z.literal('customer-contact'), customerId: z.string() }),
  z.object({ type: z.literal('hint') }),
  z.object({ type: z.literal('excavate'), nodeId: z.string(), method: z.enum(['hand', 'machine']), distanceFromMarksInches: z.number() }),
  z.object({ type: z.literal('diagnosis'), diagnosis: DiagnosisSchema }),
]);

// --- The scenario definition -----------------------------------------------------------

export const ScenarioDefinitionSchema = z.object({
  id: z.string().regex(/^t[1-6]-[a-z0-9-]+$/),
  title: z.string(),
  tier: z.number().int().min(1).max(6),
  description: z.string(),
  today: z.string(),
  profiles: z.object({
    network: z.string(),
    oltVendor: z.string(),
    switchVendor: z.string(),
    hostShell: z.string(),
    equipment: z.string(),
    otdrInstrument: z.string(),
    region: z.string(),
  }),
  environment: z.object({ weather: z.string(), timeOfDay: z.string() }),
  truckInventory: z.array(z.string()),
  timeBudgetMinutes: z.number().positive().optional(),
  startLocationNodeId: z.string(),
  remoteCliAccess: z.boolean().default(true),
  remoteHostAccess: z.boolean().default(false),
  positionToleranceMeters: z.number().positive().default(10),
  serviceCheckHostname: z.string().default('portal.isp.net'),
  travelSeconds: z
    .object({ default: z.number().positive().default(900), pairs: z.array(z.object({ from: z.string(), to: z.string(), seconds: z.number().positive() })).default([]) })
    .default({ default: 900, pairs: [] }),
  topology: z.object({
    nodes: z.array(TopologyNodeSchema),
    spans: z.array(FiberSpanSchema),
  }),
  devices: z.array(NetworkDeviceConfigSchema).default([]),
  links: z.array(NetworkLinkSchema).default([]),
  hosts: z.array(HostConfigSchema).default([]),
  plantRecords: z.array(PlantRecordSchema).default([]),
  customerReports: z.array(CustomerReportSchema).default([]),
  faults: z.array(FaultInstanceSchema).default([]),
  redHerringPool: z.object({ pick: z.number().int().min(0), from: z.array(FaultInstanceSchema) }).optional(),
  hints: z.array(z.string()).default([]),
  referenceSolution: z.object({
    steps: z.array(IntentSchema),
    rationales: z.array(z.string().trim().min(1)),
    expectedClaims: z.array(DiagnosisClaimSchema.omit({ evidenceActionIds: true })).default([]),
  }).refine((solution) => solution.steps.length === solution.rationales.length, { message: 'Every reference step needs an aligned rationale', path: ['rationales'] }),
});

export type ScenarioDefinition = z.infer<typeof ScenarioDefinitionSchema>;
export type ScenarioFaultInstance = z.infer<typeof FaultInstanceSchema>;
export type ScenarioIntent = z.infer<typeof IntentSchema>;
export type ScenarioDiagnosisClaim = z.infer<typeof DiagnosisClaimSchema>;
