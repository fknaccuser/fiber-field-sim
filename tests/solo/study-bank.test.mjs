import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOMAINS, DOMAIN_IDS, domainById, V2_TAGS, FORMATS,
  inBlueprint, filter, sampleExam, coverage, presentation, quotas,
  isCorrect, expectedSelections, problems,
} from '../../src/solo/study/bank.js';
import { CCNA_BANK } from '../../src/solo/study/questions.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

test('the domain weights are Cisco\'s and add to 100', () => {
  assert.equal(DOMAINS.reduce((a, d) => a + d.weight, 0), 100);
  assert.equal(domainById('IPC').weight, 25);
  assert.equal(domainById('AUTO').weight, 10);
  assert.equal(domainById('nope'), null);
});

test('the shipped bank has no structural problems', () => {
  const found = problems(CCNA_BANK);
  assert.deepEqual(found, [], found.join('\n'));
});

test('problems() actually catches bad content', () => {
  const bad = [
    { id: 'x1', domain: 'ZZZ', v2: 'same', format: 'single', prompt: 'p', explain: 'e'.repeat(130), choices: [{ text: 'a', correct: true, why: 'w' }, { text: 'b', why: 'w' }] },
    { id: 'x1', domain: 'NF', v2: 'nope', format: 'single', prompt: 'q', explain: 'short', choices: [{ text: 'a', correct: true, why: 'w' }, { text: 'b', correct: true, why: 'w' }] },
    { id: 'x3', domain: 'NF', v2: 'same', format: 'match', prompt: 'm', explain: 'e'.repeat(130), pairs: [{ left: 'a', right: 'same' }, { left: 'b', right: 'same' }, { left: 'c', right: 'x' }] },
  ];
  const found = problems(bad).join(' | ');
  assert.match(found, /unknown domain ZZZ/);
  assert.match(found, /duplicate id/);
  assert.match(found, /v2 tag is nope/);
  assert.match(found, /only \d+ characters/);
  assert.match(found, /2 correct answers on a single-answer question/);
  assert.match(found, /share a right-hand answer/);
});

test('every question carries a valid domain, tag and format', () => {
  for (const q of CCNA_BANK) {
    assert.ok(DOMAIN_IDS.includes(q.domain), q.id);
    assert.ok(V2_TAGS.includes(q.v2), q.id);
    assert.ok(FORMATS.includes(q.format), q.id);
  }
});

test('blueprint filtering hides the right questions in each direction', () => {
  const v2only = { id: 'a', v2: 'v2only' };
  const dropped = { id: 'b', v2: 'dropped' };
  const same = { id: 'c', v2: 'same' };
  assert.equal(inBlueprint(v2only, 'v1'), false, 'v2-only content is off today\'s exam');
  assert.equal(inBlueprint(dropped, 'v1'), true);
  assert.equal(inBlueprint(dropped, 'v2'), false, 'dropped content is gone in v2.0');
  assert.equal(inBlueprint(v2only, 'v2'), true);
  assert.equal(inBlueprint(v2only, 'both'), true);
  assert.equal(inBlueprint(dropped, 'both'), true);
  assert.equal(inBlueprint(same, 'v1') && inBlueprint(same, 'v2'), true);

  const v1 = filter(CCNA_BANK, { blueprint: 'v1' });
  const both = filter(CCNA_BANK, { blueprint: 'both' });
  assert.ok(v1.length < both.length, 'the bank has v2-only content to hide');
  assert.equal(v1.some(q => q.v2 === 'v2only'), false);
});

test('filtering by domain and format returns only what was asked for', () => {
  const ipc = filter(CCNA_BANK, { domains: ['IPC'] });
  assert.ok(ipc.length > 0);
  assert.equal(ipc.every(q => q.domain === 'IPC'), true);
  const matching = filter(CCNA_BANK, { formats: ['match', 'order'] });
  assert.ok(matching.length >= 5, 'the bank should carry the richer formats');
  assert.equal(matching.every(q => q.format === 'match' || q.format === 'order'), true);
  assert.deepEqual(filter(CCNA_BANK, { domains: ['NF'], formats: ['order'] }).map(q => q.domain), ['NF']);
});

test('a mock exam is drawn to the domain weights', () => {
  const { questions, shortfalls } = sampleExam(CCNA_BANK, { count: 50, rnd: seeded(2026) });
  assert.deepEqual(shortfalls, [], 'the bank should be able to fill a 50-question mock');
  assert.equal(questions.length, 50);
  const counts = {};
  for (const q of questions) counts[q.domain] = (counts[q.domain] ?? 0) + 1;
  assert.equal(counts.IPC, 13, 'IP Connectivity is the largest share');
  assert.equal(counts.NF, 10);
  assert.equal(counts.AUTO, 5, 'Automation is 10 percent');
  assert.deepEqual(counts, Object.fromEntries(quotas(50).map(q => [q.domain, q.want])));
  assert.equal(new Set(questions.map(q => q.id)).size, 50, 'no question drawn twice');
  assert.equal(questions.every(q => q.v2 !== 'v2only'), true, 'a v1.1 mock excludes v2-only content');
});

test('a thin bank reports its shortfall rather than backfilling', () => {
  const thin = CCNA_BANK.filter(q => q.domain !== 'AUTO').concat(CCNA_BANK.filter(q => q.domain === 'AUTO').slice(0, 2));
  const { shortfalls, questions } = sampleExam(thin, { count: 50, rnd: seeded(5) });
  assert.deepEqual(shortfalls, [{ domain: 'AUTO', want: 5, have: 2 }]);
  assert.equal(questions.filter(q => q.domain === 'AUTO').length, 2);
  assert.equal(questions.length, 47, 'the gap is left visible rather than filled from elsewhere');
});

test('coverage reports the gap per domain', () => {
  const rows = coverage(CCNA_BANK);
  assert.equal(rows.length, 6);
  assert.equal(rows.every(r => r.short === 0), true, JSON.stringify(rows.filter(r => r.short)));
  const thin = coverage(CCNA_BANK.filter(q => q.domain !== 'IPC'));
  assert.equal(thin.find(r => r.domain === 'IPC').short, 13);
});

test('grading handles every format', () => {
  const single = CCNA_BANK.find(q => q.format === 'single');
  const right = single.choices.findIndex(c => c.correct);
  assert.equal(isCorrect(single, right), true);
  assert.equal(isCorrect(single, (right + 1) % single.choices.length), false);
  assert.equal(expectedSelections(single), 1);

  const multi = CCNA_BANK.find(q => q.format === 'multi');
  const all = multi.choices.map((c, i) => (c.correct ? i : null)).filter(i => i !== null);
  assert.equal(isCorrect(multi, all), true);
  assert.equal(isCorrect(multi, [all[0]]), false, 'a partial answer is wrong');
  assert.equal(isCorrect(multi, [...all, multi.choices.findIndex(c => !c.correct)]), false, 'an extra pick is wrong');
  assert.equal(expectedSelections(multi), all.length);

  const order = CCNA_BANK.find(q => q.format === 'order');
  assert.equal(isCorrect(order, order.steps.map((_, i) => i)), true);
  const swapped = order.steps.map((_, i) => i);
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.equal(isCorrect(order, swapped), false);

  const match = CCNA_BANK.find(q => q.format === 'match');
  assert.equal(isCorrect(match, match.pairs.map((_, i) => i)), true);
  assert.equal(isCorrect(match, match.pairs.map((_, i) => (i + 1) % match.pairs.length)), false);
});

test('presentation shuffles without losing or inventing an option', () => {
  const rnd = seeded(31);
  for (const q of CCNA_BANK) {
    const p = presentation(q, rnd);
    const order = p.choiceOrder ?? p.rightOrder ?? p.shownOrder;
    const size = (q.choices ?? q.pairs ?? q.steps).length;
    assert.equal(order.length, size, q.id);
    assert.equal(new Set(order).size, size, `${q.id} repeats an index`);
    assert.equal(order.every(i => i >= 0 && i < size), true, q.id);
  }
});

test('the bank stays immutable through sampling and presentation', () => {
  const before = JSON.stringify(CCNA_BANK);
  sampleExam(CCNA_BANK, { rnd: seeded(1) });
  presentation(CCNA_BANK[0], seeded(1));
  assert.equal(JSON.stringify(CCNA_BANK), before);
});

test('quotas sum to the exam size at every length', () => {
  for (const count of [10, 20, 33, 40, 50, 60, 100, 137]) {
    const parts = quotas(count);
    assert.equal(parts.reduce((a, p) => a + p.want, 0), count, `quotas for ${count}`);
    assert.equal(parts.every(p => p.want >= 0), true, `negative seat at ${count}`);
  }
});

test('quotas stay close to the weights they came from', () => {
  for (const { domain, want } of quotas(100)) {
    assert.equal(want, domainById(domain).weight, 'at 100 questions a quota is its weight');
  }
  // Rounding each weight alone would give 51 seats for a 50-question exam,
  // which is the bug this replaced.
  const naive = DOMAINS.reduce((a, d) => a + Math.round((50 * d.weight) / 100), 0);
  assert.equal(naive, 51, 'the naive approach really does overshoot');
  assert.equal(quotas(50).reduce((a, p) => a + p.want, 0), 50);
});
