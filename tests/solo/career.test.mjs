import { test } from 'node:test';
import assert from 'node:assert/strict';
import { careerProgress, assignmentById, RANKS } from '../../src/solo/career.js';

function profileWith(runs) {
  return { completedRuns: runs };
}

test('a brand-new profile has one recommended ticket and nothing locked', () => {
  const p = careerProgress(profileWith([]));
  assert.equal(p.completedCount, 0);
  assert.equal(p.activeAssignment.id, 'j-port');
  assert.equal(p.currentRankId, 'junior');
  const statuses = p.ranks.flatMap((r) => r.items.map((a) => a.status));
  assert.equal(statuses.filter((s) => s === 'active').length, 1);
  assert.equal(statuses.filter((s) => s === 'done').length, 0);
  assert.equal(statuses.filter((s) => s === 'locked').length, 0);
  assert.ok(statuses.filter((s) => s === 'ahead').length > 1);
});

test('every rank is open from the start, including the last one', () => {
  const p = careerProgress(profileWith([]));
  assert.ok(p.ranks.every((r) => r.unlocked), 'a rank was closed');
  assert.equal(p.ranks.filter((r) => r.started).length, 1, 'only the first rank should read as started');
});

test('an assignment taken out of order still counts as done', () => {
  const p = careerProgress(profileWith([{ mode: 'repair', family: 'D', tier: 1, recipes: ['D1'] }]));
  const junior = p.ranks.find((r) => r.id === 'junior');
  assert.equal(junior.items.find((a) => a.id === 'j-dns').status, 'done');
  assert.equal(p.activeAssignment.id, 'j-port', 'the recommendation stays on the first unfinished ticket');
  assert.equal(p.completedCount, 1);
});

test('completing a matching repair run advances to the next assignment', () => {
  const p = careerProgress(profileWith([{ mode: 'repair', family: 'P', tier: 1, recipes: ['P1'] }]));
  const junior = p.ranks.find((r) => r.id === 'junior');
  assert.equal(junior.items[0].status, 'done');
  assert.equal(junior.items[1].status, 'active');
  assert.equal(p.activeAssignment.id, 'j-ip');
  assert.equal(p.completedCount, 1);
});

test('a higher-tier completion also satisfies a lower-tier assignment of the same family', () => {
  const p = careerProgress(profileWith([{ mode: 'repair', family: 'I', tier: 3, recipes: ['I2'] }]));
  const juniorIp = p.ranks[0].items.find((a) => a.id === 'j-ip');
  assert.equal(juniorIp.status, 'done');
});

test('mixed assignments require a mixed run, not a single-family one', () => {
  const single = careerProgress(profileWith([{ mode: 'repair', family: 'P', tier: 2, recipes: ['P1'] }]));
  const mixed = single.ranks.find((r) => r.id === 'tech').items.find((a) => a.family === 'M');
  assert.notEqual(mixed.status, 'done');

  const withMixed = careerProgress(profileWith([{ mode: 'repair', family: 'M', tier: 2, recipes: ['P1', 'D1'] }]));
  const mixedDone = withMixed.ranks.find((r) => r.id === 'tech').items.find((a) => a.family === 'M');
  assert.equal(mixedDone.status, 'done');
});

test('assignmentById finds any assignment and every start maps to a known kind', () => {
  assert.equal(assignmentById('j-dns').family, 'D');
  assert.equal(assignmentById('nope'), null);
  for (const rank of RANKS) {
    for (const a of rank.assignments) {
      assert.ok(['code', 'family', 'design'].includes(a.start.kind), `${a.id} start kind`);
    }
  }
});
