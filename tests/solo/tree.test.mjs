import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCNA_MAP, ALL_BRANCHES, branchById, TIERS } from '../../src/solo/tree/ccna.js';
import {
  emptyRecord, questionPools, tierState, mapProgress, readiness, branchStatus,
  knowCheckDeck, treeExamDeck, finalDeck, recordKnowCheck, recordTreeExam, recordFinal,
  newlyLit, markSeen, KNOW_MIN_QUESTIONS, FADE_START_DAYS, FADE_END_DAYS,
} from '../../src/solo/tree/progress.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-05T12:00:00Z');
const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('seven trees, the six blueprint domains carry Cisco\'s weights', () => {
  assert.equal(CCNA_MAP.trees.length, 7);
  const weights = CCNA_MAP.trees.filter(t => t.domain).map(t => t.weight);
  assert.equal(weights.reduce((a, b) => a + b, 0), 100);
  assert.equal(CCNA_MAP.trees.find(t => t.domain === 'IPC').weight, 25);
});

test('branch ids are unique, tiers are valid, and every prerequisite exists', () => {
  const ids = ALL_BRANCHES.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const b of ALL_BRANCHES) {
    assert.ok(b.tiers.length && b.tiers.every(t => TIERS.includes(t)), b.id);
    assert.ok(b.tiers.includes('know'), `${b.id} has no know tier`);
    for (const need of b.needs) assert.ok(branchById(need), `${b.id} needs missing ${need}`);
    if (b.recipes) assert.ok(b.tiers.includes('fix'), `${b.id} has tickets but no fix tier`);
  }
});

test('every branch has enough questions for a know check', () => {
  const pools = questionPools();
  const thin = ALL_BRANCHES.filter(b => pools[b.id].length < KNOW_MIN_QUESTIONS).map(b => `${b.id}:${pools[b.id].length}`);
  assert.deepEqual(thin, []);
});

test('all eight ticket faults light a fix tier somewhere on the map', () => {
  const lit = new Set(ALL_BRANCHES.flatMap(b => b.recipes ?? []));
  for (const r of ['P1', 'P2', 'I1', 'I2', 'V1', 'V2', 'D1', 'D2']) assert.ok(lit.has(r), r);
});

test('a know check of 4 of 5 lights the tier; 2 or 3 is practice; less does nothing', () => {
  let rec = emptyRecord();
  rec = recordKnowCheck(rec, 't1-ipv4', { right: 1, total: 5 }, NOW);
  assert.equal(rec.know['t1-ipv4'], undefined);
  rec = recordKnowCheck(rec, 't1-ipv4', { right: 3, total: 5 }, NOW);
  assert.equal(rec.know['t1-ipv4'].state, 'practiced');
  rec = recordKnowCheck(rec, 't1-ipv4', { right: 4, total: 5 }, NOW);
  assert.equal(rec.know['t1-ipv4'].state, 'mastered');
  rec = recordKnowCheck(rec, 't1-ipv4', { right: 2, total: 5 }, NOW + DAY);
  assert.equal(rec.know['t1-ipv4'].state, 'mastered', 'a worse result never dims a fresh light');
});

test('lights fade after two weeks and go dark after six', () => {
  const branch = branchById('t1-ipv4');
  const rec = recordKnowCheck(emptyRecord(), 't1-ipv4', { right: 5, total: 5 }, NOW);
  const at = (days) => tierState(branch, 'know', { record: rec, now: NOW + days * DAY });
  assert.equal(at(FADE_START_DAYS).fresh, 1);
  const mid = at((FADE_START_DAYS + FADE_END_DAYS) / 2);
  assert.equal(mid.state, 'mastered');
  assert.ok(mid.fresh > 0 && mid.fresh < 1);
  assert.equal(at(FADE_END_DAYS + 1).state, 'faded');
});

test('fix lights come from tickets: clean is mastered, with help is practiced', () => {
  const branch = branchById('t2-vlans');
  const helped = [{ mode: 'repair', recipes: ['V1'], assisted: true, completedAt: new Date(NOW).toISOString() }];
  assert.equal(tierState(branch, 'fix', { completedRuns: helped, now: NOW }).state, 'practiced');
  const clean = [...helped, { mode: 'repair', recipes: ['V1'], assisted: false, completedAt: new Date(NOW).toISOString() }];
  assert.equal(tierState(branch, 'fix', { completedRuns: clean, now: NOW }).state, 'mastered');
  assert.equal(tierState(branchById('t3-ospf'), 'fix', { now: NOW }).state, 'soon', 'no OSPF tickets yet');
  assert.equal(tierState(branchById('t6-ai'), 'fix', { now: NOW }).state, 'none');
});

test('prerequisites mark a branch hard, never locked', () => {
  const ctx = { record: emptyRecord(), now: NOW };
  const p = mapProgress(ctx);
  const ospf = p.trees.find(t => t.id === 't3').branches.find(b => b.id === 't3-ospf');
  assert.equal(ospf.readiness, 'hard');
  assert.equal(knowCheckDeck('t3-ospf', seeded()).length, 5, 'a hard branch can still be checked');
  const ipv4 = p.trees.find(t => t.id === 't1').branches.find(b => b.id === 't1-ipv4');
  assert.equal(ipv4.readiness, 'ready');
});

test('a tree exam covers every branch with questions and a pass credits what it covered', () => {
  const deck = treeExamDeck('t2', seeded(3));
  assert.equal(deck.length, 20);
  const pools = questionPools();
  const covered = new Set(deck.map(q => Object.keys(pools).find(id => pools[id].includes(q.id))));
  for (const b of CCNA_MAP.trees.find(t => t.id === 't2').branches) assert.ok(covered.has(b.id), b.id);
  let rec = recordTreeExam(emptyRecord(), 't2', deck, { right: 16, total: 20 }, NOW);
  assert.equal(rec.exams.t2.passed, false, '80% is under the 85% mark');
  assert.deepEqual(rec.know, {});
  rec = recordTreeExam(rec, 't2', deck, { right: 18, total: 20 }, NOW);
  assert.equal(rec.exams.t2.passed, true);
  assert.equal(rec.know['t2-vlans'].source, 'exam');
  rec = recordTreeExam(rec, 't2', deck, { right: 5, total: 20 }, NOW);
  assert.equal(rec.exams.t2.passed, true, 'a later fail keeps the earlier pass');
});

test('the final is 50 questions weighted like the real exam', () => {
  const deck = finalDeck(seeded(11));
  assert.equal(deck.length, 50);
  assert.equal(deck.filter(q => q.domain === 'IPC').length, 13);
  const rec = recordFinal(emptyRecord(), deck, { right: 44, total: 50 }, NOW);
  assert.equal(rec.final.passed, true);
});

test('new lights are reported once, then remembered', () => {
  let rec = recordKnowCheck(emptyRecord(), 't0-nav', { right: 5, total: 5 }, NOW);
  const p = mapProgress({ record: rec, now: NOW });
  const fresh = newlyLit(p, rec);
  assert.deepEqual(fresh, ['t0-nav:know']);
  rec = markSeen(rec, fresh);
  assert.deepEqual(newlyLit(mapProgress({ record: rec, now: NOW }), rec), []);
});

test('a branch is complete only when every tier the app can test is mastered', () => {
  const ctx = { record: recordKnowCheck(emptyRecord(), 't2-vlans', { right: 5, total: 5 }, NOW), now: NOW };
  assert.equal(branchStatus(branchById('t2-vlans'), ctx).complete, false, 'its fix tier is still off');
  const runs = [{ mode: 'repair', recipes: ['V1'], assisted: false, completedAt: new Date(NOW).toISOString() }];
  assert.equal(branchStatus(branchById('t2-vlans'), { ...ctx, completedRuns: runs }).complete, true);
  assert.equal(readiness(branchById('t2-vlans'), { 't2-vlans': branchStatus(branchById('t2-vlans'), { ...ctx, completedRuns: runs }) }), 'done');
});
