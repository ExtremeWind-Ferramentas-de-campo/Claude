/**
 * Service Worker do site Extreme Wind (página inicial + os 4 apps)
 * Única função: fazer as PÁGINAS abrirem sem internet.
 *
 * Onde colocar: na RAIZ do site, junto do index.html — a mesma pasta que tem
 * rdo/, fotocard/, calculadora.html e checklist.html. Precisa de host HTTPS
 * (GitHub Pages, Netlify, etc.). Em link compartilhado do Dropbox não funciona.
 *
 * Um só arquivo para todo o site: dois service workers no mesmo endereço
 * brigariam pelo cache. Por isso o RDO registra '../sw.js', não um sw próprio.
 *
 * Estratégia:
 *   - Arquivos do próprio site: tenta a REDE primeiro e guarda uma cópia.
 *     Sem rede, serve a cópia guardada. "Rede primeiro" é de propósito: quando
 *     você publicar um html novo, o técnico recebe a versão nova na primeira
 *     abertura com internet, sem precisar limpar nada.
 *   - Apps Script: NUNCA passa pelo cache. Precisa falhar de verdade quando
 *     está offline, para o formulário usar a fila e as listas do aparelho.
 */

const CACHE = 'ew-v18';

const APPS_SCRIPT = /script\.google(usercontent)?\.com/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n))))
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
        if (req.mode === 'navigate') return paginaGuardada(req.url);
        return Response.error();
      }))
  );
});

/**
 * Sem cópia exata da URL pedida. Devolve, nesta ordem:
 *   1) um html guardado da MESMA pasta (ex.: /rdo/ pede -> /rdo/index.html);
 *   2) a página inicial.
 * A ordem importa: com 5 páginas no ar, "qualquer html" faria o técnico
 * pedir o RDO e receber a calculadora.
 */
function paginaGuardada(url) {
  const pasta = new URL(url).pathname.replace(/[^/]*$/, '');
  const raiz = new URL(self.registration.scope).pathname;   // pasta do index.html
  return caches.open(CACHE).then(c =>
    c.keys().then(chaves => {
      const htmls = chaves.filter(k => /\.html?($|\?)/.test(k.url) || /\/$/.test(new URL(k.url).pathname));
      const mesmaPasta = htmls.find(k => new URL(k.url).pathname.replace(/[^/]*$/, '') === pasta);
      if (mesmaPasta) return c.match(mesmaPasta);
      const inicial = htmls.find(k => {
        const p = new URL(k.url).pathname;
        return p === raiz || p === raiz + 'index.html';
      });
      if (inicial) return c.match(inicial);
      return htmls.length ? c.match(htmls[0]) : Response.error();
    })
  );
}
