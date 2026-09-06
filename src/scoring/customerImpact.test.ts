import { describe, expect, it } from 'vitest';
import type { PonPortState, WorldState } from '../world';
import { computeCustomerImpact } from './customerImpact';
import { baseMeta, emptyWorld, makeSession } from './testFixtures';

/** `n` customer premises, each behind its own unpowered ONT -- deriveOntStatus returns 'offline' before touching any path-loss physics, so no fiber topology is needed. */
function worldWithAffectedCustomers(n: number): WorldState {
  const world = emptyWorld();
  const onts: PonPortState['onts'] = [];
  world.topology.nodes.push({ id: 'olt-node', kind: 'olt', label: 'OLT' });
  for (let i = 0; i < n; i++) {
    const ontNodeId = `ont-${i}`;
    const premiseNodeId = `prem-${i}`;
    world.topology.nodes.push(
      { id: ontNodeId, kind: 'ont', label: `ONT ${i}`, attributes: { powered: false } },
      { id: premiseNodeId, kind: 'customer-premise', label: `Premise ${i}` },
    );
    world.hosts.push({
      id: `host-${i}`,
      label: `Host ${i}`,
      premiseNodeId,
      macAddress: `0011.2233.44${String(i).padStart(2, '0')}`,
      attachedOntNodeId: ontNodeId,
      addressing: { mode: 'dhcp' },
    });
    onts.push({ ontId: `ont-rec-${i}`, serial: `SN${i}`, ontNodeId });
  }
  world.devices.push({
    id: 'olt-1',
    hostname: 'OLT-1',
    vendorProfileId: 'olt-calix-e7-2',
    role: 'olt',
    topologyNodeId: 'olt-node',
    interfaces: [],
    vlans: [],
    macTable: [],
    routeTable: [],
    ponPorts: [{ id: '1/1/xp1', adminStatus: 'up', spanId: 'feeder', onts }],
  });
  return world;
}

describe('18. customer impact', () => {
  it('4 affected customers for 30 simulated minutes vs a 40-minute total reference scores 33', () => {
    const meta = baseMeta({ referenceSolution: { steps: [], totalSeconds: 0, affectedCustomerMinutes: 40 } });
    const state = makeSession({ world: worldWithAffectedCustomers(4), log: [], meta, clockSeconds: 30 * 60 });
    const result = computeCustomerImpact(state);
    expect(result.score).toBeCloseTo((100 * 40) / 120, 1);
  });

  it('a world with no affected customers scores 100', () => {
    const state = makeSession({ world: emptyWorld(), log: [], clockSeconds: 1800 });
    const result = computeCustomerImpact(state);
    expect(result.score).toBe(100);
  });
});
