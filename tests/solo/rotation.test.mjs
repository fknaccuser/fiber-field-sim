import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotate, MISS_AGAIN_MS, RIGHT_REST_MS } from '../../src/solo/study/rotation.js';
import { TEMPLATES, instantiate, freshen, GENERATED_BANK } from '../../src/solo/study/gen/index.js';
import { problems } from '../../src/solo/study/bank.js';

const pool = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}` }));
const now = Date.parse('2026-10-13T12:00:00Z');
const seeded = (s = 7) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

test('unseen questions come before ones already answered', () => {
  const history = Object.fromEntries(pool.slice(0, 20).map(q => [q.id, { right: 1, seen: 1, last: { ok: true, at: now - 1000 } }]));
  const deck = rotate(pool, history, { now, count: 10, rnd: seeded() });
  assert.deepEqual(new Set(deck.map(q => q.id)), new Set(pool.slice(20).map(q => q.id)));
});

test('misses come back once due, ahead of new material, and not before', () => {
  const history = {
    q0: { right: 0, seen: 1, last: { ok: false, at: now - MISS_AGAIN_MS - 1 } },
    q1: { right: 0, seen: 1, last: { ok: false, at: now - 1000 } },
  };
  const deck = rotate(pool, history, { now, count: 5, rnd: seeded() });
  assert.equal(deck[0].id, 'q0');
  assert.ok(!deck.some(q => q.id === 'q1'), 'a fresh miss rests first');
});

test('correct answers rest, then come back oldest first', () => {
  const history = Object.fromEntries(pool.map((q, i) => [q.id, { right: 1, seen: 1, last: { ok: true, at: now - (i < 3 ? RIGHT_REST_MS + 1 : 1000 * i) } }]));
  const deck = rotate(pool, history, { now, count: 5, rnd: seeded() });
  assert.deepEqual(new Set(deck.slice(0, 3).map(q => q.id)), new Set(['q0', 'q1', 'q2']));
});

test('every template builds valid, varied questions across 300 seeds', () => {
  for (const t of TEMPLATES) {
    const exhibits = new Set();
    for (let s = 1; s <= 300; s += 1) {
      const q = instantiate(t, s);
      assert.deepEqual(problems([q]), [], `${t.id} seed ${s}`);
      const texts = q.choices.map(c => c.text);
      assert.equal(new Set(texts).size, texts.length, `${t.id} seed ${s} repeats a choice`);
      assert.ok(texts.length >= 3, `${t.id} seed ${s}`);
      assert.ok(texts.every(x => typeof x === 'string' && !/undefined|NaN/.test(x)), `${t.id} seed ${s}: ${texts}`);
      exhibits.add(q.exhibit.text);
    }
    assert.ok(exhibits.size > 250, `${t.id} only made ${exhibits.size} different exhibits`);
  }
});

test('the same seed rebuilds the same question, and freshen gives new numbers', () => {
  const t = TEMPLATES[0];
  assert.deepEqual(instantiate(t, 42), instantiate(t, 42));
  const stand = GENERATED_BANK.find(q => q.gen === t.id);
  const a = freshen(stand, 1001), b = freshen(stand, 2002);
  assert.notEqual(a.exhibit.text, b.exhibit.text);
  assert.equal(a.id, t.id, 'history follows the template, not the numbers');
  const plain = { id: 'x', prompt: 'p' };
  assert.equal(freshen(plain), plain);
});
