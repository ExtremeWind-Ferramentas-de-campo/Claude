/* ═════════════════════════════════════════════════════════════════════
   PADRÃO DOS FORMULÁRIOS = mesmo do RDO — parte em JavaScript
   (a parte visual da tela está em ew-form.css)

   1) Botão de tema claro/escuro do cabeçalho — mesma chave do RDO (ew_tema).
   2) EWPDF: as peças do PDF no layout do RDO (cabeçalho "EXTREME WIND",
      linha azul, títulos de seção, tabela rótulo/valor, fotos 3 por linha,
      assinatura com nome embaixo).
   3) Nos formulários que saem do construtor (têm SCHEMA), troca o montarPDF()
      do modelo por um que usa o EWPDF. O resto do formulário — validação,
      envio, Dropbox, rascunho — continua sendo o do construtor.

   Este arquivo precisa entrar DEPOIS do <script> do formulário (fim do
   <body>): é assim que o montarPDF daqui substitui o do construtor.
   Quem põe a tag nos arquivos gerados é o Checklist Frotas/_costurar.js.
   ═════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ---------------- 1) tema ---------------- */
var TEMA_KEY = 'ew_tema';
function aplicarTema(t){
  var escuro = t === 'escuro';
  document.documentElement.setAttribute('data-tema', escuro ? 'escuro' : 'claro');
  var b = document.getElementById('ewTema');
  if(b){ b.textContent = escuro ? '☀️' : '🌙'; b.title = escuro ? 'Modo claro' : 'Modo escuro'; }
}
(function(){
  var t = null;
  try{ t = localStorage.getItem(TEMA_KEY); }catch(e){}
  if(!t){
    try{ t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'; }
    catch(e){ t = 'claro'; }
  }
  aplicarTema(t);
  var b = document.getElementById('ewTema');
  if(b) b.addEventListener('click', function(){
    var novo = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro';
    try{ localStorage.setItem(TEMA_KEY, novo); }catch(e){}
    aplicarTema(novo);
  });
})();

/* ---------------- 2) EWPDF ---------------- */
/* cores do PDF do RDO (EW-Apps-Script-RDO/Code.gs, montarHtml) */
var COR = {
  escuro:[38,55,79], azul:[59,90,138], borda:[214,224,236], linha:[226,232,240],
  muted:[100,116,139], texto:[30,41,59], vazio:[148,163,184], fundo:[244,247,251]
};

function p2(n){ return String(n).padStart(2, '0'); }
function agoraBr(){
  var d = new Date();
  return p2(d.getDate()) + '/' + p2(d.getMonth()+1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
}
function formato(dataUrl){ return /^data:image\/png/i.test(String(dataUrl)) ? 'PNG' : 'JPEG'; }

function novo(){
  var doc = new window.jspdf.jsPDF({unit:'mm', format:'a4'});
  var P = {doc:doc, M:15, W:210, U:180, FIM:282, y:15};

  function cor(c){ doc.setTextColor(c[0], c[1], c[2]); }
  function fonte(estilo, tam){ doc.setFont('helvetica', estilo); doc.setFontSize(tam); }
  P.espaco = function(h){ if(P.y + h > P.FIM){ doc.addPage(); P.y = P.M + 2; return true; } return false; };

  /* cabeçalho: marca à esquerda, título embaixo, carimbo de data à direita */
  P.cabecalho = function(titulo, rotDir, valDir){
    var M = P.M, W = P.W;
    fonte('bold', 15); cor(COR.escuro); doc.text('EXTREME WIND', M, 19);
    var lg = doc.getTextWidth('EXTREME WIND');
    fonte('normal', 9.5); cor(COR.muted); doc.text('Blade Services', M + lg + 2, 19);
    fonte('normal', 11); cor(COR.azul);
    var tl = doc.splitTextToSize(String(titulo || ''), P.U - 52);
    tl.forEach(function(l, k){ doc.text(l, M, 25.5 + k*4.8); });
    if(rotDir){
      fonte('normal', 8); cor(COR.muted); doc.text(String(rotDir), W - M, 17.5, {align:'right'});
      fonte('bold', 9); cor(COR.escuro); doc.text(String(valDir || ''), W - M, 22, {align:'right'});
    }
    var yb = Math.max(29, 25.5 + (tl.length - 1)*4.8 + 3.5);
    doc.setDrawColor(COR.azul[0], COR.azul[1], COR.azul[2]); doc.setLineWidth(0.8);
    doc.line(M, yb, W - M, yb);
    P.y = yb + 3;
  };

  /* reserva: espaço mínimo para o que vem logo abaixo, para o título não
     ficar sozinho no pé da página */
  P.secao = function(titulo, reserva){
    P.espaco(Math.max(18, (reserva || 0) + 10));
    P.y += 6;
    fonte('bold', 10); cor(COR.azul); doc.text(String(titulo), P.M, P.y);
    P.y += 1.8;
    doc.setDrawColor(COR.borda[0], COR.borda[1], COR.borda[2]); doc.setLineWidth(0.5);
    doc.line(P.M, P.y, P.W - P.M, P.y);
    P.y += 0.6;
  };

  function separador(){
    doc.setDrawColor(COR.linha[0], COR.linha[1], COR.linha[2]); doc.setLineWidth(0.2);
    doc.line(P.M, P.y, P.W - P.M, P.y);
  }

  /* texto que não cabe numa linha de tabela: rótulo em cima, valor embaixo,
     quebrando página linha a linha */
  P.textoLongo = function(rot, val){
    fonte('normal', 8);
    var L = doc.splitTextToSize(String(rot || ''), P.U - 3);
    fonte('normal', 9.5);
    var V = doc.splitTextToSize(String(val == null || val === '' ? '—' : val), P.U - 3);
    P.espaco(L.length*3.6 + 9);
    P.y += 1.6;
    fonte('normal', 8); cor(COR.muted);
    L.forEach(function(l){ P.y += 3.6; doc.text(l, P.M + 1.5, P.y); });
    P.y += 1.2;
    fonte('normal', 9.5); cor(COR.texto);
    V.forEach(function(l){ P.espaco(5); P.y += 4.3; doc.text(l, P.M + 1.5, P.y); });
    P.y += 2;
    separador();
  };

  /* uma linha rótulo | valor; frac = largura do rótulo (0..1) */
  P.linha = function(rot, val, frac){
    frac = frac || 0.22;
    var lw = P.U * frac, vw = P.U - lw;
    fonte('normal', 8); var L = doc.splitTextToSize(String(rot || ''), lw - 3);
    fonte('bold', 9.5); var V = doc.splitTextToSize(String(val == null || val === '' ? '—' : val), vw - 3);
    var h = Math.max(L.length*3.6, V.length*4.3) + 3.6;
    if(h > 60){ P.textoLongo(rot, val); return; }
    P.espaco(h);
    fonte('normal', 8); cor(COR.muted);
    L.forEach(function(l, k){ doc.text(l, P.M + 1.5, P.y + 4 + k*3.6); });
    fonte('bold', 9.5); cor(COR.texto);
    V.forEach(function(l, k){ doc.text(l, P.M + lw + 1.5, P.y + 4.2 + k*4.3); });
    P.y += h;
    separador();
  };

  /* dois pares por linha, como o linha2() do RDO (20% / 30% / 20% / 30%) */
  P.linha2 = function(r1, v1, r2, v2){
    var lw = P.U*0.2, vw = P.U*0.3, x = [P.M, P.M + lw, P.M + lw + vw, P.M + 2*lw + vw];
    fonte('normal', 8);
    var L1 = doc.splitTextToSize(String(r1 || ''), lw - 3), L2 = doc.splitTextToSize(String(r2 || ''), lw - 3);
    fonte('bold', 9.5);
    var V1 = doc.splitTextToSize(String(v1 == null || v1 === '' ? '—' : v1), vw - 3);
    var V2 = doc.splitTextToSize(String(v2 == null || v2 === '' ? '—' : v2), vw - 3);
    var h = Math.max(L1.length*3.6, L2.length*3.6, V1.length*4.3, V2.length*4.3) + 3.6;
    P.espaco(h);
    fonte('normal', 8); cor(COR.muted);
    L1.forEach(function(l, k){ doc.text(l, x[0] + 1.5, P.y + 4 + k*3.6); });
    L2.forEach(function(l, k){ doc.text(l, x[2] + 1.5, P.y + 4 + k*3.6); });
    fonte('bold', 9.5); cor(COR.texto);
    V1.forEach(function(l, k){ doc.text(l, x[1] + 1.5, P.y + 4.2 + k*4.3); });
    V2.forEach(function(l, k){ doc.text(l, x[3] + 1.5, P.y + 4.2 + k*4.3); });
    P.y += h;
    separador();
  };

  P.vazio = function(txt){
    P.espaco(8);
    fonte('normal', 9); cor(COR.vazio); doc.text(String(txt), P.M + 1.5, P.y + 5);
    P.y += 7;
  };

  /* tabela livre (campo "tabela" do construtor), cabeçalho no azul claro do RDO */
  P.tabela = function(rot, colunas, linhas){
    var n = Math.max(colunas.length, 1), lc = P.U / n;
    fonte('normal', 8); cor(COR.muted);
    P.espaco(16);
    P.y += 4; doc.text(String(rot || ''), P.M + 1.5, P.y); P.y += 1.5;
    doc.setFillColor(COR.fundo[0], COR.fundo[1], COR.fundo[2]); doc.rect(P.M, P.y, P.U, 6.5, 'F');
    fonte('bold', 7.5); cor(COR.azul);
    colunas.forEach(function(c, k){ doc.text(doc.splitTextToSize(String(c), lc - 3)[0] || '', P.M + k*lc + 1.5, P.y + 4.3); });
    P.y += 6.5;
    if(!linhas.length){ P.vazio('Nenhuma linha preenchida'); separador(); return; }
    linhas.forEach(function(lin){
      fonte('normal', 8.5);
      var cel = lin.map(function(v){ return doc.splitTextToSize(String(v == null ? '' : v), lc - 3); });
      var h = Math.max.apply(null, cel.map(function(c){ return c.length; }).concat([1]))*3.9 + 3;
      P.espaco(h);
      cor(COR.texto);
      cel.forEach(function(c, k){ c.forEach(function(l, j){ doc.text(l, P.M + k*lc + 1.5, P.y + 4 + j*3.9); }); });
      P.y += h;
      separador();
    });
  };

  /* uma linha de fotos. itens: [{d, w, h, leg}] — mesma escala nos dois eixos */
  P.fotosLinha = function(itens, cols){
    cols = cols || 3;
    var gap = 3, cw = (P.U - gap*(cols - 1)) / cols, maxH = cols >= 3 ? 58 : 80;
    var med = itens.map(function(it){
      var w = it.w || 4, h = it.h || 3, e = Math.min(cw / w, maxH / h);
      return {it:it, lg:w*e, al:h*e};
    });
    var alt = 0; med.forEach(function(m){ if(m.al > alt) alt = m.al; });
    P.espaco(alt + 9);
    med.forEach(function(m, k){
      var x0 = P.M + k*(cw + gap);
      if(m.it.d){
        doc.addImage(m.it.d, formato(m.it.d), x0 + (cw - m.lg)/2, P.y + 1, m.lg, m.al);
        doc.setDrawColor(COR.borda[0], COR.borda[1], COR.borda[2]); doc.setLineWidth(0.25);
        doc.rect(x0 + (cw - m.lg)/2, P.y + 1, m.lg, m.al);
      }
      if(m.it.leg){
        fonte('normal', 7); cor(COR.muted);
        doc.splitTextToSize(String(m.it.leg), cw).slice(0, 2).forEach(function(l, j){
          doc.text(l, x0, P.y + alt + 4.2 + j*3);
        });
      }
    });
    P.y += alt + 10.5;
  };
  P.fotos = function(itens, cols){
    cols = cols || 3;
    if(!itens.length){ P.vazio('Sem fotos'); return; }
    for(var k = 0; k < itens.length; k += cols) P.fotosLinha(itens.slice(k, k + cols), cols);
  };

  /* assinatura: imagem, traço e o nome embaixo (como o RDO) */
  P.assinatura = function(sig, nome, rot){
    P.espaco(rot ? 40 : 35);
    if(rot){
      fonte('normal', 8); cor(COR.muted); P.y += 4.5; doc.text(String(rot), P.M + 1.5, P.y); P.y += 1;
    }
    if(sig && sig.d){
      var e = Math.min(80 / (sig.w || 400), 24 / (sig.h || 150)), lg = (sig.w || 400)*e, al = (sig.h || 150)*e;
      doc.addImage(sig.d, 'PNG', P.M, P.y + 2, lg, al);
      P.y += al + 3;
      doc.setDrawColor(COR.vazio[0], COR.vazio[1], COR.vazio[2]); doc.setLineWidth(0.3);
      doc.line(P.M, P.y, P.M + 80, P.y);
      if(nome){ fonte('normal', 8); cor(COR.muted); doc.text(String(nome), P.M, P.y + 4.2); P.y += 4.2; }
      P.y += 3;
    }else{
      P.vazio('Não assinado');
    }
  };

  P.rodape = function(){
    var tot = doc.internal.getNumberOfPages();
    for(var p = 1; p <= tot; p++){
      doc.setPage(p);
      fonte('normal', 7.5); doc.setTextColor(140, 150, 156);
      doc.text('Página ' + p + ' de ' + tot, P.W - P.M, 291, {align:'right'});
    }
  };

  return P;
}

function sessao(){
  try{
    var s = JSON.parse(localStorage.getItem('ew_sessao') || 'null');
    if(s && s.nome) return s.nome + (s.mat ? ' (' + s.mat + ')' : '');
  }catch(e){}
  return '';
}

window.EWPDF = {novo:novo, agora:agoraBr, sessao:sessao};

/* subtítulo do cabeçalho = quem está logado, como no RDO */
(function(){
  var el = document.getElementById('tSub');
  try{
    var s = JSON.parse(localStorage.getItem('ew_sessao') || 'null');
    if(el && s && s.nome) el.textContent = s.nome + (s.mat ? ' · mat. ' + s.mat : '');
  }catch(e){}
})();

/* ---------------- 3) PDF dos formulários do construtor ---------------- */
if(typeof SCHEMA === 'undefined' || typeof window.montarPDF !== 'function') return;

var CURTOS = {texto:1, data:1, hora:1, numero:1, select:1, pessoa:1};

function brData(v){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(v || '');
}
function valorTexto(c, v){
  if(c.tipo === 'pessoa') return v ? (v.nome + (v.matricula ? ' (' + v.matricula + ')' : '')) : '';
  if(c.tipo === 'data') return brData(v);
  if(Array.isArray(v)) return v.join(', ');
  return v == null ? '' : String(v);
}
/* "Pergunta — detalhe" vira "Pergunta" (é assim que o construtor guarda o
   texto da matriz do forms.app). Os dois-pontos do fim saem do título. */
function prefixo(t){
  var s = String(t || '').split(' — ')[0].trim();
  return s.replace(/[:\s]+$/, '');
}
function chaveGrupo(c){
  if(c.tipo === 'pessoa') return null;
  if(c.tipo === 'textao' || c.tipo === 'tabela') return null;
  if(c.ajuda) return {k:'a:' + prefixo(c.ajuda), t:prefixo(c.ajuda), rot:false};
  if(String(c.rotulo || '').indexOf(' — ') > 0) return {k:'r:' + prefixo(c.rotulo), t:prefixo(c.rotulo), rot:true};
  return null;
}

/* divide as respostas em seções: blocos seguidos com a mesma pergunta-mãe
   (a mesma ajuda, ou o mesmo começo de rótulo) viram uma seção com título
   próprio; o que sobra fica em "Respostas" */
function secoes(itens){
  var out = [], i = 0;
  while(i < itens.length){
    var g = chaveGrupo(itens[i].campo), j = i + 1;
    if(g){ while(j < itens.length){ var h = chaveGrupo(itens[j].campo); if(!h || h.k !== g.k) break; j++; } }
    if(g && j - i >= 2){
      out.push({titulo:g.t, tiraPrefixo:g.rot, itens:itens.slice(i, j)});
    }else{
      j = i + 1;
      var ult = out[out.length - 1];
      if(ult && ult.titulo === 'Respostas') ult.itens.push(itens[i]);
      else out.push({titulo:'Respostas', itens:[itens[i]]});
    }
    i = j;
  }
  return out;
}

async function dadoFoto(f){
  if(f && f.d) return f.d;
  if(typeof window.dadosDaFoto === 'function'){
    try{ return await window.dadosDaFoto(f); }catch(e){ return null; }
  }
  return null;
}

window.montarPDF = async function(dados){
  var P = novo();
  var sub = String(SCHEMA.subtitulo || '').trim();
  var titulo = String(SCHEMA.titulo || 'Formulário');
  if(sub && !/extreme wind/i.test(sub)) titulo += ' · ' + sub;
  P.cabecalho(titulo, 'Emitido em', agoraBr());

  var ident = [], resto = [], fotos = [], assin = [], k = 0;
  while(k < dados.length && CURTOS[dados[k].campo.tipo]) ident.push(dados[k++]);
  for(; k < dados.length; k++){
    var t = dados[k].campo.tipo;
    if(t === 'foto') fotos.push(dados[k]);
    else if(t === 'assinatura') assin.push(dados[k]);
    else if(t === 'pessoa') ident.push(dados[k]);    /* pessoas ficam junto da identificação */
    else resto.push(dados[k]);
  }

  if(ident.length){
    P.secao('Identificação');
    for(var a = 0; a < ident.length; a++){
      var c1 = ident[a].campo, v1 = valorTexto(c1, ident[a].valor), nx = ident[a + 1];
      var curto1 = String(c1.rotulo || '').length <= 30 && v1.length <= 34;
      if(nx){
        var v2 = valorTexto(nx.campo, nx.valor);
        if(curto1 && String(nx.campo.rotulo || '').length <= 30 && v2.length <= 34){
          P.linha2(c1.rotulo, v1, nx.campo.rotulo, v2); a++; continue;
        }
      }
      P.linha(c1.rotulo, v1, 0.2);
    }
  }

  secoes(resto).forEach(function(s){
    P.secao(s.titulo);
    s.itens.forEach(function(it){
      var c = it.campo, v = it.valor;
      var rot = s.tiraPrefixo ? String(c.rotulo).split(' — ').slice(1).join(' — ') || c.rotulo : c.rotulo;
      if(c.tipo === 'tabela'){
        P.tabela(rot, (c.colunas || []).map(function(x){ return x.rotulo; }), v || []);
      }else if(c.tipo === 'textao'){
        P.textoLongo(rot, valorTexto(c, v));
      }else{
        P.linha(rot, valorTexto(c, v), 0.6);
      }
    });
  });

  if(fotos.length){
    P.secao('Registro fotográfico', 66);
    var lista = [];
    fotos.forEach(function(it){
      var v = it.valor || [];
      v.forEach(function(f, n){
        lista.push({ref:f, w:f.w, h:f.h, leg:it.campo.rotulo + (v.length > 1 ? ' (' + (n + 1) + '/' + v.length + ')' : '')});
      });
    });
    if(!lista.length) P.vazio('Sem fotos');
    /* carrega uma linha por vez: a foto cheia só fica na memória enquanto
       é desenhada (no celular, todas juntas derrubavam a aba) */
    for(var r = 0; r < lista.length; r += 3){
      var linha = lista.slice(r, r + 3);
      for(var q = 0; q < linha.length; q++) linha[q].d = await dadoFoto(linha[q].ref);
      P.fotosLinha(linha, 3);
      linha.forEach(function(x){ x.d = null; });
    }
  }

  if(assin.length){
    P.secao(assin.length > 1 ? 'Assinaturas' : 'Assinatura');
    var nome = assin.length === 1 ? sessao() : '';
    assin.forEach(function(it){ P.assinatura(it.valor, nome, assin.length > 1 ? it.campo.rotulo : ''); });
  }

  P.rodape();
  return P.doc;
};

})();
