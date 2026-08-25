const CACHE_NAME = 'tcm-exam-v1-20260825-22';
const APP_SHELL = [
  './', './index.html', './styles.css?v=9', './manifest.webmanifest', './assets/icon.svg',
  './js/app.js?v=16', './js/db.js', './js/questions-bank.js',
  './js/source-confirmed-question-repairs.js',
  './js/authority-researched-explanation-backfills.js',
  './js/questions-2024.js', './js/questions-2023.js', './js/questions-2018-2022.js',
  './js/questions-2018.js', './js/questions-2019.js', './js/questions-2020.js',
  './js/questions-2021.js', './js/questions-2022.js'
];

function deleteOldCaches() {
  return caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))));
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    deleteOldCaches()
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.waitUntil(deleteOldCaches());
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => (
      cache.match(event.request).then(cached => cached || fetch(event.request).then(response => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          cache.put(event.request, copy);
        }
        return response;
      }).catch(() => cache.match('./index.html')))
    ))
  );
});
