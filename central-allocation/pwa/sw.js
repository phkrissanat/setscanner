const PREFIX = 'set-scanner-' + encodeURIComponent(self.registration.scope) + '-';
const CACHE = PREFIX + 'v4-breadth';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'allocation.mjs'];
const assetURLs = new Set(FILES.map(p => new URL(p, self.registration.scope).href));
self.addEventListener('install', e => {
 e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
 e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
 const r = e.request, url = new URL(r.url);
 if (r.method !== 'GET' || url.origin !== self.location.origin) return;
 const navigation = r.mode === 'navigate';
 if (!navigation && !assetURLs.has(url.href)) return;
 e.respondWith((async () => {
  const cache = await caches.open(CACHE);
  try {
   const res = await fetch(r);
   if (res.ok && assetURLs.has(url.href)) {
    const copy = res.clone();
    e.waitUntil(cache.put(r, copy).catch(() => {}));
   }
   return res;
  } catch (error) {
   const hit = await cache.match(r);
   if (hit) return hit;
   if (navigation) {
    const shell = await cache.match(new URL('index.html', self.registration.scope).href);
    if (shell) return shell;
   }
   return Response.error();
  }
 })());
});
