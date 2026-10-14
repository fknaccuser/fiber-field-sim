import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPaper, score, MOCKS, pace, domainOfLights, SIM_POINTS } from '../../src/solo/exam/mock.js';
import { SIMLETS, resolveQuestions } from '../../src/solo/exam/simlets.js';
import { buildWorld } from '../../src/solo/desk/grade.js';
import { CCNA_BANK } from '../../src/solo/study/questions.js';
import { isDrag, quotas } from '../../src/solo/study/bank.js';
import { templateOf } from '../../src/solo/desk/jobs.js';

const BY_ID = new Map(CCNA_BANK.map(q => [q.id, q]));

test('a full mock: 96 questions to the blueprint weights, 3 sims, 2 simlets, spread through the paper', () => {
  const p = buildPaper('full', { seed: 11 });
  const qs = p.items.filter(i => i.type === 'q');
  assert.equal(qs.length, MOCKS.full.questions);
  assert.equal(p.items.filter(i => i.type === 'sim').length, 3);
  assert.equal(p.items.filter(i => i.type === 'simlet').length, 2);
  assert.deepEqual(p.shortfalls, []);
  const byDomain = {};
  for (const i of qs) byDomain[BY_ID.get(i.id).domain] = (byDomain[BY_ID.get(i.id).domain] ?? 0) + 1;
  for (const { domain, want } of quotas(MOCKS.full.questions)) assert.equal(byDomain[domain], want, domain);
  assert.ok(qs.filter(i => isDrag(BY_ID.get(i.id))).length >= MOCKS.full.drags, 'drag-and-drop items are mixed in');
  assert.equal(new Set(qs.map(i => i.id)).size, qs.length, 'no question twice');
  const extras = p.items.map((it, k) => (it.type === 'q' ? null : k)).filter(k => k !== null);
  assert.ok(extras[0] > 5 && extras[extras.length - 1] < p.items.length - 5, 'sims sit inside the paper, not at its ends');
  for (const it of p.items.filter(i => i.type === 'sim')) assert.ok(templateOf(it.kind), it.kind);
  assert.deepEqual(buildPaper('full', { seed: 11 }), p, 'a seed gives the same paper');
  assert.notDeepEqual(buildPaper('full', { seed: 12 }).items.map(i => i.id ?? i.kind), p.items.map(i => i.id ?? i.kind));
});

test('a half mock is half the size with two sims and a simlet', () => {
  const p = buildPaper('half', { seed: 3 });
  assert.equal(p.items.length, MOCKS.half.questions + 2 + 1);
});

test('scoring: a sim is worth three questions at its partial credit; unanswered items score zero', () => {
  const p = buildPaper('half', { seed: 5 });
  const all = p.items.map(it => (it.type === 'q' ? { ok: true } : it.type === 'sim' ? { pct: 100 } : { right: 4, total: 4 }));
  assert.equal(score(p, all).pct, 100);
  const halfSims = p.items.map(it => (it.type === 'q' ? { ok: true } : it.type === 'sim' ? { pct: 50 } : { right: 4, total: 4 }));
  const s = score(p, halfSims);
  assert.equal(s.of, MOCKS.half.questions + 2 * SIM_POINTS + 4);
  assert.equal(s.got, MOCKS.half.questions + SIM_POINTS + 4);
  assert.equal(s.byType.sim.pct, 50);
  assert.equal(score(p, []).pct, 0);
  assert.equal(s.domains.reduce((a, d) => a + d.of, 0), s.of, 'every point lands in a domain');
});

test('pacing reads ahead or behind against the clock', () => {
  const p = buildPaper('full', { seed: 2 });
  assert.ok(pace(p, 50, 10 * 60000).aheadMs > 0, 'half the paper in 10 minutes is ahead');
  assert.ok(pace(p, 10, 60 * 60000).aheadMs < 0, '10 items in an hour is behind');
});

test('work orders and simlets count toward a real exam domain', () => {
  assert.equal(domainOfLights(['t0-base', 't5-access']), 'SECF');
  assert.equal(domainOfLights(['t2-vlans']), 'NA');
  for (const s of SIMLETS) assert.ok(['NF', 'NA', 'IPC', 'IPS', 'SECF', 'AUTO'].includes(s.domain));
});

for (const t of SIMLETS) {
  test(`${t.kind}: every question has exactly one right answer read from the network, and seeds vary`, () => {
    const rights = {};
    for (let seed = 1; seed <= 12; seed += 1) {
      const s = t.make(seed);
      const qs = resolveQuestions(s, buildWorld(s));
      assert.ok(qs.length >= 3, `${t.kind} seed ${seed} has too few questions`);
      for (const q of qs) {
        assert.equal(q.choices.filter(c => c.correct).length, 1, `${t.kind} seed ${seed} ${q.id}`);
        assert.ok(q.choices.length >= 3, `${t.kind} seed ${seed} ${q.id} has ${q.choices.length} choices`);
        assert.equal(new Set(q.choices.map(c => c.text)).size, q.choices.length, `${t.kind} seed ${seed} ${q.id} repeats a choice`);
        assert.ok(q.explain && q.explain.length > 60, `${t.kind} ${q.id} explains itself`);
        (rights[q.id] ??= new Set()).add(q.choices.find(c => c.correct).text);
      }
    }
    assert.ok(Object.values(rights).filter(v => v.size > 1).length >= 2, `${t.kind} answers barely change between seeds`);
  });
}

test('command recall reads typed commands the way IOS does', async () => {
  const { sameCommand } = await import('../../src/solo/labs/ios.js');
  const { checkTyped } = await import('../../src/solo/study/recall.js');
  const { RECALL_DECK } = await import('../../src/solo/study/recall-deck.js');
  assert.ok(sameCommand('show ip interface brief', 'sh ip int br'));
  assert.ok(sameCommand('switchport trunk allowed vlan add 40', 'sw tr al vl add 40'));
  assert.ok(sameCommand('interface GigabitEthernet0/1', 'int g0/1'));
  assert.ok(!sameCommand('switchport trunk allowed vlan add 40', 'switchport trunk allowed vlan 40'), 'leaving out add is a different command');
  assert.ok(!sameCommand('show ip interface brief', 'sh ip int'), 'an incomplete command is not the answer');
  const card = RECALL_DECK.find(c => c.id === 'cmd-passive');
  assert.equal(checkTyped(card, 'passive g0/2', { sameCommand }).correct, true);
  assert.equal(checkTyped(card, 'passive g0/1', { sameCommand }).correct, false);
  assert.equal(checkTyped(card, 'passive g0/2').correct, false, 'without the parser only listed forms count');
  for (const c of RECALL_DECK.filter(x => x.kind === 'command' && !/^(nslookup|ipconfig|ip name-server|ip domain-lookup)/.test(x.answer))) {
    assert.equal(checkTyped(c, c.answer, { sameCommand }).correct, true, c.id);
  }
});
