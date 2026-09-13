// IndexedDB persistence for The Field Solo, behind a small adapter so engine
// code and Node tests never need a real (or emulated) IndexedDB.
//
// Database "the-field-solo" v1, stores: profile (key "local"),
// mission (key "active"), recovery (key: ISO timestamp).

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
      for (const put of puts) {
        tx.objectStore(put.store).put(put.value, put.key);
      }
      for (const del of deletes) {
        tx.objectStore(del.store).delete(del.key);
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
      for (const { store, key, value } of puts) {
        data[store].set(key, value);
      }
      for (const { store, key } of deletes) {
        data[store].delete(key);
      }
    },
  };
}

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
  if (!backup.profile || typeof backup.profile !== 'object' || backup.profile.schema !== 1) {
    return { ok: false, error: 'Backup profile is not valid.' };
  }
  if (backup.mission !== null && typeof backup.mission !== 'object') {
    return { ok: false, error: 'Backup mission is not valid.' };
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
  return { ok: true };
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
