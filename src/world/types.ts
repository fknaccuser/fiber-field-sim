/**
 * Core world-state types.
 *
 * The world model is the single source of ground truth for a scenario. Instruments
 * (OTDR, CLI, power meter, etc. — built in later stages) are pure functions of this
 * state plus their own settings; nothing in here describes what any instrument screen
 * shows. A fault is represented as a change to this state (a fiber event, a device
 * config value, a site attribute) — never as canned instrument output.
 */

// --- Topology ---------------------------------------------------------------

export type NodeKind =
  | 'olt'
  | 'fdh'
  | 'splitter'
  | 'splice-closure'
  | 'terminal' // NAP / pedestal distribution terminal
  | 'fat' // flexible/field access terminal, a test point
  | 'ont'
  | 'customer-premise'
  | 'network-device'; // anchors a NetworkDeviceConfig (see `devices`) in the topology

/**
 * Topology conventions (enforced by the scenario validator, item 5):
 * - A splitter is a TopologyNode of kind 'splitter' with `attributes.splitRatio` (e.g.
 *   '1x32'): exactly one incident span arriving (`toNodeId === splitter.id`) and one or
 *   more leaving (`fromNodeId === splitter.id`). Instruments insert the split loss
 *   step themselves from the network profile's splitterLadder — a scenario author does
 *   not put a 'splitter' FiberEvent on a span that represents a branching splitter node.
 *   The 'splitter' FiberEventKind remains valid only for an *inline*, non-branching
 *   splitter authored directly on a single span (its loss comes from the event's own
 *   `lossDb`, or the ladder by `splitRatio` when `lossDb` is absent). Use one
 *   representation per physical splitter, never both.
 * - A node with more than one incident/continuing span that is not a splitter (e.g. a
 *   splice closure) must have `attributes.spliceMap` (see SpliceMapEntry) describing how
 *   fibers continue through it — see worldState.ts's `getSpliceMap`.
 */
export interface TopologyNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Equipment profile catalog entry id for the physical hardware at this node, if any. */
  equipmentRef?: string;
  /** Node-specific ground truth not otherwise modeled: FAT optical power, aerial condition, locate ticket state, splitter split ratio, splice map, etc. */
  attributes?: Record<string, unknown>;
}

// --- Fiber plant --------------------------------------------------------------

export type FiberTubeColor =
  | 'blue' | 'orange' | 'green' | 'brown' | 'slate' | 'white'
  | 'red' | 'black' | 'yellow' | 'violet' | 'rose' | 'aqua';

export type FiberRole = 'feeder' | 'distribution' | 'backbone' | 'dark' | 'spare';

/** One fiber strand tracked end to end across a span, for continuity/tube-rolling tasks. */
export interface FiberStrand {
  tubeColor: FiberTubeColor;
  fiberColor: FiberTubeColor;
  role: FiberRole;
  /** True once a wrong-tube/wrong-fiber splice fault breaks this strand's continuity. */
  continuityBroken?: boolean;
  /** True if a splice fault mistakenly spliced through onto a dark/spare strand. */
  unexpectedlyActivated?: boolean;
  /** True when this individual fiber currently carries live PON service. Overrides the span-level liveService below on stranded cables. A scenario's loader derives this by default. */
  live?: boolean;
}

/**
 * The general physical vocabulary of things that can appear on a fiber span. Most of
 * these are normal plant reality (an ordinary in-spec fusion splice, a splitter, a UPC
 * connector pair) — only a subset are ever placed as a diagnosable *fault* (see
 * faultTaxonomy.ts). A scenario author places FiberEvents to build a plant; the fault
 * taxonomy is the layer that says which of those events are the trainee's problem.
 */
export type FiberEventKind =
  | 'fusion-splice'
  | 'mechanical-splice'
  | 'connector-upc'
  | 'connector-apc'
  | 'connector-dirty'
  | 'macrobend'
  | 'splitter'
  | 'fiber-end'
  | 'fiber-break'
  | 'mismatched-fiber-splice'; // produces an apparent "gainer" in one test direction

export interface WavelengthLoss {
  '1310'?: number;
  '1550'?: number;
  '1625'?: number;
}

export interface FiberEvent {
  id: string;
  kind: FiberEventKind;
  /** Distance in meters from the start of the span (the near/launch end). */
  positionMeters: number;
  /** One-way insertion loss in dB. Negative values represent an apparent gainer. Omit when lossDbByWavelength is used instead. */
  lossDb?: number;
  /** Wavelength-dependent loss (required for macrobend, since the wavelength differential is the diagnostic). */
  lossDbByWavelength?: WavelengthLoss;
  /** Reflectance in dB, e.g. -55. Absent for non-reflective events. */
  reflectanceDb?: number;
  /** For a mismatched-fiber-splice (gainer), the backscatter coefficient difference that bidirectional averaging resolves. */
  backscatterDeltaDb?: number;
  /** For splitter events, the split ratio, e.g. '1x32'. */
  splitRatio?: string;
  /** Free-form tag for scoring/explanations, e.g. 'tray-bend-radius-violation', 'dig-strike', 'vehicle-strike'. */
  causeTag?: string;
  /** For 'mismatched-fiber-splice' only: the true splice loss that bidirectional OTDR averaging recovers. Defaults to MISMATCH_TRUE_LOSS_DB. */
  trueLossDb?: number;
}

export interface FiberSpan {
  id: string;
  /** The OLT/upstream side of this span. */
  fromNodeId: string;
  /** The customer/downstream side of this span. */
  toNodeId: string;
  lengthMeters: number;
  /** Group index of refraction override for this span; defaults to the active network profile's value. */
  iorOverride?: { '1310'?: number; '1550'?: number; '1625'?: number };
  /** Kept ordered by positionMeters ascending. */
  events: FiberEvent[];
  /** Tube/fiber structure of this span, for continuity/rolling scenarios. Populated only where it matters (feeder/backbone spans). */
  strands?: FiberStrand[];
  /** True when this span currently carries live PON service (unstranded cables only — see FiberStrand.live for stranded ones). Scenario-authored; a scenario loader may derive a default. */
  liveService?: boolean;
  /** 'legacy' fiber exhibits the 1383 nm water-peak excess loss; default is modern low-water-peak fiber. */
  fiberGeneration?: 'legacy' | 'low-water-peak';
  /** Relative backscatter offset for this span's fiber, in round-trip dB (default 0). Used only to author a gainer where the far fiber's backscatter coefficient differs from the near fiber's. */
  backscatterOffsetDb?: number;
}

/**
 * How fibers continue through a node with more than one incident span (e.g. a splice
 * closure with a feeder in and multiple distribution cables out). Stored at
 * `TopologyNode.attributes.spliceMap`; read via worldState.ts's `getSpliceMap`.
 */
export interface SpliceMapEntry {
  fromSpanId: string;
  fromStrand?: { tubeColor: FiberTubeColor; fiberColor: FiberTubeColor };
  toSpanId: string;
  toStrand?: { tubeColor: FiberTubeColor; fiberColor: FiberTubeColor };
}

// --- Network device state ----------------------------------------------------

export type AdminStatus = 'up' | 'administratively-down';
export type LineStatus = 'up' | 'down';
export type Duplex = 'full' | 'half' | 'auto';
export type PortSecurityState = 'ok' | 'err-disabled';
export type StpPortState = 'forwarding' | 'blocking' | 'listening' | 'learning' | 'disabled';

export interface InterfaceState {
  id: string; // e.g. 'GigabitEthernet0/1'
  adminStatus: AdminStatus;
  lineStatus: LineStatus;
  speedMbps: number;
  duplex: Duplex;
  mode: 'access' | 'trunk';
  accessVlan?: number;
  nativeVlan?: number;
  allowedVlans?: number[];
  portSecurity?: {
    enabled: boolean;
    maxMac: number;
    state: PortSecurityState;
  };
  stpState?: StpPortState;
  crcErrors?: number;
  lateCollisions?: number;
  transceiver?: {
    present: boolean;
    rxPowerDbm?: number;
    txPowerDbm?: number;
    temperatureC?: number;
  };
  description?: string;
  /** Dotted quad. Presence makes this a routed/SVI interface. */
  ipAddress?: string;
  /** Required when ipAddress is set. */
  prefixLength?: number;
  /** 'aabb.ccdd.eeff'; if absent, derived deterministically from the world seed (CLI module). */
  macAddress?: string;
  /** Default 1500. */
  mtu?: number;
}

export interface VlanEntry {
  id: number;
  name: string;
}

export interface MacTableEntry {
  mac: string;
  vlan: number;
  interfaceId: string;
}

export interface RouteEntry {
  network: string; // CIDR
  nextHop?: string;
  interfaceId?: string;
  source: 'connected' | 'static' | 'ospf' | 'default';
}

export interface DhcpConfig {
  vlan: number;
  helperAddresses: string[];
  scope?: { network: string; poolSize: number; leased: number };
  rogueDetected?: { rogueGateway: string };
  /** Handed to DHCP clients; defaults to the SVI address when absent. */
  dnsServerIp?: string;
}

export interface AclRule {
  id: string;
  action: 'permit' | 'deny';
  /** Kept for display/explanations even when `match` is also structured. */
  matchDescription: string;
  match?: { protocol: 'ip' | 'icmp' | 'tcp' | 'udp'; srcCidr: string; dstCidr: string; dstPort?: number };
  appliedTo?: Array<{ interfaceId: string; direction: 'in' | 'out' }>;
}

export interface OspfNeighborState {
  neighborId: string;
  interfaceId: string;
  state: 'down' | 'init' | '2way' | 'exstart' | 'exchange' | 'loading' | 'full';
  mtuMismatch?: boolean;
}

export interface DnsRecord {
  hostname: string;
  /** The host's real, reachable IP (a direct ping/traceroute by IP still works). */
  actualIp: string;
  stale?: boolean;
  /** What DNS incorrectly resolves the hostname to, when stale. */
  resolvedIp?: string;
}

export interface OntRecord {
  /** e.g. '1/1/xp1/1'. */
  ontId: string;
  /** Physical ONT serial, e.g. 'CXNK00A1B2C3'. */
  serial: string;
  /** What the OLT expects; a mismatch against `serial` means the ONT never ranges. */
  provisionedSerial?: string;
  /** The 'ont' TopologyNode this record corresponds to. */
  ontNodeId: string;
  /** 'rogue-tx': transmitting out of its assigned timeslot, taking down the whole PON. */
  misbehaving?: 'rogue-tx';
}

export interface PonPortState {
  /** e.g. '1/1/xp1'. */
  id: string;
  adminStatus: AdminStatus;
  /** The feeder span leaving the OLT node for this port. */
  spanId: string;
  onts: OntRecord[];
}

export interface NetworkDeviceConfig {
  id: string;
  hostname: string;
  /** References a profiles/vendor/*.yaml id, e.g. 'switch-cisco-ios' or 'olt-calix-e7-2'. */
  vendorProfileId: string;
  interfaces: InterfaceState[];
  vlans: VlanEntry[];
  macTable: MacTableEntry[];
  routeTable: RouteEntry[];
  dhcp?: DhcpConfig[];
  acls?: AclRule[];
  ospfNeighbors?: OspfNeighborState[];
  dnsRecords?: DnsRecord[];
  /** Free-text lines shown verbatim by `show running-config` in the CLI module. */
  runningConfigLines?: string[];
  /** The device's own log buffer, shown (paginated/filtered) by `show logging`. */
  logLines?: string[];
  /** Default 'switch'. */
  role?: 'switch' | 'router' | 'l3-switch' | 'olt' | 'server' | 'dns-server';
  /** Shown by CDP; defaults to the vendor profile's displayName. */
  platform?: string;
  /** Required for role 'olt': the 'olt' TopologyNode this device anchors. */
  topologyNodeId?: string;
  ponPorts?: PonPortState[];
  /** The DNS server this device itself uses for name lookups. */
  dnsResolverIp?: string;
  /** Only meaningful on a device that also serves `dnsRecords`. */
  dnsServerHealth?: 'ok' | 'degraded' | 'down';
}

export interface NetworkLink {
  id: string;
  a: { deviceId: string; interfaceId: string };
  b: { deviceId: string; interfaceId: string } | { hostId: string };
}

export type HostAddressing =
  | { mode: 'static'; ip: string; prefixLength: number; gateway: string; dns: string }
  | { mode: 'dhcp' };

export interface HostConfig {
  id: string;
  /** e.g. "Customer laptop". */
  label: string;
  premiseNodeId: string;
  macAddress: string;
  /** Exactly one attachment: a switch port (via a NetworkLink's `b.hostId`) or an ONT (L2 continues through the PON to the OLT's uplink). */
  attachedOntNodeId?: string;
  /** Service VLAN when attached via an ONT; when attached to a switch port the port's own accessVlan wins. */
  vlan?: number;
  addressing: HostAddressing;
}

// --- Faults -------------------------------------------------------------------

export type FaultTarget =
  | { type: 'fiber-span'; spanId: string }
  | { type: 'device-interface'; deviceId: string; interfaceId: string }
  | { type: 'device-global'; deviceId: string }
  | { type: 'site'; nodeId: string };

/** A specific fault placed into a scenario's world state. `kind` must match a FaultDefinition id in faultTaxonomy.ts. */
export interface FaultInstance {
  instanceId: string;
  kind: string;
  target: FaultTarget;
  params: Record<string, unknown>;
}

// --- World state ----------------------------------------------------------------

export interface CustomerReport {
  customerId: string;
  premiseNodeId: string;
  reportedSymptom: string;
  isRedHerring?: boolean;
}

export interface ActiveProfileSet {
  network: string;
  oltVendor: string;
  switchVendor: string;
  equipment: string;
  otdrInstrument: string;
  hostShell: string;
  region: string;
}

export interface WorldState {
  id: string;
  seed: number;
  activeProfiles: ActiveProfileSet;
  topology: {
    nodes: TopologyNode[];
    spans: FiberSpan[];
  };
  devices: NetworkDeviceConfig[];
  links: NetworkLink[];
  hosts: HostConfig[];
  customerReports: CustomerReport[];
  environment: {
    weather: string;
    timeOfDay: string;
  };
  truckInventory: string[];
  timeBudgetMinutes?: number;
  /** Applied fault instances, kept for scoring/replay even though their effects are already baked into topology/devices above. */
  appliedFaults: FaultInstance[];
}
