import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore, createMemoryAdapter } from '../../src/solo/store.js';
import { createHealthyLayout, deriveRequirements } from '../../src/solo/layouts.js';

function validProfile(overrides = {}) {
  return {
    schema: 1,
    openingEnabled: true,
    textScale: 1,
    completedRuns: [],
    studyAnswers: [],
    cardReviews: [],
    recentFingerprints: [],
    counters: { runs: 0, assisted: 0, independent: 0 },
    evidence: { P: {}, I: {}, V: {}, D: {} },
    countedAttemptIds: [],
    ...overrides,
  };
}

function validMission(overrides = {}) {
  const network = createHealthyLayout('HM', 42, 130);
  return {
    schema: 1,
    id: 'restored-mission',
    caseCode: null,
    initialNetwork: network,
    network,
    recipeIds: [],
    targetClientId: 'PC1',
    protectedClientId: 'PC2',
    targetName: 'portal.northline.test',
    startedAt: '2026-09-13T00:00:00.000Z',
    elapsedMs: 0,
    assisted: false,
    events: [],
    selectedFindingIds: [],
    completionNote: null,
    status: 'active',
    mode: 'configure',
    requirements: deriveRequirements(network),
    hintLevels: {},
    compactedEventCount: 0,
    ...overrides,
  };
}

function validBackup(overrides = {}) {
  return {
    format: 'the-field-solo',
    version: 1,
    exportedAt: '2026-09-13T00:00:00.000Z',
    profile: validProfile(),
    mission: null,
    ...overrides,
  };
}

test('loadLocal returns null profile/mission before anything is saved', async () => {
  const store = openStore(createMemoryAdapter());
  const { profile, mission } = await store.loadLocal();
  assert.equal(profile, null);
  assert.equal(mission, null);
});

test('saveLocal then loadLocal round-trips both records atomically', async () => {
  const store = openStore(createMemoryAdapter());
  const profile = { schema: 1, openingEnabled: true, textScale: 1 };
  const mission = { id: 'm1' };
  await store.saveLocal(profile, mission);
  const loaded = await store.loadLocal();
  assert.deepEqual(loaded.profile, profile);
  assert.deepEqual(loaded.mission, mission);
});

test('saveProfile preserves the existing mission (wraps loadLocal/saveLocal)', async () => {
  const store = openStore(createMemoryAdapter());
  await store.saveMission({ id: 'm1' });
  await store.saveProfile({ schema: 1, openingEnabled: false, textScale: 1 });
  const loaded = await store.loadLocal();
  assert.equal(loaded.profile.openingEnabled, false);
  assert.deepEqual(loaded.mission, { id: 'm1' });
});

test('saveMission preserves the existing profile', async () => {
  const store = openStore(createMemoryAdapter());
  await store.saveProfile({ schema: 1, openingEnabled: true, textScale: 1.25 });
  await store.saveMission({ id: 'm2' });
  const loaded = await store.loadLocal();
  assert.equal(loaded.profile.textScale, 1.25);
  assert.deepEqual(loaded.mission, { id: 'm2' });
});

test('loadProfile/loadMission read through loadLocal', async () => {
  const store = openStore(createMemoryAdapter());
  await store.saveLocal({ schema: 1, openingEnabled: true, textScale: 1 }, { id: 'm3' });
  assert.equal((await store.loadProfile()).textScale, 1);
  assert.deepEqual(await store.loadMission(), { id: 'm3' });
});

test('exportData returns a stamped backup of the current local data', async () => {
  const store = openStore(createMemoryAdapter());
  const profile = { schema: 1, openingEnabled: true, textScale: 1 };
  await store.saveLocal(profile, null);
  const backup = await store.exportData();
  assert.equal(backup.format, 'the-field-solo');
  assert.equal(backup.version, 1);
  assert.equal(typeof backup.exportedAt, 'string');
  assert.deepEqual(backup.profile, profile);
  assert.equal(backup.mission, null);
});

test('replaceData rejects a backup with the wrong format/version', async () => {
  const store = openStore(createMemoryAdapter());
  const result = await store.replaceData(validBackup({ format: 'something-else' }));
  assert.equal(result.ok, false);
  assert.match(result.error, /format/i);
});

test('replaceData rejects a backup without a valid profile', async () => {
  const store = openStore(createMemoryAdapter());
  const result = await store.replaceData(validBackup({ profile: { schema: 2 } }));
  assert.equal(result.ok, false);
});

test('replaceData rejects a backup over the 5MiB limit', async () => {
  const store = openStore(createMemoryAdapter());
  const big = validBackup({ profile: validProfile({ padding: 'x'.repeat(6 * 1024 * 1024) }) });
  const result = await store.replaceData(big);
  assert.equal(result.ok, false);
  assert.match(result.error, /5MiB/);
});

test('replaceData rejects a mission with an invalid network (model invariants enforced)', async () => {
  const store = openStore(createMemoryAdapter());
  const brokenMission = validMission({ network: { schema: 1, devices: 'not-an-array', ports: [], links: [], dnsRecords: [] } });
  const result = await store.replaceData(validBackup({ mission: brokenMission }));
  assert.equal(result.ok, false);
});

test('replaceData rejects a mission referencing a device that does not exist', async () => {
  const store = openStore(createMemoryAdapter());
  const brokenMission = validMission({ targetClientId: 'NOPE' });
  const result = await store.replaceData(validBackup({ mission: brokenMission }));
  assert.equal(result.ok, false);
});

test('replaceData installs a valid backup and keeps exactly one recovery record', async () => {
  const adapter = createMemoryAdapter();
  const store = openStore(adapter);
  await store.saveLocal(validProfile(), validMission({ id: 'before' }));

  const first = await store.replaceData(validBackup({ mission: validMission({ id: 'restored-1' }) }));
  assert.equal(first.ok, true);
  assert.equal((await store.loadLocal()).mission.id, 'restored-1');
  assert.equal((await adapter.listKeys('recovery')).length, 1);

  const second = await store.replaceData(validBackup({ mission: validMission({ id: 'restored-2' }) }));
  assert.equal(second.ok, true);
  assert.equal((await store.loadLocal()).mission.id, 'restored-2');
  assert.equal((await adapter.listKeys('recovery')).length, 1, 'older recovery records are removed');
});

test('a forced storage failure rejects rather than resolving', async () => {
  const failingAdapter = {
    async readMany() {
      return [null, null];
    },
    async listKeys() {
      return [];
    },
    async writeMany() {
      throw new Error('disk full');
    },
  };
  const store = openStore(failingAdapter);
  await assert.rejects(() => store.saveProfile({ schema: 1, openingEnabled: true, textScale: 1 }));
});
