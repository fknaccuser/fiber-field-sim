import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LABS, startLab, goalStates, labsForBranch } from '../../src/solo/labs/catalog.js';
import { execute, prompt, complete } from '../../src/solo/labs/ios.js';
import { routingTable, neighbors } from '../../src/solo/labs/world.js';
import { branchById } from '../../src/solo/tree/ccna.js';

const ANSWERS = {
  'route-reading': { exit: 'Gi0/0', admet: '110/3', gw: '203.0.113.1', nbr: '2.2.2.2' },
  'ospf-dr': { who: '3.3.3.3' },
};

// Play a lab the way the "show me" help would: each goal's commands in order.
function solve(lab) {
  const run = startLab(lab);
  for (const goal of lab.goals) {
    if (goal.ask) { run.answers[goal.id] = ANSWERS[lab.id][goal.id]; continue; }
    for (const [device, lines] of Object.entries(goal.show)) {
      const s = run.sessions[device];
      for (const line of lines) {
        // Commands shown with "do" assume configuration mode; get there first.
        if (/^do /.test(line) && !/config/.test(prompt(s))) { execute(s, 'enable'); execute(s, 'configure terminal'); }
        if (/^(interface|router|line|ip route|ip ospf)/.test(line) && !/config/.test(prompt(s))) { execute(s, 'enable'); execute(s, 'configure terminal'); }
        execute(s, line);
      }
    }
    goalStates(run);
  }
  return run;
}

for (const lab of LABS) {
  test(`${lab.id}: the shown commands complete every goal`, () => {
    const run = solve(lab);
    const states = goalStates(run);
    assert.deepEqual(states.filter(g => !g.done).map(g => g.id), [], lab.id);
  });
  test(`${lab.id}: starts with no goal done and lights real branches`, () => {
    const run = startLab(lab);
    const states = goalStates(run);
    assert.equal(states.filter(g => g.done).length, 0, `${lab.id} starts partly done`);
    for (const b of lab.lights) assert.ok(branchById(b)?.tiers.includes('do'), `${lab.id} lights ${b}, which has no Do tier`);
  });
}

test('every Do tier on the map that labs cover has at least one lab', () => {
  for (const id of ['t0-nav', 't0-base', 't0-save', 't0-remote', 't0-inspect', 't3-table', 't3-static', 't3-ospf']) {
    assert.ok(labsForBranch(id).length > 0, id);
  }
});

test('abbreviations, errors and help behave like IOS', () => {
  const run = startLab(LABS.find(l => l.id === 'static-basic'));
  const s = run.sessions.R1;
  assert.equal(prompt(s), 'R1>');
  execute(s, 'en');
  assert.equal(prompt(s), 'R1#');
  assert.match(execute(s, 'sh ip ro'), /Gateway of last resort is not set/);
  assert.match(execute(s, 'conf'), /^$/);
  assert.match(prompt(s), /terminal, memory, or network/);
  assert.match(execute(s, ''), /Enter configuration commands/);
  assert.equal(prompt(s), 'R1(config)#');
  assert.match(execute(s, 'ip route 192.168.3.1 255.255.255.0 10.0.12.2'), /Inconsistent address and mask/);
  assert.match(execute(s, 'bogus'), /Invalid input detected/);
  assert.match(execute(s, 'ip'), /Incomplete command/);
  assert.match(execute(s, 'ip ?'), /route/);
  assert.equal(complete(s, 'ip ro'), 'ip route ');
  execute(s, 'interface g0/0');
  assert.equal(prompt(s), 'R1(config-if)#');
  execute(s, 'router ospf 1');
  assert.equal(prompt(s), 'R1(config-router)#', 'a global command from a sub-mode moves to its mode');
  execute(s, 'end');
  assert.equal(prompt(s), 'R1#');
});

test('a floating static only appears when the primary path is gone', () => {
  const lab = LABS.find(l => l.id === 'static-floating');
  const run = startLab(lab);
  const s = run.sessions.R1;
  for (const l of ['en', 'conf t', 'ip route 192.168.3.0 255.255.255.0 10.0.13.3 200']) execute(s, l);
  const via = () => routingTable(run.world, 'R1').find(r => r.len === 24 && r.net === ((192 << 24) + (168 << 16) + (3 << 8)) >>> 0)?.hops[0].nh;
  assert.equal(via(), ((10 << 24) + (12 << 8) + 2) >>> 0);
  execute(s, 'int g0/0'); execute(s, 'shutdown');
  assert.equal(via(), ((10 << 24) + (13 << 8) + 3) >>> 0);
});

test('the DR election is not preemptive until the DR is cleared', () => {
  const run = startLab(LABS.find(l => l.id === 'ospf-dr'));
  assert.equal(run.world.elections.core.dr, 'R3');
  const r1 = run.sessions.R1;
  for (const l of ['en', 'conf t', 'int g0/0', 'ip ospf priority 255']) execute(r1, l);
  assert.equal(run.world.elections.core.dr, 'R3', 'a higher priority alone changes nothing');
  const r2 = run.sessions.R2;
  execute(r2, 'en');
  execute(r2, 'clear ip ospf process');
  execute(r2, 'yes');
  assert.equal(run.world.elections.core.dr, 'R3', 'clearing a DROTHER... or the BDR leaves the DR in place');
  const r3 = run.sessions.R3;
  for (const l of ['en', 'conf t', 'int g0/0', 'ip ospf priority 0']) execute(r3, l);
  assert.notEqual(run.world.elections.core.dr, 'R3');
  const states = neighbors(run.world, 'R1').map(n => `${n.state}/${n.role}`).sort();
  assert.ok(states.length === 2);
});
