import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ISSUES, ISSUE_CATEGORIES, choicesFor, gradeIssue, liveCodeFor, searchIssues } from '../../src/solo/issues.js';
import { trainingMode } from '../../src/solo/guidance.js';
import { generateCase } from '../../src/solo/generate.js';
import { parameters } from '../../src/solo/seed.js';
import { executeCommand, createTerminalSession } from '../../src/solo/cli.js';
import { createInitialState, createInitialProfile } from '../../src/solo/app.js';
import { applyAction } from '../../src/solo/actions.js';
import { evaluateCompletion } from '../../src/solo/grade.js';
import { validateNetwork } from '../../src/solo/model.js';

test('200 distinct issue records have complete evidence, repair, and verification; coverage is explicit', () => {
  assert.equal(ISSUES.length, 200); assert.equal(new Set(ISSUES.map(i => i.id)).size, 200); assert.equal(new Set(ISSUES.map(i => i.title)).size, 200);
  assert.equal(ISSUE_CATEGORIES.length, 10); assert.equal(ISSUES.filter(i => i.recipeId).length, 8);
  for (const issue of ISSUES) for (const field of ['title', 'symptom', 'evidence', 'repair', 'verification', 'grouping']) assert.ok(issue[field]?.length, `${issue.id}: ${field}`);
  for (const category of ISSUE_CATEGORIES) assert.equal(ISSUES.filter(i => i.category === category).length, 20);
});
test('case search and four-option diagnosis checks work for every issue', () => {
  assert.equal(searchIssues({ liveOnly: true }).length, 8);
  assert.ok(searchIssues({ query: 'DHCP', grouping: 'Rare' }).every(i => i.grouping === 'Rare'));
  for (const issue of ISSUES) {
    for (const field of ['repair', 'verification']) { const choices = choicesFor(issue, field); assert.equal(new Set(choices.map(i => i.id)).size, 4); assert.ok(choices.includes(issue)); }
    const answer = { repairId: issue.id, verificationId: issue.id, note: 'The observed evidence isolates the affected service path.', evidenceRead: true };
    assert.equal(gradeIssue(issue, answer).passed, true);
    assert.equal(gradeIssue(issue, { ...answer, evidenceRead: false }).passed, false);
    assert.equal(gradeIssue(issue, { ...answer, repairId: 'wrong' }).passed, false);
    assert.equal(gradeIssue(issue, { ...answer, verificationId: 'wrong' }).passed, false);
    assert.equal(gradeIssue(issue, { ...answer, revealed: true }).independent, false);
  }
});
test('every live adapter launches the promised fault across all learning levels and variations', () => {
  for (const issue of ISSUES.filter(i => i.recipeId)) for (const tier of [1, 2, 3]) for (let variation = 0; variation < 5; variation++) {
    const code = liveCodeFor(issue.id, tier, variation); const mission = generateCase(code);
    assert.deepEqual(mission.recipeIds, [issue.recipeId]); assert.equal(mission.tier, tier); assert.equal(validateNetwork(mission.network).ok, true);
  }
  assert.throws(() => liveCodeFor(ISSUES.find(i => !i.recipeId).id));
});
test('training removes shortcuts for advanced tiers and proven independent learners', () => {
  const profile = { completedRuns: [] };
  assert.equal(trainingMode({ mode: 'repair', tier: 1 }, profile), 'guided');
  assert.equal(trainingMode({ mode: 'repair', tier: 2 }, profile), 'coached');
  assert.equal(trainingMode({ mode: 'repair', tier: 3 }, profile), 'console');
  assert.equal(trainingMode({ mode: 'repair', tier: 4 }, profile), 'console');
  const experienced = { completedRuns: Array.from({ length: 8 }, (_, i) => ({ mode: 'repair', assisted: false, recipes: [['P1', 'I1', 'V1', 'D1'][i % 4]] })) };
  assert.equal(trainingMode({ mode: 'repair', tier: 1 }, experienced), 'console');
});

function sessionFor(issue) { return { ...createInitialState(), profile: createInitialProfile(), mission: { ...generateCase(liveCodeFor(issue.id, 3)), id: issue.id } }; }
function command(state, deviceId, commandText, sessions = {}, assisted = false) {
  const device = state.mission.network.devices.find(d => d.id === deviceId);
  const result = executeCommand(state, sessions[deviceId] ?? createTerminalSession(deviceId, device.kind), commandText, assisted);
  assert.equal(result.ok, true, `${commandText}: ${result.output.join('\n')}`); sessions[deviceId] = result.terminal; return result.state;
}
test('all eight live fault types can be repaired and verified without GUI configuration or test shortcuts', () => {
  for (const issue of ISSUES.filter(i => i.recipeId)) {
    let state = sessionFor(issue); const sessions = {}; const { x, host } = parameters(state.mission.caseCode);
    state = command(state, 'PC1', 'curl http://portal.northline.test', sessions);
    assert.equal(state.mission.events.at(-1).details.result.ok, false);
    if (issue.recipeId === 'P1') state.mission.network = applyAction(state.mission.network, { type: 'setLinkConnected', linkId: 'L1', connected: true }).state; // Physical repair remains on the canvas.
    if (['I1', 'I2'].includes(issue.recipeId)) state = command(state, 'PC1', `netsh interface ipv4 set address name=eth0 static 10.${x}.10.${host} 255.255.255.0 10.${x}.10.1`, sessions);
    if (issue.recipeId === 'D1') state = command(state, 'PC1', `netsh interface ipv4 set dnsservers name=eth0 static 10.${x}.30.53`, sessions);
    if (issue.recipeId === 'D2') state = command(state, 'S1', `dns-record portal.northline.test 10.${x}.30.53`, sessions);
    if (['P2', 'V1', 'V2'].includes(issue.recipeId)) {
      for (const cmd of ['enable', 'configure terminal', `interface ${issue.recipeId === 'V2' ? 'Gi0/24' : 'Gi0/1'}`, { P2: 'no shutdown', V1: 'switchport access vlan 10', V2: 'switchport trunk allowed vlan 10,20' }[issue.recipeId]]) state = command(state, 'SW1', cmd, sessions);
    }
    state = command(state, 'PC1', 'curl -I http://portal.northline.test', sessions);
    state = command(state, 'PC2', 'curl http://portal.northline.test', sessions);
    state.mission.selectedFindingIds = [state.mission.events.at(-1).id]; state.mission.completionNote = 'Isolated the failure using observed evidence, repaired it, and verified both clients.';
    const evaluation = evaluateCompletion(state.mission); assert.equal(evaluation.passed, true, issue.title + JSON.stringify(evaluation.checks.filter(c => !c.passed)));
    const changed = applyAction(state.mission.network, { type: 'setClientDns', deviceId: 'PC1', dns: `10.${x}.30.99` }); state.mission.network = changed.state;
    assert.equal(evaluateCompletion(state.mission).checks.find(c => c.id === 'targetVerifiedAtCurrentRevision').passed, false);
  }
});
test('invalid multi-field CLI command is atomic and a wrong HTTP name cannot verify the assigned service', () => {
  const state = sessionFor(ISSUES.find(i => i.recipeId === 'I1')); const session = createTerminalSession('PC1', 'client');
  const result = executeCommand(state, session, 'netsh interface ipv4 set address name=eth0 static 10.42.10.131 255.255.255.0 invalid');
  assert.equal(result.ok, false); assert.deepEqual(result.state.mission.network, state.mission.network); assert.equal(result.state.mission.events.length, 0);
  const http = executeCommand(state, session, 'curl http://unrelated.test'); assert.equal(http.state.mission.events.at(-1).details.testKind, 'httpRequest');
  const assisted = executeCommand(state, session, 'ping 10.42.10.1', true); assert.ok(assisted.state.mission.events.some(e => e.kind === 'assistance'));
});
