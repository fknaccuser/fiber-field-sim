import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore, createMemoryAdapter, previewBackup } from '../../src/solo/store.js';
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
    id: 'm1',
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

test('exporting current data and previewing it round-trips exactly, active configuration and progress intact', async () => {
  const store = openStore(createMemoryAdapter());
  const profile = validProfile({
    counters: { runs: 3, assisted: 1, independent: 2 },
    evidence: { P: { P1: 2 }, I: {}, V: {}, D: {} },
    completedRuns: [{ attemptId: 'a1', mode: 'repair', recipes: ['P1'], tier: 1, family: 'P', assisted: false, elapsedMs: 60000, completedAt: '2026-09-13T00:00:00.000Z', selectedFindings: [], note: 'note' }],
  });
  const mission = validMission();
  await store.saveLocal(profile, mission);

  const exported = await store.exportData();
  const text = JSON.stringify(exported);
  const preview = previewBackup(text);
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.equal(preview.hasMission, true);
  assert.equal(preview.counts.completedRuns, 1);
  assert.equal(preview.counts.independentRepairs, 2);
  assert.deepEqual(preview.backup.profile, profile);
  assert.deepEqual(preview.backup.mission, mission);

  // Replacing with its own export is a no-op round trip.
  const result = await store.replaceData(preview.backup);
  assert.equal(result.ok, true);
  const reloaded = await store.loadLocal();
  assert.deepEqual(reloaded.profile, profile);
  assert.deepEqual(reloaded.mission, mission);
});

test('corrupt JSON is rejected by previewBackup without touching storage', async () => {
  const store = openStore(createMemoryAdapter());
  await store.saveLocal(validProfile(), validMission());
  const before = await store.loadLocal();

  const preview = previewBackup('{not valid json');
  assert.equal(preview.ok, false);
  assert.match(preview.error, /JSON/i);

  const after = await store.loadLocal();
  assert.deepEqual(after, before, 'a rejected preview never mutates current work');
});

test('wrong format/version is rejected', () => {
  const preview = previewBackup(JSON.stringify({ format: 'other', version: 1, exportedAt: 'x', profile: validProfile(), mission: null }));
  assert.equal(preview.ok, false);
  assert.match(preview.error, /format/i);
});

test('invalid references (a device the network does not have) are rejected', () => {
  const backup = {
    format: 'the-field-solo',
    version: 1,
    exportedAt: '2026-09-13T00:00:00.000Z',
    profile: validProfile(),
    mission: validMission({ targetClientId: 'GHOST' }),
  };
  const preview = previewBackup(JSON.stringify(backup));
  assert.equal(preview.ok, false);
});

test('an invalid import never mutates current work (a failed import never wipes current work)', async () => {
  const store = openStore(createMemoryAdapter());
  const profile = validProfile({ counters: { runs: 5, assisted: 0, independent: 5 } });
  const mission = validMission({ id: 'keep-me' });
  await store.saveLocal(profile, mission);

  const badBackup = { format: 'the-field-solo', version: 1, exportedAt: 'x', profile: { schema: 2 }, mission: null };
  const result = await store.replaceData(badBackup);
  assert.equal(result.ok, false);

  const after = await store.loadLocal();
  assert.deepEqual(after.profile, profile);
  assert.deepEqual(after.mission, mission);
});

test('restore requires an explicit replaceData call; previewing alone changes nothing', async () => {
  const store = openStore(createMemoryAdapter());
  const original = validProfile({ counters: { runs: 1, assisted: 0, independent: 1 } });
  await store.saveLocal(original, null);

  const otherBackup = {
    format: 'the-field-solo',
    version: 1,
    exportedAt: '2026-09-13T00:00:00.000Z',
    profile: validProfile({ counters: { runs: 99, assisted: 0, independent: 99 } }),
    mission: null,
  };
  const preview = previewBackup(JSON.stringify(otherBackup));
  assert.equal(preview.ok, true);

  const stillOriginal = await store.loadLocal();
  assert.deepEqual(stillOriginal.profile, original, 'preview alone must not replace anything');
});
