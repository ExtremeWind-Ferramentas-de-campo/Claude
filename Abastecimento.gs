/**
 * ABASTECIMENTO — arquivo separado do MESMO projeto do Apps Script do RDO.
 *
 * Não funciona sozinho em outro projeto: usa funções do Code.gs
 * (getDropboxToken, validarToken, cpTecnicoDaSessao, eqDbx*, eqPutAll,
 * eqNorm, escaparArg, gerarId...). No Apps Script todos os arquivos .gs de um
 * projeto enxergam as funções uns dos outros, então basta os dois existirem.
 *
 * As rotas continuam no doPost/doGet do Code.gs (só pode existir UM doPost
 * e UM doGet por projeto):
 *   acao 'frotaPorPlaca'  -> frotaPorPlaca(dados)
 *   acao 'abastecimento'  -> registrarAbastecimento(dados)
 */

/* =====================================================================
 * CHECKLIST FROTAS — ABASTECIMENTO (set/2026)
 * ---------------------------------------------------------------------
 * Tela: Checklist Frotas/abastecimento.html. Duas ações novas:
 *
 *   frotaPorPlaca   o técnico digita a placa; devolve Condutor, Parque,
 *                   Frota, Cartão e Senha lidos da planilha da frota.
 *   abastecimento   recebe o registro (PDF + 4 fotos já prontos no celular),
 *                   grava no Dropbox e na planilha de controle.
 *
 * Quem manda é o servidor, não o celular:
 *   - nome e matrícula saem do token do login (não do que o celular manda);
 *   - a coluna "Data abastecimento" = data do registro; o técnico não digita;
 *   - Condutor/Parque/Frota/Cartão são RELIDOS aqui pela placa na hora de
 *     gravar. O que veio do celular só serviu para mostrar na tela.
 *
 * Planilha da frota (só LEITURA, igual Meus Equipamentos):
 *   arquivo .xlsx no Dropbox, aba ACOMPANHAMENTO, colunas fixas:
 *   D placa · T frota · U parque · V condutor · X cartão · Y senha.
 *   Placa repetida na aba: vale a linha MAIS DE BAIXO.
 *   Placa antiga (ABC1234) e Mercosul (ABC1C34) casam entre si.
 *   Sincronização por gatilho de 10 min (abGatilho) + na hora, se a placa
 *   digitada não for achada e a planilha tiver mudado.
 *
 * Arquivos no Dropbox:
 *   <ABAST_PASTA>/W<nn>/<DD-MM-AAAA>/<PARQUE>/
 *       Abastecimento - <condutor> - <parque> - <data>.pdf
 *       Foto - antes|bomba|depois|nota - <condutor> - <parque> - <data>.jpg
 *   W<nn> e <DD-MM-AAAA> = data do REGISTRO (fixada no celular quando o
 *   técnico começa a preencher, na bomba) — não a data em que o envio chegou.
 *   Dois abastecimentos com o mesmo condutor/parque/data: o 2º ganha " (2)".
 *
 * Registro:
 *   1) aba "Abastecimentos" da planilha Google (ABAST_SHEET_ID, ou a SHEET_ID
 *      do RDO) — é a fonte da verdade;
 *   2) espelho "CONTROLE DE COMBUSTÍVEL.xlsx" na pasta base do Dropbox,
 *      regerado a cada envio. O app SÓ sobrescreve a versão que ele mesmo
 *      gravou: se alguém editar o arquivo no Excel, o app para de mexer nele
 *      (não apaga trabalho de ninguém) e marca pendente. Para voltar a
 *      atualizar: renomeie o arquivo editado e rode abAtualizarXlsx().
 *
 * A SENHA do cartão aparece só na tela do técnico. Não vai para PDF, Sheets
 * nem xlsx (AB_SENHA_NO_REGISTRO). O PDF sai por WhatsApp.
 *
 * Propriedades do Script (todas opcionais):
 *   ABAST_FROTA_ARQUIVO   caminho ou id do .xlsx da frota
 *   ABAST_FROTA_ABA       padrão "ACOMPANHAMENTO"
 *   ABAST_PASTA           pasta base no Dropbox
 *   ABAST_SHEET_ID        planilha Google do registro (padrão: SHEET_ID)
 *
 * Rodar à mão no editor:
 *   testarAbastecimento()          lê a frota e mostra o diagnóstico
 *   testarPlaca()                  simula a busca de uma placa
 *   instalarGatilhoAbastecimento() cria o gatilho de 10 min (1 vez só)
 *   abAtualizarXlsx()              regera o CONTROLE DE COMBUSTÍVEL.xlsx
 * ===================================================================== */

var AB_FROTA_ARQUIVO_PADRAO = '/02 - EXTREME WIND/17 - SITE E APP (DASHBOARDS)/Checklist (Sr. Fernando)/' +
                              'Controle de Frota - TESTE DE FORMULAÇÃO (BACK UP) - ATUAL.xlsb.xlsx';
var AB_FROTA_ABA_PADRAO = 'ACOMPANHAMENTO';
var AB_COLS = { placa: 'D', frota: 'T', parque: 'U', condutor: 'V', cartao: 'X', senha: 'Y' };
/* campos da planilha sem os quais o registro não é aceito */
var AB_OBRIG_PLANILHA = ['condutor', 'parque', 'frota', 'cartao', 'senha'];
var AB_PASTA_PADRAO = '/02 - EXTREME WIND/13 - LOGISTICA/CONTROLE DE COMBUSTÍVEL- EXTREME WIND';
var AB_XLSX_NOME = 'CONTROLE DE COMBUSTÍVEL.xlsx';
var AB_ABA_REGISTRO = 'Abastecimentos';
var AB_SENHA_NO_REGISTRO = false;
var AB_PFX = 'AB1_';
var AB_TRAVA_SEG = 240;
var AB_FOTOS = [
  { k: 'antes', rot: 'antes' }, { k: 'bomba', rot: 'bomba' },
  { k: 'depois', rot: 'depois' }, { k: 'nota', rot: 'nota' }
];
var AB_FOTO_MAX_BYTES = 4 * 1024 * 1024;
var AB_PDF_MAX_BYTES = 15 * 1024 * 1024;
var AB_CAB = ['Protocolo', 'Registro (celular)', 'Recebido (servidor)', 'Data abastecimento', 'Semana',
              'Matrícula', 'Técnico', 'Placa', 'Condutor', 'Parque', 'Frota', 'Cartão', 'KM',
              'Observação', 'Pasta Dropbox', 'PDF'];

/* ---------- placa ---------- */

function abPlaca(v) { return String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/* Chave de busca: formato antigo vira Mercosul (5º caractere 0-9 -> A-J),
   então ABC1234 e ABC1C34 são a mesma chave. '' = placa inválida. */
function abChavePlaca(v) {
  var p = abPlaca(v);
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p)) return '';
  var c = p.charAt(4);
  if (c >= '0' && c <= '9') p = p.slice(0, 4) + 'ABCDEFGHIJ'.charAt(Number(c)) + p.slice(5);
  return p;
}

function abSemanaIso(ano, mes, dia) {
  var d = new Date(Date.UTC(ano, mes - 1, dia));
  var dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  var ini = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - ini) / 86400000 + 1) / 7);
}

function abP2(n) { return ('0' + n).slice(-2); }

/* Texto seguro para nome de pasta/arquivo no Dropbox */
function abNomeArq(t) {
  return String(t == null ? '' : t)
    .replace(/[\u0000-\u001f\\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ').trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80) || 'SEM NOME';
}

/* Número do Excel vira texto sem notação científica (cartão, frota, senha) */
function abTxt(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v);
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO';
  return String(v).trim();
}

/* ---------- leitura da planilha da frota (parte pura: testável fora do Apps Script) ---------- */

function abArquivoDaAba(wbXml, relsXml, nomeAba) {
  var alvo = eqNorm(nomeAba), rid = null, m;
  var reSheet = /<sheet\b([^>]*)\/?>/g;
  while ((m = reSheet.exec(wbXml))) {
    var nm = /\bname="([^"]*)"/.exec(m[1]), id = /\br:id="([^"]*)"/.exec(m[1]);
    if (nm && id && eqNorm(eqXmlTexto(nm[1])) === alvo) { rid = id[1]; break; }
  }
  if (!rid) throw new Error('Aba "' + nomeAba + '" não encontrada na planilha da frota.');
  var reRel = /<Relationship\b([^>]*)\/?>/g;
  while ((m = reRel.exec(relsXml))) {
    var i2 = /\bId="([^"]*)"/.exec(m[1]), t2 = /\bTarget="([^"]*)"/.exec(m[1]);
    if (i2 && i2[1] === rid && t2) {
      var t = t2[1];
      return t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    }
  }
  throw new Error('Arquivo da aba "' + nomeAba + '" não encontrado.');
}

function abLerFrotaXml(wbXml, relsXml, ssXml, lerArquivo, nomeAba) {
  var arq = abArquivoDaAba(wbXml, relsXml, nomeAba), m;
  var ss = [], reSi = /<si>([\s\S]*?)<\/si>/g;
  while ((m = reSi.exec(ssXml || ''))) ss.push(eqJuntarT(m[1]));
  var xml = lerArquivo(arq);
  if (!xml) throw new Error('Não consegui abrir ' + arq + '.');

  var campoDaCol = {};
  Object.keys(AB_COLS).forEach(function (k) { campoDaCol[AB_COLS[k]] = k; });

  var idx = {}, comPlaca = 0, repetidas = 0, invalidas = [], atual = 0, reg = {};

  function fechar() {
    if (!atual || reg.placa === undefined || reg.placa === null || reg.placa === '') return;
    var bruto = abTxt(reg.placa);
    comPlaca++;
    var ch = abChavePlaca(bruto);
    if (!ch) {
      if (eqNorm(bruto) !== 'PLACA' && invalidas.length < 40) invalidas.push({ linha: atual, placa: bruto });
      return;
    }
    if (idx[ch]) repetidas++;
    idx[ch] = {
      linha: atual, placa: abPlaca(bruto),
      condutor: abTxt(reg.condutor), parque: abTxt(reg.parque), frota: abTxt(reg.frota),
      cartao: abTxt(reg.cartao), senha: abTxt(reg.senha)
    };
  }

  var reC = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  while ((m = reC.exec(xml))) {
    var ref = /\br="([A-Z]+)(\d+)"/.exec(m[1]);
    if (!ref) continue;
    var ln = Number(ref[2]);
    if (ln !== atual) { fechar(); atual = ln; reg = {}; }
    var campo = campoDaCol[ref[1]];
    if (!campo || !m[2]) continue;
    var tipo = /\bt="([^"]*)"/.exec(m[1]);
    tipo = tipo ? tipo[1] : 'n';
    var v = null;
    if (tipo === 'inlineStr') v = eqJuntarT(m[2]);
    else {
      var vv = /<v>([\s\S]*?)<\/v>/.exec(m[2]);
      if (vv) {
        if (tipo === 's') v = ss[Number(vv[1])];
        else if (tipo === 'str') v = eqXmlTexto(vv[1]);
        else if (tipo === 'e') v = null;
        else if (tipo === 'b') v = vv[1] === '1';
        else v = Number(vv[1]);
      }
    }
    if (typeof v === 'string') v = v.trim();
    reg[campo] = v;
  }
  fechar();

  return { aba: arq, idx: idx, comPlaca: comPlaca, placas: Object.keys(idx).length,
           repetidas: repetidas, invalidas: invalidas };
}

/* ---------- sincronização (cache) ---------- */

function abSincronizar(forcar) {
  var cache = CacheService.getScriptCache();
  var props = PropertiesService.getScriptProperties();
  if (cache.get(AB_PFX + 'SYNC')) return { ok: false, ocupado: true };
  cache.put(AB_PFX + 'SYNC', '1', AB_TRAVA_SEG);
  try {
    var token = getDropboxToken(props);
    var arquivo = props.getProperty('ABAST_FROTA_ARQUIVO') || AB_FROTA_ARQUIVO_PADRAO;
    var meta;
    try { meta = eqDbxMetadata(token, arquivo, props); }
    catch (eM) { throw new Error('Planilha da frota não encontrada no Dropbox (' + arquivo + '). ' + eM); }

    var genAtual = cache.get(AB_PFX + 'GEN');
    if (!forcar && genAtual && cache.get(AB_PFX + 'REV') === meta.rev) return { ok: true, mudou: false };

    var blob = eqDbxBaixar(token, arquivo, props);
    var arqs = {};
    Utilities.unzip(blob.setContentType('application/zip')).forEach(function (b) { arqs[b.getName()] = b; });
    var txt = function (n) { return arqs[n] ? arqs[n].getDataAsString('UTF-8') : ''; };
    if (!txt('xl/workbook.xml')) {
      throw new Error('O arquivo da frota não é um .xlsx legível (' + meta.name + '). ' +
                      'Se for .xlsb, salve como .xlsx.');
    }
    var lido = abLerFrotaXml(txt('xl/workbook.xml'), txt('xl/_rels/workbook.xml.rels'),
                             txt('xl/sharedStrings.xml'), txt,
                             props.getProperty('ABAST_FROTA_ABA') || AB_FROTA_ABA_PADRAO);

    var gen = Utilities.getUuid().slice(0, 8), lote = {};
    Object.keys(lido.idx).forEach(function (ch) { lote[AB_PFX + gen + '_P' + ch] = JSON.stringify(lido.idx[ch]); });
    lote[AB_PFX + gen + '_META'] = JSON.stringify({
      arquivo: meta.name, atualizadoEm: eqFmtDataHora(meta.server_modified),
      lidoEm: eqFmtDataHora(new Date().toISOString())
    });
    eqPutAll(cache, lote);
    cache.putAll(eqObj(AB_PFX + 'GEN', gen, AB_PFX + 'REV', meta.rev), EQ_CACHE_SEG);

    return { ok: true, mudou: true, arquivo: meta.name, aba: lido.aba, linhasComPlaca: lido.comPlaca,
             placas: lido.placas, repetidas: lido.repetidas, invalidas: lido.invalidas };
  } finally {
    cache.remove(AB_PFX + 'SYNC');
  }
}

function abBuscarPlaca(chave, podeSincronizar) {
  var cache = CacheService.getScriptCache();
  var gen = cache.get(AB_PFX + 'GEN');
  if (!gen) {
    var r = abSincronizar(false);
    if (r.ocupado) return { ocupado: true };
    gen = cache.get(AB_PFX + 'GEN');
    if (!gen) return { erro: 'Não foi possível ler a planilha da frota agora.' };
  }
  var reg = null;
  try { reg = JSON.parse(cache.get(AB_PFX + gen + '_P' + chave) || 'null'); } catch (e) {}

  /* não achou: a placa pode ter acabado de entrar na planilha. Confere a
     revisão do arquivo (no máximo 1 vez a cada 90 s) e relê só se mudou. */
  if (!reg && podeSincronizar && !cache.get(AB_PFX + 'CHK')) {
    cache.put(AB_PFX + 'CHK', '1', 90);
    try {
      var r2 = abSincronizar(false);
      if (r2.mudou) {
        gen = cache.get(AB_PFX + 'GEN');
        reg = JSON.parse(cache.get(AB_PFX + gen + '_P' + chave) || 'null');
      }
    } catch (e2) { Logger.log('abBuscarPlaca: ' + e2); }
  }
  var meta = {};
  try { meta = JSON.parse(cache.get(AB_PFX + gen + '_META') || '{}'); } catch (e3) {}
  return { reg: reg, meta: meta };
}

function abFaltando(reg) {
  var rot = { condutor: 'condutor', parque: 'parque', frota: 'frota', cartao: 'cartão', senha: 'senha' };
  return AB_OBRIG_PLANILHA.filter(function (k) { return !reg[k]; }).map(function (k) { return rot[k]; });
}

/* ---------- ação: frotaPorPlaca ---------- */

function frotaPorPlaca(dados) {
  var sess = validarToken(dados && dados.token);
  if (!sess.ok) {
    return { ok: false, sessao: false,
             erro: sess.expirado ? 'Sessão expirada. Faça login novamente.' : 'Sessão inválida. Faça login novamente.' };
  }
  var chave = abChavePlaca(dados.placa);
  if (!chave) return { ok: false, erro: 'Placa fora do formato. Use ABC1D23 (Mercosul) ou ABC1234.' };

  var b = abBuscarPlaca(chave, true);
  if (b.ocupado) return { ok: false, retentar: true, erro: 'A planilha da frota está sendo atualizada. Tente de novo em 1 minuto.' };
  if (b.erro) return { ok: false, erro: b.erro };
  if (!b.reg) return { ok: true, encontrado: false, atualizadoEm: b.meta.atualizadoEm || '' };

  var r = b.reg;
  return {
    ok: true, encontrado: true,
    placa: r.placa, condutor: r.condutor, parque: r.parque, frota: r.frota,
    cartao: r.cartao, senha: r.senha,
    faltando: abFaltando(r),
    atualizadoEm: b.meta.atualizadoEm || ''
  };
}

/* ---------- Dropbox (upload / listagem com a mesma raiz do Meus Equipamentos) ---------- */

function abDbxHeaders(token, props) {
  var h = { 'Authorization': 'Bearer ' + token };
  if ((props.getProperty('EQUIP_PATH_ROOT') || '') === 'ROOT') {
    var cache = CacheService.getScriptCache();
    var ns = cache.get(AB_PFX + 'ROOTNS');
    if (!ns) { ns = eqDbxRootNs(token); if (ns) cache.put(AB_PFX + 'ROOTNS', String(ns), 21600); }
    if (ns) h['Dropbox-API-Path-Root'] = JSON.stringify({ '.tag': 'root', 'root': String(ns) });
  }
  return h;
}

function abReqUpload(token, props, path, bytes, modo) {
  var h = abDbxHeaders(token, props);
  h['Dropbox-API-Arg'] = escaparArg({ path: path, mode: modo || 'overwrite', autorename: false, mute: true });
  return { url: 'https://content.dropboxapi.com/2/files/upload', method: 'post',
           contentType: 'application/octet-stream', headers: h, payload: bytes, muteHttpExceptions: true };
}

/* nomes (minúsculos) já existentes na pasta; pasta inexistente = {} */
function abNomesNaPasta(token, props, pasta) {
  var out = {};
  var h = abDbxHeaders(token, props);
  var r = UrlFetchApp.fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'post', contentType: 'application/json', headers: h, muteHttpExceptions: true,
    payload: JSON.stringify({ path: pasta, recursive: false, limit: 2000 })
  });
  if (r.getResponseCode() === 409) return out;
  if (r.getResponseCode() !== 200) throw new Error('Dropbox list_folder ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
  var j = JSON.parse(r.getContentText());
  (j.entries || []).forEach(function (e) { out[String(e.name).toLowerCase()] = 1; });
  return out;
}

function abMontarNomes(condutor, parque, dataTxt, n) {
  var suf = n > 1 ? ' (' + n + ')' : '';
  var miolo = ' - ' + abNomeArq(condutor) + ' - ' + abNomeArq(parque) + ' - ' + dataTxt + suf;
  var fotos = {};
  AB_FOTOS.forEach(function (f) { fotos[f.k] = 'Foto - ' + f.rot + miolo + '.jpg'; });
  return { pdf: 'Abastecimento' + miolo + '.pdf', fotos: fotos };
}

function abDecodificar(b64, rotulo, tipo, maxBytes) {
  if (!b64 || typeof b64 !== 'string') throw new Error('Falta ' + rotulo + '.');
  var bytes;
  try { bytes = Utilities.base64Decode(b64.replace(/^data:[^,]*,/, '')); }
  catch (e) { throw new Error(rotulo + ' chegou corrompido.'); }
  if (bytes.length > maxBytes) throw new Error(rotulo + ' é grande demais.');
  var b0 = bytes[0] & 255, b1 = bytes[1] & 255, b2 = bytes[2] & 255, b3 = bytes[3] & 255;
  if (tipo === 'jpg' && !(b0 === 0xFF && b1 === 0xD8)) throw new Error(rotulo + ' não é uma foto JPEG.');
  if (tipo === 'pdf' && !(b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46)) throw new Error('O PDF chegou inválido.');
  return bytes;
}

/* "2026-09-28T14:32:10" (hora do celular, sem fuso) -> Date no fuso do script */
function abDataLocal(txt) {
  var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(txt || ''));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
}

/* Texto que o Sheets converteria em número (cartão de 16 dígitos perde precisão) */
function abComoTexto(v) {
  v = String(v == null ? '' : v);
  return /^[0-9.,+\-eE ]+$/.test(v) && v !== '' ? "'" + v : v;
}

/* ---------- ação: abastecimento ---------- */

function registrarAbastecimento(dados) {
  var s = cpTecnicoDaSessao(dados);
  if (s.erro) return s.erro;
  var cache = CacheService.getScriptCache();
  var props = PropertiesService.getScriptProperties();
  function falha(msg) { return { ok: false, erro: msg }; }

  /* o mesmo envio chegando 2x (sem resposta no 4G, técnico reenviou):
     devolve o resultado do 1º em vez de gravar outra linha */
  var idEnvio = String(dados.idEnvio || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  if (idEnvio.length < 8) return falha('Envio sem identificador. Atualize a página e tente de novo.');
  var jaFoi = cache.get(AB_PFX + 'OK_' + idEnvio);
  if (jaFoi) { var r0 = JSON.parse(jaFoi); r0.repetido = true; return r0; }

  /* ---- validação ----
     Não existe mais "data do abastecimento" digitada: é a data do REGISTRO,
     que o celular fixa no início do preenchimento (na bomba). O envio pode
     chegar horas ou dias depois, quando o técnico tiver sinal — por isso a
     hora de chegada vai numa coluna à parte ("Recebido (servidor)"). */
  var registro = abDataLocal(dados.registro);
  if (!registro) return falha('Data e hora do registro não vieram do celular.');
  var amanha = new Date(); amanha.setHours(0, 0, 0, 0); amanha.setDate(amanha.getDate() + 1);
  if (registro >= amanha) return falha('A data do registro está no futuro. Confira a data e a hora do celular.');
  var ano = registro.getFullYear(), mes = registro.getMonth() + 1, dia = registro.getDate();
  var dAb = new Date(ano, mes - 1, dia);

  var km = Number(String(dados.km == null ? '' : dados.km).replace(/\D/g, ''));
  if (!km || km > 9999999) return falha('KM inválido.');

  var obs = String(dados.obs || '').trim().slice(0, 1500);

  var chave = abChavePlaca(dados.placa);
  if (!chave) return falha('Placa fora do formato.');
  var b = abBuscarPlaca(chave, true);
  if (b.ocupado) return { ok: false, retentar: true, erro: 'A planilha da frota está sendo atualizada. Tente de novo em 1 minuto.' };
  if (b.erro) return falha(b.erro);
  if (!b.reg) return falha('A placa ' + abPlaca(dados.placa) + ' não está na planilha da frota.');
  var f = b.reg;
  var falta = abFaltando(f);
  if (falta.length) return falha('A planilha da frota está sem ' + falta.join(', ') + ' para esta placa. Avise a logística.');

  var fotos = {}, pdf;
  try {
    AB_FOTOS.forEach(function (ft) {
      fotos[ft.k] = abDecodificar(dados.fotos && dados.fotos[ft.k], 'A foto "' + ft.rot + '"', 'jpg', AB_FOTO_MAX_BYTES);
    });
    pdf = abDecodificar(dados.pdf, 'O PDF', 'pdf', AB_PDF_MAX_BYTES);
  } catch (eV) { return falha(eV.message); }

  /* ---- caminho no Dropbox ---- */
  var semana = 'W' + abP2(abSemanaIso(ano, mes, dia));
  var dataTxt = abP2(dia) + '-' + abP2(mes) + '-' + ano;
  var base = (props.getProperty('ABAST_PASTA') || AB_PASTA_PADRAO).replace(/\\/g, '/').replace(/\/+$/, '');
  if (base.charAt(0) !== '/' && base.indexOf('id:') !== 0 && base.indexOf('ns:') !== 0) base = '/' + base;
  var pasta = base + '/' + semana + '/' + dataTxt + '/' + abNomeArq(f.parque);

  var token = getDropboxToken(props);
  /* confere a pasta base ANTES de subir: com a raiz errada o upload criaria
     "02 - EXTREME WIND" dentro da pasta pessoal da conta, sem erro nenhum */
  try { eqDbxMetadata(token, base, props); }
  catch (eB) { return falha('Pasta do controle de combustível não encontrada no Dropbox: ' + base); }

  /* nomes decididos 1 vez por envio: um reenvio sobrescreve os mesmos arquivos
     em vez de criar " (2)" */
  var nomes = null;
  try { nomes = JSON.parse(cache.get(AB_PFX + 'NM_' + idEnvio) || 'null'); } catch (eN) {}
  if (!nomes || nomes.pasta !== pasta) {
    var existentes = abNomesNaPasta(token, props, pasta), n = 1, cand;
    for (; n < 100; n++) {
      cand = abMontarNomes(f.condutor, f.parque, dataTxt, n);
      var todos = [cand.pdf].concat(AB_FOTOS.map(function (x) { return cand.fotos[x.k]; }));
      if (!todos.some(function (t) { return existentes[t.toLowerCase()]; })) break;
    }
    nomes = { pasta: pasta, pdf: cand.pdf, fotos: cand.fotos };
    cache.put(AB_PFX + 'NM_' + idEnvio, JSON.stringify(nomes), 21600);
  }

  /* ---- upload: PDF primeiro (cria as pastas), depois as 4 fotos em paralelo ---- */
  var qPdf = abReqUpload(token, props, pasta + '/' + nomes.pdf, pdf);
  var rPdf = UrlFetchApp.fetch(qPdf.url, qPdf);
  if (rPdf.getResponseCode() >= 300) {
    return falha('O Dropbox recusou o PDF (' + rPdf.getResponseCode() + '): ' + rPdf.getContentText().slice(0, 200));
  }
  var pend = AB_FOTOS.map(function (ft) { return ft; });
  for (var volta = 0; volta < 3 && pend.length; volta++) {
    if (volta) Utilities.sleep(1500 * volta);
    var resp = UrlFetchApp.fetchAll(pend.map(function (ft) {
      return abReqUpload(token, props, pasta + '/' + nomes.fotos[ft.k], fotos[ft.k]);
    }));
    var ainda = [], ultimoErro = '';
    resp.forEach(function (r, i) {
      if (r.getResponseCode() >= 300) { ainda.push(pend[i]); ultimoErro = r.getResponseCode() + ': ' + r.getContentText().slice(0, 160); }
    });
    pend = ainda;
  }
  if (pend.length) {
    return falha('O Dropbox não gravou ' + pend.length + ' foto(s) (' + ultimoErro + '). Tente enviar de novo — ' +
                 'os arquivos que já subiram serão substituídos, não duplicados.');
  }

  /* ---- planilha ---- */
  var protocolo = 'AB-' + gerarId() + '-' + s.mat;
  var linha = [
    protocolo, registro, new Date(), dAb, semana,
    abComoTexto(s.mat), s.tecnico.nome, abPlaca(dados.placa),
    f.condutor, f.parque, abComoTexto(f.frota), abComoTexto(f.cartao), km,
    obs, pasta, nomes.pdf
  ];
  if (AB_SENHA_NO_REGISTRO) { /* mantido desligado de propósito — ver cabeçalho */ }

  var sh = abAbaRegistro(props);
  var lock = LockService.getScriptLock(), travou = false, xlsx = { ok: false, erro: 'fila' };
  try { travou = lock.tryLock(20000); } catch (eL) { travou = false; }
  try {
    sh.appendRow(linha);
    SpreadsheetApp.flush();
    if (travou) xlsx = abAtualizarXlsx(token);
  } finally {
    if (travou) try { lock.releaseLock(); } catch (eR) {}
  }
  if (!xlsx.ok) props.setProperty('ABAST_XLSX_PENDENTE', '1');

  var out = {
    ok: true, id: protocolo, pasta: pasta, pdf: nomes.pdf,
    semana: semana, tecnico: s.tecnico.nome, mat: String(s.mat),
    xlsxOk: !!xlsx.ok, xlsxErro: xlsx.ok ? '' : (xlsx.erro || '')
  };
  cache.put(AB_PFX + 'OK_' + idEnvio, JSON.stringify(out), 21600);
  return out;
}

function abAbaRegistro(props) {
  props = props || PropertiesService.getScriptProperties();
  var id = props.getProperty('ABAST_SHEET_ID') || props.getProperty('SHEET_ID');
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(AB_ABA_REGISTRO);
  if (!sh) {
    sh = ss.insertSheet(AB_ABA_REGISTRO);
    sh.getRange(1, 1, 1, AB_CAB.length).setValues([AB_CAB]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('B:C').setNumberFormat('dd/mm/yyyy hh:mm:ss');
    sh.getRange('D:D').setNumberFormat('dd/mm/yyyy');
  }
  return sh;
}

/* ---------- espelho CONTROLE DE COMBUSTÍVEL.xlsx ---------- */

function abXmlEsc(s) {
  return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function abColLetra(n) { var s = ''; n++; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

/* Parte pura. linhas: [[valor...]] onde valor = string | number |
   {serial: número do Excel, fmt: 'data'|'datahora'}. Devolve {nomeArquivo: xml}. */
function abXlsxPartes(cab, linhas, nomeAba) {
  var cols = cab.length;
  function celula(v, c, r, estilo) {
    var ref = abColLetra(c) + r;
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'object' && v.serial !== undefined) {
      return '<c r="' + ref + '" s="' + (v.fmt === 'data' ? 1 : 3) + '"><v>' + v.serial + '</v></c>';
    }
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + (estilo ? ' s="' + estilo + '"' : '') + '><v>' + v + '</v></c>';
    return '<c r="' + ref + '" t="inlineStr"' + (estilo ? ' s="' + estilo + '"' : '') +
           '><is><t xml:space="preserve">' + abXmlEsc(v) + '</t></is></c>';
  }
  var rows = ['<row r="1">' + cab.map(function (h, c) { return celula(h, c, 1, 2); }).join('') + '</row>'];
  linhas.forEach(function (l, i) {
    var r = i + 2, cel = '';
    for (var c = 0; c < cols; c++) cel += celula(l[c], c, r, 0);
    rows.push('<row r="' + r + '">' + cel + '</row>');
  });
  var ultCol = abColLetra(cols - 1), ultLin = Math.max(1, linhas.length + 1);
  var ultima = ultCol + ultLin;
  var larg = cab.map(function (h, c) {
    var w = Math.min(48, Math.max(10, String(h).length + 2));
    return '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + w + '" customWidth="1"/>';
  }).join('');

  var ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var nsR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + nsR + '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="' + ns + '" xmlns:r="' + nsR + '"><sheets>' +
      '<sheet name="' + abXmlEsc(nomeAba) + '" sheetId="1" r:id="rId1"/></sheets>' +
      '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'' +
      abXmlEsc(nomeAba).replace(/'/g, "''") + '\'!$A$1:$' + ultCol + '$' + ultLin + '</definedName></definedNames>' +
      '</workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + nsR + '/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="' + nsR + '/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="' + ns + '">' +
      '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>' +
      '<numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm:ss"/></numFmts>' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF12466B"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>',
    'xl/worksheets/sheet1.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="' + ns + '" xmlns:r="' + nsR + '">' +
      '<dimension ref="A1:' + ultima + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/><cols>' + larg + '</cols>' +
      '<sheetData>' + rows.join('') + '</sheetData>' +
      '<autoFilter ref="A1:' + ultima + '"/>' +
      '</worksheet>'
  };
}

function abSerial(d, fmt) {
  var p = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy,MM,dd,HH,mm,ss').split(',').map(Number);
  var ms = Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4], p[5]) - Date.UTC(1899, 11, 30);
  var v = ms / 86400000;
  return { serial: fmt === 'data' ? Math.round(v) : Math.round(v * 86400) / 86400, fmt: fmt };
}

/**
 * Regera o CONTROLE DE COMBUSTÍVEL.xlsx a partir da aba Abastecimentos.
 * Só sobrescreve a revisão que o próprio app gravou (mode "update").
 * Pode rodar à mão no editor.
 */
function abAtualizarXlsx(token) {
  var props = PropertiesService.getScriptProperties();
  try {
    token = token || getDropboxToken(props);
    var sh = abAbaRegistro(props);
    var n = sh.getLastRow() - 1;
    var linhas = n > 0 ? sh.getRange(2, 1, n, AB_CAB.length).getValues() : [];
    linhas = linhas.map(function (l) {
      return l.map(function (v, c) {
        if (v instanceof Date) return abSerial(v, c === 3 ? 'data' : 'datahora');
        return v;
      });
    });
    var partes = abXlsxPartes(AB_CAB, linhas, 'ABASTECIMENTOS');
    var blobs = Object.keys(partes).map(function (nome) {
      return Utilities.newBlob(partes[nome], 'application/xml', nome);
    });
    var xlsx = Utilities.zip(blobs, AB_XLSX_NOME);

    var base = (props.getProperty('ABAST_PASTA') || AB_PASTA_PADRAO).replace(/\\/g, '/').replace(/\/+$/, '');
    var revApp = props.getProperty('ABAST_XLSX_REV');
    var modo = revApp ? { '.tag': 'update', 'update': revApp } : 'add';
    var q = abReqUpload(token, props, base + '/' + AB_XLSX_NOME, xlsx.getBytes(), modo);
    var r = UrlFetchApp.fetch(q.url, q);
    if (r.getResponseCode() === 409) {
      var msg = 'O ' + AB_XLSX_NOME + ' foi criado ou alterado fora do app — não sobrescrevi. ' +
                'Renomeie o arquivo que está na pasta e rode abAtualizarXlsx().';
      Logger.log(msg + ' ' + r.getContentText().slice(0, 200));
      /* rev guardada não vale mais (arquivo trocado): o próximo passa a ser "add" */
      if (r.getContentText().indexOf('conflict') >= 0) props.deleteProperty('ABAST_XLSX_REV');
      return { ok: false, erro: msg };
    }
    if (r.getResponseCode() >= 300) return { ok: false, erro: 'Dropbox ' + r.getResponseCode() };
    props.setProperty('ABAST_XLSX_REV', JSON.parse(r.getContentText()).rev);
    props.deleteProperty('ABAST_XLSX_PENDENTE');
    return { ok: true, linhas: linhas.length };
  } catch (e) {
    Logger.log('abAtualizarXlsx: ' + e);
    return { ok: false, erro: String(e) };
  }
}

/* ---------- gatilho e testes ---------- */

function abGatilho() {
  try { abSincronizar(false); } catch (e) { Logger.log('abGatilho (frota): ' + e); }
  try {
    if (PropertiesService.getScriptProperties().getProperty('ABAST_XLSX_PENDENTE')) {
      var lock = LockService.getScriptLock();
      if (lock.tryLock(5000)) { try { abAtualizarXlsx(); } finally { lock.releaseLock(); } }
    }
  } catch (e2) { Logger.log('abGatilho (xlsx): ' + e2); }
}

function instalarGatilhoAbastecimento() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'abGatilho') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('abGatilho').timeBased().everyMinutes(10).create();
  Logger.log('Gatilho criado: abGatilho a cada 10 minutos.');
}

function testarAbastecimento() {
  var r = abSincronizar(true);
  Logger.log(JSON.stringify(r, null, 2));
  var props = PropertiesService.getScriptProperties();
  var base = (props.getProperty('ABAST_PASTA') || AB_PASTA_PADRAO).replace(/\\/g, '/');
  try { eqDbxMetadata(getDropboxToken(props), base, props); Logger.log('Pasta base OK: ' + base); }
  catch (e) { Logger.log('PASTA BASE NÃO ENCONTRADA: ' + base + ' — ' + e); }
  Logger.log('Aba de registro: ' + abAbaRegistro(props).getParent().getName() + ' / ' + AB_ABA_REGISTRO);
  return r;
}

function testarPlaca() {
  var placa = 'ABC1D23';   /* troque aqui */
  var b = abBuscarPlaca(abChavePlaca(placa), true);
  Logger.log(JSON.stringify(b.reg ? { placa: b.reg.placa, condutor: b.reg.condutor, parque: b.reg.parque,
    frota: b.reg.frota, cartao: b.reg.cartao, senha: b.reg.senha ? '(preenchida)' : '(VAZIA)', linha: b.reg.linha }
    : { encontrado: false, meta: b.meta }, null, 2));
}
