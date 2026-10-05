// The skill map screen: seven trees as a lit fiber network.
//
// Three zoom levels. The map shows the IOS trunk in the middle and the six
// domain trees around it, each strand glowing with that tree's progress. A
// tree opens as a spine of branches with three lights each (Know, Do, Fix).
// A branch opens a panel with what it covers and how to light each tier.
//
// Owns its state like exam prep does: the record lives in localStorage behind
// try/catch, Fix lights are read from the profile's tickets, and quizzes are
// handed to the host through onQuiz so they reuse the exam prep screens.

import { CCNA_MAP, TIERS, treeById, branchById } from './ccna.js';
import {
  emptyRecord, normalizeRecord, mapProgress, knowCheckDeck, treeExamDeck, finalDeck,
  recordKnowCheck, recordTreeExam, recordFinal, recordLab, newlyLit, markSeen,
  EXAM_PASS, KNOW_CHECK_SIZE, TREE_EXAM_SIZE, FINAL_SIZE,
} from './progress.js';
import { codeForRecipe } from '../study/hub.js';
import { labsForBranch } from '../labs/catalog.js';
import { createLabScreen } from '../labs/screen.js';

export const STORAGE_KEY = 'field-skill-tree-v1';
const SVG = 'http://www.w3.org/2000/svg';
const TIER_LABEL = { know: 'Know', do: 'Do', fix: 'Fix' };
const TIER_LETTER = { know: 'K', do: 'D', fix: 'F' };

function load() {
  try { return normalizeRecord(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')); } catch { return emptyRecord(); }
}

// What the home screen shows, read without opening the map.
export function skillMapSnapshot(completedRuns = [], now = Date.now()) {
  const record = load();
  const progress = mapProgress({ record, completedRuns: completedRuns.filter(Boolean), now });
  return { progress, newCount: newlyLit(progress, record).length };
}

// ---------- small builders ----------
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function btn(cls, text, onClick) {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
function svg(tag, attrs = {}) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
const pad2 = (n) => String(n).padStart(2, '0');
const ratio = (t) => (t.possible ? t.lights / t.possible : 0);

// ---------- the constellation (also used small on the home screen) ----------
const CX = 180, CY = 186, RADIUS = 128;
function treePositions() {
  const outer = CCNA_MAP.trees.filter(t => t.num > 0);
  const pos = { t0: { x: CX, y: CY, r: 30 } };
  outer.forEach((t, i) => {
    const a = (-90 + i * (360 / outer.length)) * (Math.PI / 180);
    pos[t.id] = { x: CX + RADIUS * Math.cos(a), y: CY + RADIUS * Math.sin(a), r: 16 + t.weight * 0.7 };
  });
  return pos;
}

export function renderConstellation(progress, { interactive = false, onOpenTree, burst = new Set(), labels = true } = {}) {
  const pos = treePositions();
  const root = svg('svg', { viewBox: '0 -10 360 400', class: 'sk-constellation', role: interactive ? 'group' : 'img' });
  root.setAttribute('aria-label', interactive ? 'Skill map: seven trees' : `Skill map, ${progress.lights} of ${progress.possible} lights on`);
  root.append(svg('circle', { cx: CX, cy: CY, r: RADIUS, class: 'sk-orbit' }));
  root.append(svg('circle', { cx: CX, cy: CY, r: RADIUS * 0.55, class: 'sk-orbit sk-orbit-inner' }));
  const strands = svg('g', { class: 'sk-strands' });
  const nodes = svg('g', { class: 'sk-nodes' });
  const byId = Object.fromEntries(progress.trees.map(t => [t.id, t]));

  CCNA_MAP.trees.forEach((tree, i) => {
    const p = pos[tree.id];
    const t = byId[tree.id];
    const share = ratio(t);
    if (tree.num > 0) {
      // A strand bends slightly, like a fiber laid by hand.
      const mx = (CX + p.x) / 2 + (p.y - CY) * 0.12, my = (CY + p.y) / 2 - (p.x - CX) * 0.12;
      const d = `M${CX} ${CY}Q${mx.toFixed(1)} ${my.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      strands.append(svg('path', { d, class: 'sk-strand' }));
      if (share > 0) {
        const lit = svg('path', { d, class: 'sk-strand-lit' });
        lit.style.opacity = String(0.25 + 0.75 * share);
        strands.append(lit);
        const pulse = svg('path', { d, class: `sk-pulse${burst.has(tree.id) ? ' is-burst' : ''}`, pathLength: '100' });
        pulse.style.animationDelay = `${(i * 0.7).toFixed(1)}s`;
        strands.append(pulse);
      }
    }
    const g = svg('g', { class: `sk-node${t.crowned ? ' is-crowned' : ''}${t.complete ? ' is-complete' : ''}`, transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})` });
    if (interactive) {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `${tree.name}: ${t.lights} of ${t.possible} lights${t.crowned ? ', exam passed' : ''}`);
      g.dataset.tree = tree.id;
      const open = () => onOpenTree?.(tree.id);
      g.addEventListener('click', open);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
    if (t.crowned) g.append(svg('circle', { r: p.r + 11, class: 'sk-crown' }));
    g.append(svg('circle', { r: p.r + 5, class: 'sk-ring-track' }));
    const circ = 2 * Math.PI * (p.r + 5);
    const ring = svg('circle', { r: p.r + 5, class: 'sk-ring', 'stroke-dasharray': `${(circ * share).toFixed(1)} ${circ.toFixed(1)}`, transform: 'rotate(-90)' });
    g.append(ring);
    g.append(svg('circle', { r: p.r, class: 'sk-core' }));
    const num = svg('text', { class: 'sk-num', y: tree.num === 0 ? -3 : 4, 'text-anchor': 'middle' });
    num.textContent = tree.num === 0 ? 'IOS' : pad2(tree.num);
    g.append(num);
    if (tree.num === 0) {
      const sub = svg('text', { class: 'sk-sub', y: 11, 'text-anchor': 'middle' });
      sub.textContent = 'TRUNK';
      g.append(sub);
    }
    if (labels && tree.num > 0) {
      // Labels sit on the outer side of each node, clear of its strand.
      const above = p.y < CY - 1;
      const name = svg('text', { class: 'sk-label', y: above ? -(p.r + 24) : p.r + 22, 'text-anchor': 'middle' });
      name.textContent = tree.short.toUpperCase();
      g.append(name);
      const count = svg('text', { class: 'sk-count', y: above ? -(p.r + 11) : p.r + 35, 'text-anchor': 'middle' });
      count.textContent = `${t.lights}/${t.possible}`;
      g.append(count);
    }
    nodes.append(g);
  });
  root.append(strands, nodes);
  return root;
}

// ---------- the screen ----------
export function createSkillMap({ getCompletedRuns, onExit, onLaunch, onQuiz } = {}) {
  const root = el('main', 'skillmap');
  let record = load();
  let storageError = '';
  const ui = { view: 'map', treeId: null, branchId: null, labEl: null };

  const runs = () => (getCompletedRuns?.() ?? []).filter(Boolean);
  const progress = () => mapProgress({ record, completedRuns: runs(), now: Date.now() });
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); storageError = ''; } catch {
      storageError = 'Progress could not be saved on this device. Keep this tab open to keep it.';
    }
  }

  function quiz(deck, { title, label, result, onFinish }) {
    if (!deck.length) return;
    onQuiz?.({ deck, title, label, result, onFinish: (score) => { onFinish(score); save(); } });
  }

  function startKnowCheck(branchId) {
    const branch = branchById(branchId);
    const deck = knowCheckDeck(branchId);
    quiz(deck, {
      label: `Know check · ${branch.name}`,
      result: ({ right, total }) => (right / total >= 0.8 ? `Know is lit for ${branch.name}.` : right >= 2 ? `Counts as practice. ${Math.ceil(total * 0.8)} of ${total} lights it.` : `Not yet. ${Math.ceil(total * 0.8)} of ${total} lights it; the explanations are the study material.`),
      onFinish: (score) => { record = recordKnowCheck(record, branchId, score); },
    });
  }
  function startTreeExam(treeId) {
    const tree = treeById(treeId);
    const deck = treeExamDeck(treeId);
    quiz(deck, {
      label: `Tree exam · ${tree.name}`,
      result: ({ pct }) => (pct >= EXAM_PASS * 100 ? `Passed. ${tree.name} is crowned, and every branch it covered lights Know.` : `${Math.round(EXAM_PASS * 100)}% passes. Light more of the tree's branches, then try again.`),
      onFinish: (score) => { record = recordTreeExam(record, treeId, deck, score); },
    });
  }
  function startFinal() {
    const deck = finalDeck();
    quiz(deck, {
      label: 'The final',
      result: ({ pct }) => (pct >= EXAM_PASS * 100 ? 'Passed the final. That is the whole map, at exam weight.' : `${Math.round(EXAM_PASS * 100)}% passes. The trees with the fewest lights are where the points went.`),
      onFinish: (score) => { record = recordFinal(record, deck, score); },
    });
  }

  function go(view, extra = {}) { Object.assign(ui, { view, ...extra }); draw(); }

  function openLab(lab, branch) {
    ui.labEl = createLabScreen({
      lab,
      branchName: branch.name,
      onFinish: ({ assisted }) => { record = recordLab(record, lab.id, { assisted }); save(); },
      onExit: () => { ui.labEl = null; ui.view = 'tree'; draw(); window.scrollTo?.(0, 0); },
    });
    ui.view = 'lab';
    draw();
    window.scrollTo?.(0, 0);
  }

  // Lights that came on since the last look run their pulse once.
  function takeNew(p) {
    const fresh = newlyLit(p, record);
    if (fresh.length) setTimeout(() => { record = markSeen(record, fresh); save(); }, 1600);
    return new Set(fresh);
  }

  function drawMap(p, fresh) {
    const top = el('header', 'sk-top');
    top.append(btn('sk-back', 'Home', () => onExit?.()));
    const title = el('div', 'sk-title');
    title.append(el('span', 'sk-kicker', CCNA_MAP.title));
    title.append(el('h1', null, 'Skill map'));
    top.append(title);
    const tally = el('div', 'sk-tally');
    tally.append(el('b', null, String(p.lights)), el('span', null, ` / ${p.possible} lights`));
    top.append(tally);
    root.append(top);

    const burstTrees = new Set([...fresh].map(k => k.split(/[-:]/)[0]));
    const stage = el('div', 'sk-stage');
    stage.append(renderConstellation(p, { interactive: true, burst: burstTrees, onOpenTree: (id) => go('tree', { treeId: id, branchId: null }) }));
    root.append(stage);
    root.append(el('p', 'sk-hint', 'Tap a tree. Everything is open; the dim ones are just harder from where you stand.'));

    const finalRow = el('section', `sk-final${p.final?.passed ? ' is-passed' : ''}`);
    const text = el('div', 'sk-final-text');
    text.append(el('b', null, 'The final'));
    text.append(el('span', null, p.final ? `Best ${p.final.right}/${p.final.total}${p.final.passed ? ', passed' : ''}` : `${FINAL_SIZE} questions weighted like the CCNA. ${Math.round(EXAM_PASS * 100)}% passes.`));
    finalRow.append(text, btn('sk-go', 'Take it', startFinal));
    root.append(finalRow);
  }

  function led(tier, state, isNew) {
    const l = el('span', `sk-led is-${state}${isNew ? ' is-new' : ''}`);
    l.setAttribute('aria-hidden', 'true');
    l.textContent = TIER_LETTER[tier];
    return l;
  }

  function drawTree(p, fresh) {
    const tree = treeById(ui.treeId);
    const t = p.trees.find(x => x.id === tree.id);
    const top = el('header', 'sk-top');
    top.append(btn('sk-back', 'Map', () => go('map', { treeId: null, branchId: null })));
    const title = el('div', 'sk-title');
    title.append(el('span', 'sk-kicker', tree.num === 0 ? 'Trunk' : `Tree ${pad2(tree.num)} · ${tree.weight}% of the exam`));
    title.append(el('h1', null, tree.name));
    top.append(title);
    const tally = el('div', 'sk-tally');
    tally.append(el('b', null, String(t.lights)), el('span', null, ` / ${t.possible}`));
    top.append(tally);
    root.append(top);
    root.append(el('p', 'sk-blurb', tree.blurb));

    const spine = el('ol', 'sk-spine');
    tree.branches.forEach((b, i) => {
      const s = t.branches[i];
      const li = el('li', `sk-branch is-${s.readiness}${s.started ? ' is-started' : ''}`);
      const row = btn('sk-branch-row', '', () => { ui.branchId = b.id; draw(); });
      row.setAttribute('aria-label', `${b.name}: ${TIERS.filter(x => b.tiers.includes(x)).map(x => `${TIER_LABEL[x]} ${s.tiers[x].state}`).join(', ')}. ${s.readiness}`);
      const port = el('span', 'sk-port');
      port.setAttribute('aria-hidden', 'true');
      const body = el('span', 'sk-branch-body');
      body.append(el('span', 'sk-branch-name', b.name));
      const leds = el('span', 'sk-leds');
      for (const tier of TIERS) {
        if (!b.tiers.includes(tier)) continue;
        leds.append(led(tier, s.tiers[tier].state, fresh.has(`${b.id}:${tier}`)));
      }
      body.append(leds);
      const tag = el('span', 'sk-tag', s.readiness === 'done' ? 'DONE' : s.readiness === 'ready' ? 'READY' : 'HARDER');
      row.append(port, body, tag);
      li.append(row);
      spine.append(li);
    });
    root.append(spine);

    const knowLit = t.branches.filter(b => b.tiers.know.state === 'mastered').length;
    const exam = el('section', `sk-final${t.crowned ? ' is-passed' : ''}`);
    const text = el('div', 'sk-final-text');
    text.append(el('b', null, 'Tree exam'));
    const note = t.exam ? `Best ${t.exam.right}/${t.exam.total}${t.exam.passed ? ', passed' : ''}. ` : '';
    const warn = knowLit < t.branches.length / 2 ? 'Likely too hard yet; passing anyway lights what it covers.' : `${TREE_EXAM_SIZE} questions, ${Math.round(EXAM_PASS * 100)}% passes.`;
    text.append(el('span', null, note + warn));
    exam.append(text, btn('sk-go', 'Take it', () => startTreeExam(tree.id)));
    root.append(exam);

    if (ui.branchId) drawBranchSheet(p, tree, t);
  }

  function drawBranchSheet(p, tree, t) {
    const b = branchById(ui.branchId);
    const s = t.branches.find(x => x.id === b.id);
    const scrim = btn('sk-scrim', '', () => { ui.branchId = null; draw(); });
    scrim.setAttribute('aria-label', 'Close');
    const sheet = el('section', 'sk-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', b.name);
    const head = el('div', 'sk-sheet-head');
    head.append(el('h2', null, b.name));
    head.append(btn('sk-close', 'Close', () => { ui.branchId = null; draw(); }));
    sheet.append(head);
    const topics = el('ul', 'sk-topics');
    for (const topic of b.topics) topics.append(el('li', null, topic));
    sheet.append(topics);

    if (s.readiness === 'hard') {
      const missing = (b.needs ?? []).map(branchById).filter(n => p.statusById[n.id]?.tiers.know.state !== 'mastered');
      const hint = el('p', 'sk-needs', `Harder from here. It builds on ${missing.map(n => n.name).join(' and ')}. You can still take it.`);
      sheet.append(hint);
    }

    const STATE_TEXT = { mastered: 'Lit', practiced: 'Practiced', faded: 'Faded, take it again to relight', off: 'Not yet', soon: 'Coming soon' };
    for (const tier of TIERS) {
      if (!b.tiers.includes(tier)) continue;
      const st = s.tiers[tier];
      const row = el('div', `sk-tier is-${st.state}`);
      row.append(led(tier, st.state, false));
      const words = el('div', 'sk-tier-text');
      words.append(el('b', null, TIER_LABEL[tier]));
      let detail = STATE_TEXT[st.state] ?? '';
      if (st.state !== 'off' && st.state !== 'soon' && st.fresh < 1 && st.fresh > 0) detail += ', starting to fade';
      words.append(el('span', null, detail));
      row.append(words);
      if (tier === 'know') {
        row.append(btn('sk-go sk-go-small', st.state === 'mastered' ? 'Recheck' : `Check · ${Math.min(KNOW_CHECK_SIZE, s.questions)}`, () => startKnowCheck(b.id)));
      } else if (tier === 'fix' && b.recipes?.length) {
        row.append(btn('sk-go sk-go-small', 'Start a ticket', () => {
          const code = codeForRecipe(b.recipes[Math.floor(Math.random() * b.recipes.length)]);
          if (code) onLaunch?.(code);
        }));
      } else if (st.state === 'soon') {
        row.append(el('span', 'sk-soon', tier === 'do' ? 'Console labs' : 'More tickets'));
      }
      sheet.append(row);
      // Each lab that lights this branch's Do tier, with its own result.
      if (tier === 'do') {
        for (const lab of labsForBranch(b.id)) {
          const res = record.labs?.[lab.id];
          const lrow = el('div', `sk-lab${res ? ` is-${res.state}` : ''}`);
          const words = el('div', 'sk-tier-text');
          words.append(el('b', null, lab.title));
          words.append(el('span', null, res ? (res.state === 'mastered' ? 'Passed clean' : 'Passed with help') : `${lab.goals.length} goals on ${lab.devices.length} ${lab.devices.length === 1 ? 'router' : 'routers'}`));
          lrow.append(words, btn('sk-go sk-go-small', res ? 'Run again' : 'Start lab', () => openLab(lab, b)));
          sheet.append(lrow);
        }
      }
    }
    root.append(scrim, sheet);
  }

  function draw() {
    root.textContent = '';
    if (ui.view === 'lab' && ui.labEl) { root.classList.add('is-lab'); root.append(ui.labEl); return; }
    root.classList.remove('is-lab');
    const p = progress();
    const fresh = takeNew(p);
    if (ui.view === 'tree' && ui.treeId) drawTree(p, fresh);
    else drawMap(p, fresh);
    if (storageError) root.append(el('p', 'sk-error', storageError));
  }

  draw();
  root.refresh = () => { record = load(); draw(); };
  return root;
}
