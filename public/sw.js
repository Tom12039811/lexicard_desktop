/* ══════════════════════════════════════════════════════════════
   sw.js — LexiCard service worker (offline režim)
   - Stránka (HTML): nejdřív síť, při výpadku z cache → nové nasazení se načte hned, když jsi online.
   - Soubory sestavení (/assets/*, mají v názvu hash): z cache, jinak ze sítě a uložit.
   - Fonty Google: z cache, na pozadí aktualizovat.
   - Supabase a slovníkové API: nikdy necachovat (data řeší synchronizace).
══════════════════════════════════════════════════════════════ */
const VERSION = "lc-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const FONTS = `${VERSION}-fonts`;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(PAGES).then(c => c.addAll(["/", "/manifest.webmanifest", "/icon-192.png"])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Fonty Google
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(req, FONTS));
    return;
  }
  // Cizí domény (Supabase, dictionaryapi.dev …) – bez zásahu
  if (url.origin !== self.location.origin) return;

  // Navigace (HTML) – nejdřív síť
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(PAGES)).put("/", res.clone());
        return res;
      } catch {
        return (await caches.match("/")) || Response.error();
      }
    })());
    return;
  }

  // Soubory sestavení s hashem – z cache
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) (await caches.open(STATIC)).put(req, res.clone());
      return res;
    })());
    return;
  }

  // Ostatní (ikony, manifest) – stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req, STATIC));
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then(res => {
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}
