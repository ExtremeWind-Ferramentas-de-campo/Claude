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
//  PREÇO UNITÁRIO (R$) — é daqui que sai todo valor em reais
//
//  FONTE: lista mestra de materiais (colunas TIPO / ID / QUÍMICOS E
//  CONSUMÍVEIS / UM / CLASSE / DEMANDA / ESTOQUE ATUAL / ÚLTIMA COMPRA),
//  conferida com a engenharia em 26/08/2026. O valor usado é o da
//  ÚLTIMA COMPRA. Onde a lista mestra não tem o item, ficou o valor da lista
//  Siemens ("ACOMPANHAMENTO DE MATERIAIS GAMESA") — está marcado item por item.
//
//  A CHAVE é o nome do material NA GRAFIA DO CHECKLIST. Na lista mestra quase
//  nenhum nome é igual (ela diz "TRIAX 1170/1200G", o checklist diz
//  "TRIAX 1200"), então o nome de lá vai no comentário ao lado, com o ID, para
//  dar para conferir. A busca passa por norm(), e o material que vem da
//  CALCULADORA é traduzido por traduzirMaterial() antes — uma tabela serve às
//  duas fontes.
//
//  PREÇO É POR UNIDADE DA PLANILHA: kg para químico, m² para tecido e núcleo,
//  m para mangueira e tubo, un para o resto. A quantidade do checklist já vem
//  nessa unidade (o app fixa a unidade pela planilha), então é multiplicação
//  direta.
//
//  A TABELA É POR CLIENTE porque a lista Siemens tem preço próprio de alguns
//  itens (CYTEC e TYVEK, que não estão na lista mestra). Onde a lista mestra
//  tem o item, os dois clientes usam o MESMO valor dela.
//
//  ⚠️ FALTAM 4 ITENS (3 na Nordex/GE, 1 na Siemens), listados no fim de cada
//  tabela. O que falta aparece na aba de gasto, no bloco "MATERIAIS SEM PREÇO",
//  com o consumo certo e gasto zero — nunca escondido. Enquanto houver nome
//  nesse bloco, o total em R$ está subestimado.
//
//  PARA ATUALIZAR: mexa só nos números. Nome novo precisa bater com a grafia
//  do checklist.html.
// ═══════════════════════════════════════════════════════════
const PRECO_NORDEX_GE = {
  /* ── tecidos e núcleo ── */
  "TRIAX 1200":                                        39.32,   /* 169 TRIAX 1170/1200G */
  "TECIDO BIAX 830":                                   39.14,   /* 160 TECIDO BIAX 830 */
  "TECIDO BIAX 450":                                   44.20,   /* 335 MATERIAL COMBINADO X1300 - BIAX 450G */
  "TECIDO UD 1000":                                    36.82,   /* 174 TECIDO UD 1000 */
  "TECIDO UD 661":                                     44.20,   /* 337 TECIDO UNIDIRECIONAL 661 - GAMESA */
  "TECIDO BIZERO 750":                                 37.80,   /* 367 TECIDO TRIAXIAL TV1800 - TRIAX 750 BIZERO */
  "COMBI 900":                                         44.20,   /* 334 COMBI 900. A lista traz esse valor em
                                                                   METRO e o checklist conta em KG: a
                                                                   engenharia confirmou (26/08/2026) que para
                                                                   este material metro e quilo são
                                                                   equivalentes, então o valor serve nas duas
                                                                   unidades sem conversão. */
  "CSM 300":                                           22.00,   /* 253 CSM 300 */
  "NYLON":                                             11.27,   /* 177 NYLON */
  "BALSA CORE 15/20MM":                               445.06,   /* 168 BALSA CORE 15MM */
  "ESPUMA FLEXÍVEL DE PVC H60 GS 20MM":               285.24,   /* 540 ESPUMA DE PVC H60 GS 20MM 1200x800 FLEXÍVEL */
  "ESPUMA FLEXÍVEL PET FOAM 50MM":                   1130.49,   /* 362 ESPUMA 45MM 1.500x1.000 */
  /* ── consumível de infusão ── */
  "FILME PARA VÁCUO — FLEXNYL-WM / V-SHEET (75MY X2)": 11.70,   /* 241 */
  "PLÁSTICO PERFURADO AZUL":                            0.10,   /* 107 */
  "MANGUEIRA DE VÁCUO — VACUUMKLEER 090-16":            2.00,   /* 245 */
  "REGISTRO DE ESFERA PLÁSTICO":                        5.80,   /* 240 */
  "CONEXÃO INFUSÃO T PLÁSTICA":                         4.50,   /* 242 */
  "TUBO ESPIRAL":                                       7.23,   /* 178 */
  "BAMBAM — MAP TAPE 12N (3MM × 12MM × 15M)":          73.00,   /* 247 */
  /* ── químicos ── */
  "ENDURECEDOR LH-637":                               286.38,   /* 708 ENDURECEDOR LH637. Entrou em 27/08/2026
                                                                   no lugar do par LR-135 / LH-135, que a
                                                                   própria lista já marcava DESCONTINUADA. */
  "RESINA SIKABIRESIN CH910":                         315.37,   /* 271 RESINA SIKABRESIN CR910 */
  "ENDURECEDOR SIKABIRESIN CH910":                    366.98,   /* 272 ENDURECEDOR SIKA CH910 */
  "ADESIVO EPOXY 135G3":                              313.52,   /* 20 */
  "EPOXY ENDURECEDOR 137GF":                          303.65,   /* 53 */
  "RESINA LR 635":                                    278.47,   /* 378 */
  "ENDURECEDOR LH 635":                               287.23,   /* 379 ENDURECEDOR LH635 */
  "ENDURECEDOR PUTTY PROFILE FILLER 3":               250.93,   /* 270 END PUTTY PRO FILLER 3 */
  "BASE PUTTY PROFILE FILLER 3":                      260.01,   /* 212 PUTTING PRO FILLER 3 */
  "TOP COAT 12 — ALEXIT / Mankiewicz — 12 kg":        298.11,   /* 143 */
  "HARDENER 12 — ALEXIT / Mankiewicz — 3 kg":         438.42,   /* 67 */
  "THINNER — Mankiewicz — 1 kg":                      257.34,   /* 140 */
  "TOP COAT 12 RAL 7035 (GRAY)":                      392.40,   /* 348 TOP COAT 12 RAL 3020 - MANKIEWICZ. A
                                                                   lista só tem o vermelho; a engenharia
                                                                   (27/08/2026) fixou o cinza como referência
                                                                   e mandou o vermelho seguir ele. Como o
                                                                   único valor de nota é esse, os dois ficam
                                                                   iguais — o que muda é qual manda se um dia
                                                                   aparecer preço próprio de um deles. */
  "TOP COAT 12 RAL 3020 (RED)":                       392.40,   /* = o cinza acima, por decisão de 27/08/2026 */
  /* ── ferramenta e consumível de oficina ── */
  "LOCTITE-243":                                      169.90,   /* 365 LOCTITE 243 */
  "ÓLEO BOMBA DE VÁCUO":                               66.89,   /* 535 ÓLEO P/ BOMBA DE VÁCUO 1L */
  "FITA CREPE LARGA":                                  13.00,   /* 351 */
  "LIXA OSCILANTE 80":                                  3.50,   /* 249 LIXA OSCILANTE 80 - 125mm */
  "LIXA OSCILANTE 120":                                 3.50,   /* 248 LIXA OSCILANTE 120 - 125mm */
  "LIXA ANGULAR 36":                                    2.97,   /* 279 DISCO DE LIXA 36 - 4.1/2 */
  "ROLO DE LÃ":                                        11.90,   /* 199 ROLO LAMINAÇÃO - LÃ 9cm */
  "ROLO DE PINTURA":                                    8.90,   /* 198 ROLO PINTURA - ESPUMA 9cm */
  /* ── EPI ── */
  "TYVEK":                                             20.80    /* lista Nordex antiga; não está na lista mestra.
                                                                   Em 27/08/2026 o item perdeu o "60%" do nome —
                                                                   passou a existir um TYVEK só. O valor é o que
                                                                   o TYVEK 60% já tinha. A Siemens segue com
                                                                   R$ 22,00 na tabela dela: são a mesma coisa
                                                                   com dois valores herdados de listas
                                                                   diferentes — vale unificar quando alguém
                                                                   conferir a nota. */
};

/* Itens que só existem na lista de um dos dois. Ficam fora da tabela comum
   para não dar a entender que o outro cliente também usa. */
const PRECO_SO_NORDEX = {
  "ESPUMA 20MM":                                      232.50    /* 202 ESPUMA S/ GROOVING 20MM - RIGIDA AIREX */
};
const PRECO_SO_GE = {
  "BALSA CORE 32MM":                                  346.00,   /* 726 BALSA 32MM */
  "BALSA CORE 45MM":                                  550.20,   /* 363 BALSA CORE 45MM */
  "ESPUMA DE PVC S/ GROOVING 20MM":                   232.50,   /* 202 — mesmo item da "ESPUMA 20MM" da Nordex,
                                                                   com o nome de catálogo que a GE pediu */
  "RESINA ALTERNATIVA DE BALANCEAMENTO EPÓXI":         50.33,   /* 720 RESINA ALTERNATIVA */
  "ENDURECEDOR ALTERNATIVO DE BALANCEAMENTO EPÓXI":    70.56    /* 721 ENDURECEDOR ALTERNATIVO */
};

const PRECO_SIEMENS = {
  /* Onde a lista mestra tem o item, o valor é o dela — os dois clientes usam
     o mesmo. Só CYTEC e TYVEK seguem com o valor da lista Siemens, porque não
     aparecem na lista mestra. */
  "COMBI 900":                                         44.20,   /* 334 COMBI 900 */
  "TECIDO BIAX 450":                                   44.20,   /* 335 */
  "BALSA CORE 45MM/15":                               550.20,   /* 363 BALSA CORE 45MM */
  "TECIDO UD 661":                                     44.20,   /* 337 */
  "FILME PARA VÁCUO — FLEXNYL-WM / V-SHEET (75MY X2)": 11.70,   /* 241 */
  "NYLON":                                             11.27,   /* 177 */
  "PLÁSTICO PERFURADO AZUL":                            0.10,   /* 107 */
  "MANGUEIRA DE VÁCUO — VACUUMKLEER 090-16":            2.00,   /* 245 */
  "REGISTRO DE ESFERA PLÁSTICO":                        5.80,   /* 240 */
  "CONEXÃO INFUSÃO T PLÁSTICA":                         4.50,   /* 242 */
  "ESPÁTULA CELULOIDE":                                 1.99,   /* 194 */
  "ABRAÇADEIRAS":                                       2.00,   /* 195 */
  "POTES TRANSPARENTES":                                1.00,   /* 197 POTES TRANPARENTES */
  "ROLO DE LAMINAÇÃO":                                 11.90,   /* 199 ROLO LAMINAÇÃO - LÃ 9cm */
  "TUBO ESPIRAL":                                       7.23,   /* 178 */
  "BAMBAM — MAP TAPE 12N (3MM × 12MM × 15M)":          73.00,   /* 247 */
  "FITA CREPE":                                        13.00,   /* 351 FITA CREPE LARGA */
  "TRINCHA / PINCEL":                                  11.75,   /* 274 TRINCHA/PINCEL 3' */
  "LIXA OSCILANTE 40":                                  3.50,   /* 355 */
  "LIXA OSCILANTE 80":                                  3.50,   /* 249 */
  "LIXA OSCILANTE 120":                                 3.50,   /* 248 */
  "LIXA OSCILANTE 180":                                 3.50,   /* 360 */
  "LIXA OSCILANTE 220":                                 4.50,   /* 354 LIXA OSCILANTE 220 - 125mm */
  "LIXA ANGULAR 36":                                    2.97,   /* 279 DISCO DE LIXA 36 */
  "RESINA AROPOL 70452":                               63.00,   /* 341 */
  "ENDURECEDOR BUTANOX M-50":                          55.00,   /* 252 ENDURECEDOR BUTANOX M50 */
  "PARAFINA":                                          45.00,   /* 343 SOLUÇÃO DE PARAFINA */
  "CSM 300":                                           22.00,   /* 253 */
  "ESPUMA FLEXÍVEL BRANCA 50MM":                     1130.49,   /* 362 ESPUMA 45MM 1.500x1.000 */
  "RESINA ALTERNATIVA DE BALANCEAMENTO EPÓXI":         50.33,   /* 720 RESINA ALTERNATIVA */
  "ENDURECEDOR ALTERNATIVO DE BALANCEAMENTO EPÓXI":    70.56,   /* 721 ENDURECEDOR ALTERNATIVO */
  "TOP COAT 12 — ALEXIT / Mankiewicz — 12 kg":        298.11,   /* 143 */
  "HARDENER 12 — ALEXIT / Mankiewicz — 3 kg":         438.42,   /* 67 */
  "THINNER — Mankiewicz — 1 kg":                      257.34,   /* 140 */
  "BASE PUTTY PROFILE FILLER 3":                      260.01,   /* 212 */
  "ENDURECEDOR PUTTY PROFILE FILLER 3":               250.93,   /* 270 */
  "TYVEK":                                             22.00,   /* lista Siemens; não está na lista mestra */
  "WPT2 W8751 CLEAR — FITA 3M (254MM × 33M)":        1083.00,   /* 539 WPT2 W8751 CLEAR 254MMx33MM FITA 3M */
  "ADESIVO — SIKAFORCE 818-L07":                      212.00,   /* 338 SIKAFORCE-818 L07(AB)(+12MIX) /12 CTR 195.
                                                                   Em 27/08/2026 deixou de ser "BASE ADESIVO":
                                                                   o produto é o AB já pareado, e o endurecedor
                                                                   separado (SikaForce-050) saiu da lista. */
  "BASE GEL COAT — CRYSTIC RAL 7035":                  57.50,   /* 339 CRYSTIC 0209 RAL 7035 - SCOTT BADER - GEL COAT */
  "MASSA FILLER POLYESTER":                            70.52    /* 733 MASSA FILLER POLIESTER (FL 122ORG IBX).
                                                                   Substituiu a "BASE MASSA — CRYSTIC X401",
                                                                   que estava casada por tipo de produto com a
                                                                   340 MASSA PUTTY GAMESA-MAX (R$ 36,00). Agora
                                                                   é item próprio, com preço próprio. */
  /* ⚠️ SEM PREÇO: MASSA GT60 — não existe na lista mestra de compras (nenhum
     código com "GT60"). Enquanto não tiver nota, o item conta normalmente no
     checklist e aparece no bloco "MATERIAIS SEM PREÇO" do relatório de gasto,
     com consumo certo e gasto zero. Enquanto ele estiver nesse bloco, o total
     em R$ da Siemens está subestimado. */
};

/* Índice normalizado, montado uma vez por execução. Sem ele, a busca falharia
   sempre que o travessão do checklist não fosse byte a byte igual ao da tabela
   — o mesmo problema que o norm() já resolve para o MAPA_MAT. */
var PRECO_IDX = null;
function precoIndice_() {
  if (PRECO_IDX) return PRECO_IDX;
  PRECO_IDX = { NORDEX: {}, GE: {}, SIEMENS: {} };
  Object.keys(PRECO_NORDEX_GE).forEach(k => {
    PRECO_IDX.NORDEX[norm(k)] = PRECO_NORDEX_GE[k];
    PRECO_IDX.GE[norm(k)] = PRECO_NORDEX_GE[k];
  });
  Object.keys(PRECO_SO_NORDEX).forEach(k => { PRECO_IDX.NORDEX[norm(k)] = PRECO_SO_NORDEX[k]; });
  Object.keys(PRECO_SO_GE).forEach(k => { PRECO_IDX.GE[norm(k)] = PRECO_SO_GE[k]; });
  Object.keys(PRECO_SIEMENS).forEach(k => { PRECO_IDX.SIEMENS[norm(k)] = PRECO_SIEMENS[k]; });
  return PRECO_IDX;
}
function chaveCliente_(cliente) {
  const c = norm(cliente);
  if (c.indexOf("SIEMENS") >= 0) return "SIEMENS";
  if (c.indexOf("GE") >= 0) return "GE";
  return "NORDEX";
}
/** Preço unitário do material, ou null quando não há preço cadastrado. */
function precoDe_(cliente, material) {
  const tab = precoIndice_()[chaveCliente_(cliente)] || {};
  const p = tab[norm(material)];
  return (typeof p === "number" && isFinite(p)) ? p : null;
}
/** "R$ 1.234,56" — formatação brasileira, para texto de aviso e e-mail. */
function brl_(v) {
  const n = Number(v) || 0;
  const neg = n < 0;
  const partes = Math.abs(n).toFixed(2).split(".");
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-R$ " : "R$ ") + partes[0] + "," + partes[1];
}

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
    .addItem('📅 Resumo semanal — quanto tem em campo (R$)', 'gerarResumoSemanal')
    .addItem('💰 Gasto semanal em R$', 'gerarGastoSemanal')
    .addItem('💰 Gasto mensal em R$', 'gerarGastoMensal')
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
/* Valor unitário e valor total entram no FIM, pelo mesmo motivo de Tipo, Lote e
   Validade: nada do que já está gravado sai de lugar, e getOuCriaAba() alarga a
   aba existente e completa só as células de cabeçalho vazias.
   O valor gravado aqui é o da LINHA (QTD × preço): numa linha de ESTOQUE é
   quanto vale o que está no parque, e numa de ENTRADA é quanto entrou de
   material. O GASTO não é isto — é consumo × preço, e sai nas abas de gasto. */
const CAB_CHECKLIST = ["Semana", "Data do envio", "Parque", "Responsável", "Material", "Unidade", "QTD", "Tipo", "Lote", "Validade", "Valor unit (R$)", "Valor total (R$)"];
const COL_TIPO = 7;   // índice 0-based da coluna "Tipo"
const COL_LOTE = 8;
const COL_VALIDADE = 9;
const COL_PRECO = 10;
const COL_VALOR = 11;

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
  const dados = lastRow > 1
    ? sh.getRange(2, 1, lastRow - 1, Math.min(CAB_CHECKLIST.length, sh.getMaxColumns())).getValues()
    : [];

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
    /* Preço em branco (e não zero) quando o material não tem valor cadastrado:
       zero somaria como "custou nada" e esconderia a falta do cadastro. */
    const preco = precoDe_(envio.cliente, material);
    const valor = (preco === null) ? "" : Math.round(qtd * preco * 100) / 100;
    const novaLinha = [semana, dataEnvio, parque, responsavel, material, unidade, qtd, tipo, lote, validade,
                       (preco === null ? "" : preco), valor];
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
    const nCols = Math.min(CAB_CHECKLIST.length, sh.getMaxColumns());
    const dados = sh.getRange(2, 1, sh.getLastRow() - 1, nCols).getValues();
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
  /* Top coat colorido: tem de vir ANTES do "TOP COAT 12" genérico, senão o
     genérico captura por substring e o consumo do colorido é creditado ao
     cinza. O nome do checklist mudou em 26/08/2026 (era "RAL 3020 RED" e
     "RED 3020"); as duas grafias antigas continuam aqui como origem, para
     registro de calculadora antigo não deixar de casar. */
  ["TOP COAT 12 RAL 7020",      "TOP COAT 12 RAL 3020 (RED)"],
  ["TOP COAT 12 RAL 3020",      "TOP COAT 12 RAL 3020 (RED)"],
  ["TOP COAT 12 RED 3020",      "TOP COAT 12 RAL 3020 (RED)"],
  ["TOP COAT 12 RAL 7035",      "TOP COAT 12 RAL 7035 (GRAY)"],
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
  ["LH637",                     "ENDURECEDOR LH-637"],   /* até 27/08/2026 caía no LH 635, porque o LH-637
                                                            não existia no checklist. Agora existe. */
  ["LH635",                     "ENDURECEDOR LH 635"],
  ["LR635",                     "RESINA LR 635"],
  ["137GF",                     "EPOXY ENDURECEDOR 137GF"],
  ["135G3",                     "ADESIVO EPOXY 135G3"],
  ["BPR 135",                   "ADESIVO EPOXY 135G3"],
  ["BPH 137",                   "EPOXY ENDURECEDOR 137GF"],
  ["TRIAX 1200",                "TRIAX 1200"],
  ["BIAX 830",                  "TECIDO BIAX 830"],
  ["BIAX 450",                  "TECIDO BIAX 450"],
  ["UD 1000",                   "TECIDO UD 1000"],
  ["UD 661",                    "TECIDO UD 661"],
  ["BIZERO 750",                "TECIDO BIZERO 750"],
  ["CSM 300",                   "CSM 300"],
  ["BALSA CORE 15",             "BALSA CORE 15/20MM"],
  ["BALSA CORE 32",             "BALSA CORE 32MM"],   /* só GE */
  ["BALSA CORE 45",             "BALSA CORE 45MM"],   /* só GE — substituiu a "BALSA CORE 50", que saiu
                                                         das listas em 27/08/2026 */
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
  /* ⚠️ O par Hexion LR-135 / LH-135 saiu das listas em 27/08/2026 (a própria
     lista de compras já os marcava DESCONTINUADA). As duas linhas de tradução
     foram removidas de propósito, e NÃO redirecionadas a palpite: se alguma
     calculadora ainda lançar esse material, ele aparece na análise como
     "Material não encontrado no checklist deste parque" — visível, em vez de
     somar em silêncio no material errado. Quando a engenharia disser qual é o
     substituto (provavelmente ENDURECEDOR LH-637 para o LH-135), aponte aqui. */

  // ── Siemens ── (confirmados pelo engenheiro: mesmo material, marca trocada)
  ["POLYLITE M413",             "RESINA AROPOL 70452"],
  ["MEKP BUTANOX M-50",         "ENDURECEDOR BUTANOX M-50"],
  ["ALEXIT TOPCOAT 12",         "TOP COAT 12 - ALEXIT / MANKIEWICZ - 12 KG"],
  ["CRYSTIC X401",              "MASSA FILLER POLYESTER"],   /* renomeado em 27/08/2026 */
  ["MASSA FILLER",              "MASSA FILLER POLYESTER"],
  ["CRYSTIC RAL 7035",          "BASE GEL COAT - CRYSTIC RAL 7035"],
  ["SIKAFORCE-818 L07",         "ADESIVO — SIKAFORCE 818-L07"],   /* renomeado em 27/08/2026 */
  /* ⚠️ SIKAFORCE-050 saiu da lista em 27/08/2026 — o adesivo passou a ser
     contado como produto AB já pareado. Linha removida em vez de redirecionada:
     se a calculadora ainda lançar o endurecedor separado, ele aparece na
     análise como material não encontrado, e não somado no lugar errado. */
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
  const grid = sh.getRange(2, 1, sh.getLastRow() - 1,
                           Math.min(CAB_CONSUMO.length, sh.getMaxColumns())).getValues();
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
//  GASTO EM R$ — SEMANAL E MENSAL
//
//  DUAS FONTES, MEDINDO A MESMA COISA POR CAMINHOS DIFERENTES:
//
//  1) CHECKLIST (contagem de estoque)
//     Gasto = consumo × preço, e consumo entre duas contagens é
//        estoque(contagem anterior) + entradas no meio − estoque(contagem atual)
//     NÃO é "QTD × preço" da linha: isso é o valor do estoque parado, não gasto.
//     Por isso precisa de DUAS contagens do mesmo material no mesmo parque —
//     com uma só, não há como saber o que foi embora.
//
//  2) CALCULADORA (aba Consumo_Reparos)
//     Gasto = quantidade pesada no reparo × preço. O nome do material passa
//     por traduzirMaterial() antes, para casar com a grafia do checklist.
//
//  As duas quase nunca dão igual, e a diferença é justamente o que interessa:
//  material que saiu do estoque e não apareceu em reparo nenhum.
//
//  MATERIAL SEM PREÇO não entra na conta e é listado no fim da aba. Enquanto
//  aparecer nome nesse bloco, o total está SUBESTIMADO.
// ═══════════════════════════════════════════════════════════

/* Consumo semana a semana pelo checklist. Uma entrada de saída por par de
   contagens consecutivas do mesmo material no mesmo parque.

   As entradas do meio são filtradas por DATA, não por número de semana: na
   virada do ano a semana 1 é MENOR que a 52, e comparar número daria janela
   vazia (ou o ano inteiro) justamente na semana da virada. */
function consumoSemanalChecklist_(linhas) {
  const grupos = {};
  linhas.forEach(l => {
    const k = l.cliente + "\u0001" + l.parque + "\u0001" + l.material;
    if (!grupos[k]) grupos[k] = { cliente: l.cliente, parque: l.parque, material: l.material, est: [], ent: [] };
    if (l.tipo === "ENTRADA") grupos[k].ent.push(l);
    else grupos[k].est.push(l);
  });
  const saida = [];
  Object.keys(grupos).forEach(k => {
    const g = grupos[k];
    g.est.sort((a, b) => (a.data - b.data) || (a.semana - b.semana));
    for (let i = 1; i < g.est.length; i++) {
      const ant = g.est[i - 1], atu = g.est[i];
      let entradas = 0;
      g.ent.forEach(e => { if (e.data > ant.data && e.data <= atu.data) entradas += e.qtd; });
      /* A semana sai da DATA, não da coluna Semana da aba. As duas normalmente
         batem (é o próprio script que grava as duas a partir da data do envio),
         mas o gasto cruza esta fonte com a da calculadora, onde a semana só
         pode vir da data. Recalcular aqui garante que as duas usem a mesma
         régua e que uma coluna Semana editada à mão não desalinhe o cruzamento. */
      saida.push({
        cliente: g.cliente, parque: g.parque, material: g.material,
        semana: getISOWeek(atu.data), semanaBase: getISOWeek(ant.data), data: atu.data,
        estoqueIni: ant.qtd, entradas: entradas, estoqueFim: atu.qtd,
        consumido: ant.qtd + entradas - atu.qtd
      });
    }
  });
  return saida;
}

/* Consumo das calculadoras, agrupado por cliente + parque + material + semana. */
function consumoSemanalCalculadora_() {
  const ss = SpreadsheetApp.openById(ID_DESTINO);
  const sh = getAba(ss, "Consumo_Reparos");
  if (!sh || sh.getLastRow() < 2) return [];
  const grid = sh.getRange(2, 1, sh.getLastRow() - 1,
                           Math.min(CAB_CONSUMO.length, sh.getMaxColumns())).getValues();
  const mapa = {};
  grid.forEach(ln => {
    const material = String(ln[10] || "").trim();
    const parque = String(ln[3] || "").trim();
    if (!material || !parque) return;
    const data = parseDataFlexivel(ln[1]);
    const semana = getISOWeek(data);
    const cliente = String(ln[2] || "").trim();
    const matTrad = traduzirMaterial(norm(material));
    const k = [norm(cliente), norm(parque), matTrad, semana].join("\u0001");
    if (!mapa[k]) mapa[k] = { cliente: cliente, parque: parque, material: matTrad,
                              semana: semana, data: data, qtd: 0 };
    mapa[k].qtd += Number(ln[11]) || 0;
    /* A data guardada é a mais recente da semana, só para ordenar e para o
       filtro de período — a semana é o que agrupa. */
    if (data > mapa[k].data) mapa[k].data = data;
  });
  return Object.keys(mapa).map(k => mapa[k]);
}

/* Junta as duas fontes num só conjunto, já com preço aplicado.
   Devolve { detalhe, resumo, semPreco, totalCl, totalCa }. */
function coletarGasto_(dataInicio, dataFim) {
  const semPreco = {};
  function preco_(cliente, material, fonte) {
    const p = precoDe_(cliente, material);
    if (p === null) {
      const k = chaveCliente_(cliente) + "\u0001" + norm(material);
      if (!semPreco[k]) semPreco[k] = { cliente: cliente, material: material, fontes: {} };
      semPreco[k].fontes[fonte] = true;
      return null;
    }
    return p;
  }

  const noPeriodo = r => r.data >= dataInicio && r.data <= dataFim;
  const cl = consumoSemanalChecklist_(lerChecklistCombinado()).filter(noPeriodo);
  const ca = consumoSemanalCalculadora_().filter(noPeriodo);

  const det = {};
  function celula_(r) {
    const k = [r.cliente, r.parque, r.semana, norm(r.material)].join("\u0001");
    if (!det[k]) det[k] = { cliente: r.cliente, parque: r.parque, semana: r.semana, data: r.data,
                            material: r.material, consumoCl: null, precoCl: null, gastoCl: 0,
                            consumoCa: null, gastoCa: 0, obs: [] };
    if (r.data > det[k].data) det[k].data = r.data;
    return det[k];
  }

  cl.forEach(r => {
    const c = celula_(r);
    const p = preco_(r.cliente, r.material, "checklist");
    c.consumoCl = (c.consumoCl || 0) + r.consumido;
    c.precoCl = p;
    if (p !== null) c.gastoCl += r.consumido * p;
    c.obs.push("W" + r.semanaBase + "→W" + r.semana
      + (r.entradas ? " · entrada " + r.entradas + " descontada" : ""));
    if (r.consumido < 0) c.obs.push("consumo negativo — conferir contagem ou entrada não lançada");
  });
  ca.forEach(r => {
    const c = celula_(r);
    const p = preco_(r.cliente, r.material, "calculadora");
    c.consumoCa = (c.consumoCa || 0) + r.qtd;
    if (c.precoCl === null || c.precoCl === undefined) c.precoCl = p;
    if (p !== null) c.gastoCa += r.qtd * p;
  });

  const detalhe = Object.keys(det).map(k => det[k])
    .sort((a, b) => String(a.cliente).localeCompare(String(b.cliente))
                 || String(a.parque).localeCompare(String(b.parque))
                 || (a.semana - b.semana)
                 || String(a.material).localeCompare(String(b.material)));

  const res = {};
  detalhe.forEach(d => {
    const k = [d.cliente, d.parque, d.semana].join("\u0001");
    if (!res[k]) res[k] = { cliente: d.cliente, parque: d.parque, semana: d.semana,
                            data: d.data, gastoCl: 0, gastoCa: 0, itens: 0 };
    res[k].gastoCl += d.gastoCl; res[k].gastoCa += d.gastoCa; res[k].itens++;
    if (d.data > res[k].data) res[k].data = d.data;
  });
  const resumo = Object.keys(res).map(k => res[k])
    .sort((a, b) => String(a.cliente).localeCompare(String(b.cliente))
                 || String(a.parque).localeCompare(String(b.parque))
                 || (a.semana - b.semana));

  let totalCl = 0, totalCa = 0;
  detalhe.forEach(d => { totalCl += d.gastoCl; totalCa += d.gastoCa; });

  return { detalhe: detalhe, resumo: resumo, totalCl: totalCl, totalCa: totalCa,
           semPreco: Object.keys(semPreco).map(k => semPreco[k]) };
}

/* ── escrita das abas ────────────────────────────────────────────────────── */
const COR_TITULO = "#1c4587";
function escreverBloco_(sh, linha, titulo, cabecalho, dados) {
  sh.getRange(linha, 1).setValue(titulo).setFontWeight("bold").setFontSize(11);
  linha++;
  sh.getRange(linha, 1, 1, cabecalho.length).setValues([cabecalho])
    .setFontWeight("bold").setBackground(COR_TITULO).setFontColor("#ffffff")
    .setHorizontalAlignment("center").setWrap(true);
  linha++;
  if (!dados.length) {
    sh.getRange(linha, 1).setValue("(sem dados no período)").setFontColor("#999999");
    return linha + 2;
  }
  sh.getRange(linha, 1, dados.length, cabecalho.length).setValues(dados);
  for (let r = 0; r < dados.length; r++)
    if (r % 2 === 0) sh.getRange(linha + r, 1, 1, cabecalho.length).setBackground("#f8f9fa");
  return linha + dados.length + 2;
}
function n2_(v) { return Math.round((Number(v) || 0) * 100) / 100; }

/* ═══ GASTO SEMANAL — últimas 8 semanas ═══
   Oito semanas, e não o mês corrente como as outras análises: na primeira
   semana do mês um relatório semanal limitado ao mês mostraria uma linha só,
   e a comparação semana a semana é o que dá para enxergar tendência. */
function gerarGastoSemanal() {
  const SEMANAS_JANELA = 8;
  const hoje = new Date();
  const fim = new Date(hoje); fim.setHours(23, 59, 59, 999);
  const inicio = inicioSemanaISO_(hoje);
  inicio.setDate(inicio.getDate() - 7 * (SEMANAS_JANELA - 1));

  const g = coletarGasto_(inicio, fim);
  const ss = SpreadsheetApp.openById(ID_DESTINO);
  let sh = getAba(ss, "Gasto Semanal (R$)");
  if (!sh) sh = ss.insertSheet("Gasto Semanal (R$)");
  sh.clearContents(); sh.clearConditionalFormatRules();

  sh.getRange(1, 1).setValue("GASTO SEMANAL EM R$  |  " + SEMANAS_JANELA + " semanas: "
    + inicio.toLocaleDateString("pt-BR") + " a " + fim.toLocaleDateString("pt-BR")
    + "  |  Atualizado: " + hoje.toLocaleDateString("pt-BR"))
    .setFontWeight("bold").setFontSize(12);

  let ln = 3;
  ln = escreverBloco_(sh, ln, "1) RESUMO — por parque e semana",
    ["CLIENTE", "PARQUE", "SEMANA", "Gasto pelo\nCHECKLIST (R$)", "Gasto pela\nCALCULADORA (R$)",
     "Diferença\n(Checklist − Calc.)", "Materiais\nna linha"],
    g.resumo.map(r => [r.cliente, r.parque, "W" + r.semana, n2_(r.gastoCl), n2_(r.gastoCa),
                       n2_(r.gastoCl - r.gastoCa), r.itens]));

  ln = escreverBloco_(sh, ln, "2) DETALHE — por material",
    ["CLIENTE", "PARQUE", "SEMANA", "MATERIAL", "Consumo\n(checklist)", "R$ / unidade",
     "Gasto checklist\n(R$)", "Consumo\n(calculadora)", "Gasto calculadora\n(R$)", "Obs"],
    g.detalhe.map(d => [d.cliente, d.parque, "W" + d.semana, d.material,
      d.consumoCl === null ? "—" : n2_(d.consumoCl),
      d.precoCl === null || d.precoCl === undefined ? "sem preço" : n2_(d.precoCl),
      d.consumoCl === null ? "—" : n2_(d.gastoCl),
      d.consumoCa === null ? "—" : n2_(d.consumoCa),
      d.consumoCa === null ? "—" : n2_(d.gastoCa),
      d.obs.join(" · ")]));

  ln = escreverBloco_(sh, ln, "3) MATERIAIS SEM PREÇO — enquanto houver nome aqui, o total está subestimado",
    ["CLIENTE", "MATERIAL", "Apareceu em"],
    g.semPreco.map(x => [x.cliente, x.material, Object.keys(x.fontes).join(" + ")]));

  sh.getRange(ln, 1).setValue("TOTAL DO PERÍODO — Checklist: " + brl_(g.totalCl)
    + "   |   Calculadora: " + brl_(g.totalCa)
    + "   |   Diferença: " + brl_(g.totalCl - g.totalCa))
    .setFontWeight("bold").setFontSize(11);

  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 10);
  avisar("✅ Gasto semanal gerado.\n\n"
    + "Período: " + inicio.toLocaleDateString("pt-BR") + " a " + fim.toLocaleDateString("pt-BR") + "\n"
    + "Checklist: " + brl_(g.totalCl) + "\n"
    + "Calculadora: " + brl_(g.totalCa) + "\n"
    + (g.semPreco.length ? "⚠️ " + g.semPreco.length + " material(is) SEM PREÇO — total subestimado\n" : "")
    + "\n📋 Aba: Gasto Semanal (R$)");
  return { linhas: g.detalhe.length, semPreco: g.semPreco.length };
}

// ═══════════════════════════════════════════════════════════
//  RESUMO SEMANAL — QUANTO TEM EM CAMPO, EM R$
//
//  Responde três perguntas que as outras abas não respondiam:
//    1. Quanto vale, em reais, o material parado em cada parque — em TODAS as
//       semanas da janela, não só na última.
//    2. Quanto isso variou em relação à semana anterior e à primeira semana do
//       mês (as duas comparações que a engenharia pediu).
//    3. Quantos materiais diferentes cada parque tem em estoque.
//
//  E fecha com a tabela no formato do relatório gerencial "Matéria Prima por
//  HH". As colunas que dependem de apontamento de hora (SOMA DE HH,
//  Produtividade, Custo EPI/HH) e de devolução de material saem EM BRANCO de
//  propósito: nada disso passa pelo checklist. Preenchê-las com zero daria a
//  impressão de que o dado existe e vale zero.
//
//  A JANELA é de 8 semanas, igual à do gasto semanal — no começo do mês uma
//  janela mensal mostraria uma coluna só e não haveria o que comparar.
// ═══════════════════════════════════════════════════════════

/* Materiais que são EPI. Alimenta a coluna "R$ EPI'S" do relatório gerencial.
   Comparação por nome normalizado, igual ao resto do arquivo. */
const EPIS = ["TYVEK", "TYVEK 60%", "MACACÃO 100%"];
function ehEpi_(material) {
  const m = norm(material);
  return EPIS.some(e => m === norm(e));
}

/* Fotografia do parque por semana: valor em R$ do estoque, quantos materiais
   diferentes tem, e quanto entrou de material naquela semana.

   O estoque de uma semana é a ÚLTIMA contagem daquela semana (reenvio corrige,
   não soma — mesma regra do upsert que grava a linha). */
function estoquePorParqueSemana_(linhas, semanas) {
  const naJanela = {};
  semanas.forEach(w => { naJanela[w] = true; });

  const cel = {};   // cliente|parque|semana
  const ultima = {};   // cliente|parque|semana|material -> {data, qtd}

  linhas.forEach(l => {
    /* Linha sem data utilizável não entra: getISOWeek de data inválida devolve
       NaN e a linha iria parar num balde fantasma. */
    if (!l.data || isNaN(l.data.getTime())) return;
    const w = getISOWeek(l.data);
    if (!naJanela[w]) return;
    const kc = [l.cliente, l.parque, w].join("");
    if (!cel[kc]) cel[kc] = { cliente: l.cliente, parque: l.parque, semana: w,
                              valorEstoque: 0, qtdMateriais: 0, valorEntrada: 0,
                              valorEpi: 0, semPreco: 0 };
    if (l.tipo === "ENTRADA") {
      const p = precoDe_(l.cliente, l.material);
      if (p !== null) cel[kc].valorEntrada += l.qtd * p;
      return;
    }
    const km = kc + "" + norm(l.material);
    if (!ultima[km] || l.data >= ultima[km].data) ultima[km] = { data: l.data, qtd: l.qtd, material: l.material, chave: kc };
  });

  Object.keys(ultima).forEach(km => {
    const u = ultima[km], c = cel[u.chave];
    if (!c) return;
    if (u.qtd > 0) c.qtdMateriais++;
    const p = precoDe_(c.cliente, u.material);
    if (p === null) { if (u.qtd > 0) c.semPreco++; return; }
    const v = u.qtd * p;
    c.valorEstoque += v;
    if (ehEpi_(u.material)) c.valorEpi += v;
  });

  return cel;
}

function gerarResumoSemanal() {
  const SEMANAS_JANELA = 8;
  const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const hoje = new Date();
  const fim = new Date(hoje); fim.setHours(23, 59, 59, 999);
  const inicio = inicioSemanaISO_(hoje);
  inicio.setDate(inicio.getDate() - 7 * (SEMANAS_JANELA - 1));

  /* Semanas da janela, em ordem. Vem da DATA e não de contagem crua de número
     de semana, senão a virada de ano (semana 52 -> 1) sai fora de ordem. */
  const SEMANAS = [], rotuloSemana = {};
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 7)) {
    const w = getISOWeek(d);
    SEMANAS.push(w);
    rotuloSemana[w] = "W" + w;
  }
  const wkAtual = SEMANAS[SEMANAS.length - 1];
  const wkAnterior = SEMANAS.length > 1 ? SEMANAS[SEMANAS.length - 2] : null;

  /* Primeira semana do MÊS CORRENTE, se ela cair dentro da janela. Fora dela,
     a coluna de diferença sai vazia em vez de comparar com semana errada. */
  const semanasDoMes = getSemanasDoMes(hoje.getFullYear(), hoje.getMonth());
  const wkPrimeiraDoMes = SEMANAS.indexOf(semanasDoMes[0]) >= 0 ? semanasDoMes[0] : null;

  const linhas = lerChecklistCombinado();
  const cel = estoquePorParqueSemana_(linhas, SEMANAS);

  /* Consumo em R$ na janela, por parque. Usa a mesma fonte do gasto semanal
     para os dois relatórios não divergirem. */
  const gasto = coletarGasto_(inicio, fim);
  const consumoPorParque = {};
  gasto.resumo.forEach(r => {
    const k = [r.cliente, r.parque].join("");
    if (!consumoPorParque[k]) consumoPorParque[k] = 0;
    consumoPorParque[k] += r.gastoCl;
  });

  const chaves = {};
  Object.keys(cel).forEach(k => {
    const c = cel[k];
    chaves[[c.cliente, c.parque].join("")] = { cliente: c.cliente, parque: c.parque };
  });
  const parques = Object.keys(chaves).map(k => chaves[k])
    .sort((a, b) => String(a.cliente).localeCompare(String(b.cliente))
                 || String(a.parque).localeCompare(String(b.parque)));

  const ss = SpreadsheetApp.openById(ID_DESTINO);
  if (!parques.length) {
    avisar("❌ Resumo Semanal: nenhuma contagem de estoque nas últimas " +
      SEMANAS_JANELA + " semanas (" + inicio.toLocaleDateString("pt-BR") +
      " a " + fim.toLocaleDateString("pt-BR") + ").");
    return { parques: 0 };
  }

  let sh = getAba(ss, "Resumo Semanal");
  if (!sh) sh = ss.insertSheet("Resumo Semanal");
  sh.clearContents(); sh.clearFormats();

  sh.getRange(1, 1).setValue("RESUMO SEMANAL — ESTOQUE EM PARQUE  |  " +
      inicio.toLocaleDateString("pt-BR") + " a " + fim.toLocaleDateString("pt-BR") +
      "  |  W" + SEMANAS[0] + "→W" + wkAtual +
      "  |  Atualizado: " + hoje.toLocaleDateString("pt-BR"))
    .setFontWeight("bold").setFontSize(12);
  let linha = 3;

  const valorDe = (p, w) => {
    const c = cel[[p.cliente, p.parque, w].join("")];
    return c ? n2_(c.valorEstoque) : "";
  };
  const qtdDe = (p, w) => {
    const c = cel[[p.cliente, p.parque, w].join("")];
    return c ? c.qtdMateriais : "";
  };

  /* ── BLOCO 1: estoque em R$, semana a semana ── */
  const cab1 = ["PARQUE", "CLIENTE"].concat(SEMANAS.map(w => rotuloSemana[w] + "\nR$"));
  cab1.push("Δ vs W" + (wkAnterior === null ? "—" : wkAnterior) + "\nR$");
  cab1.push("Δ vs 1ª do mês\n" + (wkPrimeiraDoMes === null ? "(fora da janela)" : "W" + wkPrimeiraDoMes) + "\nR$");
  const dados1 = parques.map(p => {
    const l = [p.parque, p.cliente].concat(SEMANAS.map(w => valorDe(p, w)));
    const atual = valorDe(p, wkAtual);
    const ant = wkAnterior === null ? "" : valorDe(p, wkAnterior);
    const pri = wkPrimeiraDoMes === null ? "" : valorDe(p, wkPrimeiraDoMes);
    l.push(atual === "" || ant === "" ? "" : n2_(atual - ant));
    l.push(atual === "" || pri === "" ? "" : n2_(atual - pri));
    return l;
  });
  /* Total por coluna. Só soma número — célula vazia é "não houve contagem",
     não zero, e somar como zero derrubaria o total do parque inteiro. */
  const total1 = ["TOTAL", ""];
  for (let c = 2; c < cab1.length; c++) {
    let s = 0, tem = false;
    dados1.forEach(l => { if (typeof l[c] === "number") { s += l[c]; tem = true; } });
    total1.push(tem ? n2_(s) : "");
  }
  dados1.push(total1);
  linha = escreverBloco_(sh, linha, "1. ESTOQUE EM PARQUE (R$) — semana a semana", cab1, dados1);
  sh.getRange(linha - 3, 1, 1, cab1.length).setFontWeight("bold").setBackground("#e8f0fe");

  /* ── BLOCO 2: quantos materiais diferentes cada parque tem ── */
  const cab2 = ["PARQUE", "CLIENTE"].concat(SEMANAS.map(w => rotuloSemana[w]));
  const dados2 = parques.map(p => [p.parque, p.cliente].concat(SEMANAS.map(w => qtdDe(p, w))));
  linha = escreverBloco_(sh, linha,
    "2. QTD DE MATERIAIS EM PARQUE — materiais distintos com estoque acima de zero", cab2, dados2);

  /* ── BLOCO 3: formato do relatório gerencial "Matéria Prima por HH" ── */
  const cabG = ["PROJETOS", "R$ MATÉRIA-PRIMA", "R$ DEVOLUÇÃO MP", "R$ MP PARQUE " + rotuloSemana[wkAtual],
                "CONSUMO R$", "SOMA DE HH", "Produtividade\n(MP-DMP-MPP)/HH", "FIM", "TRIMESTRE",
                "R$ EPI'S", "Custo EPI / HH", "OBS"];
  const porCliente = {};
  parques.forEach(p => { (porCliente[p.cliente] = porCliente[p.cliente] || []).push(p); });

  let geral = { mp: 0, estoque: 0, consumo: 0, epi: 0 };
  Object.keys(porCliente).sort().forEach(cliente => {
    const dadosG = [], soma = { mp: 0, estoque: 0, consumo: 0, epi: 0 };
    porCliente[cliente].forEach(p => {
      /* Matéria-prima = tudo que foi lançado como ENTRADA na janela. É o dado
         mais próximo de "material enviado ao parque" que o checklist tem. Se a
         equipe não lançar as entradas, esta coluna fica subestimada — e é por
         isso que ela vem acompanhada do estoque e do consumo, que não dependem
         de lançamento de entrada. */
      let mp = 0;
      SEMANAS.forEach(w => {
        const c = cel[[p.cliente, p.parque, w].join("")];
        if (c) mp += c.valorEntrada;
      });
      const estoque = valorDe(p, wkAtual);
      const consumo = consumoPorParque[[p.cliente, p.parque].join("")] || 0;
      const cAtual = cel[[p.cliente, p.parque, wkAtual].join("")];
      const epi = cAtual ? cAtual.valorEpi : 0;
      const semPreco = cAtual ? cAtual.semPreco : 0;
      soma.mp += mp; soma.estoque += (typeof estoque === "number" ? estoque : 0);
      soma.consumo += consumo; soma.epi += epi;
      dadosG.push([p.parque, n2_(mp), "", estoque, n2_(consumo), "", "", "", "",
                   n2_(epi), "",
                   semPreco ? semPreco + " material(is) sem preço — total subestimado" : ""]);
    });
    dadosG.push(["TOTAL " + cliente, n2_(soma.mp), "", n2_(soma.estoque), n2_(soma.consumo),
                 "", "", "", "", n2_(soma.epi), "", ""]);
    geral.mp += soma.mp; geral.estoque += soma.estoque;
    geral.consumo += soma.consumo; geral.epi += soma.epi;
    linha = escreverBloco_(sh, linha, "3. MATÉRIA PRIMA POR PARQUE — " + cliente.toUpperCase(), cabG, dadosG);
    sh.getRange(linha - 3, 1, 1, cabG.length).setFontWeight("bold").setBackground("#e8f0fe");
  });

  sh.getRange(linha, 1, 1, cabG.length)
    .setValues([["TOTAL GERAL", n2_(geral.mp), "", n2_(geral.estoque), n2_(geral.consumo),
                 "", "", "", "", n2_(geral.epi), "", ""]])
    .setFontWeight("bold").setBackground(COR_TITULO).setFontColor("#ffffff");
  linha += 2;

  sh.getRange(linha, 1).setValue(
    "Colunas em branco (DEVOLUÇÃO MP, SOMA DE HH, Produtividade, FIM, TRIMESTRE, Custo EPI/HH) " +
    "não passam pelo checklist — ficam vazias de propósito, para não parecer que valem zero. " +
    "R$ MATÉRIA-PRIMA = entradas lançadas na janela.")
    .setFontColor("#999999").setFontSize(9);

  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, Math.max(cab1.length, cabG.length));

  /* Conta material sem preço pelo ESTOQUE, não pelo consumo: um material que
     só foi contado uma vez ainda não gera linha de consumo, mas já está
     parado no parque valendo zero no relatório. É justamente o caso de item
     novo — que é quando o cadastro de preço costuma faltar. */
  let semPrecoAgora = 0;
  parques.forEach(p => {
    const c = cel[[p.cliente, p.parque, wkAtual].join("")];
    if (c) semPrecoAgora += c.semPreco;
  });

  avisar("✅ Resumo Semanal gerado!\n\n" +
    "🏗️ " + parques.length + " parque(s) em " + SEMANAS.length + " semana(s)\n" +
    "💰 Estoque em campo agora: " + brl_(geral.estoque) + "\n" +
    "📦 Consumo na janela: " + brl_(geral.consumo) + "\n" +
    (semPrecoAgora
      ? "⚠️ " + semPrecoAgora + " material(is) em estoque SEM PREÇO — o total está subestimado\n"
      : "") +
    "📋 Aba: Resumo Semanal");
  return { parques: parques.length, semanas: SEMANAS.length, semPreco: semPrecoAgora };
}

/* ═══ GASTO MENSAL — mês corrente em detalhe + histórico de 6 meses ═══ */
function gerarGastoMensal() {
  const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const MESES_HIST = 6;
  const hoje = new Date();
  const fim = new Date(hoje); fim.setHours(23, 59, 59, 999);
  const inicioHist = new Date(hoje.getFullYear(), hoje.getMonth() - (MESES_HIST - 1), 1);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const g = coletarGasto_(inicioHist, fim);
  const rotuloMes = d => MESES_PT[d.getMonth()] + "/" + d.getFullYear();

  /* histórico mês a mês */
  const porMes = {};
  g.detalhe.forEach(d => {
    const k = d.data.getFullYear() + "-" + ("0" + (d.data.getMonth() + 1)).slice(-2);
    if (!porMes[k]) porMes[k] = { rotulo: rotuloMes(d.data), gastoCl: 0, gastoCa: 0 };
    porMes[k].gastoCl += d.gastoCl; porMes[k].gastoCa += d.gastoCa;
  });
  const hist = Object.keys(porMes).sort().map(k => porMes[k]);

  /* mês corrente */
  const doMes = g.detalhe.filter(d => d.data >= inicioMes);
  const porParque = {}, porMaterial = {};
  doMes.forEach(d => {
    const kp = d.cliente + "\u0001" + d.parque;
    if (!porParque[kp]) porParque[kp] = { cliente: d.cliente, parque: d.parque, gastoCl: 0, gastoCa: 0 };
    porParque[kp].gastoCl += d.gastoCl; porParque[kp].gastoCa += d.gastoCa;

    const km = d.cliente + "\u0001" + norm(d.material);
    if (!porMaterial[km]) porMaterial[km] = { cliente: d.cliente, material: d.material,
      preco: d.precoCl, consumoCl: 0, gastoCl: 0, consumoCa: 0, gastoCa: 0 };
    porMaterial[km].consumoCl += (d.consumoCl || 0);
    porMaterial[km].gastoCl += d.gastoCl;
    porMaterial[km].consumoCa += (d.consumoCa || 0);
    porMaterial[km].gastoCa += d.gastoCa;
  });
  const listaParque = Object.keys(porParque).map(k => porParque[k])
    .sort((a, b) => (b.gastoCl + b.gastoCa) - (a.gastoCl + a.gastoCa));
  const listaMaterial = Object.keys(porMaterial).map(k => porMaterial[k])
    .sort((a, b) => (b.gastoCl + b.gastoCa) - (a.gastoCl + a.gastoCa));

  let totMesCl = 0, totMesCa = 0;
  doMes.forEach(d => { totMesCl += d.gastoCl; totMesCa += d.gastoCa; });

  const ss = SpreadsheetApp.openById(ID_DESTINO);
  let sh = getAba(ss, "Gasto Mensal (R$)");
  if (!sh) sh = ss.insertSheet("Gasto Mensal (R$)");
  sh.clearContents(); sh.clearConditionalFormatRules();

  sh.getRange(1, 1).setValue("GASTO MENSAL EM R$  |  Mês corrente: " + rotuloMes(hoje)
    + "  |  Histórico: " + MESES_HIST + " meses  |  Atualizado: " + hoje.toLocaleDateString("pt-BR"))
    .setFontWeight("bold").setFontSize(12);

  let ln = 3;
  ln = escreverBloco_(sh, ln, "1) FECHAMENTO MÊS A MÊS",
    ["MÊS", "Gasto pelo\nCHECKLIST (R$)", "Gasto pela\nCALCULADORA (R$)", "Diferença\n(Checklist − Calc.)"],
    hist.map(h => [h.rotulo, n2_(h.gastoCl), n2_(h.gastoCa), n2_(h.gastoCl - h.gastoCa)]));

  ln = escreverBloco_(sh, ln, "2) " + rotuloMes(hoje).toUpperCase() + " — por parque",
    ["CLIENTE", "PARQUE", "Gasto pelo\nCHECKLIST (R$)", "Gasto pela\nCALCULADORA (R$)", "Diferença"],
    listaParque.map(p => [p.cliente, p.parque, n2_(p.gastoCl), n2_(p.gastoCa), n2_(p.gastoCl - p.gastoCa)]));

  ln = escreverBloco_(sh, ln, "3) " + rotuloMes(hoje).toUpperCase() + " — por material (maior gasto primeiro)",
    ["CLIENTE", "MATERIAL", "R$ / unidade", "Consumo\n(checklist)", "Gasto checklist\n(R$)",
     "Consumo\n(calculadora)", "Gasto calculadora\n(R$)"],
    listaMaterial.map(m => [m.cliente, m.material,
      m.preco === null || m.preco === undefined ? "sem preço" : n2_(m.preco),
      n2_(m.consumoCl), n2_(m.gastoCl), n2_(m.consumoCa), n2_(m.gastoCa)]));

  ln = escreverBloco_(sh, ln, "4) MATERIAIS SEM PREÇO — enquanto houver nome aqui, o total está subestimado",
    ["CLIENTE", "MATERIAL", "Apareceu em"],
    g.semPreco.map(x => [x.cliente, x.material, Object.keys(x.fontes).join(" + ")]));

  sh.getRange(ln, 1).setValue("TOTAL DE " + rotuloMes(hoje).toUpperCase()
    + " — Checklist: " + brl_(totMesCl)
    + "   |   Calculadora: " + brl_(totMesCa)
    + "   |   Diferença: " + brl_(totMesCl - totMesCa))
    .setFontWeight("bold").setFontSize(11);

  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 7);
  avisar("✅ Gasto mensal gerado.\n\n"
    + rotuloMes(hoje) + "\n"
    + "Checklist: " + brl_(totMesCl) + "\n"
    + "Calculadora: " + brl_(totMesCa) + "\n"
    + (g.semPreco.length ? "⚠️ " + g.semPreco.length + " material(is) SEM PREÇO — total subestimado\n" : "")
    + "\n📋 Aba: Gasto Mensal (R$)");
  return { linhas: listaMaterial.length, semPreco: g.semPreco.length };
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
  try { gerarResumoSemanal(); }     catch (e) { falhas.push("gerarResumoSemanal: " + e.message); }
  try { gerarGastoSemanal(); }      catch (e) { falhas.push("gerarGastoSemanal: " + e.message); }
  try { gerarGastoMensal(); }       catch (e) { falhas.push("gerarGastoMensal: " + e.message); }
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
    const dados = sh.getRange(2, 1, ultima - 1, Math.min(CAB_CHECKLIST.length, sh.getMaxColumns())).getValues();
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
