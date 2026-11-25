// Offline cache for the CA Foundation checklist.
// Every page is saved on the first visit, so the whole app works with no internet.
// Bump CACHE whenever any app file changes so devices pick up the new copy.
const CACHE = "ca-checklist-v12";
const SHELL = [
  "./",
  "index.html",
  "track.html",
  "timeblocks.html",
  "create-timeblock.html",
  "errorlogs.html",
  "syllabus.html",
  "questionbanks.html",
  "settings.html",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // ignoreSearch lets pages like timeblocks.html?date=2026-12-01 use the saved copy.
    const cached = await cache.match(req, { ignoreSearch: true });

    // Refresh the saved copy in the background when online. Silent if offline.
    const refresh = fetch(req).then((res) => {
      if (res && res.ok) {
        const key = new URL(req.url);
        key.search = "";
        cache.put(key.href, res.clone());
      }
      return res;
    });

    if (cached) {
      event.waitUntil(refresh.catch(() => {}));
      return cached;
    }

    try {
      return await refresh;
    } catch (error) {
      // Offline and never saved: fall back to the home page for page loads.
      if (req.mode === "navigate") {
        const home = await cache.match("index.html");
        if (home) return home;
      }
      throw error;
    }
  })());
});
