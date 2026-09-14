const CACHE = 'diet-logger-v1';
const ASSETS = ['/', '/style.css', '/app.js', '/manifest.json'];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
);

self.addEventListener('fetch', e => {
  // Only cache GET requests for static assets
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/analyze') ||
      url.pathname.startsWith('/log') ||
      url.pathname.startsWith('/history') ||
      url.pathname.startsWith('/auth') ||
      url.pathname.startsWith('/oauth')) return;

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
