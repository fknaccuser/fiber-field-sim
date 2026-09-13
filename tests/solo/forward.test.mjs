import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canReach, resolveName, testService } from '../../src/solo/forward.js';
import { createHealthyLayout } from '../../src/solo/layouts.js';
import { cloneNetwork } from '../../src/solo/model.js';

const PORTAL_NAME = 'portal.northline.test';

// Copied verbatim from fixtures/expected-cases.json (SCENARIOS.md's fixture
// patch format: [collection, id-or-record-name, field, value], applied to a
// clone of the healthy BR layout).
const EXPECTED_CASES = [
  { name: 'healthy', patches: [], targetService: true, protectedService: true },
  { name: 'P1', patches: [['links', 'L1', 'connected', false]], targetService: false, protectedService: true },
  { name: 'P2', patches: [['ports', 'SW1:Gi0/1', 'adminUp', false]], targetService: false, protectedService: true },
  { name: 'I1', patches: [['devices', 'PC1', 'ip', '10.42.99.130']], targetService: false, protectedService: true },
  { name: 'I2', patches: [['devices', 'PC1', 'gateway', '10.42.10.254']], targetService: false, protectedService: true },
  { name: 'V1', patches: [['ports', 'SW1:Gi0/1', 'accessVlan', 20]], targetService: false, protectedService: true },
  { name: 'V2', patches: [['ports', 'SW1:Gi0/24', 'allowedVlans', [20]]], targetService: false, protectedService: true },
  { name: 'D1', patches: [['devices', 'PC1', 'dns', '10.42.30.54']], targetService: false, protectedService: true },
  { name: 'D2', patches: [['dnsRecords', 'portal.northline.test', 'address', '10.42.30.80']], targetService: false, protectedService: false },
  { name: 'alternate-valid-ip', patches: [['devices', 'PC1', 'ip', '10.42.10.131']], targetService: true, protectedService: true },
  { name: 'protected-outage', patches: [['ports', 'SW1:Gi0/2', 'adminUp', false]], targetService: true, protectedService: false },
  {
    name: 'P1+D1',
    patches: [
      ['links', 'L1', 'connected', false],
      ['devices', 'PC1', 'dns', '10.42.30.54'],
    ],
    targetService: false,
    protectedService: true,
  },
  // Added per S05.md step 3, beyond the supplied fixture:
  {
    name: 'server-return-gateway-failure',
    patches: [['devices', 'S1', 'gateway', '10.42.30.99']],
    targetService: false,
    protectedService: false,
  },
  {
    name: 'duplicate-host-address',
    patches: [['devices', 'PC2', 'ip', '10.42.10.130']],
    targetService: false,
    protectedService: false,
  },
];

function applyPatches(network, patches) {
  const next = cloneNetwork(network);
  for (const [collection, key, field, value] of patches) {
    const idField = collection === 'dnsRecords' ? 'name' : 'id';
    const record = next[collection].find((item) => item[idField] === key);
    if (!record) throw new Error(`Fixture patch: no ${collection} record "${key}".`);
    record[field] = value;
  }
  return next;
}

for (const testCase of EXPECTED_CASES) {
  test(`expected-case ${testCase.name}: target=${testCase.targetService} protected=${testCase.protectedService}`, () => {
    const network = applyPatches(createHealthyLayout('BR', 42, 130), testCase.patches);
    const target = testService(network, 'PC1', PORTAL_NAME);
    const protectedResult = testService(network, 'PC2', PORTAL_NAME);
    assert.equal(target.ok, testCase.targetService, `target: ${JSON.stringify(target)}`);
    assert.equal(protectedResult.ok, testCase.protectedService, `protected: ${JSON.stringify(protectedResult)}`);
  });
}

test('healthy target and protected pass with code OK', () => {
  const network = createHealthyLayout('BR', 42, 130);
  assert.equal(testService(network, 'PC1', PORTAL_NAME).code, 'OK');
  assert.equal(testService(network, 'PC2', PORTAL_NAME).code, 'OK');
});

test('D1 fails name tests while direct server ping works', () => {
  const network = applyPatches(createHealthyLayout('BR', 42, 130), [['devices', 'PC1', 'dns', '10.42.30.54']]);
  const service = testService(network, 'PC1', PORTAL_NAME);
  assert.equal(service.ok, false);
  assert.equal(service.code, 'DNS_UNREACHABLE');
  const directPing = canReach(network, 'PC1', '10.42.30.53');
  assert.equal(directPing.ok, true);
});

test('D2 affects both clients (shared DNS record)', () => {
  const network = applyPatches(createHealthyLayout('BR', 42, 130), [
    ['dnsRecords', 'portal.northline.test', 'address', '10.42.30.80'],
  ]);
  assert.equal(testService(network, 'PC1', PORTAL_NAME).ok, false);
  assert.equal(testService(network, 'PC2', PORTAL_NAME).ok, false);
});

test('missing server return-gateway breaks the return path for both clients', () => {
  const network = applyPatches(createHealthyLayout('BR', 42, 130), [
    ['devices', 'S1', 'gateway', '10.42.30.99'],
  ]);
  // The break is on the server's own return path to the resolver query itself,
  // so resolveName's reachability probe to the resolver fails first; per
  // ENGINE_RULES.md, DNS wraps any transport failure as DNS_UNREACHABLE and
  // retains the real reason in details.transport.
  const target = testService(network, 'PC1', PORTAL_NAME);
  assert.equal(target.ok, false);
  assert.equal(target.code, 'DNS_UNREACHABLE');
  const resolved = resolveName(network, 'PC1', PORTAL_NAME);
  assert.equal(resolved.details.transport, 'RETURN_PATH_FAILED');
  // A direct IP ping shows the same underlying break without the DNS wrapper.
  const direct = canReach(network, 'PC1', '10.42.30.53');
  assert.equal(direct.ok, false);
  assert.equal(direct.code, 'RETURN_PATH_FAILED');
});

test('an alternate valid target IP (10.42.10.131) still passes', () => {
  const network = applyPatches(createHealthyLayout('BR', 42, 130), [['devices', 'PC1', 'ip', '10.42.10.131']]);
  assert.equal(testService(network, 'PC1', PORTAL_NAME).ok, true);
});

test('a duplicate host address fails connectivity for both sharers', () => {
  const network = applyPatches(createHealthyLayout('BR', 42, 130), [['devices', 'PC2', 'ip', '10.42.10.130']]);
  const pc1 = canReach(network, 'PC1', '10.42.30.53');
  const pc2 = canReach(network, 'PC2', '10.42.30.53');
  assert.equal(pc1.ok, false);
  assert.equal(pc1.code, 'DUPLICATE_IP');
  assert.equal(pc2.ok, false);
  assert.equal(pc2.code, 'DUPLICATE_IP');
});

test('resolveName keeps direct IP tests distinct from name/service tests', () => {
  const network = createHealthyLayout('BR', 42, 130);
  const resolved = resolveName(network, 'PC1', PORTAL_NAME);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.address, '10.42.30.53');
  const direct = canReach(network, 'PC1', '10.42.30.53');
  assert.equal(direct.ok, true);
});

test('resolveName is case-insensitive and ignores a trailing dot', () => {
  const network = createHealthyLayout('BR', 42, 130);
  assert.equal(resolveName(network, 'PC1', 'PORTAL.NORTHLINE.TEST.').ok, true);
});

test('resolveName reports DNS_NOT_FOUND for an absent record', () => {
  const network = createHealthyLayout('BR', 42, 130);
  const result = resolveName(network, 'PC1', 'nowhere.example.test');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DNS_NOT_FOUND');
});

test('a wrong-but-reachable resolved address reports WRONG_SERVICE', () => {
  const network = applyPatches(createHealthyLayout('BR', 42, 130), [
    ['dnsRecords', 'portal.northline.test', 'address', '10.42.20.20'], // PC2's own address: reachable, not the portal
  ]);
  const result = testService(network, 'PC1', PORTAL_NAME);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'WRONG_SERVICE');
});
