/* Legacy cleanup worker.
 *
 * The previous MangaTrack PWA registered a cache-first service worker at this
 * URL. The React app does not need one, but browsers that visited the old site
 * keep the old registration (and its cached shell) until it is replaced.
 *
 * This worker takes over once: it deletes every cache for the origin,
 * unregisters itself and reloads the open windows so they load the new app. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    } catch (err) {
      /* cache storage can be unavailable in private mode */
    }

    try {
      await self.registration.unregister();
    } catch (err) {
      /* ignore */
    }

    try {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      windows.forEach(client => {
        try {
          client.navigate(client.url);
        } catch (err) {
          /* navigation can be blocked by the browser */
        }
      });
    } catch (err) {
      /* ignore */
    }
  })());
});
