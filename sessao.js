/**
 * Trava de sessão dos apps — Extreme Wind
 *
 * Onde colocar: na RAIZ do site, junto do index.html.
 *
 * Para que serve: o login está no index.html. Sem esta trava, quem tiver o
 * link direto de um app (favorito, mensagem de WhatsApp, histórico do
 * navegador) entra sem passar pelo login.
 *
 * Como usar: em cada app, como a PRIMEIRA linha dentro do <head>:
 *     <script src="sessao.js"></script>        <!-- apps na raiz -->
 *     <script src="../sessao.js"></script>     <!-- apps em subpasta -->
 *
 * O RDO não precisa deste arquivo: a trava já está dentro dele.
 *
 * Observação: isto é conveniência de fluxo, não segurança de verdade — quem
 * entende do assunto sabe forjar uma sessão no navegador. O que protege os
 * dados é o servidor: o Apps Script só aceita relatório com token assinado.
 */
(function () {
  var CHAVE = 'ew_sessao';

  /* onde está o index.html: a mesma pasta deste arquivo */
  var meu = (document.currentScript && document.currentScript.src) || '';
  var login = meu ? meu.replace(/sessao\.js.*$/, 'index.html') : 'index.html';

  var s = null;
  try { s = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (_) { s = null; }

  if (!s || !s.token || !s.exp || s.exp <= Date.now()) {
    try { localStorage.removeItem(CHAVE); } catch (_) {}
    location.replace(login + '?login=1');
  }
})();
