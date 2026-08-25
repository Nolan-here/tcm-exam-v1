import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const scopeUrl = 'https://example.test/tcm-exam-v1/';

function canonicalKey(request) {
  const value = typeof request === 'string' ? request : request.url;
  return new URL(value, scopeUrl).href;
}

function createCacheStorage(lifecycle) {
  const stores = new Map();
  const open = async name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      addAll: async requests => {
        for (const request of requests) {
          store.set(canonicalKey(request), { source: 'new-cache', url: canonicalKey(request) });
        }
      },
      put: async (request, response) => store.set(canonicalKey(request), response),
      match: async request => store.get(canonicalKey(request)),
    };
  };
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async name => {
      lifecycle.push(`delete:${name}`);
      return stores.delete(name);
    },
    match: async request => {
      const key = canonicalKey(request);
      for (const store of stores.values()) {
        if (store.has(key)) return store.get(key);
      }
      return undefined;
    },
  };
}

async function dispatchLifecycle(listener, event = {}) {
  let pending;
  listener({ ...event, waitUntil: promise => { pending = promise; } });
  await pending;
}

test('新 Service Worker 安装完整题库并在激活后淘汰旧缓存', async () => {
  const workerSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const currentCacheName = workerSource.match(/const CACHE_NAME = '([^']+)'/)?.[1];
  assert.equal(currentCacheName, 'tcm-exam-v1-20260825-23');
  assert.notEqual(currentCacheName, 'tcm-exam-v1-20260825-22');

  const lifecycle = [];
  const caches = createCacheStorage(lifecycle);
  const oldCache = await caches.open('tcm-exam-v1-20260824-21');
  await oldCache.put('./js/questions-bank.js', { source: 'old-cache' });

  const listeners = new Map();
  let skippedWaiting = false;
  let claimedClients = false;
  const self = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    skipWaiting: () => { skippedWaiting = true; lifecycle.push('skipWaiting'); },
    clients: { claim: () => { claimedClients = true; lifecycle.push('claim'); } },
    location: { origin: new URL(scopeUrl).origin },
  };
  vm.runInNewContext(workerSource, {
    self,
    caches,
    fetch: async request => ({ ok: true, source: 'network', url: canonicalKey(request), clone() { return this; } }),
    URL,
  });

  await dispatchLifecycle(listeners.get('install'));
  assert.equal(skippedWaiting, true);
  const currentCache = caches.stores.get(currentCacheName);
  assert.ok(currentCache.has(canonicalKey('./js/questions-bank.js')));
  assert.ok(currentCache.has(canonicalKey('./js/questions-subjects.js')));
  assert.ok(currentCache.has(canonicalKey('./js/authority-researched-explanation-backfills.js')));

  await dispatchLifecycle(listeners.get('activate'));
  assert.equal(claimedClients, true);
  assert.deepEqual(await caches.keys(), [currentCacheName]);
  assert.ok(lifecycle.indexOf('delete:tcm-exam-v1-20260824-21') < lifecycle.indexOf('claim'));

  const resurrectedOldCache = await caches.open('tcm-exam-v1-20260824-21');
  await resurrectedOldCache.put('./js/questions-bank.js', { source: 'resurrected-old-cache' });
  let responsePromise;
  let cleanupPromise;
  listeners.get('fetch')({
    request: { method: 'GET', url: canonicalKey('./js/questions-bank.js') },
    respondWith: promise => { responsePromise = promise; },
    waitUntil: promise => { cleanupPromise = promise; },
  });
  assert.equal((await responsePromise).source, 'new-cache');
  await cleanupPromise;
  assert.deepEqual(await caches.keys(), [currentCacheName]);
});
