// Service worker minimo: solo lo necesario para que el navegador ofrezca
// "Instalar app" / "Agregar a pantalla de inicio". No cachea páginas ni
// datos (todo acá es en vivo), así que no hay riesgo de mostrar información
// vieja de ventas o cocina.
self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match(event.request);
    })
  );
});
