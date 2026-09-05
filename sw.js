const CACHE_NAME = 'tcm-exam-v1-20260905-29';
const APP_SHELL = [
  './', './index.html', './styles.css?v=11', './manifest.webmanifest', './assets/icon.svg',
  './js/app.js?v=21', './js/subject-panel-focus.js', './js/db.js', './js/wrong-book.js', './js/questions-bank.js', './js/questions-subjects.js',
  './js/source-confirmed-question-repairs.js',
  './js/authority-researched-explanation-backfills.js',
  './js/questions-2024.js', './js/questions-2023.js', './js/questions-2018-2022.js',
  './js/questions-2018.js', './js/questions-2019.js', './js/questions-2020.js',
  './js/questions-2021.js', './js/questions-2022.js'
];

function deleteOldCaches() {
  return caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('tcm-exam-v1-') && key !== CACHE_NAME)
      .map(key => caches.delete(key))));
}

async function openCompleteAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const missing = [];
  for (const request of APP_SHELL) {
    if (!await cache.match(request)) missing.push(request);
  }
  if (missing.length) await cache.addAll(missing);
  return cache;
}

self.addEventListener('install', event => {
  event.waitUntil(
    openCompleteAppShell()
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    openCompleteAppShell()
      .then(() => deleteOldCaches())
      .then(() => self.clients.claim())
      .then(() => openCompleteAppShell())
      .then(() => deleteOldCaches())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const cachePromise = event.request.mode === 'navigate'
    ? openCompleteAppShell()
    : caches.open(CACHE_NAME);
  event.respondWith(
    cachePromise.then(cache => (
      cache.match(event.request).then(cached => cached || fetch(event.request).then(response => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          cache.put(event.request, copy);
        }
        return response;
      }).catch(async error => {
        if (event.request.mode === 'navigate') {
          const fallback = await cache.match('./index.html');
          if (fallback) return fallback;
        }
        throw error;
      }))
    ))
  );
});
