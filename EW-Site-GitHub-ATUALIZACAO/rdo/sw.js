/**
 * Service Worker do RDO — Extreme Wind
 * Única função: fazer a PÁGINA abrir sem internet.
 *
 * Onde colocar: na MESMA pasta do arquivo html, num host HTTPS
 * (GitHub Pages, Netlify, etc.). Em link compartilhado do Dropbox não funciona.
 *
 * Estratégia:
 *   - Arquivos do próprio site: tenta a REDE primeiro e guarda uma cópia.
 *     Sem rede, serve a cópia guardada. "Rede primeiro" é de propósito: quando
 *     você publicar um html novo, o técnico recebe a versão nova na primeira
 *     abertura com internet, sem precisar limpar nada.
 *   - Limpeza: apaga SOMENTE caches com prefixo 'rdo-'. O site divide origem com
 *     outros service workers (raiz e /fotocard/), e caches.keys() enxerga todos.
 *     Sem esse filtro, um SW apagaria o cache do outro a cada atualizacao.
 *   - Apps Script: NUNCA passa pelo cache. Precisa falhar de verdade quando
 *     está offline, para o formulário usar a fila e as listas do aparelho.
 */

const CACHE = 'rdo-v17';

const APPS_SCRIPT = /script\.google(usercontent)?\.com/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes.filter(n => n.startsWith('rdo-') && n !== CACHE).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  if (req.method !== 'GET') return;              // POST de RDO nunca entra em cache
  if (APPS_SCRIPT.test(req.url)) return;         // backend: sempre rede
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then(resp => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req).then(achou => {
        if (achou) return achou;
        if (req.mode === 'navigate') return paginaGuardada();
        return Response.error();
      }))
  );
});

/** Sem cópia exata da URL pedida: devolve qualquer html já guardado. */
function paginaGuardada() {
  return caches.open(CACHE).then(c =>
    c.keys().then(chaves => {
      const html = chaves.find(k => /\.html?($|\?)/.test(k.url));
      return html ? c.match(html) : Response.error();
    })
  );
}
