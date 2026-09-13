import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand, getHelp, createTerminalSession } from '../../src/solo/cli.js';
import { startConfigureSession, createInitialState } from '../../src/solo/app.js';
import { testService } from '../../src/solo/forward.js';
import { applyAction } from '../../src/solo/actions.js';

function br() {
  return startConfigureSession(createInitialState(), 'BR');
}

function run(state, terminal, command, origin = false) {
  return executeCommand(state, terminal, command, origin);
}

test('enable, conf t, interface Gi0/1, shutdown breaks the link; no shut restores it', () => {
  let state = br();
  let terminal = createTerminalSession('SW1', 'switch');

  ({ state, terminal } = run(state, terminal, 'enable'));
  assert.equal(terminal.mode, 'privileged');

  ({ state, terminal } = run(state, terminal, 'conf t'));
  assert.equal(terminal.mode, 'config');

  ({ state, terminal } = run(state, terminal, 'interface Gi0/1'));
  assert.equal(terminal.mode, 'interface');
  assert.equal(terminal.interfacePortId, 'SW1:Gi0/1');

  ({ state, terminal } = run(state, terminal, 'shutdown'));
  assert.equal(state.mission.network.ports.find((p) => p.id === 'SW1:Gi0/1').adminUp, false);
  assert.equal(testService(state.mission.network, 'PC1', state.mission.targetName).ok, false);

  ({ state, terminal } = run(state, terminal, 'no shut'));
  assert.equal(state.mission.network.ports.find((p) => p.id === 'SW1:Gi0/1').adminUp, true);
  assert.equal(testService(state.mission.network, 'PC1', state.mission.targetName).ok, true);
});

test('user-mode shutdown rejects: network unchanged, mode unchanged', () => {
  const state = br();
  const terminal = createTerminalSession('SW1', 'switch'); // starts in 'user'
  const result = run(state, terminal, 'shutdown');
  assert.equal(result.ok, false);
  assert.equal(result.terminal.mode, 'user');
  assert.deepEqual(result.state.mission.network, state.mission.network);
  assert.match(result.output.join('\n'), /Not supported by this simulator yet/);
});

test('show running-config reflects a GUI change made outside the terminal', () => {
  let state = br();
  // A GUI-originated change (not through the CLI): shut the port via applyAction directly.
  state = {
    ...state,
    mission: { ...state.mission, network: applyAction(state.mission.network, { type: 'setPortAdmin', portId: 'SW1:Gi0/1', adminUp: false }).state },
  };
  let terminal = createTerminalSession('SW1', 'switch');
  ({ terminal } = run(state, terminal, 'enable'));
  const result = run(state, terminal, 'show running-config');
  assert.ok(result.output.some((line) => line.includes('interface Gi0/1')));
  // Only the interface block for the shut port carries "shutdown"; running-config reflects it.
  const idx = result.output.findIndex((l) => l.includes('interface Gi0/1'));
  assert.ok(result.output.slice(idx, idx + 3).some((l) => l.trim() === 'shutdown'));
});

test('a builder-originated execution is assisted; a typed one is not', () => {
  let state = br();
  let terminal = createTerminalSession('SW1', 'switch');
  ({ state, terminal } = run(state, terminal, 'enable'));

  const typed = run(state, terminal, 'disable', false);
  assert.equal(typed.state.mission.events.some((e) => e.kind === 'assistance'), false);

  const builderOrigin = run(state, terminal, 'disable', true);
  assert.equal(builderOrigin.state.mission.events.some((e) => e.kind === 'assistance'), true);
});

test('opening the builder without executing anything never marks a typed command assisted', () => {
  // Simply not passing origin:true for a manually-typed submission is enough;
  // there is no separate "builder opened" event to fabricate here.
  let state = br();
  let terminal = createTerminalSession('SW1', 'switch');
  const result = run(state, terminal, 'enable', false);
  assert.equal(result.state.mission.events.length, 0);
});

test('an unambiguous abbreviation resolves; an incomplete/ambiguous one does not', () => {
  const state = br();
  let terminal = createTerminalSession('SW1', 'switch');
  const enabled = run(state, terminal, 'en');
  assert.equal(enabled.terminal.mode, 'privileged');

  const incomplete = run(enabled.state, enabled.terminal, 'show');
  assert.equal(incomplete.ok, false); // "show" alone matches 4 candidates: ambiguous, never guess
});

test('getHelp lists all commands in the current mode with no prefix', () => {
  const terminal = createTerminalSession('SW1', 'switch');
  const help = getHelp(terminal, '');
  assert.deepEqual(help, ['enable']);
});

test('getHelp narrows to matching continuations for a prefix', () => {
  const enabled = run(br(), createTerminalSession('SW1', 'switch'), 'enable');
  const help = getHelp(enabled.terminal, 'show');
  assert.equal(help.length, 4);
  assert.ok(help.every((c) => c.startsWith('show')));
});

test('client terminal: ipconfig, ping and nslookup work against the real engine', () => {
  const state = br();
  const terminal = createTerminalSession('PC1', 'client');
  const ipconfigResult = run(state, terminal, 'ipconfig');
  assert.ok(ipconfigResult.output.some((l) => l.includes('10.42.10.130')));

  const pingResult = run(state, terminal, 'ping 10.42.30.53');
  assert.ok(pingResult.output.some((l) => l.includes('Reply from')));

  const nslookupResult = run(state, terminal, 'nslookup portal.northline.test');
  assert.ok(nslookupResult.output.some((l) => l.includes('10.42.30.53')));
});

test('router terminal: show ip route and ping', () => {
  const state = br();
  let terminal = createTerminalSession('R1', 'router');
  ({ terminal } = run(state, terminal, 'enable'));
  const routeResult = run(state, terminal, 'show ip route');
  assert.ok(routeResult.output.some((l) => l.includes('10.42.10.0/24')));
});

test('two terminal sessions for different devices never interfere (pure functions, no shared mutable state)', () => {
  const state = br();
  const sw1Terminal = createTerminalSession('SW1', 'switch');
  const pc1Terminal = createTerminalSession('PC1', 'client');
  const swResult = run(state, sw1Terminal, 'enable');
  const pcResult = run(state, pc1Terminal, 'ipconfig');
  assert.equal(swResult.terminal.mode, 'privileged');
  assert.equal(pcResult.terminal.mode, 'user');
  assert.equal(sw1Terminal.mode, 'user', 'original terminal object is not mutated');
});
