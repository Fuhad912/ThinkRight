/* ThinkRight PWA Service Worker (conservative, auth/payment-safe) */
/* TODO: Replace placeholder /icons/icon-192.png and /icons/icon-512.png with final branded app icons. */
const SW_VERSION = "thinkright-v1";
const SHELL_CACHE = `${SW_VERSION}-shell`;
const HTML_CACHE = `${SW_VERSION}-html`;
const ASSET_CACHE = `${SW_VERSION}-assets`;

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/css/style.css",
  "/css/navbar.css",
  "/css/premium-ui.css",
  "/js/utils.js",
  "/js/auth.js",
  "/js/navbar-load.js"
];

function hasSensitiveAuthParams(url) {
  return url.searchParams.has("access_token") ||
    url.searchParams.has("refresh_token") ||
    url.searchParams.has("code") ||
    url.searchParams.has("token_hash");
}

function isBypassPath(pathname) {
  return pathname.includes("payment-callback") ||
    pathname.includes("payment-debug") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/");
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const deletions = keys.length - maxEntries;
  for (let i = 0; i < deletions; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try {
      await cache.addAll(APP_SHELL);
    } catch (err) {
      // Keep install resilient if a shell file is temporarily unavailable.
      console.warn("[SW] Shell precache warning:", err);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith("thinkright-") && !name.startsWith(SW_VERSION))
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never touch non-GET requests (auth/payment/session safety).
  if (req.method !== "GET") return;

  // Bypass cross-origin requests (Supabase/Flutterwave/CDNs stay network-only).
  if (url.origin !== self.location.origin) return;

  // Never cache auth/payment callback-like requests.
  if (isBypassPath(url.pathname) || hasSensitiveAuthParams(url)) {
    event.respondWith(fetch(req));
    return;
  }

  const acceptsHtml = req.headers.get("accept")?.includes("text/html");
  const isHtmlNavigation = req.mode === "navigate" || acceptsHtml;

  if (isHtmlNavigation) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(req);
        if (networkResponse && networkResponse.ok && networkResponse.type === "basic") {
          const cache = await caches.open(HTML_CACHE);
          cache.put(req, networkResponse.clone());
          trimCache(HTML_CACHE, 40);
        }
        return networkResponse;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        const fallback = await caches.match("/index.html");
        if (fallback) return fallback;
        throw err;
      }
    })());
    return;
  }

  const isStatic = ["style", "script", "image", "font"].includes(req.destination) ||
    /\.(?:css|js|png|jpg|jpeg|svg|webp|gif|ico|json|woff2?)$/i.test(url.pathname);

  if (isStatic) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      const networkResponse = await fetch(req);
      if (networkResponse && networkResponse.ok && networkResponse.type === "basic") {
        const cache = await caches.open(ASSET_CACHE);
        cache.put(req, networkResponse.clone());
        trimCache(ASSET_CACHE, 140);
      }
      return networkResponse;
    })());
  }
});
