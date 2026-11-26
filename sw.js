// Offline cache for the CA Foundation checklist.
// Bump the version whenever cached app files change.
const CACHE = "ca-checklist-v18";
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
  "js/core.js",
  "js/question-bank.js",
  "data/papers.js",
  "data/paper1-accounting.js",
  "data/paper2-business-laws.js",
  "data/paper3-quantitative-aptitude.js",
  "data/paper4-economics-bck.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png"
];

const SELECTION_STYLE = `<style>
*, *::before, *::after {
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-touch-callout: none;
}
input, textarea, select, [contenteditable="true"], [contenteditable=""] {
  -webkit-user-select: text !important;
  user-select: text !important;
  -webkit-touch-callout: default;
}
</style>`;

const DATE_STRIP_STYLE = `<style>
#date-strip { touch-action: pan-x pan-y; }
#date-strip.swipe-next .date-button { animation: date-strip-next .22s ease-out both; }
#date-strip.swipe-previous .date-button { animation: date-strip-previous .22s ease-out both; }
@keyframes date-strip-next { from { opacity: .45; transform: translateX(18px); } to { opacity: 1; transform: translateX(0); } }
@keyframes date-strip-previous { from { opacity: .45; transform: translateX(-18px); } to { opacity: 1; transform: translateX(0); } }
@media (prefers-reduced-motion: reduce) {
  #date-strip.swipe-next .date-button, #date-strip.swipe-previous .date-button { animation: none; }
}
</style>`;

// Inject the shared styles into HTML responses (same behavior as before).
async function addAppStyles(response, requestUrl) {
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("text/html")) return response;

  const html = await response.text();
  const isTimeblocks = new URL(requestUrl).pathname.endsWith("/timeblocks.html");
  const styles = SELECTION_STYLE + (isTimeblocks ? DATE_STRIP_STYLE : "");
  const updatedHtml = html.includes("</head>")
    ? html.replace("</head>", `${styles}</head>`)
    : `${styles}${html}`;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("transfer-encoding");
  return new Response(updatedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// Precache one file; a missing file no longer breaks the whole install.
async function precache(cache, path) {
  try {
    const url = new URL(path, self.registration.scope).href;
    const res = await fetch(new Request(url, { cache: "reload" }));
    if (!res.ok) return;
    await cache.put(url, (await addAppStyles(res, url)).clone());
  } catch (error) {
    // Ignore; the file will be cached on first successful visit instead.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(SHELL.map((path) => precache(cache, path))))
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
  // Account, sync and file calls always go to the server, never to the cache.
  if (new URL(req.url).pathname.startsWith("/api/")) return;

  // Pages: network first, styled, cached; fall back to cache when offline.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const updated = await addAppStyles(res, req.url);
          await cache.put(req, updated.clone());
          return updated;
        }
        return res;
      } catch (error) {
        const cached =
          (await cache.match(req)) ||
          (await cache.match(req, { ignoreSearch: true })) ||
          (await cache.match(new URL("index.html", self.registration.scope).href));
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  // Icons, manifest and other static files: cache first, refresh in background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const refresh = fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => cached);
    return cached || refresh;
  })());
});
