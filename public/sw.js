// Service Worker — Stale-While-Revalidate strategy, tiku.db excluded
const CACHE_VERSION = 'study-v2';
const SHELL_FILES = [
  '/',
  '/manifest.json',
  '/sql-wasm.wasm',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (!e.request.url.startsWith('http')) return;
  if (e.request.url.includes('tiku.db')) return;
  if (e.request.url.includes('chrome-extension')) return;

  // Only cache GET requests
  if (e.request.method !== 'GET') return;

  // Stale-While-Revalidate for navigation and static assets
  if (
    e.request.mode === 'navigate' ||
    e.request.destination === 'script' ||
    e.request.destination === 'style' ||
    e.request.destination === 'image' ||
    e.request.destination === 'font' ||
    e.request.destination === 'manifest'
  ) {
    e.respondWith(
      caches.open(CACHE_VERSION).then(cache =>
        cache.match(e.request).then(cached => {
          const fetchPromise = fetch(e.request).then(response => {
            if (response?.ok) {
              cache.put(e.request, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
  }
});
