import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPSTONES, capstonePassed } from '../../src/solo/capstone/capstones.js';
import { buildWorld, baselineOf, grade } from '../../src/solo/desk/grade.js';
import { createSession, execute } from '../../src/solo/labs/ios.js';

function play(order, lines) {
  const world = buildWorld(order);
  const baseline = baselineOf(world);
  const sessions = Object.fromEntries(order.devices.map(d => [d.id, createSession(world, d.id)]));
  for (const [d, ls] of Object.entries(lines)) for (const l of ls) execute(sessions[d], l);
  return grade(order, world, baseline);
}

for (const c of CAPSTONES) {
  test(`${c.kind}: fails from the start, passes with a working build, every seed`, () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const o = c.make(seed);
      const fresh = play(o, {});
      assert.ok(!capstonePassed(fresh), `${c.kind} seed ${seed} passes untouched`);
      const done = play(o, o.answer);
      assert.deepEqual(done.tests.filter(t => !t.ok).map(t => t.id), [], `${c.kind} seed ${seed}`);
      assert.ok(capstonePassed(done));
      assert.ok(o.goals.length >= 3 && o.tests.length >= 3);
    }
  });
}

test('every domain tree and the IOS trunk has a capstone', () => {
  assert.deepEqual(CAPSTONES.map(c => c.tree).sort(), ['t0', 't1', 't2', 't3', 't4', 't5']);
});
