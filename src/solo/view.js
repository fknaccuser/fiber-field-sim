// Screen rendering for The Field Solo. Touches `document`; engine state
// (app.js) stays DOM-free so it is testable under `node --test`.

import { renderTopology } from './diagram.js';

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

function renderDevicePanel(network, selectedDeviceId) {
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
    }),
  );
  panels.appendChild(networkPanel);

  const devicePanel = document.createElement('div');
  devicePanel.className = 'mission-panel mission-panel-device';
  devicePanel.hidden = activeTab !== 'device';
  devicePanel.appendChild(renderDevicePanel(mission.network, state.selectedDeviceId));
  panels.appendChild(devicePanel);

  const findingsPanel = document.createElement('div');
  findingsPanel.className = 'mission-panel mission-panel-findings';
  findingsPanel.hidden = activeTab !== 'findings';
  const findingsPlaceholder = document.createElement('p');
  findingsPlaceholder.textContent = 'Findings appear here once tests are available.';
  findingsPanel.appendChild(findingsPlaceholder);
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
