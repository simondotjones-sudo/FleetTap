// Build replaces these values. Cache only the public offline screen and its assets.
const CACHE = 'fleettap-offline-__BUILD__';
const OFFLINE_ASSETS = __OFFLINE_ASSETS__;
const assetURLs = new Set(OFFLINE_ASSETS.map(path => new URL(path, self.location.origin).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(OFFLINE_ASSETS)));
  // Deliberately no skipWaiting: an update must never interrupt an open check.
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('fleettap-offline-') && key !== CACHE).map(key => caches.delete(key))
  )));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never cache sessions, garage records, uploaded evidence or API responses.
  if (url.pathname.startsWith('/.netlify/') || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match('/offline.html')) || Response.error();
    }));
    return;
  }
  if (assetURLs.has(url.href)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request)) || fetch(request)));
  }
});
