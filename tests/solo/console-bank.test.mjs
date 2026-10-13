import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCNA_BANK } from '../../src/solo/study/questions.js';
import { problems } from '../../src/solo/study/bank.js';
import { markRanges, legendOf, KINDS } from '../../src/solo/study/exhibit.js';
import { questionPools, KNOW_MIN_QUESTIONS } from '../../src/solo/tree/progress.js';
import { ALL_BRANCHES } from '../../src/solo/tree/ccna.js';

test('the bank holds at least 1,000 questions and 300 console questions, all well formed', () => {
  assert.ok(CCNA_BANK.length >= 1000, `${CCNA_BANK.length} questions`);
  assert.ok(CCNA_BANK.filter(q => q.console).length >= 300);
  assert.deepEqual(problems(CCNA_BANK), []);
});

test('every branch with a Know tier has at least eight questions to draw from', () => {
  const pools = questionPools();
  for (const b of ALL_BRANCHES) {
    if (!b.tiers.includes('know')) continue;
    assert.ok(pools[b.id].length >= Math.max(8, KNOW_MIN_QUESTIONS), `${b.id} has ${pools[b.id].length}`);
  }
});

test('every exhibit question is a console question, and its marks never overlap', () => {
  for (const q of CCNA_BANK.filter(x => x.exhibit)) {
    assert.equal(q.console, true, q.id);
    const { ranges, missing } = markRanges(q.exhibit);
    assert.deepEqual(missing, [], q.id);
    for (let i = 1; i < ranges.length; i += 1) assert.ok(ranges[i].start >= ranges[i - 1].end, `${q.id} overlaps`);
    for (const item of legendOf(q.exhibit)) assert.ok(KINDS[item.kind], `${q.id} ${item.kind}`);
  }
});

test('marks resolve strings everywhere and earlier marks win overlaps', () => {
  const ex = { text: 'R1#ping 10.0.0.1\n!!!!!', marks: [['10.0.0.1', 'ip'], [/\d+\.\d+/, 'mask'], [/!+/, 'ok']] };
  const { ranges } = markRanges(ex);
  assert.deepEqual(ranges.map(r => [ex.text.slice(r.start, r.end), r.kind]), [['10.0.0.1', 'ip'], ['!!!!!', 'ok']]);
  assert.deepEqual(legendOf(ex).map(l => l.label), ['IP address', 'Where it works']);
});
