/**
 * Derives an ONT's logical status from the optical world -- the OLT never "knows" a
 * fault happened, it just sees a path loss and receive power computed the same way the
 * OTDR and power meter see them (via the shared optical path resolver).
 */
import { findNode } from '../../../world';
import type { NetworkDeviceConfig, OntRecord, PonPortState, WorldState } from '../../../world';
import type { NetworkProfile } from '../../../profiles';
import { pathLossDb } from '../../shared/opticalPath';

export type OntStatus = 'online' | 'los' | 'offline' | 'unprovisioned' | 'serial-mismatch' | 'rogue';

export interface OntStatusResult {
  status: OntStatus;
  rxAtOntDbm: number | null;
  rxAtOltDbm: number | null;
}

export function deriveOntStatus(
  world: WorldState,
  network: NetworkProfile,
  olt: NetworkDeviceConfig,
  pon: PonPortState,
  ont: OntRecord,
): OntStatusResult {
  if (pon.adminStatus === 'administratively-down') {
    return { status: 'los', rxAtOntDbm: null, rxAtOltDbm: null };
  }

  const rogueOnPort = pon.onts.find((o) => o.misbehaving === 'rogue-tx');
  if (rogueOnPort && rogueOnPort.ontId !== ont.ontId) {
    return { status: 'los', rxAtOntDbm: null, rxAtOltDbm: null };
  }
  if (ont.misbehaving === 'rogue-tx') {
    return { status: 'rogue', rxAtOntDbm: null, rxAtOltDbm: null };
  }

  const ontNode = findNode(world, ont.ontNodeId);
  if (ontNode.attributes?.powered === false) {
    return { status: 'offline', rxAtOntDbm: null, rxAtOltDbm: null };
  }

  if (!olt.topologyNodeId) throw new Error(`Device ${olt.id} has role 'olt' but no topologyNodeId`);

  const downstream = pathLossDb(world, network, olt.topologyNodeId, ont.ontNodeId, network.wavelengths.serviceDownstreamNm);
  if (downstream.broken) {
    return { status: 'los', rxAtOntDbm: null, rxAtOltDbm: null };
  }
  const rxAtOntDbm = network.oltTxPowerDbm - downstream.lossDb;
  if (rxAtOntDbm < network.receivePower.lossOfSignalBelowDbm) {
    return { status: 'los', rxAtOntDbm, rxAtOltDbm: null };
  }

  if (ont.provisionedSerial && ont.provisionedSerial !== ont.serial) {
    return { status: 'serial-mismatch', rxAtOntDbm, rxAtOltDbm: null };
  }
  if (!ont.provisionedSerial && ontNode.attributes?.requiresProvisioning === true) {
    return { status: 'unprovisioned', rxAtOntDbm, rxAtOltDbm: null };
  }

  const upstream = pathLossDb(world, network, ont.ontNodeId, olt.topologyNodeId, network.wavelengths.serviceUpstreamNm);
  const rxAtOltDbm = upstream.broken ? null : network.ontTxPowerDbm - upstream.lossDb;
  return { status: 'online', rxAtOntDbm, rxAtOltDbm };
}
