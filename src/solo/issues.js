import { ISSUE_GROUPS } from './issue-data.js';
import { parameters, hashSeed } from './seed.js';

const LIVE = { 'Disconnected workstation cable': 'P1', 'Administratively disabled access port': 'P2', 'Client in wrong IPv4 subnet': 'I1', 'Incorrect default gateway': 'I2', 'Wrong access VLAN': 'V1', 'Missing VLAN on trunk allow list': 'V2', 'Incorrect client resolver': 'D1', 'Incorrect portal A record': 'D2' };
export const ISSUE_CATEGORIES = Object.keys(ISSUE_GROUPS);
export const ISSUES = Object.entries(ISSUE_GROUPS).flatMap(([category, text], group) => text.trim().split('\n').map((line, index) => {
  const [title, grouping, symptom, evidence, repair, verification] = line.split('|');
  return Object.freeze({ id: `ISS-${String(group + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`, title, category,
    grouping: { F: 'Foundational', C: 'Common', R: 'Rare' }[grouping], difficulty: { F: 1, C: 2, R: 3 }[grouping],
    symptom, evidence, repair, verification, recipeId: LIVE[title] ?? null,
    format: LIVE[title] ? 'Live lab + case study' : 'Case study',
    prerequisites: grouping === 'F' ? ['Read the work order', 'Identify the affected endpoint'] : ['Establish scope', 'Capture a baseline', 'Understand the relevant network layer'],
    reviewStatus: 'Authored curriculum; not a certification assessment',
  });
}));

export function searchIssues({ query = '', category = '', grouping = '', liveOnly = false } = {}) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return ISSUES.filter(issue => (!category || issue.category === category) && (!grouping || issue.grouping === grouping) && (!liveOnly || issue.recipeId)
    && terms.every(term => `${issue.title} ${issue.symptom} ${issue.category} ${issue.id}`.toLowerCase().includes(term)));
}

export function choicesFor(issue, field) {
  if (!['repair', 'verification'].includes(field)) throw new Error('Unknown question field.');
  const peers = ISSUES.filter(other => other.category === issue.category && other.id !== issue.id);
  const offset = hashSeed(issue.id + field) % peers.length;
  const choices = [issue, ...Array.from({ length: 3 }, (_, i) => peers[(offset + i) % peers.length])];
  return choices.sort((a, b) => hashSeed(a.id + issue.id + field) - hashSeed(b.id + issue.id + field));
}

export function gradeIssue(issue, { repairId, verificationId, note = '', evidenceRead = false, revealed = false }) {
  const checks = { evidence: evidenceRead, repair: repairId === issue.id, verification: verificationId === issue.id, note: note.trim().length >= 20 && note.trim().length <= 500 };
  return { passed: Object.values(checks).every(Boolean), independent: !revealed, checks };
}

export function liveCodeFor(issueId, tier = 1, variation = 0) {
  const issue = ISSUES.find(item => item.id === issueId);
  if (!issue?.recipeId) throw new Error('This issue is a diagnostic case study; no live fault adapter exists yet.');
  if (![1, 2, 3].includes(tier) || !Number.isInteger(variation) || variation < 0 || variation > 999999) throw new Error('Invalid lab variation.');
  for (let i = 0; i < 100; i++) {
    const seed = `${issue.id.replaceAll('-', '')}_${variation}_${i}`;
    const code = `TF1-BR-${tier}-${issue.recipeId[0]}-${seed}`;
    if (parameters(code).recipes.includes(issue.recipeId)) return code;
  }
  throw new Error('Could not generate that fault. Choose another variation.');
}
