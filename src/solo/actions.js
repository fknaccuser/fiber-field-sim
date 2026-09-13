// Configuration actions (ENGINE_RULES.md "Configuration actions" and "Action
// envelope"). Pure: validates the complete action before cloning or changing
// anything; a rejected action returns the original state unchanged.
//
// ENGINE_RULES.md's "Action envelope" and "Configuration actions" sections both
// enumerate exactly ten action types (setLinkConnected, moveCable, setPortAdmin,
// setAccessVlan, setTrunkAllowedVlans, setClientAddress, setClientGateway,
// setClientDns, setRouterSegmentAddress, setDnsRecord). S06.md's acceptance text
// says "all eleven action types" — that appears to be a typo in the package: no
// eleventh type is named anywhere in DATA_CONTRACTS.md or ENGINE_RULES.md. Rather
// than invent an unspecified action, this implements exactly the ten documented
// ones; each has one valid and one invalid-input test.

import { parseIPv4 } from './ip.js';
import { cloneNetwork, validateNetwork, isValidVlan, checkAddressField } from './model.js';

function reject(state, code, message) {
  return { ok: false, code, message, state };
}

function rejectUnknownFields(action, allowed) {
  const unknown = Object.keys(action).find((key) => !allowed.has(key));
  return unknown ? `Unknown field "${unknown}" for action "${action.type}".` : null;
}

// Clones state, lets `mutate` change the clone and report whether anything
// actually changed, then validates the result before accepting it. A no-op
// (mutate returns false) is success with the original state and revision
// untouched. An invalid result (e.g. a cycle, an overlap) is rejected and the
// original state is returned, exactly like any other rejected action.
function commit(state, mutate) {
  const next = cloneNetwork(state);
  const changed = mutate(next);
  if (!changed) {
    return { ok: true, state };
  }
  next.revision = state.revision + 1;
  const validation = validateNetwork(next);
  if (!validation.ok) {
    return reject(state, validation.code, validation.message);
  }
  return { ok: true, state: next };
}

function findDevice(state, deviceId) {
  return state.devices.find((d) => d.id === deviceId);
}

function findPort(state, portId) {
  return state.ports.find((p) => p.id === portId);
}

function setLinkConnected(state, action) {
  const fieldError = rejectUnknownFields(action, new Set(['type', 'linkId', 'connected']));
  if (fieldError) return reject(state, 'UNKNOWN_FIELD', fieldError);
  const link = state.links.find((l) => l.id === action.linkId);
  if (!link) return reject(state, 'UNKNOWN_ID', `Unknown link "${action.linkId}".`);
  if (typeof action.connected !== 'boolean') {
    return reject(state, 'INVALID_SHAPE', 'connected must be a boolean.');
  }
  return commit(state, (next) => {
    const target = next.links.find((l) => l.id === action.linkId);
    if (target.connected === action.connected) return false;
    target.connected = action.connected;
    return true;
  });
}

function moveCable(state, action) {
  const fieldError = rejectUnknownFields(action, new Set(['type', 'linkId', 'aPortId', 'bPortId']));
  if (fieldError) return reject(state, 'UNKNOWN_FIELD', fieldError);
  const link = state.links.find((l) => l.id === action.linkId);
  if (!link) return reject(state, 'UNKNOWN_ID', `Unknown link "${action.linkId}".`);
  const portA = findPort(state, action.aPortId);
  const portB = findPort(state, action.bPortId);
  if (!portA || !portB) return reject(state, 'UNKNOWN_ID', 'Unknown port.');
  if (action.aPortId === action.bPortId) {
    return reject(state, 'DUPLICATE_ENDPOINT', 'A link cannot join a port to itself.');
  }
  const occupiedByAnother = (portId) =>
    state.links.some((l) => l.id !== link.id && (l.aPortId === portId || l.bPortId === portId));
  if (occupiedByAnother(action.aPortId) || occupiedByAnother(action.bPortId)) {
    return reject(state, 'PORT_ALREADY_USED', 'That port is already wired by another link.');
  }
  const noop = link.aPortId === action.aPortId && link.bPortId === action.bPortId;
  return commit(state, (next) => {
    if (noop) return false;
    const target = next.links.find((l) => l.id === action.linkId);
    target.aPortId = action.aPortId;
    target.bPortId = action.bPortId;
    return true;
  });
}

function setPortAdmin(state, action) {
  const fieldError = rejectUnknownFields(action, new Set(['type', 'portId', 'adminUp']));
  if (fieldError) return reject(state, 'UNKNOWN_FIELD', fieldError);
  const port = findPort(state, action.portId);
  if (!port) return reject(state, 'UNKNOWN_ID', `Unknown port "${action.portId}".`);
  if (typeof action.adminUp !== 'boolean') {
    return reject(state, 'INVALID_SHAPE', 'adminUp must be a boolean.');
  }
  return commit(state, (next) => {
    const target = findPort(next, action.portId);
    if (target.adminUp === action.adminUp) return false;
    target.adminUp = action.adminUp;
    return true;
  });
}

function setAccessVlan(state, action) {
  const fieldError = rejectUnknownFields(action, new Set(['type', 'portId', 'vlanId']));
  if (fieldError) return reject(state, 'UNKNOWN_FIELD', fieldError);
  const port = findPort(state, action.portId);
  if (!port) return reject(state, 'UNKNOWN_ID', `Unknown port "${action.portId}".`);
  if (port.mode !== 'access') {
    return reject(state, 'PORT_MODE_MISMATCH', 'Only an access port has an access VLAN.');
  }
  if (!isValidVlan(action.vlanId)) {
    return reject(state, 'INVALID_VLAN', 'vlanId must be an integer 1-4094.');
  }
  return commit(state, (next) => {
    const target = findPort(next, action.portId);
    if (target.accessVlan === action.vlanId) return false;
    target.accessVlan = action.vlanId;
    return true;
  });
}

function setTrunkAllowedVlans(state, action) {
  const fieldError = rejectUnknownFields(action, new Set(['type', 'portId', 'vlans']));
  if (fieldError) return reject(state, 'UNKNOWN_FIELD', fieldError);
  const port = findPort(state, action.portId);
  if (!port) return reject(state, 'UNKNOWN_ID', `Unknown port "${action.portId}".`);
  if (port.mode !== 'trunk') {
    return reject(state, 'PORT_MODE_MISMATCH', 'Only a trunk port has allowed VLANs.');
  }
  if (!Array.isArray(action.vlans) || !action.vlans.every(isValidVlan)) {
    return reject(state, 'INVALID_VLAN', 'vlans must be an array of integers 1-4094.');
  }
  const nextVlans = [...action.vlans];
  return commit(state, (next) => {
    const target = findPort(next, action.portId);
    const unchanged =
      target.allowedVlans.length === nextVlans.length &&
      target.allowedVlans.every((v, i) => v === nextVlans[i]);
    if (unchanged) return false;
    target.allowedVlans = nextVlans;
    return true;
  });
}

function requireClient(state, deviceId) {
  const device = findDevice(state, deviceId);
  if (!device) return { error: reject(state, 'UNKNOWN_ID', `Unknown device "${deviceId}".`) };
  if (device.kind !== 'client') {
    return { error: reject(state, 'INVALID_TARGET', 'Only a client address is configurable this way.') };
  }
  return { device };
}

function setClientAddress(state, action) {
  const fieldError = rejectUnknownFields(action, new Set(['type', 'deviceId', 'ip', 'prefix']));
  if (fieldError) return reject(state, 'UNKNOWN_FIELD', fieldError);
  const { device, error } = requireClient(state, action.deviceId);
  if (error) return error;
  if (parseIPv4(action.ip) === null) {
    return reject(state, 'INVALID_IP', 'ip is not a valid IPv4 address.');
  }
  const addressError = checkAddressField('Client address', action.ip, action.prefix);
  if (addressError) return reject(state, addressError.code, addressError.message);
  if (action.prefix !== 24) {
    return reject(state, 'UNSUPPORTED_PREFIX', 'Client prefix must be /24 in this release.');
  }
  return commit(state, (next) => {
    const target = findDevice(next, device.id);
    if (target.ip === action.ip && target.prefix === action.prefix) return false;
    target.ip = action.ip;
    target.prefix = action.prefix;
    return true;
  });
}

function setClientGateway(state, action) {
  const fieldError = rejectUnknownFields(action, new Set(['type', 'deviceId', 'gateway']));
  if (fieldError) return reject(state, 'UNKNOWN_FIELD', fieldError);
  const { device, error } = requireClient(state, action.deviceId);
  if (error) return error;
  if (parseIPv4(action.gateway) === null) {
    return reject(state, 'INVALID_IP', 'gateway is not a valid IPv4 address.');
  }
  // A syntactically valid but unassigned/unreachable gateway is accepted and
  // diagnosable (I2) — no semantic check against real router segments here.
  return commit(state, (next) => {
    const target = findDevice(next, device.id);
    if (target.gateway === action.gateway) return false;
    target.gateway = action.gateway;
    return true;
  });
}

function setClientDns(state, action) {
  const fieldError = rejectUnknownFields(action, new Set(['type', 'deviceId', 'dns']));
  if (fieldError) return reject(state, 'UNKNOWN_FIELD', fieldError);
  const { device, error } = requireClient(state, action.deviceId);
  if (error) return error;
  if (parseIPv4(action.dns) === null) {
    return reject(state, 'INVALID_IP', 'dns is not a valid IPv4 address.');
  }
  return commit(state, (next) => {
    const target = findDevice(next, device.id);
    if (target.dns === action.dns) return false;
    target.dns = action.dns;
    return true;
  });
}

function setRouterSegmentAddress(state, action) {
  const fieldError = rejectUnknownFields(action, new Set(['type', 'deviceId', 'portId', 'vlanId', 'ip', 'prefix']));
  if (fieldError) return reject(state, 'UNKNOWN_FIELD', fieldError);
  const device = findDevice(state, action.deviceId);
  if (!device || device.kind !== 'router') {
    return reject(state, 'UNKNOWN_ID', `Unknown router "${action.deviceId}".`);
  }
  const segment = (device.routerSegments ?? []).find(
    (s) => s.portId === action.portId && s.vlanId === (action.vlanId ?? null),
  );
  if (!segment) {
    return reject(state, 'UNKNOWN_ID', 'Unknown router segment (no predeclared segment matches portId/vlanId).');
  }
  if (parseIPv4(action.ip) === null) {
    return reject(state, 'INVALID_IP', 'ip is not a valid IPv4 address.');
  }
  const addressError = checkAddressField('Router segment address', action.ip, action.prefix);
  if (addressError) return reject(state, addressError.code, addressError.message);
  if (action.prefix !== 24) {
    return reject(state, 'UNSUPPORTED_PREFIX', 'Router segment prefix must be /24 in this release.');
  }
  return commit(state, (next) => {
    const nextDevice = findDevice(next, action.deviceId);
    const target = nextDevice.routerSegments.find(
      (s) => s.portId === action.portId && s.vlanId === (action.vlanId ?? null),
    );
    if (target.ip === action.ip && target.prefix === action.prefix) return false;
    target.ip = action.ip;
    target.prefix = action.prefix;
    return true;
  });
}

function setDnsRecord(state, action) {
  const fieldError = rejectUnknownFields(action, new Set(['type', 'serverId', 'name', 'address']));
  if (fieldError) return reject(state, 'UNKNOWN_FIELD', fieldError);
  const device = findDevice(state, action.serverId);
  if (!device || device.kind !== 'server') {
    return reject(state, 'UNKNOWN_ID', `Unknown server "${action.serverId}".`);
  }
  const record = state.dnsRecords.find((r) => r.serverId === action.serverId && r.name === action.name);
  if (!record) {
    return reject(state, 'UNKNOWN_ID', `Unknown DNS record "${action.name}" on "${action.serverId}".`);
  }
  if (parseIPv4(action.address) === null) {
    return reject(state, 'INVALID_IP', 'address is not a valid IPv4 address.');
  }
  return commit(state, (next) => {
    const target = next.dnsRecords.find((r) => r.serverId === action.serverId && r.name === action.name);
    if (target.address === action.address) return false;
    target.address = action.address;
    return true;
  });
}

const HANDLERS = {
  setLinkConnected,
  moveCable,
  setPortAdmin,
  setAccessVlan,
  setTrunkAllowedVlans,
  setClientAddress,
  setClientGateway,
  setClientDns,
  setRouterSegmentAddress,
  setDnsRecord,
};

export function applyAction(state, action) {
  if (!action || typeof action.type !== 'string') {
    return reject(state, 'UNKNOWN_ACTION', 'Action is missing a type.');
  }
  const handler = HANDLERS[action.type];
  if (!handler) {
    return reject(state, 'UNKNOWN_ACTION', `Unknown action type "${action.type}".`);
  }
  return handler(state, action);
}
