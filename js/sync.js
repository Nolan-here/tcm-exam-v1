const COLLECTIONS = ['attempts', 'wrongs', 'favorites', 'important', 'later', 'knowledge', 'sessions', 'exams'];

export function createSyncCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map(value => alphabet[value % alphabet.length]).join('').replace(/(.{5})/, '$1-');
}

export async function hashSyncPassword(code, password) {
  const material = new TextEncoder().encode(`${code}:${password}`);
  const hash = await crypto.subtle.digest('SHA-256', material);
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function createSyncPayload(state) {
  return {
    schemaVersion: state.schemaVersion,
    deviceId: state.deviceId,
    generatedAt: new Date().toISOString(),
    settings: state.settings,
    collections: Object.fromEntries(COLLECTIONS.map(name => [name, Object.values(state[name] ?? {})])),
    reinforcementQueue: state.reinforcementQueue,
    cursors: { currentSessionId: state.currentSessionId, currentExamId: state.currentExamId }
  };
}

function newer(left, right) {
  if (!left) return right;
  if (!right) return left;
  if ((right.version ?? 0) !== (left.version ?? 0)) return (right.version ?? 0) > (left.version ?? 0) ? right : left;
  return (right.updatedAt ?? '') > (left.updatedAt ?? '') ? right : left;
}

export function mergeSyncPayload(state, remote) {
  if (!remote || remote.schemaVersion !== state.schemaVersion) throw new Error('同步数据版本不兼容');
  const merged = structuredClone(state);
  for (const name of COLLECTIONS) {
    merged[name] ??= {};
    for (const record of remote.collections?.[name] ?? []) {
      const key = record.id ?? record.questionId ?? record.recordId;
      if (!key) continue;
      merged[name][key] = newer(merged[name][key], record);
    }
  }
  merged.settings = newer(merged.settings, remote.settings);
  merged.reinforcementQueue = [...new Set([...(merged.reinforcementQueue ?? []), ...(remote.reinforcementQueue ?? [])])];
  const remoteSession = merged.sessions[remote.cursors?.currentSessionId];
  const localSession = merged.sessions[merged.currentSessionId];
  if (remoteSession && !remoteSession.completed && (!localSession || (remoteSession.updatedAt ?? '') > (localSession.updatedAt ?? ''))) {
    merged.currentSessionId = remoteSession.id;
  }
  const remoteExam = merged.exams[remote.cursors?.currentExamId];
  const localExam = merged.exams[merged.currentExamId];
  if (remoteExam && !remoteExam.submitted && (!localExam || (remoteExam.updatedAt ?? '') > (localExam.updatedAt ?? ''))) {
    merged.currentExamId = remoteExam.id;
  }
  merged.updatedAt = new Date().toISOString();
  return merged;
}

export class SyncAdapter {
  async push() { throw new Error('尚未配置同步后端'); }
  async pull() { throw new Error('尚未配置同步后端'); }
}
