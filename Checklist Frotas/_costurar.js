/* Costura os formulários baixados do construtor para eles virarem páginas do
   site EW em vez de arquivos soltos.

       node _costurar.js

   O HTML que sai do botão "Baixar arquivo" do construtor não tem:
     1) <script src="../guard.js"> — sem ele o link direto pula o login;
     2) a seta "voltar" no cabeçalho — no PWA não existe barra de navegador,
        então quem entra num checklist fica preso na tela.

   Rode este script TODA VEZ que substituir um dos três HTML por uma versão
   nova baixada do construtor. É idempotente: rodar duas vezes não duplica
   nada, e o conteúdo do formulário (perguntas, imagens de exemplo) não é
   tocado — só o cabeçalho.

   Este script NÃO regera os formulários. Quem gera é o construtor, a partir
   dos modelos em modelos/. */
'use strict';
const fs = require('fs');
const path = require('path');

/* prazo: id em prazos.js que este formulário baixa quando o PDF é gerado.
   Só o de veículos tem prazo semanal hoje. null = não mexe. */
const ALVOS = [
  { arq: 'gerador-eletrico.html', prazo: null },
  { arq: 'plataforma.html',       prazo: null },
  { arq: 'veiculo.html',          prazo: 'veiculo' }
];

const GUARD = '<script src="../guard.js"><\/script>\n';
const PRAZOS_JS = '<script src="../prazos.js" defer><\/script>\n';
const CSS_VOLTAR = `
  .topo{display:flex;align-items:center;gap:12px}
  .topo .voltar{flex:0 0 auto;width:38px;height:38px;border-radius:50%;
    border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;
    display:grid;place-items:center;text-decoration:none;font-size:18px;line-height:1}
  .topo .voltar:hover{background:rgba(255,255,255,.14)}
`;
const TOPO_CRU = '<div class="topo"><h1 id="tTitulo"></h1><p id="tSub"></p></div>';
const TOPO_COSTURADO =
  '<div class="topo"><a class="voltar" href="index.html" title="Voltar" aria-label="Voltar">&#8592;</a>' +
  '<div><h1 id="tTitulo"></h1><p id="tSub"></p></div></div>';

let erros = 0;

ALVOS.forEach(alvo => {
  const nome = alvo.arq;
  const arq = path.join(__dirname, nome);
  if (!fs.existsSync(arq)) {
    console.log(nome.padEnd(22) + 'NÃO ENCONTRADO');
    erros++;
    return;
  }

  let html = fs.readFileSync(arq, 'utf8');
  const feito = [];

  if (html.indexOf('guard.js') < 0) {
    if (html.indexOf('<meta name="viewport"') < 0) {
      console.log(nome.padEnd(22) + 'ERRO: sem <meta viewport>, não sei onde pôr o guard');
      erros++;
      return;
    }
    html = html.replace('<meta name="viewport"', () => GUARD + '<meta name="viewport"');
    feito.push('guard');
  }

  if (html.indexOf('.topo .voltar') < 0) {
    html = html.replace('</style>', () => CSS_VOLTAR + '</style>');
    feito.push('css');
  }

  if (html.indexOf('class="voltar"') < 0) {
    if (html.indexOf(TOPO_CRU) < 0) {
      console.log(nome.padEnd(22) + 'ERRO: cabeçalho fora do formato esperado — o construtor mudou?');
      erros++;
      return;
    }
    html = html.replace(TOPO_CRU, () => TOPO_COSTURADO);
    feito.push('voltar');
  }

  /* 3ª costura, só para quem tem prazo semanal: carregar o prazos.js e baixar
     o alerta do cartão assim que o PDF é gerado. */
  if (alvo.prazo && html.indexOf('EWPrazo') < 0) {
    if (html.indexOf('prazos.js') < 0) {
      html = html.replace('<meta name="viewport"', () => PRAZOS_JS + '<meta name="viewport"');
    }
    /* O construtor já mudou uma vez a forma de salvar o PDF (doc.save ->
       blob). Aceita as duas; se aparecer uma terceira, o script para e avisa
       em vez de gravar um arquivo sem a marcação. */
    const ANCORAS = [
      'document.body.appendChild(liga); liga.click(); liga.remove();',
      "doc.save(nomeLocal + '.pdf');"
    ];
    const ancora = ANCORAS.filter(a => html.indexOf(a) >= 0)[0];
    if (!ancora) {
      console.log(nome.padEnd(22) + 'ERRO: não achei onde o PDF é salvo — o construtor mudou de novo?');
      erros++;
      return;
    }
    html = html.replace(ancora, () => ancora +
      "\n    if(window.EWPrazo) window.EWPrazo.marcarFeito('" + alvo.prazo + "');" +
      "   // baixa o alerta de prazo do cartão");
    feito.push('prazo');
  }

  if (!feito.length) {
    console.log(nome.padEnd(22) + 'já costurado');
    return;
  }

  fs.writeFileSync(arq, html, 'utf8');
  console.log(nome.padEnd(22) + 'costurado: ' + feito.join(' + ') +
              '  (' + Math.round(html.length / 1024) + ' KB)');
});

console.log('');
if (erros) {
  console.log('Terminou com ' + erros + ' problema(s). Confira antes de publicar.');
  process.exit(1);
}
console.log('Pronto. Não esqueça de subir o CACHE no sw.js da raiz.');
