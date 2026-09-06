import type { PlantRecord, WorldState } from '../world';

/** Plant records matching a node and/or span. A trainee query typically supplies just one of the two. */
export function lookupRecords(world: WorldState, query: { nodeId?: string; spanId?: string }): PlantRecord[] {
  return world.plantRecords.filter((r) => (query.nodeId !== undefined && r.nodeId === query.nodeId) || (query.spanId !== undefined && r.spanId === query.spanId));
}
