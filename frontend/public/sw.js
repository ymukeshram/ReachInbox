const CACHE_NAME = 'reachify-v3';
const STATIC_ASSETS = ['/favicon.svg'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => name !== CACHE_NAME && caches.delete(name)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls or auth routes — always go to network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/track/')) {
    return;
  }

  // For navigation requests (HTML pages), always go to network so the SPA
  // loads fresh. This prevents stale index.html from causing routing issues.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/favicon.svg')));
    return;
  }

  // For static assets (JS/CSS/images), use cache-first strategy
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
