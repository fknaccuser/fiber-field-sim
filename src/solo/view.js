// Screen rendering for The Field Solo. Touches `document`; engine state
// (app.js) stays DOM-free so it is testable under `node --test`.

import { renderTopology } from './diagram.js';
import { equipmentIcon } from './equipment.js';
import { nextGuidance, trainingMode } from './guidance.js';
import { attachMentor, explainDevice, explainPort, explainConcept } from './mentor.js';
import { careerProgress } from './career.js';

const canvasViews = new Map();
const inspectorViews = new Map();
const coachingExpanded = new Map();
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

export function renderHome(state, actions = {}) {
  const container = document.createElement('div');
  container.className = 'home-screen';

  const heading = document.createElement('h1');
  heading.textContent = 'The Field';
  container.appendChild(heading);
  const subtitle = document.createElement('p');
  subtitle.className = 'home-subtitle';
  subtitle.textContent = 'Understand the connection.';
  container.appendChild(subtitle);

  // Career path: the guided, story-driven way in — recommended for beginners.
  const career = careerProgress(state.profile);
  const careerCard = document.createElement('section');
  careerCard.className = 'home-career';
  const careerCopy = document.createElement('div');
  const careerKicker = document.createElement('span'); careerKicker.className = 'section-kicker'; careerKicker.textContent = 'CAREER PATH · GUIDED';
  const careerTitle = document.createElement('h2');
  careerTitle.textContent = career.allComplete ? 'You made Network Engineer.' : `Start as a Junior Tech. Work your way up.`;
  const careerText = document.createElement('p');
  careerText.textContent = career.allComplete
    ? 'Every rank cleared. Jump back into any ticket or design a network of your own.'
    : 'A step-by-step path from your first “I can’t get online” ticket to designing whole networks — every device and step explained as you go.';
  const careerButton = document.createElement('button'); careerButton.type = 'button'; careerButton.className = 'primary-button'; careerButton.textContent = career.completedCount > 0 ? 'Resume career →' : 'Begin your career →';
  careerButton.addEventListener('click', () => actions.onOpenCareer?.());
  const careerMeta = document.createElement('p'); careerMeta.className = 'home-career-meta';
  careerMeta.textContent = `${career.completedCount} of ${career.total} assignments complete`;
  careerCopy.append(careerKicker, careerTitle, careerText, careerButton, careerMeta);
  const careerLadder = document.createElement('div'); careerLadder.className = 'home-career-ladder'; careerLadder.setAttribute('aria-hidden', 'true');
  for (const rank of career.ranks) {
    const pip = document.createElement('span');
    pip.className = `career-rank-pip${rank.complete ? ' is-complete' : rank.unlocked ? ' is-active' : ''}`;
    pip.textContent = rank.badge;
    pip.title = rank.title;
    careerLadder.append(pip);
  }
  careerCard.append(careerCopy, careerLadder);
  container.appendChild(careerCard);

  const studio = document.createElement('section');
  studio.className = 'home-studio';
  const studioCopy = document.createElement('div');
  const studioLabel = document.createElement('span'); studioLabel.className = 'section-kicker'; studioLabel.textContent = 'NETWORK STUDIO';
  const studioTitle = document.createElement('h2'); studioTitle.textContent = 'Small lab. Entire campus. Your network.';
  const studioText = document.createElement('p'); studioText.textContent = 'Build connected sites with a clear view of every device. Practice real troubleshooting in the guided labs below.';
  const studioButton = document.createElement('button'); studioButton.type = 'button'; studioButton.className = 'primary-button'; studioButton.textContent = 'Design a network →';
  studioButton.addEventListener('click', () => actions.onOpenBuilder?.());
  studioCopy.append(studioLabel, studioTitle, studioText, studioButton);
  const studioArt = document.createElement('div'); studioArt.className = 'home-studio-art'; studioArt.setAttribute('aria-hidden', 'true');
  for (const kind of ['server', 'switch', 'router', 'client']) studioArt.append(equipmentIcon(kind));
  studio.append(studioCopy, studioArt); container.append(studio);
  const library = document.createElement('section'); library.className = 'home-issue-library';
  const libraryCopy = document.createElement('div'); const libraryTitle = document.createElement('h2'); libraryTitle.textContent = 'Practice the problems you will meet in the field.';
  const libraryText = document.createElement('p'); libraryText.textContent = '200 issues · foundational, common, and rare · live repair labs and evidence-based case studies.'; libraryCopy.append(libraryTitle, libraryText);
  const libraryButton = document.createElement('button'); libraryButton.type = 'button'; libraryButton.textContent = 'Explore issue library'; libraryButton.addEventListener('click', () => actions.onOpenIssues?.()); library.append(libraryCopy, libraryButton); container.append(library);

  // S19.md: "Show Ready offline only after worker activation and successful
  // required-cache checks" — actions.offlineReady is set only once the
  // service worker's onOfflineReady fires, which Workbox only calls after
  // precaching every required asset succeeds.
  if (actions.offlineReady) {
    const offlineNote = document.createElement('p');
    offlineNote.className = 'home-offline-ready';
    offlineNote.setAttribute('role', 'status');
    offlineNote.textContent = 'Ready offline';
    container.appendChild(offlineNote);
  }

  if (state.pendingMissionRequest) {
    container.appendChild(renderPendingMissionPrompt(state, actions));
  }

  const continueButton = document.createElement('button');
  continueButton.type = 'button';
  continueButton.className = 'home-continue';
  continueButton.textContent = 'Continue mission';
  const hasMission = Boolean(state.mission);
  continueButton.disabled = !hasMission;
  continueButton.setAttribute('aria-disabled', String(!hasMission));
  if (hasMission) {
    continueButton.addEventListener('click', () => actions.onContinue?.());
  }
  container.appendChild(continueButton);

  container.appendChild(renderSaveStatusBanner(state, actions));

  if (state.error) {
    const error = document.createElement('p');
    error.className = 'form-error';
    error.setAttribute('role', 'alert');
    error.textContent = state.error;
    container.appendChild(error);
  }

  const recommendedHeading = document.createElement('h2');
  recommendedHeading.className = 'home-section-heading';
  recommendedHeading.textContent = 'Recommended job';
  container.appendChild(recommendedHeading);
  const recommendedRow = document.createElement('div');
  recommendedRow.className = 'home-recommended-row';
  const recommendedText = document.createElement('span');
  const recommendation = actions.recommendation ?? { kind: 'code', code: 'TF1-HM-1-P-START' };
  recommendedText.textContent =
    recommendation.kind === 'code'
      ? recommendation.code
      : `${familyLabel(recommendation.family)}, tier ${recommendation.tier}`;
  const startRecommended = document.createElement('button');
  startRecommended.type = 'button';
  startRecommended.textContent = 'Start';
  startRecommended.addEventListener('click', () => actions.onStartRecommended?.());
  recommendedRow.append(recommendedText, startRecommended);
  container.appendChild(recommendedRow);

  const skillsHeading = document.createElement('h2');
  skillsHeading.className = 'home-section-heading';
  skillsHeading.textContent = 'Choose a skill';
  container.appendChild(skillsHeading);
  const skillsRow = document.createElement('div');
  skillsRow.className = 'home-skills-row';
  for (const skill of SKILLS) {
    const button = document.createElement('button');
    button.type = 'button';
    const tier = recommendedTier(state.profile, skill.family);
    button.textContent = `${skill.label} · Tier ${tier}`;
    button.addEventListener('click', () => actions.onStartVariation?.(skill.family));
    skillsRow.appendChild(button);
  }
  container.appendChild(skillsRow);

  const seedHeading = document.createElement('h2');
  seedHeading.className = 'home-section-heading';
  seedHeading.textContent = 'Enter seed';
  container.appendChild(seedHeading);
  const seedForm = document.createElement('form');
  seedForm.className = 'home-seed-form';
  const seedInput = document.createElement('input');
  seedInput.type = 'text';
  seedInput.placeholder = 'TF1-BR-3-D-12345';
  seedInput.setAttribute('aria-label', 'Case code');
  const seedButton = document.createElement('button');
  seedButton.type = 'submit';
  seedButton.textContent = 'Go';
  seedForm.append(seedInput, seedButton);
  seedForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (seedInput.value.trim() === '') return;
    actions.onStartCode?.(seedInput.value.trim());
  });
  container.appendChild(seedForm);

  const configureHeading = document.createElement('h2');
  configureHeading.className = 'home-section-heading';
  configureHeading.textContent = 'Configure a network';
  container.appendChild(configureHeading);

  const configureRow = document.createElement('div');
  configureRow.className = 'home-configure-row';
  for (const [layoutId, label] of [
    ['HM', 'Home lab'],
    ['BR', 'Branch'],
    ['OF', 'Office'],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'home-configure-button';
    button.textContent = label;
    button.addEventListener('click', () => actions.onStartConfigure?.(layoutId));
    configureRow.appendChild(button);
  }
  container.appendChild(configureRow);

  const progressButton = document.createElement('button');
  progressButton.type = 'button';
  progressButton.className = 'home-progress-button';
  progressButton.textContent = 'Progress';
  progressButton.addEventListener('click', () => actions.onOpenProgress?.());
  container.appendChild(progressButton);

  const studyButton = document.createElement('button');
  studyButton.type = 'button';
  studyButton.className = 'home-study-button';
  studyButton.textContent = 'Study';
  studyButton.addEventListener('click', () => actions.onOpenStudy?.());
  container.appendChild(studyButton);

  const referenceButton = document.createElement('button');
  referenceButton.type = 'button';
  referenceButton.className = 'home-reference-button';
  referenceButton.textContent = 'Reference';
  referenceButton.addEventListener('click', () => actions.onOpenReference?.());
  container.appendChild(referenceButton);

  container.appendChild(renderBackupSection(actions));

  return container;
}

// The guided career campaign screen (career.js). A themed rank ladder plus the
// active rank's assignment cards; completed ranks stay open to revisit, locked
// ones show what's ahead. Each Start hands off to the same mission engine the
// rest of the app uses.
export function renderCareer(state, actions = {}) {
  const container = document.createElement('div');
  container.className = 'career-screen';
  const progress = careerProgress(state.profile);

  const header = document.createElement('div');
  header.className = 'career-header';
  const back = document.createElement('button');
  back.type = 'button'; back.className = 'career-back'; back.textContent = '← Home';
  back.addEventListener('click', () => actions.onHome?.());
  header.appendChild(back);
  const kicker = document.createElement('span'); kicker.className = 'section-kicker'; kicker.textContent = 'NORTHLINE · FIELD OPERATIONS';
  const title = document.createElement('h1'); title.textContent = 'Your career';
  const lead = document.createElement('p'); lead.className = 'career-lead';
  lead.textContent = progress.allComplete
    ? 'You’ve reached Network Engineer. Every ticket is replayable — or design a network of your own.'
    : 'Clear each assignment to earn the next rank. Everything is explained as you go — hover any device or interface for a plain-language breakdown.';
  const meter = document.createElement('div'); meter.className = 'career-meter';
  const meterFill = document.createElement('div'); meterFill.className = 'career-meter-fill';
  meterFill.style.width = `${Math.round((progress.completedCount / progress.total) * 100)}%`;
  meter.appendChild(meterFill);
  const meterLabel = document.createElement('p'); meterLabel.className = 'career-meter-label';
  meterLabel.textContent = `${progress.completedCount} of ${progress.total} assignments complete`;
  header.append(kicker, title, lead, meter, meterLabel);
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
    section.className = `career-rank${rank.complete ? ' is-complete' : rank.unlocked ? ' is-unlocked' : ' is-locked'}`;
    const rankHead = document.createElement('div'); rankHead.className = 'career-rank-head';
    const badge = document.createElement('span'); badge.className = 'career-rank-badge'; badge.textContent = rank.badge;
    const rankTitles = document.createElement('div');
    const rankTitle = document.createElement('h2'); rankTitle.textContent = rank.title;
    const rankTag = document.createElement('p'); rankTag.className = 'career-rank-tagline'; rankTag.textContent = rank.tagline;
    rankTitles.append(rankTitle, rankTag);
    const rankStatus = document.createElement('span'); rankStatus.className = 'career-rank-status';
    rankStatus.textContent = rank.complete ? 'Complete' : rank.unlocked ? `${rank.doneCount}/${rank.items.length}` : 'Locked';
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
  const marker = document.createElement('span'); marker.className = 'career-assignment-marker';
  marker.textContent = assignment.status === 'done' ? '✓' : assignment.status === 'active' ? '▶' : '🔒';
  const title = document.createElement('h3'); title.textContent = assignment.title;
  head.append(marker, title);
  card.appendChild(head);

  const story = document.createElement('p'); story.className = 'career-assignment-story'; story.textContent = assignment.story;
  card.appendChild(story);

  const foot = document.createElement('div'); foot.className = 'career-assignment-foot';
  const skill = document.createElement('span'); skill.className = 'career-assignment-skill'; skill.textContent = assignment.skill;
  foot.appendChild(skill);

  if (assignment.status !== 'locked') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = assignment.status === 'active' ? 'primary-button' : 'career-replay';
    button.textContent = assignment.status === 'done' ? 'Replay' : 'Start assignment';
    button.addEventListener('click', () => actions.onStartAssignment?.(assignment.id));
    foot.appendChild(button);
  } else {
    const locked = document.createElement('span'); locked.className = 'career-assignment-locked'; locked.textContent = 'Finish the previous ticket to unlock';
    foot.appendChild(locked);
  }
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
    dt.textContent = entry.deviceKind ? `${entry.title} [${entry.deviceKind}]` : entry.title;
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
  heading.textContent = device.name;
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
    item.textContent = `${check.passed ? '✓' : '✗'} ${check.message}`;
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

const MISSION_TABS = [
  { id: 'network', label: 'Network' },
  { id: 'device', label: 'Device' },
  { id: 'findings', label: 'Findings' },
];

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
  const req = document.createElement('p');
  req.className = 'brief-requirements';
  req.textContent = `Intended target subnet ${requirements.targetSubnet}/${requirements.targetPrefix} (VLAN ${requirements.targetVlan}); protected subnet ${requirements.protectedSubnet}/${requirements.protectedPrefix} (VLAN ${requirements.protectedVlan}); portal ${mission.targetName}.`;
  container.appendChild(req);

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
export function renderMission(state, actions = {}, activeTab = 'network') {
  const mission = state.mission;
  const container = document.createElement('div');
  container.className = 'mission-screen';
  container.dataset.activeTab = activeTab;
  const mode = trainingMode(mission, state.profile);
  container.dataset.trainingMode = mode;

  const header = document.createElement('div');
  header.className = 'mission-header';
  const brand = document.createElement('div'); brand.className = 'workspace-brand'; brand.textContent = 'FIELD';
  const brandSub = document.createElement('span'); brandSub.textContent = 'PRACTICE LAB'; brand.append(brandSub); header.append(brand);
  const title = document.createElement('span');
  title.className = 'mission-title';
  title.textContent =
    mission.mode === 'configure' ? `Configure: ${mission.network.layoutId}` : (mission.caseCode ?? 'Mission');
  header.appendChild(title);
  if (mission.caseCode) {
    const replayButton = document.createElement('button');
    replayButton.type = 'button';
    replayButton.className = 'mission-replay';
    replayButton.textContent = 'Replay';
    replayButton.addEventListener('click', () => actions.onReplay?.());
    header.appendChild(replayButton);
    const variationButton = document.createElement('button');
    variationButton.type = 'button';
    variationButton.className = 'mission-variation';
    variationButton.textContent = 'New variation';
    variationButton.addEventListener('click', () => actions.onNewVariation?.());
    header.appendChild(variationButton);
  } else if (mission.mode === 'configure') {
    // Configure sessions have no caseCode to Replay from (S15.md); Reset
    // restores the same attempt's own stored initial (healthy) network.
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'mission-reset';
    resetButton.textContent = 'Reset';
    resetButton.addEventListener('click', () => actions.onRequestReset?.());
    header.appendChild(resetButton);
  }
  const referenceButton = document.createElement('button');
  referenceButton.type = 'button';
  referenceButton.className = 'mission-reference';
  referenceButton.textContent = 'Reference';
  referenceButton.addEventListener('click', () => actions.onOpenReference?.());
  header.appendChild(referenceButton);
  const exitButton = document.createElement('button');
  exitButton.type = 'button';
  exitButton.className = 'mission-exit';
  exitButton.textContent = 'Exit';
  exitButton.addEventListener('click', () => actions.onExit?.());
  header.appendChild(exitButton);
  container.appendChild(header);
  if (state.saveStatus === 'error' || state.saveStatus === 'quota') {
    container.appendChild(renderSaveStatusBanner(state, actions));
  }
  if (state.error) {
    const error = document.createElement('p');
    error.className = 'form-error';
    error.setAttribute('role', 'alert');
    error.textContent = state.error;
    container.appendChild(error);
  }
  if (state.pendingReset) {
    const resetPrompt = document.createElement('div');
    resetPrompt.className = 'home-pending-prompt';
    resetPrompt.setAttribute('role', 'alertdialog');
    const message = document.createElement('p');
    message.textContent = 'Reset will discard every change and restore the original healthy network.';
    resetPrompt.appendChild(message);
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => actions.onCancelReset?.());
    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.textContent = 'Reset';
    confirmButton.addEventListener('click', () => actions.onConfirmReset?.());
    resetPrompt.append(cancelButton, confirmButton);
    container.appendChild(resetPrompt);
  }
  if (state.pendingMissionRequest) {
    container.appendChild(renderPendingMissionPrompt(state, actions));
  }
  const workOrder = document.createElement('details'); workOrder.className = 'work-order';
  const summary = document.createElement('summary'); summary.textContent = mission.mode === 'repair' ? 'Work order · Restore customer connectivity' : 'Lab brief · Configure and verify the network';
  workOrder.append(summary, renderBrief(state, actions)); container.append(workOrder);
  const level = mode === 'console' ? 'independent' : mode, next = nextGuidance(mission);
  const guide = document.createElement('section'); guide.className = 'workspace-guide'; guide.setAttribute('aria-label', 'Learning guidance');
  const guideLabel = document.createElement('span'); guideLabel.className = 'guide-stage'; guideLabel.textContent = level === 'guided' ? `GUIDED · ${next.step}/4` : level === 'coached' ? 'COACHED' : 'INDEPENDENT';
  const guideCopy = document.createElement('div');
  const guideTitle = document.createElement('strong'); guideTitle.textContent = level === 'independent' ? 'Your workspace. Your investigation.' : next.title;
  const guideDetail = document.createElement('p'); guideDetail.textContent = mode === 'console' ? 'Use the device consoles to inspect, configure, and verify. Test the portal with curl from both workstations, then cite evidence in Findings. Physical cable repairs remain on the canvas. Type ? for supported commands.' : next.detail;
  guideDetail.hidden = !(coachingExpanded.get(mission.id) ?? level === 'guided');
  const help = document.createElement('button'); help.type = 'button'; help.textContent = guideDetail.hidden ? 'Show guidance' : 'Hide guidance'; help.setAttribute('aria-expanded', String(!guideDetail.hidden));
  container.classList.toggle('coach-hidden', guideDetail.hidden);
  help.addEventListener('click', () => { guideDetail.hidden = !guideDetail.hidden; container.classList.toggle('coach-hidden', guideDetail.hidden); coachingExpanded.set(mission.id, !guideDetail.hidden); help.textContent = guideDetail.hidden ? 'Show guidance' : 'Hide guidance'; help.setAttribute('aria-expanded', String(!guideDetail.hidden)); });
  guideCopy.append(guideTitle, guideDetail); guide.append(guideLabel, guideCopy, help); container.append(guide);

  const tabList = document.createElement('div');
  tabList.className = 'mission-tabs';
  tabList.setAttribute('role', 'tablist');
  for (const tab of MISSION_TABS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = tab.id === activeTab ? 'mission-tab mission-tab-active' : 'mission-tab';
    button.textContent = tab.label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', tab.id === activeTab ? 'true' : 'false');
    button.addEventListener('click', () => actions.onTabChange?.(tab.id));
    tabList.appendChild(button);
  }
  container.appendChild(tabList);

  const panels = document.createElement('div');
  panels.className = 'mission-panels';

  const networkPanel = document.createElement('div');
  networkPanel.className = 'mission-panel mission-panel-network';
  networkPanel.hidden = activeTab !== 'network';
  if (!canvasViews.has(mission.id)) canvasViews.set(mission.id, {});
  const targetPortIds = mission.network.ports.filter(p => p.deviceId === mission.targetClientId).map(p => p.id);
  const guideCable = mode === 'guided' && next.step === 3 ? mission.network.links.find(l => !l.connected && (targetPortIds.includes(l.aPortId) || targetPortIds.includes(l.bPortId))) : null;
  networkPanel.appendChild(
    renderTopology(mission.network, {
      selectedDeviceId: state.selectedDeviceId,
      onSelectDevice: actions.onSelectDevice,
      onSelectLink: actions.onSelectLink,
      reconnectLinkId: state.reconnect?.linkId ?? null,
      viewState: canvasViews.get(mission.id),
      compactList: true,
      guideDeviceId: mode === 'guided' && next.step === 1 ? mission.targetClientId : null,
      guideLinkId: guideCable?.id,
    }),
  );
  if (state.reconnect) {
    networkPanel.appendChild(renderReconnectPanel(state, actions));
  }
  if (guideCable) {
    const tip = document.createElement('aside'); tip.className = 'action-coach cable-coach';
    tip.textContent = state.reconnect ? '↓ Choose the workstation endpoint and its assigned access-switch port, then Connect. The work order identifies the assigned VLAN.' : '↙ The dashed cable is disconnected. Select it to inspect both endpoints and reconnect the workstation.';
    if (!state.reconnect) { const inspect = document.createElement('button'); inspect.type = 'button'; inspect.textContent = 'Inspect highlighted cable'; inspect.addEventListener('click', () => actions.onSelectLink?.(guideCable.id)); tip.append(inspect); }
    networkPanel.prepend(tip);
  }
  panels.appendChild(networkPanel);

  const devicePanel = document.createElement('div');
  devicePanel.className = 'mission-panel mission-panel-device';
  devicePanel.hidden = activeTab !== 'device';
  devicePanel.appendChild(renderDevicePanel(state, actions));
  panels.appendChild(devicePanel);

  const findingsPanel = document.createElement('div');
  findingsPanel.className = 'mission-panel mission-panel-findings';
  findingsPanel.hidden = activeTab !== 'findings';
  findingsPanel.appendChild(
    renderFindings(state, {
      ...actions,
      completionChecks:
        mission.mode === 'repair' ? evaluateCompletion(mission).checks : evaluateConfigureChecklist(mission).checks,
    }),
  );
  panels.appendChild(findingsPanel);

  container.appendChild(panels);
  if (mode === 'guided') {
    const target = next.step === 2 ? devicePanel.querySelector('.device-tests button')
      : next.step === 3 && !guideCable ? devicePanel.querySelector('#inspector-tab-configure')
      : next.step === 4 ? [...tabList.children].find(b => b.textContent === 'Findings') : null;
    if (target) {
      const hint = next.step === 2 ? '↓ Run a baseline test. A failure is useful evidence.' : next.step === 3 ? '↓ Compare settings with the work order before changing them.' : '↓ Verify both PCs, then select evidence and write your repair note.';
      const tip = document.createElement('p'); tip.className = 'action-coach'; tip.id = 'action-coach-tip'; tip.textContent = hint;
      target.parentElement.insertBefore(tip, target); target.classList.add('coach-target'); target.setAttribute('aria-describedby', tip.id);
    }
  }

  if (state.recentDevices.length > 0) {
    const recent = document.createElement('div');
    recent.className = 'mission-recent-devices';
    const label = document.createElement('span');
    label.textContent = 'Recent: ';
    recent.appendChild(label);
    for (const deviceId of state.recentDevices) {
      const device = mission.network.devices.find((d) => d.id === deviceId);
      if (!device) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mission-recent-device';
      button.textContent = device.name;
      button.addEventListener('click', () => actions.onSelectDevice?.(deviceId));
      recent.appendChild(button);
    }
    container.appendChild(recent);
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

  const lessonNote = document.createElement('p');
  lessonNote.className = 'debrief-lesson-note';
  lessonNote.textContent = 'Related lesson: available once the study pack is built.';
  container.appendChild(lessonNote);

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
  homeButton.textContent = 'Home';
  homeButton.addEventListener('click', () => actions.onHome?.());
  actionsRow.append(homeButton);
  container.appendChild(actionsRow);

  return container;
}
