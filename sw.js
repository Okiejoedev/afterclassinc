// Lets Afterclass be installed as an app and open on a poor connection.
// Network first: always use the live site when it can be reached (so updates appear
// straight away), and fall back to the last saved copy only when offline.
// Requests to the database (another site) are never touched.
const CACHE = "afterclass-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== self.location.origin || r.cache === "no-store") return;
  e.respondWith(
    fetch(r).then((res) => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: r.mode === "navigate" }).then((hit) =>
      hit || (r.mode === "navigate" ? caches.match(new URL("./", self.registration.scope).href) : Response.error())))
  );
});
