// Structural validation and cloning for the SOLO-1 Network shape (ENGINE_RULES.md
// "State shape"). Pure: no DOM, no fetch, no mutation of the input, no Date.now.
//
// validateNetwork checks structural integrity and syntactically valid addresses,
// not whether the network works — "wrong gateway is valid structure" per
// ENGINE_RULES.md. A local IPv4-syntax check is used here rather than importing
// ip.js's parseIPv4 (that file does not exist until a later task); once it does,
// this can be consolidated to avoid duplicated logic.

const DEVICE_KINDS = new Set(['client', 'switch', 'router', 'server']);
const PORT_MODES = new Set(['access', 'trunk', 'routed']);
const MAX_DEVICES = 7;
const MAX_LINKS = 10;
const SUPPORTED_PREFIX = 24;

function fail(code, message) {
  return { ok: false, code, message };
}

function isSyntacticIPv4(text) {
  if (typeof text !== 'string') return false;
  const parts = text.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function hostOctet(ip) {
  return Number(ip.split('.')[3]);
}

function isValidVlan(vlan) {
  return Number.isInteger(vlan) && vlan >= 1 && vlan <= 4094;
}

function checkAddressField(label, ip, prefix, { requirePrefix24 = true } = {}) {
  if (ip === undefined || ip === null) return null;
  if (!isSyntacticIPv4(ip)) return fail('INVALID_IP', `${label} is not a valid IPv4 address.`);
  if (prefix !== undefined && prefix !== null) {
    if (requirePrefix24 && prefix !== SUPPORTED_PREFIX) {
      return fail('UNSUPPORTED_PREFIX', `${label} prefix must be /24 in this release.`);
    }
    if (prefix === SUPPORTED_PREFIX) {
      const last = hostOctet(ip);
      if (last === 0 || last === 255) {
        return fail('HOST_RESERVED', `${label} cannot use a .0 or .255 host address on a /24.`);
      }
    }
  }
  return null;
}

export function validateNetwork(state) {
  if (!state || typeof state !== 'object') {
    return fail('INVALID_SHAPE', 'Network is not an object.');
  }
  if (state.schema !== 1) {
    return fail('INVALID_SHAPE', 'Network schema must be 1.');
  }
  const devices = state.devices;
  const ports = state.ports;
  const links = state.links;
  const dnsRecords = state.dnsRecords;
  if (!Array.isArray(devices) || !Array.isArray(ports) || !Array.isArray(links) || !Array.isArray(dnsRecords)) {
    return fail('INVALID_SHAPE', 'devices, ports, links and dnsRecords must all be arrays.');
  }
  if (devices.length > MAX_DEVICES) {
    return fail('TOO_MANY_DEVICES', `Networks support at most ${MAX_DEVICES} devices.`);
  }
  if (links.length > MAX_LINKS) {
    return fail('TOO_MANY_LINKS', `Networks support at most ${MAX_LINKS} links.`);
  }

  const deviceIds = new Set();
  let routerCount = 0;
  for (const device of devices) {
    if (!device || typeof device.id !== 'string' || device.id === '') {
      return fail('MISSING_ID', 'Every device requires a non-empty id.');
    }
    if (deviceIds.has(device.id)) {
      return fail('DUPLICATE_ID', `Duplicate device id "${device.id}".`);
    }
    deviceIds.add(device.id);
    if (!DEVICE_KINDS.has(device.kind)) {
      return fail('INVALID_KIND', `Device "${device.id}" has an unrecognized kind.`);
    }
    if (typeof device.powered !== 'boolean') {
      return fail('INVALID_SHAPE', `Device "${device.id}" is missing "powered".`);
    }
    if (device.kind === 'router') {
      routerCount += 1;
    }
    const addressError = checkAddressField(`Device "${device.id}" address`, device.ip, device.prefix);
    if (addressError) return addressError;
    if (device.gateway !== undefined && device.gateway !== null && !isSyntacticIPv4(device.gateway)) {
      return fail('INVALID_IP', `Device "${device.id}" gateway is not a valid IPv4 address.`);
    }
    if (device.dns !== undefined && device.dns !== null && !isSyntacticIPv4(device.dns)) {
      return fail('INVALID_IP', `Device "${device.id}" DNS is not a valid IPv4 address.`);
    }
  }
  if (routerCount > 1) {
    return fail('MULTIPLE_ROUTERS', 'Only one router is allowed.');
  }

  const portIds = new Set();
  const portById = new Map();
  for (const port of ports) {
    if (!port || typeof port.id !== 'string' || port.id === '') {
      return fail('MISSING_ID', 'Every port requires a non-empty id.');
    }
    if (portIds.has(port.id)) {
      return fail('DUPLICATE_ID', `Duplicate port id "${port.id}".`);
    }
    portIds.add(port.id);
    portById.set(port.id, port);
    if (!deviceIds.has(port.deviceId)) {
      return fail('UNKNOWN_DEVICE_REF', `Port "${port.id}" references unknown device "${port.deviceId}".`);
    }
    if (typeof port.label !== 'string' || port.label === '') {
      return fail('INVALID_SHAPE', `Port "${port.id}" is missing a label.`);
    }
    if (typeof port.adminUp !== 'boolean') {
      return fail('INVALID_SHAPE', `Port "${port.id}" is missing "adminUp".`);
    }
    if (!PORT_MODES.has(port.mode)) {
      return fail('INVALID_SHAPE', `Port "${port.id}" has an unrecognized mode.`);
    }
    if (port.accessVlan !== null && port.accessVlan !== undefined && !isValidVlan(port.accessVlan)) {
      return fail('INVALID_VLAN', `Port "${port.id}" accessVlan must be 1-4094.`);
    }
    if (!Array.isArray(port.allowedVlans) || !port.allowedVlans.every(isValidVlan)) {
      return fail('INVALID_VLAN', `Port "${port.id}" allowedVlans must be an array of VLANs 1-4094.`);
    }
    if (!isValidVlan(port.nativeVlan)) {
      return fail('INVALID_VLAN', `Port "${port.id}" nativeVlan must be 1-4094.`);
    }
  }

  const linkIds = new Set();
  const usedPorts = new Set();
  const deviceParent = new Map();
  for (const id of deviceIds) deviceParent.set(id, id);
  function find(id) {
    while (deviceParent.get(id) !== id) {
      id = deviceParent.get(id);
    }
    return id;
  }
  for (const link of links) {
    if (!link || typeof link.id !== 'string' || link.id === '') {
      return fail('MISSING_ID', 'Every link requires a non-empty id.');
    }
    if (linkIds.has(link.id)) {
      return fail('DUPLICATE_ID', `Duplicate link id "${link.id}".`);
    }
    linkIds.add(link.id);
    if (!portById.has(link.aPortId) || !portById.has(link.bPortId)) {
      return fail('UNKNOWN_PORT_REF', `Link "${link.id}" references an unknown port.`);
    }
    if (link.aPortId === link.bPortId) {
      return fail('DUPLICATE_ENDPOINT', `Link "${link.id}" connects a port to itself.`);
    }
    if (usedPorts.has(link.aPortId) || usedPorts.has(link.bPortId)) {
      return fail('PORT_ALREADY_USED', `Link "${link.id}" reuses a port already wired by another link.`);
    }
    usedPorts.add(link.aPortId);
    usedPorts.add(link.bPortId);
    if (typeof link.connected !== 'boolean') {
      return fail('INVALID_SHAPE', `Link "${link.id}" is missing "connected".`);
    }
    const aDevice = find(portById.get(link.aPortId).deviceId);
    const bDevice = find(portById.get(link.bPortId).deviceId);
    if (aDevice === bDevice) {
      return fail('CYCLE_DETECTED', `Link "${link.id}" would create a physical cycle.`);
    }
    deviceParent.set(aDevice, bDevice);
  }

  for (const device of devices) {
    if (device.kind !== 'router') continue;
    if (!Array.isArray(device.routerSegments)) {
      return fail('INVALID_SHAPE', `Router "${device.id}" is missing routerSegments.`);
    }
    const segmentNetworks = new Set();
    for (const segment of device.routerSegments) {
      if (!segment || !portById.has(segment.portId)) {
        return fail('UNKNOWN_PORT_REF', `Router "${device.id}" segment references an unknown port.`);
      }
      if (portById.get(segment.portId).deviceId !== device.id) {
        return fail('UNKNOWN_PORT_REF', `Router "${device.id}" segment references a port on another device.`);
      }
      if (segment.vlanId !== null && !isValidVlan(segment.vlanId)) {
        return fail('INVALID_VLAN', `Router "${device.id}" segment vlanId must be null or 1-4094.`);
      }
      const addressError = checkAddressField(`Router "${device.id}" segment`, segment.ip, segment.prefix);
      if (addressError) return addressError;
      if (typeof segment.ip !== 'string' || segment.prefix !== SUPPORTED_PREFIX) {
        return fail('INVALID_SHAPE', `Router "${device.id}" segment requires a /24 address.`);
      }
      const network = segment.ip.split('.').slice(0, 3).join('.');
      if (segmentNetworks.has(network)) {
        return fail('SEGMENT_OVERLAP', `Router "${device.id}" has overlapping segments on ${network}.0/24.`);
      }
      segmentNetworks.add(network);
    }
  }

  const serverIds = new Set(devices.filter((d) => d.kind === 'server').map((d) => d.id));
  for (const record of dnsRecords) {
    if (!record || !serverIds.has(record.serverId)) {
      return fail('UNKNOWN_DEVICE_REF', 'DNS record references an unknown server.');
    }
    if (typeof record.name !== 'string' || record.name === '') {
      return fail('INVALID_SHAPE', 'DNS record is missing a name.');
    }
    if (!isSyntacticIPv4(record.address)) {
      return fail('INVALID_IP', `DNS record "${record.name}" address is not a valid IPv4 address.`);
    }
  }

  return { ok: true };
}

export function cloneNetwork(state) {
  return structuredClone(state);
}
