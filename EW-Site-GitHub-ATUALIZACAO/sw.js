/* ─────────────────────────────────────────────────────────────
   SERVICE WORKER — Extreme Wind | Calculadoras de Reparo (PWA)
   App instalável e OFFLINE. Cacheia todo o "app shell":
   • index (seletor) + as 3 calculadoras (Nordex, GE Vernova, Siemens)
   • logos + ícones + manifest
   • Font Awesome (cdnjs): CSS pré-cacheado; fontes cacheadas em uso.
   Estratégia:
   • HTML  → network-first (online = versão nova; offline = cache)
   • estáticos (png/svg/css/fontes) → cache-first
   • POST (sincronização Google Apps Script) → sempre à rede
   Requer hospedagem em http(s) (ex.: GitHub Pages). Não funciona via file://.
   IMPORTANTE: ao atualizar arquivos do app, incremente o número do CACHE
   abaixo — é o que descarta o cache antigo e força a atualização.

   LIMPEZA POR PREFIXO: este site tem 3 service workers na mesma origem
   (raiz, /fotocard/ e /rdo/). caches.keys() enxerga os caches de todos.
   Por isso o activate apaga SOMENTE caches que começam com 'ew-calc-'.
   Sem esse filtro, cada SW apagava o cache dos outros a cada atualização,
   quebrando o modo offline dos demais apps.
   ───────────────────────────────────────────────────────────── */
const CACHE = 'ew-calc-v22';
const CACHE_PREFIX = 'ew-calc-';

const CORE = [
  './',
  'index.html',                 // Tela 0 (home)
  'calculadora.html',           // seletor de cliente
  'calculadora-nordex.html',
  'calculadora-ge.html',
  'calculadora-siemens.html',
  'checklist.html',             // Checklist de materiais por cliente
  'logo-ew.png',
  'logo-oem.png',
  'logo-oem-ge.png',
  'logo-oem-siemens.png',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'fotocard/index.html',        // app Fotocard (também tem seu próprio SW)
  'fotocard/manifest.json',
  'fotocard/icon-192.png',
  'fotocard/icon-512.png'
  // RDO (/rdo/) NÃO entra aqui de propósito: tem SW próprio, com escopo /rdo/,
  // e o html é grande (~220 KB). Deixar o RDO se cachear sozinho.
];
const EXTRA = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);                                   // essenciais (locais) — obrigatório
    await Promise.allSettled(EXTRA.map(u => c.add(u)));     // CDN — melhor esforço
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE)
          .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Chamadas de API nunca entram no cache do app: cache-first devolveria lista de
// parques velha, e resposta de API não deve ficar guardada em disco no aparelho.
const API_ORIGIN = 'https://ew-dropbox-proxy.ew-fotos.workers.dev';

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;   // POST de sincronização → direto à rede
  if (req.url.indexOf(API_ORIGIN) === 0) return;   // GET /parques → sempre à rede

  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // network-first: online pega a versão nova; offline cai no cache
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, net.clone());
        return net;
      } catch (_) {
        return (await caches.match(req)) || (await caches.match('index.html'));
      }
    })());
    return;
  }

  // estáticos → cache-first (funciona offline; guarda fontes/CSS no 1º uso)
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const net = await fetch(req);
      if (net && (net.ok || net.type === 'opaque')) {
        const c = await caches.open(CACHE);
        c.put(req, net.clone());
      }
      return net;
    } catch (_) {
      return hit || Response.error();
    }
  })());
});
