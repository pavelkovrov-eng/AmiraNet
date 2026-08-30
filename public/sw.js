/**
 * Cache-first service worker.
 *
 * The app makes no network requests of its own at runtime — content is bundled
 * and progress lives in IndexedDB — so caching the built assets is all that
 * offline needs. Cache-first is safe here for the same reason: there is no
 * live data that could go stale.
 */
const CACHE = 'amirnet-v3';

self.addEventListener('install', (event) => {
  // Take over immediately rather than waiting for every tab to close; a study
  // app is usually a single tab and waiting only delays the update.
  self.skipWaiting();
  // './' rather than '/': inside a worker a relative URL resolves against the
  // worker's own location, so this is the app's own index wherever the site
  // is mounted. '/' would precache the domain root, which under a project
  // subpath is somebody else's page or a 404.
  event.waitUntil(caches.open(CACHE).then((c) => c.add('./')));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // A navigation that misses the cache while offline still has to
          // render something; the app shell is enough, since routing and
          // content are both client-side.
          if (request.mode === 'navigate') return caches.match('./');
          throw new Error('offline and not cached');
        });
    }),
  );
});
