// English SRS service worker.
// Precache is intentionally minimal: only the always-200, public, non-
// authenticated offline fallback. Authenticated pages (/dashboard, /review)
// are NOT precached — they 401/redirect when signed out (which would abort
// install) and caching them risks leaking one user's HTML to another on a
// shared device. Everything else is handled by the runtime fetch handler.
const CACHE_NAME = 'english-srs-v1';
const PRECACHE_ASSETS = ['/offline', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Per-asset add so one missing file cannot abort the whole install.
      Promise.all(
        PRECACHE_ASSETS.map((url) => cache.add(url).catch(() => undefined)),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Network-first for API calls; surface a JSON offline marker on failure.
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ offline: true }), {
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    return;
  }

  // Cache-first for everything else; populate the cache on successful GETs.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('/offline');
          }
          return Response.error();
        });
    }),
  );
});
