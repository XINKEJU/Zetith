// Simple service worker for app shell caching
const CACHE_NAME = 'study-v1';
const SHELL_FILES = [
  '/',
  '/manifest.json',
  '/sql-wasm.wasm',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Don't cache the large database file
  if (e.request.url.includes('tiku.db')) return;

  // Don't cache HMR
  if (e.request.url.includes('/@vite') || e.request.url.includes('/node_modules')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => cached || new Response('Offline'));
    })
  );
});
