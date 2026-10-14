// The full mock exam under exam rules: a fixed clock, questions in one
// direction only, simulations and simlets mixed in among the questions.
//
// Pure: building the paper and scoring it. The screen lives in
// mock-screen.js.
//
// Cisco publishes neither the item count, the weight of a simulation, nor a
// pass mark. The choices here are stated where they are made: about a
// hundred items in 120 minutes, a simulation worth three questions scored on
// its partial credit, a simlet's questions worth one each.

import { sampleExam, isDrag, DOMAINS } from '../study/bank.js';
import { CCNA_BANK } from '../study/questions.js';
import { TEMPLATES } from '../desk/jobs.js';
import { SIMLETS } from './simlets.js';
import { branchById, CCNA_MAP } from '../tree/ccna.js';
import { rngOf, shuffle, pick } from '../study/gen/kit.js';

export const MOCKS = {
  full: { id: 'full', label: 'Full mock', minutes: 120, questions: 96, drags: 8, sims: 3, simlets: 2 },
  half: { id: 'half', label: 'Half mock', minutes: 60, questions: 46, drags: 4, sims: 2, simlets: 1 },
};
export const SIM_POINTS = 3;
export const WORKING_TARGET = 0.8;

const treeOfBranch = (id) => CCNA_MAP.trees.find(t => t.branches.some(b => b.id === id)) ?? null;
// The exam domain a work order or simlet counts toward: its first branch
// that sits in a domain tree (the IOS trunk belongs to none).
export function domainOfLights(lights) {
  for (const b of lights ?? []) {
    const d = treeOfBranch(b)?.domain;
    if (d) return d;
  }
  return 'NA';
}

const SWITCH_BUILDS = ['build-vlans', 'build-uplink', 'build-bundle', 'build-edge'];
const ROUTER_BUILDS = ['build-dhcp', 'build-nat', 'build-acl', 'build-roas', 'build-ospf', 'build-ipv6'];
const SIM_POOL = () => TEMPLATES.map(t => t.kind);

// Which work orders become the simulations: a switch build, a router build,
// then a trouble ticket, the way the common sim topics fall.
function pickSims(rnd, n) {
  const have = new Set(SIM_POOL());
  const lanes = [SWITCH_BUILDS, ROUTER_BUILDS, [...have].filter(k => k.startsWith('repair'))].map(l => l.filter(k => have.has(k)));
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(pick(rnd, lanes[i % lanes.length]));
  return out;
}

// Spread n items through a paper of length total, never first or last.
function slots(total, n) {
  return Array.from({ length: n }, (_, i) => Math.round(((i + 1) * total) / (n + 1)));
}

// buildPaper(format, { seed, blueprint }) -> { format, seed, items, shortfalls }
// items: { type: 'q', id, gseed } | { type: 'sim', kind, seed, domain } | { type: 'simlet', kind, seed, domain }
export function buildPaper(formatId, { seed = 1, blueprint = 'v1', bank = CCNA_BANK } = {}) {
  const f = MOCKS[formatId] ?? MOCKS.full;
  const rnd = rngOf(seed);
  const { questions, shortfalls } = sampleExam(bank, { count: f.questions, blueprint, rnd });
  // Make sure some drag-and-drop items are in, each replacing a plain
  // question from its own domain so the weights hold.
  const paper = [...questions];
  const used = new Set(paper.map(q => q.id));
  let drags = paper.filter(isDrag).length;
  const spare = shuffle(rnd, bank.filter(q => isDrag(q) && !used.has(q.id) && (blueprint === 'both' || (blueprint === 'v1' ? q.v2 !== 'v2only' : q.v2 !== 'dropped'))));
  for (const d of spare) {
    if (drags >= f.drags) break;
    const at = paper.findIndex(q => q.domain === d.domain && q.format === 'single');
    if (at < 0) continue;
    paper[at] = d;
    drags += 1;
  }
  const items = paper.map(q => ({ type: 'q', id: q.id, gseed: Math.floor(rnd() * 1e9) + 1 }));
  const extra = [
    ...pickSims(rnd, f.sims).map(kind => ({ type: 'sim', kind, seed: Math.floor(rnd() * 1e9) + 1, domain: domainOfLights(TEMPLATES.find(t => t.kind === kind)?.lights) })),
    ...shuffle(rnd, SIMLETS).slice(0, f.simlets).map(s => ({ type: 'simlet', kind: s.kind, seed: Math.floor(rnd() * 1e9) + 1, domain: s.domain })),
  ];
  // Interleave: sims and simlets land spread across the paper.
  const order = shuffle(rnd, extra);
  const at = slots(items.length + order.length, order.length);
  const out = [];
  let qi = 0;
  for (let pos = 0, k = 0; pos < items.length + order.length; pos += 1) {
    if (k < order.length && pos === at[k]) { out.push(order[k]); k += 1; } else { out.push(items[qi]); qi += 1; }
  }
  return { format: f.id, seed, blueprint, items: out, shortfalls };
}

// What an item is worth, and what it earned.
//   q       1 point, all or nothing
//   simlet  1 point per question
//   sim     SIM_POINTS, times the sim's percentage
export function itemPoints(item, result) {
  if (item.type === 'q') return { got: result?.ok ? 1 : 0, of: 1 };
  if (item.type === 'simlet') return { got: result?.right ?? 0, of: result?.total ?? 4 };
  return { got: SIM_POINTS * ((result?.pct ?? 0) / 100), of: SIM_POINTS };
}

// score(paper, results) -> { pct, got, of, domains: [{ domain, label, got, of, pct }], byType }
export function score(paper, results) {
  const dom = Object.fromEntries(DOMAINS.map(d => [d.id, { domain: d.id, label: d.label, weight: d.weight, got: 0, of: 0 }]));
  const byType = { q: { got: 0, of: 0 }, sim: { got: 0, of: 0 }, simlet: { got: 0, of: 0 } };
  paper.items.forEach((item, i) => {
    const r = results[i];
    const domain = item.type === 'q' ? (r?.domain ?? CCNA_BANK.find(q => q.id === item.id)?.domain) : item.domain;
    const p = itemPoints(item, r);
    if (dom[domain]) { dom[domain].got += p.got; dom[domain].of += p.of; }
    byType[item.type].got += p.got;
    byType[item.type].of += p.of;
  });
  const got = Object.values(byType).reduce((a, t) => a + t.got, 0);
  const of = Object.values(byType).reduce((a, t) => a + t.of, 0);
  const pct = (g, o) => (o ? Math.round((100 * g) / o) : 0);
  return {
    got, of, pct: pct(got, of),
    domains: Object.values(dom).map(d => ({ ...d, pct: pct(d.got, d.of) })),
    byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, { ...v, pct: pct(v.got, v.of) }])),
  };
}

// Pacing: where you should be by now, so the screen can say ahead or behind.
export function pace(paper, index, elapsedMs) {
  const f = MOCKS[paper.format] ?? MOCKS.full;
  const weight = (it) => (it.type === 'sim' ? 10 : it.type === 'simlet' ? 4 : 0.8);
  const total = paper.items.reduce((a, it) => a + weight(it), 0);
  const done = paper.items.slice(0, index).reduce((a, it) => a + weight(it), 0);
  const expectedMs = (done / total) * f.minutes * 60000;
  return { aheadMs: expectedMs - elapsedMs, minutes: f.minutes };
}

export const branchName = (id) => branchById(id)?.name ?? id;
