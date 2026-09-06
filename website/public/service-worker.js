/* service-worker.js — caché offline: red para la API, caché para estáticos. */

const CACHE_NAME = "labcontrol-v3.2";
const PRECACHE_URLS = [
  "./",
  "index.html",
  "login.html",
  "laboratorios.html",
  "equipos.html",
  "disponibilidad.html",
  "mapa.html",
  "usuarios.html",
  "reportes.html",
  "configuracion.html",
  "style.css?v=3.2",
  "theme.js?v=3.2",
  "app.js?v=3.2",
  "data.js?v=3.2",
  "index.js?v=3.2",
  "login.js?v=3.2",
  "laboratorios.js?v=3.2",
  "equipos.js?v=3.2",
  "disponibilidad.js?v=3.2",
  "mapa.js?v=3.2",
  "reportes.js?v=3.2",
  "usuarios.js?v=3.2",
  "configuracion.js?v=3.2",
  "datos-demo.js",
  "lucide.min.js?v=3.2",
  "img/logo-insuco.png",
  "img/bg-tech.svg",
  "img/bg-tech-light.svg"
];

// Precarga de estáticos

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Limpia caches viejos

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Intercepta peticiones

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No cachear peticiones a la API ni credenciales
  if (url.pathname.startsWith("/api") || request.credentials === "include") return;

  // Navegación (HTML): network-first con fallback a cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("index.html")))
    );
    return;
  }

  // Assets estáticos: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        return response;
      });
    })
  );
});

// Notificaciones

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const destino = new URL(
    event.notification?.data?.url || "./index.html",
    self.location.href
  ).href;

  event.waitUntil((async () => {
    const clientes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const cliente of clientes) {
      if (!cliente.url.startsWith(self.location.origin + "/")) continue;
      await cliente.focus();
      try { if ("navigate" in cliente && !cliente.url.includes(destino)) await cliente.navigate(destino); } catch (e) {}
      return;
    }
    await self.clients.openWindow(destino);
  })());
});
