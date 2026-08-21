// ═══════════════════════════════════════════════════════════
//  EW — SCRIPT ÚNICO E CONSOLIDADO (substitui TODOS os arquivos
//  antigos do Apps Script desta planilha — apague os outros)
//
//  O QUE MUDOU EM RELAÇÃO AO QUE JÁ EXISTIA:
//  • "Contagem" (preenchida manualmente) foi APOSENTADA. As abas
//    Checklist_Nordex / Checklist_GE / Checklist_Siemens (uma por
//    cliente) agora fazem esse papel, alimentadas automaticamente
//    pelo checklist.html a cada "Enviar para a planilha".
//  • "Consumo_MP" e "Filtro Materiais" foram declaradas obsoletas
//    pelo engenheiro responsável. Uma nova aba "Consumo_Reparos"
//    (mesma ideia, formato limpo e documentado abaixo) passa a
//    receber o consumo das 3 calculadoras a partir de agora.
//  • Limite de alerta da "Análise vs Realizado": 5% → 20%.
//  • MAPA_MAT atualizado com as correções confirmadas pelo
//    engenheiro (ver comentários no MAPA_MAT abaixo).
//
//  ⚠️ Como eu (Claude) não tenho acesso para RODAR Apps Script,
//  este arquivo não foi testado em produção — só revisado com
//  cuidado. Teste com um envio de exemplo do checklist.html e
//  confirme o resultado antes de confiar 100% nele.
// ═══════════════════════════════════════════════════════════

const ID_DESTINO = "1Bpnv7ho9zDcP9A-oHCrwL9dRupCl3cVjBcl7eH-8ku0";

// ═══════════════════════════════════════════════════════════
//  AVISOS — funcionam COM e SEM interface
//
//  SpreadsheetApp.getUi() só existe quando o código roda a partir da planilha
//  (ao abrir, ou por um item de menu). Ele NÃO existe quando:
//    • você aperta ▶️ Executar no editor do Apps Script;
//    • o acionador automático das 20h dispara sozinho.
//  Chamar getUi() nesses casos lança "Cannot call SpreadsheetApp.getUi() from
//  this context" e derruba a execução inteira. Por isso todo aviso passa por
//  avisar(): se houver tela, mostra a janelinha; se não houver, grava no log
//  (Apps Script → Execuções) e a rotina segue normalmente.
// ═══════════════════════════════════════════════════════════
function temUi() {
  try { SpreadsheetApp.getUi(); return true; } catch (e) { return false; }
}
function avisar(msg) {
  try { SpreadsheetApp.getUi().alert(msg); }
  catch (e) { Logger.log(String(msg).replace(/\n/g, " | ")); }
}

// ═══════════════════════════════════════════════════════════
//  MENU
// ═══════════════════════════════════════════════════════════
function onOpen() {
  if (!temUi()) {   // rodando pelo editor ou por acionador: não há menu para criar
    Logger.log("onOpen: sem interface disponível (execução manual/agendada) — menu não criado. Isso é normal.");
    return;
  }
  SpreadsheetApp.getUi()
    .createMenu('⚙️ Automação EW')
    .addItem('▶️ Rodar tudo', 'executarTudo')
    .addSeparator()
    .addItem('Atualizar comparativos por parque', 'atualizarTodosParques')
    .addItem('📊 Gerar Análise Mensal (1ª→última semana)', 'analisarMensal')
    .addItem('Gerar Análise vs Realizado (com mês anterior)', 'analisarConsumoVsDelta')
    .addItem('⏳ Conferir validade dos lotes', 'verificarValidades')
    .addSeparator()
    .addItem('Configurar automação diária (20h)', 'configurarAcionador')
    .addItem('Listar parques (debug)', 'listarParquesDebug')
    .addToUi();
}

// ═══════════════════════════════════════════════════════════
//  WEB APP — GET (?tipo=parques) e POST (checklist + calculadora)
// ═══════════════════════════════════════════════════════════
//  /!\ SEGURANCA — leia antes de mexer
//  Este Web App e publicado como "qualquer pessoa" (e o unico jeito de o
//  navegador conseguir chamar). Antes, isso significava que QUALQUER PESSOA que
//  descobrisse a URL podia gravar linha na planilha de producao e listar todos
//  os parques da EW — e a URL estava escrita dentro dos HTML publicos.
//
//  Agora ninguem fala direto com este script: o app de campo chama o Cloudflare
//  Worker (ew-dropbox-proxy), e so o Worker conhece esta URL e o segredo abaixo.
//  Como o segredo nunca chega ao navegador, ele e segredo de verdade — diferente
//  de qualquer chave colocada no HTML.
//
//  CONFIGURAR (uma vez):
//    Configuracoes do projeto -> Propriedades do script ->
//    GAS_SECRET = <valor aleatorio longo>, o MESMO da variavel do Worker.
//  Sem a propriedade configurada, o Web App recusa tudo (falha fechada).
// ═══════════════════════════════════════════════════════════
const LIMITE_LINHAS = 500;   // teto por envio, para ninguem inflar a planilha

/** Comparacao de tempo constante — nao vaza o segredo por tempo de resposta. */
function segredoOk_(recebido) {
  const esperado = PropertiesService.getScriptProperties().getProperty("GAS_SECRET") || "";
  if (!esperado) return false;                    // nao configurado -> nega
  const a = String(recebido || ""), b = String(esperado);
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

function resposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function negado_() { return resposta_({ ok: false, erro: "nao_autorizado" }); }

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!segredoOk_(p.segredo)) return negado_();
  if (p.tipo === "parques") return resposta_({ parques: listarNomesParques() });
  return resposta_({ erro: "tipo_invalido" });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return negado_();
    if (e.postData.contents.length > 600000) return resposta_({ ok: false, erro: "payload_grande" });

    const body = JSON.parse(e.postData.contents);
    if (!body || Array.isArray(body) || !segredoOk_(body.segredo)) return negado_();

    if (body.tipo === "consumo_calculadora" && Array.isArray(body.linhas)) {
      // Enviado pelo Worker: array de linhas de consumo das 3 calculadoras.
      if (body.linhas.length > LIMITE_LINHAS) return resposta_({ ok: false, erro: "payload_grande" });
      gravarConsumoCalculadora(body.linhas);
    } else if (body.tipo === "checklist_snapshot") {
      // Uma contagem por cliente/parque/semana, do checklist.html.
      if (Array.isArray(body.itens) && body.itens.length > LIMITE_LINHAS) {
        return resposta_({ ok: false, erro: "payload_grande" });
      }
      gravarChecklistSnapshot(body);
    } else {
      return resposta_({ ok: false, erro: "payload_desconhecido" });
    }
    return resposta_({ ok: true });
  } catch (err) {
    // Detalhe fica so no log: mensagem de erro do Apps Script vaza ID de
    // planilha e nome de funcao para quem chamou.
    Logger.log("doPost falhou: " + err);
    return resposta_({ ok: false, erro: "falha_interna" });
  }
}

// ═══════════════════════════════════════════════════════════
//  HELPERS GERAIS
// ═══════════════════════════════════════════════════════════
function getAba(ss, nome) {
  return ss.getSheets().find(s => s.getName().trim().toLowerCase() === nome.trim().toLowerCase()) || null;
}
function getOuCriaAba(ss, nome, cabecalho) {
  let sh = getAba(ss, nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    if (sh.getMaxColumns() < cabecalho.length) sh.insertColumnsAfter(sh.getMaxColumns(), cabecalho.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
      .setFontWeight("bold").setBackground("#1c4587").setFontColor("#ffffff");
    sh.setFrozenRows(1);
    return sh;
  }
  /* Aba que já existia com cabeçalho mais curto — caso das Checklist_* antes das
     colunas Lote e Validade. Completa SÓ as células vazias, sem tocar no que já
     está escrito, para nenhuma linha antiga se perder nem sair de lugar. */
  if (sh.getMaxColumns() < cabecalho.length) sh.insertColumnsAfter(sh.getMaxColumns(), cabecalho.length - sh.getMaxColumns());
  const atual = sh.getRange(1, 1, 1, cabecalho.length).getValues()[0];
  let faltou = false;
  for (let i = 0; i < cabecalho.length; i++) {
    if (String(atual[i] || "").trim() === "") { atual[i] = cabecalho[i]; faltou = true; }
  }
  if (faltou) {
    sh.getRange(1, 1, 1, cabecalho.length).setValues([atual])
      .setFontWeight("bold").setBackground("#1c4587").setFontColor("#ffffff");
  }
  return sh;
}
function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}
function getSemanasDoMes(ano, mes) {
  const semanas = new Set();
  const d = new Date(ano, mes, 1);
  while (d.getMonth() === mes) { semanas.add(getISOWeek(new Date(d))); d.setDate(d.getDate() + 1); }
  return [...semanas].sort((a, b) => a - b);
}
/* Normaliza para comparar nomes de material. IMPORTANTE: converte todos os tipos
   de travessão/hífen (– — ‒ ―) para "-", senão "TOP COAT 12 — ALEXIT" (grafia do
   checklist) nunca casava com "TOP COAT 12 - ALEXIT" (grafia do mapa) e o delta
   desses materiais ficava eternamente zerado. */
const norm = v => String(v).trim().toUpperCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[‐-―−]/g, "-")
  .replace(/\s*-\s*/g, " - ")
  .replace(/\s+/g, " ").trim();

function parseDataFlexivel(v) {
  if (v instanceof Date) { const d = new Date(v); d.setHours(0,0,0,0); return d; }
  const m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  const d2 = new Date(v);
  return isNaN(d2) ? new Date() : d2;
}

// ═══════════════════════════════════════════════════════════
//  RECEBER — CHECKLIST (gera/atualiza abas Checklist_<Cliente>)
//  Colunas: Semana | DataÚltimoEnvio | Parque | Responsável | Material | Unidade | QTD
//  Uma linha por (Parque + Material + Semana) — reenviar na MESMA
//  semana ATUALIZA a linha (upsert), não duplica.
// ═══════════════════════════════════════════════════════════
/* "Tipo" foi acrescentado no FIM de propósito: as linhas já gravadas antes desta
   versão não têm a coluna, ficam com o campo vazio e são lidas como "ESTOQUE"
   (comportamento antigo). Assim nada do que já existe na planilha se perde.
     ESTOQUE = contagem física do que resta no parque naquela semana
     ENTRADA = material RECEBIDO no parque naquela semana (reabastecimento) */
/* Lote e Validade entram DEPOIS de "Tipo" para não deslocar as colunas antigas:
   COL_TIPO continua 7 e as linhas já gravadas seguem válidas. Só a ENTRADA de
   material perecível preenche esses dois campos (resina, endurecedor, adesivo,
   massa, tinta, diluente); núcleo, tecido e contagem de estoque ficam vazios. */
const CAB_CHECKLIST = ["Semana", "Data do envio", "Parque", "Responsável", "Material", "Unidade", "QTD", "Tipo", "Lote", "Validade"];
const COL_TIPO = 7;   // índice 0-based da coluna "Tipo"
const COL_LOTE = 8;
const COL_VALIDADE = 9;

/* AAAA-MM -> "MM/AAAA" (texto). Aceita também o que já vier em MM/AAAA. */
function formatarValidade_(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return ("0" + m[2]).slice(-2) + "/" + m[1];
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return ("0" + m[1]).slice(-2) + "/" + m[2];
  return s;
}

function nomeAbaChecklist(cliente) {
  const c = norm(cliente);
  if (c.includes("NORDEX")) return "Checklist_Nordex";
  if (c.includes("GE")) return "Checklist_GE";
  if (c.includes("SIEMENS")) return "Checklist_Siemens";
  return "Checklist_" + cliente.replace(/[^\w]/g, "_");
}

function gravarChecklistSnapshot(envio) {
  const ss = SpreadsheetApp.openById(ID_DESTINO);
  const sh = getOuCriaAba(ss, nomeAbaChecklist(envio.cliente), CAB_CHECKLIST);

  const dataEnvio = parseDataFlexivel(envio.data);
  const semana = getISOWeek(dataEnvio);
  const parque = String(envio.parque || "").trim();
  const responsavel = String(envio.responsavel || "").trim();

  const lastRow = sh.getLastRow();
  const dados = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, CAB_CHECKLIST.length).getValues() : [];

  // "estoque" (contagem) ou "entrada" (material recebido) — o app manda em envio.registro
  const tipo = norm(envio.registro) === "ENTRADA" ? "ENTRADA" : "ESTOQUE";

  (envio.itens || []).forEach(item => {
    const material = String(item.material || "").trim();
    if (!material) return;
    const qtd = Number(item.qtd) || 0;
    const unidade = String(item.unidade || "un");
    const lote = String(item.lote || "").trim();
    // Chega como AAAA-MM (campo month do app) e é gravado como texto MM/AAAA,
    // para o Sheets não converter em data e bagunçar o dia.
    const validade = formatarValidade_(item.validade);

    // Upsert por Semana + Parque + Material + TIPO. Sobrescreve (não soma), tanto
    // para estoque quanto para entrada — em ambos os casos o valor enviado é o
    // TOTAL daquela semana, então reenviar corrige em vez de duplicar.
    let linhaExistente = -1;
    for (let i = 0; i < dados.length; i++) {
      const tipoLinha = norm(dados[i][COL_TIPO]) === "ENTRADA" ? "ENTRADA" : "ESTOQUE";
      if (Number(dados[i][0]) === semana &&
          norm(dados[i][2]) === norm(parque) &&
          norm(dados[i][4]) === norm(material) &&
          tipoLinha === tipo) { linhaExistente = i; break; }
    }
    const novaLinha = [semana, dataEnvio, parque, responsavel, material, unidade, qtd, tipo, lote, validade];
    if (linhaExistente >= 0) {
      sh.getRange(linhaExistente + 2, 1, 1, CAB_CHECKLIST.length).setValues([novaLinha]);
      dados[linhaExistente] = novaLinha;
    } else {
      sh.appendRow(novaLinha);
      dados.push(novaLinha);
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  RECEBER — CALCULADORAS (aba única "Consumo_Reparos")
//  Colunas: ID | Data | Cliente | Parque | WTG | Blade | Técnico |
//           DataPesagem | TipoReparo | Categoria | Material | Quantidade_kg
// ═══════════════════════════════════════════════════════════
const CAB_CONSUMO = ["ID","Data","Cliente","Parque","WTG","Blade","Técnico","DataPesagem","TipoReparo","Categoria","Material","Quantidade_kg"];

function gravarConsumoCalculadora(linhas) {
  const ss = SpreadsheetApp.openById(ID_DESTINO);
  const sh = getOuCriaAba(ss, "Consumo_Reparos", CAB_CONSUMO);
  const registros = linhas.map(r => [
    r.id || "", r.data || "", r.cliente || "", r.projeto || "", r.wtg || "", r.blade || "",
    r.tecnico || "", r.dataPesagem || "", r.tipoReparo || "", r.categoria || "", r.material || "",
    Number(r.quantidade_kg) || 0
  ]);
  if (registros.length) sh.getRange(sh.getLastRow() + 1, 1, registros.length, CAB_CONSUMO.length).setValues(registros);
}

// ═══════════════════════════════════════════════════════════
//  LISTAR PARQUES (para o <datalist> das calculadoras)
//  Lê os nomes de parque únicos das 3 abas Checklist_* (semana mais recente).
// ═══════════════════════════════════════════════════════════
function listarNomesParques() {
  const ss = SpreadsheetApp.openById(ID_DESTINO);
  const nomes = new Set();
  ["Checklist_Nordex", "Checklist_GE", "Checklist_Siemens"].forEach(nomeAba => {
    const sh = getAba(ss, nomeAba);
    if (!sh || sh.getLastRow() < 2) return;
    const dados = sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues(); // coluna "Parque"
    dados.forEach(l => { const p = String(l[0]).trim(); if (p) nomes.add(p); });
  });
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
function listarParquesDebug() {
  avisar("Parques encontrados:\n\n" + listarNomesParques().join("\n"));
}

// ═══════════════════════════════════════════════════════════
//  1 — COMPARATIVOS POR PARQUE (uma aba por parque)
//      Lê as 3 abas Checklist_* combinadas, calcula Δ do mês
//      (primeira semana → semana atual), mesma formatação condicional
//      de antes (verde=subiu/chegou estoque, vermelho=desceu/consumiu).
// ═══════════════════════════════════════════════════════════
/* Nome de aba válido para o Google Sheets: sem os caracteres proibidos
   [ ] * ? / \ :, no máximo 31 caracteres e NUNCA em branco. */
function nomeAbaSeguro(nome) {
  const limpo = String(nome || "").replace(/[\[\]\*\?\/\\:]/g, "-").trim().substring(0, 31).trim();
  return limpo;   // string vazia = inválido; quem chama decide o que fazer
}

/* Lê as 3 abas de checklist. Linhas SEM parque ou SEM material são ignoradas
   (e contabilizadas), senão o atualizarTodosParques tentava criar uma aba com
   nome em branco e o Sheets recusava, derrubando a rotina inteira. */
var CHECKLIST_IGNORADAS = 0;
function lerChecklistCombinado() {
  const ss = SpreadsheetApp.openById(ID_DESTINO);
  const linhas = [];
  CHECKLIST_IGNORADAS = 0;
  [["Checklist_Nordex","Nordex"], ["Checklist_GE","GE Vernova"], ["Checklist_Siemens","Siemens Gamesa"]].forEach(([nomeAba, cliente]) => {
    const sh = getAba(ss, nomeAba);
    if (!sh || sh.getLastRow() < 2) return;
    const dados = sh.getRange(2, 1, sh.getLastRow() - 1, CAB_CHECKLIST.length).getValues();
    dados.forEach(l => {
      const parque = nomeAbaSeguro(l[2]);
      const material = String(l[4] || "").trim();
      if (!parque || !material) { CHECKLIST_IGNORADAS++; return; }   // registro incompleto
      // Linha antiga (sem a coluna Tipo) conta como ESTOQUE — compatibilidade
      const tipo = norm(l[COL_TIPO]) === "ENTRADA" ? "ENTRADA" : "ESTOQUE";
      linhas.push({ semana: Number(l[0]), data: parseDataFlexivel(l[1]), parque: parque,
                    material: material, qtd: Number(l[6]) || 0, tipo: tipo, cliente });
    });
  });
  return linhas;
}

function atualizarTodosParques() {
  const hoje = new Date(), ano = hoje.getFullYear(), mes = hoje.getMonth();
  const wkAtual = getISOWeek(hoje);
  const SEMANAS = getSemanasDoMes(ano, mes).filter(w => w <= wkAtual);
  const wkInicio = SEMANAS[0], wkFim = SEMANAS[SEMANAS.length - 1];
  const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  const todasLinhas = lerChecklistCombinado();
  const porParque = {};
  todasLinhas.forEach(l => { if (!porParque[l.parque]) porParque[l.parque] = []; porParque[l.parque].push(l); });

  const ssDest = SpreadsheetApp.openById(ID_DESTINO);
  let processados = 0;
  const erros = [];

  Object.keys(porParque).forEach(parque => {
    const linhasParque = porParque[parque];
    const materiais = [...new Set(linhasParque.map(l => l.material))];
    const semanasComDado = [...new Set(linhasParque.map(l => l.semana))].filter(w => SEMANAS.includes(w)).sort((a,b)=>a-b);
    if (!semanasComDado.length) { erros.push(parque + ": sem semanas no mês atual"); return; }

    const cabecalho = ["MATERIAL", ...semanasComDado.map(n => "W" + n), "Δ W" + wkFim + "−W" + wkInicio];
    const saida = [];
    materiais.forEach(mat => {
      const porSemana = {};
      linhasParque.filter(l => l.material === mat).forEach(l => { porSemana[l.semana] = l.qtd; });
      const valores = semanasComDado.map(w => porSemana[w] !== undefined ? porSemana[w] : "");
      const vIni = porSemana[semanasComDado[0]] || 0;
      const vFim = porSemana[semanasComDado[semanasComDado.length - 1]] || 0;
      saida.push([mat, ...valores, vFim - vIni]);
    });
    if (!saida.length) { erros.push(parque + ": sem materiais"); return; }

    const nomeAba = nomeAbaSeguro(parque);
    if (!nomeAba) { erros.push("(registro sem nome de parque) — ignorado"); return; }  // trava de segurança
    let sh = getAba(ssDest, nomeAba);
    if (!sh) sh = ssDest.insertSheet(nomeAba);
    sh.clearContents(); sh.clearConditionalFormatRules();

    sh.getRange(1,1).setValue(nomeAba + "  |  " + MESES_PT[mes] + ": W" + wkInicio + "→W" + wkFim + "  |  Atualizado: " + hoje.toLocaleDateString("pt-BR"))
      .setFontWeight("bold").setFontSize(11);
    sh.getRange(2, 1, 1, cabecalho.length).setValues([cabecalho]).setFontWeight("bold")
      .setBackground("#1c4587").setFontColor("#ffffff").setHorizontalAlignment("center");
    sh.getRange(3, 1, saida.length, saida[0].length).setValues(saida);
    for (let r = 0; r < saida.length; r++) if (r % 2 === 0) sh.getRange(3+r, 1, 1, saida[0].length).setBackground("#f8f9fa");

    const colDelta = cabecalho.length;
    const rangeDelta = sh.getRange(3, colDelta, saida.length, 1);
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground("#d9ead3").setFontColor("#274e13").setRanges([rangeDelta]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberEqualTo(0).setBackground("#f3f3f3").setFontColor("#999999").setRanges([rangeDelta]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setBackground("#fce8e6").setFontColor("#a61c00").setRanges([rangeDelta]).build()
    ]);
    sh.setFrozenRows(2); sh.autoResizeColumns(1, cabecalho.length);
    processados++;
  });

  avisar(
    "✅ Concluído!\n\n📅 " + MESES_PT[mes] + ": W" + wkInicio + " → W" + wkFim + "\n🏭 Parques atualizados: " + processados +
    (CHECKLIST_IGNORADAS ? "\n\n⚠️ " + CHECKLIST_IGNORADAS + " linha(s) do checklist ignorada(s) por estarem sem Parque ou sem Material.\n" +
      "Verifique as abas Checklist_* — provavelmente algum envio foi feito sem preencher o campo Parque/Projeto." : "") +
    (erros.length ? "\n\n⚠️ Problemas:\n" + erros.join("\n") : "")
  );
}

// ═══════════════════════════════════════════════════════════
//  2 — ANÁLISE CONSUMO REAL (Consumo_Reparos) vs Δ CHECKLIST
//      Limite de alerta: 20% de desvio.
// ═══════════════════════════════════════════════════════════
// [fragmento_material_da_calculadora → nome_exato_no_checklist]
// Mais específico PRIMEIRO — ver comentário original sobre por que
// a ordem importa (ex.: "TOP COAT 12" genérico capturaria o SBI).
const MAPA_MAT = [
  ["TOP COAT 12 RAL 3020 RED",  "TOP COAT 12 RAL 3020 RED"],
  ["TOP COAT 12 RED 3020",      "TOP COAT 12 RED 3020"],
  ["BLADEREP HARDENER FILLER",  "ENDURECEDOR PUTTY PROFILE FILLER 3"],
  ["BLADEREP PROFILE FILLER",   "BASE PUTTY PROFILE FILLER 3"],
  ["BLADEREP HARDENER 12",      "HARDENER 12 - ALEXIT / MANKIEWICZ - 3 KG"],
  ["BLADEREP TOPCOAT 12",       "TOP COAT 12 - ALEXIT / MANKIEWICZ - 12 KG"],
  ["ALEXIT PROFILE FILLER 3",   "BASE PUTTY PROFILE FILLER 3"],
  ["ENDURECEDOR FILLER 3",      "ENDURECEDOR PUTTY PROFILE FILLER 3"],
  ["HARDENER FILLER 3",         "ENDURECEDOR PUTTY PROFILE FILLER 3"],
  ["PROFILE FILLER 3",          "BASE PUTTY PROFILE FILLER 3"],
  ["HARDENER12",                "HARDENER 12 - ALEXIT / MANKIEWICZ - 3 KG"],
  ["TOP COAT 12",                "TOP COAT 12 - ALEXIT / MANKIEWICZ - 12 KG"],
  ["TOPCOAT 12",                "TOP COAT 12 - ALEXIT / MANKIEWICZ - 12 KG"],
  ["THINNER 12",                "THINNER - MANKIEWICZ - 1 KG"],
  ["THINNER MANKIEWICZ",        "THINNER - MANKIEWICZ - 1 KG"],
  ["LH637",                     "ENDURECEDOR LH 635"],
  ["LH635",                     "ENDURECEDOR LH 635"],
  ["LR635",                     "RESINA LR 635"],
  ["137GF",                     "EPOXY ENDURECEDOR 137GF"],
  ["135G3",                     "ADESIVO EPOXY 135G3"],
  ["BPR 135",                   "ADESIVO EPOXY 135G3"],
  ["BPH 137",                   "EPOXY ENDURECEDOR 137GF"],
  ["TRIAX 1200",                "TRIAX 1200"],
  ["BIAX 830",                  "TECIDO BIAX 830"],
  ["BIAX 750",                  "TECIDO BIAX 750"],
  ["BIAX 450",                  "TECIDO BIAX 450"],
  ["UD 1000",                   "TECIDO UD 1000"],
  ["UD 661",                    "TECIDO UD 661"],
  ["BIZERO 750",                "TECIDO BIZERO 750"],
  ["CSM 300",                   "CSM 300"],
  ["BALSA CORE 15",             "BALSA CORE 15/20MM"],
  ["BALSA CORE 50",             "BALSA CORE 50"],
  ["ESPUMA FLEXIVEL DE PVC",    "ESPUMA FLEXÍVEL DE PVC H60 GS 20MM"],
  ["ESPUMA 20MM",               "ESPUMA FLEXÍVEL DE PVC H60 GS 20MM"],

  // ── GE — SikaBiresin CH910 (renomeado no checklist: era "SIKABRESIN CR90"/"CH9100p") ──
  ["SIKABIRESIN CH910-1 COM AEROSIL - ENDURECEDOR", "ENDURECEDOR SIKABIRESIN CH910"],
  ["SIKABIRESIN CH910-1 (RAPIDO) - ENDURECEDOR",    "ENDURECEDOR SIKABIRESIN CH910"],
  ["SIKABIRESIN CH910 HARDENER",                    "ENDURECEDOR SIKABIRESIN CH910"],
  ["SIKABIRESIN CH910-1 COM AEROSIL",               "RESINA SIKABIRESIN CH910"],
  ["SIKABIRESIN CH910-1 (RAPIDO)",                  "RESINA SIKABIRESIN CH910"],
  ["SIKABIRESIN CH910-5",                           "RESINA SIKABIRESIN CH910"],
  ["ADESIVO DE COLAGEM G3 - ENDURECEDOR",           "EPOXY ENDURECEDOR 137GF"],
  ["ADESIVO DE COLAGEM G3",                         "ADESIVO EPOXY 135G3"],
  ["ENDURECEDOR G3",                                "EPOXY ENDURECEDOR 137GF"],
  ["HEXION LR135",                                  "RESINA LR-135"],
  ["ENDURECEDOR HEXION",                            "ENDURECEDOR LH-135"],

  // ── Siemens ── (confirmados pelo engenheiro: mesmo material, marca trocada)
  ["POLYLITE M413",             "RESINA AROPOL 70452"],
  ["MEKP BUTANOX M-50",         "ENDURECEDOR BUTANOX M-50"],
  ["ALEXIT TOPCOAT 12",         "TOP COAT 12 - ALEXIT / MANKIEWICZ - 12 KG"],
  ["CRYSTIC X401",              "BASE MASSA - CRYSTIC X401"],
  ["CRYSTIC RAL 7035",          "BASE GEL COAT - CRYSTIC RAL 7035"],
  ["SIKAFORCE-818 L07",         "BASE ADESIVO - SIKAFORCE-818 L07"],
  ["SIKAFORCE-050",             "ENDURECEDOR ADESIVO - SIKAFORCE-050"],
  // "MEKP" sozinho (sem marca) é usado em Massa Putty e Gel Coat também —
  // fica de fora do mapa automático por ser ambíguo; considerar renomear
  // no futuro para algo mais específico (ex.: "MEKP MASSA"/"MEKP GEL COAT").
];

function traduzirMaterial(matNorm) {
  for (const [frag, dest] of MAPA_MAT) if (matNorm.includes(norm(frag))) return norm(dest);
  return matNorm;
}

/* ═══════════════════════════════════════════════════════════
   CONSUMO SEGUNDO O CHECKLIST — com ENTRADA de material

   Fórmula:
       consumido = estoque_inicial + entradas − estoque_final

   O "+ entradas" é essencial: se o parque recebeu material no meio do
   período, o estoque final sobe e, SEM contar a entrada, o sistema
   entenderia isso como "consumo negativo" (sobra) e acusaria divergência
   onde não existe nenhuma.

   Retorna null quando o material não tem nenhuma contagem na janela.
   Retorna {semBase:true} quando só existe UMA contagem — nesse caso não há
   como medir variação, e isso NÃO é o mesmo que consumo zero.
   ═══════════════════════════════════════════════════════════ */
function consumoPeloChecklist(linhas, parque, material, semanasJanela, dataInicioJanela, permitirBaseAnterior) {
  const doMat = linhas.filter(l => l.parque === parque && l.material === material)
    .sort((a, b) => (a.data - b.data) || (a.semana - b.semana));

  const estoques = doMat.filter(l => l.tipo === "ESTOQUE");
  const naJanela = estoques.filter(l => semanasJanela.indexOf(l.semana) >= 0);
  if (!naJanela.length) return null;

  const fim = naJanela[naJanela.length - 1];
  let base = null, baseForaDaJanela = false;

  if (naJanela.length >= 2) {
    base = naJanela[0];
  } else if (permitirBaseAnterior) {
    const antes = estoques.filter(l => semanasJanela.indexOf(l.semana) < 0 && l.data < dataInicioJanela);
    if (antes.length) { base = antes[antes.length - 1]; baseForaDaJanela = true; }
  }

  if (!base) {
    return { semBase: true, semanas: [fim.semana], estoqueFinal: fim.qtd };
  }

  // Entradas contam a partir da semana SEGUINTE à contagem base, até a semana
  // da contagem final. Entradas anteriores à base já estão embutidas no estoque
  // base — incluí-las causaria contagem dupla.
  const entradas = doMat
    .filter(l => l.tipo === "ENTRADA" && l.semana > base.semana && l.semana <= fim.semana)
    .reduce((s, l) => s + l.qtd, 0);

  return {
    semBase: false,
    estoqueInicial: base.qtd,
    estoqueFinal: fim.qtd,
    entradas: entradas,
    consumido: base.qtd + entradas - fim.qtd,
    deltaEstoque: fim.qtd - base.qtd,
    semanas: [base.semana, fim.semana],
    baseForaDaJanela: baseForaDaJanela
  };
}

/* Consumo real vindo das calculadoras (aba Consumo_Reparos), somado por
   parque + material (com o nome já traduzido para a grafia do checklist). */
function consumoRealPorParque(dataInicio, dataFim) {
  const ss = SpreadsheetApp.openById(ID_DESTINO);
  const sh = getAba(ss, "Consumo_Reparos");
  const mapa = {};
  if (!sh || sh.getLastRow() < 2) return mapa;
  const grid = sh.getRange(2, 1, sh.getLastRow() - 1, CAB_CONSUMO.length).getValues();
  grid.forEach(ln => {
    const dataStr = ln[1], parque = ln[3], material = ln[10], qtdKg = ln[11];
    if (!material) return;
    const dt = parseDataFlexivel(dataStr);
    if (dt < dataInicio || dt > dataFim) return;
    const pNorm = norm(parque);
    const matTrad = traduzirMaterial(norm(material));
    if (!mapa[pNorm]) mapa[pNorm] = {};
    mapa[pNorm][matTrad] = (mapa[pNorm][matTrad] || 0) + (Number(qtdKg) || 0);
  });
  return mapa;
}

function segundaDaSemanaISO(ano, semana) {
  const jan4 = new Date(ano, 0, 4);
  const seg1 = new Date(jan4); seg1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const r = new Date(seg1); r.setDate(seg1.getDate() + (semana - 1) * 7); r.setHours(0, 0, 0, 0);
  return r;
}

/* ═══════════════════════════════════════════════════════════
   MOTOR DAS ANÁLISES — usado pelas duas abas.
   permitirBaseAnterior = false → só compara DENTRO do mês (1ª→última semana)
   permitirBaseAnterior = true  → aceita a última contagem do mês anterior
   ═══════════════════════════════════════════════════════════ */
function gerarAnalise(abaSaida, tituloAba, permitirBaseAnterior) {
  const LIMITE_PERCENTUAL = 0.20; // 20%
  const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  const hoje = new Date(), ano = hoje.getFullYear(), mes = hoje.getMonth();
  const SEMANAS = getSemanasDoMes(ano, mes).filter(w => w <= getISOWeek(hoje));
  const wkInicio = SEMANAS[0], wkFim = SEMANAS[SEMANAS.length - 1];

  const dataInicio = segundaDaSemanaISO(ano, wkInicio);
  const dataFim = segundaDaSemanaISO(ano, wkFim);
  dataFim.setDate(dataFim.getDate() + 6); dataFim.setHours(23, 59, 59, 999);

  const todasLinhas = lerChecklistCombinado();
  const consumoMap = consumoRealPorParque(dataInicio, dataFim);

  // parques/materiais conhecidos pelo checklist
  const parquesChecklist = {};
  todasLinhas.forEach(l => {
    if (!parquesChecklist[l.parque]) parquesChecklist[l.parque] = {};
    parquesChecklist[l.parque][l.material] = true;
  });

  // pré-calcula o consumo pelo checklist, indexado por parque -> material normalizado
  const checklistMap = {};
  Object.keys(parquesChecklist).forEach(parque => {
    checklistMap[parque] = {};
    Object.keys(parquesChecklist[parque]).forEach(mat => {
      const r = consumoPeloChecklist(todasLinhas, parque, mat, SEMANAS, dataInicio, permitirBaseAnterior);
      if (r) checklistMap[parque][norm(mat)] = r;
    });
  });

  const saida = [];
  Object.keys(consumoMap).forEach(parqueNorm => {
    const parqueChecklist = Object.keys(checklistMap).find(p =>
      norm(p) === parqueNorm || parqueNorm.indexOf(norm(p)) >= 0 || norm(p).indexOf(parqueNorm) >= 0);
    const bloco = parqueChecklist ? checklistMap[parqueChecklist] : {};
    const nomeParque = parqueChecklist || parqueNorm;

    Object.keys(consumoMap[parqueNorm]).forEach(matTrad => {
      const consumoReal = consumoMap[parqueNorm][matTrad] || 0;
      const r = bloco[matTrad];

      if (!r) {
        saida.push([nomeParque, matTrad, "—", "—", "—", consumoReal, "—",
          "Material não encontrado no checklist deste parque"]);
        return;
      }
      if (r.semBase) {
        saida.push([nomeParque, matTrad, r.estoqueFinal, "—", "—", consumoReal, "—",
          "Só 1 contagem (W" + r.semanas[0] + ") — precisa de contagem em 2 semanas para comparar"]);
        return;
      }
      const diferenca = consumoReal - r.consumido;
      let obs = "W" + r.semanas[0] + "→W" + r.semanas[1];
      if (r.baseForaDaJanela) obs += " (base: última contagem antes do mês)";
      if (r.entradas > 0) obs += " · entrada de " + r.entradas + " descontada";
      saida.push([nomeParque, matTrad, r.estoqueInicial, r.entradas, r.estoqueFinal,
                  consumoReal, diferenca, obs]);
    });
  });

  const ss = SpreadsheetApp.openById(ID_DESTINO);
  if (!saida.length) {
    avisar("❌ " + abaSaida + ": nenhum dado gerado.\n\n" +
      "Não há consumo registrado pelas calculadoras no período " +
      dataInicio.toLocaleDateString("pt-BR") + " a " + dataFim.toLocaleDateString("pt-BR") + ".");
    return { linhas: 0, divergentes: 0, semBase: 0 };
  }

  let sh = getAba(ss, abaSaida);
  if (!sh) sh = ss.insertSheet(abaSaida);
  sh.clearContents(); sh.clearConditionalFormatRules();

  sh.getRange(1, 1).setValue(tituloAba + "  |  " + MESES_PT[mes] + ": W" + wkInicio + "→W" + wkFim +
      "  |  " + dataInicio.toLocaleDateString("pt-BR") + " a " + dataFim.toLocaleDateString("pt-BR") +
      "  |  Atualizado: " + hoje.toLocaleDateString("pt-BR"))
    .setFontWeight("bold").setFontSize(11);

  const cab = ["PARQUE", "MATERIAL",
    "Estoque\nW" + wkInicio, "Entrada\n(recebido)", "Estoque\nW" + wkFim,
    "Consumo Reparo\n(calculadora)", "Diferença\n(Reparo − Checklist)", "Obs"];
  sh.getRange(2, 1, 1, cab.length).setValues([cab]).setFontWeight("bold")
    .setBackground("#1c4587").setFontColor("#ffffff").setHorizontalAlignment("center").setWrap(true);
  sh.setRowHeight(2, 46);
  sh.getRange(3, 1, saida.length, saida[0].length).setValues(saida);
  for (let r = 0; r < saida.length; r++)
    if (r % 2 === 0) sh.getRange(3 + r, 1, 1, saida[0].length).setBackground("#f8f9fa");

  // Colore a coluna "Diferença" (col 7). Linhas sem base ficam CINZA — não são
  // divergência, são "ainda não dá para avaliar".
  const coresFundo = [], coresFonte = [];
  let semBase = 0, divergentes = 0;
  saida.forEach(linha => {
    const consumidoChecklist = (typeof linha[2] === "number" && typeof linha[4] === "number")
      ? (linha[2] + (Number(linha[3]) || 0) - linha[4]) : null;
    const diferenca = linha[6];
    if (consumidoChecklist === null || typeof diferenca !== "number") {
      semBase++;
      coresFundo.push(["#f3f3f3"]); coresFonte.push(["#999999"]);
      return;
    }
    const denom = Math.abs(consumidoChecklist);
    const percentual = denom === 0 ? (diferenca === 0 ? 0 : Infinity) : Math.abs(diferenca) / denom;
    const foraDoLimite = percentual > LIMITE_PERCENTUAL;
    if (foraDoLimite) divergentes++;
    coresFundo.push([foraDoLimite ? "#fce8e6" : "#d9ead3"]);
    coresFonte.push([foraDoLimite ? "#a61c00" : "#274e13"]);
  });
  sh.getRange(3, 7, saida.length, 1).setBackgrounds(coresFundo).setFontColors(coresFonte);

  // Destaca em azul as entradas de material, para não se confundir com consumo
  const coresEntrada = saida.map(l => [(Number(l[3]) || 0) > 0 ? "#e8f0fe" : null]);
  sh.getRange(3, 4, saida.length, 1).setBackgrounds(coresEntrada);

  sh.setFrozenRows(2); sh.autoResizeColumns(1, cab.length);
  return { linhas: saida.length, divergentes: divergentes, semBase: semBase };
}

/* ═══════════════════════════════════════════════════════════
   ANÁLISE PRINCIPAL — 1ª → última semana DO MESMO MÊS (estrita).
   É o rastreamento que o engenheiro considera mais importante.
   ═══════════════════════════════════════════════════════════ */
function analisarMensal() {
  const r = gerarAnalise("Análise Mensal", "Consumo Real vs Checklist — 1ª→última semana do mês", false);
  if (!r.linhas) return;
  avisar("✅ Análise Mensal gerada!\n\n" +
    "📦 " + r.linhas + " linha(s) — limite de alerta: 20%\n" +
    "🔴 " + r.divergentes + " com divergência acima do limite\n" +
    (r.semBase ? "⬜ " + r.semBase + " sem base (só 1 contagem no mês)\n" : "") +
    "📋 Aba: Análise Mensal\n\n" +
    "Compara SOMENTE contagens do mês corrente (1ª → última semana).");
}

/* ═══════════════════════════════════════════════════════════
   ANÁLISE COMPLEMENTAR — aceita a última contagem do mês anterior
   como base, para não ficar sem comparação na 1ª semana do mês.
   ═══════════════════════════════════════════════════════════ */
function analisarConsumoVsDelta() {
  const r = gerarAnalise("Análise vs Realizado", "Consumo Real vs Checklist — com base do mês anterior", true);
  if (!r.linhas) return;
  avisar("✅ Análise vs Realizado gerada!\n\n" +
    "📦 " + r.linhas + " linha(s) — limite de alerta: 20%\n" +
    "🔴 " + r.divergentes + " com divergência acima do limite\n" +
    (r.semBase ? "⬜ " + r.semBase + " sem base de comparação\n" : "") +
    "📋 Aba: Análise vs Realizado\n\n" +
    "Quando o mês tem só 1 contagem, usa a última contagem do mês anterior como base.");
}

// ═══════════════════════════════════════════════════════════
//  RODAR TUDO + ACIONADOR
// ═══════════════════════════════════════════════════════════
function executarTudo() {
  const falhas = [];
  try { atualizarTodosParques(); } catch (e) { falhas.push("atualizarTodosParques: " + e.message); }
  try { analisarMensal(); }        catch (e) { falhas.push("analisarMensal: " + e.message); }
  try { analisarConsumoVsDelta(); } catch (e) { falhas.push("analisarConsumoVsDelta: " + e.message); }
  try { verificarValidades(); }     catch (e) { falhas.push("verificarValidades: " + e.message); }
  avisar(falhas.length ? "⚠️ Concluído com erros:\n\n" + falhas.join("\n") : "✅ Tudo atualizado.");
}
// ═══════════════════════════════════════════════════════════
//  CONTROLE DE VALIDADE DOS LOTES
//
//  De onde vem o dado: toda linha de ENTRADA das abas Checklist_* que tiver
//  Lote/Validade preenchidos (só material perecível — resina, endurecedor,
//  adesivo, massa, tinta, diluente; núcleo e tecido não têm validade).
//
//  O que faz:
//   1. monta/atualiza a aba "Alerta_Validade" com TODOS os lotes, ordenados do
//      mais crítico para o menos, com dias restantes e situação colorida;
//   2. manda e-mail quando houver lote VENCIDO ou a 30 dias ou menos —
//      SOMENTE de parque que ainda esteja mandando dado (ver parquesAtivos_).
//      Parque desmobilizado continua na aba, em cinza, sem gerar e-mail.
//
//  Anti-spam: o e-mail só sai quando a lista de críticos MUDA. Um lote parado
//  em 25 dias não gera 25 e-mails — avisa quando entra na janela e de novo
//  quando vence. A assinatura da última lista fica em Propriedades do script.
//
//  Para quem vai o e-mail: propriedade EMAIL_ALERTA (aceita vários separados
//  por vírgula). Sem ela, vai para o dono da planilha.
// ═══════════════════════════════════════════════════════════
const DIAS_ALERTA = 30;
const SEMANAS_ATIVIDADE = 2;   // janela de atividade do parque (fora a semana atual)
const CAB_VALIDADE = ["Situação", "Dias restantes", "Validade", "Material", "Lote",
                      "Cliente", "Parque", "QTD", "Unidade", "Semana", "Data da entrada",
                      "Projeto ativo"];

/* ── Quem recebe cobrança de validade ──────────────────────────────────────
   Só parque com obra andando. Se a equipe já desmobilizou, aquele estoque não
   é mais problema de ninguém em campo e o e-mail viraria ruído — o lote segue
   registrado na aba, só não gera cobrança.

   Ativo = tem QUALQUER envio de checklist (estoque ou entrada) na semana atual
   ou nas SEMANAS_ATIVIDADE anteriores. A semana atual entra junto porque o
   envio costuma ser no fim da semana: exigir registro só nas semanas passadas
   silenciaria justamente o parque que acabou de mandar dado hoje.

   A conta é por DATA (segunda-feira da semana ISO), não por número de semana:
   comparar 52 com 1 na virada do ano daria resultado errado. */
function inicioSemanaISO_(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));   // recua até a segunda-feira
  return x;
}

/** { PARQUE_NORMALIZADO: true } dos parques com registro dentro da janela. */
function parquesAtivos_() {
  const limite = inicioSemanaISO_(new Date());
  limite.setDate(limite.getDate() - 7 * SEMANAS_ATIVIDADE);
  const ss = SpreadsheetApp.openById(ID_DESTINO);
  const ativos = {};
  ss.getSheets().forEach(sh => {
    if (sh.getName().indexOf("Checklist_") !== 0) return;
    const ultima = sh.getLastRow();
    if (ultima < 2) return;
    sh.getRange(2, 1, ultima - 1, CAB_CHECKLIST.length).getValues().forEach(l => {
      const parque = String(l[2] || "").trim();
      if (!parque) return;
      const d = parseDataFlexivel(l[1]);
      if (d && d >= limite) ativos[norm(parque)] = true;
    });
  });
  return ativos;
}

/** "MM/AAAA" -> último dia daquele mês (é até quando o lote vale). */
function fimDaValidade_(txt) {
  const m = String(txt || "").trim().match(/^(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mes = Number(m[1]), ano = Number(m[2]);
  if (!mes || mes > 12 || !ano) return null;
  return new Date(ano, mes, 0, 23, 59, 59);   // dia 0 do mês seguinte
}

function diasAte_(data) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.floor((data - hoje) / 86400000);
}

/** Varre as abas Checklist_* e devolve um lote por linha de ENTRADA com validade. */
function coletarLotes_() {
  const ss = SpreadsheetApp.openById(ID_DESTINO);
  const out = [];
  ss.getSheets().forEach(sh => {
    const nome = sh.getName();
    if (nome.indexOf("Checklist_") !== 0) return;
    const cliente = nome.replace("Checklist_", "").replace(/_/g, " ");
    const ultima = sh.getLastRow();
    if (ultima < 2) return;
    const dados = sh.getRange(2, 1, ultima - 1, CAB_CHECKLIST.length).getValues();
    dados.forEach(l => {
      if (norm(l[COL_TIPO]) !== "ENTRADA") return;          // só material recebido
      const validade = String(l[COL_VALIDADE] || "").trim();
      const lote = String(l[COL_LOTE] || "").trim();
      if (!validade) return;                                 // sem validade, nada a controlar
      const fim = fimDaValidade_(validade);
      if (!fim) return;
      out.push({
        dias: diasAte_(fim), validade: validade, material: String(l[4] || ""), lote: lote,
        cliente: cliente, parque: String(l[2] || ""), qtd: Number(l[6]) || 0,
        unidade: String(l[5] || ""), semana: l[0], dataEntrada: l[1]
      });
    });
  });
  out.sort((a, b) => a.dias - b.dias);                       // mais crítico primeiro
  return out;
}

function situacaoLote_(dias) {
  if (dias < 0) return "VENCIDO";
  if (dias <= DIAS_ALERTA) return "VENCE EM BREVE";
  return "OK";
}

function verificarValidades() {
  const lotes = coletarLotes_();
  const ss = SpreadsheetApp.openById(ID_DESTINO);
  const sh = getOuCriaAba(ss, "Alerta_Validade", CAB_VALIDADE);

  // Limpa o corpo e regrava (a aba é sempre um retrato do momento)
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, CAB_VALIDADE.length).clearContent();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, CAB_VALIDADE.length).setBackground(null);

  if (!lotes.length) {
    avisar("Controle de validade: nenhum lote com validade registrada ainda.\n\n"
         + "Os lotes aparecem aqui conforme as ENTRADAS de material perecível forem enviadas pelo checklist.");
    return { total: 0, criticos: 0 };
  }

  // Parque parado não gera e-mail — mas continua listado, com a coluna dizendo por quê
  const ativos = parquesAtivos_();
  lotes.forEach(l => { l.ativo = !!ativos[norm(l.parque)]; });

  const linhas = lotes.map(l => [situacaoLote_(l.dias), l.dias, l.validade, l.material, l.lote,
                                 l.cliente, l.parque, l.qtd, l.unidade, l.semana, l.dataEntrada,
                                 l.ativo ? "SIM" : "NÃO"]);
  sh.getRange(2, 1, linhas.length, CAB_VALIDADE.length).setValues(linhas);

  // Cor por situação — vermelho vencido, âmbar na janela de alerta, verde ok.
  // Parque inativo fica cinza: está registrado, mas não cobra ninguém.
  linhas.forEach((l, i) => {
    const cor = l[11] === "NÃO" ? "#efefef"
              : (l[0] === "VENCIDO" ? "#f4cccc" : (l[0] === "VENCE EM BREVE" ? "#fce5cd" : "#d9ead3"));
    sh.getRange(i + 2, 1, 1, CAB_VALIDADE.length).setBackground(cor);
  });
  sh.autoResizeColumns(1, CAB_VALIDADE.length);

  const criticos = lotes.filter(l => l.dias <= DIAS_ALERTA);
  const paraEmail = criticos.filter(l => l.ativo);
  if (paraEmail.length) enviarEmailValidade_(paraEmail);
  else if (criticos.length) {
    Logger.log("Validade: " + criticos.length + " lote(s) crítico(s), mas nenhum em parque ativo nas últimas "
             + SEMANAS_ATIVIDADE + " semanas — e-mail não enviado.");
  }

  const silenciados = criticos.length - paraEmail.length;
  avisar("✅ Controle de validade atualizado.\n\n"
       + lotes.length + " lote(s) registrado(s)\n"
       + criticos.filter(l => l.dias < 0).length + " vencido(s)\n"
       + criticos.filter(l => l.dias >= 0).length + " vencendo em " + DIAS_ALERTA + " dias ou menos\n"
       + (silenciados > 0 ? ("\n" + silenciados + " crítico(s) em parque sem movimento — sem e-mail") : ""));
  return { total: lotes.length, criticos: criticos.length, email: paraEmail.length };
}

/** E-mail só quando a lista de críticos muda (evita repetir o mesmo aviso todo dia). */
function enviarEmailValidade_(criticos) {
  const props = PropertiesService.getScriptProperties();
  const assinatura = criticos.map(l => l.material + "|" + l.lote + "|" + l.validade + "|" + situacaoLote_(l.dias)).join(";");
  if (props.getProperty("ULTIMO_ALERTA_VALIDADE") === assinatura) {
    Logger.log("Alerta de validade: lista igual à do último envio — e-mail não repetido.");
    return;
  }

  const para = (props.getProperty("EMAIL_ALERTA") || Session.getEffectiveUser().getEmail() || "").trim();
  if (!para) { Logger.log("Alerta de validade: sem destinatário (defina EMAIL_ALERTA)."); return; }

  const vencidos = criticos.filter(l => l.dias < 0);
  const proximos = criticos.filter(l => l.dias >= 0);
  const linha = l => "• " + l.material + "  —  lote " + (l.lote || "(sem lote)")
    + "  —  validade " + l.validade
    + (l.dias < 0 ? ("  —  VENCIDO há " + Math.abs(l.dias) + " dia(s)") : ("  —  faltam " + l.dias + " dia(s)"))
    + "  —  " + l.qtd + " " + l.unidade + "  —  " + l.parque + " (" + l.cliente + ")";

  let corpo = "Controle de validade de material — Extreme Wind\n\n";
  if (vencidos.length) corpo += "VENCIDOS (" + vencidos.length + "):\n" + vencidos.map(linha).join("\n") + "\n\n";
  if (proximos.length) corpo += "VENCENDO EM " + DIAS_ALERTA + " DIAS OU MENOS (" + proximos.length + "):\n"
                              + proximos.map(linha).join("\n") + "\n\n";
  corpo += "Detalhe completo na aba \"Alerta_Validade\" da planilha:\n"
         + ss_url_() + "\n\nMensagem automática — não responda.";

  const assunto = "[EW] " + (vencidos.length ? vencidos.length + " lote(s) VENCIDO(S)" : "")
    + (vencidos.length && proximos.length ? " e " : "")
    + (proximos.length ? proximos.length + " vencendo em " + DIAS_ALERTA + " dias" : "");

  MailApp.sendEmail({ to: para, subject: assunto, body: corpo });
  props.setProperty("ULTIMO_ALERTA_VALIDADE", assinatura);
  Logger.log("Alerta de validade enviado para " + para);
}

function ss_url_() {
  try { return SpreadsheetApp.openById(ID_DESTINO).getUrl(); } catch (e) { return "(planilha)"; }
}

function configurarAcionador() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (["atualizarTodosParques","analisarConsumoVsDelta","executarTudo"].includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("executarTudo").timeBased().everyDays(1).atHour(20).create();
  avisar("✅ Acionador configurado!\n\n🕗 Todos os dias às 20:00 — roda tudo automaticamente.");
}
