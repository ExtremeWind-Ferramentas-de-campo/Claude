/* Costura os formulários baixados do construtor para eles virarem páginas do
   site EW em vez de arquivos soltos.

       node _costurar.js

   O HTML que sai do botão "Baixar arquivo" do construtor não tem:
     1) <script src="../guard.js"> — sem ele o link direto pula o login;
     2) o cabeçalho do site (seta "voltar", logo, botão de tema) — no PWA não
        existe barra de navegador, então sem a seta quem entra fica preso;
     3) o padrão visual do RDO: ew-form.css no <head> e ew-form.js no fim do
        <body> (este último troca o PDF do construtor pelo PDF no layout do
        RDO — por isso precisa vir DEPOIS do script do formulário);
     4) o crédito "Realizado por" no rodapé.

   Rode este script TODA VEZ que substituir um destes HTML por uma versão
   nova baixada do construtor. É idempotente: rodar duas vezes não duplica
   nada, e o conteúdo do formulário (perguntas, imagens de exemplo) não é
   tocado — só cabeçalho, <head> e fim do <body>.

   Este script NÃO regera os formulários. Quem gera é o construtor, a partir
   dos modelos em modelos/. */
'use strict';
const fs = require('fs');
const path = require('path');

/* raiz:   caminho do arquivo até a raiz do site (onde ficam guard.js, ew-form.*)
   voltar: para onde a seta leva
   guard:  exige login (todos exigem, como os outros apps do site)
   prazo:  id em prazos.js que este formulário baixa quando o PDF é enviado */
const ALVOS = [
  { arq: 'gerador-eletrico.html', raiz: '../', voltar: 'index.html', guard: true, prazo: null },
  { arq: 'plataforma.html',       raiz: '../', voltar: 'index.html', guard: true, prazo: null },
  { arq: 'veiculo.html',          raiz: '../', voltar: 'index.html', guard: true, prazo: 'veiculo' },
  { arq: '../ehs/report-diario/index.html', raiz: '../../', voltar: '../index.html', guard: true, prazo: null }
];
const AUTOR = 'Ryan Neves';

const GUARD = r => '<script src="' + r + 'guard.js"><\/script>\n';
const PRAZOS_JS = r => '<script src="' + r + 'prazos.js" defer><\/script>\n';

/* tema antes de pintar a tela (sem "piscar" branco no modo escuro) + CSS do padrão */
const HEAD = r =>
  '<script>try{var t=localStorage.getItem("ew_tema");if(!t&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches)t="escuro";' +
  'document.documentElement.setAttribute("data-tema",t==="escuro"?"escuro":"claro")}catch(e){}<\/script>\n' +
  '<link rel="stylesheet" href="' + r + 'ew-form.css">\n';

const TOPO_CRU = '<div class="topo"><h1 id="tTitulo"></h1><p id="tSub"></p></div>';
const TOPO_ANTIGO =
  '<div class="topo"><a class="voltar" href="index.html" title="Voltar" aria-label="Voltar">&#8592;</a>' +
  '<div><h1 id="tTitulo"></h1><p id="tSub"></p></div></div>';
const TOPO = (r, voltar) =>
  '<div class="topo"><a class="voltar" href="' + voltar + '" title="Voltar" aria-label="Voltar">&#8592;</a>' +
  '<img class="ew-logo" src="' + r + 'logo-ew.png" alt="Extreme Wind Blade Services">' +
  '<div><h1 id="tTitulo"></h1><p id="tSub"></p></div>' +
  '<div class="ew-acoes"><button type="button" class="ew-tema" id="ewTema" title="Alternar tema">&#127769;</button></div></div>';

const FIM_BODY = r =>
  '<footer class="ew-credito">Extreme Wind Blade Services &copy; 2026 · Uso interno. Realizado por ' + AUTOR + '.</footer>\n' +
  '<script src="' + r + 'ew-form.js"><\/script>\n';

let erros = 0;

ALVOS.forEach(alvo => {
  const nome = alvo.arq;
  const arq = path.join(__dirname, nome);
  if (!fs.existsSync(arq)) {
    console.log(nome.padEnd(34) + 'NÃO ENCONTRADO');
    erros++;
    return;
  }

  let html = fs.readFileSync(arq, 'utf8');
  const feito = [];

  if (alvo.guard && html.indexOf('guard.js') < 0) {
    if (html.indexOf('<meta name="viewport"') < 0) {
      console.log(nome.padEnd(34) + 'ERRO: sem <meta viewport>, não sei onde pôr o guard');
      erros++;
      return;
    }
    html = html.replace('<meta name="viewport"', () => GUARD(alvo.raiz) + '<meta name="viewport"');
    feito.push('guard');
  }

  if (html.indexOf('ew-form.css') < 0) {
    html = html.replace('</head>', () => HEAD(alvo.raiz) + '</head>');
    feito.push('css');
  }

  if (html.indexOf('class="ew-logo"') < 0) {
    const velho = [TOPO_ANTIGO, TOPO_CRU].filter(t => html.indexOf(t) >= 0)[0];
    if (!velho) {
      console.log(nome.padEnd(34) + 'ERRO: cabeçalho fora do formato esperado — o construtor mudou?');
      erros++;
      return;
    }
    html = html.replace(velho, () => TOPO(alvo.raiz, alvo.voltar));
    feito.push('cabeçalho');
  }

  if (html.indexOf('ew-form.js') < 0) {
    const fim = html.lastIndexOf('</body>');
    if (fim < 0) {
      console.log(nome.padEnd(34) + 'ERRO: sem </body>');
      erros++;
      return;
    }
    html = html.slice(0, fim) + FIM_BODY(alvo.raiz) + html.slice(fim);
    feito.push('rodapé + PDF');
  }

  /* só para quem tem prazo semanal: carregar o prazos.js e baixar o alerta do
     cartão assim que o envio é confirmado */
  if (alvo.prazo && html.indexOf('EWPrazo') < 0) {
    if (html.indexOf('prazos.js') < 0) {
      html = html.replace('<meta name="viewport"', () => PRAZOS_JS(alvo.raiz) + '<meta name="viewport"');
    }
    /* A marcação entra no ramo em que o servidor confirmou o envio: o prazo do
       cartão só cai quando o PDF realmente chegou na pasta do Dropbox — é a
       mesma linha que libera o botão de compartilhar. Duas formas porque o
       construtor mudou uma vez como guarda o PDF (doc.save -> blob); se
       aparecer uma terceira, o script para e avisa em vez de gravar um arquivo
       sem a marcação. */
    const ANCORAS = [
      'guardarPDF(pdfBlob, nomeLocal);   // libera o compartilhamento: o Dropbox confirmou',
      "guardarPDF(doc.output('blob'), nomeLocal);   // libera o compartilhamento: o Dropbox confirmou"
    ];
    const ancora = ANCORAS.filter(a => html.indexOf(a) >= 0)[0];
    if (!ancora) {
      console.log(nome.padEnd(34) + 'ERRO: não achei onde o envio é confirmado — o construtor mudou de novo?');
      erros++;
      return;
    }
    html = html.replace(ancora, () => ancora +
      "\n      if(window.EWPrazo) window.EWPrazo.marcarFeito('" + alvo.prazo + "');" +
      "   // baixa o alerta de prazo do cartão");
    feito.push('prazo');
  }

  if (!feito.length) {
    console.log(nome.padEnd(34) + 'já costurado');
    return;
  }

  fs.writeFileSync(arq, html, 'utf8');
  console.log(nome.padEnd(34) + 'costurado: ' + feito.join(' + ') +
              '  (' + Math.round(html.length / 1024) + ' KB)');
});

console.log('');
if (erros) {
  console.log('Terminou com ' + erros + ' problema(s). Confira antes de publicar.');
  process.exit(1);
}
console.log('Pronto. Não esqueça de subir o CACHE no sw.js da raiz.');
