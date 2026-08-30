/**
 * Offline cache for the study app.
 *
 * The app makes no network requests of its own at runtime — content is bundled
 * and progress lives in IndexedDB — so caching the built assets is all that
 * offline needs.
 *
 * The strategy is split by what can actually change:
 *
 *   navigations         network-first
 *   /assets/ (hashed)   cache-first, never revalidated
 *   everything else     stale-while-revalidate
 *
 * The earlier version was cache-first for everything, the document included.
 * That is what makes a deployed fix never arrive: index.html came from the
 * cache forever, it named a content-hashed bundle that was also cached, and
 * nothing in that loop ever asked the network whether a newer build existed.
 * The site would update and installed copies would not.
 *
 * Network-first on the document alone is enough, because the document is what
 * names the current bundle: fetch a fresh index and it points at the new
 * hashes, which are then fetched and cached as normal. Offline, that fetch
 * fails and the cached document answers instead, so the property this worker
 * exists for is untouched.
 */
const CACHE = 'amirnet-v4';

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

function put(request, response) {
  if (!response || !response.ok) return response;
  const copy = response.clone();
  caches.open(CACHE).then((c) => c.put(request, copy));
  return response;
}

/** The document decides which bundle is current, so it comes from the network whenever there is one. */
async function networkFirst(request) {
  try {
    return put(request, await fetch(request));
  } catch {
    // Offline: this exact document if it was cached, otherwise the app shell —
    // routing and content are both client-side, so the shell is enough.
    return (await caches.match(request)) || (await caches.match('./'));
  }
}

/** Content-hashed: the URL changes when the bytes do, so a hit can never be stale. */
async function cacheFirst(request) {
  return (await caches.match(request)) || put(request, await fetch(request));
}

/**
 * Fonts, icons, the manifest: stable, but not content-hashed, so a hit could
 * be out of date. Answer from the cache immediately and refresh in the
 * background — no latency for the reader, and it self-heals by the next load.
 */
async function staleWhileRevalidate(request) {
  const hit = await caches.match(request);
  const network = fetch(request)
    .then((response) => put(request, response))
    .catch(() => undefined);
  return hit || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
