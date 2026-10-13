// Tap any term, anywhere. Finds glossary terms in the text of chosen blocks
// (explanations, lab coaching, ticket cards, branch topics) and turns the
// first few into buttons that open the term's card.
//
// Exam questions are left alone until they are answered: a definition one tap
// away during an exam is an open book. Text inside buttons, inputs and console
// output is never touched.

import { GLOSSARY, TERM_BY_ID } from './terms.js';

// Where terms get linked. Prompts of exam questions are deliberately absent.
export const GLOSS_BLOCKS = [
  '.ep-explain', '.ep-choice-why', '.ep-answer', '.ep-hint',
  '.lab-story', '.lab-q', '.lab-note', '.lab-why', '.lab-goal-text',
  '.spot-body', '.spot-term', '.spot-feedback',
  '.sk-topics li', '.sk-blurb',
  '.reference-list dd',
].join(', ');
const SKIP = 'button, a, input, textarea, select, pre, code, kbd, .gl-term, [data-no-gloss], svg';
const MAX_PER_BLOCK = 3;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A name with a capital after its first letter (OSPF, PortFast, 802.1Q) must
// match its case; plain words match any case.
const caseSensitive = (name) => /[A-Z0-9]/.test(name.slice(1)) || /^[A-Z](?![a-z])/.test(name);
// Single lowercase words in aliases are too common to link (active, list).
const linkable = (name, isAlias) => !isAlias || /[\sA-Z0-9./+-]/.test(name);

let matchers = null;
function build() {
  const exact = [], loose = [];
  for (const t of GLOSSARY) {
    if (t.auto === false) continue;
    [[t.term, false], ...t.aka.map(a => [a, true])].forEach(([name, isAlias]) => {
      if (!linkable(name, isAlias)) return;
      (caseSensitive(name) ? exact : loose).push({ name, id: t.id });
    });
  }
  const make = (list, flags) => {
    if (!list.length) return null;
    list.sort((a, b) => b.name.length - a.name.length);
    const fold = flags.includes('i');
    // Exact-case names still allow either case on the first letter, so
    // "native VLAN" mid-sentence matches the term Native VLAN.
    const firstFree = (name) => (/^[a-z][a-z]/i.test(name) && /[a-z]/.test(name[1]) ? `[${name[0].toLowerCase()}${name[0].toUpperCase()}]${escape(name.slice(1))}` : escape(name));
    const key = (name) => (fold ? name.toLowerCase() : /^[a-z][a-z]/i.test(name) && /[a-z]/.test(name[1]) ? name[0].toLowerCase() + name.slice(1) : name);
    const byName = new Map(list.map(x => [key(x.name), x.id]));
    const re = new RegExp(`(?<![\\w./-])(${list.map(x => (fold ? escape(x.name) : firstFree(x.name))).join('|')})(?![\\w]|\\.\\d)`, flags);
    return { re, byName, key };
  };
  matchers = [make(exact, 'g'), make(loose, 'gi')].filter(Boolean);
}

// findTerms(text) -> [{ index, length, id }] in order, without overlaps.
export function findTerms(text) {
  if (!matchers) build();
  const hits = [];
  for (const m of matchers) {
    m.re.lastIndex = 0;
    let r;
    while ((r = m.re.exec(text))) {
      const id = m.byName.get(m.key(r[1]));
      if (id) hits.push({ index: r.index, length: r[1].length, id });
    }
  }
  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  const out = [];
  let end = -1;
  for (const h of hits) if (h.index >= end) { out.push(h); end = h.index + h.length; }
  return out;
}

function textNodes(block) {
  const out = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) && block.contains(n.parentElement.closest(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  while (walker.nextNode()) out.push(walker.currentNode);
  return out;
}

// Links the first few distinct terms in one block. Returns how many it linked.
export function linkBlock(block) {
  if (block.dataset.glossed) return 0;
  block.dataset.glossed = '1';
  if (block.closest(SKIP)) return 0;
  const seen = new Set();
  let count = 0;
  for (const node of textNodes(block)) {
    if (count >= MAX_PER_BLOCK) break;
    const text = node.nodeValue;
    const hits = findTerms(text).filter(h => !seen.has(h.id));
    if (!hits.length) continue;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const h of hits) {
      if (count >= MAX_PER_BLOCK || seen.has(h.id)) continue;
      seen.add(h.id);
      count += 1;
      frag.append(text.slice(at, h.index));
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gl-term';
      b.dataset.term = h.id;
      b.textContent = text.slice(h.index, h.index + h.length);
      frag.append(b);
      at = h.index + h.length;
    }
    frag.append(text.slice(at));
    node.replaceWith(frag);
  }
  return count;
}

export function linkWithin(root) {
  if (root.matches?.(GLOSS_BLOCKS)) linkBlock(root);
  root.querySelectorAll?.(GLOSS_BLOCKS).forEach(linkBlock);
}

// ---------- the term card ----------
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

let openCard = null;
export function closeTermCard() {
  openCard?.remove();
  openCard = null;
}

// showTermCard(id, { branchName, onOpenBranch, onOpenGlossary })
export function showTermCard(id, { branchName, onOpenBranch, onOpenGlossary } = {}) {
  const t = TERM_BY_ID.get(id);
  if (!t) return;
  closeTermCard();
  const layer = el('div', 'gl-layer');
  const scrim = el('button', 'gl-scrim');
  scrim.type = 'button';
  scrim.setAttribute('aria-label', 'Close');
  scrim.addEventListener('click', closeTermCard);
  const card = el('section', 'gl-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', t.term);
  const head = el('div', 'gl-head');
  head.append(el('h2', 'gl-name', t.term));
  const close = el('button', 'gl-close', 'Close');
  close.type = 'button';
  close.addEventListener('click', closeTermCard);
  head.append(close);
  card.append(head);
  card.append(el('p', 'gl-plain', t.plain));
  const exam = el('div', 'gl-exam');
  exam.append(el('span', 'gl-label', 'On the exam'), el('p', null, t.exam));
  card.append(exam);
  if (t.cmd) {
    const cmd = el('div', 'gl-cmd');
    cmd.append(el('span', 'gl-label', 'IOS'), el('code', null, t.cmd));
    card.append(cmd);
  }
  const row = el('div', 'gl-actions');
  if (onOpenBranch) {
    const go = el('button', 'gl-go', `On the map: ${branchName ?? 'its branch'}`);
    go.type = 'button';
    go.addEventListener('click', () => { closeTermCard(); onOpenBranch(t.branch); });
    row.append(go);
  }
  if (onOpenGlossary) {
    const all = el('button', 'gl-all', 'Glossary');
    all.type = 'button';
    all.addEventListener('click', () => { closeTermCard(); onOpenGlossary(t.id); });
    row.append(all);
  }
  card.append(row);
  layer.append(scrim, card);
  document.body.append(layer);
  openCard = layer;
  close.focus({ preventScroll: true });
}

// installGlossary(root, getHooks): links terms as screens render and opens a
// term's card on tap. getHooks() is asked at tap time, so the host can leave
// out the navigation buttons while a ticket or lab is open:
// { branchName(id), onOpenBranch(id), onOpenGlossary(termId) }.
export function installGlossary(root, getHooks = () => ({})) {
  let pending = false;
  const sweep = () => { pending = false; linkWithin(root); };
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(sweep);
  });
  observer.observe(root, { childList: true, subtree: true });
  sweep();
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('.gl-term');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const id = b.dataset.term;
    const t = TERM_BY_ID.get(id);
    const hooks = getHooks() ?? {};
    showTermCard(id, { ...hooks, branchName: t ? hooks.branchName?.(t.branch) : undefined });
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openCard) closeTermCard(); });
  return () => observer.disconnect();
}
