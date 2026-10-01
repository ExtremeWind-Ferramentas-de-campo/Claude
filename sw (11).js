/**
 * Service Worker do Fotocard — APOSENTADO.
 *
 * O Fotocard passou a usar o service worker único da raiz (../sw.js).
 * Este arquivo continua existindo porque os celulares que já abriram o
 * Fotocard antes têm o service worker antigo instalado nesta pasta, e é
 * daqui que o navegador vai buscar a atualização. Ao encontrar esta versão,
 * ele se desinstala sozinho e apaga o cache que tinha guardado.
 *
 * Depois de alguns meses, quando todo mundo em campo já tiver aberto o
 * Fotocard pelo menos uma vez com internet, este arquivo pode ser apagado.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const chaves = await caches.keys();
    await Promise.all(
      chaves.filter(k => k.indexOf('ew-fotocard') === 0).map(k => caches.delete(k))
    );
    await self.registration.unregister();

    /* Recarrega as abas abertas para que passem a ser atendidas pelo
       service worker da raiz. */
    const abas = await self.clients.matchAll({ type: 'window' });
    abas.forEach(aba => aba.navigate(aba.url));
  })());
});

/* Enquanto não se desinstala, não intercepta nada. */
