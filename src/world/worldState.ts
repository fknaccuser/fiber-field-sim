import type {
  ActiveProfileSet,
  FiberEvent,
  FiberSpan,
  NetworkDeviceConfig,
  SpliceMapEntry,
  TopologyNode,
  WorldState,
} from './types';

export class MissingSplitRatioError extends Error {
  readonly code = 'MISSING_SPLIT_RATIO';
  readonly nodeId: string;
  constructor(nodeId: string) {
    super(`Splitter node ${nodeId} has no attributes.splitRatio`);
    this.name = 'MissingSplitRatioError';
    this.nodeId = nodeId;
  }
}

export function cloneWorld(world: WorldState): WorldState {
  // structuredClone is available in Node 18+ and all evergreen browsers; the world
  // model is plain JSON-serializable data (no functions/classes), so this is a safe,
  // fast deep clone without a dependency.
  return structuredClone(world);
}

export function createEmptyWorld(seed: number, activeProfiles: ActiveProfileSet): WorldState {
  return {
    id: `world-${seed}`,
    seed,
    activeProfiles,
    topology: { nodes: [], spans: [] },
    devices: [],
    customerReports: [],
    environment: { weather: 'clear', timeOfDay: 'day' },
    truckInventory: [],
    appliedFaults: [],
  };
}

export function findNode(world: WorldState, nodeId: string): TopologyNode {
  const node = world.topology.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Unknown topology node: ${nodeId}`);
  return node;
}

export function findSpan(world: WorldState, spanId: string): FiberSpan {
  const span = world.topology.spans.find((s) => s.id === spanId);
  if (!span) throw new Error(`Unknown fiber span: ${spanId}`);
  return span;
}

export function findDevice(world: WorldState, deviceId: string): NetworkDeviceConfig {
  const device = world.devices.find((d) => d.id === deviceId);
  if (!device) throw new Error(`Unknown device: ${deviceId}`);
  return device;
}

export function findInterface(device: NetworkDeviceConfig, interfaceId: string) {
  const iface = device.interfaces.find((i) => i.id === interfaceId);
  if (!iface) throw new Error(`Unknown interface ${interfaceId} on device ${device.id}`);
  return iface;
}

/** Inserts a fiber event into a span, keeping events ordered by position (required by the OTDR module built in the next stage). */
export function addFiberEvent(span: FiberSpan, event: FiberEvent): void {
  span.events.push(event);
  span.events.sort((a, b) => a.positionMeters - b.positionMeters);
}

/** Reads a node's `attributes.spliceMap` (see SpliceMapEntry). Returns [] if the node has none. */
export function getSpliceMap(node: TopologyNode): SpliceMapEntry[] {
  const raw = node.attributes?.spliceMap;
  return Array.isArray(raw) ? (raw as SpliceMapEntry[]) : [];
}

/** Reads a splitter node's `attributes.splitRatio` (e.g. '1x32'). Throws for a 'splitter' node missing it. */
export function getSplitRatio(node: TopologyNode): string {
  const ratio = node.attributes?.splitRatio;
  if (typeof ratio !== 'string') throw new MissingSplitRatioError(node.id);
  return ratio;
}

/** All fiber spans with an end at this node (either `fromNodeId` or `toNodeId`). */
export function spansAtNode(world: WorldState, nodeId: string): FiberSpan[] {
  return world.topology.spans.filter((s) => s.fromNodeId === nodeId || s.toNodeId === nodeId);
}
