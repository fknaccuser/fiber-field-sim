import type {
  ActiveProfileSet,
  FiberEvent,
  FiberSpan,
  NetworkDeviceConfig,
  TopologyNode,
  WorldState,
} from './types';

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
