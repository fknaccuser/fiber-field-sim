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

export interface TopologyNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Equipment profile catalog entry id for the physical hardware at this node, if any. */
  equipmentRef?: string;
  /** Node-specific ground truth not otherwise modeled: FAT optical power, aerial condition, locate ticket state, etc. */
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
}

export interface FiberSpan {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  lengthMeters: number;
  /** Group index of refraction override for this span; defaults to the active network profile's value. */
  iorOverride?: { '1310'?: number; '1550'?: number; '1625'?: number };
  /** Kept ordered by positionMeters ascending. */
  events: FiberEvent[];
  /** Tube/fiber structure of this span, for continuity/rolling scenarios. Populated only where it matters (feeder/backbone spans). */
  strands?: FiberStrand[];
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
}

export interface AclRule {
  id: string;
  action: 'permit' | 'deny';
  matchDescription: string;
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

export interface NetworkDeviceConfig {
  id: string;
  hostname: string;
  /** References a profiles/vendor/*.yaml id, e.g. 'switch-cisco-ios' or 'olt-calix-axos-e'. */
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
