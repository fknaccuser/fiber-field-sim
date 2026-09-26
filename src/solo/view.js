// Screen rendering for The Field Solo. Touches `document`; engine state
// (app.js) stays DOM-free so it is testable under `node --test`.

import { renderTopology } from './diagram.js';
import { equipmentIcon } from './equipment.js';
import { nextGuidance, trainingMode, showMeAvailable, guidanceOverride } from './guidance.js';
import { walkthroughPosition, checkBlank } from './walkthrough.js';
import { attachMentor, explainDevice, explainPort, explainConcept } from './mentor.js';
import { careerProgress } from './career.js';
import { renderPatchPanel } from './patch-panel.js';
import { conceptsForRecipes } from './study/concepts.js';

const canvasViews = new Map();
const inspectorViews = new Map();
const coachingExpanded = new Map();
let homeMoreOpen = false;
import { terminalSessionFor, currentHintRecipeId, showCauseCount, showHarmlessDetail } from './app.js';
import {
  renderClientForm,
  renderPortForm,
  renderRouterSegmentForm,
  renderDnsRecordForm,
  renderTests,
  renderTerminal,
} from './devices.js';
import {
  CUSTOMER_QUESTIONS,
  CUSTOMER_FACTS,
  HARMLESS_DETAILS,
  HINTS,
  renderHintText,
  TIER_GOAL_MS,
  STUDY_PACK,
  REFERENCE_ENTRIES,
} from './content.js';
import { evaluateCompletion, evaluateConfigureChecklist } from './grade.js';
import { allFamilyStats, recommendedTier } from './progress.js';
import {
  lessonsForFamily,
  lessonById,
  questionsForLesson,
  cardsForLesson,
  answerForQuestion,
  reviewForCard,
  searchReference,
} from './study.js';

function describeSaveStatus(status) {
  switch (status) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Save failed';
    case 'quota':
      return 'Storage is full — not saved';
    default:
      return '';
  }
}

// Shared by Home and the mission header (S19.md: "Quota failures offer
// export rather than false Saved" — retrying the identical write just
// fails again under quota pressure, but Export is a small serialization,
// not a new write, so it still works. UI_AND_STORAGE.md: "show Retry/
// Export, and block closing that mission ... until handled" — the caller
// is responsible for that block; this only renders the prompt).
function renderSaveStatusBanner(state, actions) {
  const container = document.createElement('div');
  const status = describeSaveStatus(state.saveStatus);
  if (status) {
    const line = document.createElement('p');
    line.className = 'home-save-status';
    line.setAttribute('role', 'status');
    line.textContent = status;
    container.appendChild(line);
  }
  if (state.saveStatus === 'error' || state.saveStatus === 'quota') {
    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'home-retry-save';
    retryButton.textContent = 'Retry';
    retryButton.addEventListener('click', () => actions.onRetrySave?.());
    container.appendChild(retryButton);
  }
  if (state.saveStatus === 'quota') {
    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'home-export-button';
    exportButton.textContent = 'Export backup';
    exportButton.addEventListener('click', () => actions.onExportBackup?.());
    container.appendChild(exportButton);
  }
  return container;
}

// A new version has finished downloading and is waiting, not yet in
// control (S19.md: "Queue update activation until current state is saved
// and user chooses Reload") — shown above whatever screen is active so the
// choice is available regardless of where the learner is, without forcing
// them off it.
export function renderUpdateBanner(actions = {}) {
  const container = document.createElement('div');
  container.className = 'update-banner';
  container.setAttribute('role', 'status');
  const message = document.createElement('span');
  message.textContent = 'An update is ready.';
  const reloadButton = document.createElement('button');
  reloadButton.type = 'button';
  reloadButton.textContent = 'Reload';
  reloadButton.addEventListener('click', () => actions.onReload?.());
  container.append(message, reloadButton);
  return container;
}

const SKILLS = [
  { family: 'P', label: 'Link/port' },
  { family: 'I', label: 'IPv4' },
  { family: 'V', label: 'VLAN' },
  { family: 'D', label: 'DNS' },
];

function familyLabel(family) {
  return SKILLS.find((s) => s.family === family)?.label ?? 'Mixed challenge';
}

function renderPendingMissionPrompt(state, actions) {
  const request = state.pendingMissionRequest;
  const box = document.createElement('div');
  box.className = 'home-pending-prompt';
  box.setAttribute('role', 'alertdialog');
  const message = document.createElement('p');
  message.textContent =
    request.kind === 'code'
      ? `Starting "${request.caseCode}" will replace your current mission.`
      : `Starting a new configure session will replace your current mission.`;
  box.appendChild(message);
  const resumeButton = document.createElement('button');
  resumeButton.type = 'button';
  resumeButton.textContent = 'Resume current';
  resumeButton.addEventListener('click', () => actions.onCancelReplace?.());
  const replaceButton = document.createElement('button');
  replaceButton.type = 'button';
  replaceButton.textContent = 'Replace';
  replaceButton.addEventListener('click', () => actions.onConfirmReplace?.());
  box.append(resumeButton, replaceButton);
  return box;
}

// Small element builder for the reworked screens.
function h(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}
function btn(cls, text, onClick) {
  const b = h('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

// Career titles read "Ticket #1 — “I can’t get on the network”". The part in
// quotes is the customer's complaint, which is the headline; the rest is the
// ticket label above it.
function splitTicketTitle(title) {
  const [label, ...rest] = String(title ?? '').split(' — ');
  const headline = rest.join(' — ').replace(/^[“"]|[”"]$/g, '');
  if (!headline) return { label: '', headline: label };
  return { label, headline: headline.charAt(0).toUpperCase() + headline.slice(1) };
}

export function renderHome(state, actions = {}) {
  const container = h('div', 'home-screen');
  const career = careerProgress(state.profile);
  const snapshot = actions.prepSnapshot ?? { mastery: [], cardsDue: 0, typeDue: 0, started: false };
  const earned = snapshot.mastery.filter(r => r.state === 'earned').length;

  // ---- top bar ----
  const bar = h('header', 'home-bar');
  const mark = h('h1', 'home-mark', 'The Field');
  bar.append(mark);
  if (actions.themeToggle) bar.append(actions.themeToggle);
  container.append(bar);

  if (state.pendingMissionRequest) container.append(renderPendingMissionPrompt(state, actions));
  // Only a failed save needs attention on home; "Saved" is noise here.
  if (state.saveStatus === 'error' || state.saveStatus === 'quota') {
    const saveBanner = renderSaveStatusBanner(state, actions);
    saveBanner.className = 'home-save-banner';
    container.append(saveBanner);
  }
  if (state.error) {
    const error = h('p', 'form-error', state.error);
    error.setAttribute('role', 'alert');
    container.append(error);
  }

  const grid = h('div', 'home-grid');

  // ---- next ticket: the one loud thing on the screen ----
  const next = h('section', 'next-ticket');
  next.setAttribute('aria-labelledby', 'next-ticket-headline');

  // Only an active ticket is "in progress"; a closed one gives way to the
  // next. This matches when starting another ticket asks to replace it.
  const active = state.mission?.status === 'active';
  if (active) {
    const resume = h('div', 'resume-strip');
    const resumeText = h('div', 'resume-text');
    resumeText.append(h('span', 'resume-label', 'In progress'));
    resumeText.append(h('span', 'resume-code mono', state.mission.caseCode ?? `Configure ${state.mission.network?.layoutId ?? ''}`.trim()));
    const cont = btn('home-continue btn-primary', 'Resume', () => actions.onContinue?.());
    resume.append(resumeText, cont);
    next.append(resume);
  }

  const assignment = career.activeAssignment;
  const row = h('div', 'home-recommended-row');
  if (assignment) {
    const { label, headline } = splitTicketTitle(assignment.title);
    const top = h('div', 'ticket-top');
    top.append(h('span', 'ticket-kicker', active ? 'Next ticket' : 'Your next ticket'));
    top.append(h('span', 'ticket-code mono', assignment.start.kind === 'code' ? assignment.start.code : label));
    const title = h('h2', 'ticket-headline', headline);
    title.id = 'next-ticket-headline';
    const story = h('p', 'ticket-story', assignment.story);
    const meta = h('div', 'ticket-meta');
    meta.append(h('span', 'chip', assignment.skill));
    if (assignment.tier) meta.append(h('span', 'chip', `Tier ${assignment.tier}`));
    if (career.completedCount === 0) meta.append(h('span', 'chip chip-accent', 'Guided'));
    const start = btn(active ? '' : 'btn-primary ticket-start', active ? 'Start instead' : 'Start ticket', () => actions.onStartAssignment?.(assignment.id));
    row.append(top, title, story, meta, start);
  } else {
    const recommendation = actions.recommendation ?? { kind: 'code', code: 'TF1-HM-1-P-START' };
    const top = h('div', 'ticket-top');
    top.append(h('span', 'ticket-kicker', 'Every rank cleared'));
    top.append(h('span', 'ticket-code mono', recommendation.kind === 'code' ? recommendation.code : 'New case'));
    const title = h('h2', 'ticket-headline', recommendation.kind === 'code' ? 'Recommended job' : `${familyLabel(recommendation.family)}, tier ${recommendation.tier}`);
    title.id = 'next-ticket-headline';
    const story = h('p', 'ticket-story', 'Picked from the skill you have practiced least.');
    const start = btn(active ? '' : 'btn-primary ticket-start', active ? 'Start instead' : 'Start ticket', () => actions.onStartRecommended?.());
    row.append(top, title, story, start);
  }
  next.append(row);
  grid.append(next);

  // ---- three doors ----
  const side = h('div', 'home-side');
  const doors = h('nav', 'home-doors');
  doors.setAttribute('aria-label', 'Sections');
  const door = (cls, name, status, onClick) => {
    const b = btn(`door ${cls}`, '', onClick);
    b.append(h('span', 'door-name', name), h('span', 'door-status', status));
    return b;
  };
  doors.append(door('home-tickets-button', 'Tickets', `${career.completedCount} of ${career.total} closed`, () => actions.onOpenCareer?.()));
  const due = snapshot.cardsDue + snapshot.typeDue;
  doors.append(door('home-study-button', 'Study', due ? `${due} reviews due` : (snapshot.started ? 'Nothing due' : 'Quiz, drills, cards'), () => actions.onOpenStudy?.()));
  side.append(doors);

  // The collection is the third door: the whole panel opens it.
  const collection = btn('home-collection home-collection-button', '', () => actions.onOpenCollection?.());
  const head = h('span', 'home-collection-head');
  head.append(h('span', 'door-name', 'Collection'));
  head.append(h('span', 'door-status', `${earned} of ${snapshot.mastery.length || 8} earned`));
  collection.append(head);
  if (snapshot.mastery.length) collection.append(renderPatchPanel(snapshot.mastery, { compact: true }));
  collection.append(h('span', 'home-collection-legend', 'Green is earned in the Field. Orange is practiced.'));
  side.append(collection);

  const tools = h('div', 'home-tools');
  tools.append(btn('home-progress-button btn-quiet', 'Progress', () => actions.onOpenProgress?.()));
  tools.append(btn('home-reference-button btn-quiet', 'Reference', () => actions.onOpenReference?.()));
  side.append(tools);
  grid.append(side);
  container.append(grid);

  // ---- more: everything else, one tap deeper ----
  // Re-rendering must not collapse a section the learner opened, and an
  // import preview or error inside it has to be visible when it appears.
  const more = h('details', 'home-more');
  more.open = homeMoreOpen || Boolean(actions.importPreview || actions.importError);
  more.addEventListener('toggle', () => { homeMoreOpen = more.open; });
  more.append(h('summary', 'home-more-summary', 'More ways to practice'));
  const body = h('div', 'home-more-body');

  const skills = h('section', 'more-block');
  skills.append(h('h3', null, 'Practice one skill'));
  const skillsRow = h('div', 'home-skills-row');
  for (const skill of SKILLS) {
    const tier = recommendedTier(state.profile, skill.family);
    const b = btn('', '', () => actions.onStartVariation?.(skill.family));
    b.append(h('span', 'skill-name', skill.label), h('span', 'skill-tier', `Tier ${tier}`));
    skillsRow.append(b);
  }
  skills.append(skillsRow);
  body.append(skills);

  const seed = h('section', 'more-block');
  seed.append(h('h3', null, 'Open a case code'));
  const seedForm = h('form', 'home-seed-form');
  const seedInput = h('input', 'mono');
  seedInput.type = 'text';
  seedInput.placeholder = 'TF1-BR-3-D-12345';
  seedInput.autocapitalize = 'characters';
  seedInput.spellcheck = false;
  seedInput.setAttribute('aria-label', 'Case code');
  const seedButton = h('button', null, 'Go');
  seedButton.type = 'submit';
  seedForm.append(seedInput, seedButton);
  seedForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (seedInput.value.trim() === '') return;
    actions.onStartCode?.(seedInput.value.trim());
  });
  seed.append(seedForm);
  body.append(seed);

  const configure = h('section', 'more-block');
  configure.append(h('h3', null, 'Configure a healthy network'));
  configure.append(h('p', 'more-note', 'Nothing is broken. Change settings freely and see what happens.'));
  const configureRow = h('div', 'home-configure-row');
  for (const [layoutId, label] of [['HM', 'Home lab'], ['BR', 'Branch'], ['OF', 'Office']]) {
    configureRow.append(btn('home-configure-button', label, () => actions.onStartConfigure?.(layoutId)));
  }
  configure.append(configureRow);
  body.append(configure);

  const build = h('section', 'more-block');
  build.append(h('h3', null, 'Build and browse'));
  const buildRow = h('div', 'home-build-row');
  buildRow.append(btn('home-studio-button', 'Design a network', () => actions.onOpenBuilder?.()));
  buildRow.append(btn('home-library-button', 'Issue library', () => actions.onOpenIssues?.()));
  build.append(buildRow);
  body.append(build);

  body.append(renderBackupSection(actions));
  more.append(body);
  container.append(more);

  // S19.md: "Show Ready offline only after worker activation and successful
  // required-cache checks". actions.offlineReady is set only once Workbox
  // reports every required asset precached.
  if (actions.offlineReady) {
    const offline = h('p', 'home-offline');
    offline.append(h('span', 'led led-ok'));
    const note = h('span', 'home-offline-ready', 'Ready offline');
    note.setAttribute('role', 'status');
    offline.append(note);
    container.append(offline);
  }

  return container;
}

// The guided career campaign screen (career.js). A themed rank ladder with
// every assignment open: completed ones can be replayed, one is marked as the
// recommended next, and the rest are labelled with the tier they sit at so a
// trainee choosing a hard one knows what they picked. Each Start hands off to
// the same mission engine the rest of the app uses.
export function renderCareer(state, actions = {}) {
  const container = document.createElement('div');
  container.className = 'career-screen';
  const progress = careerProgress(state.profile);

  const header = document.createElement('div');
  header.className = 'career-header';
  const back = document.createElement('button');
  back.type = 'button'; back.className = 'career-back screen-back btn-quiet'; back.textContent = 'Home';
  back.addEventListener('click', () => actions.onHome?.());
  header.appendChild(back);
  const title = document.createElement('h1'); title.textContent = 'Tickets';
  const lead = document.createElement('p'); lead.className = 'career-lead';
  lead.textContent = progress.allComplete
    ? 'You made Network Engineer. Every ticket can be replayed, or design a network of your own.'
    : 'Work up the ranks in order, or take any ticket now. The hard ones will hurt, and that is the only gate.';
  const meter = document.createElement('div'); meter.className = 'career-meter';
  const meterFill = document.createElement('div'); meterFill.className = 'career-meter-fill';
  meterFill.style.width = `${Math.round((progress.completedCount / progress.total) * 100)}%`;
  meter.appendChild(meterFill);
  const meterLabel = document.createElement('p'); meterLabel.className = 'career-meter-label';
  meterLabel.textContent = `${progress.completedCount} of ${progress.total} closed`;
  header.append(title, lead, meter, meterLabel);
  container.appendChild(header);

  if (state.pendingMissionRequest) {
    container.appendChild(renderPendingMissionPrompt(state, actions));
  }
  if (state.error) {
    const error = document.createElement('p'); error.className = 'form-error'; error.setAttribute('role', 'alert'); error.textContent = state.error;
    container.appendChild(error);
  }

  for (const rank of progress.ranks) {
    const section = document.createElement('section');
    section.className = `career-rank${rank.complete ? ' is-complete' : rank.started ? ' is-unlocked' : ' is-ahead'}`;
    const rankHead = document.createElement('div'); rankHead.className = 'career-rank-head';
    const badge = document.createElement('span'); badge.className = 'career-rank-badge'; badge.textContent = rank.badge;
    const rankTitles = document.createElement('div');
    const rankTitle = document.createElement('h2'); rankTitle.textContent = rank.title;
    const rankTag = document.createElement('p'); rankTag.className = 'career-rank-tagline'; rankTag.textContent = rank.tagline;
    rankTitles.append(rankTitle, rankTag);
    const rankStatus = document.createElement('span'); rankStatus.className = 'career-rank-status';
    rankStatus.textContent = rank.complete ? 'Complete' : rank.started ? `${rank.doneCount}/${rank.items.length}` : 'Open';
    rankHead.append(badge, rankTitles, rankStatus);
    section.appendChild(rankHead);

    const blurb = document.createElement('p'); blurb.className = 'career-rank-blurb'; blurb.textContent = rank.blurb;
    section.appendChild(blurb);

    const list = document.createElement('div'); list.className = 'career-assignments';
    for (const assignment of rank.items) {
      list.appendChild(renderAssignmentCard(assignment, actions));
    }
    section.appendChild(list);
    container.appendChild(section);
  }

  return container;
}

function renderAssignmentCard(assignment, actions) {
  const card = document.createElement('article');
  card.className = `career-assignment is-${assignment.status}`;
  const head = document.createElement('div'); head.className = 'career-assignment-head';
  // Lead with the customer's complaint, the ticket label small above it,
  // and a status LED: green closed, yellow next, dark ahead.
  const { label, headline } = splitTicketTitle(assignment.title);
  const marker = document.createElement('span');
  marker.className = `led career-assignment-marker${assignment.status === 'done' ? ' led-ok' : assignment.status === 'active' ? ' led-next' : ''}`;
  marker.setAttribute('aria-hidden', 'true');
  const labelText = document.createElement('span'); labelText.className = 'career-assignment-label';
  labelText.textContent = assignment.status === 'done' ? `${label}, closed` : assignment.status === 'active' ? `${label}, up next` : label;
  const title = document.createElement('h3'); title.textContent = headline;
  head.append(marker, labelText);
  card.append(head, title);

  const story = document.createElement('p'); story.className = 'career-assignment-story'; story.textContent = assignment.story;
  card.appendChild(story);

  const foot = document.createElement('div'); foot.className = 'career-assignment-foot';
  const skill = document.createElement('span'); skill.className = 'career-assignment-skill'; skill.textContent = assignment.skill;
  foot.appendChild(skill);

  if (assignment.status === 'ahead') {
    const ahead = document.createElement('span');
    ahead.className = 'career-assignment-ahead';
    ahead.textContent = `Ahead of you · tier ${assignment.tier}`;
    foot.appendChild(ahead);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = assignment.status === 'active' ? 'primary-button' : 'career-replay';
  button.textContent = assignment.status === 'done' ? 'Replay'
    : assignment.status === 'active' ? 'Start assignment'
    : 'Take it anyway';
  button.addEventListener('click', () => actions.onStartAssignment?.(assignment.id));
  foot.appendChild(button);
  card.appendChild(foot);
  return card;
}

// Export/import (S17.md). Export triggers a Blob download of the current
// profile/mission (main.js's job — this only calls the action). Import is a
// two-step flow: choosing a file previews its counts and asks for an
// explicit Replace (UI_AND_STORAGE.md/S17.md: "Restore requires explicit
// Replace"); a rejected file shows its reason and changes nothing.
function renderBackupSection(actions) {
  const container = document.createElement('div');
  container.className = 'home-backup-section';

  const heading = document.createElement('h2');
  heading.className = 'home-section-heading';
  heading.textContent = 'Backup';
  container.appendChild(heading);

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'home-export-button';
  exportButton.textContent = 'Export backup';
  exportButton.addEventListener('click', () => actions.onExportBackup?.());
  container.appendChild(exportButton);

  const importLabel = document.createElement('label');
  importLabel.className = 'home-import-label';
  const importSpan = document.createElement('span');
  importSpan.textContent = 'Import backup';
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (file) actions.onImportFile?.(file);
    importInput.value = '';
  });
  importLabel.append(importSpan, importInput);
  container.appendChild(importLabel);

  if (actions.importError) {
    const error = document.createElement('p');
    error.className = 'form-error';
    error.setAttribute('role', 'alert');
    error.textContent = actions.importError;
    container.appendChild(error);
  }

  if (actions.importPreview) {
    const preview = actions.importPreview;
    const box = document.createElement('div');
    box.className = 'home-pending-prompt';
    box.setAttribute('role', 'alertdialog');
    const message = document.createElement('p');
    message.textContent = `This backup was exported ${preview.exportedAt}. It has ${preview.counts.completedRuns} completed run(s), ${preview.counts.independentRepairs} independent repair(s), and ${preview.hasMission ? 'an active mission' : 'no active mission'}. Replacing will discard your current profile and mission.`;
    box.appendChild(message);
    const exportFirstButton = document.createElement('button');
    exportFirstButton.type = 'button';
    exportFirstButton.textContent = 'Export current backup first';
    exportFirstButton.addEventListener('click', () => actions.onExportBackup?.());
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => actions.onCancelImport?.());
    const replaceButton = document.createElement('button');
    replaceButton.type = 'button';
    replaceButton.textContent = 'Replace';
    replaceButton.addEventListener('click', () => actions.onConfirmImport?.());
    box.append(exportFirstButton, cancelButton, replaceButton);
    container.appendChild(box);
  }

  return container;
}

// Local completion history and assisted/independent evidence by skill
// (MASTER_DESIGN.md §9). Practice indicators only — no XP, currency or
// certification-readiness claims.
export function renderProgress(state, actions = {}) {
  const container = document.createElement('div');
  container.className = 'progress-screen';

  const heading = document.createElement('h1');
  heading.textContent = 'Progress';
  container.appendChild(heading);

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.textContent = 'Back';
  backButton.addEventListener('click', () => actions.onHome?.());
  container.appendChild(backButton);

  const stats = allFamilyStats(state.profile);
  const statsList = document.createElement('div');
  statsList.className = 'progress-skills';
  for (const stat of stats) {
    const card = document.createElement('section');
    card.className = 'progress-skill-card';
    const skillHeading = document.createElement('h2');
    skillHeading.textContent = familyLabel(stat.family);
    card.appendChild(skillHeading);
    const dl = document.createElement('dl');
    const addRow = (term, value) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    };
    addRow('Completed runs', String(stat.completed));
    addRow('Independent', String(stat.independent));
    addRow('Assisted', String(stat.assisted));
    addRow('Distinct causes solved', String(stat.distinctCauses));
    addRow('Highest tier reached', stat.highestTier > 0 ? String(stat.highestTier) : '—');
    addRow('Recommended tier', String(stat.recommendedTier));
    addRow('Best verified time', stat.bestElapsedMs != null ? formatDuration(stat.bestElapsedMs) : '—');
    card.appendChild(dl);
    statsList.appendChild(card);
  }
  container.appendChild(statsList);

  const historyHeading = document.createElement('h2');
  historyHeading.textContent = 'Recent history';
  container.appendChild(historyHeading);
  const recentRuns = state.profile.completedRuns.slice(0, 10);
  if (recentRuns.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No completed jobs yet.';
    container.appendChild(empty);
  } else {
    const historyList = document.createElement('ol');
    historyList.className = 'progress-history';
    for (const run of recentRuns) {
      const item = document.createElement('li');
      const statusText = run.assisted ? 'Completed with support' : 'Completed independently';
      item.textContent = `${familyLabel(run.family)} · tier ${run.tier} · ${statusText} · ${formatDuration(run.elapsedMs)}`;
      historyList.appendChild(item);
    }
    container.appendChild(historyList);
  }

  return container;
}

// Study screen (MASTER_DESIGN.md §9): family filter, a lesson view, quiz
// questions with immediate feedback and an expandable explanation for every
// option, and flashcards with reveal + Got it / Review again. Fully local —
// everything comes from the copied STUDY_PACK and the profile's own
// studyAnswers/cardReviews, no fetch. Quiz correctness never gates anything;
// it is shown only as a completed/not-yet indicator.
export function renderStudy(state, actions = {}) {
  const session = state.studySession ?? { family: 'all', lessonId: null };
  const container = document.createElement('div');
  container.className = 'study-screen';

  const heading = document.createElement('h1');
  heading.textContent = 'Study';
  container.appendChild(heading);

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.textContent = 'Back';
  backButton.addEventListener('click', () => actions.onHome?.());
  container.appendChild(backButton);

  // One way into exam prep, from inside Study, so the home screen does not
  // gain a second study entry.
  if (!session.lessonId) {
    const prep = document.createElement('button');
    prep.type = 'button';
    prep.className = 'study-exam-prep';
    const title = document.createElement('span');
    title.className = 'study-exam-prep-title';
    title.textContent = 'CCNA exam prep';
    const sub = document.createElement('span');
    sub.className = 'study-exam-prep-sub';
    sub.textContent = 'Quiz, weighted mock exams, subnet drill, flashcards, type-it, and your collection.';
    prep.append(title, sub);
    prep.addEventListener('click', () => actions.onOpenExamPrep?.());
    container.appendChild(prep);
  }

  if (session.lessonId) {
    const lesson = lessonById(session.lessonId);
    const lessonBackButton = document.createElement('button');
    lessonBackButton.type = 'button';
    lessonBackButton.textContent = 'Back to lessons';
    lessonBackButton.addEventListener('click', () => actions.onCloseLesson?.());
    container.appendChild(lessonBackButton);

    const title = document.createElement('h2');
    title.textContent = lesson.title;
    container.appendChild(title);
    const text = document.createElement('p');
    text.className = 'study-lesson-text';
    text.textContent = lesson.text;
    container.appendChild(text);

    const questionsHeading = document.createElement('h3');
    questionsHeading.textContent = 'Check your understanding';
    container.appendChild(questionsHeading);
    for (const question of questionsForLesson(lesson.id)) {
      container.appendChild(renderStudyQuestion(state, actions, question));
    }

    const cardsHeading = document.createElement('h3');
    cardsHeading.textContent = 'Flashcards';
    container.appendChild(cardsHeading);
    for (const card of cardsForLesson(lesson.id)) {
      container.appendChild(renderStudyCard(state, actions, card));
    }
    return container;
  }

  const filterRow = document.createElement('div');
  filterRow.className = 'study-family-filter';
  for (const option of [{ family: 'all', label: 'All' }, ...SKILLS]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = option.family === session.family ? 'study-family-active' : '';
    button.textContent = option.label;
    button.addEventListener('click', () => actions.onSelectFamily?.(option.family));
    filterRow.appendChild(button);
  }
  container.appendChild(filterRow);

  const lessonList = document.createElement('ul');
  lessonList.className = 'study-lesson-list';
  for (const lesson of lessonsForFamily(session.family)) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = lesson.title;
    button.addEventListener('click', () => actions.onOpenLesson?.(lesson.id));
    item.appendChild(button);
    lessonList.appendChild(item);
  }
  container.appendChild(lessonList);

  return container;
}

function renderStudyQuestion(state, actions, question) {
  const container = document.createElement('div');
  container.className = 'study-question';
  const prompt = document.createElement('p');
  prompt.textContent = question.prompt;
  container.appendChild(prompt);

  const existingAnswer = answerForQuestion(state.profile, question.id);
  const list = document.createElement('ul');
  list.className = 'study-question-options';
  for (const option of question.options) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${option.id}. ${option.text}`;
    if (existingAnswer?.optionId === option.id) {
      button.className = existingAnswer.correct ? 'study-option-selected-correct' : 'study-option-selected-wrong';
    }
    button.addEventListener('click', () => actions.onAnswerQuestion?.(question.id, option.id));
    item.appendChild(button);
    // Every option's explanation is visible once any answer has been
    // submitted (S16.md: "expandable explanation for every option"), not
    // only the chosen one.
    if (existingAnswer) {
      const explanation = document.createElement('p');
      explanation.className = 'study-option-explanation';
      explanation.textContent = `${option.correct ? '✓' : '✗'} ${option.explanation}`;
      item.appendChild(explanation);
    }
    list.appendChild(item);
  }
  container.appendChild(list);
  return container;
}

function renderStudyCard(state, actions, card) {
  const container = document.createElement('div');
  container.className = 'study-card';
  const front = document.createElement('p');
  front.className = 'study-card-front';
  front.textContent = card.front;
  container.appendChild(front);

  const revealed = state.studySession?.revealedCardIds?.includes(card.id) ?? false;
  if (!revealed) {
    const revealButton = document.createElement('button');
    revealButton.type = 'button';
    revealButton.textContent = 'Reveal';
    revealButton.addEventListener('click', () => actions.onRevealCard?.(card.id));
    container.appendChild(revealButton);
  } else {
    const back = document.createElement('p');
    back.className = 'study-card-back';
    back.textContent = card.back;
    container.appendChild(back);

    const review = reviewForCard(state.profile, card.id);
    const gotItButton = document.createElement('button');
    gotItButton.type = 'button';
    gotItButton.className = review?.remembered === true ? 'study-card-active' : '';
    gotItButton.textContent = 'Got it';
    gotItButton.addEventListener('click', () => actions.onReviewCard?.(card.id, true));
    const reviewAgainButton = document.createElement('button');
    reviewAgainButton.type = 'button';
    reviewAgainButton.className = review?.remembered === false ? 'study-card-active' : '';
    reviewAgainButton.textContent = 'Review again';
    reviewAgainButton.addEventListener('click', () => actions.onReviewCard?.(card.id, false));
    container.append(gotItButton, reviewAgainButton);
  }
  return container;
}

// Searchable in-app reference (S16.md). Reachable from Home or from within
// a mission; main.js is responsible for returning to whichever screen was
// active before, so mission state (tab, selection, drafts) is preserved.
export function renderReference(state, actions = {}) {
  const container = document.createElement('div');
  container.className = 'reference-screen';

  const heading = document.createElement('h1');
  heading.textContent = 'Reference';
  container.appendChild(heading);

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.textContent = 'Back';
  backButton.addEventListener('click', () => actions.onClose?.());
  container.appendChild(backButton);

  const searchLabel = document.createElement('label');
  searchLabel.className = 'form-row';
  const searchSpan = document.createElement('span');
  searchSpan.textContent = 'Search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.value = actions.query ?? '';
  searchInput.addEventListener('input', () => actions.onSearch?.(searchInput.value));
  searchLabel.append(searchSpan, searchInput);
  container.appendChild(searchLabel);

  const results = searchReference(REFERENCE_ENTRIES, actions.query ?? '');
  const list = document.createElement('dl');
  list.className = 'reference-list';
  for (const entry of results) {
    const dt = document.createElement('dt');
    // Titles already end in "(switch)" and the like, so the kind appeared
    // twice. Show the command once, in mono, with the kind as a chip.
    const command = document.createElement('code');
    command.textContent = entry.deviceKind ? entry.title.replace(new RegExp(`\\s*\\(${entry.deviceKind}\\)\\s*$`, 'i'), '') : entry.title;
    dt.append(command);
    if (entry.deviceKind) {
      const kind = document.createElement('span');
      kind.className = 'chip';
      kind.textContent = entry.deviceKind;
      dt.append(kind);
    }
    const dd = document.createElement('dd');
    dd.textContent = entry.body;
    list.append(dt, dd);
  }
  container.appendChild(list);
  if (results.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No matching reference entries.';
    container.appendChild(empty);
  }

  return container;
}

function renderInspect(network, device) {
  const list = document.createElement('dl');
  list.className = 'device-inspect';
  const addRow = (term, value) => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
    return { dt, dd };
  };
  addRow('Kind', device.kind);
  addRow('Power', device.powered ? 'On' : 'Off');
  if (device.ip) addRow('IP address', `${device.ip}/${device.prefix}`);
  if (device.gateway) addRow('Gateway', device.gateway);
  if (device.dns) addRow('DNS', device.dns);
  const ports = network.ports.filter((p) => p.deviceId === device.id);
  for (const port of ports) {
    const vlanNote =
      port.mode === 'access'
        ? ` VLAN ${port.accessVlan}`
        : port.mode === 'trunk'
          ? ` allows [${port.allowedVlans.join(', ')}]`
          : '';
    const { dt, dd } = addRow(`Port ${port.label}`, `${port.adminUp ? 'up' : 'administratively down'}, ${port.mode}${vlanNote}`);
    // Beginner mentor tooltip: hover the interface row to learn what the
    // port name means, whether it's up, and what access/trunk implies.
    dt.classList.add('mentor-hoverable');
    dd.classList.add('mentor-hoverable');
    dt.tabIndex = 0;
    attachMentor(dt, () => explainPort(port, device));
    attachMentor(dd, () => explainPort(port, device));
  }
  return list;
}

// Configuration forms per UI_AND_STORAGE.md's "Device configuration" table.
// Every port on the device gets its own Apply/Cancel form (a switch/router
// with several ports shows several); clients get one address form; a server
// gets its DNS record(s).
function renderConfigure(network, device, onApply) {
  const container = document.createElement('div');
  container.className = 'device-configure';

  if (device.kind === 'client') {
    const heading = document.createElement('h3');
    heading.textContent = 'Address';
    container.append(heading, renderClientForm(device, (actions) => onApply(actions)));
  }

  if (device.kind === 'router') {
    const heading = document.createElement('h3');
    heading.textContent = 'LAN segments';
    container.append(heading, renderRouterSegmentForm(device, (actions) => onApply(actions)));
  }

  if (device.kind === 'server') {
    const heading = document.createElement('h3');
    heading.textContent = 'DNS records';
    container.append(heading, renderDnsRecordForm(device, network.dnsRecords, (actions) => onApply(actions)));
  }

  const ports = network.ports.filter((p) => p.deviceId === device.id);
  if (ports.length > 0 && device.kind !== 'client') {
    const heading = document.createElement('h3');
    heading.textContent = 'Ports';
    container.appendChild(heading);
    for (const port of ports) {
      const portHeading = document.createElement('p');
      portHeading.className = 'device-port-heading';
      portHeading.textContent = port.label;
      container.append(portHeading, renderPortForm(port, (actions) => onApply(actions)));
    }
  }

  return container;
}

function renderDevicePanel(state, actions) {
  const network = state.mission.network;
  const selectedDeviceId = state.selectedDeviceId;
  const container = document.createElement('div');
  container.className = 'device-panel';
  if (!selectedDeviceId) {
    const empty = document.createElement('p');
    empty.className = 'device-panel-empty';
    empty.textContent = 'Select a device to inspect it.';
    container.appendChild(empty);
    return container;
  }
  const device = network.devices.find((d) => d.id === selectedDeviceId);
  if (!device) {
    const missing = document.createElement('p');
    missing.textContent = 'That device is no longer part of this network.';
    container.appendChild(missing);
    return container;
  }

  const heading = document.createElement('h2');
  heading.textContent = String(device.name ?? '').replace(/^[^:]+:\s*/, '');
  heading.classList.add('mentor-hoverable');
  heading.tabIndex = 0;
  attachMentor(heading, () => explainDevice(device));
  container.appendChild(heading);
  const equipment = equipmentIcon(device.kind); equipment.classList.add('inspector-equipment'); container.prepend(equipment);
  const viewKey = `${state.mission.id}:${device.id}`;
  const mode = trainingMode(state.mission, state.profile);
  container.dataset.trainingMode = mode;
  const tabs = document.createElement('div'); tabs.className = 'inspector-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Device tools');
  const panes = {};
  const choose = id => {
    inspectorViews.set(viewKey, id);
    container.dataset.inspector = id;
    for (const [key, pane] of Object.entries(panes)) pane.hidden = key !== id;
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.pane === id));
  };
  for (const [id, label] of [['inspect', 'Inspect'], ['configure', 'Configure'], ['console', 'Console']]) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.pane = id; b.setAttribute('role', 'tab'); b.id = `inspector-tab-${id}`; b.setAttribute('aria-controls', `inspector-pane-${id}`); b.addEventListener('click', () => choose(id)); tabs.append(b);
    const pane = document.createElement('div'); pane.id = `inspector-pane-${id}`; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', b.id); panes[id] = pane;
  }
  container.append(tabs, ...Object.values(panes));
  panes.inspect.appendChild(renderInspect(network, device));

  const configureHeading = document.createElement('h3');
  configureHeading.textContent = 'Configure';
  panes.configure.appendChild(configureHeading);
  if (state.error) {
    const error = document.createElement('p');
    error.className = 'form-error';
    error.setAttribute('role', 'alert');
    error.textContent = state.error;
    container.appendChild(error);
  }
  panes.configure.appendChild(renderConfigure(network, device, (formActions) => actions.onApplyDeviceForm?.(formActions)));
  if (mode === 'console') {
    tabs.querySelector('[data-pane="inspect"]').hidden = true;
    tabs.querySelector('[data-pane="configure"]').hidden = true;
  }

  if (device.kind === 'client' && mode !== 'console') {
    container.appendChild(renderTests(device.id, (testKind, deviceId) => actions.onRunTest?.(testKind, deviceId)));
    const latestTest = state.mission.events.findLast(event => event.kind === 'test' && event.deviceId === device.id);
    if (latestTest) {
      const feedback = document.createElement('p'); feedback.className = 'test-feedback'; feedback.setAttribute('role', 'status');
      feedback.textContent = describeEvent(state.mission, latestTest); container.append(feedback);
    }
  }

  const terminal = terminalSessionFor(state, device.id, device.kind);
  panes.console.appendChild(
    renderTerminal(terminal, {
      onSubmitCommand: (text) => actions.onSubmitCommand?.(device.id, device.kind, text),
      onInsertBuilderCommand: () => actions.onInsertBuilderCommand?.(device.id, device.kind),
      showBuilder: mode !== 'console',
    }),
  );
  choose(mode === 'console' ? 'console' : inspectorViews.get(viewKey) ?? (mode === 'coached' ? 'console' : 'inspect'));
  if (mode === 'coached') {
    const bridge = document.createElement('p'); bridge.className = 'console-bridge';
    bridge.textContent = device.kind === 'client' ? 'Try the console: ipconfig /all, ping <IP>, nslookup <name>, then curl http://<name>. The test buttons remain available while you practice.' : 'Practice in the console. Type ? to discover commands for this device and mode.';
    panes.console.prepend(bridge);
  }

  return container;
}

// Tap cable → source port → destination port → Connect (MASTER_DESIGN.md §7).
function renderReconnectPanel(state, actions) {
  const network = state.mission.network;
  const reconnect = state.reconnect;
  const container = document.createElement('div');
  container.className = 'reconnect-panel';

  const link = network.links.find((l) => l.id === reconnect.linkId);
  const heading = document.createElement('p');
  heading.className = 'reconnect-heading';
  heading.textContent = `Reconnecting cable ${reconnect.linkId} (currently ${link?.connected ? 'connected' : 'disconnected'})`;
  container.appendChild(heading);

  if (state.error) {
    const error = document.createElement('p');
    error.className = 'form-error';
    error.setAttribute('role', 'alert');
    error.textContent = state.error;
    container.appendChild(error);
  }

  function portOptionLabel(port) {
    const device = network.devices.find((d) => d.id === port.deviceId);
    return `${device?.name ?? port.deviceId} · ${port.label}`;
  }

  if (!reconnect.sourcePortId) {
    const label = document.createElement('label');
    label.className = 'form-row';
    const span = document.createElement('span');
    span.textContent = 'Choose the source port';
    const select = document.createElement('select');
    for (const port of network.ports) {
      const option = document.createElement('option');
      option.value = port.id;
      option.textContent = portOptionLabel(port);
      select.appendChild(option);
    }
    label.append(span, select);
    container.appendChild(label);

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.textContent = 'Next: choose destination';
    nextButton.addEventListener('click', () => actions.onChooseReconnectSource?.(select.value));
    container.appendChild(nextButton);

    if (link?.connected) {
      const disconnectButton = document.createElement('button');
      disconnectButton.type = 'button';
      disconnectButton.className = 'reconnect-disconnect';
      disconnectButton.textContent = 'Disconnect';
      disconnectButton.addEventListener('click', () => actions.onDisconnectLink?.(reconnect.linkId));
      container.appendChild(disconnectButton);
    }
  } else {
    const label = document.createElement('label');
    label.className = 'form-row';
    const span = document.createElement('span');
    span.textContent = 'Choose the destination port';
    const select = document.createElement('select');
    for (const port of network.ports.filter((p) => p.id !== reconnect.sourcePortId)) {
      const option = document.createElement('option');
      option.value = port.id;
      option.textContent = portOptionLabel(port);
      select.appendChild(option);
    }
    label.append(span, select);
    container.appendChild(label);

    const connectButton = document.createElement('button');
    connectButton.type = 'button';
    connectButton.textContent = 'Connect';
    connectButton.addEventListener('click', () => actions.onConfirmReconnect?.(select.value));
    container.appendChild(connectButton);
  }

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => actions.onCancelReconnect?.());
  container.appendChild(cancelButton);

  return container;
}

const TEST_LABELS = {
  pingGateway: 'Ping gateway',
  pingServer: 'Ping server IP',
  resolvePortal: 'Resolve portal',
  openPortal: 'Open portal',
  checkProtected: 'Check protected client',
};

// Findings rows (UI_AND_STORAGE.md "Findings rows show observation, device and
// sequence"). Selecting supporting rows for a completion submission is
// grade.js's job, a later task — this is the read-only observation record.
function describeEvent(mission, event) {
  const device = mission.network.devices.find((d) => d.id === event.deviceId);
  const deviceName = device?.name ?? event.deviceId ?? 'network';
  if (event.kind === 'test') {
    const label = event.details.command ?? TEST_LABELS[event.details.testKind] ?? event.details.testKind;
    const outcome = event.details.result.ok ? 'passed' : `failed (${event.details.result.code})`;
    return `${label} from ${deviceName}: ${outcome}`;
  }
  if (event.kind === 'inspection') {
    return `Inspected ${deviceName} (power ${event.details.powered ? 'on' : 'off'}${event.details.ip ? `, ${event.details.ip}` : ''})`;
  }
  if (event.kind === 'change') {
    const action = event.details.action;
    const entityLabel = device ? deviceName : (action?.linkId ?? action?.portId ?? 'the network');
    return `${action?.type ?? 'Configuration change'} on ${entityLabel}`;
  }
  return `${event.kind} on ${deviceName}`;
}

// Findings: automatically captured inspection/test observations, selectable
// as evidence, plus the completion note and a live checklist of unmet
// requirements (UI_AND_STORAGE.md/S13.md: "Present unmet checks as concrete
// next actions").
function renderFindings(state, actions) {
  const mission = state.mission;
  const container = document.createElement('div');

  const findingsHeading = document.createElement('h3');
  findingsHeading.className = 'findings-heading mentor-hoverable';
  findingsHeading.textContent = 'Findings — your evidence';
  findingsHeading.tabIndex = 0;
  attachMentor(findingsHeading, () => explainConcept('findings'));
  container.appendChild(findingsHeading);

  const capturedEvents = mission.events.filter((e) => e.kind === 'inspection' || e.kind === 'test');
  if (capturedEvents.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'findings-empty';
    empty.textContent = 'Select a device or run a test to record what you observe.';
    container.appendChild(empty);
  } else {
    const list = document.createElement('ol');
    list.className = 'findings-list';
    for (const event of capturedEvents) {
      const item = document.createElement('li');
      item.className =
        event.kind === 'test'
          ? event.details.result.ok
            ? 'findings-row findings-row-pass'
            : 'findings-row findings-row-fail'
          : 'findings-row';
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = mission.selectedFindingIds.includes(event.id);
      checkbox.addEventListener('change', () => actions.onToggleFinding?.(event.id));
      const text = document.createElement('span');
      text.textContent = ` #${event.index} · ${describeEvent(mission, event)}`;
      label.append(checkbox, text);
      item.appendChild(label);
      list.appendChild(item);
    }
    container.appendChild(list);
  }

  const noteLabel = document.createElement('label');
  noteLabel.className = 'form-row';
  const noteSpan = document.createElement('span');
  // Configure mode "may complete with documentation" (S15.md) — the note is
  // optional there, only repair's grade.js check requires 10-500 characters.
  noteSpan.textContent =
    mission.mode === 'repair' ? 'Completion note (10-500 characters)' : 'Documentation (optional)';
  const noteInput = document.createElement('textarea');
  noteInput.value = mission.completionNote ?? '';
  noteInput.rows = 3;
  noteInput.addEventListener('input', () => actions.onNoteChange?.(noteInput.value));
  noteLabel.append(noteSpan, noteInput);
  container.appendChild(noteLabel);

  const checklist = document.createElement('ul');
  checklist.className = 'completion-checklist';
  for (const check of actions.completionChecks ?? []) {
    const item = document.createElement('li');
    item.className = check.passed ? 'checklist-pass' : 'checklist-fail';
    // The marker is drawn in CSS; screen readers get the state in words.
    const state = document.createElement('span');
    state.className = 'visually-hidden';
    state.textContent = check.passed ? 'Done: ' : 'To do: ';
    item.append(state, check.message);
    checklist.appendChild(item);
  }
  container.appendChild(checklist);

  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.className = 'findings-submit';
  submitButton.textContent = 'Submit';
  submitButton.addEventListener('click', () => actions.onSubmit?.());
  container.appendChild(submitButton);

  return container;
}

function xFromNetwork(network) {
  // The generated /24's second octet is never mutated by any recipe; the
  // server's own address is always intact, so it's a reliable source.
  const server = network.devices.find((d) => d.kind === 'server');
  return server ? Number(server.ip.split('.')[1]) : null;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// MASTER_DESIGN.md §4-6: the customer report, tiered cause visibility, the
// harmless tier3 detail, hints, and the elapsed/goal timer.
function renderBrief(state, actions) {
  const mission = state.mission;
  const container = document.createElement('div');
  container.className = 'mission-brief';

  if (mission.mode === 'repair') {
    const factsHeading = document.createElement('h3');
    factsHeading.textContent = 'Customer report';
    container.appendChild(factsHeading);
    const primaryRecipe = mission.recipeIds[0];
    const facts = CUSTOMER_FACTS[primaryRecipe] ?? {};
    const list = document.createElement('dl');
    list.className = 'brief-facts';
    for (const question of CUSTOMER_QUESTIONS) {
      const dt = document.createElement('dt');
      dt.textContent = question.prompt;
      const dd = document.createElement('dd');
      dd.textContent = facts[question.id] ?? '(no answer on file)';
      list.append(dt, dd);
    }
    container.appendChild(list);

    if (showCauseCount(mission)) {
      const causeCount = document.createElement('p');
      causeCount.className = 'brief-cause-count';
      causeCount.textContent =
        mission.recipeIds.length === 1 ? 'This job has a single fault to find.' : 'This job has two faults to find.';
      container.appendChild(causeCount);
    }

    if (showHarmlessDetail(mission) && typeof mission.detail === 'number') {
      const detail = document.createElement('p');
      detail.className = 'brief-harmless-detail';
      detail.textContent = HARMLESS_DETAILS[mission.detail] ?? '';
      container.appendChild(detail);
    }
  }

  const requirements = mission.requirements;
  const spec = document.createElement('dl');
  spec.className = 'brief-requirements brief-spec';
  for (const [term, value] of [
    ['Customer subnet', `${requirements.targetSubnet}/${requirements.targetPrefix}`],
    ['Customer VLAN', String(requirements.targetVlan)],
    ['Protected subnet', `${requirements.protectedSubnet}/${requirements.protectedPrefix}`],
    ['Protected VLAN', String(requirements.protectedVlan)],
    ['Portal', mission.targetName],
  ]) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.className = 'mono';
    dd.textContent = value;
    spec.append(dt, dd);
  }
  const specHeading = document.createElement('h3');
  specHeading.textContent = 'Intended design';
  container.append(specHeading, spec);

  const timer = document.createElement('p');
  timer.className = 'brief-timer';
  const goalMs = mission.mode === 'repair' ? TIER_GOAL_MS[mission.tier] : null;
  timer.textContent = goalMs
    ? `Elapsed ${formatDuration(mission.elapsedMs)} / goal ${formatDuration(goalMs)}`
    : `Elapsed ${formatDuration(mission.elapsedMs)}`;
  container.appendChild(timer);

  if (mission.mode === 'repair') {
    const hintButton = document.createElement('button');
    hintButton.type = 'button';
    hintButton.className = 'brief-hint-button';
    hintButton.textContent = 'Hint';
    hintButton.addEventListener('click', () => actions.onRequestHint?.());
    container.appendChild(hintButton);

    const recipeId = currentHintRecipeId(mission);
    const level = mission.hintLevels[recipeId] ?? 0;
    if (level > 0) {
      const hint = HINTS[recipeId];
      const x = xFromNetwork(mission.network);
      const hintText = document.createElement('div');
      hintText.className = 'brief-hint-text';
      const levels = [
        ['nudge', hint.nudge],
        ['clue', hint.clue],
        ['step', hint.step],
      ];
      for (let i = 0; i < level; i += 1) {
        const p = document.createElement('p');
        p.textContent = renderHintText(levels[i][1], x);
        hintText.appendChild(p);
      }
      container.appendChild(hintText);
    }
  }

  return container;
}

// The Field workspace (UI_AND_STORAGE.md "Mission"). Below 900px this shows one
// tab at a time; the ≥900px 40/60 split is CSS-only (styles.css) — the same
// panels are all rendered here, just laid out differently.
// The mission workspace.
//
// Phone: one panel at a time, chosen by the tab bar along the bottom:
//   Network (guidance and the map) | Device | Findings | Ticket.
// Desktop (900px and up): the map is always visible, and an inspector beside
// it shows Device, Findings or Ticket. With the Network tab active on
// desktop, the inspector shows the ticket, so it is never empty.
//
// Which panel shows is driven by data-active-tab on the container and the
// CSS in theme.css, so there is one source of truth for both widths.
export function renderMission(state, actions = {}, activeTab = 'network') {
  const mission = state.mission;
  const container = h('div', 'mission-screen');
  container.dataset.activeTab = activeTab;
  const mode = trainingMode(mission, state.profile);
  container.dataset.trainingMode = mode;
  const level = mode === 'console' ? 'independent' : mode;
  const next = nextGuidance(mission);
  // In guided mode the walkthrough names the actual devices in this case;
  // nextGuidance stays as the fallback for anything it has no steps for.
  const walk = mode === 'guided' ? walkthroughPosition(mission) : null;
  const beat = walk?.step ?? null;
  const override = guidanceOverride(state.profile);
  const selectedDevice = mission.network.devices.find(d => d.id === state.selectedDeviceId);
  const shortName = name => String(name ?? '').replace(/^[^:]+:\s*/, '');

  // ---- header ----
  const header = h('header', 'mission-header');
  const exit = btn('mission-exit btn-quiet', 'Exit', () => actions.onExit?.());
  exit.setAttribute('aria-label', 'Exit to home');
  const titleBlock = h('div', 'mission-heading');
  titleBlock.append(h('span', 'mission-kind', mission.mode === 'configure' ? 'Configure lab' : 'Repair ticket'));
  const title = h('span', 'mission-title mono', mission.mode === 'configure' ? `Configure: ${mission.network.layoutId}` : (mission.caseCode ?? 'Mission'));
  titleBlock.append(title);
  const levelChip = h('span', `chip mission-level${level === 'guided' ? ' chip-accent' : ''}`,
    level === 'guided' ? `Guided ${walk ? walk.index + 1 : next.step} of 4` : level === 'coached' ? 'Coached' : 'On your own');

  const menu = h('details', 'mission-menu');
  const menuSummary = h('summary', 'mission-menu-button');
  menuSummary.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.6"/><circle cx="8" cy="8" r="1.6"/><circle cx="13" cy="8" r="1.6"/></svg>';
  menuSummary.setAttribute('aria-label', 'Ticket menu');
  const menuList = h('div', 'mission-menu-list');
  if (mission.caseCode) {
    menuList.append(btn('mission-replay', 'Replay this case', () => actions.onReplay?.()));
    menuList.append(btn('mission-variation', 'New variation', () => actions.onNewVariation?.()));
  } else if (mission.mode === 'configure') {
    // Configure sessions have no caseCode to Replay from (S15.md); Reset
    // restores the same attempt's own stored initial (healthy) network.
    menuList.append(btn('mission-reset', 'Reset to healthy', () => actions.onRequestReset?.()));
  }
  menuList.append(btn('mission-reference', 'Command reference', () => actions.onOpenReference?.()));
  menu.append(menuSummary, menuList);
  header.append(exit, titleBlock, levelChip, menu);
  container.append(header);

  // ---- banners: one container, so the desktop grid has fixed rows ----
  const banners = h('div', 'mission-banners');
  if (state.saveStatus === 'error' || state.saveStatus === 'quota') {
    const banner = renderSaveStatusBanner(state, actions);
    banner.className = 'mission-banner is-fault';
    banners.append(banner);
  }
  if (state.error) {
    const error = h('p', 'form-error mission-banner is-fault', state.error);
    error.setAttribute('role', 'alert');
    banners.append(error);
  }
  if (state.pendingReset) {
    const resetPrompt = h('div', 'home-pending-prompt mission-banner');
    resetPrompt.setAttribute('role', 'alertdialog');
    resetPrompt.append(h('p', null, 'Reset will discard every change and restore the original healthy network.'));
    resetPrompt.append(btn('', 'Cancel', () => actions.onCancelReset?.()));
    resetPrompt.append(btn('btn-primary', 'Reset', () => actions.onConfirmReset?.()));
    banners.append(resetPrompt);
  }
  if (state.pendingMissionRequest) banners.append(renderPendingMissionPrompt(state, actions));
  container.append(banners);

  const body = h('div', 'mission-body');

  // ---- main column: guidance and the map ----
  const main = h('div', 'mission-main');

  const guide = h('section', 'fd-guide');
  guide.setAttribute('aria-label', 'Learning guidance');
  const expanded = coachingExpanded.get(mission.id) ?? level === 'guided';
  container.classList.toggle('coach-hidden', !expanded);
  const guideHead = h('div', 'fd-guide-head');
  const guideTitle = h('strong', 'fd-guide-title', level === 'independent' ? 'Your investigation' : (beat?.title ?? next.title));
  const toggle = btn('fd-guide-toggle btn-quiet', expanded ? 'Hide' : 'Show');
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.setAttribute('aria-label', expanded ? 'Hide guidance' : 'Show guidance');
  guideHead.append(guideTitle, toggle);
  const guideBody = h('div', 'fd-guide-copy');
  guideBody.hidden = !expanded;
  const detail = h('p', 'fd-guide-detail', mode === 'console'
    ? 'Use the device consoles to inspect, configure, and verify. Test the portal from both workstations, then cite evidence in Findings. Cable repairs stay on the map. Type ? in a console for its commands.'
    : (beat?.detail ?? next.detail));
  // On a phone the text is clamped to three lines; a tap shows all of it.
  detail.addEventListener('click', () => detail.classList.toggle('is-open'));
  guideBody.append(detail);
  toggle.addEventListener('click', () => {
    const open = guideBody.hidden;
    guideBody.hidden = !open;
    container.classList.toggle('coach-hidden', !open);
    coachingExpanded.set(mission.id, open);
    toggle.textContent = open ? 'Hide' : 'Show';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide guidance' : 'Show guidance');
  });

  // The walkthrough's last step stops demonstrating and asks for the fix.
  if (beat?.blank) {
    const blank = h('div', 'fd-guide-blank');
    const prompt = h('label', 'fd-guide-blank-prompt', beat.blank.prompt);
    const input = h('input', 'fd-guide-blank-input mono');
    input.type = 'text';
    input.setAttribute('aria-label', beat.blank.prompt);
    const check = btn('fd-guide-blank-check', 'Check');
    const feedback = h('p', 'fd-guide-blank-feedback');
    feedback.setAttribute('role', 'status');
    const verify = () => {
      const result = checkBlank(mission, input.value);
      blank.dataset.result = result.ok ? 'correct' : 'incorrect';
      feedback.textContent = result.ok ? 'That is the change. Make it on the device, then test again to prove it.' : result.reason;
    };
    check.addEventListener('click', verify);
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); verify(); } });
    const row = h('div', 'fd-guide-blank-row');
    row.append(input, check);
    prompt.append(row);
    blank.append(prompt, feedback);
    guideBody.append(blank);
  }

  // Both directions stay reachable: drop the rails early, or put them back.
  const controls = h('div', 'fd-guide-controls');
  if (mode !== 'console') controls.append(btn('fd-guide-try', 'Let me try', () => actions.onSetGuidance?.('independent')));
  if (showMeAvailable(mission, state.profile)) controls.append(btn('fd-guide-showme', 'Show me', () => actions.onRequestHint?.()));
  if (override || mode === 'console') {
    controls.append(btn('fd-guide-restore', override ? 'Use my earned level' : 'Turn help back on', () => actions.onSetGuidance?.(override ? null : 'guided')));
  }
  if (controls.childElementCount) guideBody.append(controls);
  guide.append(guideHead, guideBody);
  main.append(guide);

  const networkPanel = h('div', 'mission-panel mission-panel-network');
  if (!canvasViews.has(mission.id)) canvasViews.set(mission.id, {});
  const targetPortIds = mission.network.ports.filter(p => p.deviceId === mission.targetClientId).map(p => p.id);
  const guideCable = mode === 'guided' && next.step === 3
    ? mission.network.links.find(l => !l.connected && (targetPortIds.includes(l.aPortId) || targetPortIds.includes(l.bPortId)))
    : null;
  networkPanel.append(renderTopology(mission.network, {
    selectedDeviceId: state.selectedDeviceId,
    onSelectDevice: actions.onSelectDevice,
    onSelectLink: actions.onSelectLink,
    reconnectLinkId: state.reconnect?.linkId ?? null,
    viewState: canvasViews.get(mission.id),
    compactList: true,
    guideDeviceId: mode === 'guided' && next.step === 1 ? mission.targetClientId : null,
    guideLinkId: guideCable?.id,
  }));
  if (state.reconnect) networkPanel.append(renderReconnectPanel(state, actions));
  if (guideCable) {
    const tip = h('aside', 'action-coach cable-coach', state.reconnect
      ? 'Choose the workstation end and its assigned access-switch port, then Connect. The ticket names the assigned VLAN.'
      : 'The dashed orange cable is disconnected. Select it to see both ends and reconnect the workstation.');
    if (!state.reconnect) tip.append(btn('', 'Inspect the cable', () => actions.onSelectLink?.(guideCable.id)));
    networkPanel.prepend(tip);
  }
  main.append(networkPanel);
  body.append(main);

  // ---- inspector: device, findings, ticket ----
  const inspector = h('div', 'mission-inspector');
  const tabs = h('nav', 'mission-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Workspace');
  const findingsCount = mission.events.filter(e => e.kind === 'inspection' || e.kind === 'test').length;
  // On desktop the Network tab is hidden (the map is always visible), and the
  // ticket fills the inspector until something else is chosen.
  const shown = activeTab;
  const tab = (id, label, extra) => {
    const selected = shown === id || (id === 'brief' && shown === 'network');
    const b = btn(`mission-tab mission-tab-${id}`, '', () => actions.onTabChange?.(id));
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(shown === id));
    b.dataset.desktopSelected = String(selected);
    b.setAttribute('aria-label', label);
    const text = h('span', 'mission-tab-label', label);
    if (extra?.classList.contains('mission-tab-count')) text.append(extra);
    b.append(text);
    if (extra && !extra.classList.contains('mission-tab-count')) b.append(extra);
    tabs.append(b);
    return b;
  };
  tab('network', 'Network');
  const deviceHint = selectedDevice ? h('span', 'mission-tab-sub', shortName(selectedDevice.name)) : null;
  if (deviceHint) deviceHint.setAttribute('aria-hidden', 'true');
  tab('device', 'Device', deviceHint);
  let countBadge = null;
  if (findingsCount) { countBadge = h('span', 'mission-tab-count', String(findingsCount)); countBadge.setAttribute('aria-hidden', 'true'); }
  const findingsTab = tab('findings', 'Findings', countBadge);
  tab('brief', 'Ticket');

  const devicePanel = h('section', 'mission-panel mission-panel-device');
  devicePanel.setAttribute('role', 'tabpanel');
  devicePanel.setAttribute('aria-label', 'Device');
  let deviceContent = null;
  if (selectedDevice) {
    deviceContent = renderDevicePanel(state, actions);
    devicePanel.append(deviceContent);
  } else {
    const empty = h('div', 'panel-empty');
    empty.append(h('p', 'panel-empty-title', 'No device selected'));
    empty.append(h('p', null, 'Tap a device on the map to inspect it, run tests from it, or open its console.'));
    const go = btn('', 'Go to the map', () => actions.onTabChange?.('network'));
    go.classList.add('panel-empty-map');
    empty.append(go);
    devicePanel.append(empty);
  }

  const findingsPanel = h('section', 'mission-panel mission-panel-findings');
  findingsPanel.setAttribute('role', 'tabpanel');
  findingsPanel.setAttribute('aria-label', 'Findings');
  findingsPanel.append(h('h2', 'panel-title', mission.mode === 'repair' ? 'Findings and submit' : 'Checklist and submit'));
  findingsPanel.append(renderFindings(state, {
    ...actions,
    completionChecks: mission.mode === 'repair' ? evaluateCompletion(mission).checks : evaluateConfigureChecklist(mission).checks,
  }));

  const briefPanel = h('section', 'mission-panel mission-panel-brief');
  briefPanel.setAttribute('role', 'tabpanel');
  briefPanel.setAttribute('aria-label', 'Ticket');
  briefPanel.append(h('h2', 'panel-title', mission.mode === 'repair' ? 'Work order' : 'Lab brief'));
  briefPanel.append(renderBrief(state, actions));

  const panels = h('div', 'mission-inspector-panels');
  panels.append(devicePanel, findingsPanel, briefPanel);
  inspector.append(panels);
  body.append(inspector);
  container.append(body);
  container.append(tabs);

  // ---- coaching pointers inside the panels ----
  if (mode === 'guided') {
    if ((next.step === 2 || (next.step === 3 && !guideCable)) && deviceContent) {
      const target = next.step === 2 ? deviceContent.querySelector('.device-tests button') : deviceContent.querySelector('#inspector-tab-configure');
      if (target) {
        const tip = h('p', 'action-coach', next.step === 2 ? 'Run a baseline test. A failure is useful evidence.' : 'Compare these settings with the ticket before changing them.');
        tip.id = 'action-coach-tip';
        target.parentElement.insertBefore(tip, target);
        target.classList.add('coach-target');
        target.setAttribute('aria-describedby', tip.id);
      }
    } else if (next.step === 4) {
      findingsTab.classList.add('coach-target');
    }
  }

  return container;
}

// MASTER_DESIGN.md §9's expert methodology, as a fixed authored checklist —
// SCENARIOS.md gives no per-recipe example investigation distinct from the
// hint copy already shown during the run.
const EXPERT_SEQUENCE = [
  'Check physical state (cables and port status).',
  "Check the client's addressing (IP and mask).",
  'Test the gateway/IP path.',
  'Check the relevant VLAN path (access membership and trunk allowance).',
  'Check DNS (direct IP test vs. name test).',
  'Apply the repair.',
  'Verify both the target and the protected client.',
];

// The debrief (MASTER_DESIGN.md §9/§11 and S13.md step 3). "Linked lesson" is
// a placeholder until the study pack exists (a later task) — everything else
// is real: actual causes, elapsed time, the full action history, assistance
// used, and the fixed expert-sequence example investigation.
export function renderDebrief(state, actions = {}) {
  const mission = state.mission;
  const container = document.createElement('div');
  container.className = 'debrief-screen';

  const heading = document.createElement('h1');
  heading.textContent = mission.mode === 'repair' ? 'Service restored' : 'Configuration complete';
  container.appendChild(heading);

  const status = document.createElement('p');
  status.className = 'debrief-status';
  status.textContent =
    mission.mode === 'repair'
      ? mission.assisted
        ? 'Completed with support.'
        : 'Completed independently.'
      : 'Configure session saved.';
  container.appendChild(status);

  const timer = document.createElement('p');
  timer.textContent = `Elapsed ${formatDuration(mission.elapsedMs)}.`;
  container.appendChild(timer);

  if (mission.mode === 'repair') {
    // Short, static (reduced-motion-safe) practice feedback tied to real
    // evidence — no XP, currency or certification-readiness claim (S14.md).
    const families = [...new Set(mission.recipeIds.map((recipeId) => recipeId[0]))];
    const feedback = document.createElement('p');
    feedback.className = 'debrief-progress-feedback';
    feedback.textContent = families
      .map((family) => `Recommended tier for ${familyLabel(family)}: ${recommendedTier(state.profile, family)}.`)
      .join(' ');
    container.appendChild(feedback);

    const causesHeading = document.createElement('h2');
    causesHeading.textContent = 'Causes';
    container.appendChild(causesHeading);
    const causesList = document.createElement('ul');
    const x = xFromNetwork(mission.network);
    for (const recipeId of mission.recipeIds) {
      const hint = HINTS[recipeId];
      const item = document.createElement('li');
      item.textContent = `${hint.clue} ${renderHintText(hint.step, x)}`;
      causesList.appendChild(item);
    }
    container.appendChild(causesList);
  }

  const historyHeading = document.createElement('h2');
  historyHeading.textContent = 'Your key observations and changes';
  container.appendChild(historyHeading);
  const historyList = document.createElement('ol');
  for (const event of mission.events) {
    const item = document.createElement('li');
    item.textContent = describeEvent(mission, event);
    historyList.appendChild(item);
  }
  container.appendChild(historyList);

  const investigationHeading = document.createElement('h2');
  investigationHeading.textContent = 'Example investigation';
  container.appendChild(investigationHeading);
  const investigationList = document.createElement('ol');
  for (const step of EXPERT_SEQUENCE) {
    const item = document.createElement('li');
    item.textContent = step;
    investigationList.appendChild(item);
  }
  container.appendChild(investigationList);

  // What this ticket did to the collection: earned without help, practiced
  // with it. A practiced skill points straight at its study material.
  const concepts = conceptsForRecipes(mission.recipeIds ?? []);
  if (mission.mode === 'repair' && concepts.length) {
    const names = concepts.map(c => c.label).join(' and ');
    const next = h('section', `debrief-next${mission.assisted ? ' is-practiced' : ' is-earned'}`);
    const led = h('span', `led ${mission.assisted ? 'led-warn' : 'led-ok'}`);
    led.setAttribute('aria-hidden', 'true');
    const text = h('div', 'debrief-next-text');
    text.append(h('strong', null, mission.assisted ? `Practiced: ${names}` : `Earned: ${names}`));
    text.append(h('p', null, mission.assisted
      ? 'You used hints, so this counts as practice. Close one like it without hints to earn it.'
      : 'Closed without help, so it is lit on your patch panel.'));
    next.append(led, text);
    if (mission.assisted && actions.onOpenCollection) next.append(btn('', 'Study it', () => actions.onOpenCollection()));
    container.appendChild(next);
  }

  const actionsRow = document.createElement('div');
  actionsRow.className = 'debrief-actions';
  if (mission.caseCode) {
    const replayButton = document.createElement('button');
    replayButton.type = 'button';
    replayButton.textContent = 'Replay';
    replayButton.addEventListener('click', () => actions.onReplay?.());
    const variationButton = document.createElement('button');
    variationButton.type = 'button';
    variationButton.textContent = 'New variation';
    variationButton.addEventListener('click', () => actions.onNewVariation?.());
    actionsRow.append(replayButton, variationButton);
  }
  const homeButton = document.createElement('button');
  homeButton.type = 'button';
  homeButton.className = 'btn-primary debrief-home';
  homeButton.textContent = 'Home';
  homeButton.addEventListener('click', () => actions.onHome?.());
  actionsRow.append(homeButton);
  container.appendChild(actionsRow);

  return container;
}
