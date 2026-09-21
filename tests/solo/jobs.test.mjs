import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHealthyLayout } from '../../src/solo/layouts.js';
import { JOBS, JOB_LAYOUT, jobById, prepareJob, gradeJob } from '../../src/solo/jobs.js';

test('every job prepares a network that fails its own checks', () => {
  for (const job of JOBS) {
    const prepared = prepareJob(job.id);
    const graded = gradeJob(job.id, prepared.network, prepared.spec);
    assert.equal(graded.passed, false, `${job.id} starts already complete, so there is nothing to do`);
    assert.ok(graded.checks.length > 0, job.id);
  }
});

test('the untouched healthy layout passes every job', () => {
  const healthy = createHealthyLayout(JOB_LAYOUT, 42);
  for (const job of JOBS) {
    const { spec } = prepareJob(job.id);
    assert.equal(gradeJob(job.id, healthy, spec).passed, true, `${job.id} cannot be satisfied by a correct network`);
  }
});

test('a job carries a brief, a skill and a family', () => {
  for (const job of JOBS) {
    assert.ok(job.title && job.brief && job.skill, job.id);
    assert.ok(['P', 'I', 'V', 'D'].includes(job.family), `${job.id} has family ${job.family}`);
    assert.ok(job.minutes <= 3, `${job.id} is too long to farm`);
  }
});

test('the workstation job accepts any free address and refuses a taken one', () => {
  const { network, spec } = prepareJob('job-workstation');
  const fill = (ip) => ({
    ...network,
    devices: network.devices.map(d => (d.id === 'PC1' ? { ...d, ip, prefix: spec.cidr, gateway: spec.gateway, dns: spec.dns } : d)),
  });
  assert.equal(gradeJob('job-workstation', fill(`${spec.prefixLan}.77`), spec).passed, true);
  const taken = spec.taken.find(ip => ip.startsWith(spec.prefixLan));
  if (taken) assert.equal(gradeJob('job-workstation', fill(taken), spec).passed, false, 'a duplicate address must fail');
  assert.equal(gradeJob('job-workstation', fill('10.99.99.5'), spec).passed, false, 'a foreign subnet must fail');
});

test('the workstation job reports which parts are still missing', () => {
  const { network, spec } = prepareJob('job-workstation');
  const partial = { ...network, devices: network.devices.map(d => (d.id === 'PC1' ? { ...d, ip: `${spec.prefixLan}.77` } : d)) };
  const graded = gradeJob('job-workstation', partial, spec);
  assert.equal(graded.passed, false);
  assert.equal(graded.checks.find(c => c.id === 'address').ok, true);
  assert.equal(graded.checks.find(c => c.id === 'gateway').ok, false);
});

test('the trunk job refuses a list that carries a spare VLAN', () => {
  const { network, spec } = prepareJob('job-trunk');
  const withVlans = (allowedVlans) => ({
    ...network,
    ports: network.ports.map(p => (p.id === spec.portId ? { ...p, mode: 'trunk', allowedVlans } : p)),
  });
  assert.equal(gradeJob('job-trunk', withVlans(spec.allowed), spec).passed, true);
  assert.equal(gradeJob('job-trunk', withVlans([...spec.allowed, 99]), spec).passed, false);
  assert.equal(gradeJob('job-trunk', withVlans([spec.allowed[0]]), spec).passed, false);
});

test('the access-port job wants access mode, not a trunk that happens to carry the VLAN', () => {
  const { network, spec } = prepareJob('job-access-vlan');
  const trunked = { ...network, ports: network.ports.map(p => (p.id === spec.portId ? { ...p, mode: 'trunk', accessVlan: spec.vlan } : p)) };
  assert.equal(gradeJob('job-access-vlan', trunked, spec).passed, false);
  const fixed = { ...network, ports: network.ports.map(p => (p.id === spec.portId ? { ...p, mode: 'access', accessVlan: spec.vlan } : p)) };
  assert.equal(gradeJob('job-access-vlan', fixed, spec).passed, true);
});

test('jobs prepare identically across seeds and unknown ids are refused', () => {
  const a = prepareJob('job-resolver', 7);
  assert.equal(a.spec.dns.startsWith('10.7.'), true, `derived from the seed, got ${a.spec.dns}`);
  assert.equal(prepareJob('nope'), null);
  assert.equal(gradeJob('nope', {}, {}).passed, false);
  assert.equal(jobById('job-trunk').family, 'V');
});
