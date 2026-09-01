import { createEmptyWrongBook, normalizeWrongBook } from './wrong-book.js';

const DB_NAME = 'tcm-exam-v1';
const DB_VERSION = 1;
const STORE = 'app';
const STATE_KEY = 'state';
let saveQueue = Promise.resolve();

const now = () => new Date().toISOString();
const id = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function createDefaultState() {
  return {
    schemaVersion: 1,
    deviceId: id(),
    createdAt: now(),
    updatedAt: now(),
    settings: {
      theme: 'system',
      showExtendedLearning: true,
      announceAnswerResult: true,
      updatedAt: now(),
      version: 1
    },
    attempts: {},
    wrongs: {},
    wrongBook: createEmptyWrongBook(),
    favorites: {},
    important: {},
    later: {},
    knowledge: {},
    sessions: {},
    currentSessionId: null,
    exams: {},
    currentExamId: null,
    reinforcementQueue: [],
    activity: [],
    sync: { code: null, passwordHash: null, lastSyncedAt: null, backend: 'not-configured' }
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function loadState() {
  const stored = await transact('readonly', store => store.get(STATE_KEY));
  if (!stored) {
    const initial = createDefaultState();
    await saveState(initial);
    return initial;
  }
  return normalizeState(stored);
}

export function saveState(state) {
  state.updatedAt = now();
  const snapshot = structuredClone(state);
  saveQueue = saveQueue
    .catch(() => {})
    .then(() => transact('readwrite', store => store.put(snapshot, STATE_KEY)));
  return saveQueue;
}

export function normalizeState(value) {
  if (!value || value.schemaVersion !== 1) throw new Error('备份版本不受支持');
  const base = createDefaultState();
  return {
    ...base,
    ...value,
    settings: { ...base.settings, ...(value.settings ?? {}) },
    attempts: value.attempts ?? {},
    wrongs: value.wrongs ?? {},
    wrongBook: normalizeWrongBook(value.wrongBook),
    favorites: value.favorites ?? {},
    important: value.important ?? {},
    later: value.later ?? {},
    knowledge: value.knowledge ?? {},
    sessions: value.sessions ?? {},
    exams: value.exams ?? {},
    reinforcementQueue: Array.isArray(value.reinforcementQueue) ? value.reinforcementQueue : [],
    activity: Array.isArray(value.activity) ? value.activity : [],
    sync: { ...base.sync, ...(value.sync ?? {}) }
  };
}

export function createVersionedRecord(previous, values) {
  return {
    ...(previous ?? {}),
    ...values,
    recordId: previous?.recordId ?? id(),
    version: (previous?.version ?? 0) + 1,
    updatedAt: now()
  };
}

export function createSession(questionIds, config, mode = 'practice') {
  return createVersionedRecord(null, {
    id: id(),
    mode,
    questionIds,
    config,
    answers: {},
    page: 1,
    completed: false,
    startedAt: now(),
    completedAt: null
  });
}

export function recordActivity(state, entry) {
  state.activity.unshift({ id: id(), at: now(), ...entry });
  state.activity = state.activity.slice(0, 800);
}

export function backupPayload(state) {
  const copy = structuredClone(state);
  copy.sync = { code: copy.sync?.code ?? null, passwordHash: null, lastSyncedAt: copy.sync?.lastSyncedAt ?? null, backend: copy.sync?.backend ?? 'not-configured' };
  return {
    format: 'tcm-exam-backup',
    formatVersion: 1,
    exportedAt: now(),
    data: copy
  };
}

export function validateBackup(payload) {
  if (!payload || payload.format !== 'tcm-exam-backup' || payload.formatVersion !== 1 || !payload.data) {
    throw new Error('不是有效的中医刷题系统 V1 备份');
  }
  return normalizeState(payload.data);
}
