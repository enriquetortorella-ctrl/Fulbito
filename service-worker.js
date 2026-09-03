/*
  Fulbito PWA shell. Sólo guarda archivos públicos de la interfaz.
  Nunca intercepta solicitudes a Supabase: resultados, usuarios y sesiones
  siguen obteniéndose en línea y no se conservan en la caché del dispositivo.
*/
const SHELL_CACHE = 'fulbito-shell-v62';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/fulbito-icon.svg',
  './assets/maradona-loading.gif',
  './assets/cards/silver.webp',
  './assets/cards/gold.webp',
  './assets/cards/bronze.webp',
  './assets/cards/icon.webp',
  './assets/cards/hot.webp',
  './assets/cards/mvp.webp',
  './assets/cards/scorer.webp',
  './assets/match-centre-energy-v1.png',
  './assets/match-centre-stadium-v1.png',
  './css/admin.css',
  './css/crest-designer.css',
  './css/asistencia.css',
  './css/base.css',
  './css/cards.css',
  './css/player-career.css',
  './css/calificar.css',
  './css/equipos.css',
  './css/goles.css',
  './css/inicio.css',
  './css/inicio-hero.css',
  './css/inicio-matchcentre.css',
  './css/inicio-podium.css',
  './css/jugadores.css',
  './css/leaderboards.css',
  './css/partidos.css',
  './css/responsive.css',
  './css/stats-matchcentre.css',
  './css/stats.css',
  './css/theme-aurora.css',
  './css/utils.css',
  './js/auth.js',
  './js/boot.js',
  './js/config.js',
  './js/init.js',
  './js/navigation.js',
  './js/ratings-normalize.js',
  './js/render.js',
  './js/state.js',
  './js/stats-core.js',
  './js/storage.js',
  './js/support.js',
  './js/sync.js',
  './js/tabs/admin.js',
  './js/crest-designer.js',
  './js/tabs/asistencia.js',
  './js/tabs/calificar.js',
  './js/tabs/equipos.js',
  './js/tabs/goles.js',
  './js/tabs/goleadores.js',
  './js/tabs/inicio.js',
  './js/tabs/inicio-podium.js',
  './js/tabs/jugadores.js',
  './js/tabs/partidos.js',
  './js/tabs/stats.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('fulbito-shell-') && key !== SHELL_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Datos, autenticación y RPC de Supabase no se cachean ni se modifican.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // La pantalla principal prioriza siempre la versión publicada más reciente.
  if (request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // CSS y JS propios: red primero. Así un cambio publicado se ve en el acto
  // sin tener que subir la versión del cache. El cache queda de respaldo offline.
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    // cache:'no-store' salta la caché HTTP del navegador. Sin esto, fetch()
    // podía devolver una copia vieja de Safari sin llegar nunca al servidor,
    // y el celular se quedaba con el JS anterior aunque el SW fuera nuevo.
    event.respondWith(
      fetch(request.url, { cache: 'no-store', credentials: 'same-origin' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Iconos, fuentes y demás estáticos: cache primero, que casi nunca cambian.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
