import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptStartMission,
  createInitialState,
  createInitialProfile,
  requestHint,
  currentHintRecipeId,
  isRecipeRepaired,
  showCauseCount,
  showHarmlessDetail,
  pauseMissionTimer,
  resumeMissionTimer,
} from '../../src/solo/app.js';
import { applyAction } from '../../src/solo/actions.js';
import { applyRecipe } from '../../src/solo/generate.js';
import { createHealthyLayout } from '../../src/solo/layouts.js';
import { deriveRequirements } from '../../src/solo/layouts.js';
import { HINTS, CUSTOMER_FACTS, HARMLESS_DETAILS } from '../../src/solo/content.js';
import { executeCommand, createTerminalSession } from '../../src/solo/cli.js';

const REPAIR_ACTIONS = {
  P1: { type: 'setLinkConnected', linkId: 'L1', connected: true },
  P2: { type: 'setPortAdmin', portId: 'SW1:Gi0/1', adminUp: true },
  V1: { type: 'setAccessVlan', portId: 'SW1:Gi0/1', vlanId: 10 },
  V2: { type: 'setTrunkAllowedVlans', portId: 'SW1:Gi0/24', vlans: [10, 20] },
};
function repairActionFor(recipeId, x, host) {
  switch (recipeId) {
    case 'I1':
      return { type: 'setClientAddress', deviceId: 'PC1', ip: `10.${x}.10.${host}`, prefix: 24 };
    case 'I2':
      return { type: 'setClientGateway', deviceId: 'PC1', gateway: `10.${x}.10.1` };
    case 'D1':
      return { type: 'setClientDns', deviceId: 'PC1', dns: `10.${x}.30.53` };
    case 'D2':
      return { type: 'setDnsRecord', serverId: 'S1', name: 'portal.northline.test', address: `10.${x}.30.53` };
    default:
      return REPAIR_ACTIONS[recipeId];
  }
}

test('isRecipeRepaired correctly flags every one of the eight recipes broken, then repaired', () => {
  const x = 71;
  const host = 136;
  for (const recipeId of ['P1', 'P2', 'I1', 'I2', 'V1', 'V2', 'D1', 'D2']) {
    const healthy = createHealthyLayout('BR', x, host);
    const faulted = applyRecipe(healthy, recipeId, x, host);
    const mission = { network: faulted, requirements: deriveRequirements(healthy), targetClientId: 'PC1', targetName: 'portal.northline.test' };
    assert.equal(isRecipeRepaired(mission, recipeId), false, `${recipeId} should read as broken`);
    const repaired = applyAction(faulted, repairActionFor(recipeId, x, host)).state;
    assert.equal(
      isRecipeRepaired({ ...mission, network: repaired }, recipeId),
      true,
      `${recipeId} should read as repaired after its real fix`,
    );
  }
});

function stateWithProfile() {
  return { ...createInitialState(), profile: createInitialProfile() };
}

function startTier(layout, tier, family, seed) {
  return attemptStartMission(stateWithProfile(), `TF1-${layout}-${tier}-${family}-${seed}`);
}

test('content.js has hint copy and customer facts for all eight recipes', () => {
  for (const recipeId of ['P1', 'P2', 'I1', 'I2', 'V1', 'V2', 'D1', 'D2']) {
    assert.ok(HINTS[recipeId], recipeId);
    assert.ok(HINTS[recipeId].nudge && HINTS[recipeId].clue && HINTS[recipeId].step, recipeId);
    assert.ok(CUSTOMER_FACTS[recipeId], recipeId);
  }
  assert.equal(HARMLESS_DETAILS.length, 3);
});

test('tier1/2 show cause count; tier3/4 hide it', () => {
  const tier1 = startTier('HM', 1, 'P', 'a');
  const tier2 = startTier('BR', 2, 'I', 'b');
  const tier3 = startTier('BR', 3, 'V', 'c');
  const tier4 = startTier('BR', 4, 'M', 'd');
  assert.equal(showCauseCount(tier1.mission), true);
  assert.equal(showCauseCount(tier2.mission), true);
  assert.equal(showCauseCount(tier3.mission), false);
  assert.equal(showCauseCount(tier4.mission), false);
});

test('tier3 starts without a cause label: no cause count and no recipe id leak into the brief-facing content', () => {
  const started = startTier('BR', 3, 'D', 'e');
  assert.equal(showCauseCount(started.mission), false);
  // The customer-facing facts/harmless details never mention a recipe ID.
  for (const text of [...Object.values(CUSTOMER_FACTS).flatMap((f) => Object.values(f)), ...HARMLESS_DETAILS]) {
    assert.doesNotMatch(text, /\b[PIVD][12]\b/);
  }
});

test('tier3 shows exactly one harmless detail; other tiers show none', () => {
  const tier1 = startTier('HM', 1, 'P', 'f');
  const tier3 = startTier('BR', 3, 'I', 'g');
  assert.equal(showHarmlessDetail(tier1.mission), false);
  assert.equal(showHarmlessDetail(tier3.mission), true);
  assert.equal(typeof tier3.mission.detail, 'number');
});

test('hints remain available at tier4', () => {
  const started = startTier('BR', 4, 'M', 'h');
  const withHint = requestHint(started);
  assert.equal(withHint.mission.assisted, true);
  const recipeId = currentHintRecipeId(withHint.mission);
  assert.equal(withHint.mission.hintLevels[recipeId], 1);
});

test('requesting a hint sets assisted; ordinary CLI ? does not', () => {
  const started = startTier('HM', 1, 'P', 'i');
  assert.equal(started.mission.assisted, false);

  const terminal = createTerminalSession('PC1', 'client');
  const helpResult = executeCommand(started, terminal, '?', false);
  assert.equal(helpResult.state.mission.assisted, false);

  const hinted = requestHint(started);
  assert.equal(hinted.mission.assisted, true);
});

const TIER4_PAIRS = ['P1+D1', 'P2+I2', 'I1+D1', 'V1+D1', 'V2+I2', 'V2+D1'];

for (const pairText of TIER4_PAIRS) {
  test(`tier4 pair ${pairText}: hints progress to the remaining fault after the first is repaired`, () => {
    const [first, second] = pairText.split('+');
    const x = 88;
    const host = 133;
    const healthy = createHealthyLayout('BR', x, host);
    let faulted = applyRecipe(healthy, first, x, host);
    faulted = applyRecipe(faulted, second, x, host);
    const mission = {
      network: faulted,
      requirements: deriveRequirements(healthy),
      targetClientId: 'PC1',
      targetName: 'portal.northline.test',
      recipeIds: [first, second],
    };
    assert.equal(currentHintRecipeId(mission), first);

    const repairedNetwork = applyAction(faulted, repairActionFor(first, x, host)).state;
    const afterFirstRepair = { ...mission, network: repairedNetwork };
    assert.equal(currentHintRecipeId(afterFirstRepair), second, `after repairing ${first}, hints move to ${second}`);
  });
}

test('paused app time does not increase active elapsed time', () => {
  const started = startTier('HM', 1, 'P', 'k');
  const t0 = started.sessionResumedAt;
  const paused = pauseMissionTimer(started, t0 + 5000);
  assert.equal(paused.mission.elapsedMs, 5000);
  assert.equal(paused.sessionResumedAt, null);

  // Time passes while paused — must not be counted.
  const stillPaused = pauseMissionTimer(paused, t0 + 60000);
  assert.equal(stillPaused.mission.elapsedMs, 5000, 'a no-op pause (already paused) adds nothing');

  const resumed = resumeMissionTimer(stillPaused, t0 + 60000);
  const pausedAgain = pauseMissionTimer(resumed, t0 + 63000);
  assert.equal(pausedAgain.mission.elapsedMs, 8000, '5000 active + 3000 active, the 55000ms paused gap excluded');
});
