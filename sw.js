/* Field Manager service worker.
 *
 * The app is one self-contained HTML file, so "offline" just means keeping that
 * file (plus the manifest and icons) in a cache and serving it first. Coverage
 * on a festival field is unreliable, and a field manager mid-shift cannot wait
 * on a network round trip, so every request is answered from cache when we have
 * it and refreshed in the background for next time.
 *
 * Bump CACHE when index.html changes so old shells get evicted.
 */
const CACHE = "fieldmanager-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // Individually, so one 404 cannot fail the whole install.
      .then((c) =>
        Promise.allSettled(
          SHELL.map((u) => c.add(new Request(u, { cache: "reload" }))),
        ),
      ),
    // Deliberately no skipWaiting() here: a new version waits until the page
    // offers it and the user taps Reload, so a live count is never yanked away.
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page asks for this after the user taps "Reload" on the update toast.
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: serve the cached shell immediately, fall back to the network
  // on a cold cache, and always refresh the copy for next launch.
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match("./index.html").then((hit) => {
        const fresh = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put("./index.html", copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || fresh;
      }),
    );
    return;
  }

  // Everything else same-origin: stale-while-revalidate.
  e.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
