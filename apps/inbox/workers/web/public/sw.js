// No-op service worker stub.  Required for the manifest to count as
// installable on iOS/Android Chrome.  Future versions: offline capture
// queue + drain to /api/capture on reconnect.
self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', () => {
  // Pass-through.  No caching strategy yet.
});
