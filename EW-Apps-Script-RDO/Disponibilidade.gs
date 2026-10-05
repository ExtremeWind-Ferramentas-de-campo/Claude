/* =====================================================================
 * MEUS DADOS — DISPONIBILIDADE  (out/2026)
 * ---------------------------------------------------------------------
 * 3º arquivo do MESMO projeto do RDO (junto com Code.gs e Abastecimento.gs).
 * Usa daqui: validarToken / cpTecnicoDaSessao, normMat, getDropboxToken,
 * eqDbxCall, eqDbxRootNs, escaparArg, saida, resposta.
 *
 * O técnico diz, semana a semana, se PODE (S) ou NÃO PODE (N) ser
 * convocado. Na tela ele marca o mês inteiro ou abre e marca semana a semana.
 *
 * ONDE O DADO MORA
 *   Fonte da verdade: aba "Disponibilidade" de uma planilha PRÓPRIA, informada
 *   na Propriedade do Script DISP_SHEET (cole o link ou só o ID). NÃO usa a
 *   planilha do RDO: sem DISP_SHEET a tela dá erro em vez de gravar no lugar errado.
 *     A = Matrícula | B = Nome | C = Semanas (JSON {"2026-W41":"S",...})
 *     D = Atualizado em
 *   Espelho para o RH: CONTROLE DISPONIBILIDADE.xlsx no Dropbox
 *     (02 - EXTREME WIND/2 - RH & DP/8 - VAGAS/CONTROLES DIVERSOS).
 *     O arquivo é REGERADO INTEIRO pelo gatilho dispGatilho (5 min) sempre
 *     que alguém salva ou a semana vira. Edição feita à mão no Excel é
 *     SOBRESCRITA na próxima geração — o Excel é só para leitura/filtro.
 *
 *   Por que não gravar direto no .xlsx: dois técnicos salvando ao mesmo
 *   tempo + o RH com o arquivo aberto no Excel = cópia em conflito no
 *   Dropbox (foi o que quebrou o Meus Equipamentos). Com o Sheets como
 *   fonte, o Excel pode ser apagado que volta igual no próximo gatilho.
 *
 * SEMANAS
 *   ISO (segunda a domingo), rótulo W<nn>. A semana pertence ao mês da sua
 *   QUINTA-FEIRA (regra ISO) — assim nenhuma semana aparece em dois meses.
 *   Janela: da semana atual até completar DISP_MESES meses.
 *   Semanas que já passaram ficam guardadas no Sheets, mas saem do Excel.
 *
 * Propriedade do Script OBRIGATÓRIA:
 *   DISP_SHEET     link (https://docs.google.com/spreadsheets/d/.../edit) ou ID
 *                  da planilha Google da disponibilidade. A conta que publicou
 *                  o Apps Script precisa ter acesso de EDIÇÃO a ela.
 *
 * Propriedades do Script (opcionais):
 *   DISP_ARQUIVO   id ou caminho do .xlsx no Dropbox (padrão: o id abaixo)
 *   DISP_ABA       aba no Sheets (padrão "Disponibilidade")
 *
 * Rodar à mão no editor (1 vez, depois de colar):
 *   testarDisponibilidade()          gera o Excel agora e mostra o resultado
 *   instalarGatilhoDisponibilidade() cria o gatilho de 5 min
 * ===================================================================== */

var DISP_ARQUIVO_PADRAO = 'id:zJii0PvESPAAAAAAAAn2xw';
var DISP_ABA_PADRAO = 'Disponibilidade';
var DISP_ABA_XLSX = 'DISPONIBILIDADE';
var DISP_MESES = 6;                 /* mês atual + 5 */
var DISP_TZ = 'America/Recife';
var DISP_MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
                       'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
var DISP_MESES_CURTO = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/* ---------------- janela de semanas (parte pura) ---------------- */

/** hojeIso = 'yyyy-MM-dd' (no fuso da empresa). Devolve {semanas, meses}. */
function dispJanela(hojeIso, nMeses) {
  nMeses = nMeses || DISP_MESES;
  var p = String(hojeIso).split('-');
  var hoje = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  var dow = hoje.getUTCDay() || 7;
  var seg = new Date(hoje.getTime() - (dow - 1) * 86400000);

  var semanas = [], meses = [], vistos = {};
  for (var k = 0; k < 60; k++) {
    var s = new Date(seg.getTime() + k * 7 * 86400000);
    var qui = new Date(s.getTime() + 3 * 86400000);
    var dom = new Date(s.getTime() + 6 * 86400000);
    var mesChave = qui.getUTCFullYear() + '-' + dispPad(qui.getUTCMonth() + 1);
    if (!vistos[mesChave]) {
      if (meses.length >= nMeses) break;
      vistos[mesChave] = 1;
      meses.push({
        chave: mesChave,
        rotulo: DISP_MESES_NOME[qui.getUTCMonth()] + ' ' + qui.getUTCFullYear(),
        curto: DISP_MESES_CURTO[qui.getUTCMonth()] + '/' + String(qui.getUTCFullYear()).slice(2)
      });
    }
    var iso = dispIsoSemana(qui);
    semanas.push({
      chave: iso.ano + '-W' + dispPad(iso.n),
      n: iso.n,
      mes: mesChave,
      ini: dispDdMm(s),
      fim: dispDdMm(dom),
      atual: k === 0
    });
  }
  return { semanas: semanas, meses: meses };
}

/* recebe a QUINTA da semana: o ano dela é o ano ISO */
function dispIsoSemana(qui) {
  var ano = qui.getUTCFullYear();
  var jan1 = Date.UTC(ano, 0, 1);
  return { ano: ano, n: Math.floor((qui.getTime() - jan1) / 86400000 / 7) + 1 };
}
function dispPad(n) { return (n < 10 ? '0' : '') + n; }
function dispDdMm(d) { return dispPad(d.getUTCDate()) + '/' + dispPad(d.getUTCMonth() + 1); }

function dispHojeIso() { return Utilities.formatDate(new Date(), DISP_TZ, 'yyyy-MM-dd'); }
function dispAgoraTxt() { return Utilities.formatDate(new Date(), DISP_TZ, 'dd/MM/yyyy HH:mm'); }

/* ---------------- planilha (fonte da verdade) ---------------- */

/* aceita o link inteiro ou só o ID */
function dispSheetId(props) {
  var v = String(props.getProperty('DISP_SHEET') || '').trim();
  if (!v) throw new Error('Propriedade DISP_SHEET não configurada (link da planilha de disponibilidade).');
  var m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(v);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(v)) return v;
  throw new Error('DISP_SHEET não parece um link/ID de planilha Google: ' + v);
}

function dispAba() {
  var props = PropertiesService.getScriptProperties();
  var ss;
  try { ss = SpreadsheetApp.openById(dispSheetId(props)); }
  catch (e) {
    if (/DISP_SHEET/.test(e.message)) throw e;
    throw new Error('Não consegui abrir a planilha de disponibilidade. Confira o link em DISP_SHEET ' +
                    'e se a conta do Apps Script tem acesso de edição. Detalhe: ' + e.message);
  }
  var nome = props.getProperty('DISP_ABA') || DISP_ABA_PADRAO;
  var sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, 4).setValues([['Matricula', 'Nome', 'Semanas', 'Atualizado_em']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
  }
  return sh;
}

function dispLerTodos(sh) {
  var n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 4).getValues().map(function (r, i) {
    var v = {};
    try { v = JSON.parse(r[2] || '{}') || {}; } catch (e) { v = {}; }
    return { linha: i + 2, mat: normMat(r[0]), nome: String(r[1] || ''), valores: v,
             atualizadoEm: r[3] instanceof Date ? Utilities.formatDate(r[3], DISP_TZ, 'dd/MM/yyyy HH:mm') : String(r[3] || '') };
  });
}

/* ---------------- entradas (chamadas pela tela) ---------------- */

function disponibilidade(dados) {
  var s = cpTecnicoDaSessao(dados);
  if (s.erro) return s.erro;
  var reg = null;
  dispLerTodos(dispAba()).forEach(function (r) { if (!reg && r.mat === s.mat) reg = r; });
  return dispMontarResposta(s, reg);
}

function salvarDisponibilidade(dados) {
  var s = cpTecnicoDaSessao(dados);
  if (s.erro) return s.erro;

  var novos = dados.valores;
  if (typeof novos === 'string') { try { novos = JSON.parse(novos); } catch (e) { novos = null; } }
  if (!novos || typeof novos !== 'object') return { ok: false, erro: 'Nada para salvar.' };

  /* só aceita semanas da janela atual: o navegador não decide o calendário */
  var jan = dispJanela(dispHojeIso());
  var permitidas = {};
  jan.semanas.forEach(function (w) { permitidas[w.chave] = 1; });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { ok: false, retentar: true, erro: 'Servidor ocupado. Tente salvar de novo em alguns segundos.' };
  }
  var reg;
  try {
    var sh = dispAba();
    reg = null;
    dispLerTodos(sh).forEach(function (r) { if (!reg && r.mat === s.mat) reg = r; });
    var valores = reg ? reg.valores : {};
    Object.keys(permitidas).forEach(function (k) {
      var v = novos[k];
      if (v === 'S' || v === 'N') valores[k] = v;
      else delete valores[k];          /* desmarcou = sem resposta */
    });
    var agora = new Date();
    var linha = [[String(s.tecnico.mat), s.tecnico.nome, JSON.stringify(valores), agora]];
    if (reg) sh.getRange(reg.linha, 1, 1, 4).setValues(linha);
    else sh.appendRow(linha[0]);
    reg = { mat: s.mat, valores: valores, atualizadoEm: Utilities.formatDate(agora, DISP_TZ, 'dd/MM/yyyy HH:mm') };
    PropertiesService.getScriptProperties().setProperty('DISP_SUJO', '1');
  } finally {
    try { lock.releaseLock(); } catch (eR) {}
  }
  var r = dispMontarResposta(s, reg);
  r.salvo = true;
  return r;
}

function dispMontarResposta(s, reg) {
  var jan = dispJanela(dispHojeIso());
  var valores = {};
  if (reg) jan.semanas.forEach(function (w) { if (reg.valores[w.chave]) valores[w.chave] = reg.valores[w.chave]; });
  return {
    ok: true, tipo: 'disponibilidade',
    nome: s.tecnico.nome, mat: String(s.tecnico.mat),
    meses: jan.meses, semanas: jan.semanas, valores: valores,
    atualizadoEm: reg ? reg.atualizadoEm : ''
  };
}

/* ---------------- Excel no Dropbox (espelho para o RH) ---------------- */

function dispGatilho() {
  try {
    var props = PropertiesService.getScriptProperties();
    var semana = dispJanela(dispHojeIso(), 1).semanas[0].chave;
    var sujo = props.getProperty('DISP_SUJO') === '1';
    if (!sujo && props.getProperty('DISP_ULTIMA_SEMANA') === semana) return;
    dispExportar();
  } catch (e) { Logger.log('dispGatilho: ' + e); }
}

function instalarGatilhoDisponibilidade() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dispGatilho') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dispGatilho').timeBased().everyMinutes(5).create();
  Logger.log('Gatilho criado: dispGatilho a cada 5 minutos.');
}

function testarDisponibilidade() {
  var r = dispExportar();
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

function dispExportar() {
  var props = PropertiesService.getScriptProperties();
  var cache = CacheService.getScriptCache();
  if (cache.get('DISP_EXP')) return { ok: false, ocupado: true };
  cache.put('DISP_EXP', '1', 180);
  try {
    /* zera ANTES de ler: quem salvar durante a exportação marca de novo */
    props.setProperty('DISP_SUJO', '0');
    var hoje = dispHojeIso();
    var jan = dispJanela(hoje);
    var todos = dispLerTodos(dispAba());
    todos.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });

    var partes = dispXlsxPartes(jan, todos, dispAgoraTxt());
    var blobs = Object.keys(partes).map(function (nome) {
      return Utilities.newBlob(partes[nome], 'application/xml', nome);
    });
    var xlsx = Utilities.zip(blobs, 'CONTROLE DISPONIBILIDADE.xlsx');
    var up = dispDbxSubir(props, xlsx);

    props.setProperty('DISP_ULTIMA_SEMANA', jan.semanas[0].chave);
    return { ok: true, tecnicos: todos.length, semanas: jan.semanas.length,
             de: jan.semanas[0].chave, ate: jan.semanas[jan.semanas.length - 1].chave,
             arquivo: up.path_display, rev: up.rev };
  } catch (e) {
    props.setProperty('DISP_SUJO', '1');      /* tenta de novo no próximo gatilho */
    throw e;
  } finally {
    cache.remove('DISP_EXP');
  }
}

/* Acha o caminho real pelo id (com a mesma lógica de raiz do time do
   Meus Equipamentos) e sobe por cima. Nunca sobe "às cegas" por caminho:
   na raiz errada o Dropbox criaria uma pasta nova em vez de dar erro. */
function dispDbxSubir(props, blob) {
  var token = getDropboxToken(props);
  var arq = props.getProperty('DISP_ARQUIVO') || DISP_ARQUIVO_PADRAO;
  var meta;
  try {
    meta = JSON.parse(eqDbxCall('https://api.dropboxapi.com/2/files/get_metadata', token, props,
                                { path: arq }).getContentText());
  } catch (e) {
    throw new Error('Não achei o CONTROLE DISPONIBILIDADE.xlsx no Dropbox (' + arq + '). ' +
                    'Confira se a conta do app enxerga a pasta 2 - RH & DP. Detalhe: ' + e.message);
  }
  var headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/octet-stream',
    'Dropbox-API-Arg': escaparArg({ path: meta.path_lower, mode: 'overwrite', autorename: false, mute: true })
  };
  if ((props.getProperty('EQUIP_PATH_ROOT') || '') === 'ROOT') {
    var ns = eqDbxRootNs(token);
    if (ns) headers['Dropbox-API-Path-Root'] = JSON.stringify({ '.tag': 'root', 'root': ns });
  }
  var r = UrlFetchApp.fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'post', headers: headers, payload: blob.getBytes(), muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) {
    throw new Error('Upload do Excel de disponibilidade falhou (' + r.getResponseCode() + '): ' +
                    r.getContentText().slice(0, 300));
  }
  return JSON.parse(r.getContentText());
}

/* ---------------- montagem do .xlsx (parte pura, testável fora) ----------------
   Cabeçalho em 2 linhas: linha 1 = mês (mesclado), linha 2 = semana.
   A = MATRÍCULA, B = NOME, C.. = semanas, última = ATUALIZADO EM.
   Célula: SIM (verde) / NÃO (vermelho) / vazia (não respondeu). */

function dispXlsxPartes(jan, todos, geradoEm) {
  var esc = function (t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var col = function (i) {                 /* 0 -> A */
    var s = ''; i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  };
  var cel = function (c, r, txt, st) {
    var ref = col(c) + r;
    if (txt === '' || txt === null || txt === undefined) return '<c r="' + ref + '" s="' + st + '"/>';
    return '<c r="' + ref + '" s="' + st + '" t="inlineStr"><is><t xml:space="preserve">' + esc(txt) + '</t></is></c>';
  };

  var S = jan.semanas, nS = S.length, cUlt = 2 + nS;
  var linhas = [], merges = [];

  /* linha 1: meses */
  var l1 = [cel(0, 1, 'MATRÍCULA', 1), cel(1, 1, 'NOME', 1)];
  var c = 2;
  jan.meses.forEach(function (m) {
    var qtd = S.filter(function (w) { return w.mes === m.chave; }).length;
    if (!qtd) return;
    for (var j = 0; j < qtd; j++) l1.push(cel(c + j, 1, j === 0 ? m.rotulo.toUpperCase() : '', 5));
    if (qtd > 1) merges.push(col(c) + '1:' + col(c + qtd - 1) + '1');
    c += qtd;
  });
  l1.push(cel(cUlt, 1, 'ATUALIZADO EM', 1));
  merges.push('A1:A2', 'B1:B2', col(cUlt) + '1:' + col(cUlt) + '2');
  linhas.push('<row r="1" ht="20" customHeight="1">' + l1.join('') + '</row>');

  /* linha 2: semanas */
  var l2 = [cel(0, 2, '', 1), cel(1, 2, '', 1)];
  S.forEach(function (w, i) { l2.push(cel(2 + i, 2, 'W' + dispPad(w.n) + '\n' + w.ini + '–' + w.fim, 6)); });
  l2.push(cel(cUlt, 2, '', 1));
  linhas.push('<row r="2" ht="32" customHeight="1">' + l2.join('') + '</row>');

  /* técnicos */
  todos.forEach(function (t, i) {
    var r = 3 + i, cs = [cel(0, r, t.mat, 4), cel(1, r, t.nome, 4)];
    S.forEach(function (w, j) {
      var v = t.valores[w.chave];
      cs.push(v === 'S' ? cel(2 + j, r, 'SIM', 2) : v === 'N' ? cel(2 + j, r, 'NÃO', 3) : cel(2 + j, r, '', 7));
    });
    cs.push(cel(cUlt, r, t.atualizadoEm, 4));
    linhas.push('<row r="' + r + '">' + cs.join('') + '</row>');
  });

  var rFim = Math.max(2, 2 + todos.length);
  var rNota = rFim + 2;
  linhas.push('<row r="' + rNota + '">' + cel(0, rNota,
    'Gerado automaticamente pelo app em ' + geradoEm + '. Não edite: alterações feitas aqui são sobrescritas.', 8) + '</row>');

  var cols = '<cols><col min="1" max="1" width="12" customWidth="1"/><col min="2" max="2" width="36" customWidth="1"/>'
    + '<col min="3" max="' + (2 + nS) + '" width="11.5" customWidth="1"/>'
    + '<col min="' + (cUlt + 1) + '" max="' + (cUlt + 1) + '" width="17" customWidth="1"/></cols>';
  var filtro = 'A2:' + col(cUlt) + rFim;

  var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<dimension ref="A1:' + col(cUlt) + rNota + '"/>'
    + '<sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="2" topLeftCell="C3" activePane="bottomRight" state="frozen"/>'
    + '<selection pane="bottomRight" activeCell="C3" sqref="C3"/></sheetView></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="15"/>' + cols
    + '<sheetData>' + linhas.join('') + '</sheetData>'
    + '<autoFilter ref="' + filtro + '"/>'
    + '<mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>'
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + '</worksheet>';

  var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="5">'
    +   '<font><sz val="11"/><name val="Calibri"/></font>'
    +   '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
    +   '<font><b/><sz val="11"/><color rgb="FF1F5A37"/><name val="Calibri"/></font>'
    +   '<font><b/><sz val="11"/><color rgb="FF9B1C1C"/><name val="Calibri"/></font>'
    +   '<font><i/><sz val="9"/><color rgb="FF6B7280"/><name val="Calibri"/></font>'
    + '</fonts>'
    + '<fills count="7">'
    +   '<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    +   '<fill><patternFill patternType="solid"><fgColor rgb="FF055385"/><bgColor indexed="64"/></patternFill></fill>'
    +   '<fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/><bgColor indexed="64"/></patternFill></fill>'
    +   '<fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/><bgColor indexed="64"/></patternFill></fill>'
    +   '<fill><patternFill patternType="solid"><fgColor rgb="FF0B6E99"/><bgColor indexed="64"/></patternFill></fill>'
    +   '<fill><patternFill patternType="solid"><fgColor rgb="FFDCEBF7"/><bgColor indexed="64"/></patternFill></fill>'
    + '</fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    +   '<border><left style="thin"><color rgb="FFBFC9D4"/></left><right style="thin"><color rgb="FFBFC9D4"/></right>'
    +   '<top style="thin"><color rgb="FFBFC9D4"/></top><bottom style="thin"><color rgb="FFBFC9D4"/></bottom><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="9">'
    /* 0 padrão */ + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    /* 1 cabeçalho */ + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    /* 2 SIM */ + '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    /* 3 NÃO */ + '<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    /* 4 texto */ + '<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
    /* 5 mês */ + '<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    /* 6 semana */ + '<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    /* 7 vazio */ + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>'
    /* 8 nota */ + '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';

  var nomeAba = DISP_ABA_XLSX;
  return {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
      + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheets><sheet name="' + nomeAba + '" sheetId="1" r:id="rId1"/></sheets>'
      + '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\''
      + nomeAba + '\'!$A$2:$' + col(cUlt) + '$' + rFim + '</definedName></definedNames>'
      + '</workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>',
    'xl/worksheets/sheet1.xml': sheet,
    'xl/styles.xml': styles
  };
}
