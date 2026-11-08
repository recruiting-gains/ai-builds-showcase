/* App shell only. Camera frames, model pixels and /api requests are never cached or uploaded. */
const SHELL = 'ghostframe-shell-v2';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== SHELL).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && cacheable(url.pathname)) {
        const cache = await caches.open(SHELL);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw error;
    }
  })());
});

function cacheable(pathname) {
  return pathname.startsWith('/assets/') || pathname.startsWith('/models/') || pathname.startsWith('/wasm/')
    || pathname.endsWith('.js') || pathname.endsWith('.css') || pathname.endsWith('.svg')
    || pathname.endsWith('.png') || pathname.endsWith('.webmanifest');
}
