// IndexedDB persistence for The Field Solo, behind a small adapter so engine
// code and Node tests never need a real (or emulated) IndexedDB.
//
// Database "the-field-solo" v1, stores: profile (key "local"),
// mission (key "active"), recovery (key: ISO timestamp).

import { validateNetwork } from './model.js';

const DB_NAME = 'the-field-solo';
const DB_VERSION = 1;
const STORE_NAMES = ['profile', 'mission', 'recovery'];
const BACKUP_FORMAT = 'the-field-solo';
const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export function createIndexedDBAdapter(idbFactory = globalThis.indexedDB) {
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = idbFactory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of STORE_NAMES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name);
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readMany(entries) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const storeNames = [...new Set(entries.map((entry) => entry.store))];
      const tx = db.transaction(storeNames, 'readonly');
      const results = new Array(entries.length);
      entries.forEach((entry, index) => {
        const request = tx.objectStore(entry.store).get(entry.key);
        request.onsuccess = () => {
          results[index] = request.result;
        };
      });
      tx.oncomplete = () => resolve(results);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function listKeys(store) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([store], 'readonly');
      const request = tx.objectStore(store).getAllKeys();
      request.onsuccess = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function writeMany(puts, deletes = []) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const storeNames = [...new Set([...puts.map((p) => p.store), ...deletes.map((d) => d.store)])];
      const tx = db.transaction(storeNames, 'readwrite');
      // Deletes first: a delete and a put can legitimately target the same key
      // (e.g. replaceData's new recovery snapshot can collide, at ISO-timestamp
      // resolution, with the previous one it is pruning), and the put's value
      // must be what survives.
      for (const del of deletes) {
        tx.objectStore(del.store).delete(del.key);
      }
      for (const put of puts) {
        tx.objectStore(put.store).put(put.value, put.key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return { readMany, writeMany, listKeys };
}

// A trivial synchronous-under-the-hood adapter for Node tests. It follows the
// same read/write-many, resolve-on-completion contract as the real adapter,
// without emulating any part of the IndexedDB API.
export function createMemoryAdapter() {
  const data = { profile: new Map(), mission: new Map(), recovery: new Map() };
  return {
    async readMany(entries) {
      return entries.map(({ store, key }) => data[store].get(key));
    },
    async listKeys(store) {
      return [...data[store].keys()];
    },
    async writeMany(puts, deletes = []) {
      for (const { store, key } of deletes) {
        data[store].delete(key);
      }
      for (const { store, key, value } of puts) {
        data[store].set(key, value);
      }
    },
  };
}

const MISSION_MODES = new Set(['repair', 'configure']);
const MISSION_STATUSES = new Set(['active', 'completed']);
const EVENT_KINDS = new Set(['change', 'test', 'inspection', 'assistance']);
const RUN_SUMMARY_LIMIT = 100; // DATA_CONTRACTS.md "Keep 100 summaries"
const RECENT_FINGERPRINT_LIMIT = 20; // SCENARIOS.md's freshness window

function validateProfileShape(profile) {
  if (!profile || typeof profile !== 'object' || profile.schema !== 1) {
    return { ok: false, error: 'Backup profile is not valid.' };
  }
  if (typeof profile.openingEnabled !== 'boolean') {
    return { ok: false, error: 'Backup profile is missing openingEnabled.' };
  }
  if (typeof profile.textScale !== 'number') {
    return { ok: false, error: 'Backup profile is missing textScale.' };
  }
  for (const field of ['completedRuns', 'studyAnswers', 'cardReviews', 'recentFingerprints']) {
    if (!Array.isArray(profile[field])) {
      return { ok: false, error: `Backup profile's ${field} must be a list.` };
    }
  }
  if (profile.completedRuns.length > RUN_SUMMARY_LIMIT) {
    return { ok: false, error: 'Backup profile has too many completed runs.' };
  }
  if (profile.recentFingerprints.length > RECENT_FINGERPRINT_LIMIT) {
    return { ok: false, error: 'Backup profile has too many recent fingerprints.' };
  }
  const counters = profile.counters;
  if (
    !counters ||
    typeof counters !== 'object' ||
    !['runs', 'assisted', 'independent'].every((k) => Number.isInteger(counters[k]) && counters[k] >= 0)
  ) {
    return { ok: false, error: 'Backup profile counters are not valid.' };
  }
  const evidence = profile.evidence;
  if (!evidence || typeof evidence !== 'object' || !['P', 'I', 'V', 'D'].every((family) => evidence[family] && typeof evidence[family] === 'object')) {
    return { ok: false, error: 'Backup profile evidence is not valid.' };
  }
  for (const family of ['P', 'I', 'V', 'D']) {
    for (const count of Object.values(evidence[family])) {
      if (!Number.isInteger(count) || count < 0) {
        return { ok: false, error: 'Backup profile evidence counts are not valid.' };
      }
    }
  }
  if (!Array.isArray(profile.countedAttemptIds ?? [])) {
    return { ok: false, error: 'Backup profile countedAttemptIds must be a list.' };
  }
  return { ok: true };
}

function validateMissionShape(mission) {
  if (mission === null) return { ok: true };
  if (typeof mission !== 'object') {
    return { ok: false, error: 'Backup mission is not valid.' };
  }
  if (mission.schema !== 1) {
    return { ok: false, error: 'Backup mission schema must be 1.' };
  }
  if (typeof mission.id !== 'string' || !mission.id) {
    return { ok: false, error: 'Backup mission is missing an id.' };
  }
  if (!MISSION_MODES.has(mission.mode)) {
    return { ok: false, error: 'Backup mission has an unrecognized mode.' };
  }
  if (!MISSION_STATUSES.has(mission.status)) {
    return { ok: false, error: 'Backup mission has an unrecognized status.' };
  }
  for (const key of ['network', 'initialNetwork']) {
    const result = validateNetwork(mission[key]);
    if (!result.ok) {
      return { ok: false, error: `Backup mission's ${key} is not valid: ${result.message}` };
    }
  }
  const deviceIds = new Set(mission.network.devices.map((d) => d.id));
  if (!deviceIds.has(mission.targetClientId) || !deviceIds.has(mission.protectedClientId)) {
    return { ok: false, error: 'Backup mission references a device that does not exist in its own network.' };
  }
  if (!Array.isArray(mission.recipeIds)) {
    return { ok: false, error: 'Backup mission recipeIds must be a list.' };
  }
  if (!Array.isArray(mission.events)) {
    return { ok: false, error: 'Backup mission events must be a list.' };
  }
  for (const event of mission.events) {
    if (!event || !EVENT_KINDS.has(event.kind)) {
      return { ok: false, error: 'Backup mission has an event with an unrecognized kind.' };
    }
  }
  if (!Array.isArray(mission.selectedFindingIds)) {
    return { ok: false, error: 'Backup mission selectedFindingIds must be a list.' };
  }
  if (typeof mission.elapsedMs !== 'number' || mission.elapsedMs < 0) {
    return { ok: false, error: 'Backup mission elapsedMs is not valid.' };
  }
  if (typeof mission.assisted !== 'boolean') {
    return { ok: false, error: 'Backup mission assisted flag is not valid.' };
  }
  if (!mission.requirements || typeof mission.requirements !== 'object') {
    return { ok: false, error: 'Backup mission requirements are not valid.' };
  }
  if (!mission.hintLevels || typeof mission.hintLevels !== 'object') {
    return { ok: false, error: 'Backup mission hintLevels are not valid.' };
  }
  if (!Number.isInteger(mission.compactedEventCount) || mission.compactedEventCount < 0) {
    return { ok: false, error: 'Backup mission compactedEventCount is not valid.' };
  }
  return { ok: true };
}

// Validates shape, size, enums and model invariants (S17.md: "validate all
// shapes/limits/enums and model invariants") — never mutates or partially
// installs anything; validation is entirely read-only over the parsed
// object, called before replaceData ever touches storage.
function validateBackup(backup) {
  if (!backup || typeof backup !== 'object') {
    return { ok: false, error: 'Backup is not a valid file.' };
  }
  if (backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION) {
    return { ok: false, error: 'Backup format is not recognized.' };
  }
  if (typeof backup.exportedAt !== 'string' || !backup.exportedAt) {
    return { ok: false, error: 'Backup is missing an export date.' };
  }
  let byteLength;
  try {
    byteLength = new TextEncoder().encode(JSON.stringify(backup)).length;
  } catch {
    return { ok: false, error: 'Backup could not be read.' };
  }
  if (byteLength > MAX_BACKUP_BYTES) {
    return { ok: false, error: 'Backup is larger than 5MiB.' };
  }
  const profileResult = validateProfileShape(backup.profile);
  if (!profileResult.ok) return profileResult;
  const missionResult = validateMissionShape(backup.mission ?? null);
  if (!missionResult.ok) return missionResult;
  return { ok: true };
}

// previewBackup(rawText) -> {ok:true, backup, counts:{...}, exportedAt,
// hasMission} | {ok:false, error}. Parses and validates without touching
// storage (S17.md: "show preview counts and replacement notice" before any
// replacement); corrupt JSON and every rejection above are reported the same
// way a caller can render directly, never as a thrown exception.
export function previewBackup(rawText) {
  let backup;
  try {
    backup = JSON.parse(rawText);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  const validation = validateBackup(backup);
  if (!validation.ok) {
    return validation;
  }
  return {
    ok: true,
    backup,
    exportedAt: backup.exportedAt,
    hasMission: backup.mission !== null,
    counts: {
      completedRuns: backup.profile.completedRuns.length,
      studyAnswers: backup.profile.studyAnswers.length,
      cardReviews: backup.profile.cardReviews.length,
      independentRepairs: backup.profile.counters.independent,
    },
  };
}

export function openStore(adapter = createIndexedDBAdapter()) {
  async function loadLocal() {
    const [profile, mission] = await adapter.readMany([
      { store: 'profile', key: 'local' },
      { store: 'mission', key: 'active' },
    ]);
    return { profile: profile ?? null, mission: mission ?? null };
  }

  async function saveLocal(profile, mission) {
    await adapter.writeMany([
      { store: 'profile', key: 'local', value: profile },
      { store: 'mission', key: 'active', value: mission ?? null },
    ]);
  }

  async function loadProfile() {
    return (await loadLocal()).profile;
  }

  async function saveProfile(profile) {
    const { mission } = await loadLocal();
    await saveLocal(profile, mission);
  }

  async function loadMission() {
    return (await loadLocal()).mission;
  }

  async function saveMission(mission) {
    const { profile } = await loadLocal();
    await saveLocal(profile, mission);
  }

  async function exportData() {
    const { profile, mission } = await loadLocal();
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      profile,
      mission,
    };
  }

  async function replaceData(backup) {
    const validation = validateBackup(backup);
    if (!validation.ok) {
      return validation;
    }
    const current = await loadLocal();
    const previousRecoveryKeys = await adapter.listKeys('recovery');
    const recoveryKey = new Date().toISOString();
    await adapter.writeMany(
      [
        { store: 'recovery', key: recoveryKey, value: current },
        { store: 'profile', key: 'local', value: backup.profile },
        { store: 'mission', key: 'active', value: backup.mission ?? null },
      ],
      previousRecoveryKeys.map((key) => ({ store: 'recovery', key })),
    );
    return { ok: true };
  }

  return {
    loadLocal,
    saveLocal,
    loadProfile,
    saveProfile,
    loadMission,
    saveMission,
    exportData,
    replaceData,
  };
}
