import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONCEPTS, conceptById, conceptsForRecipes, conceptsForJob, thinConcepts } from '../../src/solo/study/concepts.js';
import { masteryOf, collectionSummary, studyAfterTicket, STATES } from '../../src/solo/study/mastery.js';
import { CCNA_BANK } from '../../src/solo/study/questions.js';
import { RECALL_DECK } from '../../src/solo/study/recall-deck.js';
import { TIERS } from '../../src/solo/drills/subnet.js';
import { JOBS } from '../../src/solo/jobs.js';
import { HINTS } from '../../src/solo/content.js';

const RECIPES = Object.keys(HINTS);
const questionIds = new Set(CCNA_BANK.map(q => q.id));
const cardIds = new Set(RECALL_DECK.map(c => c.id));
const jobIds = new Set(JOBS.map(j => j.id));
const tierIds = new Set(TIERS.map(t => t.id));

test('every link points at something that exists', () => {
  for (const c of CONCEPTS) {
    for (const r of c.recipes) assert.ok(RECIPES.includes(r), `${c.id} links unknown recipe ${r}`);
    for (const j of c.jobs) assert.ok(jobIds.has(j), `${c.id} links unknown job ${j}`);
    for (const q of c.questions) assert.ok(questionIds.has(q), `${c.id} links unknown question ${q}`);
    for (const k of c.cards) assert.ok(cardIds.has(k), `${c.id} links unknown card ${k}`);
    if (c.drill !== null) assert.ok(tierIds.has(c.drill), `${c.id} links unknown drill tier ${c.drill}`);
  }
});

test('every Field fault and every job is taught by at least one concept', () => {
  for (const r of RECIPES) assert.ok(conceptsForRecipes([r]).length > 0, `fault ${r} has no study material`);
  for (const j of jobIds) assert.ok(conceptsForJob(j).length > 0, `job ${j} has no study material`);
});

test('concept ids are unique and lookups work', () => {
  assert.equal(new Set(CONCEPTS.map(c => c.id)).size, CONCEPTS.length);
  assert.equal(conceptById('trunk-allowed').recipes[0], 'V2');
  assert.equal(conceptById('nope'), null);
  assert.deepEqual(conceptsForRecipes(['I1']).map(c => c.id), ['subnet-boundaries']);
  assert.deepEqual(conceptsForRecipes([]), []);
});

test('the subnet fault is linked to the subnet drill', () => {
  assert.equal(conceptsForRecipes(['I1'])[0].drill, 'field');
});

test('no Field fault is backed by thin study material', () => {
  // DNS was the gap: two of the eight faults with one question between them.
  // Every concept now has enough behind it to teach from.
  assert.deepEqual(thinConcepts(3), []);
});

test('thinConcepts still reports a gap when one exists', () => {
  assert.ok(thinConcepts(99).length > 0, 'an impossible bar should flag everything');
});

// ---- mastery ----

const run = (recipes, assisted = false) => ({ mode: 'repair', recipes, assisted });
const stateOf = (rows, id) => rows.find(r => r.id === id).state;

test('a new trainee has seen nothing', () => {
  const rows = masteryOf();
  assert.equal(rows.length, CONCEPTS.length);
  assert.equal(rows.every(r => r.state === 'unseen'), true);
  assert.deepEqual(collectionSummary(rows), { total: CONCEPTS.length, earned: 0, practiced: 0, unseen: CONCEPTS.length });
});

test('drilling alone reaches practiced and never earned', () => {
  const concept = conceptById('trunk-allowed');
  const practice = {
    questions: Object.fromEntries(concept.questions.map(id => [id, { right: 5, seen: 5 }])),
    cards: Object.fromEntries(concept.cards.map(id => [id, { right: 5, seen: 5 }])),
  };
  const rows = masteryOf({ practice });
  assert.equal(stateOf(rows, 'trunk-allowed'), 'practiced', 'every card and question right is still only practiced');
  assert.equal(rows.find(r => r.id === 'trunk-allowed').drilled, concept.questions.length + concept.cards.length);
});

test('a card seen but never answered right does not count as practice', () => {
  const rows = masteryOf({ practice: { cards: { 'cmd-trunk': { right: 0, seen: 4 } } } });
  assert.equal(stateOf(rows, 'trunk-allowed'), 'unseen');
});

test('fixing a fault without help earns the concept', () => {
  const rows = masteryOf({ completedRuns: [run(['V2'])] });
  assert.equal(stateOf(rows, 'trunk-allowed'), 'earned');
  assert.equal(rows.find(r => r.id === 'trunk-allowed').earnedBy, 'ticket');
  assert.equal(stateOf(rows, 'access-vlan'), 'unseen', 'only the concepts the fault touched');
});

test('fixing a fault with help counts as practice, not earned', () => {
  const rows = masteryOf({ completedRuns: [run(['I1'], true)] });
  assert.equal(stateOf(rows, 'subnet-boundaries'), 'practiced');
  assert.equal(rows.find(r => r.id === 'subnet-boundaries').assistedInField, true);
});

test('a later unassisted fix upgrades an assisted one', () => {
  const rows = masteryOf({ completedRuns: [run(['I1'], true), run(['I1'], false)] });
  assert.equal(stateOf(rows, 'subnet-boundaries'), 'earned');
});

test('a passed job earns every concept it exercises', () => {
  const rows = masteryOf({ jobsPassed: ['job-workstation'] });
  for (const id of ['subnet-boundaries', 'default-gateway', 'dns-resolver']) {
    assert.equal(stateOf(rows, id), 'earned', id);
    assert.equal(rows.find(r => r.id === id).earnedBy, 'job');
  }
});

test('configure runs and multi-fault tickets are handled', () => {
  const rows = masteryOf({ completedRuns: [{ mode: 'configure', recipes: [] }, run(['V2', 'I2'])] });
  assert.equal(stateOf(rows, 'trunk-allowed'), 'earned');
  assert.equal(stateOf(rows, 'default-gateway'), 'earned', 'both faults in a combined ticket count');
  assert.equal(collectionSummary(rows).earned, 2);
});

test('every row reports a known state', () => {
  const rows = masteryOf({ completedRuns: [run(['P1']), run(['D1'], true)], practice: { cards: { 'port-dns': { right: 1 } } } });
  assert.equal(rows.every(r => STATES.includes(r.state)), true);
});

// ---- after a ticket ----

test('a clean fix needs no follow-up study', () => {
  const plan = studyAfterTicket({ recipes: ['V2'], assisted: false, solved: true });
  assert.equal(plan.needed, false);
  assert.deepEqual(plan.concepts, ['trunk-allowed']);
});

test('an assisted or failed ticket points at the matching material', () => {
  for (const outcome of [{ assisted: true, solved: true }, { assisted: false, solved: false }]) {
    const plan = studyAfterTicket({ recipes: ['I1'], ...outcome });
    assert.equal(plan.needed, true);
    assert.equal(plan.drill, 'field', 'a subnet fault sends you to the subnet drill');
    assert.ok(plan.questions.includes('nf-006'));
    assert.ok(plan.questions.every(id => questionIds.has(id)));
  }
});

test('a combined ticket merges the material without duplicates', () => {
  const plan = studyAfterTicket({ recipes: ['V1', 'V2'], assisted: true });
  assert.deepEqual(plan.concepts.sort(), ['access-vlan', 'trunk-allowed']);
  assert.equal(new Set(plan.questions).size, plan.questions.length, 'na-005 is linked twice and appears once');
  assert.ok(plan.questions.includes('na-005'));
});
