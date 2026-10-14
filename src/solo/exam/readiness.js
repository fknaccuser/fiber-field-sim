// Readiness: how close the trainee is to passing, per exam domain and
// overall, and which branches are costing the most.
//
// Pure. Built from three kinds of evidence, each with its reason:
//   know   recent question accuracy in the domain, shrunk toward zero
//          until enough questions are answered to mean something, plus how
//          many of the domain's Know lights are on
//   hands  the domain's Do and Fix lights (labs, work orders, tickets) and
//          simlet accuracy
//   mock   the domain's score on the latest full or half mock, the closest
//          thing to the exam itself
// Lights fade as the map's do, so a domain studied a month ago reads lower
// than one studied this week.
//
// Cisco publishes no pass mark. "Book it" here means every domain at 70 or
// more, 80 or more overall, and a recent mock at 80 or more.

import { DOMAINS } from '../study/bank.js';
import { CCNA_MAP } from '../tree/ccna.js';
import { branchForQuestion } from '../tree/progress.js';
import { simletOf } from './simlets.js';

const DAY = 86400000;
const RECENT_DAYS = 60;
const MOCK_DAYS = 30;
const ENOUGH_ANSWERS = 40;
export const BOOK = { overall: 80, domain: 70, mock: 80 };

// What one lit tier is worth: full when mastered and fresh, less when only
// practiced or fading.
export function tierValue(t) {
  if (!t) return 0;
  if (t.state === 'mastered') return Math.max(0.25, t.fresh ?? 1);
  if (t.state === 'practiced') return 0.5 * Math.max(0.5, t.fresh ?? 1);
  if (t.state === 'faded') return 0.2;
  return 0;
}
const testable = (t) => t && !['none', 'soon'].includes(t.state);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// How well each branch is held, 0 to 1, from its testable tiers.
export function branchScore(status) {
  const vals = ['know', 'do', 'fix'].map(k => status.tiers[k]).filter(testable).map(tierValue);
  return avg(vals) ?? 0;
}

function questionStats(bank, quiz, now) {
  const byDomain = {};
  const byBranch = {};
  const index = new Map(bank.map(q => [q.id, q]));
  for (const [id, rec] of Object.entries(quiz ?? {})) {
    const q = index.get(id);
    if (!q || !rec?.seen) continue;
    const at = rec.last?.at ?? 0;
    if (now - at > RECENT_DAYS * DAY) continue;
    const d = (byDomain[q.domain] ??= { right: 0, seen: 0 });
    d.right += rec.right ?? 0;
    d.seen += rec.seen;
    const b = branchForQuestion(q)?.id;
    if (b) { const x = (byBranch[b] ??= { right: 0, seen: 0, misses: 0 }); x.right += rec.right ?? 0; x.seen += rec.seen; if (rec.last && !rec.last.ok) x.misses += 1; }
  }
  return { byDomain, byBranch };
}

// readinessReport({ progress, quiz, mocks, simlets, bank, now })
export function readinessReport({ progress, quiz = {}, mocks = [], simlets = {}, bank, now = Date.now() }) {
  const stats = questionStats(bank, quiz, now);
  const recentMock = [...mocks].reverse().find(m => now - (m.at ?? 0) <= MOCK_DAYS * DAY) ?? null;
  const simletByDomain = {};
  for (const [kind, s] of Object.entries(simlets)) {
    const d = simletOf(kind)?.domain;
    if (!d || !s.total) continue;
    const x = (simletByDomain[d] ??= { right: 0, total: 0 });
    x.right += s.right; x.total += s.total;
  }

  const domains = DOMAINS.map(dom => {
    const tree = CCNA_MAP.trees.find(t => t.domain === dom.id);
    const statuses = tree.branches.map(b => progress.statusById[b.id]);
    const qs = stats.byDomain[dom.id] ?? { right: 0, seen: 0 };
    const accuracy = qs.seen ? qs.right / qs.seen : 0;
    const accPart = accuracy * Math.min(1, qs.seen / ENOUGH_ANSWERS);
    const knowLights = avg(statuses.map(s => tierValue(s.tiers.know))) ?? 0;
    const know = 0.5 * accPart + 0.5 * knowLights;
    const handsTiers = statuses.flatMap(s => ['do', 'fix'].map(k => s.tiers[k])).filter(testable);
    const lightsPart = avg(handsTiers.map(tierValue));
    const sl = simletByDomain[dom.id];
    const slPart = sl ? sl.right / sl.total : null;
    const hands = lightsPart === null ? (slPart ?? null) : slPart === null ? lightsPart : 0.8 * lightsPart + 0.2 * slPart;
    const mock = recentMock && Number.isFinite(recentMock.domains?.[dom.id]) ? recentMock.domains[dom.id] / 100 : null;
    const parts = [[know, 0.45], [hands, 0.3], [mock, 0.25]].filter(([v]) => v !== null);
    const total = parts.reduce((a, [, w]) => a + w, 0);
    const score = Math.round((100 * parts.reduce((a, [v, w]) => a + v * w, 0)) / total);
    return {
      domain: dom.id, label: dom.label, weight: dom.weight, score,
      parts: { know: Math.round(know * 100), hands: hands === null ? null : Math.round(hands * 100), mock: mock === null ? null : Math.round(mock * 100) },
      answered: qs.seen, accuracy: Math.round(accuracy * 100),
    };
  });

  const overall = Math.round(domains.reduce((a, d) => a + d.score * d.weight, 0) / domains.reduce((a, d) => a + d.weight, 0));
  const lowest = [...domains].sort((a, b) => a.score - b.score)[0];
  let verdict;
  if (overall >= BOOK.overall && domains.every(d => d.score >= BOOK.domain) && recentMock && recentMock.pct >= BOOK.mock) {
    verdict = { key: 'book', text: `Ready to book. Every domain is at ${BOOK.domain} or more and your last mock was ${recentMock.pct}%.` };
  } else if (overall >= 65) {
    verdict = { key: 'close', text: recentMock ? `Close. ${lowest.label} at ${lowest.score} is what holds it back.` : `Close on paper. Take a full mock to confirm it under the clock.` };
  } else {
    verdict = { key: 'not-yet', text: `Not yet. ${lowest.label} at ${lowest.score} is the biggest gap.` };
  }
  return { overall, verdict, domains, mock: recentMock, weak: weakSpots(progress, stats, domains) };
}

// The branches costing the most: low score, in a heavy domain, with misses.
export function weakSpots(progress, stats, domains, limit = 5) {
  const weightOf = Object.fromEntries(domains.map(d => [d.domain, d.weight]));
  const out = [];
  for (const tree of CCNA_MAP.trees) {
    for (const b of tree.branches) {
      const s = progress.statusById[b.id];
      if (!s) continue;
      const score = branchScore(s);
      if (score >= 0.95) continue;
      const q = stats.byBranch[b.id];
      const missRate = q?.seen ? 1 - q.right / q.seen : 0;
      const weight = tree.domain ? weightOf[tree.domain] : 15; // the IOS trunk underpins every domain
      const need = ['know', 'do', 'fix'].filter(k => testable(s.tiers[k]) && s.tiers[k].state !== 'mastered');
      out.push({ branchId: b.id, name: b.name, domain: tree.domain, score: Math.round(score * 100), need, priority: weight * (1 - score) * (1 + missRate) });
    }
  }
  return out.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
