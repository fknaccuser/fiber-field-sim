import { ISSUES, ISSUE_CATEGORIES, searchIssues, choicesFor, gradeIssue, liveCodeFor } from './issues.js';

const STORAGE_KEY = 'field-issue-progress-v1';
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const button = (text, handler) => { const node = el('button', '', text); node.type = 'button'; node.addEventListener('click', handler); return node; };

export function createIssueLibrary({ onExit, onLaunch } = {}) {
  const root = el('main', 'issue-library');
  let progress = {}, query = '', category = '', grouping = '', liveOnly = false, selected = null, page = 0, variation = 0, storageError = '';
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (saved && typeof saved === 'object') for (const issue of ISSUES) {
      const item = saved[issue.id]; if (item && typeof item === 'object' && typeof item.passed === 'boolean') progress[issue.id] = { passed: item.passed, independent: item.independent === true };
    }
  } catch { storageError = 'Practice history could not be loaded. You can still investigate cases.'; }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); storageError = ''; } catch { storageError = 'History could not be saved. Keep this tab open to retain this session.'; } }
  function render() {
    root.replaceChildren();
    const header = el('header', 'issue-header');
    const copy = el('div'); copy.append(el('span', 'eyebrow', 'FIELD / ISSUE LIBRARY'), el('h1', '', selected ? 'Investigate a work order' : 'Build your troubleshooting range.'));
    header.append(copy, button(selected ? 'Back to issues' : 'Back to training', () => { if (selected) { selected = null; render(); } else onExit?.(); })); root.append(header);
    if (storageError) { const error = el('p', 'form-error', storageError); error.setAttribute('role', 'status'); root.append(error); }
    if (selected) { renderCase(selected); return; }
    root.append(el('p', 'issue-intro', `${ISSUES.length} distinct issues · ${ISSUES.filter(i => i.recipeId).length} live fault types · ${Object.values(progress).filter(p => p.passed).length} case studies completed. Case studies exercise diagnosis using authored evidence; live labs run the network simulator. Common and rare are curriculum groupings, not measured incident rates.`));
    const filters = el('div', 'issue-filters');
    const search = el('input'); search.type = 'search'; search.placeholder = 'Search DNS, fiber, DHCP…'; search.setAttribute('aria-label', 'Search issues'); search.value = query;
    search.addEventListener('input', () => { query = search.value; page = 0; renderResults(); }); filters.append(search);
    function select(label, values, current, set) { const field = el('label', 'issue-filter'); field.append(el('span', '', label)); const input = el('select'); input.setAttribute('aria-label', label); for (const [value, title] of values) { const option = el('option', '', title); option.value = value; input.append(option); } input.value = current; input.addEventListener('change', () => { set(input.value); page = 0; renderResults(); }); field.append(input); filters.append(field); }
    select('Category', [['', 'All categories'], ...ISSUE_CATEGORIES.map(c => [c, c])], category, v => category = v);
    select('Difficulty', [['', 'All levels'], ...['Foundational', 'Common', 'Rare'].map(c => [c, c])], grouping, v => grouping = v);
    const live = el('label', 'issue-filter-check'); const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = liveOnly; checkbox.addEventListener('change', () => { liveOnly = checkbox.checked; page = 0; renderResults(); }); live.append(checkbox, 'Live labs only'); filters.append(live);
    filters.append(button('Recommend a case', () => { const pool = searchIssues({ query, category, grouping, liveOnly }); const next = [...pool].sort((a, b) => Number(Boolean(progress[a.id]?.passed)) - Number(Boolean(progress[b.id]?.passed)) || a.difficulty - b.difficulty)[0]; if (next) { selected = next; render(); } }));
    filters.append(button('Mixed console challenge', () => onLaunch?.(`TF1-BR-4-M-ISSUEMIX${variation++}`)));
    filters.append(button('Export issue database', () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: 'field-issues-1', issues: ISSUES }, null, 2)], { type: 'application/json' })); const link = el('a'); link.href = url; link.download = 'field-issues-v1.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }));
    root.append(filters);
    const results = el('div', 'issue-results'); root.append(results);
    function renderResults() {
      results.replaceChildren(); const matches = searchIssues({ query, category, grouping, liveOnly });
      const count = el('p', 'issue-count', `${matches.length} matching issues`); count.setAttribute('role', 'status'); results.append(count);
      const grid = el('div', 'issue-grid');
      for (const issue of matches.slice(page * 20, (page + 1) * 20)) {
        const card = el('article', 'issue-card'); card.append(el('span', 'issue-category', `${issue.id} · ${issue.category}`), el('h2', '', issue.title), el('p', '', issue.symptom), el('span', 'issue-badge', `${issue.grouping} · ${issue.format}${progress[issue.id]?.passed ? ' · Practiced' : ''}`), button('Investigate', () => { selected = issue; render(); })); grid.append(card);
      }
      if (!matches.length) grid.append(el('p', '', 'No issues match these filters. Try a broader search.'));
      results.append(grid);
      const pager = el('nav', 'issue-pager'); pager.setAttribute('aria-label', 'Issue pages'); const prev = button('Previous', () => { page--; renderResults(); }); prev.disabled = page === 0; const next = button('Next', () => { page++; renderResults(); }); next.disabled = (page + 1) * 20 >= matches.length;
      pager.append(prev, el('span', '', `Page ${page + 1} of ${Math.max(1, Math.ceil(matches.length / 20))}`), next); results.append(pager);
    }
    renderResults();
  }
  function renderCase(issue) {
    let evidenceRead = false, revealed = false;
    const ticket = el('section', 'issue-ticket'); ticket.append(el('span', 'issue-badge', `${issue.id} · ${issue.category} · ${issue.grouping}`), el('h2', '', 'Customer report'), el('p', 'issue-symptom', issue.symptom));
    ticket.append(el('p', '', `Prerequisites: ${issue.prerequisites.join(' · ')}`));
    if (issue.recipeId) {
      const launch = el('div', 'issue-live-launch'); launch.append(el('strong', '', 'Also available as a live repair lab'));
      const tier = el('select'); tier.setAttribute('aria-label', 'Live lab level'); for (const [value, text] of [[1, '1 · Guided'], [2, '2 · Console practice'], [3, '3 · Console only']]) { const option = el('option', '', text); option.value = value; tier.append(option); }
      launch.append(tier, button('Launch live lab', () => { try { onLaunch?.(liveCodeFor(issue.id, +tier.value, variation++)); } catch (error) { result.textContent = error.message; } })); ticket.append(launch);
    } else ticket.append(el('p', 'console-bridge', 'Diagnostic case study: reason from collected evidence. This issue does not yet have a live network simulation.'));
    const evidence = el('details', 'issue-evidence'); const summary = el('summary', '', '1 · Inspect the collected evidence'); evidence.append(summary, el('p', '', issue.evidence)); evidence.addEventListener('toggle', () => { if (evidence.open) evidenceRead = true; }); ticket.append(evidence);
    const form = el('form', 'issue-answer');
    function question(field, title) { const label = el('label'); label.append(el('strong', '', title)); const select = el('select'); select.setAttribute('aria-label', title); select.required = true; const placeholder = el('option', '', 'Choose based on the evidence'); placeholder.value = ''; select.append(placeholder); for (const other of choicesFor(issue, field)) { const option = el('option', '', other[field]); option.value = other.id; select.append(option); } label.append(select); form.append(label); return select; }
    const repair = question('repair', '2 · Choose the repair'); const verification = question('verification', '3 · Choose the verification');
    const noteLabel = el('label'); noteLabel.append(el('strong', '', '4 · Explain the evidence behind your decision')); const note = el('textarea'); note.minLength = 20; note.maxLength = 500; note.required = true; note.rows = 3; note.setAttribute('aria-label', 'Evidence note'); note.placeholder = 'Connect an observation to your repair, then describe how you will prove it worked.'; noteLabel.append(note); form.append(noteLabel);
    const submit = el('button', '', 'Check investigation'); submit.type = 'submit'; form.append(submit); const result = el('p', 'issue-result'); result.setAttribute('role', 'status');
    const solution = el('details', 'issue-solution'); solution.append(el('summary', '', 'Show the worked diagnosis'), el('h3', '', issue.title), el('p', '', issue.repair), el('p', '', `Verify: ${issue.verification}`)); solution.addEventListener('toggle', () => { if (solution.open) revealed = true; });
    form.addEventListener('submit', event => {
      event.preventDefault(); const grade = gradeIssue(issue, { repairId: repair.value, verificationId: verification.value, note: note.value, evidenceRead, revealed });
      if (grade.passed) { progress[issue.id] = { passed: true, independent: progress[issue.id]?.independent || grade.independent }; save(); result.textContent = `Investigation complete${revealed ? ' with the worked diagnosis' : ''}. Your repair and verification match this case. Notes are saved only in this session and are not automatically evaluated for technical correctness.${storageError ? ' ' + storageError : ' Practice completion saved on this device.'}`; }
      else result.textContent = !grade.checks.evidence ? 'Open the collected evidence before making a decision.' : !grade.checks.repair ? 'That repair does not address the evidence in this case. Compare the affected layer and scope.' : !grade.checks.verification ? 'Choose a verification that proves the reported service is restored.' : 'Add a 20–500 character explanation of your evidence.';
    });
    ticket.append(form, result, solution); root.append(ticket);
  }
  render(); return root;
}
