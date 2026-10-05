// Skill tree progress: which lights are on, which are fading, what to try
// next, and how checks and exams light them.
//
// Pure. The saved record holds only what the tree itself decides (Know check
// results and exam passes); Fix lights are read from the profile's completed
// tickets, so there is no second ledger to fall out of step. `now` and the
// random source are passed in so tests can pin them.

import { CCNA_MAP, ALL_BRANCHES, TIERS } from './ccna.js';
import { CCNA_BANK } from '../study/questions.js';
import { inBlueprint, sampleExam } from '../study/bank.js';

const DAY = 86_400_000;
// A light starts dimming after two weeks untouched and is dark after six.
export const FADE_START_DAYS = 14;
export const FADE_END_DAYS = 42;

export const KNOW_CHECK_SIZE = 5;
export const KNOW_MIN_QUESTIONS = 3;
export const TREE_EXAM_SIZE = 20;
export const FINAL_SIZE = 50;
export const EXAM_PASS = 0.85;

export function emptyRecord() {
  return { know: {}, exams: {}, final: null, seen: {} };
}

export function normalizeRecord(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    know: r.know && typeof r.know === 'object' ? r.know : {},
    exams: r.exams && typeof r.exams === 'object' ? r.exams : {},
    final: r.final && typeof r.final === 'object' ? r.final : null,
    seen: r.seen && typeof r.seen === 'object' ? r.seen : {},
  };
}

// ---------- tagging the bank to branches ----------

const scoreOf = (branch, text) => (text.match(new RegExp(branch.match.source, 'gi')) ?? []).length;
function best(branches, text) {
  let top = null, top_score = 0;
  for (const b of branches) {
    const n = scoreOf(b, text);
    if (n > top_score) { top_score = n; top = b; }
  }
  return top;
}

// Each question belongs to one branch: the one it is pinned to, or else the
// branch whose keywords it hits hardest, trying the IOS trunk and its own
// domain's tree before the rest of the map.
export function branchForQuestion(question) {
  if (question.branch) return ALL_BRANCHES.find(b => b.id === question.branch) ?? null;
  const tree = CCNA_MAP.trees.find(t => t.domain === question.domain);
  const own = [...CCNA_MAP.trees[0].branches, ...(tree?.branches ?? [])];
  const text = `${question.scenario ?? ''} ${question.prompt}`;
  return best(own, text) ?? best(own, question.explain ?? '') ?? best(ALL_BRANCHES, `${text} ${question.explain ?? ''}`);
}

let poolCache = null;
export function questionPools(bank = CCNA_BANK) {
  if (bank === CCNA_BANK && poolCache) return poolCache;
  const pools = Object.fromEntries(ALL_BRANCHES.map(b => [b.id, []]));
  for (const q of bank) {
    if (!inBlueprint(q, 'v1')) continue;
    const branch = branchForQuestion(q);
    if (branch) pools[branch.id].push(q.id);
  }
  if (bank === CCNA_BANK) poolCache = pools;
  return pools;
}

// ---------- lights ----------

function freshness(at, now) {
  if (!at) return 0;
  const days = (now - new Date(at).getTime()) / DAY;
  if (days <= FADE_START_DAYS) return 1;
  if (days >= FADE_END_DAYS) return 0;
  return 1 - (days - FADE_START_DAYS) / (FADE_END_DAYS - FADE_START_DAYS);
}

// tierState -> { state, fresh, at, source }
//   state: 'mastered' | 'practiced' | 'faded' | 'off' | 'soon' | 'none'
//   'soon'  the tier exists for this skill but the app cannot test it yet
//   'none'  the branch has no such tier (a concept-only branch's Do or Fix)
export function tierState(branch, tier, { record = emptyRecord(), completedRuns = [], now = Date.now() } = {}) {
  if (!branch.tiers.includes(tier)) return { state: 'none', fresh: 0, at: null, source: null };
  let lit = null;
  if (tier === 'know') {
    const k = record.know[branch.id];
    if (k?.state) lit = { state: k.state, at: k.at, source: k.source ?? 'check' };
  } else if (tier === 'fix') {
    if (!branch.recipes?.length) return { state: 'soon', fresh: 0, at: null, source: null };
    const runs = completedRuns.filter(r => r?.mode === 'repair' && (r.recipes ?? []).some(id => branch.recipes.includes(id)));
    const clean = runs.filter(r => !r.assisted).sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0];
    const helped = runs.filter(r => r.assisted).sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0];
    if (clean) lit = { state: 'mastered', at: clean.completedAt, source: 'ticket' };
    else if (helped) lit = { state: 'practiced', at: helped.completedAt, source: 'ticket' };
  } else if (tier === 'do') {
    return { state: 'soon', fresh: 0, at: null, source: null };
  }
  if (!lit) return { state: 'off', fresh: 0, at: null, source: null };
  const fresh = freshness(lit.at, now);
  return { state: fresh === 0 ? 'faded' : lit.state, fresh, at: lit.at, source: lit.source };
}

// A branch is complete when every tier the app can test is mastered and fresh.
export function branchStatus(branch, ctx) {
  const tiers = Object.fromEntries(TIERS.map(t => [t, tierState(branch, t, ctx)]));
  const testable = TIERS.filter(t => !['none', 'soon'].includes(tiers[t].state));
  const mastered = testable.filter(t => tiers[t].state === 'mastered').length;
  const complete = testable.length > 0 && mastered === testable.length;
  const started = TIERS.some(t => ['mastered', 'practiced', 'faded'].includes(tiers[t].state));
  return { id: branch.id, tiers, testable: testable.length, mastered, complete, started };
}

// Prerequisites never lock anything. A branch whose prerequisites are not yet
// known is marked hard; one whose prerequisites are known and is not itself
// complete is ready, the edge of what the trainee can learn next.
export function readiness(branch, statusById) {
  if (statusById[branch.id]?.complete) return 'done';
  const unmet = (branch.needs ?? []).filter(id => {
    const s = statusById[id];
    return !s || !['mastered'].includes(s.tiers.know.state);
  });
  return unmet.length ? 'hard' : 'ready';
}

export function mapProgress(ctx, map = CCNA_MAP) {
  const statusById = {};
  for (const tree of map.trees) for (const b of tree.branches) statusById[b.id] = branchStatus(b, ctx);
  const pools = questionPools();
  const record = ctx.record ?? emptyRecord();
  const trees = map.trees.map(tree => {
    const branches = tree.branches.map(b => ({
      ...statusById[b.id],
      readiness: readiness(b, statusById),
      questions: pools[b.id]?.length ?? 0,
    }));
    const lights = branches.reduce((n, b) => n + b.mastered, 0);
    const possible = branches.reduce((n, b) => n + b.testable, 0);
    const exam = record.exams[tree.id] ?? null;
    const examFresh = exam?.passed ? freshness(exam.at, ctx.now ?? Date.now()) : 0;
    return {
      id: tree.id,
      branches,
      lights,
      possible,
      complete: branches.every(b => b.complete),
      crowned: Boolean(exam?.passed) && examFresh > 0,
      exam,
    };
  });
  const lights = trees.reduce((n, t) => n + t.lights, 0);
  const possible = trees.reduce((n, t) => n + t.possible, 0);
  return { trees, statusById, lights, possible, final: record.final };
}

// ---------- checks and exams ----------

function shuffled(list, rnd) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const byId = new Map(CCNA_BANK.map(q => [q.id, q]));
const questionsFor = (ids) => ids.map(id => byId.get(id)).filter(Boolean);

export function knowCheckDeck(branchId, rnd = Math.random) {
  const pool = questionPools()[branchId] ?? [];
  if (pool.length < KNOW_MIN_QUESTIONS) return [];
  return questionsFor(shuffled(pool, rnd).slice(0, KNOW_CHECK_SIZE));
}

// A tree exam deals the tree's branches in turn, so every branch with
// questions is represented before any one gets a second.
export function treeExamDeck(treeId, rnd = Math.random, size = TREE_EXAM_SIZE) {
  const tree = CCNA_MAP.trees.find(t => t.id === treeId);
  if (!tree) return [];
  const pools = questionPools();
  const piles = tree.branches.map(b => shuffled(pools[b.id] ?? [], rnd)).filter(p => p.length);
  const picked = [];
  while (picked.length < size && piles.some(p => p.length)) {
    for (const pile of piles) {
      if (pile.length && picked.length < size) picked.push(pile.shift());
    }
  }
  return questionsFor(shuffled(picked, rnd));
}

export function finalDeck(rnd = Math.random) {
  return sampleExam(CCNA_BANK, { count: FINAL_SIZE, blueprint: 'v1', rnd }).questions;
}

const passes = (right, total, mark) => total > 0 && right / total >= mark;

// Know check: 4 of 5 lights the tier, 2 or 3 counts as practice. A worse
// result never dims a light that is already on and fresh.
export function recordKnowCheck(record, branchId, { right, total }, now = Date.now()) {
  const at = new Date(now).toISOString();
  const prior = record.know[branchId];
  let state = null;
  if (passes(right, total, 0.8)) state = 'mastered';
  else if (right >= 2) state = 'practiced';
  if (!state) return record;
  if (prior?.state === 'mastered' && state === 'practiced' && freshness(prior.at, now) > 0) return record;
  return { ...record, know: { ...record.know, [branchId]: { state, at, source: 'check', right, total } } };
}

// An exam pass lights Know on every branch it drew questions from, which is
// the "skip ahead" rule: passing early counts for what it covered.
function creditBranches(record, deck, at) {
  const know = { ...record.know };
  for (const q of deck) {
    const branch = branchForQuestion(q);
    if (branch && branch.tiers.includes('know')) know[branch.id] = { state: 'mastered', at, source: 'exam' };
  }
  return know;
}

export function recordTreeExam(record, treeId, deck, { right, total }, now = Date.now()) {
  const at = new Date(now).toISOString();
  const passed = passes(right, total, EXAM_PASS);
  const exam = { right, total, at, passed };
  const best = record.exams[treeId]?.passed && !passed ? record.exams[treeId] : exam;
  return {
    ...record,
    exams: { ...record.exams, [treeId]: best },
    know: passed ? creditBranches(record, deck, at) : record.know,
  };
}

export function recordFinal(record, deck, { right, total }, now = Date.now()) {
  const at = new Date(now).toISOString();
  const passed = passes(right, total, EXAM_PASS);
  const final = record.final?.passed && !passed ? record.final : { right, total, at, passed };
  return { ...record, final, know: passed ? creditBranches(record, deck, at) : record.know };
}

// The lights that came on since the map was last looked at, so the map can
// run its light pulse once for each and then remember it has.
export function newlyLit(progress, record) {
  const lit = [];
  for (const tree of progress.trees) {
    for (const b of tree.branches) {
      for (const t of TIERS) {
        if (b.tiers[t].state === 'mastered' && !record.seen[`${b.id}:${t}`]) lit.push(`${b.id}:${t}`);
      }
    }
    if (tree.crowned && !record.seen[`${tree.id}:crown`]) lit.push(`${tree.id}:crown`);
  }
  return lit;
}

export function markSeen(record, keys) {
  if (!keys.length) return record;
  return { ...record, seen: { ...record.seen, ...Object.fromEntries(keys.map(k => [k, true])) } };
}
