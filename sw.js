const CACHE_NAME = 'valentine-v4';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './assets/icons/icon-192x192.png',
  './assets/icons/icon-512x512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/plates/001.png',
  './assets/plates/002.png',
  './assets/plates/003.png',
  './assets/plates/004.png',
  './assets/plates/005.png',
  './assets/plates/006.png',
  './assets/plates/007.png',
  './assets/plates/008.png',
  './assets/plates/009.png',
  './assets/plates/010.png',
  './assets/plates/011.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
