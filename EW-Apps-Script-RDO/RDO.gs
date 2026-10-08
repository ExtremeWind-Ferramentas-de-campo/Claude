/**
 * RDO — Relatório de Operação Diária (Extreme Wind) — versão 18
 * Arquivo do MESMO projeto do Apps Script do Code.gs. Não funciona sozinho:
 * usa login, mini master, projetos e utilitários do Code.gs. A rota de
 * entrada (doPost) também mora no Code.gs e chama enviarRdo() daqui.
 *
 * O PDF é GERADO AQUI (no servidor), a partir dos dados e fotos enviados
 * pelo formulário. Depois é salvo no Dropbox e as linhas vão para o Sheets.
 *
 * v18 (out/2026):
 *   - Saiu do Code.gs para este arquivo (RDO.gs).
 *   - Campo "Equipe Nº" removido: o número já vem no nome do parque da aba
 *     SUPERVISORES (ex.: "GAMELEIRA 1").
 *   - Cliente, parque e equipe vêm do projeto da matrícula de quem logou
 *     (aba SUPERVISORES, lida pelo Code.gs). Planilha, PDF e e-mail não mudam.
 *   - Banco de inputs devolve também "projetos" (clientes, parques e
 *     supervisores da aba SUPERVISORES) para a lista do formulário quando o
 *     técnico não está em nenhum projeto.
 *
 * v17:
 *   - UM RDO por técnico por dia: chave = matrícula de quem logou + data do
 *     expediente. Reenvio APAGA as linhas antigas (Relatorios, Atividades,
 *     Funcionarios) e grava as novas, dentro de um LockService.
 *   - Nome do PDF termina com a matrícula em vez do horário, e o upload usa
 *     mode:overwrite -> o PDF do dia é substituído, não duplicado.
 *   - Aba Relatorios ganhou a coluna "Matricula_login".
 *
 * v16: SEM MUDANÇA no backend (Próxima atividade virou campo de busca no html).
 * v15: PDF: "Resumo da atividade" virou "Atividade realizada"; campos pareados.
 * v14: SEM MUDANÇA no backend (rolagem das listas suspensas no html).
 * v13: aba "ATV POR HR" em formato novo (1 linha por atividade):
 *        A = ID (ignorado) | B = Atividade | C = Tipo de reparo
 *        D = Observação obrigatória (Sim) | E = Atividade obrigatória (Sim)
 *        F = Foto obrigatória (Sim)
 *      Colunas localizadas pelo CABEÇALHO (linha 1), com as posições como reserva.
 *      "Atividade obrigatória = Sim" -> a atividade vale para TODO tipo de reparo.
 * v12: cópia do PDF por e-mail (escopo novo: rodar testarEmail() e aceitar).
 * v11: BANCO DE INPUTS (planilha separada) alimenta cliente/parque, resumo de
 *      atividade, tipo de reparo e a lista de atividades por hora.
 * v10: LOGIN por matrícula + CPF; aba "Funcionarios" em formato longo.
 * v9:  integração com a MINI MASTER (doGet?lista=tecnicos).
 *
 * Banco de inputs (Propriedade INPUTS_SHEET_ID), abas:
 *   "PARQUE E CLIENTE" (A=parque, B=cliente)
 *   "RESUMO DE ATV"    (A=itens do resumo)
 *   "ATV POR HR"       (ver v13)
 *   "SUPERVISORES"     (projetos em andamento — lida pelo Code.gs)
 */

/* Banco de inputs guardado só 10 min: o que for editado na planilha aparece no
   app em até 10 min, sem precisar rodar limparCacheInputs(). */
var IN_CACHE_KEY = 'INPUTS_V4';   /* V4: + "projetos" (troca de chave = cache antigo ignorado) */
var IN_CACHE_SEG = 600;

/* Abas do Banco de inputs (sobrescrevíveis por Propriedade do Script) */
var IN_ABA_PC_PADRAO = 'PARQUE E CLIENTE';
var IN_ABA_RESUMO_PADRAO = 'RESUMO DE ATV';
var IN_ABA_ATV_PADRAO = 'ATV POR HR';

/* ===================== ENVIO DO RDO ===================== */

/** Chamado pelo doPost do Code.gs. Devolve o objeto de resposta (sem resposta()). */
function enviarRdo(dados) {
  var sess = validarToken(dados.token);
  if (!sess.ok) {
    return {
      ok: false, sessao: false,
      erro: sess.expirado ? 'Sessão expirada. Faça login novamente.'
                          : 'Sessão inválida. Faça login novamente.'
    };
  }

  var props = PropertiesService.getScriptProperties();
  var id = gerarId();
  var matLogin = sess.mat;

  /* trava: dois envios do mesmo técnico não podem apagar/gravar ao mesmo tempo */
  var lock = LockService.getScriptLock();
  var travou = false;
  try { travou = lock.tryLock(30000); } catch (eL) { travou = false; }
  if (!travou) {
    return {
      ok: false, retentar: true,
      erro: 'Outro envio deste mesmo RDO ainda está em andamento. Tente de novo em 1 minuto.'
    };
  }

  var subst, linkPdf, pdfBlob, gravou;
  try {
    /* 1) apaga o RDO anterior do mesmo técnico na mesma data */
    subst = apagarRdoAnterior(props, matLogin, dados.data_exp);

    /* 2) gera e sobe o PDF (mesmo nome = sobrescreve o do dia) */
    pdfBlob = gerarPdf(dados, id);
    linkPdf = uploadDropbox(pdfBlob, dados, id, props, matLogin);

    /* 3) se o RDO refeito mudou de cliente/parque, o PDF antigo ficaria órfão */
    if (subst.caminhoAntigo) {
      var base = props.getProperty('DROPBOX_FOLDER') || '/Relatorios';
      var novo = montarCaminho(dados, id, base, matLogin).path;
      if (subst.caminhoAntigo !== novo) apagarDropbox(subst.caminhoAntigo, props);
    }

    /* 4) grava as linhas novas */
    gravou = gravarSheets(dados, id, linkPdf, props, matLogin);
  } finally {
    try { lock.releaseLock(); } catch (eR) {}
  }

  /* cópia por e-mail: falhar aqui NÃO invalida o RDO (já está no Dropbox e no Sheets) */
  var email = enviarCopiaEmail(dados, pdfBlob, id);

  return {
    ok: true, id: id, link: linkPdf,
    gravou: gravou,
    substituiu: subst.apagou > 0, apagadas: subst.apagou,
    emailOk: email.ok, emailErro: email.erro, emailPara: email.para
  };
}

/* ===================== BANCO DE INPUTS ===================== */

/**
 * Lê a planilha "Banco de inputs" e devolve tudo que o formulário precisa:
 *   { clientes:[], parques:{cliente:[parques]}, resumo:[], reparos:[{tipo, atividades:[{nome, exec}]}] }
 * Cache de 6 h, igual à lista de técnicos.
 */
function lerInputs() {
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) {}
  if (cache) {
    var hit = cache.get(IN_CACHE_KEY);
    if (hit) { try { var j = JSON.parse(hit); if (j && j.reparos && j.comuns && j.feriado && j.projetos) return j; } catch (e2) {} }
  }

  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('INPUTS_SHEET_ID');
  if (!id) throw new Error('Propriedade INPUTS_SHEET_ID não configurada.');
  var ss = SpreadsheetApp.openById(id);

  var atv = lerAbaAtvPorHora(ss, props);
  var out = {
    clientes: [],
    parques: {},
    resumo: lerAbaResumo(ss, props),
    reparos: atv.reparos,
    comuns: atv.comuns,
    feriado: atv.feriado
  };
  var pc = lerAbaParqueCliente(ss, props);
  out.clientes = pc.clientes;
  out.parques = pc.parques;

  /* listas da aba SUPERVISORES (Code.gs), para o técnico sem projeto escolher
     um parque que existe — com o número da equipe no nome. Sem a aba, o RDO
     continua funcionando só com PARQUE E CLIENTE. */
  try { out.projetos = resumoProjetos(lerProjetos()); }
  catch (eSup) { out.projetos = { clientes: [], parques: {}, supervisores: [], erro: String(eSup) }; }

  if (cache) { try { cache.put(IN_CACHE_KEY, JSON.stringify(out), IN_CACHE_SEG); } catch (e3) {} }
  return out;
}

function abaInputs(ss, props, prop, padrao) {
  var nome = (props.getProperty(prop) || padrao).trim();
  var sh = ss.getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não encontrada no Banco de inputs.');
  return sh;
}

/** true se a 1ª linha parece cabeçalho (para pular) */
function ehCabecalho(celulas, palavras) {
  for (var i = 0; i < celulas.length; i++) {
    var t = chaveNome(celulas[i]);
    for (var j = 0; j < palavras.length; j++) {
      if (t === palavras[j]) return true;
    }
  }
  return false;
}

function lerAbaParqueCliente(ss, props) {
  var sh = abaInputs(ss, props, 'INPUTS_ABA_PC', IN_ABA_PC_PADRAO);
  var v = sh.getDataRange().getValues();
  var ini = (v.length && ehCabecalho([v[0][0], v[0][1]], ['parque', 'cliente'])) ? 1 : 0;

  var parques = {}, clientes = [], vistoCli = {};
  for (var r = ini; r < v.length; r++) {
    var parque = limpar(v[r][0]);
    var cliente = limpar(v[r][1]);
    if (!parque || !cliente) continue;
    if (!vistoCli[cliente]) { vistoCli[cliente] = true; clientes.push(cliente); }
    if (!parques[cliente]) parques[cliente] = [];
    if (parques[cliente].indexOf(parque) < 0) parques[cliente].push(parque);
  }
  clientes.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  Object.keys(parques).forEach(function (c) {
    parques[c].sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  });
  if (!clientes.length) throw new Error('Aba "' + sh.getName() + '" sem nenhum par parque/cliente preenchido.');
  return { clientes: clientes, parques: parques };
}

function lerAbaResumo(ss, props) {
  var sh = abaInputs(ss, props, 'INPUTS_ABA_RESUMO', IN_ABA_RESUMO_PADRAO);
  var v = sh.getDataRange().getValues();
  /* a linha 1 é SEMPRE o cabeçalho da tabela: as opções começam na linha 2 */
  var out = [], visto = {};
  for (var r = 1; r < v.length; r++) {
    var t = limpar(v[r][0]);
    if (!t || visto[chaveNome(t)]) continue;
    visto[chaveNome(t)] = true;
    out.push(t);
  }
  if (!out.length) {
    throw new Error('Aba "' + sh.getName() + '" sem opções a partir da linha 2 '
      + '(a linha 1 é tratada como cabeçalho).');
  }
  return out;
}

/** "Sim" em qualquer caixa/acento. Vazio, "Não", "-" => false. */
function ehSim(v) {
  var t = chaveNome(v);
  return t === 's' || t === 'sim' || t === 'x' || t === 'true' || t === 'verdadeiro';
}

/** Acha uma coluna pelo cabeçalho; se não achar, usa a posição padrão. */
function colPorCabecalho(cab, testa, padrao) {
  for (var c = 0; c < cab.length; c++) {
    if (testa(chaveNome(cab[c]))) return c;
  }
  return padrao;
}

/**
 * ATV POR HR — 1 linha por atividade, cabeçalho na linha 1.
 *   B = Atividade | C = Tipo de reparo | D = Observação obrigatória
 *   E = Atividade obrigatória | F = Foto obrigatória
 * Colunas localizadas pelo cabeçalho, com as posições acima como reserva.
 *
 * Devolve { reparos:[{tipo, atividades:[{nome, exec, obs}]}], comuns:[{nome, exec, obs}] }
 * - "Atividade obrigatória = Sim" joga a atividade em `comuns`: ela aparece em
 *   todo tipo de reparo.
 * - Um tipo cujas atividades sejam TODAS comuns não entra na lista de tipos
 *   (é um agrupador, não um reparo).
 */
function lerAbaAtvPorHora(ss, props) {
  var sh = abaInputs(ss, props, 'INPUTS_ABA_ATV', IN_ABA_ATV_PADRAO);
  var v = sh.getDataRange().getValues();
  if (v.length < 2) {
    throw new Error('Aba "' + sh.getName() + '" sem dados a partir da linha 2.');
  }

  var cab = v[0].map(function (x) { return limpar(x); });
  var iAtv = colPorCabecalho(cab, function (t) {
    return t.indexOf('atividade') === 0 && t.indexOf('obrigat') < 0;
  }, 1);                                                   /* B */
  var iTipo = colPorCabecalho(cab, function (t) {
    return t.indexOf('tipo') >= 0 && t.indexOf('reparo') >= 0;
  }, 2);                                                   /* C */
  var iObs = colPorCabecalho(cab, function (t) {
    return t.indexOf('observ') >= 0;
  }, 3);                                                   /* D */
  var iObrig = colPorCabecalho(cab, function (t) {
    return t.indexOf('atividade') >= 0 && t.indexOf('obrigat') >= 0;
  }, 4);                                                   /* E */
  var iFoto = colPorCabecalho(cab, function (t) {
    return t.indexOf('foto') >= 0;
  }, -1);                                                  /* F — só se existir */

  var grupos = {}, ordem = [], comuns = [], vistoComum = {};
  var feriado = [], vistoFeriado = {};   /* atividades com "feriado" no nome, com ou sem tipo */

  for (var r = 1; r < v.length; r++) {
    var linha = v[r];
    var nome = limpar(linha[iAtv]);
    var tipo = limpar(linha[iTipo]);
    if (!nome) continue;

    var item = {
      nome: nome,
      exec: (iFoto >= 0) ? ehSim(linha[iFoto]) : false,
      obs: ehSim(linha[iObs])
    };
    var comum = ehSim(linha[iObrig]);

    if (chaveNome(nome).indexOf('feriado') >= 0 && !vistoFeriado[chaveNome(nome)]) {
      vistoFeriado[chaveNome(nome)] = true;
      feriado.push(item);
    }

    if (comum) {
      var kc = chaveNome(nome);
      if (!vistoComum[kc]) { vistoComum[kc] = true; comuns.push(item); }
    }

    if (!tipo) continue;            /* atividade comum sem tipo: só em `comuns` */
    if (!grupos[tipo]) { grupos[tipo] = { tipo: tipo, atividades: [], visto: {}, soComuns: true }; ordem.push(tipo); }
    var g = grupos[tipo];
    var k = chaveNome(nome);
    if (g.visto[k]) continue;
    g.visto[k] = true;
    if (!comum) {
      g.soComuns = false;
      g.atividades.push(item);
    }
  }

  var reparos = [];
  ordem.forEach(function (t) {
    var g = grupos[t];
    if (g.soComuns) return;         /* agrupador de atividades comuns: não é tipo de reparo */
    if (!g.atividades.length) return;
    reparos.push({ tipo: g.tipo, atividades: g.atividades });
  });

  if (!reparos.length) {
    throw new Error('Aba "' + sh.getName() + '": nenhum tipo de reparo selecionável. '
      + 'Confira a coluna "Tipo de reparo" e se todas as linhas não estão marcadas '
      + 'como "Atividade obrigatória".');
  }
  return { reparos: reparos, comuns: comuns, feriado: feriado };
}

/** true se nenhuma atividade exige foto (provável coluna F ausente/vazia) */
function iFotoAusente(i) {
  var achou = i.comuns.some(function (a) { return a.exec; });
  if (achou) return false;
  return !i.reparos.some(function (rp) {
    return rp.atividades.some(function (a) { return a.exec; });
  });
}

/** Força releitura do Banco de inputs (rodar após editar a planilha). */
function limparCacheInputs() {
  try { CacheService.getScriptCache().remove(IN_CACHE_KEY); } catch (e) {}
  var i = lerInputs();
  Logger.log('Cache limpo. Clientes: ' + i.clientes.length
    + ' | Itens de resumo: ' + i.resumo.length
    + ' | Tipos de reparo: ' + i.reparos.length
    + ' | Atividades comuns: ' + i.comuns.length
    + ' | Resumo com feriado: ' + i.resumo.filter(function (x) { return chaveNome(x).indexOf('feriado') >= 0; }).join(', ')
    + ' | Atividades de feriado: ' + i.feriado.map(function (a) { return a.nome; }).join(', '));
  return i;
}

/** Diagnóstico do Banco de inputs — rodar à mão. */
function testarInputs() {
  var i = lerInputs();
  Logger.log('CLIENTES (' + i.clientes.length + '): ' + i.clientes.join(', '));
  i.clientes.forEach(function (c) {
    Logger.log('  ' + c + ' -> ' + (i.parques[c] || []).length + ' parque(s): ' + (i.parques[c] || []).join(', '));
  });
  Logger.log('RESUMO (' + i.resumo.length + '): ' + i.resumo.join(', '));
  Logger.log('TIPOS DE REPARO SELECIONÁVEIS (' + i.reparos.length + '):');
  i.reparos.forEach(function (rp) {
    var ex = rp.atividades.filter(function (a) { return a.exec; }).length;
    var ob = rp.atividades.filter(function (a) { return a.obs; }).length;
    Logger.log('  ' + rp.tipo + ' -> ' + rp.atividades.length + ' atividade(s) próprias | '
      + ex + ' com foto | ' + ob + ' com observação obrigatória');
  });
  Logger.log('ATIVIDADES COMUNS, aparecem em TODO tipo (' + i.comuns.length + '):');
  i.comuns.forEach(function (a) {
    Logger.log('  ' + a.nome + (a.exec ? ' [foto]' : '') + (a.obs ? ' [observação]' : ''));
  });
  if (!i.comuns.length) {
    Logger.log('  (nenhuma) — se o Almoço/Janta não estiver em cada tipo de reparo, '
      + 'os técnicos daquele tipo não conseguirão enviar o RDO.');
  }
  var temAlmoco = i.comuns.some(function (a) { return /almoc|janta/.test(chaveNome(a.nome)); });
  if (!temAlmoco) {
    var faltam = i.reparos.filter(function (rp) {
      return !rp.atividades.some(function (a) { return /almoc|janta/.test(chaveNome(a.nome)); });
    }).map(function (rp) { return rp.tipo; });
    if (faltam.length) {
      Logger.log('ATENÇÃO: sem Almoço/Janta nestes tipos de reparo (o envio ficará bloqueado): '
        + faltam.join(', '));
    }
  }
  if (iFotoAusente(i)) {
    Logger.log('AVISO: nenhuma atividade com "Foto obrigatória = Sim". '
      + 'Confira se a coluna F existe e está preenchida.');
  }
  return i;
}

/* ===================== EQUIPE (normalização) ===================== */

/**
 * Aceita os dois formatos para não quebrar html antigo:
 *   ["João", "Maria"]                          (v8)
 *   [{nome:"João", mat:"123"}, ...]            (v9)
 * Devolve sempre [{nome, mat}]. Sem limite de quantidade.
 */
function normEquipe(tecnicos) {
  var out = [];
  (tecnicos || []).forEach(function (t) {
    if (t === null || t === undefined) return;
    if (typeof t === 'string') {
      if (t.trim()) out.push({ nome: limpar(t), mat: '' });
    } else {
      var nome = limpar(t.nome);
      if (nome) out.push({ nome: nome, mat: limpar(t.mat) });
    }
  });
  return out;
}

function equipeNomes(eq) {
  return eq.map(function (t) { return t.nome; });
}

function equipeMatriculas(eq) {
  return eq.map(function (t) { return t.mat || 'N/A'; });
}

function equipeNomeMat(eq) {
  return eq.map(function (t) { return t.mat ? (t.nome + ' (' + t.mat + ')') : t.nome; });
}

/* ===================== GERAÇÃO DO PDF ===================== */

function gerarPdf(d, id) {
  var html = montarHtml(d);
  var blob = Utilities.newBlob(html, 'text/html', 'r.html').getAs('application/pdf');
  return blob;
}

/* monta pastas {Cliente}/{Parque}/{MM-AAAA} e o nome RDO_..._ddmmaaaa_ID.pdf */
/**
 * Pastas {Cliente}/{Parque}/{MM-AAAA} e nome do arquivo.
 * A partir da v17 o nome termina com a MATRÍCULA de quem logou (não com o
 * horário), para que refazer o RDO do dia sobrescreva o mesmo arquivo.
 */
function montarCaminho(dados, id, base, matLogin) {
  function sanit(s){ return String(s==null?'':s).trim().replace(/\s+/g, '-'); }
  var p = String(dados.data_exp || '').split('-'); // yyyy-mm-dd
  var yyyy = p[0] || '', mm = p[1] || '', dd = p[2] || '';
  var ddmmaaaa = dd + ' ' + mm + ' ' + yyyy;
  var mesFolder = (mm && yyyy) ? (mm + '-' + yyyy) : 'sem-mes';

  var cliente = dados.cliente || 'SEM-CLIENTE';
  var parque = dados.parque || 'SEM-PARQUE';
  var sufixo = matLogin ? ('MAT' + normMat(matLogin)) : String(id);

  var filename = 'RDO_' + sanit(cliente) + '_' + sanit(parque) + '_' + ddmmaaaa + '_' + sufixo + '.pdf';
  var path = base + '/' + cliente + '/' + parque + '/' + mesFolder + '/' + filename;
  return { path: path, filename: filename };
}

function montarHtml(d) {
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function brData(iso){ if(!iso) return '—'; var p=String(iso).split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
  function arr(a){ return (a&&a.length)? a.map(esc).join(' &bull; ') : '—'; }
  var CEL_L = 'color:#64748B;font-size:11px;padding:5px 7px;border-bottom:1px solid #E2E8F0;vertical-align:top;';
  var CEL_V = 'font-size:12.5px;font-weight:bold;padding:5px 7px;border-bottom:1px solid #E2E8F0;vertical-align:top;';
  /* linha inteira: rótulo + valor ocupando as 3 colunas restantes */
  function linha(l,v){
    return '<tr><td style="width:20%;' + CEL_L + '">' + l + '</td>'
      + '<td colspan="3" style="' + CEL_V + '">' + (v||'—') + '</td></tr>';
  }
  /* dois pares por linha (economiza espaço no PDF) */
  function linha2(l1,v1,l2,v2){
    return '<tr>'
      + '<td style="width:20%;' + CEL_L + '">' + l1 + '</td>'
      + '<td style="width:30%;' + CEL_V + '">' + (v1||'—') + '</td>'
      + '<td style="width:20%;' + CEL_L + '">' + l2 + '</td>'
      + '<td style="width:30%;' + CEL_V + '">' + (v2||'—') + '</td>'
      + '</tr>';
  }
  function sec(titulo, conteudo){
    return '<div style="page-break-inside:avoid;margin-top:16px;">'
      + '<h3 style="margin:0 0 6px 0;font-size:13px;color:#3B5A8A;border-bottom:2px solid #D6E0EC;padding-bottom:4px;">'
      + titulo + '</h3>' + conteudo + '</div>';
  }

  var equipe = normEquipe(d.tecnicos);

  var atv = (d.atividades||[]).filter(function(a){return a.tipo||a.ini||a.fim||a.obs;});
  var atvRows = atv.length ? atv.map(function(a){
    return '<tr><td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;">'
      + esc(a.ini||'—') + ' - ' + esc(a.fim||'—')
      + '</td><td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;font-weight:bold;">'
      + esc(a.tipo||'—')
      + '</td><td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;">'
      + esc(a.obs||'') + '</td></tr>';
  }).join('') : '<tr><td colspan="3" style="padding:8px;color:#94A3B8;font-size:12px;">Sem registros</td></tr>';

  var imgs = (d.imagens&&d.imagens.length) ? d.imagens.map(function(o){
    var src = (o && o.img) ? o.img : o;
    var nome = (o && o.nome) ? o.nome : '';
    if(!src) return '';
    return '<div style="display:inline-block;width:31%;vertical-align:top;margin:0 1% 8px 0;">'
      + '<img src="' + src + '" style="width:100%;border:1px solid #D6E0EC;">'
      + (nome ? '<div style="font-size:10px;color:#64748B;margin-top:2px;">'+esc(nome)+'</div>' : '')
      + '</div>';
  }).join('') : '<span style="color:#94A3B8;font-size:12px;">Sem fotos</span>';

  var assinatura = d.assinatura
    ? '<img src="' + d.assinatura + '" style="height:90px;border-bottom:1px solid #94A3B8;">'
    : '<div style="color:#94A3B8;font-size:12px;">Não assinado</div>';

  var lider = equipe.length ? equipeNomeMat(equipe)[0] : '';

  return ''
  + '<html><head><meta charset="utf-8"></head>'
  + '<body style="font-family:Arial,Helvetica,sans-serif;color:#1E293B;padding:28px;">'

  + '<table style="width:100%;border-bottom:3px solid #3B5A8A;padding-bottom:8px;"><tr>'
  + '<td style="font-size:20px;font-weight:bold;color:#26374F;">EXTREME WIND '
  + '<span style="font-size:13px;color:#64748B;font-weight:normal;">Blade Services</span><br>'
  + '<span style="font-size:14px;color:#3B5A8A;">Relatório de Operação Diária</span></td>'
  + '<td style="text-align:right;font-size:11px;color:#64748B;">Registrado em<br><b style="color:#26374F;">'
  + esc(d.registrado||'') + '</b></td>'
  + '</tr></table>'

  + sec('Identificação',
      '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">'
      + linha2('Data do expediente', brData(d.data_exp),
               'Horário', esc(d.hora_ini||'—')+' às '+esc(d.hora_fim||'—'))
      + linha2('Cliente', esc(d.cliente), 'Parque', esc(d.parque))
      + linha('Equipe', equipeNomeMat(equipe).map(esc).join('<br>') || '—')
      + linha('E-mail responsável', esc(d.email))
      + '</table>')

  + sec('Local e máquina',
      '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">'
      + linha('Local de atividade', esc(d.local))
      + linha2('Turbina (WTG)', esc(d.turbina), 'Blade', esc(d.blade))
      + linha2('Parada da WTG', esc(d.parada), 'WTG posto em marcha', esc(d.marcha))
      + linha2('Fibra-on', esc(d.fibraon), 'Fibra-off', esc(d.fibraoff))
      + '</table>')

  + sec('Atividade realizada',
      '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">'
      + linha2('Atividade realizada', arr(d.resumo), 'Tipo de reparo', esc(d.tipo_reparo))
      + linha2('Avanço do reparo', ((d.avanco!=null && d.avanco!=='') ? esc(d.avanco)+'%' : 'N/A'),
               'Reparo finalizado', (d.finalizado === true || d.finalizado === 'SIM') ? 'SIM' : 'NÃO')
      + '</table>')

  + sec('Atividades por hora',
      '<table style="width:100%;border-collapse:collapse;">'
      + '<tr style="background:#F4F7FB;">'
      + '<th style="text-align:left;padding:6px 8px;font-size:11px;color:#3B5A8A;">Horário</th>'
      + '<th style="text-align:left;padding:6px 8px;font-size:11px;color:#3B5A8A;">Atividade</th>'
      + '<th style="text-align:left;padding:6px 8px;font-size:11px;color:#3B5A8A;">Observação</th></tr>'
      + atvRows + '</table>')

  + sec('Próxima atividade', '<div style="font-size:13px;">' + arr(d.proxima) + '</div>')

  + sec('Registro fotográfico', '<div>' + imgs + '</div>')

  + sec('Assinatura', assinatura
      + '<div style="font-size:11px;color:#64748B;margin-top:4px;">' + esc(lider) + '</div>')

  + '</body></html>';
}

/* ===================== E-MAIL ===================== */

/**
 * Manda o PDF para o e-mail digitado no formulário.
 * Nunca lança: devolve {ok, erro, para} para o front avisar sem travar o envio.
 * Cota do Gmail: ~100 e-mails/dia em conta comum, 1.500 em Workspace.
 */
function enviarCopiaEmail(dados, pdfBlob, id) {
  var para = String(dados.email || '').trim();
  if (!emailValido(para)) return { ok: false, erro: 'E-mail inválido: ' + para, para: para };

  try {
    var props = PropertiesService.getScriptProperties();
    var base = props.getProperty('DROPBOX_FOLDER') || '/Relatorios';
    var nome = montarCaminho(dados, id, base).filename;

    var equipe = equipeNomeMat(normEquipe(dados.tecnicos));
    var parque = dados.parque || '';
    var assunto = 'RDO ' + parque + ' — ' + dataBr(dados.data_exp);

    var corpo = ''
      + '<div style="font-family:Arial,Helvetica,sans-serif;color:#1E293B;font-size:14px;">'
      + '<p>Segue em anexo o Relatório de Operação Diária.</p>'
      + '<table style="border-collapse:collapse;font-size:14px;">'
      + linhaEmail('Data do expediente', dataBr(dados.data_exp))
      + linhaEmail('Horário', (dados.hora_ini || '—') + ' às ' + (dados.hora_fim || '—'))
      + linhaEmail('Cliente', dados.cliente || '—')
      + linhaEmail('Parque', parque || '—')
      + linhaEmail('Tipo de reparo', dados.tipo_reparo || '—')
      + linhaEmail('Avanço do reparo', (dados.avanco || dados.avanco === 0) ? (dados.avanco + '%') : '—')
      + linhaEmail('Reparo finalizado', (dados.finalizado === true || dados.finalizado === 'SIM') ? 'SIM' : 'NÃO')
      + linhaEmail('Equipe', equipe.join('<br>') || '—')
      + linhaEmail('Nº do relatório', id)
      + '</table>'
      + '<p style="color:#64748B;font-size:12px;margin-top:18px;">'
      + 'Mensagem automática do sistema de RDO — Extreme Wind Blade Services. Não responda a este e-mail.'
      + '</p></div>';

    /* copia o blob para não alterar o nome do que já foi enviado ao Dropbox */
    var anexo = pdfBlob.copyBlob().setName(nome);

    MailApp.sendEmail({
      to: para,
      subject: assunto,
      htmlBody: corpo,
      attachments: [anexo],
      name: 'RDO — Extreme Wind'
    });
    return { ok: true, erro: '', para: para };
  } catch (e) {
    return { ok: false, erro: String(e), para: para };
  }
}

function linhaEmail(rot, val) {
  return '<tr><td style="color:#64748B;padding:3px 12px 3px 0;vertical-align:top;">' + rot + '</td>'
    + '<td style="font-weight:bold;padding:3px 0;">' + (val || '—') + '</td></tr>';
}

/** Teste de e-mail — rodar à mão e ACEITAR as permissões na 1ª vez. */
function testarEmail() {
  var quota = MailApp.getRemainingDailyQuota();
  Logger.log('E-mails restantes hoje: ' + quota);
  var eu = Session.getActiveUser().getEmail();
  MailApp.sendEmail({
    to: eu,
    subject: 'Teste RDO — permissão de e-mail OK',
    htmlBody: '<p>Se você recebeu isto, o envio de e-mail do RDO está autorizado.</p>',
    name: 'RDO — Extreme Wind'
  });
  Logger.log('Enviado para ' + eu);
  return quota;
}

/* ===================== DROPBOX ===================== */

function uploadDropbox(blob, dados, id, props, matLogin) {
  var token = getDropboxToken(props);
  var base = props.getProperty('DROPBOX_FOLDER') || '/Relatorios';
  var caminho = montarCaminho(dados, id, base, matLogin);
  var path = caminho.path;

  /* overwrite: refazer o RDO do dia substitui o arquivo, não cria outro */
  var up = UrlFetchApp.fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'post',
    contentType: 'application/octet-stream',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Dropbox-API-Arg': escaparArg({ path: path, mode: 'overwrite', autorename: false, mute: true })
    },
    payload: blob.getBytes(),
    muteHttpExceptions: true
  });
  if (up.getResponseCode() >= 300) {
    throw new Error('Upload Dropbox falhou: ' + up.getContentText());
  }
  var meta = JSON.parse(up.getContentText());
  var pathReal = meta.path_display || path;

  var link = '';
  try {
    var r = UrlFetchApp.fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + token },
      payload: JSON.stringify({ path: pathReal }),
      muteHttpExceptions: true
    });
    var j = JSON.parse(r.getContentText());
    if (j.url) link = j.url;
    else if (j.error && j.error['.tag'] === 'shared_link_already_exists')
      link = j.error.shared_link_already_exists.metadata.url;
  } catch (e2) { /* link é opcional */ }

  return link;
}

/* ===================== SHEETS ===================== */

function gravarSheets(dados, id, linkPdf, props, matLogin) {
  var ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));

  function na(v) {
    if (v === null || v === undefined) return 'N/A';
    if (typeof v === 'string' && v.trim() === '') return 'N/A';
    return v;
  }

  var equipe = normEquipe(dados.tecnicos);

  /* Abas resolvidas ANTES de escrever qualquer coisa: se a aba Atividades
     tivesse sumido/sido renomeada, o código antigo gravava Relatorios e
     Funcionarios e só então estourava em atv.appendRow — sobrava meio RDO. */
  var rel = acharAbaFlex(ss, 'Relatorios');
  if (!rel) throw new Error('A aba "Relatorios" não existe na planilha.');
  var fun = acharAbaFlex(ss, 'Funcionarios') || criarAbaFuncionarios(ss);
  var atv = acharAbaFlex(ss, 'Atividades');
  if (!atv) {
    atv = criarAbaAtividades(ss);
    Logger.log('AVISO: aba "Atividades" nao existia e foi criada agora.');
  }

  /* --- Relatorios: coluna Tecnicos virou Matriculas --- */
  var linhaRel = [
    id,
    na(dados.registrado), na(dados.data_exp), na(dados.hora_ini), na(dados.hora_fim),
    na(dados.cliente), na(dados.parque), na(equipeMatriculas(equipe).join(', ')), na(dados.email),
    na(dados.local), na(dados.turbina), na(dados.blade), na(dados.parada), na(dados.marcha),
    na(dados.fibraon), na(dados.fibraoff), na((dados.resumo || []).join('; ')),
    na((dados.proxima || []).join('; ')), na(dados.avanco),
    na(dados.tipo_reparo), (dados.finalizado === true || dados.finalizado === 'SIM') ? 'SIM' : 'NÃO',
    na(matLogin ? normMat(matLogin) : (equipe[0] ? equipe[0].mat : '')),
    na(linkPdf)
  ];

  /* --- Funcionarios: formato longo, 1 linha por técnico --- */
  var linhasFun = equipe.map(function (t) {
    return [
      id, na(dados.parque), na(dados.data_exp), na(dados.hora_ini), na(dados.hora_fim),
      na(t.nome), na(t.mat)
    ];
  });

  /* --- Atividades --- */
  var linhasAtv = (dados.atividades || []).map(function (a, i) {
    return [
      id, na(dados.parque), na(dados.data_exp), na(dados.turbina), na(dados.blade),
      i + 1, na(a.ini), na(a.fim), na(a.tipo), na(a.obs)
    ];
  });

  /* Uma chamada por aba em vez de uma por linha: um RDO de 12 atividades saía
     em 13 round-trips e era candidato a estourar o tempo no meio. */
  var gravou = { rel: 0, fun: 0, atv: 0 };
  try {
    gravou.rel = escreverBloco(rel, [linhaRel]);
    gravou.fun = escreverBloco(fun, linhasFun);
    gravou.atv = escreverBloco(atv, linhasAtv);
  } catch (e) {
    /* nunca deixar meio RDO na planilha: desfaz o que já entrou */
    try { apagarLinhasPorId(rel, [id]); } catch (e1) {}
    try { apagarLinhasPorId(fun, [id]); } catch (e2) {}
    try { apagarLinhasPorId(atv, [id]); } catch (e3) {}
    throw new Error('Falha ao gravar na planilha: ' + e
      + ' (nada ficou pela metade, mas o RDO NAO foi salvo)');
  }
  return gravou;
}

/** Cria a aba Atividades com o cabeçalho padrão (mesma lógica de Funcionarios). */
function criarAbaAtividades(ss) {
  var sh = ss.insertSheet('Atividades');
  sh.appendRow(['Relatorio_ID', 'Parque', 'Data_exp', 'Turbina', 'Blade',
                'Ordem', 'Hora_ini', 'Hora_fim', 'Atividade', 'Observacao']);
  sh.setFrozenRows(1);
  return sh;
}

/**
 * Diagnóstico manual. Rode no editor do Apps Script e veja o log:
 * mostra se as três abas existem, quantas linhas cada uma tem e se há
 * relatório sem atividade (o sintoma que apareceu).
 */
function diagnosticoAbas() {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));

  Logger.log('--- ABAS DA PLANILHA (entre colchetes, para ver espaco sobrando) ---');
  ss.getSheets().forEach(function (sh) {
    Logger.log('  [' + sh.getName() + ']  linhas=' + sh.getLastRow()
      + '  colunas=' + sh.getMaxColumns() + (sh.isSheetHidden() ? '  (OCULTA)' : ''));
  });

  Logger.log('--- ABAS QUE O RDO PRECISA ---');
  ['Relatorios', 'Funcionarios', 'Atividades'].forEach(function (n) {
    var exata = ss.getSheetByName(n);
    var flex = acharAbaFlex(ss, n);
    if (exata) { Logger.log(n + ': OK (nome exato)'); return; }
    if (flex) { Logger.log(n + ': *** NOME ERRADO -> esta como [' + flex.getName() + '] ***'); return; }
    Logger.log(n + ': *** NAO EXISTE ***');
  });

  Logger.log('--- PROTECOES (podem bloquear a gravacao) ---');
  ss.getSheets().forEach(function (sh) {
    var ps = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)
      .concat(sh.getProtections(SpreadsheetApp.ProtectionType.RANGE));
    if (ps.length) Logger.log('  [' + sh.getName() + '] tem ' + ps.length + ' protecao(oes)');
  });

  Logger.log('--- TESTE DE ESCRITA REAL NA ABA ATIVIDADES ---');
  var teste = acharAbaFlex(ss, 'Atividades');
  if (!teste) {
    Logger.log('  impossivel testar: aba nao encontrada');
  } else {
    try {
      var linha = teste.getLastRow() + 1;
      teste.getRange(linha, 1, 1, 10).setValues([['TESTE_DIAGNOSTICO', '', '', '', '', '', '', '', '', '']]);
      SpreadsheetApp.flush();
      teste.deleteRow(linha);
      Logger.log('  escrita OK (linha de teste gravada e apagada)');
    } catch (eT) {
      Logger.log('  *** ESCRITA FALHOU: ' + eT + ' ***');
    }
  }

  Logger.log('--- RELATORIOS SEM ATIVIDADES ---');
  var rel = acharAbaFlex(ss, 'Relatorios');
  var atv = acharAbaFlex(ss, 'Atividades');
  if (!rel || !atv || rel.getLastRow() < 2) return;

  var ids = {};
  atv.getRange(1, 1, atv.getLastRow(), 1).getValues().forEach(function (r) { ids[String(r[0])] = true; });

  var v = rel.getDataRange().getValues();
  var iData = idxCabecalho(rel, 'Data_exp');
  var orfaos = 0;
  for (var r = 1; r < v.length; r++) {
    if (!ids[String(v[r][0])]) {
      orfaos++;
      Logger.log('SEM ATIVIDADES -> id ' + v[r][0] + ' | data ' + (iData >= 0 ? v[r][iData] : '?'));
    }
  }
  Logger.log('Relatorios sem nenhuma linha em Atividades: ' + orfaos);
}

/* ===================== UM RDO POR TÉCNICO POR DIA ===================== */

/**
 * Apaga o RDO anterior do mesmo técnico (matrícula de quem logou) na mesma
 * data de expediente, nas três abas. Devolve:
 *   { apagou: n, ids: [...], caminhoAntigo: '/...pdf' | '' }
 * `caminhoAntigo` é reconstruído a partir do cliente/parque/data da linha
 * antiga — serve para apagar o PDF órfão se o RDO refeito trocou de parque.
 */
function apagarRdoAnterior(props, matLogin, dataExp) {
  var vazio = { apagou: 0, ids: [], caminhoAntigo: '' };
  var mat = normMat(matLogin);
  var data = normData(dataExp);
  if (!mat || !data) return vazio;

  var ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  var rel = ss.getSheetByName('Relatorios');
  if (!rel || rel.getLastRow() < 2) return vazio;

  var iMat = idxCabecalho(rel, 'Matricula_login');
  var iData = idxCabecalho(rel, 'Data_exp');
  var iCli = idxCabecalho(rel, 'Cliente');
  var iParq = idxCabecalho(rel, 'Parque');
  if (iMat < 0 || iData < 0) return vazio;   /* planilha não migrada: não apaga nada */

  var v = rel.getDataRange().getValues();
  var linhas = [], ids = [], caminho = '';
  var base = props.getProperty('DROPBOX_FOLDER') || '/Relatorios';

  for (var r = 1; r < v.length; r++) {
    if (normMat(v[r][iMat]) !== mat) continue;
    if (normData(v[r][iData]) !== data) continue;
    linhas.push(r + 1);
    ids.push(String(v[r][0]));
    if (!caminho && iCli >= 0 && iParq >= 0) {
      caminho = montarCaminho(
        { cliente: v[r][iCli], parque: v[r][iParq], data_exp: normData(v[r][iData]) },
        '', base, mat
      ).path;
    }
  }
  if (!linhas.length) return vazio;

  /* de baixo para cima, senão os índices mudam no meio do caminho */
  linhas.sort(function (a, b) { return b - a; });
  linhas.forEach(function (n) { rel.deleteRow(n); });

  apagarLinhasPorId(acharAbaFlex(ss, 'Atividades'), ids);
  apagarLinhasPorId(acharAbaFlex(ss, 'Funcionarios'), ids);

  return { apagou: linhas.length, ids: ids, caminhoAntigo: caminho };
}

/**
 * Diagnóstico: procura RDO do MESMO dia/parque/turbina/blade enviados por
 * matrículas DIFERENTES. É o cenário que duplica as atividades sem ninguém
 * ter enviado duas vezes: dois técnicos da mesma equipe mandaram cada um o seu.
 * apagarRdoAnterior não pega isso, porque a chave dele é matrícula + data.
 */
function acharRdoDaMesmaEquipe(diasAtras) {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  var rel = acharAbaFlex(ss, 'Relatorios');
  if (!rel || rel.getLastRow() < 2) { Logger.log('Relatorios vazia'); return; }

  var iMat = idxCabecalho(rel, 'Matricula_login');
  var iData = idxCabecalho(rel, 'Data_exp');
  var iParq = idxCabecalho(rel, 'Parque');
  var iTurb = idxCabecalho(rel, 'Turbina');
  var iBlade = idxCabecalho(rel, 'Blade');
  if (iMat < 0 || iData < 0) { Logger.log('cabecalhos ausentes'); return; }

  var corte = '';
  if (diasAtras) {
    var dt = new Date(); dt.setDate(dt.getDate() - diasAtras);
    corte = Utilities.formatDate(dt, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  var v = rel.getDataRange().getValues();
  var grupos = {};
  for (var r = 1; r < v.length; r++) {
    var data = normData(v[r][iData]);
    if (corte && data < corte) continue;
    var k = [data, v[r][iParq], v[r][iTurb], v[r][iBlade]].join(' | ');
    if (!grupos[k]) grupos[k] = [];
    grupos[k].push({ id: v[r][0], mat: normMat(v[r][iMat]), linha: r + 1 });
  }

  var achou = 0;
  Object.keys(grupos).sort().forEach(function (k) {
    var g = grupos[k];
    if (g.length < 2) return;
    achou++;
    Logger.log('>>> ' + k);
    g.forEach(function (x) {
      Logger.log('      id ' + x.id + '  matricula ' + x.mat + '  (linha ' + x.linha + ')');
    });
  });
  Logger.log(achou ? ('\nGrupos com mais de um RDO: ' + achou)
                   : 'Nenhum caso encontrado no periodo.');
}

/**
 * Limpeza: apaga de Atividades e Funcionarios as linhas cujo Relatorio_ID
 * nao existe mais em Relatorios. Sao as linhas orfas deixadas pela gravacao
 * concorrente da versao antiga. Rode com (true) para apagar de verdade;
 * sem argumento so lista o que seria apagado.
 */
function limparOrfaos(apagarDeVerdade) {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  var rel = acharAbaFlex(ss, 'Relatorios');
  if (!rel || rel.getLastRow() < 2) { Logger.log('Relatorios vazia'); return; }

  var vivos = {};
  rel.getRange(2, 1, rel.getLastRow() - 1, 1).getValues()
     .forEach(function (r) { vivos[String(r[0])] = true; });

  ['Atividades', 'Funcionarios'].forEach(function (nome) {
    var sh = acharAbaFlex(ss, nome);
    if (!sh || sh.getLastRow() < 2) return;
    var v = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
    var linhas = [], ids = {};
    for (var r = 1; r < v.length; r++) {
      var id = String(v[r][0]);
      if (!id || vivos[id]) continue;
      linhas.push(r + 1);
      ids[id] = (ids[id] || 0) + 1;
    }
    Logger.log(nome + ': ' + linhas.length + ' linha(s) orfa(s) em '
      + Object.keys(ids).length + ' id(s)');
    Object.keys(ids).forEach(function (i) { Logger.log('    ' + i + '  (' + ids[i] + ' linhas)'); });
    if (apagarDeVerdade && linhas.length) {
      linhas.sort(function (a, b) { return b - a; });
      linhas.forEach(function (n) { sh.deleteRow(n); });
      Logger.log('    -> APAGADAS');
    }
  });
  if (!apagarDeVerdade) Logger.log('\nModo lista. Rode limparOrfaos(true) para apagar.');
}

/** Diagnóstico: mostra RDO duplicados (mesma matrícula + data) já existentes. */
function acharRdoDuplicados() {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  var rel = ss.getSheetByName('Relatorios');
  var iMat = idxCabecalho(rel, 'Matricula_login');
  var iData = idxCabecalho(rel, 'Data_exp');
  if (iMat < 0) { Logger.log('Rode migrarParaV17() primeiro.'); return []; }

  var v = rel.getDataRange().getValues(), conta = {}, dups = [];
  for (var r = 1; r < v.length; r++) {
    var k = normMat(v[r][iMat]) + '|' + normData(v[r][iData]);
    if (!normMat(v[r][iMat])) continue;
    conta[k] = (conta[k] || 0) + 1;
  }
  Object.keys(conta).forEach(function (k) {
    if (conta[k] > 1) dups.push(k + '  -> ' + conta[k] + ' RDO');
  });
  Logger.log(dups.length
    ? ('Matrícula|data com mais de um RDO (linhas antigas, anteriores à v17):\n' + dups.join('\n'))
    : 'Nenhum duplicado de matrícula+data.');
  return dups;
}

/* ===================== UTIL DE PLANILHA ===================== */

function cabecalhoFuncionarios() {
  return ['ID', 'Parque', 'Data_exp', 'Hora_ini', 'Hora_fim', 'Nome', 'Matricula'];
}

function criarAbaFuncionarios(ss) {
  var sh = ss.insertSheet('Funcionarios');
  sh.appendRow(cabecalhoFuncionarios());
  sh.setFrozenRows(1);
  return sh;
}

/**
 * MIGRAÇÃO v8 -> v9. Rodar UMA VEZ, à mão, no editor do Apps Script.
 * NÃO apaga dado nenhum:
 *   - cria a aba "Funcionarios" com cabeçalho (se não existir);
 *   - renomeia o cabeçalho da coluna H de "Tecnicos" para "Matriculas".
 * As linhas antigas de Relatorios continuam com NOMES na coluna H —
 * a partir da 1ª linha nova, essa coluna passa a ter MATRÍCULAS.
 */
function migrarParaV9() {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  var log = [];

  var rel = ss.getSheetByName('Relatorios');
  if (rel) {
    var cab = rel.getRange(1, 1, 1, rel.getLastColumn()).getValues()[0];
    var iTec = cab.indexOf('Tecnicos');
    if (iTec >= 0) {
      rel.getRange(1, iTec + 1).setValue('Matriculas');
      log.push('Relatorios: cabeçalho "Tecnicos" -> "Matriculas" (coluna ' + (iTec + 1) + ').');
    } else if (cab.indexOf('Matriculas') >= 0) {
      log.push('Relatorios: já estava como "Matriculas".');
    } else {
      log.push('ATENÇÃO: não achei "Tecnicos" nem "Matriculas" no cabeçalho de Relatorios.');
    }
  } else {
    log.push('ATENÇÃO: aba Relatorios não existe.');
  }

  if (!ss.getSheetByName('Funcionarios')) {
    criarAbaFuncionarios(ss);
    log.push('Aba "Funcionarios" criada com cabeçalho.');
  } else {
    log.push('Aba "Funcionarios" já existia (cabeçalho não foi tocado).');
  }

  Logger.log(log.join('\n'));
  return log.join('\n');
}

/**
 * MIGRAÇÃO v9 -> v10. Rodar UMA VEZ, à mão.
 * A aba `Funcionarios` muda de formato (largo -> longo), então ela é
 * RECRIADA VAZIA com o cabeçalho novo. As abas Relatorios e Atividades
 * não são tocadas.
 */
function migrarParaV10() {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  var log = [];

  var fun = ss.getSheetByName('Funcionarios');
  if (fun) {
    var linhasAntes = Math.max(0, fun.getLastRow() - 1);
    fun.clear();
    fun.appendRow(cabecalhoFuncionarios());
    fun.setFrozenRows(1);
    log.push('Aba "Funcionarios" recriada no formato longo (' + linhasAntes + ' linha(s) do formato antigo apagadas).');
  } else {
    criarAbaFuncionarios(ss);
    log.push('Aba "Funcionarios" criada no formato longo.');
  }

  /* garante o segredo do token já na migração, para o 1º login não gerar corrida */
  segredoLogin();
  log.push('LOGIN_SECRET pronto nas Propriedades do Script.');

  log.push('Relatorios e Atividades: não alteradas.');
  Logger.log(log.join('\n'));
  return log.join('\n');
}

/**
 * MIGRAÇÃO v10 -> v11. Rodar UMA VEZ, à mão.
 * Insere as colunas "Tipo_reparo" e "Reparo_finalizado" na aba Relatorios,
 * logo ANTES de "Link_PDF". Insere colunas de verdade: as linhas antigas
 * continuam alinhadas e ficam com essas duas células em branco.
 * Não apaga nada. Rodar duas vezes é seguro.
 */
function migrarParaV11() {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  var log = [];

  var rel = ss.getSheetByName('Relatorios');
  if (!rel) {
    Logger.log('ATENÇÃO: aba Relatorios não existe.');
    return 'ATENÇÃO: aba Relatorios não existe.';
  }

  var cab = rel.getRange(1, 1, 1, rel.getLastColumn()).getValues()[0];
  if (cab.indexOf('Tipo_reparo') >= 0) {
    log.push('Relatorios: colunas novas já existiam.');
  } else {
    var iLink = cab.indexOf('Link_PDF');
    if (iLink < 0) {
      log.push('ATENÇÃO: não achei a coluna "Link_PDF"; as colunas novas foram para o fim.');
      var fim = rel.getLastColumn();
      rel.getRange(1, fim + 1, 1, 2).setValues([['Tipo_reparo', 'Reparo_finalizado']]);
    } else {
      rel.insertColumnsBefore(iLink + 1, 2);
      rel.getRange(1, iLink + 1, 1, 2).setValues([['Tipo_reparo', 'Reparo_finalizado']]);
      log.push('Relatorios: "Tipo_reparo" e "Reparo_finalizado" inseridas antes de "Link_PDF" '
        + '(colunas ' + (iLink + 1) + ' e ' + (iLink + 2) + '). Linhas antigas ficam em branco nessas células.');
    }
  }

  /* aquece o Banco de inputs para o erro aparecer aqui, e não no celular */
  try {
    var i = lerInputs();
    log.push('Banco de inputs OK: ' + i.clientes.length + ' cliente(s), '
      + i.resumo.length + ' item(ns) de resumo, ' + i.reparos.length + ' tipo(s) de reparo.');
  } catch (e) {
    log.push('ATENÇÃO — Banco de inputs NÃO carregou: ' + e);
  }

  Logger.log(log.join('\n'));
  return log.join('\n');
}

/**
 * MIGRAÇÃO v16 -> v17. Rodar UMA VEZ, à mão.
 * Insere a coluna "Matricula_login" em Relatorios, antes de "Link_PDF".
 * Insere coluna de verdade: as linhas antigas continuam alinhadas e ficam com
 * essa célula em branco (por isso a regra de substituição só vale para RDO
 * enviados a partir da v17).
 */
function migrarParaV17() {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  var log = [];
  var rel = ss.getSheetByName('Relatorios');
  if (!rel) { Logger.log('ATENÇÃO: aba Relatorios não existe.'); return 'sem Relatorios'; }

  var cab = rel.getRange(1, 1, 1, rel.getLastColumn()).getValues()[0];
  if (cab.indexOf('Matricula_login') >= 0) {
    log.push('Relatorios: coluna "Matricula_login" já existia.');
  } else {
    var iLink = cab.indexOf('Link_PDF');
    if (iLink < 0) {
      var fim = rel.getLastColumn();
      rel.getRange(1, fim + 1).setValue('Matricula_login');
      log.push('ATENÇÃO: não achei "Link_PDF"; a coluna nova foi para o fim.');
    } else {
      rel.insertColumnsBefore(iLink + 1, 1);
      rel.getRange(1, iLink + 1).setValue('Matricula_login');
      log.push('Relatorios: "Matricula_login" inserida antes de "Link_PDF" (coluna ' + (iLink + 1) + ').');
    }
  }
  log.push('Linhas antigas ficam com Matricula_login em branco: a substituição '
    + 'automática passa a valer só para os RDO enviados de agora em diante.');
  log.push('Sessão do login agora vale ' + SESSAO_HORAS + ' h.');
  Logger.log(log.join('\n'));
  return log.join('\n');
}

/** Setup de planilha NOVA. CUIDADO: apaga o conteúdo das abas. */
function criarCabecalhos() {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));

  var rel = ss.getSheetByName('Relatorios') || ss.insertSheet('Relatorios');
  rel.clear();
  rel.appendRow([
    'ID', 'Registrado_em', 'Data_exp', 'Hora_ini', 'Hora_fim',
    'Cliente', 'Parque', 'Matriculas', 'Email', 'Local',
    'Turbina', 'Blade', 'Parada_WTG', 'WTG_marcha', 'Fibra_on', 'Fibra_off',
    'Resumo', 'Proxima_atividade', 'Avanco_reparo',
    'Tipo_reparo', 'Reparo_finalizado', 'Matricula_login', 'Link_PDF'
  ]);

  var atv = ss.getSheetByName('Atividades') || ss.insertSheet('Atividades');
  atv.clear();
  atv.appendRow(['Relatorio_ID', 'Parque', 'Data_exp', 'Turbina', 'Blade', 'Ordem', 'Hora_ini', 'Hora_fim', 'Atividade', 'Observacao']);

  var fun = ss.getSheetByName('Funcionarios') || ss.insertSheet('Funcionarios');
  fun.clear();
  fun.appendRow(cabecalhoFuncionarios());
  fun.setFrozenRows(1);
}
