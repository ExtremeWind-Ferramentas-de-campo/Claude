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
 * PDF (e a pasta do dia) dele é apagado. Tudo dentro de um LockService.
 *
 * O PDF continua sendo montado no celular (jsPDF + ew-form.js) e chega aqui
 * em base64; o servidor só confere se é PDF mesmo e grava.
 *
 * Arquivos (pastas criadas sozinhas pelo Dropbox no 1º upload):
 *   <EHS_PASTA>/<CLIENTE>/<PARQUE>/W<semana>/<DD-MM-AAAA>/
 *       <PARQUE> <DD-MM-AAAA>.pdf
 *       FOTO DA EQUIPE EM DDS 1.jpg, FOTO DA EQUIPE EM DDS 2.jpg,
 *       REGISTRO DO LOTO - GROUND.jpg ...            (fotos selecionadas)
 *   ex.: .../SIEMENS/GAMELEIRA 1/W41/08-10-2026/GAMELEIRA 1 08-10-2026.pdf
 *   Semana = semana ISO (segunda a domingo) da DATA do report.
 *   out/2026: entrou a pasta do dia. Reports antigos continuam direto na
 *   pasta da semana; não são movidos.
 *
 * FOTOS — o celular manda, além do PDF:
 *   dados.fotos = [{ rotulo: 'FOTO DA EQUIPE EM DDS', dados: 'data:image/jpeg;base64,...' }, ...]
 *   Só os rótulos de EHS_FOTOS_PASTA são gravados (o resto é ignorado), com
 *   o nome de arquivo definido lá.
 *   Um rótulo com 1 foto vira "<RÓTULO>.jpg"; com mais de uma, "<RÓTULO> 1.jpg",
 *   "<RÓTULO> 2.jpg"... Foto que falhar no upload NÃO derruba o report: o PDF
 *   (que já tem todas as fotos) é o documento oficial; a resposta traz
 *   fotosFalharam para o app avisar.
 *   Reenvio do mesmo dia: arquivos da pasta do dia que não vieram no novo
 *   envio são apagados (ex.: antes 2 fotos do BULLON, agora 1).
 *
 * Planilha: a MESMA do RDO (Propriedade SHEET_ID), aba "Reports EHS".
 *   Colunas fixas: Protocolo | Recebido_em | Matricula_login | Data |
 *                  Cliente | Parque | Supervisor | Link_PDF | Caminho_PDF
 *   Depois, uma coluna por pergunta do formulário (rótulo).
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
var EHS_FOTO_MAX_BYTES = 10 * 1024 * 1024;
var EHS_FOTOS_MAX = 20;
var EHS_PFX = 'EHS1_';

/* Fotos que vão soltas para a pasta do dia.
   chave = rótulo do CAMPO DE FOTO no formulário (SCHEMA do ehs/report-diario)
   valor = nome do arquivo na pasta (sem número e sem extensão)
   A comparação com o rótulo que vem do app ignora acento/maiúscula/espaço.
   A PET é o caso diferente: "PERMISSÃO DE TRABALHO EM ESPAÇO CONFINADO PET" é a
   pergunta Sim/Não; as fotos ficam no campo "FOTO DA PET - ...".
   Para acrescentar uma foto: uma linha aqui E o rótulo em FOTOS_PASTA, no
   ehs/report-diario/index.html (é ele que decide o que sobe). */
var EHS_FOTOS_PASTA = {
  'FOTO DA EQUIPE EM DDS':                          'FOTO DA EQUIPE EM DDS',
  'SINALIZAÇÃO DE SEGURANÇA EXTERNO EM CAMPO':      'SINALIZAÇÃO DE SEGURANÇA EXTERNO EM CAMPO',
  'REGISTRO DO LOTO - GROUND':                      'REGISTRO DO LOTO - GROUND',
  'REGISTRO DO LOTO - ROTOR HUB':                   'REGISTRO DO LOTO - ROTOR HUB',
  'REGISTRO DO LOTO - BULLON':                      'REGISTRO DO LOTO - BULLON',
  'PERMISSÃO DE TRABALHO EM ALTURA (PTA)':          'PERMISSÃO DE TRABALHO EM ALTURA (PTA)',
  'FOTO DA PET - PERMISSÃO DE ENTRADA DE TRABALHO': 'PERMISSÃO DE TRABALHO EM ESPAÇO CONFINADO PET'
};

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

/** 'aaaa-mm-dd' -> 'DD-MM-AAAA' */
function ehsDdMmAaaa(dataIso) {
  var p = String(dataIso || '').split('-');
  return (p[2] || '') + '-' + (p[1] || '') + '-' + (p[0] || '');
}

/** <pasta>/<CLIENTE>/<PARQUE>/W<nn>/<DD-MM-AAAA>  (sem barra no fim) */
function ehsPastaDia(pasta, cliente, parque, dataIso) {
  return pasta + '/' + ehsNomeArq(cliente) + '/' + ehsNomeArq(parque) + '/' +
         ehsSemana(dataIso) + '/' + ehsDdMmAaaa(dataIso);
}

/** <pasta do dia>/<PARQUE> <DD-MM-AAAA>.pdf */
function ehsCaminho(pasta, cliente, parque, dataIso) {
  return ehsPastaDia(pasta, cliente, parque, dataIso) + '/' +
         ehsNomeArq(parque) + ' ' + ehsDdMmAaaa(dataIso) + '.pdf';
}

/** Pasta-mãe de um caminho; '' se não houver. */
function ehsDirDe(caminho) {
  var i = String(caminho || '').lastIndexOf('/');
  return i > 0 ? String(caminho).slice(0, i) : '';
}

/* ---------- fotos ---------- */

/**
 * dados.fotos -> [{ nome:'REGISTRO DO LOTO - GROUND.jpg', bytes }]
 * Filtra pelos rótulos de EHS_FOTOS_PASTA, valida JPEG/PNG e numera quando
 * o mesmo rótulo tem mais de uma foto. Foto inválida é só descartada.
 */
function ehsPrepararFotos(fotos) {
  var oficial = {};
  Object.keys(EHS_FOTOS_PASTA).forEach(function (r) { oficial[chaveNome(r)] = EHS_FOTOS_PASTA[r]; });

  var porRotulo = {}, ordem = [];
  (Array.isArray(fotos) ? fotos : []).slice(0, EHS_FOTOS_MAX * 2).forEach(function (f) {
    if (!f) return;
    var rot = oficial[chaveNome(f.rotulo)];
    if (!rot) return;
    var bytes;
    try { bytes = Utilities.base64Decode(String(f.dados || '').replace(/^data:[^,]*,/, '')); }
    catch (e) { return; }
    if (!bytes || bytes.length < 4 || bytes.length > EHS_FOTO_MAX_BYTES) return;
    var b0 = bytes[0] & 255, b1 = bytes[1] & 255;
    var ext = (b0 === 0xFF && b1 === 0xD8) ? 'jpg' : (b0 === 0x89 && b1 === 0x50) ? 'png' : '';
    if (!ext) return;
    if (!porRotulo[rot]) { porRotulo[rot] = []; ordem.push(rot); }
    porRotulo[rot].push({ bytes: bytes, ext: ext });
  });

  var out = [];
  ordem.forEach(function (rot) {
    var lista = porRotulo[rot];
    lista.forEach(function (f, i) {
      var nome = ehsNomeArq(rot) + (lista.length > 1 ? ' ' + (i + 1) : '') + '.' + f.ext;
      out.push({ nome: nome, bytes: f.bytes });
    });
  });
  return out.slice(0, EHS_FOTOS_MAX);
}

/** Sobe várias fotos em paralelo (fetchAll). -> { ok:[caminho], falhou:[nome] } */
function ehsUploadFotos(token, props, pastaDia, fotos) {
  var res = { ok: [], falhou: [] };
  if (!fotos.length) return res;
  var reqs = fotos.map(function (f) {
    var h = ehsDbxHeaders(token, props);
    h['Dropbox-API-Arg'] = escaparArg({ path: pastaDia + '/' + f.nome, mode: 'overwrite', autorename: false, mute: true });
    return {
      url: 'https://content.dropboxapi.com/2/files/upload', method: 'post',
      contentType: 'application/octet-stream', headers: h, payload: f.bytes, muteHttpExceptions: true
    };
  });
  var resps;
  try { resps = UrlFetchApp.fetchAll(reqs); }
  catch (e) { fotos.forEach(function (f) { res.falhou.push(f.nome); }); return res; }
  resps.forEach(function (r, i) {
    if (r.getResponseCode() < 300) {
      try { res.ok.push(JSON.parse(r.getContentText()).path_display || (pastaDia + '/' + fotos[i].nome)); }
      catch (e) { res.ok.push(pastaDia + '/' + fotos[i].nome); }
    } else {
      res.falhou.push(fotos[i].nome);
    }
  });
  return res;
}

/** Apaga da pasta do dia o que não está em 'manter' (caminhos). Nunca lança. */
function ehsLimparPastaDia(token, props, pastaDia, manter) {
  try {
    var fica = {};
    manter.forEach(function (c) { fica[String(c).toLowerCase()] = 1; });
    var r = UrlFetchApp.fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'post', contentType: 'application/json', headers: ehsDbxHeaders(token, props),
      payload: JSON.stringify({ path: pastaDia, recursive: false }), muteHttpExceptions: true
    });
    if (r.getResponseCode() >= 300) return;
    (JSON.parse(r.getContentText()).entries || []).forEach(function (e) {
      if (e['.tag'] !== 'file') return;
      if (!fica[String(e.path_display || e.path_lower).toLowerCase()]) ehsApagar(token, props, e.path_display);
    });
  } catch (e) { /* limpeza é bônus: nunca derruba o envio */ }
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

/** Apaga um arquivo OU pasta do Dropbox na raiz do time. Nunca lança. */
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
 *           campos:[{rotulo, valor}], pdf:<base64>, idEnvio,
 *           fotos:[{rotulo, dados:<base64 ou dataURL>}] }   (fotos é opcional)
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

  /* fotos decodificadas FORA da trava: base64 de vários MB é lento */
  var fotos = ehsPrepararFotos(dados.fotos);
  dados.fotos = null; dados.pdf = null;   /* libera memória antes do upload */

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
    var pastaDia = ehsPastaDia(ehsPasta(props), cliente, parque, dataIso);
    var caminho = ehsCaminho(ehsPasta(props), cliente, parque, dataIso);
    var real = ehsUpload(token, props, caminho, bytes);
    var link = ehsLink(token, props, real);

    /* fotos: falha aqui não derruba o report — o PDF já tem todas */
    var up = ehsUploadFotos(token, props, ehsDirDe(real) || pastaDia, fotos);

    /* reenvio do mesmo dia: tira da pasta do dia o que não veio agora */
    if (antes.length) ehsLimparPastaDia(token, props, ehsDirDe(real) || pastaDia, [real].concat(up.ok));

    /* PDF antigo com outro caminho (parque trocado no report refeito, ou report
       antigo ainda no formato sem pasta do dia). Não apaga arquivo que outra
       linha ainda usa. Se o antigo estava numa pasta de dia (DD-MM-AAAA) que
       não é a nova, a pasta inteira sai junto, com as fotos. */
    var emUso = {}, pastasEmUso = {};
    if (sh.getLastRow() >= 2) {
      var linhasAntes = {};
      antes.forEach(function (a) { linhasAntes[a.linha] = 1; });
      sh.getRange(2, idx.Caminho_PDF + 1, sh.getLastRow() - 1, 1).getValues().forEach(function (l, k) {
        if (!linhasAntes[k + 2] && l[0]) {
          emUso[String(l[0]).toLowerCase()] = 1;
          pastasEmUso[ehsDirDe(String(l[0])).toLowerCase()] = 1;
        }
      });
    }
    var dirNovo = ehsDirDe(real).toLowerCase();
    antes.forEach(function (a) {
      var c = String(a.caminho || '').toLowerCase();
      if (!c || c === real.toLowerCase() || emUso[c]) return;
      var dir = ehsDirDe(a.caminho);
      var ehPastaDia = /\/\d{2}-\d{2}-\d{4}$/.test(dir);
      if (ehPastaDia && dir.toLowerCase() !== dirNovo && !pastasEmUso[dir.toLowerCase()]) {
        ehsApagar(token, props, dir);
      } else {
        ehsApagar(token, props, a.caminho);
      }
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

    resp = { ok: true, id: id, link: link, substituiu: antes.length > 0, caminho: real,
             fotos: up.ok.length, fotosFalharam: up.falhou };
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
  Logger.log('Fotos que vão para a pasta do dia:\n  ' + Object.keys(EHS_FOTOS_PASTA).map(function (k) {
    return k + '  ->  ' + EHS_FOTOS_PASTA[k] + '.jpg';
  }).join('\n  '));
  var token = getDropboxToken(props);
  var r = UrlFetchApp.fetch('https://api.dropboxapi.com/2/files/get_metadata', {
    method: 'post', contentType: 'application/json', headers: ehsDbxHeaders(token, props),
    payload: JSON.stringify({ path: pasta }), muteHttpExceptions: true
  });
  Logger.log('Dropbox enxerga a pasta? ' + (r.getResponseCode() === 200 ? 'SIM'
    : 'NÃO (' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200) + ')'
      + ' — se a pasta é do time, rode testarEquipamentos() uma vez para o script aprender a raiz.'));
}
