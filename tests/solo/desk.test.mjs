import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, makeOrder } from '../../src/solo/desk/jobs.js';
import { buildWorld, baselineOf, grade, requirementStates, extrasOf } from '../../src/solo/desk/grade.js';
import { createSession, execute } from '../../src/solo/labs/ios.js';
import { branchById } from '../../src/solo/tree/ccna.js';

// Do the order the way its "show me" help would.
function solve(order) {
  const world = buildWorld(order);
  const baseline = baselineOf(world);
  const sessions = Object.fromEntries(order.devices.map(d => [d.id, createSession(world, d.id)]));
  for (const r of order.requirements) {
    for (const [d, lines] of Object.entries(r.show)) for (const l of lines) execute(sessions[d], l);
  }
  return { world, baseline, sessions };
}

for (const t of TEMPLATES) {
  test(`${t.kind}: every seed starts undone and the shown commands score 100 with no extras`, () => {
    for (let seed = 1; seed <= 120; seed += 1) {
      const order = makeOrder(t.kind, seed);
      const fresh = buildWorld(order);
      assert.deepEqual(requirementStates(order, fresh).filter(s => s.ok).map(s => s.id), [], `${t.kind} seed ${seed} starts partly done`);
      const { world, baseline } = solve(order);
      const g = grade(order, world, baseline);
      assert.deepEqual(g.reqs.filter(r => !r.ok).map(r => r.id), [], `${t.kind} seed ${seed} requirements`);
      assert.deepEqual(g.tests.filter(x => !x.ok).map(x => x.id), [], `${t.kind} seed ${seed} tests`);
      assert.deepEqual(g.extras.map(e => e.text), [], `${t.kind} seed ${seed} extras`);
      assert.equal(g.pct, 100);
    }
  });
  test(`${t.kind}: lights branches with a Do tier, and seeds differ`, () => {
    for (const b of t.lights) assert.ok(branchById(b)?.tiers.includes('do'), b);
    const a = makeOrder(t.kind, 1);
    const texts = new Set(Array.from({ length: 20 }, (_, k) => JSON.stringify(makeOrder(t.kind, k + 1).requirements.map(r => r.text))));
    assert.ok(texts.size >= 5, `${t.kind} has little variety`);
    assert.ok(a.number && a.site && a.summary);
  });
}

test('extra configuration is named and costs a point', () => {
  const order = makeOrder('build-vlans', 7);
  const { world, baseline, sessions } = solve(order);
  const host = order.start;
  execute(sessions[host], 'spanning-tree vlan 1 priority 4096');
  execute(sessions[host], 'interface f0/16');
  execute(sessions[host], 'description spare desk');
  const extras = extrasOf(order, world, baseline);
  assert.deepEqual(extras.map(e => e.text), ['spanning-tree vlan 1 priority 4096'], 'a description is harmless');
  assert.equal(grade(order, world, baseline).pct, Math.round(100 * (order.requirements.length + order.tests.length - 1) / (order.requirements.length + order.tests.length)));
});

test('partial credit: half the requirements, no extras', () => {
  const order = makeOrder('build-ssh', 3);
  const world = buildWorld(order);
  const baseline = baselineOf(world);
  const s = createSession(world, order.start);
  for (const l of ['enable', 'Cl0set!', 'configure terminal', `ip domain name ${order.notes[1].split(', ')[0].replace('Domain ', '')}`, 'ip ssh version 2']) execute(s, l);
  const g = grade(order, world, baseline);
  assert.deepEqual(g.reqs.filter(r => r.ok).map(r => r.id), ['domain', 'v2']);
  assert.equal(g.extras.length, 0);
  assert.ok(g.pct > 0 && g.pct < 100);
});
