// Offline cache for THP Stories. Online: always fetch the newest files (keep a copy). Offline: use the copy.
// Your stories, recordings and photos are NOT stored here – they live in the app's own device storage (IndexedDB).
const VERSION = 'thp-stories-v1';
const FILES = ['./', 'index.html', 'styles.css', 'questions.js', 'app.js', 'manifest.webmanifest', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/logo.png',
  'fonts/Unna-Regular.ttf', 'fonts/Unna-Bold.ttf', 'fonts/Unna-Italic.ttf', 'fonts/Unna-BoldItalic.ttf',
  'fonts/SourceSans3-normal-latin.woff2', 'fonts/SourceSans3-normal-latin-ext.woff2', 'fonts/SourceSans3-italic-latin.woff2', 'fonts/SourceSans3-italic-latin-ext.woff2'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('thp-stories') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.includes('/thp-stories/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try { const res = await fetch(e.request, { cache: 'no-cache' }); if (res.ok) cache.put(e.request, res.clone()); return res; }
    catch (_) { return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match('index.html')) || Response.error(); }
  })());
});
