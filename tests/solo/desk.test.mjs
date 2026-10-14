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
  test(`${t.kind}: lights branches with the right tier, and seeds differ`, () => {
    const tier = t.kind.startsWith('repair') ? 'fix' : 'do';
    for (const b of t.lights) assert.ok(branchById(b)?.tiers.includes(tier), `${b} has no ${tier} tier`);
    const a = makeOrder(t.kind, 1);
    const texts = new Set(Array.from({ length: 20 }, (_, k) => { const o = makeOrder(t.kind, k + 1); return JSON.stringify([o.requirements.map(r => r.text), o.notes]); }));
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

test('every repair fault starts broken somewhere else tests can see, and its own fix restores it all', async () => {
  const { REPAIR_TEMPLATES } = await import('../../src/solo/desk/jobs-repair.js');
  for (const t of REPAIR_TEMPLATES) {
    for (const f of t.faults) {
      for (const seed of [11, 12, 13, 14]) {
        const order = makeOrder(t.kind, seed, { fault: f.id });
        assert.equal(order.fault, f.id);
        const fresh = buildWorld(order);
        const before = grade(order, fresh, baselineOf(fresh));
        assert.ok(!before.reqs[0].ok, `${f.id} seed ${seed} starts fixed`);
        assert.ok(before.tests.some(x => !x.ok) || f.id === 'ec-mode', `${f.id} seed ${seed}: no acceptance test notices the fault`);
        const { world, baseline } = solve(order);
        const g = grade(order, world, baseline);
        assert.equal(g.pct, 100, `${f.id} seed ${seed}: ${JSON.stringify({ r: g.reqs.filter(r => !r.ok).map(r => r.id), t: g.tests.filter(x => !x.ok).map(x => x.id), e: g.extras.map(e => e.text) })}`);
      }
    }
  }
});

test('a repair ticket can be asked for by branch', async () => {
  const { repairFor } = await import('../../src/solo/desk/jobs-repair.js');
  for (const b of ['t2-vlans', 't2-trunks', 't4-nat', 't5-acl', 't2-etherchannel', 't2-stp', 't1-client', 't3-static', 't4-dhcp-dns', 't0-remote', 't5-l2sec', 't1-ipv6']) {
    const r = repairFor(b, 5);
    assert.ok(r, b);
    assert.ok(makeOrder(r.kind, r.seed, { fault: r.fault }).lights.includes(b), b);
  }
});
