import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  submitOpeningCommand,
  completeInitialization,
} from '../../src/solo/app.js';

test('initial state opens on the opening screen', () => {
  const state = createInitialState();
  assert.equal(state.screen, 'opening');
  assert.equal(state.error, null);
});

test('enable, case-insensitive and trimmed, opens initialization', () => {
  const state = createInitialState();
  const next = submitOpeningCommand(state, '  ENABLE  ');
  assert.equal(next.screen, 'initializing');
  assert.equal(next.error, null);
});

test('an unrecognized command stays on the opening screen with an error', () => {
  const state = createInitialState();
  const next = submitOpeningCommand(state, 'nope');
  assert.equal(next.screen, 'opening');
  assert.equal(next.error, 'Command not recognized.');
});

test('an empty command stays on the opening screen with an error', () => {
  const state = createInitialState();
  const next = submitOpeningCommand(state, '');
  assert.equal(next.screen, 'opening');
  assert.equal(next.error, 'Command not recognized.');
});

test('completing initialization moves to home', () => {
  const initializing = submitOpeningCommand(createInitialState(), 'enable');
  const home = completeInitialization(initializing);
  assert.equal(home.screen, 'home');
});

test('completing initialization is a no-op outside the initializing screen', () => {
  const state = createInitialState();
  const unchanged = completeInitialization(state);
  assert.equal(unchanged.screen, 'opening');
});
