// PlayOn High-Performance Service Worker (Strict Security & Zero-Stale Rules)
const CACHE_VERSION = "playon-v1.0.0";
const STATIC_CACHE = `playon-static-${CACHE_VERSION}`;
const SHELL_CACHE = `playon-shell-${CACHE_VERSION}`;

// Pre-cache core app shell assets on install
const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

// 1. INSTALL: Cache initial shell and immediately activate without waiting
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[SW] Pre-caching non-fatal warning:", err);
      });
    })
  );
});

// 2. ACTIVATE: Claim all clients immediately and prune old cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== SHELL_CACHE)
            .map((key) => {
              console.log("[SW] Removing old cache:", key);
              return caches.delete(key);
            })
        );
      }),
    ])
  );
});

// 3. FETCH: Strict Routing Rules
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // STRICT RULE A: Never intercept or cache non-GET requests (e.g. bet placements, auth)
  if (req.method !== "GET") {
    return;
  }

  // STRICT RULE B: Never intercept or cache Supabase / Database / Realtime / Auth API calls
  // Wallet balance, markets live results, user bets MUST ALWAYS be live network-only!
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/rest/v1/") ||
    url.pathname.startsWith("/auth/v1/") ||
    url.pathname.startsWith("/realtime/") ||
    url.pathname.startsWith("/storage/") ||
    url.pathname.startsWith("/api/")
  ) {
    // Direct network pass-through; never touches cache
    return;
  }

  // STRICT RULE C: HTML Navigation (Opening the app or changing pages)
  // Network-First with fast 1000ms timeout -> fallback to cached HTML shell for instant load
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Attempt network fetch with a 1.2s timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1200);

          const networkResponse = await fetch(req, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
            return networkResponse;
          }
        } catch (_) {
          // Network timed out or device is offline: fallback to cached shell
        }

        // Return cached page or root app shell
        const cached = (await caches.match(req)) || (await caches.match("/"));
        if (cached) return cached;

        // If no cache, perform standard network fetch
        return fetch(req);
      })()
    );
    return;
  }

  // STRICT RULE D: Static Assets (Vite bundled JS/CSS, images, icons, fonts)
  // These have content hashes or are immutable static files: Cache-First strategy
  const isStaticAsset =
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".woff2") ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com");

  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Fetch from network and store in cache
        return fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
            }
            return networkResponse;
          })
          .catch(() => {
            // Asset offline and not in cache
            return new Response("", { status: 408, statusText: "Offline Asset Unavailable" });
          });
      })
    );
    return;
  }
});
