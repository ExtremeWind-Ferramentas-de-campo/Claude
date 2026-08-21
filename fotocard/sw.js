const CACHE = 'ew-fotocard-v38';
const CACHE_PREFIX = 'ew-fotocard-';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
  // html2canvas saiu: o fotocard agora é desenhado no Canvas 2D nativo
];

// Instala e pré-cacheia todos os assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Remove caches antigos na ativação.
// SOMENTE os do próprio fotocard: o site tem 3 service workers na mesma origem
// (raiz, /fotocard/ e /rdo/) e caches.keys() enxerga os caches de todos.
// Sem o filtro de prefixo, cada SW apagava o cache dos outros a cada
// atualização, derrubando o modo offline dos demais apps.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Cache-first: serve do cache, vai à rede só se não tiver
// Chamadas de API nunca entram no cache do app: resposta de API não é asset,
// e cache-first devolveria dado velho (ou guardaria resposta que não deveria
// ficar em disco no aparelho).
const API_ORIGIN = 'https://ew-dropbox-proxy.ew-fotos.workers.dev';

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.indexOf(API_ORIGIN) === 0) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) {
        // Atualiza cache em background (sem bloquear resposta)
        fetch(e.request).then(res => {
          if (res && res.ok) {
            caches.open(CACHE).then(c => c.put(e.request, res));
          }
        }).catch(() => {});
        return cached;
      }
      // Não está no cache: vai à rede e cacheia
      return fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // Rede falhou e não tem cache: retorna erro amigável
        return new Response(
          JSON.stringify({ error: 'offline' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      });
    })
  );
});

// Recebe mensagem para forçar atualização
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
