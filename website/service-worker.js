/**
 * service-worker.js
 * Service worker mínimo de LabControl.
 *
 * Los navegadores de celular (Android/Chrome y Safari en PWA instalada)
 * solo permiten mostrar notificaciones del sistema a través de un service
 * worker (registration.showNotification). En escritorio funciona igual y
 * además sirve de respaldo. También controla qué pasa al tocar la notificación:
 * se abre o enfoca LabControl.
 */

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Al tocar la notificación: enfocar una pestaña abierta de LabControl
// (navegando a la página pedida) o abrir una nueva.
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
