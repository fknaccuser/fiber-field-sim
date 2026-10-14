import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readinessReport, tierValue, BOOK } from '../../src/solo/exam/readiness.js';
import { mapProgress, emptyRecord } from '../../src/solo/tree/progress.js';
import { CCNA_BANK } from '../../src/solo/study/questions.js';
import { CCNA_MAP } from '../../src/solo/tree/ccna.js';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const at = (days) => new Date(NOW - days * 86400000).toISOString();

// Every testable light on, as of `days` ago.
function litRecord(days = 1) {
  const r = emptyRecord();
  for (const t of CCNA_MAP.trees) for (const b of t.branches) {
    r.know[b.id] = { state: 'mastered', at: at(days) };
    r.deskDo = { ...(r.deskDo ?? {}), [b.id]: { state: 'mastered', at: at(days) } };
    r.deskFix = { ...(r.deskFix ?? {}), [b.id]: { state: 'mastered', at: at(days) } };
  }
  return r;
}
function answered(fraction) {
  const quiz = {};
  CCNA_BANK.slice(0, 600).forEach((q, i) => {
    const ok = (i % 100) < fraction * 100;
    quiz[q.id] = { right: ok ? 1 : 0, seen: 1, last: { ok, at: NOW - 86400000 } };
  });
  return quiz;
}

test('a fresh start reads zero and says not yet', () => {
  const progress = mapProgress({ record: emptyRecord(), completedRuns: [], now: NOW });
  const r = readinessReport({ progress, bank: CCNA_BANK, now: NOW });
  assert.equal(r.overall, 0);
  assert.equal(r.verdict.key, 'not-yet');
  assert.equal(r.domains.length, 6);
  assert.ok(r.weak.length > 0, 'weak spots are offered from the start');
});

test('everything lit, strong answers and a recent passing mock: ready to book', () => {
  const progress = mapProgress({ record: litRecord(1), completedRuns: [], now: NOW });
  const mock = { at: NOW - 2 * 86400000, pct: 88, domains: { NF: 90, NA: 85, IPC: 88, IPS: 86, SECF: 90, AUTO: 84 } };
  const r = readinessReport({ progress, quiz: answered(0.95), mocks: [mock], bank: CCNA_BANK, now: NOW });
  assert.ok(r.overall >= BOOK.overall, `overall ${r.overall}`);
  assert.equal(r.verdict.key, 'book');
});

test('no mock caps the verdict below book, however good the rest is', () => {
  const progress = mapProgress({ record: litRecord(1), completedRuns: [], now: NOW });
  const r = readinessReport({ progress, quiz: answered(0.95), bank: CCNA_BANK, now: NOW });
  assert.notEqual(r.verdict.key, 'book');
  assert.match(r.verdict.text, /mock/i);
});

test('lights fade: the same work a month and a half ago reads lower', () => {
  const fresh = readinessReport({ progress: mapProgress({ record: litRecord(1), completedRuns: [], now: NOW }), bank: CCNA_BANK, now: NOW });
  const old = readinessReport({ progress: mapProgress({ record: litRecord(45), completedRuns: [], now: NOW }), bank: CCNA_BANK, now: NOW });
  assert.ok(old.overall < fresh.overall, `${old.overall} should be under ${fresh.overall}`);
});

test('a weak domain on the mock pulls that domain down and names it', () => {
  const progress = mapProgress({ record: litRecord(1), completedRuns: [], now: NOW });
  const mock = { at: NOW - 86400000, pct: 70, domains: { NF: 90, NA: 85, IPC: 30, IPS: 86, SECF: 90, AUTO: 84 } };
  const r = readinessReport({ progress, quiz: answered(0.9), mocks: [mock], bank: CCNA_BANK, now: NOW });
  const ipc = r.domains.find(d => d.domain === 'IPC');
  assert.ok(ipc.score < r.domains.find(d => d.domain === 'NF').score);
  assert.notEqual(r.verdict.key, 'book');
});

test('tier values: mastered and fresh is full, practiced is half, off is nothing', () => {
  assert.equal(tierValue({ state: 'mastered', fresh: 1 }), 1);
  assert.equal(tierValue({ state: 'practiced', fresh: 1 }), 0.5);
  assert.equal(tierValue({ state: 'off', fresh: 0 }), 0);
});
