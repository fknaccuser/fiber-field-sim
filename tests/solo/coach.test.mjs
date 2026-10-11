import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LABS, startLab, goalStates } from '../../src/solo/labs/catalog.js';
import { execute } from '../../src/solo/labs/ios.js';
import { guidedGoals, alreadyThere, tilesFor, commandOf, bankFor, judge, teachFor, suggestedStage } from '../../src/solo/labs/coach.js';

// Play a lab the way guided mode does: every step's tiles, in order, on the
// router the step names; choice goals answered with their right option.
function playGuided(lab) {
  const run = startLab(lab);
  for (const goal of guidedGoals(lab)) {
    const g = goal.guide;
    assert.ok(g, `${lab.id}/${goal.id} has no guided material`);
    assert.ok(g.think, `${lab.id}/${goal.id} has no think question`);
    assert.equal(g.think.choices.filter(c => c.ok).length, 1, `${lab.id}/${goal.id} think needs one right answer`);
    for (const step of g.steps ?? []) {
      const s = run.sessions[step.device];
      if (alreadyThere(step, s)) continue;
      execute(s, commandOf(tilesFor(step, s)));
    }
    if (goal.ask) {
      assert.ok(g.choices?.length >= 3, `${lab.id}/${goal.id} needs answer choices`);
      // Find the choice the goal accepts; exactly one should.
      const accepted = g.choices.filter(c => { run.answers[goal.id] = c; run.latched?.delete(goal.id); return goalStates(run).find(x => x.id === goal.id).done; });
      assert.equal(accepted.length, 1, `${lab.id}/${goal.id}: ${accepted.length} choices accepted`);
      run.answers[goal.id] = accepted[0];
    }
    const states = goalStates(run);
    assert.equal(states.find(x => x.id === goal.id).done, true, `${lab.id}/${goal.id} not done after its guided steps`);
  }
  return run;
}

for (const lab of LABS) {
  test(`${lab.id}: the guided steps complete every goal in order`, () => {
    const run = playGuided(lab);
    assert.deepEqual(goalStates(run).filter(g => !g.done).map(g => g.id), []);
    const teach = teachFor(lab);
    assert.ok(teach && teach.choices.filter(c => c.ok).length === 1, `${lab.id} needs a teach-back with one right answer`);
  });
}

test('every trap tile is rejected with a reason, and order matters', () => {
  const lab = LABS.find(l => l.id === 'static-basic');
  const run = startLab(lab);
  const s = run.sessions.R1;
  execute(s, 'enable'); execute(s, 'configure terminal');
  const step = guidedGoals(lab).find(g => g.id === 'r1').guide.steps[2];
  const bank = bankFor(step, s, 'k');
  const trap = bank.find(t => t.why);
  assert.equal(judge(trap, step, s, []).ok, false);
  assert.ok(judge(trap, step, s, []).why.length > 10);
  const mask = bank.find(t => t.text === '255.255.255.0');
  assert.match(judge(mask, step, s, []).why, /wrong place/);
  const first = bank.find(t => t.need === 0);
  assert.equal(judge(first, step, s, []).ok, true);
});

test('EXEC commands from configuration mode need do, and mode steps already met are skipped', () => {
  const lab = LABS.find(l => l.id === 'static-basic');
  const run = startLab(lab);
  const s = run.sessions.R1;
  const show = { device: 'R1', tiles: ['show', 'ip route'], traps: [] };
  assert.deepEqual(tilesFor(show, s), ['show', 'ip route']);
  execute(s, 'enable'); execute(s, 'conf t');
  assert.deepEqual(tilesFor(show, s), ['do', 'show', 'ip route']);
  assert.equal(alreadyThere({ tiles: ['enable'] }, s), true);
  assert.equal(alreadyThere({ tiles: ['configure terminal'] }, s), true);
  assert.equal(alreadyThere({ tiles: ['interface', 'g0/0'] }, s), false);
  execute(s, 'interface g0/0');
  assert.equal(alreadyThere({ tiles: ['interface', 'g0/0'] }, s), true);
});

test('stages step up: guided, then assisted, then typed after a clean assisted run', () => {
  assert.equal(suggestedStage(null), 'guided');
  assert.equal(suggestedStage({ stages: { guided: { clean: false } } }), 'assisted');
  assert.equal(suggestedStage({ stages: { guided: {}, assisted: { clean: false } } }), 'assisted');
  assert.equal(suggestedStage({ stages: { guided: {}, assisted: { clean: true } } }), 'typed');
});
