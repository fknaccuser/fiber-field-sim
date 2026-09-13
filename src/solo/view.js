// Screen rendering for The Field Solo. Touches `document`; engine state
// (app.js) stays DOM-free so it is testable under `node --test`.

import { renderTopology } from './diagram.js';
import { terminalSessionFor, currentHintRecipeId, showCauseCount, showHarmlessDetail } from './app.js';
import {
  renderClientForm,
  renderPortForm,
  renderRouterSegmentForm,
  renderDnsRecordForm,
  renderTests,
  renderTerminal,
} from './devices.js';
import { CUSTOMER_QUESTIONS, CUSTOMER_FACTS, HARMLESS_DETAILS, HINTS, renderHintText, TIER_GOAL_MS } from './content.js';
import { evaluateCompletion, evaluateConfigureChecklist } from './grade.js';
import { allFamilyStats, recommendedTier } from './progress.js';

function describeSaveStatus(status) {
  switch (status) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Save failed';
    default:
      return '';
  }
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

  const status = describeSaveStatus(state.saveStatus);
  if (status) {
    const saveStatus = document.createElement('p');
    saveStatus.className = 'home-save-status';
    saveStatus.setAttribute('role', 'status');
    saveStatus.textContent = status;
    container.appendChild(saveStatus);
  }

  if (state.saveStatus === 'error') {
    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'home-retry-save';
    retryButton.textContent = 'Retry';
    retryButton.addEventListener('click', () => actions.onRetrySave?.());
    container.appendChild(retryButton);
  }

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

function renderInspect(network, device) {
  const list = document.createElement('dl');
  list.className = 'device-inspect';
  const addRow = (term, value) => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
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
    addRow(`Port ${port.label}`, `${port.adminUp ? 'up' : 'administratively down'}, ${port.mode}${vlanNote}`);
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
  container.appendChild(heading);
  container.appendChild(renderInspect(network, device));

  const configureHeading = document.createElement('h3');
  configureHeading.textContent = 'Configure';
  container.appendChild(configureHeading);
  if (state.error) {
    const error = document.createElement('p');
    error.className = 'form-error';
    error.setAttribute('role', 'alert');
    error.textContent = state.error;
    container.appendChild(error);
  }
  container.appendChild(renderConfigure(network, device, (formActions) => actions.onApplyDeviceForm?.(formActions)));

  if (device.kind === 'client') {
    container.appendChild(renderTests(device.id, (testKind, deviceId) => actions.onRunTest?.(testKind, deviceId)));
  }

  const terminal = terminalSessionFor(state, device.id, device.kind);
  container.appendChild(
    renderTerminal(terminal, {
      onSubmitCommand: (text) => actions.onSubmitCommand?.(device.id, device.kind, text),
      onInsertBuilderCommand: () => actions.onInsertBuilderCommand?.(device.id, device.kind),
    }),
  );

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
    const label = TEST_LABELS[event.details.testKind] ?? event.details.testKind;
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

  const header = document.createElement('div');
  header.className = 'mission-header';
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
  const exitButton = document.createElement('button');
  exitButton.type = 'button';
  exitButton.className = 'mission-exit';
  exitButton.textContent = 'Exit';
  exitButton.addEventListener('click', () => actions.onExit?.());
  header.appendChild(exitButton);
  container.appendChild(header);
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
  container.appendChild(renderBrief(state, actions));

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
  networkPanel.appendChild(
    renderTopology(mission.network, {
      selectedDeviceId: state.selectedDeviceId,
      onSelectDevice: actions.onSelectDevice,
      onSelectLink: actions.onSelectLink,
      reconnectLinkId: state.reconnect?.linkId ?? null,
    }),
  );
  if (state.reconnect) {
    networkPanel.appendChild(renderReconnectPanel(state, actions));
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
