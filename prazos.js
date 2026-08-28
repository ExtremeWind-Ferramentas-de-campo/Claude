/**
 * PRAZO SEMANAL DOS CHECKLISTS — Extreme Wind
 *
 * Pinta o cartão do checklist de vermelho conforme o prazo se aproxima.
 *
 *   <script src="../prazos.js"></script>
 *
 * COMO FUNCIONA
 * A janela abre toda SEXTA. De sexta até o dia do prazo o cartão fica
 * vermelho, e o tom fecha a cada dia que passa — âmbar na sexta, vermelho
 * forte no dia do vencimento. Passado o prazo o cartão volta ao normal,
 * tenha sido feito ou não, e fica assim até a sexta seguinte, quando o ciclo
 * recomeça.
 *
 * Feito dentro da janela: volta ao normal na hora, e só volta a alertar no
 * próximo ciclo.
 *
 * PRAZOS
 *   veiculo   — Checklist de veículos (Frotas) ....... terça
 *   materiais — Checklist de materiais (Almoxarifado)  segunda
 *
 * O "feito" mora no localStorage, com a data da sexta do ciclo. É por isso
 * que ele se apaga sozinho: na sexta seguinte a data guardada deixa de bater
 * com a do ciclo vigente. Não precisa de rotina de limpeza.
 *
 * ATENÇÃO: é sinal visual, não é controle. localStorage é por aparelho e por
 * navegador — o telefone do técnico não sabe que o do colega já fez. Quem tem
 * a verdade é a planilha. Isto aqui serve para lembrar quem está com o
 * aparelho na mão.
 */
(function (global) {
  'use strict';

  /* Dia da semana do prazo, no padrão do JS: 0=domingo … 6=sábado.
     A janela SEMPRE abre na sexta (5).

     'auto' diz como o checklist se marca como feito:
       app    — o próprio app avisa (o de materiais, ao enfileirar o envio;
                o de veículos, ao gerar o PDF)
       manual — mora no forms.app, que não tem como nos avisar. Quem baixa o
                alerta é o técnico, tocando na etiqueta. */
  var ABRE = 5;
  var PRAZOS = {
    veiculo:    { rotulo: 'Checklist de veículos',        limite: 2, nome: 'terça',   auto: 'app' },
    materiais:  { rotulo: 'Checklist de materiais',       limite: 1, nome: 'segunda', auto: 'app' },
    cordas:     { rotulo: 'Acesso por Cordas',            limite: 1, nome: 'segunda', auto: 'manual' },
    epi:        { rotulo: 'Equipamentos Individuais',     limite: 1, nome: 'segunda', auto: 'manual' },
    ferramentas:{ rotulo: 'Ferramentas Gerais',           limite: 1, nome: 'segunda', auto: 'manual' },
    loto:       { rotulo: 'Kit LOTO',                     limite: 1, nome: 'segunda', auto: 'manual' }
  };

  /* Atalhos para os cartões que levam a vários checklists de uma vez. Evita
     escrever a lista inteira no HTML e esquecer de atualizar quando entrar um
     checklist novo — aqui é o único lugar. */
  var GRUPOS = {
    almoxarifado: ['materiais', 'cordas', 'epi', 'ferramentas', 'loto'],
    frotas:       ['veiculo']
  };
  function expandir(ids) {
    var fora = [];
    ids.forEach(function (id) {
      if (GRUPOS[id]) GRUPOS[id].forEach(function (x) { if (fora.indexOf(x) < 0) fora.push(x); });
      else if (fora.indexOf(id) < 0) fora.push(id);
    });
    return fora;
  }

  var DIA = 86400000;
  var CHAVE = 'ew_prazo_';

  function soData(d) {
    var x = new Date(d || Date.now());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  /* Sexta que abriu o ciclo vigente — a mais recente, contando hoje. */
  function sextaDoCiclo(hoje) {
    var d = soData(hoje);
    d.setDate(d.getDate() - ((d.getDay() - ABRE + 7) % 7));
    return d;
  }

  /* Quantos dias depois da sexta cai o prazo. Segunda = 3, terça = 4. */
  function offsetDoLimite(limite) {
    return (limite - ABRE + 7) % 7;
  }

  function iso(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function feitoNesteCiclo(id, hoje) {
    try {
      return localStorage.getItem(CHAVE + id) === iso(sextaDoCiclo(hoje));
    } catch (_) { return false; }   // navegador com storage bloqueado: só não marca
  }

  /**
   * Estado do prazo agora.
   *   ativo  — está dentro da janela e ainda não foi feito
   *   faltam — dias até o prazo (0 = vence hoje)
   *   nivel  — 0 na sexta … 1 no dia do vencimento
   */
  function estado(id, hoje) {
    var cfg = PRAZOS[id];
    if (!cfg) return null;
    var d = soData(hoje);
    var off = offsetDoLimite(cfg.limite);
    var desdeSexta = Math.round((d - sextaDoCiclo(d)) / DIA);
    var dentro = desdeSexta <= off;
    var feito = feitoNesteCiclo(id, d);
    var faltam = off - desdeSexta;
    return {
      id: id,
      rotulo: cfg.rotulo,
      nomeDoDia: cfg.nome,
      dentroDaJanela: dentro,
      feito: feito,
      ativo: dentro && !feito,
      faltam: faltam,
      /* off nunca é 0 (sexta não é prazo de ninguém aqui), mas a divisão fica
         protegida de qualquer forma — um prazo configurado para sexta cairia
         num 0/0 e pintaria NaN. */
      nivel: off === 0 ? 1 : (off - faltam) / off
    };
  }

  /* Âmbar (nível 0) → vermelho forte (nível 1). Mexer aqui muda a escala
     inteira, nos dois checklists. */
  function cor(nivel) {
    var n = Math.max(0, Math.min(1, nivel));
    var h = Math.round(32 - 32 * n);        // 32° âmbar → 0° vermelho
    var s = Math.round(88 + 7 * n);
    var l = Math.round(56 - 15 * n);
    return 'hsl(' + h + ',' + s + '%,' + l + '%)';
  }

  function textoDoAviso(e) {
    if (e.faltam <= 0) return 'Vence hoje';
    if (e.faltam === 1) return 'Vence amanhã';
    return 'Vence ' + e.nomeDoDia;
  }

  var CSS_ID = 'ew-prazo-css';
  function garantirCss() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement('style');
    st.id = CSS_ID;
    /* A etiqueta entra no fluxo, dentro do bloco de texto do cartão. Nada de
       posição absoluta: no desktop o cartão é coluna e no celular é linha, e
       um canto fixo acabaria em cima do ícone ou da seta em um dos dois. */
    st.textContent = [
      '.ew-prazo-tag{display:inline-flex;align-items:center;gap:5px;align-self:flex-start;margin-top:5px;',
      '  background:var(--ew-prazo-cor,#c0392b);color:#fff;',
      '  font-size:.62rem;font-weight:800;letter-spacing:.4px;text-transform:uppercase;',
      '  padding:3px 9px;border-radius:999px;white-space:nowrap;line-height:1.5;',
      '  box-shadow:0 2px 8px rgba(0,0,0,.22)}',
      /* Etiqueta que o técnico pode tocar para dar baixa (checklist do
         forms.app, que não tem como avisar sozinho). Alvo de toque de 30px,
         senão o dedo erra no celular. */
      '.ew-prazo-tag.tocavel{cursor:pointer;padding:5px 9px;min-height:30px;',
      '  border:1px solid rgba(255,255,255,.55)}',
      '.ew-prazo-tag.tocavel:hover{filter:brightness(1.12)}',
      '.ew-prazo-hoje .ew-prazo-tag{animation:ew-prazo-pisca 1.6s ease-in-out infinite}',
      '@keyframes ew-prazo-pisca{0%,100%{opacity:1}50%{opacity:.45}}',
      '@media(prefers-reduced-motion:reduce){.ew-prazo-hoje .ew-prazo-tag{animation:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /**
   * Pinta um cartão. O elemento precisa usar a variável --c como cor de
   * destaque (é o padrão dos cartões do site).
   */
  function pintar(el, id, hoje, pendentes) {
    if (!el) return null;
    var e = estado(id, hoje);
    if (!e) return null;

    var tagAntiga = el.querySelector('.ew-prazo-tag');
    if (tagAntiga) tagAntiga.remove();
    el.classList.remove('ew-prazo', 'ew-prazo-hoje');
    if (el.dataset.ewCorOriginal !== undefined) {
      el.style.setProperty('--c', el.dataset.ewCorOriginal);
    }

    if (!e.ativo) return e;

    garantirCss();
    if (el.dataset.ewCorOriginal === undefined) {
      el.dataset.ewCorOriginal = el.style.getPropertyValue('--c') || '';
    }
    var c = cor(e.nivel);
    el.style.setProperty('--c', c);
    el.classList.add('ew-prazo');
    if (e.faltam <= 0) el.classList.add('ew-prazo-hoje');

    var tag = document.createElement('span');
    tag.className = 'ew-prazo-tag';
    tag.style.setProperty('--ew-prazo-cor', c);
    /* Cartão que junta vários checklists (o do menu) diz QUANTOS faltam — sem
       isso, o técnico dá baixa num e o cartão continua vermelho sem explicar
       por quê. */
    tag.textContent = (pendentes > 1 ? pendentes + ' pendentes · ' : '') + textoDoAviso(e);
    tag.title = e.rotulo + ' — prazo ' + e.nomeDoDia;

    /* Só o cartão de UM checklist manual ganha o toque para dar baixa. Num
       cartão-resumo não daria para saber qual dos cinco o técnico fez. */
    if (!pendentes && PRAZOS[id].auto === 'manual') {
      tag.classList.add('tocavel');
      tag.setAttribute('role', 'button');
      tag.setAttribute('tabindex', '0');
      tag.title = e.rotulo + ' — prazo ' + e.nomeDoDia + '. Toque para marcar como feito.';
      tag.insertAdjacentHTML('beforeend', ' <i class="fas fa-check" aria-hidden="true"></i>');
      var baixar = function (ev) {
        /* O cartão é um link: sem isto o toque abriria o formulário junto. */
        ev.preventDefault(); ev.stopPropagation();
        if (confirm('Marcar "' + e.rotulo + '" como feito nesta semana?')) marcarFeito(id, hoje);
      };
      tag.addEventListener('click', baixar);
      tag.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') baixar(ev);
      });
    }

    /* Dentro do bloco de texto do cartão, quando existe: é lá que ela fica
       embaixo da descrição nos dois layouts. Cartão sem .txt recebe direto. */
    (el.querySelector('.txt') || el).appendChild(tag);
    return e;
  }

  /**
   * Pinta tudo que estiver marcado com data-ew-prazo.
   * O valor aceita um id (`veiculo`), um grupo (`almoxarifado`) ou vários
   * separados por vírgula. Cartão que junta mais de um mostra o mais urgente
   * e quantos ainda faltam.
   */
  function aplicar(hoje) {
    var achados = [];
    document.querySelectorAll('[data-ew-prazo]').forEach(function (el) {
      var ids = expandir(String(el.dataset.ewPrazo).split(',').map(function (s) { return s.trim(); }));
      /* Mais urgente = tom mais fechado. Empate de tom (na sexta todos acabam
         de abrir) desempata por quem vence primeiro — senão o cartão
         anunciaria "vence terça" num dia em que já há coisa vencendo
         segunda. */
      var escolhido = null, pendentes = 0;
      ids.forEach(function (id) {
        var e = estado(id, hoje);
        if (!e || !e.ativo) return;
        pendentes++;
        if (!escolhido ||
            e.nivel > escolhido.nivel ||
            (e.nivel === escolhido.nivel && e.faltam < escolhido.faltam)) escolhido = e;
      });
      /* pendentes só é passado quando o cartão junta vários — é o que decide
         se cabe o toque de "feito" e a contagem na etiqueta. */
      var r = pintar(el, escolhido ? escolhido.id : ids[0], hoje,
                     ids.length > 1 ? pendentes : 0);
      if (r && r.ativo) achados.push(r);
    });
    return achados;
  }

  function marcarFeito(id, hoje) {
    if (!PRAZOS[id]) return false;
    try {
      localStorage.setItem(CHAVE + id, iso(sextaDoCiclo(hoje)));
      aplicar(hoje);
      return true;
    } catch (_) { return false; }
  }

  function limpar(id) {
    try { localStorage.removeItem(CHAVE + id); } catch (_) {}
  }

  global.EWPrazo = {
    estado: estado, aplicar: aplicar, pintar: pintar,
    marcarFeito: marcarFeito, limpar: limpar, expandir: expandir,
    cor: cor, sextaDoCiclo: sextaDoCiclo, PRAZOS: PRAZOS, GRUPOS: GRUPOS
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { aplicar(); });
  } else {
    aplicar();
  }
})(window);
