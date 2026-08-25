/**
 * BACKEND — Relatório de Operação Diária (Extreme Wind) — versão 17
 * O PDF é GERADO AQUI (no servidor), a partir dos dados e fotos enviados
 * pelo formulário. Depois é salvo no Dropbox e as linhas vão para o Sheets.
 *
 * v17:
 *   - UM RDO por técnico por dia: chave = matrícula de quem logou + data do
 *     expediente. Reenvio APAGA as linhas antigas (Relatorios, Atividades,
 *     Funcionarios) e grava as novas, dentro de um LockService.
 *   - Nome do PDF termina com a matrícula em vez do horário, e o upload usa
 *     mode:overwrite -> o PDF do dia é substituído, não duplicado.
 *   - Aba Relatorios ganhou a coluna "Matricula_login".
 *   - Sessão de 48 h (era 12), para o técnico trabalhar offline o dia todo.
 *
 * v16: SEM MUDANÇA no backend. Igual ao 15, só para o par de versões casar.
 *   (a mudança da v16 foi só no html: Próxima atividade virou campo de busca)
 *
 * v15:
 *   - PDF: seção "Resumo da atividade" virou "Atividade realizada" e os campos
 *     ficaram pareados dois por linha.
 *
 * v14: SEM MUDANÇA no backend. Igual ao 13, só para o par de versões casar.
 *   (a correção da v14 foi só no html: rolagem das listas suspensas)
 *
 * v13:
 *   - Aba "ATV POR HR" em formato NOVO (1 linha por atividade):
 *       A = ID (ignorado) | B = Atividade | C = Tipo de reparo
 *       D = Observação obrigatória (Sim) | E = Atividade obrigatória (Sim)
 *       F = Foto obrigatória (Sim)
 *     As colunas são localizadas pelo CABEÇALHO (linha 1); se não achar,
 *     cai para as posições fixas acima.
 *     "Atividade obrigatória = Sim" -> a atividade fica disponível em TODO tipo
 *     de reparo, e o tipo dela deixa de aparecer na lista de tipos.
 *   - Campo de atividade no formulário virou busca com filtro (como o de técnico).
 *
 * v12:
 *   - Cópia do PDF por e-mail para o endereço digitado no formulário.
 *   - Mensagem de login genérica: "Matrícula ou CPF inválido".
 *   - RESUMO DE ATV é lido sempre a partir da linha 2 (linha 1 = cabeçalho).
 *   - PDF: título "Relatório de Operação Diária" e linha "Atividade realizada".
 *   ATENÇÃO: o envio de e-mail adiciona um escopo novo. Depois de colar este
 *   código é obrigatório rodar uma função à mão no editor e ACEITAR as
 *   permissões, senão o envio do RDO passa a falhar.
 *
 * v11:
 *   - BANCO DE INPUTS (planilha separada) alimenta cliente/parque, resumo de
 *     atividade, tipo de reparo e a lista de atividades por hora — sem mexer no
 *     código para mudar essas listas.
 *   - Campos novos: "Tipo de reparo" e "Reparo finalizado".
 *
 * v10:
 *   - LOGIN por matrícula + CPF, conferido AQUI (o CPF nunca sai da planilha).
 *     Login devolve um token assinado (HMAC) válido por 12 h; doPost recusa RDO
 *     sem token válido.
 *   - aba "Funcionarios" virou formato LONGO: 1 linha por técnico.
 *   - PDF: campos pareados 2 por linha; equipe um nome por linha.
 *
 * v9: integração com a MINI MASTER (planilha externa de funcionários).
 *   - doGet?lista=tecnicos  ->  devolve [{nome, mat}] para o autocomplete do form.
 *   - aba "Relatorios": coluna "Tecnicos" virou "Matriculas".
 *
 * Propriedades do Script necessárias (Configurações do projeto):
 *   SHEET_ID, DROPBOX_APP_KEY, DROPBOX_APP_SECRET,
 *   DROPBOX_REFRESH_TOKEN, DROPBOX_FOLDER,
 *   MASTER_SHEET_ID        (ID da planilha mini master)
 * Opcionais (só se a mini master mudar de layout — os padrões já são os atuais):
 *   MASTER_ABA        padrão "EXTREME"
 *   MASTER_COL_NOME   padrão "B"  (letra ou o texto do cabeçalho)
 *   MASTER_COL_MAT    padrão "A"  (letra ou o texto do cabeçalho)
 *   MASTER_COL_CPF    padrão "H"  (letra ou o texto do cabeçalho)
 * Obrigatória a partir da v11:
 *   INPUTS_SHEET_ID   ID da planilha "Banco de inputs"
 *     abas: "PARQUE E CLIENTE" (A=parque, B=cliente)
 *           "RESUMO DE ATV"    (A=itens do resumo)
 *           "ATV POR HR"       (linha 1 = cabeçalho; 1 linha por atividade:
 *                               B=Atividade, C=Tipo de reparo,
 *                               D=Observação obrigatória, E=Atividade obrigatória,
 *                               F=Foto obrigatória)
 * Criada sozinha na 1ª execução (não mexer):
 *   LOGIN_SECRET      chave usada para assinar o token de sessão
 */

/* Layout atual da mini master (sobrescrevível por Propriedade do Script) */
var MM_ABA_PADRAO = 'EXTREME';
var MM_COL_NOME_PADRAO = 'B';
var MM_COL_MAT_PADRAO = 'A';
var MM_COL_CPF_PADRAO = 'H';

/* Validade do login (horas) e limite de tentativas por matrícula */
var SESSAO_HORAS = 48;
var LOGIN_MAX_TENTATIVAS = 8;
var LOGIN_JANELA_SEG = 600;


var MM_CACHE_KEY = 'MM_TECNICOS_V2';
var IN_CACHE_KEY = 'INPUTS_V2';

/* Abas do Banco de inputs (sobrescrevíveis por Propriedade do Script) */
var IN_ABA_PC_PADRAO = 'PARQUE E CLIENTE';
var IN_ABA_RESUMO_PADRAO = 'RESUMO DE ATV';
var IN_ABA_ATV_PADRAO = 'ATV POR HR';
var MM_CACHE_SEG = 21600; /* 6 h */

/* ===================== ENTRADAS HTTP ===================== */

function doPost(e) {
  try {
    var dados = JSON.parse(e.postData.contents);

    /* --- login --- */
    if (dados.acao === 'login') return resposta(login(dados));

    /* --- envio de RDO: exige sessão válida --- */
    var sess = validarToken(dados.token);
    if (!sess.ok) {
      return resposta({
        ok: false, sessao: false,
        erro: sess.expirado ? 'Sessão expirada. Faça login novamente.'
                            : 'Sessão inválida. Faça login novamente.'
      });
    }

    var props = PropertiesService.getScriptProperties();
    var id = gerarId();
    var matLogin = sess.mat;

    /* trava: dois envios do mesmo técnico (ex.: fila offline reenviando) não podem
       apagar/gravar ao mesmo tempo */
    var lock = LockService.getScriptLock();
    var travou = false;
    try { travou = lock.tryLock(30000); } catch (eL) { travou = false; }

    var subst, linkPdf, pdfBlob;
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
      gravarSheets(dados, id, linkPdf, props, matLogin);
    } finally {
      if (travou) { try { lock.releaseLock(); } catch (eR) {} }
    }

    /* cópia por e-mail: falhar aqui NÃO invalida o RDO (já está no Dropbox e no Sheets) */
    var email = enviarCopiaEmail(dados, pdfBlob, id);

    return resposta({
      ok: true, id: id, link: linkPdf,
      substituiu: subst.apagou > 0, apagadas: subst.apagou,
      emailOk: email.ok, emailErro: email.erro, emailPara: email.para
    });
  } catch (err) {
    return resposta({ ok: false, erro: String(err) });
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};

  /* plano B quando o navegador não deixa ler a resposta do POST */
  if (p.acao === 'login') {
    var rl;
    try { rl = login({ mat: p.mat, cpf: p.cpf, hash: p.hash }); }
    catch (e1) { rl = { ok: false, erro: String(e1) }; }
    return saida(rl, p.callback);
  }

  if (p.lista === 'tecnicos') {
    var out;
    try {
      out = { ok: true, tecnicos: listaTecnicos() };
    } catch (err) {
      out = { ok: false, erro: String(err), tecnicos: [] };
    }
    return saida(out, p.callback);
  }

  if (p.lista === 'inputs') {
    var oi;
    try { oi = { ok: true, inputs: lerInputs() }; }
    catch (e0) { oi = { ok: false, erro: String(e0), inputs: null }; }
    return saida(oi, p.callback);
  }

  /* uma chamada só: economiza um round-trip no 4G do parque */
  if (p.lista === 'tudo') {
    var t = null, i = null, erros = [];
    try { t = listaTecnicos(); } catch (e1) { erros.push('técnicos: ' + e1); }
    try { i = lerInputs(); } catch (e2) { erros.push('inputs: ' + e2); }
    return saida({
      ok: !!(t && i),
      tecnicos: t || [],
      inputs: i,
      erro: erros.join(' | ')
    }, p.callback);
  }

  return ContentService.createTextOutput('Backend online');
}

/* JSON puro, ou JSONP quando vem ?callback= válido */
function saida(obj, callback) {
  var txt = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]{0,40}$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + txt + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}

/* ===================== LOGIN E SESSÃO ===================== */

function soDigitos(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }

/* Sheets pode guardar CPF/matrícula como número e comer o zero à esquerda. */
function normCpf(v) {
  var d = soDigitos(v);
  if (!d) return '';
  while (d.length < 11) d = '0' + d;
  return d;
}
function normMat(v) {
  var d = soDigitos(v);
  return d.replace(/^0+/, '') || d;
}

function segredoLogin() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('LOGIN_SECRET');
  if (!s) {
    s = Utilities.base64Encode(Utilities.getUuid() + '|' + Utilities.getUuid());
    props.setProperty('LOGIN_SECRET', s);
  }
  return s;
}

function assinar(txt) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(txt, segredoLogin())
  );
}

function gerarToken(mat) {
  var exp = new Date().getTime() + SESSAO_HORAS * 3600 * 1000;
  var corpo = normMat(mat) + '.' + exp;
  return corpo + '.' + assinar(corpo);
}

function validarToken(tk) {
  if (!tk) return { ok: false };
  var p = String(tk).split('.');
  if (p.length !== 3) return { ok: false };
  if (assinar(p[0] + '.' + p[1]) !== p[2]) return { ok: false };
  if (Number(p[1]) < new Date().getTime()) return { ok: false, expirado: true };
  return { ok: true, mat: p[0] };
}

/* Freio simples de força bruta, por matrícula. */
function tentativasExcedidas(mat) {
  var cache;
  try { cache = CacheService.getScriptCache(); } catch (e) { return false; }
  var k = 'LOGIN_TRY_' + normMat(mat);
  var n = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(n), LOGIN_JANELA_SEG);
  return n > LOGIN_MAX_TENTATIVAS;
}
function limparTentativas(mat) {
  try { CacheService.getScriptCache().remove('LOGIN_TRY_' + normMat(mat)); } catch (e) {}
}

/**
 * Confere matrícula + CPF na mini master.
 * Aceita `cpf` (dígitos) ou `hash` = SHA-256 de "matricula:cpf" em hex —
 * o hash existe para o CPF não viajar em URL no plano B por JSONP.
 * Mensagem de erro é sempre genérica: não revela quais matrículas existem.
 */
function login(dados) {
  var mat = normMat(dados && dados.mat);
  if (!mat) return { ok: false, erro: 'Informe a matrícula.' };
  if (!(dados.cpf || dados.hash)) return { ok: false, erro: 'Informe o CPF.' };

  if (tentativasExcedidas(mat)) {
    return { ok: false, erro: 'Muitas tentativas. Aguarde 10 minutos e tente de novo.' };
  }

  var achado = null;
  lerMiniMasterCompleto().forEach(function (t) {
    if (!achado && normMat(t.mat) === mat) achado = t;
  });
  var GENERICO = { ok: false, erro: 'Matrícula ou CPF inválido.' };
  if (!achado) return GENERICO;

  var cpfPlanilha = normCpf(achado.cpf);
  if (!cpfPlanilha) {
    return { ok: false, erro: 'Sua matrícula não tem CPF cadastrado na mini master. Fale com a administração.' };
  }

  var confere;
  if (dados.hash) {
    confere = (String(dados.hash).toLowerCase() === sha256Hex(mat + ':' + cpfPlanilha));
  } else {
    confere = (normCpf(dados.cpf) === cpfPlanilha);
  }
  if (!confere) return GENERICO;

  limparTentativas(mat);
  return {
    ok: true,
    nome: achado.nome,
    mat: String(achado.mat),
    token: gerarToken(mat),
    horas: SESSAO_HORAS
  };
}

function sha256Hex(txt) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, txt, Utilities.Charset.UTF_8);
  var s = '';
  for (var i = 0; i < b.length; i++) {
    var v = (b[i] < 0 ? b[i] + 256 : b[i]).toString(16);
    s += (v.length === 1 ? '0' : '') + v;
  }
  return s;
}

function resposta(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function gerarId() {
  var d = new Date();
  var p = function (n) { return String(n).padStart(2, '0'); };
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
    + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

/* ===================== MINI MASTER (nome <-> matrícula) ===================== */

/** Lista PÚBLICA (vai para o celular): só nome e matrícula. Nunca CPF. */
function listaTecnicos() {
  return lerMiniMasterCompleto().map(function (t) {
    return { nome: t.nome, mat: t.mat };
  });
}

/** Lista INTERNA (fica no servidor): inclui CPF, usada só pelo login. */
function lerMiniMasterCompleto() {
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) { /* sem cache */ }

  if (cache) {
    var hit = cache.get(MM_CACHE_KEY);
    if (hit) {
      try {
        var j = JSON.parse(hit);
        if (j && j.length) return j;
      } catch (e2) { /* cache corrompido: relê */ }
    }
  }

  var lista = lerMiniMaster();

  if (cache) {
    try { cache.put(MM_CACHE_KEY, JSON.stringify(lista), MM_CACHE_SEG); } catch (e3) { /* > 100 KB: segue sem cache */ }
  }
  return lista;
}

/** Força releitura da mini master (rodar à mão depois de editar a planilha). */
function limparCacheTecnicos() {
  try { CacheService.getScriptCache().remove(MM_CACHE_KEY); } catch (e) {}
  var n = lerMiniMasterCompleto().length;
  Logger.log('Cache limpo. Técnicos carregados: ' + n);
  return n;
}

/** Diagnóstico: roda à mão e mostra o que foi detectado. */
function testarMiniMaster() {
  var l = lerMiniMaster();
  var comCpf = 0;
  l.forEach(function (t) { if (normCpf(t.cpf)) comCpf++; });
  Logger.log('Total de técnicos: ' + l.length);
  Logger.log('Com CPF cadastrado: ' + comCpf + '  |  SEM CPF (não conseguem logar): ' + (l.length - comCpf));
  /* mostra só os 4 últimos dígitos do CPF — não joga CPF inteiro no log */
  Logger.log(JSON.stringify(l.slice(0, 10).map(function (t) {
    var c = normCpf(t.cpf);
    return { nome: t.nome, mat: t.mat, cpf: c ? ('•••.•••.' + c.slice(6, 9) + '-' + c.slice(9)) : 'SEM CPF' };
  }), null, 2));
  return l.length;
}

/** Lista quem está sem CPF na mini master (esses não conseguem entrar). */
function tecnicosSemCpf() {
  var faltam = lerMiniMaster().filter(function (t) { return !normCpf(t.cpf); })
    .map(function (t) { return t.mat + ' - ' + t.nome; });
  Logger.log(faltam.length ? ('Sem CPF (' + faltam.length + '):\n' + faltam.join('\n')) : 'Todos têm CPF.');
  return faltam;
}

function lerMiniMaster() {
  var props = PropertiesService.getScriptProperties();
  var idMaster = props.getProperty('MASTER_SHEET_ID');
  if (!idMaster) throw new Error('Propriedade MASTER_SHEET_ID não configurada.');

  var ss = SpreadsheetApp.openById(idMaster);
  var nomeAba = (props.getProperty('MASTER_ABA') || MM_ABA_PADRAO).trim();
  var sh = ss.getSheetByName(nomeAba) || ss.getSheets()[0];
  if (!sh) throw new Error('Aba "' + nomeAba + '" não encontrada na mini master.');

  var valores = sh.getDataRange().getValues();
  if (!valores.length) return [];

  var map = acharColunas(
    valores,
    props.getProperty('MASTER_COL_NOME') || MM_COL_NOME_PADRAO,
    props.getProperty('MASTER_COL_MAT') || MM_COL_MAT_PADRAO
  );
  var iCpf = letraParaIndice(props.getProperty('MASTER_COL_CPF') || MM_COL_CPF_PADRAO);
  if (map.nome < 0) {
    throw new Error('Não achei a coluna do NOME na aba "' + sh.getName()
      + '". Configure MASTER_COL_NOME (letra ou texto do cabeçalho).');
  }
  if (map.mat < 0) {
    throw new Error('Não achei a coluna da MATRICULA na aba "' + sh.getName()
      + '". Configure MASTER_COL_MAT (letra ou texto do cabeçalho).');
  }

  var out = [], vistos = {};
  for (var r = map.linhaCab + 1; r < valores.length; r++) {
    var nome = limpar(valores[r][map.nome]);
    var mat = limpar(valores[r][map.mat]);
    if (!nome) continue;
    /* chave = matrícula quando existe. Se fosse por nome, um homônimo (ou
       recontratação com matrícula nova) sumiria da lista e não conseguiria logar. */
    var k = mat ? ('M:' + normMat(mat)) : ('N:' + chaveNome(nome));
    if (vistos[k]) continue;          /* duplicado na mini master: fica o 1º */
    vistos[k] = true;
    var cpf = (iCpf >= 0 && iCpf < valores[r].length) ? limpar(valores[r][iCpf]) : '';
    out.push({ nome: nome, mat: mat, cpf: cpf });
  }

  out.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  return out;
}

function limpar(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  return String(v).replace(/\s+/g, ' ').trim();
}

/** chave para comparar nomes: minusculo, sem acento, espaco simples */
function chaveNome(s) {
  var t = limpar(s).toLowerCase();
  try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* engine sem normalize */ }
  return t;
}

function letraParaIndice(s) {
  var t = String(s || '').trim().toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(t)) return -1;
  var n = 0;
  for (var i = 0; i < t.length; i++) n = n * 26 + (t.charCodeAt(i) - 64);
  return n - 1;
}

/* Um cabeçalho é uma célula CURTA que COMEÇA com a palavra-chave.
   Evita confundir títulos tipo "RELAÇÃO DE FUNCIONÁRIOS - 2026" com cabeçalho. */
function pareceCabNome(cab) {
  var t = chaveNome(cab);
  return t.length <= 30 && /^(nome|tecnico|funcionario|colaborador|empregado)\b/.test(t);
}
function pareceCabMat(cab) {
  var t = chaveNome(cab);
  return t.length <= 30 && /^(matricula|mat|re|registro)\b/.test(t);
}

/**
 * Resolve os índices das colunas nome/matrícula e a linha de cabeçalho.
 * Prioridade para cada coluna: letra ("B") -> texto exato do cabeçalho -> palavra-chave.
 * linhaCab = -1 significa "a aba não tem cabeçalho, lê desde a 1ª linha".
 */
function acharColunas(valores, cfgNome, cfgMat) {
  var iN = letraParaIndice(cfgNome);
  var iM = letraParaIndice(cfgMat);
  var limite = Math.min(valores.length, 15);
  var linhaCab = -1;

  /* 1) resolve por texto exato do cabeçalho ou por palavra-chave */
  for (var r = 0; r < limite && (iN < 0 || iM < 0); r++) {
    var linha = valores[r];
    for (var c = 0; c < linha.length; c++) {
      var cab = limpar(linha[c]);
      if (!cab) continue;
      if (iN < 0 && ((cfgNome && chaveNome(cab) === chaveNome(cfgNome)) || (!cfgNome && pareceCabNome(cab)))) {
        iN = c; linhaCab = r;
      }
      if (iM < 0 && ((cfgMat && chaveNome(cab) === chaveNome(cfgMat)) || (!cfgMat && pareceCabMat(cab)))) {
        iM = c; linhaCab = r;
      }
    }
  }

  /* 2) colunas vieram por letra: procura a linha de cabeçalho só nessas colunas.
        Prefere a linha em que AS DUAS parecem cabeçalho. */
  if (linhaCab < 0 && iN >= 0 && iM >= 0) {
    var candidata = -1;
    for (var r2 = 0; r2 < limite; r2++) {
      var vN = limpar(valores[r2][iN]), vM = limpar(valores[r2][iM]);
      var okN = pareceCabNome(vN) || pareceCabMat(vN);
      var okM = pareceCabMat(vM) || pareceCabNome(vM);
      if (okN && okM) { candidata = r2; break; }
      if (candidata < 0 && (okN || okM)) candidata = r2;
    }
    linhaCab = candidata;
  }

  return { linhaCab: linhaCab, nome: iN, mat: iM };
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
    if (hit) { try { var j = JSON.parse(hit); if (j && j.reparos && j.comuns) return j; } catch (e2) {} }
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
    comuns: atv.comuns
  };
  var pc = lerAbaParqueCliente(ss, props);
  out.clientes = pc.clientes;
  out.parques = pc.parques;

  if (cache) { try { cache.put(IN_CACHE_KEY, JSON.stringify(out), MM_CACHE_SEG); } catch (e3) {} }
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
  return { reparos: reparos, comuns: comuns };
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
    + ' | Atividades comuns: ' + i.comuns.length);
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

function dataBr(iso) {
  var p = String(iso || '').split('-');
  return (p.length === 3) ? (p[2] + '/' + p[1] + '/' + p[0]) : String(iso || '');
}

function emailValido(e) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(e || '').trim());
}

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

function getDropboxToken(props) {
  var res = UrlFetchApp.fetch('https://api.dropbox.com/oauth2/token', {
    method: 'post',
    payload: {
      grant_type: 'refresh_token',
      refresh_token: props.getProperty('DROPBOX_REFRESH_TOKEN'),
      client_id: props.getProperty('DROPBOX_APP_KEY'),
      client_secret: props.getProperty('DROPBOX_APP_SECRET')
    },
    muteHttpExceptions: true
  });
  var j = JSON.parse(res.getContentText());
  if (!j.access_token) throw new Error('Dropbox auth falhou: ' + res.getContentText());
  return j.access_token;
}

function escaparArg(obj) {
  return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, function (c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
}


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

/** Apaga um arquivo do Dropbox. Nunca lança. */
function apagarDropbox(path, props) {
  if (!path) return false;
  try {
    var token = getDropboxToken(props);
    var r = UrlFetchApp.fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + token },
      payload: JSON.stringify({ path: path }),
      muteHttpExceptions: true
    });
    return r.getResponseCode() < 300;
  } catch (e) { return false; }
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

  /* --- Relatorios: coluna Tecnicos virou Matriculas --- */
  ss.getSheetByName('Relatorios').appendRow([
    id,
    na(dados.registrado), na(dados.data_exp), na(dados.hora_ini), na(dados.hora_fim),
    na(dados.cliente), na(dados.parque), na(equipeMatriculas(equipe).join(', ')), na(dados.email),
    na(dados.local), na(dados.turbina), na(dados.blade), na(dados.parada), na(dados.marcha),
    na(dados.fibraon), na(dados.fibraoff), na((dados.resumo || []).join('; ')),
    na((dados.proxima || []).join('; ')), na(dados.avanco),
    na(dados.tipo_reparo), (dados.finalizado === true || dados.finalizado === 'SIM') ? 'SIM' : 'NÃO',
    na(matLogin ? normMat(matLogin) : (equipe[0] ? equipe[0].mat : '')),
    na(linkPdf)
  ]);

  /* --- Funcionarios: formato longo, 1 linha por técnico (igual Atividades) --- */
  var fun = ss.getSheetByName('Funcionarios') || criarAbaFuncionarios(ss);
  equipe.forEach(function (t) {
    fun.appendRow([
      id, na(dados.parque), na(dados.data_exp), na(dados.hora_ini), na(dados.hora_fim),
      na(t.nome), na(t.mat)
    ]);
  });

  /* --- Atividades: sem mudança --- */
  var atv = ss.getSheetByName('Atividades');
  (dados.atividades || []).forEach(function (a, i) {
    atv.appendRow([
      id, na(dados.parque), na(dados.data_exp), na(dados.turbina), na(dados.blade),
      i + 1, na(a.ini), na(a.fim), na(a.tipo), na(a.obs)
    ]);
  });
}

/* ===================== UM RDO POR TÉCNICO POR DIA ===================== */

/** Data em texto yyyy-MM-dd, venha como Date, "yyyy-mm-dd" ou "dd/mm/aaaa". */
function normData(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return s;
}

function idxCabecalho(sh, nome) {
  var cab = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  return cab.indexOf(nome);
}

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

  apagarLinhasPorId(ss.getSheetByName('Atividades'), ids);
  apagarLinhasPorId(ss.getSheetByName('Funcionarios'), ids);

  return { apagou: linhas.length, ids: ids, caminhoAntigo: caminho };
}

/** Apaga de uma aba todas as linhas cuja 1ª coluna esteja na lista de IDs. */
function apagarLinhasPorId(sh, ids) {
  if (!sh || !ids || !ids.length || sh.getLastRow() < 2) return 0;
  var mapa = {};
  ids.forEach(function (i) { mapa[String(i)] = true; });

  var v = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  var linhas = [];
  for (var r = 1; r < v.length; r++) {
    if (mapa[String(v[r][0])]) linhas.push(r + 1);
  }
  linhas.sort(function (a, b) { return b - a; });
  linhas.forEach(function (n) { sh.deleteRow(n); });
  return linhas.length;
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
