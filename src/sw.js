import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// Only the generated app shell is precached. No runtime routes are registered for
// the USGS basemap or NYS parcels, so those cross-origin resources remain live-only.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// registerType: 'autoUpdate' (vite.config.js) relies on the client posting SKIP_WAITING
// once a new worker is installed. injectManifest strategy requires wiring that up manually,
// otherwise an already-installed worker never activates newer builds and keeps serving a
// stale precached app shell indefinitely.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
