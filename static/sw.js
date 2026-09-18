const CACHE = 'diet-logger-v13';
const ASSETS = ['/', '/style.css', '/app.js', '/manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE) return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Only handle GET requests
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Do not intercept API or auth calls
  if (url.pathname.startsWith('/analyze') ||
      url.pathname.startsWith('/log') ||
      url.pathname.startsWith('/history') ||
      url.pathname.startsWith('/auth') ||
      url.pathname.startsWith('/oauth')) return;

  // Network-first strategy for the main app assets
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Cache the latest version if successful
        const resClone = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, resClone));
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails (offline mode)
        return caches.match(e.request);
      })
  );
});
