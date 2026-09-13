import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialProfile,
  boot,
  applyProfileUpdate,
  persistProfile,
  updateAndPersistProfile,
} from '../../src/solo/app.js';
import { openStore, createMemoryAdapter } from '../../src/solo/store.js';

test('boot creates and persists an initial profile when none is saved', async () => {
  const adapter = createMemoryAdapter();
  const store = openStore(adapter);
  const state = await boot(store);
  assert.equal(state.screen, 'opening');
  assert.deepEqual(state.profile, createInitialProfile());
  assert.equal(state.mission, null);
  const saved = await store.loadProfile();
  assert.deepEqual(saved, createInitialProfile());
});

test('boot with openingEnabled false starts on Home (refresh preserves the skip-opening preference)', async () => {
  const store = openStore(createMemoryAdapter());
  await store.saveProfile({ ...createInitialProfile(), openingEnabled: false });
  const state = await boot(store);
  assert.equal(state.screen, 'home');
});

test('boot preserves the persisted text scale', async () => {
  const store = openStore(createMemoryAdapter());
  await store.saveProfile({ ...createInitialProfile(), textScale: 1.5 });
  const state = await boot(store);
  assert.equal(state.profile.textScale, 1.5);
});

test('boot restores a previously saved mission', async () => {
  const store = openStore(createMemoryAdapter());
  await store.saveMission({ id: 'm1' });
  const state = await boot(store);
  assert.deepEqual(state.mission, { id: 'm1' });
});

test('applyProfileUpdate is pure: marks saving without touching storage', () => {
  const before = { profile: createInitialProfile(), saveStatus: 'idle', error: 'stale' };
  const after = applyProfileUpdate(before, { textScale: 1.25 });
  assert.equal(after.profile.textScale, 1.25);
  assert.equal(after.saveStatus, 'saving');
  assert.equal(after.error, null);
});

test('persistProfile resolves to saved on success', async () => {
  const store = openStore(createMemoryAdapter());
  const state = applyProfileUpdate({ profile: createInitialProfile(), saveStatus: 'idle' }, { openingEnabled: false });
  const result = await persistProfile(state, store);
  assert.equal(result.saveStatus, 'saved');
  assert.equal((await store.loadProfile()).openingEnabled, false);
});

test('a forced storage failure shows Save failed, not Saved, and keeps the in-memory change', async () => {
  const failingStore = {
    async saveProfile() {
      throw new Error('disk full');
    },
  };
  const state = applyProfileUpdate({ profile: createInitialProfile(), saveStatus: 'idle' }, { textScale: 1.5 });
  const result = await persistProfile(state, failingStore);
  assert.equal(result.saveStatus, 'error');
  assert.equal(result.error, 'Save failed');
  assert.equal(result.profile.textScale, 1.5, 'in-memory change is retained, not rolled back');
});

test('retrying after failure with a working store now succeeds', async () => {
  const store = openStore(createMemoryAdapter());
  let attempt = 0;
  const flakyStore = {
    async saveProfile(profile) {
      attempt += 1;
      if (attempt === 1) throw new Error('disk full');
      await store.saveProfile(profile);
    },
  };
  let state = { profile: createInitialProfile(), saveStatus: 'idle' };
  state = await updateAndPersistProfile(state, flakyStore, { openingEnabled: false });
  assert.equal(state.saveStatus, 'error');
  state = await persistProfile(state, flakyStore);
  assert.equal(state.saveStatus, 'saved');
  assert.equal((await store.loadProfile()).openingEnabled, false);
});
