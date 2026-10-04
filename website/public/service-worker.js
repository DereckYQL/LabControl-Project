/* service-worker.js — caché offline: red para la API, caché para estáticos. */

const CACHE_NAME = "labcontrol-v4.0.0";
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
  "style.css?v=4.0.0",
  "theme.js?v=4.0.0",
  "app.js?v=4.0.0",
  "data.js?v=4.0.0",
  "index.js?v=4.0.0",
  "login.js?v=4.0.0",
  "laboratorios.js?v=4.0.0",
  "equipos.js?v=4.0.0",
  "disponibilidad.js?v=4.0.0",
  "mapa.js?v=4.0.0",
  "reportes.js?v=4.0.0",
  "usuarios.js?v=4.0.0",
  "configuracion.js?v=4.0.0",
  "app.js",
  "data.js",
  "index.js",
  "login.js",
  "laboratorios.js",
  "equipos.js",
  "disponibilidad.js",
  "mapa.js",
  "reportes.js",
  "usuarios.js",
  "configuracion.js",
  "datos-demo.js",
  "lucide.min.js?v=4.0.0",
  "manifest.webmanifest",
  "img/logo-insuco.png",
  "img/icon-192.png",
  "img/icon-512.png",
  "img/bg-tech.svg",
  "img/bg-tech-light.svg",
  "img/labs/Trasera_lab1.jpg",
  "img/labs/Frontal_lab1.jpg",
  "img/labs/Trasero Derecho_lab2.png",
  "img/labs/Frontal Derecho_lab2.png",
  "img/labs/Trasera_lab3.jpg",
  "img/labs/Frontal_lab3.jpg",
  "img/labs/Trasera_lab4.jpg",
  "img/labs/Frontal_lab4.jpg",
  "img/labs/Trasera_lab5.jpg",
  "img/labs/Frontal_lab5.jpg"
];

// Precarga de estáticos

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        // `cache: "reload"` evita la caché del navegador: la precarga siempre
        // descarga la versión más reciente del servidor, no la que quedó guardada.
        cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })))
      )
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

  // No cachear peticiones a la API ni credenciales. La ruta se compara contra el
  // scope del service worker y no contra la raíz del dominio: en GitHub Pages la
  // API queda en /LabControl-Project/api/, no en /api/. Se quitan las barras
  // iniciales para que ambos casos se comparen igual.
  const base = new URL(self.registration.scope).pathname.replace(/\/+$/, "");
  const ruta = (base && url.pathname.startsWith(`${base}/`)
    ? url.pathname.slice(base.length)
    : url.pathname).replace(/^\/+/, "");
  if (ruta === "api" || ruta.startsWith("api/")) return;
  if (request.credentials === "include") return;

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
