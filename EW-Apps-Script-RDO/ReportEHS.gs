/**
 * REPORT DIÁRIO DE EHS — arquivo separado do MESMO projeto do Apps Script.
 *
 * Não funciona sozinho: usa do Code.gs o login (validarToken), a mini master,
 * os projetos (aba SUPERVISORES) e os utilitários (getDropboxToken,
 * escaparArg, acharAbaFlex, idxCabecalho, normData, gerarId...).
 * A rota fica no doPost do Code.gs:  acao 'reportEhs' -> enviarReportEhs(dados)
 *
 * Antes o report usava o backend genérico do construtor de formulários, com o
 * botão "Corrigir" (o técnico digitava o protocolo do envio original). Esse
 * vínculo acabou: o report agora só fala com este projeto.
 *
 * UM report por PARQUE + DATA do report (campo "Data"). Reenviar o mesmo dia
 * SUBSTITUI: apaga a linha antiga da planilha e sobrescreve o PDF (mesmo nome
 * de arquivo), não importa qual técnico da equipe reenviou — o parque já traz
 * o número da equipe ("GAMELEIRA 1"). Se o mesmo técnico tinha mandado o dia
 * com OUTRO parque (erro de preenchimento), esse report errado também sai, e o
 * PDF dele é apagado. Tudo dentro de um LockService, como o RDO.
 *
 * O PDF continua sendo montado no celular (jsPDF + ew-form.js) e chega aqui
 * em base64; o servidor só confere se é PDF mesmo e grava.
 *
 * Arquivos (pastas criadas sozinhas pelo Dropbox no 1º upload):
 *   <EHS_PASTA>/<CLIENTE>/<PARQUE>/W<semana>/<PARQUE> <DD-MM-AAAA>.pdf
 *   ex.: .../16 - CONTROLE DE DOCUMENTAÇÃO DIÁRIA/SIEMENS/GAMELEIRA 1/W41/GAMELEIRA 1 08-10-2026.pdf
 *   Semana = semana ISO (segunda a domingo) da DATA do report, no mesmo
 *   formato "W<nn>" das pastas do Abastecimento.
 *
 * Planilha: a MESMA do RDO (Propriedade SHEET_ID), aba "Reports EHS",
 * criada sozinha no 1º envio.
 *   Colunas fixas: Protocolo | Recebido_em | Matricula_login | Data |
 *                  Cliente | Parque | Supervisor | Link_PDF | Caminho_PDF
 *   Depois, uma coluna por pergunta do formulário (rótulo). Pergunta nova no
 *   formulário = coluna nova no fim, criada sozinha. A ordem é achada pelo
 *   cabeçalho, então mexer na ordem das colunas na planilha não quebra nada.
 *   Os reports antigos (do construtor) continuam na planilha antiga.
 *
 * Propriedades do Script (todas opcionais):
 *   EHS_SHEET_ID   outra planilha, se não quiser na do RDO
 *   EHS_ABA        padrão "Reports EHS"
 *   EHS_PASTA      padrão "/02 - EXTREME WIND/5 - SEGURANCA E MEIO AMBIENTE/
 *                  16 - CONTROLE DE DOCUMENTAÇÃO DIÁRIA"
 *
 * Rodar à mão depois de colar: testarReportEhs()
 */
var EHS_ABA_PADRAO = 'Reports EHS';
var EHS_PASTA_PADRAO = '/02 - EXTREME WIND/5 - SEGURANCA E MEIO AMBIENTE/16 - CONTROLE DE DOCUMENTAÇÃO DIÁRIA';
var EHS_CAB_FIXO = ['Protocolo', 'Recebido_em', 'Matricula_login', 'Data', 'Cliente', 'Parque',
                    'Supervisor', 'Link_PDF', 'Caminho_PDF'];
var EHS_PDF_MAX_BYTES = 45 * 1024 * 1024;
var EHS_PFX = 'EHS1_';

/* ---------- configuração ---------- */

function ehsPasta(props) {
  /* aceita o formato do construtor (\02 - EXTREME WIND\...) e o do Dropbox (/02 - ...) */
  var p = String(props.getProperty('EHS_PASTA') || EHS_PASTA_PADRAO).replace(/\\/g, '/').trim();
  if (p.charAt(0) !== '/') p = '/' + p;
  return p.replace(/\/+$/, '');
}

function ehsAba(props) {
  /* a mesma planilha do RDO; EHS_SHEET_ID só se quiser separar */
  var id = props.getProperty('EHS_SHEET_ID') || props.getProperty('SHEET_ID');
  if (!id) throw new Error('Propriedade SHEET_ID não configurada.');
  var ss = SpreadsheetApp.openById(id);
  var nome = (props.getProperty('EHS_ABA') || EHS_ABA_PADRAO).trim();
  var sh = acharAbaFlex(ss, nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, EHS_CAB_FIXO.length).setValues([EHS_CAB_FIXO]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Nome que pode virar pasta/arquivo no Dropbox. */
function ehsNomeArq(t) {
  return String(t == null ? '' : t).replace(/[\\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || 'SEM-PARQUE';
}

/** Semana ISO (segunda a domingo) de 'aaaa-mm-dd' -> 'W41'. */
function ehsSemana(dataIso) {
  var p = String(dataIso || '').split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  var dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);          /* quinta da mesma semana */
  var ini = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var sem = Math.ceil(((d - ini) / 86400000 + 1) / 7);
  return 'W' + ('0' + sem).slice(-2);
}

/** <pasta>/<CLIENTE>/<PARQUE>/W<nn>/<PARQUE> <DD-MM-AAAA>.pdf */
function ehsCaminho(pasta, cliente, parque, dataIso) {
  var p = String(dataIso || '').split('-');
  var ddmmaaaa = (p[2] || '') + '-' + (p[1] || '') + '-' + (p[0] || '');
  var cli = ehsNomeArq(cliente), pq = ehsNomeArq(parque);
  return pasta + '/' + cli + '/' + pq + '/' + ehsSemana(dataIso) + '/' + pq + ' ' + ddmmaaaa + '.pdf';
}

/* ---------- Dropbox (raiz do time, igual Abastecimento/Meus Equipamentos) ---------- */

function ehsDbxHeaders(token, props) {
  var h = { 'Authorization': 'Bearer ' + token };
  if ((props.getProperty('EQUIP_PATH_ROOT') || '') === 'ROOT') {
    var cache = CacheService.getScriptCache();
    var ns = cache.get(EHS_PFX + 'ROOTNS');
    if (!ns) { ns = eqDbxRootNs(token); if (ns) cache.put(EHS_PFX + 'ROOTNS', String(ns), 21600); }
    if (ns) h['Dropbox-API-Path-Root'] = JSON.stringify({ '.tag': 'root', 'root': String(ns) });
  }
  return h;
}

function ehsUpload(token, props, path, bytes) {
  var h = ehsDbxHeaders(token, props);
  h['Dropbox-API-Arg'] = escaparArg({ path: path, mode: 'overwrite', autorename: false, mute: true });
  var r = UrlFetchApp.fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'post', contentType: 'application/octet-stream', headers: h,
    payload: bytes, muteHttpExceptions: true
  });
  if (r.getResponseCode() >= 300) throw new Error('Upload Dropbox falhou: ' + r.getContentText().slice(0, 300));
  var meta = JSON.parse(r.getContentText());
  return meta.path_display || path;
}

function ehsLink(token, props, path) {
  try {
    var h = ehsDbxHeaders(token, props);
    var r = UrlFetchApp.fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'post', contentType: 'application/json', headers: h,
      payload: JSON.stringify({ path: path }), muteHttpExceptions: true
    });
    var j = JSON.parse(r.getContentText());
    if (j.url) return j.url;
    if (j.error && j.error['.tag'] === 'shared_link_already_exists') {
      return j.error.shared_link_already_exists.metadata.url;
    }
  } catch (e) { /* link é opcional */ }
  return '';
}

/** Apaga um arquivo do Dropbox na raiz do time. Nunca lança. */
function ehsApagar(token, props, path) {
  if (!path) return false;
  try {
    var r = UrlFetchApp.fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'post', contentType: 'application/json', headers: ehsDbxHeaders(token, props),
      payload: JSON.stringify({ path: path }), muteHttpExceptions: true
    });
    return r.getResponseCode() < 300;
  } catch (e) { return false; }
}

/* ---------- planilha ---------- */

/** Garante as colunas fixas + uma por rótulo. Devolve {nome: índice 0-based}. */
function ehsColunas(sh, rotulos) {
  var largura = Math.max(sh.getLastColumn(), 1);
  var cab = sh.getRange(1, 1, 1, largura).getValues()[0].map(function (x) { return String(x || '').trim(); });
  if (!cab.join('')) cab = [];
  var faltam = [];
  EHS_CAB_FIXO.concat(rotulos).forEach(function (n) {
    if (n && cab.indexOf(n) < 0 && faltam.indexOf(n) < 0) faltam.push(n);
  });
  if (faltam.length) {
    var ini = cab.length + 1;
    if (sh.getMaxColumns() < ini + faltam.length - 1) {
      sh.insertColumnsAfter(sh.getMaxColumns(), ini + faltam.length - 1 - sh.getMaxColumns());
    }
    sh.getRange(1, ini, 1, faltam.length).setValues([faltam]).setFontWeight('bold');
    cab = cab.concat(faltam);
    if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  }
  var idx = {};
  cab.forEach(function (n, i) { if (n && !(n in idx)) idx[n] = i; });
  return idx;
}

/**
 * Reports que o novo substitui: mesmo PARQUE + mesma data (qualquer técnico),
 * ou mesmo técnico + mesma data com outro parque (preenchido errado).
 * Devolve [{linha, caminho}].
 */
function ehsAnteriores(sh, idx, mat, parque, dataIso) {
  if (sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var alvo = chaveNome(parque), out = [];
  for (var r = 0; r < v.length; r++) {
    if (normData(v[r][idx.Data]) !== dataIso) continue;
    var mesmoParque = chaveNome(v[r][idx.Parque]) === alvo;
    var mesmoTecnico = normMat(v[r][idx.Matricula_login]) === mat;
    if (!mesmoParque && !mesmoTecnico) continue;
    out.push({ linha: r + 2, caminho: String(v[r][idx.Caminho_PDF] || '') });
  }
  return out;
}

/* ---------- ação: reportEhs ---------- */

/**
 * dados = { token, data:'aaaa-mm-dd', cliente, parque, supervisor,
 *           campos:[{rotulo, valor}], pdf:<base64>, idEnvio }
 */
function enviarReportEhs(dados) {
  dados = dados || {};
  var s = cpTecnicoDaSessao(dados);
  if (s.erro) return s.erro;
  var mat = s.mat;
  var props = PropertiesService.getScriptProperties();

  var dataIso = normData(dados.data);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return { ok: false, erro: 'Preencha a data do report.' };
  var parque = limpar(dados.parque);
  if (!parque) return { ok: false, erro: 'Preencha o parque.' };
  var cliente = limpar(dados.cliente);
  if (!cliente) return { ok: false, erro: 'Preencha o cliente.' };

  /* o mesmo envio chegando 2x (sem resposta no 4G, o técnico reenviou):
     devolve o resultado do 1º em vez de gravar de novo */
  var idEnvio = String(dados.idEnvio || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  var cache = CacheService.getScriptCache();
  if (idEnvio) {
    var ja = cache.get(EHS_PFX + 'ENV_' + idEnvio);
    if (ja) { try { return JSON.parse(ja); } catch (e0) {} }
  }

  var bytes;
  try { bytes = Utilities.base64Decode(String(dados.pdf || '').replace(/^data:[^,]*,/, '')); }
  catch (e1) { return { ok: false, erro: 'O PDF chegou corrompido. Tente de novo.' }; }
  if (!bytes || bytes.length < 5 || (bytes[0] & 255) !== 0x25 || (bytes[1] & 255) !== 0x50) {
    return { ok: false, erro: 'O PDF chegou inválido. Tente de novo.' };
  }
  if (bytes.length > EHS_PDF_MAX_BYTES) {
    return { ok: false, erro: 'O PDF passou de ' + Math.round(EHS_PDF_MAX_BYTES / 1048576) + ' MB.' };
  }

  var campos = (dados.campos || []).filter(function (c) { return c && limpar(c.rotulo); }).slice(0, 200);
  var rotulos = campos.map(function (c) { return limpar(c.rotulo); });

  var lock = LockService.getScriptLock();
  var travou = false;
  try { travou = lock.tryLock(30000); } catch (eL) { travou = false; }
  if (!travou) {
    return { ok: false, retentar: true, erro: 'Outro envio ainda está em andamento. Tente de novo em 1 minuto.' };
  }

  var resp;
  try {
    var sh = ehsAba(props);
    var idx = ehsColunas(sh, rotulos);
    var antes = ehsAnteriores(sh, idx, mat, parque, dataIso);

    var token = getDropboxToken(props);
    var caminho = ehsCaminho(ehsPasta(props), cliente, parque, dataIso);
    var real = ehsUpload(token, props, caminho, bytes);
    var link = ehsLink(token, props, real);

    /* PDF antigo com outro nome (parque trocado no report refeito). Não apaga
       arquivo que outra linha ainda usa (outra equipe no mesmo parque/dia). */
    var emUso = {};
    if (sh.getLastRow() >= 2) {
      var linhasAntes = {};
      antes.forEach(function (a) { linhasAntes[a.linha] = 1; });
      sh.getRange(2, idx.Caminho_PDF + 1, sh.getLastRow() - 1, 1).getValues().forEach(function (l, k) {
        if (!linhasAntes[k + 2] && l[0]) emUso[String(l[0]).toLowerCase()] = 1;
      });
    }
    antes.forEach(function (a) {
      var c = String(a.caminho || '').toLowerCase();
      if (c && c !== real.toLowerCase() && !emUso[c]) ehsApagar(token, props, a.caminho);
    });

    var id = 'EHS-' + gerarId();
    var linha = [];
    for (var i = 0; i < sh.getLastColumn(); i++) linha.push('');
    function por(n, v) { if (n in idx) linha[idx[n]] = v; }
    por('Protocolo', id);
    por('Recebido_em', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'));
    por('Matricula_login', mat);
    por('Data', dataIso);
    por('Cliente', cliente);
    por('Parque', parque);
    por('Supervisor', limpar(dados.supervisor));
    por('Link_PDF', link);
    por('Caminho_PDF', real);
    campos.forEach(function (c) {
      var v = c.valor == null ? '' : String(c.valor);
      /* matrícula/CPF/número longo não pode virar número no Sheets */
      if (/^[0-9.,+\-eE ]+$/.test(v) && v !== '') v = "'" + v;
      por(limpar(c.rotulo), v.slice(0, 45000));
    });

    /* grava a nova antes de apagar as antigas: se a gravação falhar, o
       report anterior continua lá */
    escreverBloco(sh, [linha]);
    antes.map(function (a) { return a.linha; }).sort(function (a, b) { return b - a; })
      .forEach(function (n) { sh.deleteRow(n); });

    resp = { ok: true, id: id, link: link, substituiu: antes.length > 0, caminho: real };
  } catch (err) {
    resp = { ok: false, erro: 'Falha ao gravar o report: ' + err };
  } finally {
    try { lock.releaseLock(); } catch (eR) {}
  }

  if (resp.ok && idEnvio) {
    try { cache.put(EHS_PFX + 'ENV_' + idEnvio, JSON.stringify(resp), 21600); } catch (e3) {}
  }
  return resp;
}

/** Diagnóstico: planilha, aba e pasta do Dropbox. Rodar à mão. */
function testarReportEhs() {
  var props = PropertiesService.getScriptProperties();
  var sh = ehsAba(props);
  Logger.log('Planilha: ' + sh.getParent().getName() + ' | aba: ' + sh.getName()
    + ' | linhas: ' + Math.max(0, sh.getLastRow() - 1));
  var pasta = ehsPasta(props);
  Logger.log('Pasta do Dropbox: ' + pasta);
  Logger.log('Exemplo de arquivo: ' + ehsCaminho(pasta, 'SIEMENS', 'GAMELEIRA 1', hojeIso()));
  var token = getDropboxToken(props);
  var r = UrlFetchApp.fetch('https://api.dropboxapi.com/2/files/get_metadata', {
    method: 'post', contentType: 'application/json', headers: ehsDbxHeaders(token, props),
    payload: JSON.stringify({ path: pasta }), muteHttpExceptions: true
  });
  Logger.log('Dropbox enxerga a pasta? ' + (r.getResponseCode() === 200 ? 'SIM'
    : 'NÃO (' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200) + ')'
      + ' — se a pasta é do time, rode testarEquipamentos() uma vez para o script aprender a raiz.'));
}
