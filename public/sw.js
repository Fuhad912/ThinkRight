/*
  ThinkRight PWA Service Worker (conservative and auth/payment safe)
  - Cache-first: static assets (css/js/images/icons/fonts)
  - Network-first: navigation/HTML, fallback to cached "/" shell
  - Never cache Supabase calls or payment redirect/callback routes
  - Cache version: thinkright-pwa-v1

  Verification notes:
  1) Chrome DevTools -> Application -> Manifest: confirm manifest + icons are valid.
  2) Chrome DevTools -> Application -> Service Workers: confirm /sw.js is active.
  3) Android Chrome -> Add to Home screen: app installs and opens in standalone mode.
*/
const CACHE_VERSION = "thinkright-pwa-v17-notifications";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const NAV_CACHE = `${CACHE_VERSION}-nav`;
const ALLOWED_CACHES = [STATIC_CACHE, NAV_CACHE];

self.addEventListener('push', event => {
  let payload={};try{payload=event.data?.json()||{};}catch{/* Always show a visible fallback alert. */}
  let url='/dashboard.html?notifications=1';
  try{const candidate=new URL(payload.url,self.location.origin);if(candidate.origin===self.location.origin&&!candidate.username&&!candidate.password)url=candidate.pathname+candidate.search+candidate.hash;}catch{}
  event.waitUntil(self.registration.showNotification(String(payload.title||'ThinkRight').slice(0,160),{
    body:String(payload.body||'You have a new update in ThinkRight.').slice(0,1000),icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',
    tag:String(payload.tag||'thinkright-update'),data:{url}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const candidate=new URL(event.notification.data?.url||'/dashboard.html?notifications=1',self.location.origin);
    const url=candidate.origin===self.location.origin?candidate.href:self.location.origin+'/dashboard.html?notifications=1';
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate(url);return client.focus();}}
    return self.clients.openWindow(url);
  })());
});

const SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

function shouldBypass(requestUrl) {
  const isSupabaseHost = requestUrl.hostname.includes("supabase.co");
  const isFlutterwaveHost = requestUrl.hostname.includes("flutterwave.com");
  const isPaymentPath = requestUrl.pathname.includes("payment-callback") || requestUrl.pathname.includes("payment-debug");
  const hasAuthParams = requestUrl.searchParams.has("access_token") ||
    requestUrl.searchParams.has("refresh_token") ||
    requestUrl.searchParams.has("code") ||
    requestUrl.searchParams.has("token_hash") || requestUrl.searchParams.has("reference") || requestUrl.searchParams.has("trxref");

  const isPaystackHost = requestUrl.hostname.endsWith('paystack.co') || requestUrl.hostname.endsWith('paystack.com');
  return isSupabaseHost || isFlutterwaveHost || isPaystackHost || isPaymentPath || hasAuthParams;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(NAV_CACHE);
    await cache.addAll(SHELL_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => !ALLOWED_CACHES.includes(key))
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (shouldBypass(url)) return;

  const isNavigation = request.mode === "navigate";
  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(NAV_CACHE);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch (_err) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        const fallback = await caches.match("/");
        if (fallback) return fallback;
        throw _err;
      }
    })());
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isStaticAsset = isSameOrigin && (
    ["style", "script", "image", "font"].includes(request.destination) ||
    /\.(?:css|js|png|jpg|jpeg|svg|webp|gif|ico|woff|woff2)$/i.test(url.pathname)
  );

  if (!isStaticAsset) return;

  const isCodeAsset = ["style", "script"].includes(request.destination) || /\.(?:css|js)$/i.test(url.pathname);
  if (isCodeAsset) {
    // Network-first for CSS and JS to ensure fresh fonts and styling, falling back to cache when offline
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(STATIC_CACHE);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch (_err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw _err;
      }
    })());
    return;
  }

  // Cache-first for images, fonts, icons
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    const networkResponse = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  })());
});
