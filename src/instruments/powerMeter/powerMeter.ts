/**
 * Optical power meter: reads absolute power (dBm) at a node, derived from the OLT's
 * launch power minus the path loss to that node -- the same shared path resolver the
 * OTDR uses, so a fiber-break or unterminated end upstream reads as no signal at all.
 */
import { createRng, deriveSeed, findNode } from '../../world';
import type { WorldState } from '../../world';
import type { NetworkProfile } from '../../profiles';
import { pathLossDb } from '../shared/opticalPath';

export interface PowerMeterReading {
  dbm: number | null;
  simulatedSeconds: 60;
}

const POWER_METER_NOISE_DB = 0.2;

export function read(world: WorldState, network: NetworkProfile, nodeId: string, wavelengthNm: number): PowerMeterReading {
  const node = findNode(world, nodeId);
  const override = node.attributes?.opticalPowerDbm;
  if (typeof override === 'number') {
    return { dbm: override, simulatedSeconds: 60 };
  }

  const olt = world.topology.nodes.find((n) => n.kind === 'olt');
  if (!olt) return { dbm: null, simulatedSeconds: 60 };

  const result = pathLossDb(world, network, olt.id, nodeId, wavelengthNm);
  if (result.broken) return { dbm: null, simulatedSeconds: 60 };

  const rng = createRng(deriveSeed(world.seed, 'power-meter', nodeId, String(wavelengthNm)));
  const noise = (rng.next() * 2 - 1) * POWER_METER_NOISE_DB;
  return { dbm: network.oltTxPowerDbm - result.lossDb + noise, simulatedSeconds: 60 };
}
