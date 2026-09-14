// Device inspection, configuration-form action-building, and mission tests.
// The action-builders are pure (DOM-free, testable); the render* functions
// touch `document` like view.js/diagram.js.

import { canReach, resolveName, testService } from './forward.js';
import { getHelp } from './cli.js';
const expandedConsoles = new Set();

function findPort(network, portId) {
  return network.ports.find((p) => p.id === portId);
}

function arraysEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

// --- Pure action-builders: draft vs current -> the applyAction envelopes that
// differ. Only ever build actions for fields that actually changed, so a
// no-op Apply dispatches nothing.

export function buildClientActions(device, draft) {
  const actions = [];
  if (draft.ip !== device.ip || Number(draft.prefix) !== device.prefix) {
    actions.push({ type: 'setClientAddress', deviceId: device.id, ip: draft.ip, prefix: Number(draft.prefix) });
  }
  if (draft.gateway !== device.gateway) {
    actions.push({ type: 'setClientGateway', deviceId: device.id, gateway: draft.gateway });
  }
  if (draft.dns !== device.dns) {
    actions.push({ type: 'setClientDns', deviceId: device.id, dns: draft.dns });
  }
  return actions;
}

export function buildPortActions(port, draft) {
  const actions = [];
  if (draft.adminUp !== port.adminUp) {
    actions.push({ type: 'setPortAdmin', portId: port.id, adminUp: draft.adminUp });
  }
  if (port.mode === 'access' && Number(draft.accessVlan) !== port.accessVlan) {
    actions.push({ type: 'setAccessVlan', portId: port.id, vlanId: Number(draft.accessVlan) });
  }
  if (port.mode === 'trunk' && !arraysEqual(draft.allowedVlans, port.allowedVlans)) {
    actions.push({ type: 'setTrunkAllowedVlans', portId: port.id, vlans: draft.allowedVlans });
  }
  return actions;
}

export function buildRouterSegmentActions(device, draft) {
  const actions = [];
  for (const segment of device.routerSegments ?? []) {
    const key = `${segment.portId}|${segment.vlanId}`;
    const segmentDraft = draft[key];
    if (!segmentDraft) continue;
    if (segmentDraft.ip !== segment.ip || Number(segmentDraft.prefix) !== segment.prefix) {
      actions.push({
        type: 'setRouterSegmentAddress',
        deviceId: device.id,
        portId: segment.portId,
        vlanId: segment.vlanId,
        ip: segmentDraft.ip,
        prefix: Number(segmentDraft.prefix),
      });
    }
  }
  return actions;
}

export function buildDnsRecordActions(serverId, dnsRecords, draft) {
  const actions = [];
  for (const record of dnsRecords) {
    if (record.serverId !== serverId) continue;
    const draftAddress = draft[record.name];
    if (draftAddress !== undefined && draftAddress !== record.address) {
      actions.push({ type: 'setDnsRecord', serverId, name: record.name, address: draftAddress });
    }
  }
  return actions;
}

// Parses a comma/space-separated VLAN list into integers (NaN passes through
// so the underlying action's own validation reports a specific error).
export function parseVlanList(text) {
  return String(text ?? '')
    .split(/[,\s]+/)
    .filter((part) => part !== '')
    .map((part) => Number(part));
}

// --- Mission tests (MASTER_DESIGN.md §7 "Bottom context actions: Test").

export function runMissionTest(mission, testKind, deviceId) {
  const network = mission.network;
  const device = network.devices.find((d) => d.id === deviceId);
  const portalServer = network.devices.find((d) => d.id === mission.requirements.portalServerId);
  switch (testKind) {
    case 'pingGateway':
      return canReach(network, deviceId, device?.gateway);
    case 'pingServer':
      return canReach(network, deviceId, portalServer?.ip);
    case 'resolvePortal':
      return resolveName(network, deviceId, mission.targetName);
    case 'openPortal':
      return testService(network, deviceId, mission.targetName);
    case 'checkProtected':
      return testService(network, mission.protectedClientId, mission.targetName);
    default:
      return { ok: false, code: 'UNKNOWN_TEST', trace: [] };
  }
}

// --- Rendering ---

function fieldRow(labelText, input) {
  const row = document.createElement('label');
  row.className = 'form-row';
  const span = document.createElement('span');
  span.textContent = labelText;
  row.append(span, input);
  return row;
}

function textInput(value, { readOnly = false } = {}) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value ?? '';
  input.readOnly = readOnly;
  input.autocomplete = 'off';
  return input;
}

export function renderClientForm(device, onApply) {
  const form = document.createElement('form');
  form.className = 'device-form';
  const ipInput = textInput(device.ip);
  const gatewayInput = textInput(device.gateway);
  const dnsInput = textInput(device.dns);
  form.append(
    fieldRow('IP address (/24)', ipInput),
    fieldRow('Gateway', gatewayInput),
    fieldRow('DNS', dnsInput),
  );

  const applyButton = document.createElement('button');
  applyButton.type = 'submit';
  applyButton.textContent = 'Apply';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => {
    ipInput.value = device.ip ?? '';
    gatewayInput.value = device.gateway ?? '';
    dnsInput.value = device.dns ?? '';
  });
  form.append(applyButton, cancelButton);

  // The Apply result (specific error, if any) is shown by the caller from
  // tracked state, not here: a synchronous re-render happens inside onApply,
  // which would tear down and discard any DOM node this handler still held.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft = { ip: ipInput.value.trim(), prefix: device.prefix, gateway: gatewayInput.value.trim(), dns: dnsInput.value.trim() };
    onApply(buildClientActions(device, draft));
  });

  return form;
}

export function renderPortForm(port, onApply) {
  const form = document.createElement('form');
  form.className = 'device-form';

  const adminInput = document.createElement('input');
  adminInput.type = 'checkbox';
  adminInput.checked = port.adminUp;
  const adminLabel = document.createElement('label');
  adminLabel.className = 'form-row form-row-checkbox';
  const adminText = document.createElement('span');
  adminText.textContent = 'Port enabled';
  adminLabel.append(adminText, adminInput);
  form.appendChild(adminLabel);

  let vlanInput;
  if (port.mode === 'access') {
    vlanInput = textInput(String(port.accessVlan));
    form.appendChild(fieldRow('Access VLAN', vlanInput));
  } else if (port.mode === 'trunk') {
    vlanInput = textInput(port.allowedVlans.join(', '));
    form.appendChild(fieldRow('Allowed VLANs', vlanInput));
  }

  const applyButton = document.createElement('button');
  applyButton.type = 'submit';
  applyButton.textContent = 'Apply';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => {
    adminInput.checked = port.adminUp;
    if (vlanInput) vlanInput.value = port.mode === 'access' ? String(port.accessVlan) : port.allowedVlans.join(', ');
  });
  form.append(applyButton, cancelButton);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft = { adminUp: adminInput.checked };
    if (port.mode === 'access') draft.accessVlan = vlanInput.value.trim();
    if (port.mode === 'trunk') draft.allowedVlans = parseVlanList(vlanInput.value);
    onApply(buildPortActions(port, draft));
  });

  return form;
}

export function renderRouterSegmentForm(device, onApply) {
  const form = document.createElement('form');
  form.className = 'device-form';
  const inputs = {};
  for (const segment of device.routerSegments ?? []) {
    const key = `${segment.portId}|${segment.vlanId}`;
    const input = textInput(segment.ip);
    inputs[key] = input;
    const vlanLabel = segment.vlanId === null ? 'upstream' : `VLAN ${segment.vlanId}`;
    form.appendChild(fieldRow(`${segment.portId} (${vlanLabel})`, input));
  }

  const applyButton = document.createElement('button');
  applyButton.type = 'submit';
  applyButton.textContent = 'Apply';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => {
    for (const segment of device.routerSegments ?? []) {
      inputs[`${segment.portId}|${segment.vlanId}`].value = segment.ip;
    }
  });
  form.append(applyButton, cancelButton);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft = {};
    for (const segment of device.routerSegments ?? []) {
      const key = `${segment.portId}|${segment.vlanId}`;
      draft[key] = { ip: inputs[key].value.trim(), prefix: segment.prefix };
    }
    onApply(buildRouterSegmentActions(device, draft));
  });

  return form;
}

export function renderDnsRecordForm(device, dnsRecords, onApply) {
  const form = document.createElement('form');
  form.className = 'device-form';
  const records = dnsRecords.filter((r) => r.serverId === device.id);
  const inputs = {};
  for (const record of records) {
    const input = textInput(record.address);
    inputs[record.name] = input;
    form.appendChild(fieldRow(record.name, input));
  }

  const applyButton = document.createElement('button');
  applyButton.type = 'submit';
  applyButton.textContent = 'Apply';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => {
    for (const record of records) inputs[record.name].value = record.address;
  });
  form.append(applyButton, cancelButton);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft = {};
    for (const record of records) draft[record.name] = inputs[record.name].value.trim();
    onApply(buildDnsRecordActions(device.id, dnsRecords, draft));
  });

  return form;
}

const TEST_KINDS = [
  { id: 'pingGateway', label: 'Ping gateway' },
  { id: 'pingServer', label: 'Ping server IP' },
  { id: 'resolvePortal', label: 'Resolve portal' },
  { id: 'openPortal', label: 'Open portal' },
  { id: 'checkProtected', label: 'Check protected client' },
];

export function renderTests(deviceId, onRunTest) {
  const container = document.createElement('div');
  container.className = 'device-tests';
  const heading = document.createElement('h3');
  heading.textContent = 'Tests';
  container.appendChild(heading);
  const row = document.createElement('div');
  row.className = 'device-tests-row';
  for (const test of TEST_KINDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = test.label;
    button.addEventListener('click', () => onRunTest(test.id, deviceId));
    row.appendChild(button);
  }
  container.appendChild(row);
  return container;
}

// UI_AND_STORAGE.md's Terminal sub-tab: output text via textContent, a real
// input, Enter/Submit, ? help, builder toggle. Inspect/Configure/Terminal are
// rendered as one stacked panel rather than sub-tabs of a sub-tab — a
// deliberate simplification for this release, not a missing feature (every
// section is present and functional, just not tab-switched independently).
export function renderTerminal(terminal, { onSubmitCommand, onInsertBuilderCommand, showBuilder = true } = {}) {
  const container = document.createElement('div');
  container.className = 'device-terminal';

  const heading = document.createElement('h3');
  heading.textContent = 'Console';
  container.appendChild(heading);
  const expand = document.createElement('button'); expand.type = 'button'; expand.className = 'console-expand'; expand.textContent = 'Expand console'; expand.setAttribute('aria-expanded', 'false');
  const setExpanded = expanded => { container.classList.toggle('console-expanded', expanded); expand.textContent = expanded ? 'Restore console' : 'Expand console'; expand.setAttribute('aria-expanded', String(expanded)); if (expanded) expandedConsoles.add(terminal.deviceId); else expandedConsoles.delete(terminal.deviceId); };
  setExpanded(expandedConsoles.has(terminal.deviceId));
  expand.addEventListener('click', () => setExpanded(!container.classList.contains('console-expanded')));
  container.appendChild(expand);

  const output = document.createElement('pre');
  output.className = 'terminal-output';
  output.textContent = terminal.output.join('\n');
  if (!terminal.output.length) output.textContent = `${terminal.deviceId}>\nConsole ready. Type ? for available commands.`;
  container.appendChild(output);

  const form = document.createElement('form');
  form.className = 'terminal-input-row';
  const label = document.createElement('label');
  label.className = 'terminal-command-field';
  const commandLabel = document.createElement('span'); commandLabel.className = 'visually-hidden'; commandLabel.textContent = `Command for ${terminal.deviceId}`; label.appendChild(commandLabel);
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'terminal-input';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', `Command for ${terminal.deviceId}`);
  let historyIndex = terminal.history.length;
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); historyIndex = Math.max(0, Math.min(terminal.history.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1))); input.value = terminal.history[historyIndex] ?? ''; }
    if (event.key === 'Escape' && container.classList.contains('console-expanded')) expand.click();
  });
  label.appendChild(input);
  form.appendChild(label);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Enter';
  form.appendChild(submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input.value.trim() === '') return; // blank submission is ignored
    const command = input.value;
    input.value = '';
    onSubmitCommand?.(command);
  });
  container.appendChild(form);

  const helpRow = document.createElement('div');
  helpRow.className = 'terminal-help-row';
  const helpButton = document.createElement('button');
  helpButton.type = 'button';
  helpButton.textContent = '?';
  helpButton.title = 'List valid continuations';
  const helpList = document.createElement('div');
  helpList.className = 'terminal-help-list';
  helpButton.addEventListener('click', () => {
    helpList.textContent = getHelp(terminal, input.value).join(' | ') || '(no matching commands)';
  });
  helpRow.append(helpButton, helpList);
  container.appendChild(helpRow);
  if (!showBuilder) return container;

  const builderHeading = document.createElement('p');
  builderHeading.className = 'terminal-builder-heading';
  builderHeading.textContent = 'Command builder';
  container.appendChild(builderHeading);
  const builderList = document.createElement('div');
  builderList.className = 'terminal-builder-list';
  for (const suggestion of getHelp(terminal, '')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = suggestion;
    // Builder insertion sets provenance; typed commands never gain assisted
    // provenance merely by the builder existing on screen.
    button.addEventListener('click', () => {
      input.value = suggestion;
      input.focus();
      onInsertBuilderCommand?.();
    });
    builderList.appendChild(button);
  }
  container.appendChild(builderList);

  return container;
}
