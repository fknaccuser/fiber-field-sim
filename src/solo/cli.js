// The small supported CLI (ENGINE_RULES.md "Small CLI"). Commands dispatch
// through applyAction/forward.js only — never by editing rendered strings.
// Pure: no DOM, no fetch, no Date.now, does not mutate its input.

import { applyAction } from './actions.js';
import { canReach, resolveName } from './forward.js';

const MAX_OUTPUT_LINES = 200;

// Each command's keyword sequence is matched by unambiguous per-token prefix
// (ENGINE_RULES.md: "Resolve unambiguous keyword prefixes... never guess an
// ambiguous prefix"). `arg` names the single trailing argument token's kind,
// if the command takes one.
const SWITCH_COMMANDS = {
  user: [{ keywords: ['enable'], arg: null, run: (ctx) => ({ mode: 'privileged' }) }],
  privileged: [
    { keywords: ['disable'], arg: null, run: () => ({ mode: 'user' }) },
    { keywords: ['configure', 'terminal'], arg: null, run: () => ({ mode: 'config' }) },
    { keywords: ['show', 'interfaces', 'status'], arg: null, run: (ctx) => ({ output: showInterfacesStatus(ctx) }) },
    { keywords: ['show', 'vlan', 'brief'], arg: null, run: (ctx) => ({ output: showVlanBrief(ctx) }) },
    { keywords: ['show', 'interfaces', 'trunk'], arg: null, run: (ctx) => ({ output: showInterfacesTrunk(ctx) }) },
    { keywords: ['show', 'running-config'], arg: null, run: (ctx) => ({ output: showRunningConfigSwitch(ctx) }) },
  ],
  config: [
    { keywords: ['interface'], arg: 'port', run: (ctx, port) => interfaceEnter(ctx, port) },
    { keywords: ['exit'], arg: null, run: () => ({ mode: 'privileged' }) },
    { keywords: ['end'], arg: null, run: () => ({ mode: 'privileged', interfacePortId: null }) },
  ],
  interface: [
    { keywords: ['exit'], arg: null, run: () => ({ mode: 'config' }) },
    { keywords: ['end'], arg: null, run: () => ({ mode: 'privileged', interfacePortId: null }) },
    { keywords: ['shutdown'], arg: null, run: (ctx) => setAdmin(ctx, false) },
    { keywords: ['no', 'shutdown'], arg: null, run: (ctx) => setAdmin(ctx, true) },
    { keywords: ['switchport', 'access', 'vlan'], arg: 'vlan', run: (ctx, vlan) => setAccessVlan(ctx, vlan) },
    {
      keywords: ['switchport', 'trunk', 'allowed', 'vlan'],
      arg: 'vlanList',
      run: (ctx, vlans) => setTrunkVlans(ctx, vlans),
    },
  ],
};

const ROUTER_COMMANDS = {
  user: [{ keywords: ['enable'], arg: null, run: () => ({ mode: 'privileged' }) }],
  privileged: [
    { keywords: ['disable'], arg: null, run: () => ({ mode: 'user' }) },
    { keywords: ['show', 'ip', 'interface', 'brief'], arg: null, run: (ctx) => ({ output: showIpInterfaceBrief(ctx) }) },
    { keywords: ['show', 'ip', 'route'], arg: null, run: (ctx) => ({ output: showIpRoute(ctx) }) },
    { keywords: ['show', 'running-config'], arg: null, run: (ctx) => ({ output: showRunningConfigRouter(ctx) }) },
    { keywords: ['ping'], arg: 'ip', run: (ctx, ip) => runPing(ctx, ip) },
  ],
};

const CLIENT_COMMANDS = {
  user: [
    { keywords: ['ipconfig', '/all'], arg: null, run: (ctx) => ({ output: ipconfig(ctx, true) }) },
    { keywords: ['ipconfig'], arg: null, run: (ctx) => ({ output: ipconfig(ctx, false) }) },
    { keywords: ['ping'], arg: 'ip', run: (ctx, ip) => runPing(ctx, ip) },
    { keywords: ['nslookup'], arg: 'name', run: (ctx, name) => runNslookup(ctx, name) },
  ],
};

// "Server terminal: read-only status plus ping IP" (ENGINE_RULES.md) names no
// specific status command. Reusing "show running-config" — a name already
// established for switches/routers as exactly this kind of read-only
// state dump — rather than inventing a new one; a genuine but non-blocking
// ambiguity, recorded here and in HANDOFF.md.
const SERVER_COMMANDS = {
  user: [
    { keywords: ['show', 'running-config'], arg: null, run: (ctx) => ({ output: showRunningConfigServer(ctx) }) },
    { keywords: ['ping'], arg: 'ip', run: (ctx, ip) => runPing(ctx, ip) },
  ],
};

function commandsFor(deviceKind) {
  switch (deviceKind) {
    case 'switch':
      return SWITCH_COMMANDS;
    case 'router':
      return ROUTER_COMMANDS;
    case 'client':
      return CLIENT_COMMANDS;
    case 'server':
      return SERVER_COMMANDS;
    default:
      return {};
  }
}

function findDevice(network, deviceId) {
  return network.devices.find((d) => d.id === deviceId);
}

function findPort(network, portId) {
  return network.ports.find((p) => p.id === portId);
}

// Resolves input tokens against a mode's command table by unambiguous
// per-token prefix. Returns {command, argToken} or null.
function resolveCommand(inputTokens, candidates) {
  if (inputTokens.length === 0) return null;
  const lower = inputTokens.map((t) => t.toLowerCase());
  const matches = candidates.filter((candidate) => {
    const expectedLength = candidate.keywords.length + (candidate.arg ? 1 : 0);
    if (lower.length !== expectedLength) return false;
    return candidate.keywords.every((keyword, i) => keyword.toLowerCase().startsWith(lower[i]));
  });
  if (matches.length !== 1) return null; // 0 = unsupported, >1 = ambiguous: never guess
  const command = matches[0];
  const argToken = command.arg ? inputTokens[command.keywords.length] : null;
  return { command, argToken };
}

function exampleFor(candidates) {
  const first = candidates[0];
  if (!first) return '';
  return [...first.keywords, ...(first.arg ? [placeholderFor(first.arg)] : [])].join(' ');
}

function placeholderFor(arg) {
  switch (arg) {
    case 'port':
      return 'Gi0/1';
    case 'vlan':
      return '10';
    case 'vlanList':
      return '10,20';
    case 'ip':
      return '10.0.0.1';
    case 'name':
      return 'portal.northline.test';
    default:
      return '';
  }
}

function interfaceEnter(ctx, portLabel) {
  const port = ctx.network.ports.find(
    (p) => p.deviceId === ctx.device.id && p.label.toLowerCase() === portLabel.toLowerCase(),
  );
  if (!port) {
    return { output: [`% Invalid interface: ${portLabel}`] };
  }
  return { mode: 'interface', interfacePortId: port.id };
}

function requireInterfacePort(ctx) {
  if (!ctx.terminal.interfacePortId) return null;
  return findPort(ctx.network, ctx.terminal.interfacePortId);
}

function setAdmin(ctx, adminUp) {
  const port = requireInterfacePort(ctx);
  if (!port) return { output: ['% No interface selected.'] };
  const result = applyAction(ctx.network, { type: 'setPortAdmin', portId: port.id, adminUp });
  if (!result.ok) return { output: [`% ${result.message}`] };
  return { network: result.state, action: { type: 'setPortAdmin', portId: port.id, adminUp }, output: [] };
}

function setAccessVlan(ctx, vlanText) {
  const port = requireInterfacePort(ctx);
  if (!port) return { output: ['% No interface selected.'] };
  const vlanId = Number(vlanText);
  const result = applyAction(ctx.network, { type: 'setAccessVlan', portId: port.id, vlanId });
  if (!result.ok) return { output: [`% ${result.message}`] };
  return { network: result.state, action: { type: 'setAccessVlan', portId: port.id, vlanId }, output: [] };
}

function setTrunkVlans(ctx, vlanListText) {
  const port = requireInterfacePort(ctx);
  if (!port) return { output: ['% No interface selected.'] };
  const vlans = vlanListText.split(',').map((v) => Number(v.trim()));
  const result = applyAction(ctx.network, { type: 'setTrunkAllowedVlans', portId: port.id, vlans });
  if (!result.ok) return { output: [`% ${result.message}`] };
  return { network: result.state, action: { type: 'setTrunkAllowedVlans', portId: port.id, vlans }, output: [] };
}

function runPing(ctx, ip) {
  const result = canReach(ctx.network, ctx.device.id, ip);
  return { output: [result.ok ? `Reply from ${ip}: ok` : `Request timed out. (${result.code})`] };
}

function runNslookup(ctx, name) {
  const result = resolveName(ctx.network, ctx.device.id, name);
  return {
    output: result.ok ? [`Name: ${name}`, `Address: ${result.address}`] : [`*** Lookup failed (${result.code})`],
  };
}

function ipconfig(ctx, all) {
  const device = ctx.device;
  const lines = [`IPv4 Address. . . . . . . . . . . : ${device.ip ?? '(none)'}`, `Subnet Mask . . . . . . . . . . . : ${device.prefix ?? ''}`];
  if (all) {
    lines.push(`Default Gateway . . . . . . . . . : ${device.gateway ?? '(none)'}`);
    lines.push(`DNS Servers . . . . . . . . . . . : ${device.dns ?? '(none)'}`);
  }
  return lines;
}

function showInterfacesStatus(ctx) {
  return ctx.network.ports
    .filter((p) => p.deviceId === ctx.device.id)
    .map((p) => `${p.label} ${p.adminUp ? 'up' : 'admin down'} ${p.mode}`);
}

function showVlanBrief(ctx) {
  return ctx.network.ports
    .filter((p) => p.deviceId === ctx.device.id && p.mode === 'access')
    .map((p) => `VLAN${p.accessVlan}  ${p.label}`);
}

function showInterfacesTrunk(ctx) {
  return ctx.network.ports
    .filter((p) => p.deviceId === ctx.device.id && p.mode === 'trunk')
    .map((p) => `${p.label} allowed vlans: ${p.allowedVlans.join(',')}`);
}

function showRunningConfigSwitch(ctx) {
  const lines = ['!'];
  for (const port of ctx.network.ports.filter((p) => p.deviceId === ctx.device.id)) {
    lines.push(`interface ${port.label}`);
    if (!port.adminUp) lines.push(' shutdown');
    if (port.mode === 'access') lines.push(` switchport access vlan ${port.accessVlan}`);
    if (port.mode === 'trunk') lines.push(` switchport trunk allowed vlan ${port.allowedVlans.join(',')}`);
    lines.push('!');
  }
  return lines;
}

function showIpInterfaceBrief(ctx) {
  const lines = [];
  for (const segment of ctx.device.routerSegments ?? []) {
    const port = findPort(ctx.network, segment.portId);
    lines.push(`${port?.label ?? segment.portId} ${segment.ip} ${port?.adminUp ? 'up' : 'admin down'}`);
  }
  return lines;
}

function showIpRoute(ctx) {
  return (ctx.device.routerSegments ?? []).map((s) => `C  ${s.ip.split('.').slice(0, 3).join('.')}.0/${s.prefix}`);
}

function showRunningConfigRouter(ctx) {
  const lines = ['!'];
  for (const segment of ctx.device.routerSegments ?? []) {
    lines.push(`interface ${segment.portId}${segment.vlanId !== null ? `.${segment.vlanId}` : ''}`);
    lines.push(` ip address ${segment.ip} /${segment.prefix}`);
    lines.push('!');
  }
  return lines;
}

function showRunningConfigServer(ctx) {
  const lines = ['!', `hostname ${ctx.device.name}`];
  for (const record of ctx.network.dnsRecords.filter((r) => r.serverId === ctx.device.id)) {
    lines.push(`dns-record ${record.name} ${record.address}`);
  }
  lines.push('!');
  return lines;
}

// executeCommand(state, terminal, command, origin): origin is true when this
// submission originated from the command builder (possibly hand-edited).
// Returns {ok, state, terminal, output, code?, message?}. A rejected command
// never changes network state, only the terminal's own output/history.
export function executeCommand(state, terminal, commandText, origin = false) {
  const mission = state.mission;
  const network = mission.network;
  const device = findDevice(network, terminal.deviceId);
  const trimmed = commandText.trim();
  const historyEntry = trimmed;

  function finish({ output = [], network: nextNetwork = network, mode, interfacePortId, action, ok = true, code, message }) {
    const nextTerminal = {
      ...terminal,
      mode: mode ?? terminal.mode,
      interfacePortId: interfacePortId !== undefined ? interfacePortId : terminal.interfacePortId,
      history: trimmed === '' ? terminal.history : [...terminal.history, historyEntry].slice(-MAX_OUTPUT_LINES),
      output: [...terminal.output, `${promptFor(terminal)}${trimmed}`, ...output].slice(-MAX_OUTPUT_LINES),
      builderOrigin: false,
    };
    let nextMission = mission;
    if (action && nextNetwork.revision !== network.revision) {
      nextMission = appendCliChangeEvent(mission, action, network, nextNetwork, device.id, origin);
    }
    nextMission = { ...nextMission, network: nextNetwork };
    if (origin) {
      nextMission = appendAssistanceEvent(nextMission, device.id, 'builder-command');
    }
    return {
      ok,
      code,
      message,
      state: { ...state, mission: nextMission },
      terminal: nextTerminal,
      output,
    };
  }

  if (trimmed === '') {
    return finish({ output: [] });
  }
  if (trimmed === '?') {
    return finish({ output: getHelp(terminal, '') });
  }

  const tokens = trimmed.split(/\s+/);
  const table = commandsFor(device.kind);
  const candidates = table[terminal.mode] ?? [];
  const resolved = resolveCommand(tokens, candidates);
  if (!resolved) {
    const example = exampleFor(candidates);
    return finish({
      output: ['Not supported by this simulator yet.', example ? `Try: ${example}` : ''].filter(Boolean),
      ok: false,
      code: 'UNSUPPORTED',
      message: 'Not supported by this simulator yet.',
    });
  }

  const ctx = { state, network, device, terminal };
  const outcome = resolved.command.run(ctx, resolved.argToken);
  return finish(outcome);
}

function promptFor(terminal) {
  const marker = { user: '>', privileged: '#', config: '(config)#', interface: '(config-if)#' }[terminal.mode] ?? '>';
  return `${terminal.deviceId}${marker} `;
}

function appendCliChangeEvent(mission, action, before, after, deviceId, assisted) {
  const index = mission.compactedEventCount + mission.events.length;
  // Every CLI mutating command (shutdown/no shutdown/switchport ...) touches
  // exactly one port; a simpler extractor than app.js's generic one is fine.
  const beforePort = before.ports.find((p) => p.id === action.portId) ?? null;
  const afterPort = after.ports.find((p) => p.id === action.portId) ?? null;
  const event = {
    id: String(index),
    index,
    kind: 'change',
    revision: after.revision,
    deviceId,
    details: { action, before: beforePort, after: afterPort },
    assistance: Boolean(assisted),
  };
  return { ...mission, events: [...mission.events, event] };
}

function appendAssistanceEvent(mission, deviceId, type) {
  const index = mission.compactedEventCount + mission.events.length;
  const event = {
    id: String(index),
    index,
    kind: 'assistance',
    revision: mission.network.revision,
    deviceId,
    details: { type },
    assistance: true,
  };
  return { ...mission, events: [...mission.events, event] };
}

// getHelp(terminal, prefix): valid continuations in the current mode
// (ENGINE_RULES.md's declared two-argument signature). DATA_CONTRACTS.md's
// Terminal session shape doesn't include a device-kind field, but getHelp
// cannot pick a command table without knowing it and has no network access
// to look the device up — so createTerminalSession stores `deviceKind`
// alongside the documented fields, a minimal, additive extension rather than
// a contradiction of the given shape.
export function getHelp(terminal, prefixText = '') {
  const table = commandsFor(terminal.deviceKind);
  const candidates = table[terminal.mode] ?? [];
  const tokens = prefixText.trim() === '' ? [] : prefixText.trim().split(/\s+/);
  if (tokens.length === 0) {
    return candidates.map((c) => [...c.keywords, ...(c.arg ? [placeholderFor(c.arg)] : [])].join(' '));
  }
  const lower = tokens.map((t) => t.toLowerCase());
  const matching = candidates.filter((c) =>
    lower.every((token, i) => i < c.keywords.length && c.keywords[i].toLowerCase().startsWith(token)),
  );
  return matching.map((c) => [...c.keywords, ...(c.arg ? [placeholderFor(c.arg)] : [])].join(' '));
}

export function createTerminalSession(deviceId, deviceKind) {
  return { deviceId, deviceKind, mode: 'user', interfacePortId: null, history: [], output: [], builderOrigin: false };
}
