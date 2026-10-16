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
  recordKnowCheck, recordTreeExam, recordFinal, recordLab, recordDesk, recordCapstone, deskLights, newlyLit, markSeen, nextStep,
  EXAM_PASS, KNOW_CHECK_SIZE, TREE_EXAM_SIZE, FINAL_SIZE,
} from './progress.js';
import { codeForRecipe } from '../study/hub.js';
import { labsForBranch } from '../labs/catalog.js';
import { createLabScreen } from '../labs/screen.js';
import { createDesk } from '../desk/screen.js';
import { TEMPLATES } from '../desk/jobs.js';
import { repairFor } from '../desk/jobs-repair.js';
import { WLC_TEMPLATES } from '../wlc/model.js';
import { createWlcScreen } from '../wlc/screen.js';
import { JSON_TEMPLATES } from '../json/work.js';
import { createJsonScreen } from '../json/screen.js';
import { createSandbox } from '../sandbox/screen.js';
import { capstoneFor } from '../capstone/capstones.js';

// Work orders that run in their own screen rather than on consoles.
const EXTRA_ORDERS = [...WLC_TEMPLATES, ...JSON_TEMPLATES];
import { suggestedStage, STAGE_LABEL } from '../labs/coach.js';
import { GLOSSARY, TERM_BY_ID, searchGlossary } from '../glossary/terms.js';

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
// home: when the map is the app's home screen, the host passes the dock's
// actions ({ onExam, onGlossary, onProgress, onMore, getActiveTicket,
// onContinue, banners }) and the map opens on the tree of the next step.
export function createSkillMap({ getCompletedRuns, onExit, onLaunch, onQuiz, home = null } = {}) {
  const root = el('main', `skillmap${home ? ' is-home' : ''}`);
  let record = load();
  let storageError = '';
  const ui = { view: 'map', treeId: null, branchId: null, labEl: null, deskEl: null, scrollNext: false, query: '', treeFilter: 'all', openTerm: null, back: null };

  const runs = () => (getCompletedRuns?.() ?? []).filter(Boolean);
  const progress = () => mapProgress({ record, completedRuns: runs(), now: Date.now() });

  // Open on the tree being worked, with the next branch in view.
  if (home) {
    const first = nextStep(progress());
    if (first) Object.assign(ui, { view: 'tree', treeId: first.treeId, scrollNext: true });
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); storageError = ''; } catch {
      storageError = 'Progress could not be saved on this device. Keep this tab open to keep it.';
    }
  }

  function quiz(deck, { title, label, result, onFinish, highlight = false }) {
    if (!deck.length) return;
    onQuiz?.({ deck, title, label, result, highlight, onFinish: (score) => { onFinish(score); save(); } });
  }

  function startKnowCheck(branchId) {
    const branch = branchById(branchId);
    const deck = knowCheckDeck(branchId);
    quiz(deck, {
      label: `Know check · ${branch.name}`,
      highlight: true,
      result: ({ right, total }) => (right / total >= 0.8 ? `Know is lit for ${branch.name}.` : right >= 2 ? `Counts as practice. ${Math.ceil(total * 0.8)} of ${total} lights it.` : `Not yet. ${Math.ceil(total * 0.8)} of ${total} lights it; the explanations are the study material.`),
      onFinish: (score) => { record = recordKnowCheck(record, branchId, score); },
    });
  }
  function startTreeExam(treeId) {
    const tree = treeById(treeId);
    const deck = treeExamDeck(treeId);
    quiz(deck, {
      label: `Tree quiz · ${tree.name}`,
      result: ({ pct }) => (pct >= EXAM_PASS * 100 ? `Passed. Every branch it covered lights Know. The capstone crowns ${tree.name}.` : `${Math.round(EXAM_PASS * 100)}% passes. Light more of the tree's branches, then try again.`),
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

  function openLab(lab, branch, stage = null) {
    const suggested = suggestedStage(record.labs?.[lab.id]);
    ui.labEl = createLabScreen({
      lab,
      branchName: branch.name,
      stage: stage ?? suggested,
      suggested,
      onFinish: (result) => { record = recordLab(record, lab.id, result); save(); },
      onRestart: (next) => openLab(lab, branch, next),
      onExit: () => { ui.labEl = null; ui.view = 'tree'; draw(); window.scrollTo?.(0, 0); },
    });
    ui.view = 'lab';
    draw();
    window.scrollTo?.(0, 0);
  }

  // The Field desk: build work orders, learning or against the clock.
  function openDesk(start = null) {
    ui.deskEl?.destroy?.();
    ui.deskEl = createDesk({
      start,
      getRecord: () => record,
      onRecord: (r) => { record = recordDesk(record, r); save(); },
      onWlc: (kind, mode) => openWlc(kind, mode, () => openDesk()),
      onSandbox: (id) => openSandbox(id, () => openDesk()),
      onExit: () => { ui.deskEl?.destroy?.(); ui.deskEl = null; ui.view = ui.back === 'tree' ? 'tree' : 'map'; draw(); window.scrollTo?.(0, 0); },
    });
    if (ui.view !== 'desk') ui.back = ui.view === 'tree' ? 'tree' : 'map';
    ui.view = 'desk';
    draw();
    window.scrollTo?.(0, 0);
  }

  const freshSeed = () => Math.floor(Math.random() * 1e9) + 1;
  // A first run of a tier works in Learning; once practiced, in Sim.
  const modeFor = (lit) => (lit?.state ? 'sim' : 'learn');

  // Fix: a Field desk repair ticket whose fault exercises this branch. The
  // older Field's tickets remain only for branches the desk cannot cover.
  function startTicket(branch) {
    const r = repairFor(branch.id, freshSeed());
    if (r) { openDesk({ ...r, mode: modeFor(record.deskFix?.[branch.id]) }); return; }
    const code = codeForRecipe(branch.recipes[Math.floor(Math.random() * branch.recipes.length)]);
    if (code) onLaunch?.(code);
  }

  const ordersFor = (branchId) => [...TEMPLATES, ...EXTRA_ORDERS].filter(t => !t.kind.startsWith('repair') && t.lights.includes(branchId));
  function startOrder(branchId, kind = null) {
    const t = kind ? [...TEMPLATES, ...EXTRA_ORDERS].find(x => x.kind === kind) : ordersFor(branchId)[0];
    if (!t) return;
    const mode = modeFor(record.deskDo?.[branchId]);
    if (EXTRA_ORDERS.includes(t)) openWlc(t.kind, mode); else openDesk({ kind: t.kind, seed: freshSeed(), mode });
  }

  // A tree's capstone: the desk in capstone mode, or for Automation the API
  // work order as a sim, which crowns at 100 with no help.
  function startCapstone(treeId) {
    const cap = capstoneFor(treeId);
    if (!cap) {
      ui.deskEl?.destroy?.();
      ui.back = 'tree';
      ui.deskEl = createJsonScreen({
        kind: 'json-api', seed: freshSeed(), mode: 'sim',
        onRecord: (r) => { record = recordDesk(record, r); record = recordCapstone(record, treeId, { passed: r.pct === 100 && !r.helped, got: Math.round(r.pct / 25), total: 4 }); save(); },
        onExit: () => { ui.deskEl?.destroy?.(); ui.deskEl = null; ui.view = 'tree'; draw(); window.scrollTo?.(0, 0); },
      });
      ui.view = 'desk';
      draw();
      window.scrollTo?.(0, 0);
      return;
    }
    ui.deskEl?.destroy?.();
    ui.back = 'tree';
    ui.deskEl = createDesk({
      start: { kind: cap.kind, seed: freshSeed(), mode: 'capstone' },
      getRecord: () => record,
      onRecord: (r) => { record = recordCapstone(record, treeId, r); save(); },
      onExit: () => { ui.deskEl?.destroy?.(); ui.deskEl = null; ui.view = 'tree'; draw(); window.scrollTo?.(0, 0); },
    });
    ui.view = 'desk';
    draw();
    window.scrollTo?.(0, 0);
  }

  // The sandbox: free practice on a prebuilt network, saved as you go.
  function openSandbox(id, returnTo = null) {
    ui.deskEl?.destroy?.();
    if (ui.view !== 'desk') ui.back = ui.view === 'tree' ? 'tree' : 'map';
    ui.deskEl = createSandbox({
      id,
      onExit: () => {
        ui.deskEl?.destroy?.(); ui.deskEl = null;
        if (returnTo) { returnTo(); return; }
        ui.view = ui.back === 'tree' ? 'tree' : 'map'; draw(); window.scrollTo?.(0, 0);
      },
    });
    ui.view = 'desk';
    draw();
    window.scrollTo?.(0, 0);
  }

  // The wireless controller's GUI and the API workspace run in the desk's frame.
  function openWlc(kind, mode = 'learn', returnTo = null) {
    ui.deskEl?.destroy?.();
    if (ui.view !== 'desk') ui.back = ui.view === 'tree' ? 'tree' : 'map';
    const make = kind.startsWith('json') ? createJsonScreen : createWlcScreen;
    ui.deskEl = make({
      kind, seed: freshSeed(), mode,
      onRecord: (r) => { record = recordDesk(record, r); save(); },
      onExit: () => {
        ui.deskEl?.destroy?.(); ui.deskEl = null;
        if (returnTo) { returnTo(); return; }
        ui.view = ui.back === 'tree' ? 'tree' : 'map'; draw(); window.scrollTo?.(0, 0);
      },
    });
    ui.view = 'desk';
    draw();
    window.scrollTo?.(0, 0);
  }

  // The dock's Next: run the step itself, one tap from the map.
  function runStep(step) {
    if (!step) { startFinal(); return; }
    const branch = branchById(step.branchId);
    if (step.tier === 'know') startKnowCheck(branch.id);
    else if (step.tier === 'do') {
      const labs = labsForBranch(branch.id);
      const lab = labs.find(l => record.labs?.[l.id]?.state !== 'mastered');
      if (lab) openLab(lab, branch);
      else if (ordersFor(branch.id).length) startOrder(branch.id);
      else if (labs[0]) openLab(labs[0], branch);
    } else startTicket(branch);
  }

  const ICON = {
    exam: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
    glossary: 'M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h9',
    progress: 'M5 20V12M10 20V6M15 20V10M20 20V4',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    field: 'M4 5h6v4H4zM14 5h6v4h-6zM9 15h6v4H9zM7 9v3h10V9M12 12v3',
  };
  function icon(name) {
    const i = svg('svg', { viewBox: '0 0 24 24', class: 'sk-dock-icon', 'aria-hidden': 'true' });
    i.append(svg('path', { d: ICON[name] }));
    return i;
  }

  // ---------- the glossary ----------
  function drawGlossary() {
    const top = el('header', 'sk-top');
    top.append(btn('sk-back', ui.back === 'tree' ? 'Tree' : 'Map', () => go(ui.back === 'tree' ? 'tree' : 'map', { openTerm: null })));
    const title = el('div', 'sk-title');
    title.append(el('span', 'sk-kicker', `${GLOSSARY.length} terms`));
    title.append(el('h1', null, 'Glossary'));
    top.append(title);
    if (home?.onReference) top.append(btn('sk-back sk-ref', 'Commands', () => home.onReference()));
    root.append(top);

    const search = el('input', 'gl-search');
    search.type = 'search';
    search.placeholder = 'Search terms, like trunk or 802.1Q';
    search.setAttribute('aria-label', 'Search the glossary');
    search.value = ui.query;
    root.append(search);

    const filters = el('div', 'gl-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Tree');
    for (const [id, label] of [['all', 'All'], ...CCNA_MAP.trees.map(t => [t.id, t.num === 0 ? 'IOS' : pad2(t.num)])]) {
      const f = btn(`gl-filter${ui.treeFilter === id ? ' is-on' : ''}`, label, () => { ui.treeFilter = id; drawList(); filters.querySelectorAll('.gl-filter').forEach(x => x.classList.toggle('is-on', x === f)); });
      f.setAttribute('aria-pressed', String(ui.treeFilter === id));
      filters.append(f);
    }
    root.append(filters);

    const list = el('ul', 'gl-list');
    root.append(list);
    function drawList() {
      list.textContent = '';
      const terms = searchGlossary(ui.query).filter(t => ui.treeFilter === 'all' || t.branch.startsWith(`${ui.treeFilter}-`));
      if (!terms.length) list.append(el('li', 'gl-empty', 'No term matches. Try a shorter word.'));
      for (const t of terms) {
        const open = ui.openTerm === t.id;
        const li = el('li', `gl-item${open ? ' is-open' : ''}`);
        li.dataset.term = t.id;
        const row = btn('gl-row', '', () => { ui.openTerm = open ? null : t.id; drawList(); });
        row.setAttribute('aria-expanded', String(open));
        row.append(el('span', 'gl-row-name', t.term), el('span', 'gl-row-plain', t.plain));
        li.append(row);
        if (open) {
          const more = el('div', 'gl-more');
          const exam = el('div', 'gl-exam');
          exam.append(el('span', 'gl-label', 'On the exam'), el('p', null, t.exam));
          more.append(exam);
          if (t.cmd) {
            const cmd = el('div', 'gl-cmd');
            cmd.append(el('span', 'gl-label', 'IOS'), el('code', null, t.cmd));
            more.append(cmd);
          }
          const b = branchById(t.branch);
          if (b) more.append(btn('gl-go', `On the map: ${b.name}`, () => openBranch(b.id)));
          li.append(more);
        }
        list.append(li);
      }
    }
    search.addEventListener('input', () => { ui.query = search.value; ui.openTerm = null; drawList(); });
    drawList();
    if (ui.openTerm) requestAnimationFrame(() => list.querySelector('.gl-item.is-open')?.scrollIntoView?.({ block: 'center' }));
  }

  function openBranch(branchId) {
    const b = branchById(branchId);
    if (!b) return;
    const tree = CCNA_MAP.trees.find(t => t.branches.some(x => x.id === branchId));
    go('tree', { treeId: tree.id, branchId: b.id });
    window.scrollTo?.(0, 0);
  }

  function openGlossary(termId = null) {
    const t = termId ? TERM_BY_ID.get(termId) : null;
    if (ui.view !== 'glossary') ui.back = ui.view === 'tree' ? 'tree' : 'map';
    Object.assign(ui, { view: 'glossary', branchId: null, openTerm: t?.id ?? null, query: t ? '' : ui.query, treeFilter: t ? 'all' : ui.treeFilter });
    draw();
    if (!t) window.scrollTo?.(0, 0);
  }

  function drawDock(p) {
    const dock = el('nav', 'sk-dock');
    dock.setAttribute('aria-label', 'Main');
    const ticket = home.getActiveTicket?.();
    const step = nextStep(p);
    const go = btn('sk-dock-next', '', () => (ticket ? home.onContinue?.() : runStep(step)));
    const lead = !step ? '' : step.reason === 'relight' ? 'Relight' : step.reason === 'stretch' ? 'Stretch' : 'Next';
    const kicker = ticket ? 'Open ticket' : !step ? 'Map lit' : `${lead} · ${TIER_LABEL[step.tier]}`;
    const what = ticket ? 'Continue it' : !step ? 'Take the final' : branchById(step.branchId).name;
    go.setAttribute('aria-label', ticket ? 'Continue your open ticket' : !step ? 'Take the final' : `${lead}: ${what}, ${TIER_LABEL[step.tier]}`);
    go.append(el('span', 'sk-dock-kicker', kicker), el('span', 'sk-dock-what', what));
    dock.append(go);
    for (const [name, label, fn] of [['field', 'Field', () => openDesk()], ['exam', 'Exam', home.onExam], ['glossary', 'Glossary', () => openGlossary()], ['progress', 'Progress', home.onProgress], ['more', 'More', home.onMore]]) {
      const b = btn(`sk-dock-btn is-${name}`, '', () => fn?.());
      b.append(icon(name), el('span', null, label));
      dock.append(b);
    }
    root.append(dock);
  }

  // Lights that came on since the last look run their pulse once.
  function takeNew(p) {
    const fresh = newlyLit(p, record);
    if (fresh.length) setTimeout(() => { record = markSeen(record, fresh); save(); }, 1600);
    return new Set(fresh);
  }

  function drawMap(p, fresh) {
    const top = el('header', 'sk-top');
    if (!home) top.append(btn('sk-back', 'Home', () => onExit?.()));
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
    const next = home ? nextStep(p) : null;
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
      const isNext = next?.branchId === b.id;
      const li = el('li', `sk-branch is-${s.readiness}${s.started ? ' is-started' : ''}${isNext ? ' is-next' : ''}`);
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
      const tag = el('span', 'sk-tag', isNext ? 'NEXT' : s.readiness === 'done' ? 'DONE' : s.readiness === 'ready' ? 'READY' : 'HARDER');
      row.append(port, body, tag);
      li.append(row);
      spine.append(li);
      if (isNext && ui.scrollNext) { ui.scrollNext = false; requestAnimationFrame(() => li.scrollIntoView?.({ block: 'center' })); }
    });
    root.append(spine);

    // The capstone crowns the tree: a CLI build tested only on outcomes.
    const cap = capstoneFor(tree.id);
    const capRow = el('section', `sk-final sk-capstone${t.crowned ? ' is-passed' : ''}`);
    const ctext = el('div', 'sk-final-text');
    ctext.append(el('b', null, t.crowned ? 'Capstone · crowned' : 'Capstone'));
    const past = t.capstone;
    const what = cap ? cap.title : 'The API work order, as a sim, no help';
    ctext.append(el('span', null, `${what}. ${past ? (past.passed ? 'Passed. ' : `Last run ${past.last?.got ?? past.got} of ${past.last?.total ?? past.total}. `) : ''}No ticks, no hints: the network is tested when you submit, and every goal must hold.`));
    capRow.append(ctext, btn('sk-go', past?.passed ? 'Build it again' : 'Start', () => startCapstone(tree.id)));
    root.append(capRow);

    const knowLit = t.branches.filter(b => b.tiers.know.state === 'mastered').length;
    const exam = el('section', 'sk-final sk-quiz');
    const text = el('div', 'sk-final-text');
    text.append(el('b', null, 'Tree quiz'));
    const note = t.exam ? `Best ${t.exam.right}/${t.exam.total}${t.exam.passed ? ', passed' : ''}. ` : '';
    const warn = knowLit < t.branches.length / 2 ? 'Likely too hard yet; passing anyway lights Know on what it covers.' : `${TREE_EXAM_SIZE} questions, ${Math.round(EXAM_PASS * 100)}% lights Know on every branch it covers.`;
    text.append(el('span', null, note + warn));
    exam.append(text, btn('sk-go ghost', 'Take it', () => startTreeExam(tree.id)));
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
    // Terms not already named in the topics above, so nothing shows twice.
    const named = b.topics.join(' ').toLowerCase();
    const words = GLOSSARY.filter(x => x.branch === b.id && !named.includes(x.term.toLowerCase()));
    if (words.length) {
      const chips = el('div', 'sk-terms');
      chips.append(el('span', 'sk-terms-label', 'Terms'));
      for (const w of words) chips.append(btn('sk-term', w.term, () => openGlossary(w.id)));
      sheet.append(chips);
    }

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
      } else if (tier === 'fix' && (deskLights(b.id, 'fix') || b.recipes?.length)) {
        row.append(btn('sk-go sk-go-small', 'Start a ticket', () => startTicket(b)));
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
          const nextStage = suggestedStage(res);
          const done = res?.stages ? Object.keys(res.stages).map(k => STAGE_LABEL[k]).join(', ') : '';
          words.append(el('span', null, res ? (res.state === 'mastered' ? 'Passed clean, typed' : `Done: ${done}`) : `${lab.goals.length} goals on ${lab.devices.length} ${lab.devices.length === 1 ? 'device' : 'devices'}`));
          lrow.append(words, btn('sk-go sk-go-small', res?.state === 'mastered' ? 'Run again' : `Start · ${STAGE_LABEL[nextStage]}`, () => openLab(lab, b)));
          sheet.append(lrow);
        }
        // Field desk work orders that exercise this branch, new every time.
        for (const t of ordersFor(b.id)) {
          const past = record.desk?.[t.kind];
          const lrow = el('div', `sk-lab is-order${past?.bestSim === 100 ? ' is-mastered' : past ? ' is-practiced' : ''}`);
          const words = el('div', 'sk-tier-text');
          words.append(el('b', null, t.title));
          words.append(el('span', null, past ? `Work order · best ${past.best}%${past.bestSim !== null && past.bestSim !== undefined ? `, sim ${past.bestSim}%` : ''}` : `Work order · about ${t.minutes} min, new each time`));
          lrow.append(words, btn('sk-go sk-go-small', 'Open', () => startOrder(b.id, t.kind)));
          sheet.append(lrow);
        }
      }
    }
    root.append(scrim, sheet);
  }

  function draw() {
    root.textContent = '';
    if (ui.view === 'lab' && ui.labEl) { root.classList.add('is-lab'); root.append(ui.labEl); return; }
    if (ui.view === 'desk' && ui.deskEl) { root.classList.add('is-lab', 'is-desk'); root.append(ui.deskEl); return; }
    root.classList.remove('is-lab', 'is-desk');
    const p = progress();
    const fresh = takeNew(p);
    for (const banner of home?.banners?.() ?? []) root.append(banner);
    if (ui.view === 'glossary') drawGlossary();
    else if (ui.view === 'tree' && ui.treeId) drawTree(p, fresh);
    else drawMap(p, fresh);
    if (storageError) root.append(el('p', 'sk-error', storageError));
    if (home) drawDock(p);
  }

  draw();
  root.refresh = () => { record = load(); draw(); };
  root.openGlossary = openGlossary;
  root.openBranch = openBranch;
  root.busy = () => ui.view === 'lab' || ui.view === 'desk';
  root.openDesk = openDesk;
  // Run one tier of one branch, the way the dock's Next does.
  root.runStep = (step) => runStep(step);
  return root;
}
