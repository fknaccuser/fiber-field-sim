import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOXES, TOP_BOX, freshCard, review, dueCards, nextDue, summarise,
  normaliseTyped, checkTyped,
} from '../../src/solo/study/recall.js';
import { RECALL_DECK } from '../../src/solo/study/recall-deck.js';
import { DOMAIN_IDS } from '../../src/solo/study/bank.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 21, 12);

test('a right answer climbs one box and waits longer', () => {
  let card = freshCard();
  const boxes = [];
  let now = T0;
  for (let i = 0; i < 6; i += 1) {
    card = review(card, true, now);
    boxes.push(card.box);
    now = card.due;
  }
  assert.deepEqual(boxes, [2, 3, 4, 5, 5, 5], 'climbs and then holds at the top box');
  assert.equal(card.box, TOP_BOX);
});

test('a miss drops the card straight back to the first box, due now', () => {
  let card = { box: 4, due: T0, seen: 9, right: 8 };
  card = review(card, false, T0);
  assert.equal(card.box, 1);
  assert.equal(card.due, T0, 'box 1 is due again in the same session');
  assert.equal(card.seen, 10);
  assert.equal(card.right, 8);
});

test('the waits grow at every box', () => {
  const waits = BOXES.map(b => b.wait);
  for (let i = 1; i < waits.length; i += 1) assert.ok(waits[i] > waits[i - 1], `box ${i + 1} does not wait longer`);
  assert.equal(review(freshCard(), true, T0).due, T0 + DAY, 'box 2 comes back the next day');
});

test('due cards put overdue reviews ahead of new ones', () => {
  const schedule = {
    old: { box: 2, due: T0 - 5 * DAY, seen: 1, right: 1 },
    recent: { box: 2, due: T0 - DAY, seen: 1, right: 1 },
    later: { box: 3, due: T0 + DAY, seen: 2, right: 2 },
  };
  assert.deepEqual(dueCards(['new1', 'recent', 'later', 'old', 'new2'], schedule, T0), ['old', 'recent', 'new1', 'new2']);
  assert.equal(nextDue(['later', 'old'], schedule, T0), T0 + DAY);
  assert.equal(nextDue(['old'], schedule, T0), null, 'nothing scheduled ahead');
});

test('summarise counts each box and the never-seen cards', () => {
  const schedule = { a: { box: 5, due: 0, seen: 5, right: 5 }, b: { box: 1, due: 0, seen: 1, right: 0 } };
  const s = summarise(['a', 'b', 'c'], schedule);
  assert.equal(s.fresh, 1);
  assert.equal(s.mastered, 1);
  assert.equal(s.boxes[1], 1);
});

test('typed answers forgive case, spacing and trailing punctuation only', () => {
  const card = { answer: 'show ip route', accept: ['sh ip route'] };
  for (const typed of ['show ip route', 'SHOW IP ROUTE', '  show   ip  route ', 'show ip route.', 'sh ip route']) {
    assert.equal(checkTyped(card, typed).correct, true, `"${typed}" should pass`);
  }
  for (const typed of ['show ip rout', 'show route', 'show ip ospf', 'ip route show']) {
    assert.equal(checkTyped(card, typed).correct, false, `"${typed}" should fail`);
  }
  assert.deepEqual(checkTyped(card, '   '), { correct: false, empty: true });
  assert.equal(normaliseTyped('"YAML"'), 'yaml');
});

test('every deck card is well formed and passes its own answer', () => {
  const ids = new Set();
  for (const card of RECALL_DECK) {
    assert.ok(card.id && !ids.has(card.id), `duplicate or missing id ${card.id}`);
    ids.add(card.id);
    assert.ok(DOMAIN_IDS.includes(card.domain), `${card.id} has domain ${card.domain}`);
    assert.ok(['command', 'fact'].includes(card.kind), `${card.id} has kind ${card.kind}`);
    assert.ok(card.prompt && card.answer && card.note, `${card.id} is missing a field`);
    assert.ok(card.note.length >= 30, `${card.id} note is too thin to teach anything`);
    assert.equal(checkTyped(card, card.answer).correct, true, `${card.id} rejects its own answer`);
    for (const alt of card.accept ?? []) assert.equal(checkTyped(card, alt).correct, true, `${card.id} rejects "${alt}"`);
  }
});

test('no two cards accept the same typed answer for different prompts', () => {
  // Otherwise a trainee could be marked right on one card by knowing another.
  const owner = new Map();
  for (const card of RECALL_DECK) {
    for (const form of [card.answer, ...(card.accept ?? [])].map(normaliseTyped)) {
      if (owner.has(form) && owner.get(form) !== card.id) {
        const other = RECALL_DECK.find(c => c.id === owner.get(form));
        // Numbers legitimately repeat across unrelated facts, so only
        // commands have to be unique.
        if (card.kind === 'command' && other.kind === 'command') {
          assert.fail(`"${form}" is accepted by both ${owner.get(form)} and ${card.id}`);
        }
      }
      owner.set(form, card.id);
    }
  }
});

test('the deck leans on commands and covers every domain', () => {
  const commands = RECALL_DECK.filter(c => c.kind === 'command').length;
  assert.ok(commands >= 25, `only ${commands} commands`);
  for (const domain of ['NF', 'NA', 'IPC', 'IPS', 'SECF']) {
    assert.ok(RECALL_DECK.some(c => c.domain === domain), `no cards for ${domain}`);
  }
});
