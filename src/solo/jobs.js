// The jobs tier: short configuration tasks that sit between the knowledge
// farm and the Field. Nothing is broken in a job. There is a spec, the
// trainee configures the device to meet it, and the app checks the result.
//
// Jobs exist because a repair ticket is unsolvable until you know what
// correct looks like: spotting wrong is a comparison. Configuring an access
// port by hand five times is what turns a VLAN fault from trivia into
// something obviously off.
//
// Pure: no DOM, no storage, no randomness. A job prepares its own network
// from a healthy layout and carries a concrete spec derived from that
// layout, so grading never has to re-derive the answer.

import { createHealthyLayout } from './layouts.js';

const device = (network, id) => network.devices.find(d => d.id === id) ?? null;
const port = (network, id) => network.ports.find(p => p.id === id) ?? null;
const linkFor = (network, portId) => network.links.find(l => l.aPortId === portId || l.bPortId === portId) ?? null;

const lanPrefix = (ip) => String(ip ?? '').split('.').slice(0, 3).join('.');
const hostOctet = (ip) => Number(String(ip ?? '').split('.')[3]);

function mapDevice(network, id, changes) {
  return { ...network, devices: network.devices.map(d => (d.id === id ? { ...d, ...changes } : d)) };
}

function mapPort(network, id, changes) {
  return { ...network, ports: network.ports.map(p => (p.id === id ? { ...p, ...changes } : p)) };
}

function sameVlans(a, b) {
  const left = [...new Set(a ?? [])].sort((x, y) => x - y);
  const right = [...new Set(b ?? [])].sort((x, y) => x - y);
  return left.length === right.length && left.every((v, i) => v === right[i]);
}

// Every job follows the same contract:
//   prepare(healthy) -> { network, spec }   strips the config to be supplied
//   checks[]         -> { id, label, test(network, spec) }
export const JOBS = [
  {
    id: 'job-workstation',
    title: 'Set up a new workstation',
    brief: 'A desk has been added on the customer segment. The machine is cabled and powered with no addressing on it. Configure it to match the rest of the segment.',
    skill: 'IPv4 addressing, gateways, resolvers',
    family: 'I',
    minutes: 2,
    prepare(healthy) {
      const pc1 = device(healthy, 'PC1');
      const resolver = device(healthy, 'S1');
      const spec = {
        deviceId: 'PC1',
        prefixLan: lanPrefix(pc1.ip),
        cidr: pc1.prefix,
        gateway: pc1.gateway,
        dns: resolver?.ip ?? pc1.dns,
        taken: healthy.devices.map(d => d.ip).filter(Boolean).filter(ip => ip !== pc1.ip),
      };
      return { network: mapDevice(healthy, 'PC1', { ip: null, gateway: null, dns: null }), spec };
    },
    checks: [
      { id: 'address', label: 'Holds a free address on the customer segment',
        test: (n, s) => {
          const ip = device(n, s.deviceId)?.ip;
          const host = hostOctet(ip);
          return lanPrefix(ip) === s.prefixLan && host >= 2 && host <= 254 && !s.taken.includes(ip);
        } },
      { id: 'prefix', label: `Uses the segment's mask`, test: (n, s) => device(n, s.deviceId)?.prefix === s.cidr },
      { id: 'gateway', label: 'Points at the segment gateway', test: (n, s) => device(n, s.deviceId)?.gateway === s.gateway },
      { id: 'dns', label: 'Points at the resolver', test: (n, s) => device(n, s.deviceId)?.dns === s.dns },
    ],
  },
  {
    id: 'job-access-vlan',
    title: 'Put a desk on the right VLAN',
    brief: 'A spare switch port needs to serve the customer segment. It is currently sitting in the wrong VLAN and in the wrong mode.',
    skill: 'Access ports and VLAN assignment',
    family: 'V',
    minutes: 2,
    prepare(healthy) {
      const target = port(healthy, 'SW1:Gi0/1');
      const spec = { portId: 'SW1:Gi0/3', mode: 'access', vlan: target.accessVlan };
      return { network: mapPort(healthy, 'SW1:Gi0/3', { mode: 'trunk', accessVlan: 99, allowedVlans: [99] }), spec };
    },
    checks: [
      { id: 'mode', label: 'Port is an access port', test: (n, s) => port(n, s.portId)?.mode === 'access' },
      { id: 'vlan', label: 'Port carries the customer VLAN', test: (n, s) => port(n, s.portId)?.accessVlan === s.vlan },
    ],
  },
  {
    id: 'job-port-up',
    title: 'Bring a port into service',
    brief: 'The cable is run and seated. The port it lands on has never been enabled.',
    skill: 'Port state and physical links',
    family: 'P',
    minutes: 1,
    prepare(healthy) {
      return { network: mapPort(healthy, 'SW1:Gi0/1', { adminUp: false }), spec: { portId: 'SW1:Gi0/1' } };
    },
    checks: [
      { id: 'admin', label: 'Port is administratively up', test: (n, s) => port(n, s.portId)?.adminUp === true },
      { id: 'link', label: 'Cable is connected at both ends', test: (n, s) => linkFor(n, s.portId)?.connected === true },
    ],
  },
  {
    id: 'job-trunk',
    title: 'Carry both departments over the trunk',
    brief: 'A new uplink between the switches is live but passing nothing. Both departments have to cross it.',
    skill: 'Trunk ports and allowed VLAN lists',
    family: 'V',
    minutes: 2,
    prepare(healthy) {
      const trunk = port(healthy, 'SW1:Gi0/24');
      const spec = { portId: 'SW1:Gi0/24', mode: 'trunk', allowed: [...trunk.allowedVlans] };
      return { network: mapPort(healthy, 'SW1:Gi0/24', { mode: 'access', allowedVlans: [] }), spec };
    },
    checks: [
      { id: 'mode', label: 'Port is a trunk', test: (n, s) => port(n, s.portId)?.mode === 'trunk' },
      { id: 'allowed', label: 'Trunk allows both departments and nothing spare',
        test: (n, s) => sameVlans(port(n, s.portId)?.allowedVlans, s.allowed) },
    ],
  },
  {
    id: 'job-resolver',
    title: 'Point a client at the resolver',
    brief: 'A machine reaches everything by address and nothing by name. Its resolver was never filled in.',
    skill: 'DNS client configuration',
    family: 'D',
    minutes: 1,
    prepare(healthy) {
      const resolver = device(healthy, 'S1');
      const spec = { deviceId: 'PC1', dns: resolver?.ip ?? device(healthy, 'PC1').dns };
      return { network: mapDevice(healthy, 'PC1', { dns: null }), spec };
    },
    checks: [
      { id: 'dns', label: 'Resolver address is set', test: (n, s) => device(n, s.deviceId)?.dns === s.dns },
    ],
  },
];

export function jobById(id) {
  return JOBS.find(j => j.id === id) ?? null;
}

// Jobs are authored against the branch layout, which is the only one that
// carries every port they reference. Keeping that explicit here beats
// failing obscurely on a home-lab layout that has no distribution switch.
export const JOB_LAYOUT = 'BR';

export function prepareJob(jobId, x = 42) {
  const job = jobById(jobId);
  if (!job) return null;
  const healthy = createHealthyLayout(JOB_LAYOUT, x);
  const { network, spec } = job.prepare(healthy);
  return { jobId: job.id, mode: 'job', network, spec, startedAt: null };
}

export function gradeJob(jobId, network, spec) {
  const job = jobById(jobId);
  if (!job) return { passed: false, checks: [], error: 'Unknown job.' };
  const checks = job.checks.map(check => ({
    id: check.id,
    label: check.label,
    ok: Boolean(safely(() => check.test(network, spec))),
  }));
  return { passed: checks.every(c => c.ok), checks };
}

function safely(run) {
  try { return run(); } catch { return false; }
}
