/**
 * Guarda de sessão — Extreme Wind
 *
 * Coloque esta linha no <head> de CADA app, antes de qualquer outro script:
 *
 *     <script src="../guard.js"></script>
 *
 * Sem sessão válida a página nem chega a montar: volta direto para o menu,
 * que é onde mora a tela de entrada. A sessão fica em localStorage, que é
 * compartilhado por todas as páginas do mesmo site — quem entrou no menu
 * já entra em qualquer app sem digitar de novo.
 *
 * Precisa ser um <script> normal (sem defer/async/module) para rodar antes
 * do corpo da página aparecer.
 */
(function () {
  'use strict';

  var CHAVE = 'ew_sessao';

  /* A raiz do site sai do endereço deste próprio arquivo, então o guarda
     funciona em qualquer profundidade de pasta e em qualquer repositório
     do GitHub Pages, sem precisar de caminho absoluto. */
  function raiz() {
    try {
      var s = document.currentScript;
      if (s && s.src) return new URL('.', s.src).href;
    } catch (_) {}
    return '../';
  }

  function paraOMenu() {
    try { localStorage.removeItem(CHAVE); } catch (_) {}
    location.replace(raiz() + 'index.html');
  }

  try {
    var bruto = localStorage.getItem(CHAVE);
    var s = bruto ? JSON.parse(bruto) : null;
    if (!s || !s.token || !s.exp || s.exp <= Date.now()) paraOMenu();
  } catch (_) {
    paraOMenu();
  }
})();
