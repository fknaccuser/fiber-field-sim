import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parameters } from '../../src/solo/seed.js';
import { generateCase, nextCase, applyRecipe } from '../../src/solo/generate.js';
import { createHealthyLayout } from '../../src/solo/layouts.js';
import { validateNetwork } from '../../src/solo/model.js';
import { testService } from '../../src/solo/forward.js';
import { applyAction } from '../../src/solo/actions.js';

const SEED_VECTORS = [
  { code: 'TF1-HM-1-P-START', expected: { layout: 'HM', tier: 1, family: 'P', x: 196, host: 148, recipes: ['P1'], label: 2, detail: 0 } },
  { code: 'TF1-BR-3-D-12345', expected: { layout: 'BR', tier: 3, family: 'D', x: 94, host: 138, recipes: ['D2'], label: 2, detail: 1 } },
  { code: 'TF1-OF-4-M-alpha', expected: { layout: 'OF', tier: 4, family: 'M', x: 74, host: 138, recipes: ['P2', 'I2'], label: 1, detail: 0 } },
  { code: 'TF1-BR-2-V-123', expected: { layout: 'BR', tier: 2, family: 'V', x: 144, host: 148, recipes: ['V2'], label: 0, detail: 2 } },
  { code: 'TF1-HM-2-I-IP', expected: { layout: 'HM', tier: 2, family: 'I', x: 27, host: 147, recipes: ['I1'], label: 0, detail: 1 } },
];

test('parameters() matches every supplied seed vector exactly', () => {
  for (const { code, expected } of SEED_VECTORS) {
    assert.deepEqual(parameters(code), expected, code);
  }
});

test('START is P1', () => {
  const attempt = generateCase('TF1-HM-1-P-START');
  assert.deepEqual(attempt.recipeIds, ['P1']);
  assert.equal(attempt.tier, 1);
});

test('HM cannot generate V2: every HM V-family code resolves to V1', () => {
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
    const params = parameters(`TF1-HM-2-V-${seed}`);
    assert.deepEqual(params.recipes, ['V1'], seed);
  }
});

test('HM cannot generate tier4: parameters() rejects any HM+M combination', () => {
  assert.throws(() => parameters('TF1-HM-4-M-anything'));
});

test('generateCase full-network equality across repeated generation for the same code', () => {
  const a = generateCase('TF1-BR-3-D-12345');
  const b = generateCase('TF1-BR-3-D-12345');
  assert.deepEqual(a, b);
});

test('requirements come from the healthy layout, not the faulted one (I1 moves the subnet)', () => {
  const attempt = generateCase('TF1-HM-2-I-IP'); // I1: target host moves to 10.X.99.*
  const healthy = createHealthyLayout('HM', 27, 147);
  const healthyPc1 = healthy.devices.find((d) => d.id === 'PC1');
  assert.equal(attempt.requirements.targetSubnet, `${healthyPc1.ip.split('.').slice(0, 3).join('.')}.0`);
  assert.notEqual(attempt.initialNetwork.devices.find((d) => d.id === 'PC1').ip, healthyPc1.ip);
});

test('a generated faulted network is still structurally valid ("broken but structurally valid")', () => {
  for (const code of ['TF1-HM-1-P-START', 'TF1-BR-3-D-12345', 'TF1-OF-4-M-alpha', 'TF1-BR-2-V-123']) {
    const attempt = generateCase(code);
    assert.deepEqual(validateNetwork(attempt.initialNetwork), { ok: true }, code);
  }
});

function repairActionFor(recipeId, x, host) {
  switch (recipeId) {
    case 'P1':
      return { type: 'setLinkConnected', linkId: 'L1', connected: true };
    case 'P2':
      return { type: 'setPortAdmin', portId: 'SW1:Gi0/1', adminUp: true };
    case 'I1':
      return { type: 'setClientAddress', deviceId: 'PC1', ip: `10.${x}.10.${host}`, prefix: 24 };
    case 'I2':
      return { type: 'setClientGateway', deviceId: 'PC1', gateway: `10.${x}.10.1` };
    case 'V1':
      return { type: 'setAccessVlan', portId: 'SW1:Gi0/1', vlanId: 10 };
    case 'V2':
      return { type: 'setTrunkAllowedVlans', portId: 'SW1:Gi0/24', vlans: [10, 20] };
    case 'D1':
      return { type: 'setClientDns', deviceId: 'PC1', dns: `10.${x}.30.53` };
    case 'D2':
      return { type: 'setDnsRecord', serverId: 'S1', name: 'portal.northline.test', address: `10.${x}.30.53` };
    default:
      throw new Error(`no repair defined for ${recipeId}`);
  }
}

const ALL_SINGLE_RECIPES = ['P1', 'P2', 'I1', 'I2', 'V1', 'V2', 'D1', 'D2'];

for (const recipeId of ALL_SINGLE_RECIPES) {
  test(`${recipeId}: healthy base passes, injected fault fails, reversing restores service`, () => {
    const x = 55;
    const host = 135;
    const healthy = createHealthyLayout('BR', x, host);
    assert.equal(testService(healthy, 'PC1', 'portal.northline.test').ok, true, 'healthy base passes');

    const faulted = applyRecipe(healthy, recipeId, x, host);
    assert.equal(testService(faulted, 'PC1', 'portal.northline.test').ok, false, 'injected fault fails');

    const repairResult = applyAction(faulted, repairActionFor(recipeId, x, host));
    assert.equal(repairResult.ok, true, `repair action for ${recipeId} was accepted`);
    assert.equal(testService(repairResult.state, 'PC1', 'portal.northline.test').ok, true, 'reversing restores service');
  });
}

const TIER4_PAIRS = ['P1+D1', 'P2+I2', 'I1+D1', 'V1+D1', 'V2+I2', 'V2+D1'];

for (const pairText of TIER4_PAIRS) {
  test(`tier4 pair ${pairText} stays broken after either repair alone and succeeds after both`, () => {
    const [first, second] = pairText.split('+');
    const x = 63;
    const host = 141;
    const healthy = createHealthyLayout('BR', x, host);
    let faulted = applyRecipe(healthy, first, x, host);
    faulted = applyRecipe(faulted, second, x, host);
    assert.equal(testService(faulted, 'PC1', 'portal.northline.test').ok, false, 'both faults present: broken');

    const onlyFirstRepaired = applyAction(faulted, repairActionFor(first, x, host)).state;
    assert.equal(testService(onlyFirstRepaired, 'PC1', 'portal.northline.test').ok, false, `${first} repaired alone: still broken`);

    const onlySecondRepaired = applyAction(faulted, repairActionFor(second, x, host)).state;
    assert.equal(testService(onlySecondRepaired, 'PC1', 'portal.northline.test').ok, false, `${second} repaired alone: still broken`);

    let bothRepaired = applyAction(faulted, repairActionFor(first, x, host)).state;
    bothRepaired = applyAction(bothRepaired, repairActionFor(second, x, host)).state;
    assert.equal(testService(bothRepaired, 'PC1', 'portal.northline.test').ok, true, 'both repaired: restored');
  });
}

test('generateCase produces exactly the six approved tier4 pairs and no others', () => {
  const seenPairs = new Set();
  for (let i = 0; i < 200; i += 1) {
    const attempt = generateCase(`TF1-BR-4-M-seed${i}`);
    seenPairs.add(attempt.recipeIds.join('+'));
  }
  for (const pair of seenPairs) {
    assert.ok(TIER4_PAIRS.includes(pair), `${pair} is an approved tier4 pair`);
  }
});

// --- nextCase ---

test('nextCase returns a code whose fingerprint is not in recentFingerprints', () => {
  let counter = 0;
  const settings = { layout: 'BR', tier: 1, family: 'P', candidateSeed: () => `seed${counter++}` };
  const code = nextCase(settings, []);
  assert.match(code, /^TF1-BR-1-P-seed\d+$/);
});

test('nextCase skips a candidate whose fingerprint collides, then succeeds on the next', () => {
  const firstParams = parameters('TF1-BR-1-P-seedA');
  const collidingFingerprint = JSON.stringify([
    firstParams.layout,
    firstParams.tier,
    firstParams.x,
    firstParams.host,
    firstParams.recipes,
    firstParams.label,
    firstParams.detail,
  ]);
  const seeds = ['seedA', 'seedB'];
  let i = 0;
  const settings = { layout: 'BR', tier: 1, family: 'P', candidateSeed: () => seeds[i++] };
  const code = nextCase(settings, [collidingFingerprint]);
  assert.equal(code, 'TF1-BR-1-P-seedB');
});

test('nextCase gives up after 100 failed candidates with a visible error', () => {
  // A candidateSeed made entirely of characters the case-code regex rejects
  // stays invalid even after truncation and suffixing, so every one of the
  // 100 tries fails regardless of collisions.
  const settings = { layout: 'BR', tier: 1, family: 'P', candidateSeed: () => '!'.repeat(24) };
  assert.throws(() => nextCase(settings, []), /Choose a seed manually/);
});
