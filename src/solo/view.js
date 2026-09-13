// Screen rendering for The Field Solo. Touches `document`; engine state
// (app.js) stays DOM-free so it is testable under `node --test`.

import { renderTopology } from './diagram.js';
import { terminalSessionFor } from './app.js';
import {
  renderClientForm,
  renderPortForm,
  renderRouterSegmentForm,
  renderDnsRecordForm,
  renderTests,
  renderTerminal,
} from './devices.js';

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

export function renderHome(state, actions = {}) {
  const container = document.createElement('div');
  container.className = 'home-screen';

  const heading = document.createElement('h1');
  heading.textContent = 'The Field';
  container.appendChild(heading);

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

  const heading = document.createElement('p');
  heading.className = 'reconnect-heading';
  heading.textContent = `Reconnecting cable ${reconnect.linkId}`;
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
function renderFindings(mission) {
  const container = document.createElement('div');
  const testEvents = mission.events.filter((event) => event.kind === 'test');
  if (testEvents.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'findings-empty';
    empty.textContent = 'Run a test to record what you observe.';
    container.appendChild(empty);
    return container;
  }
  const list = document.createElement('ol');
  list.className = 'findings-list';
  for (const event of testEvents) {
    const device = mission.network.devices.find((d) => d.id === event.deviceId);
    const label = TEST_LABELS[event.details.testKind] ?? event.details.testKind;
    const outcome = event.details.result.ok ? 'passed' : `failed (${event.details.result.code})`;
    const item = document.createElement('li');
    item.className = event.details.result.ok ? 'findings-row findings-row-pass' : 'findings-row findings-row-fail';
    item.textContent = `#${event.index} · ${label} from ${device?.name ?? event.deviceId}: ${outcome}`;
    list.appendChild(item);
  }
  container.appendChild(list);
  return container;
}

const MISSION_TABS = [
  { id: 'network', label: 'Network' },
  { id: 'device', label: 'Device' },
  { id: 'findings', label: 'Findings' },
];

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
  const exitButton = document.createElement('button');
  exitButton.type = 'button';
  exitButton.className = 'mission-exit';
  exitButton.textContent = 'Exit';
  exitButton.addEventListener('click', () => actions.onExit?.());
  header.appendChild(exitButton);
  container.appendChild(header);

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
  findingsPanel.appendChild(renderFindings(mission));
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
