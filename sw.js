/* rueda-color · service worker
   ---------------------------------------------------------------------------
   Sube ESTE archivo junto al HTML (con el nombre sw.js) en la MISMA carpeta.
   La app lo registra como './sw.js'.

   PARA PUBLICAR UNA VERSIÓN NUEVA: cambia VERSION aquí abajo (p. ej. 'v62' ->
   'v63') en cada despliegue. Ese cambio hace dos cosas:
     1) estrena una caché nueva y borra las viejas de esta app al activarse, y
     2) al cambiar el contenido del archivo, la app detecta la actualización y
        ofrece el botón de "recargar".
   Si te olvidas de subirlo o de subir VERSION, el navegador seguirá sirviendo
   el HTML viejo desde la caché.

   Estrategia:
     - El DOCUMENTO (la propia app) va a RED PRIMERO: así recibes la versión
       nueva en cuanto la despliegas; sin conexión, tira de la caché.
     - El resto de lo propio (manifest, iconos) va a CACHÉ PRIMERO.
     - Las fuentes de Google y cualquier CDN (otro origen) pasan de largo.
     - Nunca toca las descargas (blob:/data:) ni las peticiones que no son GET,
       salvo el POST del share target de Android.
   --------------------------------------------------------------------------- */

/* v84: la versión de la caché la pone la URL de registro (sw.js?v=APP_VERSION),
   IGUAL que en Diario de Hábitos. Así NO hay que volver a editar este archivo en
   cada despliegue: basta re-subir index.html (que lleva APP_VERSION). Sin
   parámetro → 'v0', para que el desajuste se vea. */
const VERSION = (function(){ try { return new URL(self.location.href).searchParams.get('v') || 'v0'; } catch(e){ return 'v0'; } })();
const CACHE   = 'rueda-color-' + VERSION;
const CORE    = ['./', './index.html'];   // lo garantizado; el resto se cachea al vuelo

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).catch(function () {})
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        // borra solo cachés de versiones viejas de ESTA app; respeta 'share-inbox'
        if (k.indexOf('rueda-color-') === 0 && k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* --- Share target de Android: POST con una imagen ---
     El manifest debe apuntar aquí con method:"POST" y un campo de archivo.
     Guardamos la imagen en la caché 'share-inbox' y volvemos con ?shared=1,
     que es lo que la app lee al arrancar. */
  if (req.method === 'POST' && url.searchParams.has('share-target')) {
    e.respondWith((async function () {
      try {
        const form = await req.formData();
        const file = form.get('image') || form.get('file') || form.get('photo');
        if (file) {
          const cache = await caches.open('share-inbox');
          await cache.put('shared-image', new Response(file, {
            headers: { 'Content-Type': (file.type || 'image/png') }
          }));
        }
      } catch (err) {}
      return Response.redirect(new URL('./?shared=1', url).href, 303);
    })());
    return;
  }

  if (req.method !== 'GET') return;                       // no tocar POST/PUT/etc.
  if (url.origin !== self.location.origin) return;        // fuentes/CDN pasan de largo

  // El documento: RED PRIMERO (para recibir la versión nueva), caché de reserva.
  var accept = req.headers.get('accept') || '';
  if (req.mode === 'navigate' || accept.indexOf('text/html') !== -1) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        return res;
      }).catch(function () {
        return caches.match(req)
          .then(function (r) { return r || caches.match('./index.html'); })
          .then(function (r2) { return r2 || caches.match('./'); });
      })
    );
    return;
  }

  // El resto (manifest, iconos): CACHÉ PRIMERO, y si no está, red (y se guarda).
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () { return hit; });
    })
  );
});
