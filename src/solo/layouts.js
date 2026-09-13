// The three fixed SOLO-1 layouts (SCENARIOS.md "Three fixed layouts" and "Fixed
// generator details"). BR is the supplied golden fixture (fixtures/healthy-branch.json,
// copied verbatim below with its X=42, host=130); HM and OF are its documented
// transformations.
//
// Label variants ("plain, customer-prefixed, site-prefixed display names") are a
// display-only hook here. Their exact three templates live in reference/seed.mjs,
// which is out of scope for this task (S03 reads only DATA_CONTRACTS.md,
// ENGINE_RULES.md, fixtures/healthy-branch.json and SCENARIOS.md) and is copied
// verbatim as src/solo/seed.js by a later task. Only 'plain' (the identity) is
// exercised here; anything else applies a generic, clearly provisional prefix and
// must be reconciled with seed.js's real templates once that file lands.

const BASE_X = 42;

const BASE_NETWORK = {
  schema: 1,
  layoutId: 'BR',
  devices: [
    {
      id: 'PC1',
      name: 'Customer workstation',
      kind: 'client',
      powered: true,
      ip: '10.42.10.130',
      prefix: 24,
      gateway: '10.42.10.1',
      dns: '10.42.30.53',
    },
    {
      id: 'PC2',
      name: 'Protected workstation',
      kind: 'client',
      powered: true,
      ip: '10.42.20.20',
      prefix: 24,
      gateway: '10.42.20.1',
      dns: '10.42.30.53',
    },
    { id: 'SW1', name: 'Access switch', kind: 'switch', powered: true },
    { id: 'SW2', name: 'Distribution switch', kind: 'switch', powered: true },
    {
      id: 'R1',
      name: 'Gateway',
      kind: 'router',
      powered: true,
      routerSegments: [
        { portId: 'R1:Gi0/0', vlanId: 10, ip: '10.42.10.1', prefix: 24 },
        { portId: 'R1:Gi0/0', vlanId: 20, ip: '10.42.20.1', prefix: 24 },
        { portId: 'R1:Gi0/1', vlanId: null, ip: '10.42.30.1', prefix: 24 },
      ],
    },
    {
      id: 'S1',
      name: 'DNS and portal',
      kind: 'server',
      powered: true,
      ip: '10.42.30.53',
      prefix: 24,
      gateway: '10.42.30.1',
    },
  ],
  ports: [
    { id: 'PC1:eth0', deviceId: 'PC1', label: 'eth0', adminUp: true, mode: 'routed', accessVlan: 10, allowedVlans: [], nativeVlan: 1 },
    { id: 'PC2:eth0', deviceId: 'PC2', label: 'eth0', adminUp: true, mode: 'routed', accessVlan: 10, allowedVlans: [], nativeVlan: 1 },
    { id: 'S1:eth0', deviceId: 'S1', label: 'eth0', adminUp: true, mode: 'routed', accessVlan: 10, allowedVlans: [], nativeVlan: 1 },
    { id: 'SW1:Gi0/1', deviceId: 'SW1', label: 'Gi0/1', adminUp: true, mode: 'access', accessVlan: 10, allowedVlans: [], nativeVlan: 1 },
    { id: 'SW1:Gi0/2', deviceId: 'SW1', label: 'Gi0/2', adminUp: true, mode: 'access', accessVlan: 20, allowedVlans: [], nativeVlan: 1 },
    { id: 'SW1:Gi0/3', deviceId: 'SW1', label: 'Gi0/3', adminUp: true, mode: 'access', accessVlan: 10, allowedVlans: [], nativeVlan: 1 },
    { id: 'SW1:Gi0/24', deviceId: 'SW1', label: 'Gi0/24', adminUp: true, mode: 'trunk', accessVlan: 10, allowedVlans: [10, 20], nativeVlan: 1 },
    { id: 'SW2:Gi0/24', deviceId: 'SW2', label: 'Gi0/24', adminUp: true, mode: 'trunk', accessVlan: 10, allowedVlans: [10, 20], nativeVlan: 1 },
    { id: 'SW2:Gi0/23', deviceId: 'SW2', label: 'Gi0/23', adminUp: true, mode: 'trunk', accessVlan: 10, allowedVlans: [10, 20], nativeVlan: 1 },
    { id: 'R1:Gi0/0', deviceId: 'R1', label: 'Gi0/0', adminUp: true, mode: 'trunk', accessVlan: 10, allowedVlans: [10, 20], nativeVlan: 1 },
    { id: 'R1:Gi0/1', deviceId: 'R1', label: 'Gi0/1', adminUp: true, mode: 'routed', accessVlan: 10, allowedVlans: [], nativeVlan: 1 },
  ],
  links: [
    { id: 'L1', aPortId: 'PC1:eth0', bPortId: 'SW1:Gi0/1', connected: true },
    { id: 'L2', aPortId: 'PC2:eth0', bPortId: 'SW1:Gi0/2', connected: true },
    { id: 'L3', aPortId: 'SW1:Gi0/24', bPortId: 'SW2:Gi0/24', connected: true },
    { id: 'L4', aPortId: 'SW2:Gi0/23', bPortId: 'R1:Gi0/0', connected: true },
    { id: 'L5', aPortId: 'R1:Gi0/1', bPortId: 'S1:eth0', connected: true },
  ],
  dnsRecords: [{ serverId: 'S1', name: 'portal.northline.test', address: '10.42.30.53' }],
  revision: 0,
};

function substituteX(value, x) {
  if (typeof value === 'string') {
    return value.replace(new RegExp(`^10\\.${BASE_X}\\.`), `10.${x}.`);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => substituteX(entry, x));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, entryValue] of Object.entries(value)) {
      out[key] = substituteX(entryValue, x);
    }
    return out;
  }
  return value;
}

function replaceHostOctet(ip, host) {
  const parts = ip.split('.');
  parts[3] = String(host);
  return parts.join('.');
}

function setTargetHost(network, host) {
  return {
    ...network,
    devices: network.devices.map((device) =>
      device.id === 'PC1' ? { ...device, ip: replaceHostOctet(device.ip, host) } : device,
    ),
  };
}

// HM: remove SW2, attach SW1:Gi0/24 directly to R1:Gi0/0 (SCENARIOS.md "Fixed
// generator details"). Five devices: PC1, PC2, SW1, R1, S1.
function toHomeLab(network) {
  return {
    ...network,
    devices: network.devices.filter((device) => device.id !== 'SW2'),
    ports: network.ports.filter((port) => port.deviceId !== 'SW2'),
    links: network.links
      .filter((link) => link.id !== 'L3' && link.id !== 'L4')
      .concat([{ id: 'L3', aPortId: 'SW1:Gi0/24', bPortId: 'R1:Gi0/0', connected: true }]),
  };
}

// OF: start with BR, move PC2 to a new SW2:Gi0/2 access VLAN 20, add PC3 at
// 10.X.10.150 attached to a new SW2:Gi0/3 access VLAN 10 (SCENARIOS.md). Seven
// devices: PC1, PC2, SW1, SW2, R1, S1, PC3. SW1:Gi0/2 is left present but unused,
// as a real switch's freed port would be.
function toOffice(network, x) {
  const pc3 = {
    id: 'PC3',
    name: 'Additional workstation',
    kind: 'client',
    powered: true,
    ip: `10.${x}.10.150`,
    prefix: 24,
    gateway: `10.${x}.10.1`,
    dns: `10.${x}.30.53`,
  };
  const pc3Port = { id: 'PC3:eth0', deviceId: 'PC3', label: 'eth0', adminUp: true, mode: 'routed', accessVlan: 10, allowedVlans: [], nativeVlan: 1 };
  const sw2Port2 = { id: 'SW2:Gi0/2', deviceId: 'SW2', label: 'Gi0/2', adminUp: true, mode: 'access', accessVlan: 20, allowedVlans: [], nativeVlan: 1 };
  const sw2Port3 = { id: 'SW2:Gi0/3', deviceId: 'SW2', label: 'Gi0/3', adminUp: true, mode: 'access', accessVlan: 10, allowedVlans: [], nativeVlan: 1 };
  return {
    ...network,
    devices: [...network.devices, pc3],
    ports: [...network.ports, pc3Port, sw2Port2, sw2Port3],
    links: network.links
      .filter((link) => link.id !== 'L2')
      .concat([
        { id: 'L6', aPortId: 'PC2:eth0', bPortId: 'SW2:Gi0/2', connected: true },
        { id: 'L7', aPortId: 'PC3:eth0', bPortId: 'SW2:Gi0/3', connected: true },
      ]),
  };
}

function applyLabel(devices, label) {
  if (!label || label === 'plain') return devices;
  return devices.map((device) => ({ ...device, name: `${label}: ${device.name}` }));
}

export function createHealthyLayout(layoutId, x, host = 130, label = 'plain') {
  if (!Number.isInteger(x) || x < 1 || x > 200) {
    throw new Error('x must be an integer between 1 and 200.');
  }
  if (!Number.isInteger(host) || host < 130 || host > 149) {
    throw new Error('host must be an integer between 130 and 149.');
  }

  let network = substituteX(BASE_NETWORK, x);
  network = setTargetHost(network, host);

  if (layoutId === 'BR') {
    // No further transformation.
  } else if (layoutId === 'HM') {
    network = toHomeLab(network);
  } else if (layoutId === 'OF') {
    network = toOffice(network, x);
  } else {
    throw new Error(`Unknown layoutId "${layoutId}".`);
  }

  return { ...network, layoutId, devices: applyLabel(network.devices, label) };
}

function subnetOf(ip) {
  return `${ip.split('.').slice(0, 3).join('.')}.0`;
}

// Attempt.requirements (DATA_CONTRACTS.md "Binding clarifications"): "These
// come from the healthy layout before faults." Shared by configure-mode
// attempts (app.js) and generated repair attempts (generate.js) so both
// derive requirements the same way, from an unfaulted network.
// The client's own port ("routed" mode, accessVlan ignored per ENGINE_RULES.md's
// binding clarifications) never carries the real VLAN — that's on the switch
// access port the client's link actually terminates on.
function accessVlanFor(network, deviceId) {
  const ownPort = network.ports.find((p) => p.deviceId === deviceId);
  const link = network.links.find((l) => l.aPortId === ownPort.id || l.bPortId === ownPort.id);
  const switchPortId = link.aPortId === ownPort.id ? link.bPortId : link.aPortId;
  return network.ports.find((p) => p.id === switchPortId).accessVlan;
}

export function deriveRequirements(healthyNetwork) {
  const pc1 = healthyNetwork.devices.find((d) => d.id === 'PC1');
  const pc2 = healthyNetwork.devices.find((d) => d.id === 'PC2');
  return {
    targetSubnet: subnetOf(pc1.ip),
    targetPrefix: 24,
    targetVlan: accessVlanFor(healthyNetwork, 'PC1'),
    protectedSubnet: subnetOf(pc2.ip),
    protectedPrefix: 24,
    protectedVlan: accessVlanFor(healthyNetwork, 'PC2'),
    portalServerId: 'S1',
  };
}
