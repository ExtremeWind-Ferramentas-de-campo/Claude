/* Regera os 3 checklists de Frotas a partir do construtor-formulario.html
   que está nesta mesma pasta — é a mesma mecânica do botão "Gerar formulário",
   só que para os três de uma vez e sem esquecer as costuras do site.

       node _gerar.js

   Reescreve gerador-eletrico.html, plataforma.html, veiculo.html e os três
   modelos em modelos/. Mexer numa pergunta aqui é editar a lista de campos
   abaixo; mexer pelo construtor é editar o .json e salvar por cima. */
'use strict';
const fs = require('fs');
const path = require('path');

const DESTINO = __dirname;
const CONSTRUTOR = path.join(__dirname, 'construtor-formulario.html');

/* ---------- utilitários de montagem do modelo ---------- */
let seq = 0;
function novo(tipo, rotulo, extra){
  const c = Object.assign({
    uid: ++seq, tipo,
    rotulo: rotulo, ajuda: '', obrigatorio: false, exemplo: '',
    opcoes: [], colunas: [], varias: false
  }, extra || {});
  return c;
}
const txt   = (r,e)=> novo('texto', r, e);
const memo  = (r,e)=> novo('textao', r, e);
const num   = (r,e)=> novo('numero', r, e);
const dt    = (r,e)=> novo('data', r, e);
const opc   = (r,opcoes,e)=> novo('radio', r, Object.assign({opcoes}, e||{}));
const lista = (r,opcoes,e)=> novo('select', r, Object.assign({opcoes}, e||{}));
const foto  = (r,e)=> novo('foto', r, Object.assign({varias:true}, e||{}));
const assin = (r,e)=> novo('assinatura', r, e);

/* matriz de seleção do forms.app -> um "escolha única" por linha,
   com as colunas viradas opções. É o equivalente exato em campos. */
function matriz(pergunta, descricao, linhas, colunas, obrigatorio){
  return linhas.map((l, k)=> opc(l, colunas, {
    obrigatorio: obrigatorio !== false,
    ajuda: k === 0 && descricao ? pergunta + ' — ' + descricao : pergunta
  }));
}

/* ===================================================================
   1) CHECK LIST — GERADOR ELÉTRICO
   =================================================================== */
seq = 0;
const gSeg = matriz(
  'Selecione de acordo com as questões de segurança:',
  'MARQUE A SENTENÇA QUE MELHOR ATENDE.',
  [
    'O gerador está equipado com bacia de contenção em plástico, fibra ou material metálico?',
    'O gerador acompanha galão 5 litros com bico guia?',
    'O kit de mitigação está disponível e completo (pó de serra/areia, sacos de 100L, pá cabo de madeira, pá plástica/borracha, vassoura, manta absorvente, balde com tampa e luvas nitrílicas)?',
    'O quadro elétrico possui placa de segurança instalada?',
    'As conexões elétricas estão íntegras e sem emendas?',
    'A haste de aterramento está fixada com o respectivo conector?',
    'O extintor de incêndio está carregado e dentro do prazo de validade?',
    'As informações e identificações do extintor estão visíveis e legíveis?',
    'A placa de área de exclusão está plastificada e em boas condições?',
    'As Regras que Salvam Vidas estão plastificadas e disponíveis no local?',
    'As extensões elétricas estão sem emendas e com conectores adequados?',
    'Existe corda simples de 8 mm disponível para isolamento da área?'
  ],
  ['Aplica', 'Não aplica', 'Não possui']
);
const gEle = matriz(
  'Quanto as questões eletromecânicas',
  'MARQUE DE ACORDO COM A OPERAÇÃO',
  [
    'Quanto ao nível de óleo ?',
    'Quanto ao marcador de combustível ?',
    'Quanto ao motor de partida / ignição ?',
    'Quanto ao marcador de combustível ? (2)',
    'Quanto a geração de energia ?',
    'Quanto ao carburador ?'
  ],
  ['Aplica', 'Não aplica', 'Não atende']
);

const cDanoG = opc('Houve algum dano/pane ?', ['SIM !!!', 'NÃO !!!'], {obrigatorio:true});

const gerador = {
  titulo: 'CHECK LIST — GERADOR ELÉTRICO',
  subtitulo: 'Extreme Wind Blade Services',
  destino: {
    url: '', pasta: '/EW - CHECKLIST FROTAS/GERADOR ELETRICO', sub: '{MM-AAAA}',
    arquivo: 'CHECKLIST_GERADOR_{campo:Parque}_{DD}-{MM}-{AAAA}_{ID}',
    sheet: true, sheetUrl: '', sheetId: ''
  },
  campos: [
    txt('Nome completo', {obrigatorio:true, ajuda:'NOME DO RESPONSÁVEL DO EQUIPAMENTO.'}),
    txt('Parque', {obrigatorio:true, ajuda:'PARQUE E REGIÃO DE ATUAÇÃO'}),
    txt('Cidade-Estado', {obrigatorio:true}),
    dt('Data', {obrigatorio:true}),
    ...gSeg,
    ...gEle,
    foto('Kit mitigação', {obrigatorio:true,
      ajuda:'Agora precisamos de algumas fotos para que, de forma visual, possamos garantir a integridade do equipamento. — FOTO DA INTEGRIDADE DO KIT DE MITIGAÇÃO (até 3 fotos)'}),
    foto('Lataria e hastes', {obrigatorio:true, ajuda:'FOTO DA INTEGRIDADE DA LATARIA DO GERADOR. (até 3 fotos)'}),
    foto('Marcador de combustível', {obrigatorio:true, ajuda:'FOTO DO MARCADOR DE COMBUSTÍVEL. (até 3 fotos)'}),
    foto('Nível de óleo', {obrigatorio:true, ajuda:'O NÍVEL DE ÓLEO DEVE SER MANTIDO SEMPRE CHEIO. (até 3 fotos)'}),
    opc('Qual é o nível de óleo ?', ['4/4 (Cheio)', '3/4 (Bom)', '1/2 (Meio / atenção)', '1/4 (Não usar / repor óleo)'],
        {obrigatorio:true, ajuda:'MARQUE DE ACORDO COM O NÍVEL APRESENTADO.'}),
    foto('Painel', {obrigatorio:true, ajuda:'FOTO DO PAINEL DO GERADOR. (até 3 fotos)'}),
    foto('Tomadas elétricas', {obrigatorio:true, ajuda:'FOTOS DAS TOMADAS DE SAÍDA DE ENERGIA. (até 3 fotos)'}),
    foto('Conectores e extensões', {obrigatorio:true, ajuda:'FOTOS DAS TOMADAS DE EXTENSÕES E EQUIPAMENTOS QUE SERÃO LIGADAS AO GERADOR. (até 3 fotos)'}),
    foto('Painel de Força', {obrigatorio:true, ajuda:'FOTO DO PAINEL DE DISTRIBUIÇÃO DE FORÇA. (até 3 fotos)'}),
    cDanoG,
    memo('DESCREVA AQUI !!!', {obrigatorio:true, ajuda:'DESCREVA O DANO - PANE APRESENTADO.',
      cond:{uid:cDanoG.uid, op:'igual', valor:'SIM !!!'}}),
    memo('Descreva como se comporta em operação.', {obrigatorio:true, ajuda:'DESCREVA COMO O GERADOR ESTÁ ATUANDO.'}),
    assin('Assinatura', {obrigatorio:true})
  ]
};

/* ===================================================================
   2) CHECK LIST PLATAFORMA
   =================================================================== */
seq = 0;
const pMat = matriz(
  'Marque a coluna de acordo com o funcionamento dos itens',
  'OBS: Caso haja alguma inconformidade, marque a coluna "Não Conforme" e registre as evidências no final do checklist.',
  [
    'CABO DE AÇO DE - 150 MT',
    'CABO DE AÇO DE - 20 MT',
    'CINTAS - 6 MT',
    'CORDAS SEMI-ESTATICA 300M',
    'CORDAS SEMI-ESTÁTICA 110M OU 150M',
    'DESCENSORES RIG',
    'TRAVA-QUEDAS DE CORDAS',
    'MOSQUETÕES',
    'DISCO DE ALUMINIO (LIMITADOR)',
    'TROLLER P/ CABO DE AÇO',
    'CONTRA PESO - 10 KG',
    'TRAVA-QUEDAS + MOSQUETÃO',
    'BALANCIM',
    'PAINEL DE FORÇA',
    'MOTOR LACRE',
    'PAINEL DE COMANDO',
    'BALANÇA/PESO',
    'CABO DE ALIMENTAÇÃO',
    'MANILHAS',
    'BSQ CAPACIDADE 2 TON',
    'FURO SERRA-COPO',
    'FURADEIRA',
    'TELA DE VIVEIROS'
  ],
  ['CONFORME', 'NÃO CONFORME', 'N/A']
);

const cProbP = opc('HÁ ALGUM PROBLEMA NA OPERAÇÃO COM A PLATAFORMA ?', ['Sim', 'Não']);

const plataforma = {
  titulo: 'CHECK LIST PLATAFORMA',
  subtitulo: 'Extreme Wind Blade Services',
  destino: {
    url: '', pasta: '/EW - CHECKLIST FROTAS/PLATAFORMA', sub: '{MM-AAAA}',
    arquivo: 'CHECKLIST_PLATAFORMA_{campo:IDENTIFICAÇÃO DA PLATAFORMA:}_{DD}-{MM}-{AAAA}_{ID}',
    sheet: true, sheetUrl: '', sheetId: ''
  },
  campos: [
    txt('Nome do Responsável', {obrigatorio:true, ajuda:'Responsável pelos equipamentos coletivos.'}),
    txt('Nome do Parque', {obrigatorio:true}),
    txt('Cidade - Estado', {obrigatorio:true}),
    dt('Data', {obrigatorio:true}),
    lista('IDENTIFICAÇÃO DA PLATAFORMA:', ['WRX - 83001', 'WRX - 83011', 'WRX - 83021']),
    ...pMat,
    foto('EVIDÊNCIAS DOS LADOS DA PLATAFORMA', {obrigatorio:true,
      ajuda:'A evidência pode ser geral, mas caprichem na qualidade: a estrutura da plataforma precisa ser de vários ângulos. (até 10 fotos)'}),
    foto('PROTEÇÃO NAS PARTES METÁLICAS COM FILME STRACH', {obrigatorio:true,
      ajuda:'A evidência pode ser geral, porém deve ser apresentada com qualidade e detalhes suficientes para avaliação. É imprescindível que contenha um timestamp com local, data e hora corretamente registrados. (até 10 fotos)'}),
    foto('RESGISTRO DO PAINEL ELÉTRICO', {ajuda:'REGISTRO FOTOGRÁFICO DO PAINEL COM LACRES VISÍVEIS.'}),
    foto('RESGISTRO DO CONTROLE JOYSTICK', {ajuda:'REGISTRO FOTOGRÁFICO DO JOYSTICK COM LACRES VISÍVEIS.'}),
    foto('RESGISTRO DA CAIXA DE FIAÇÃO (MOTOR)', {ajuda:'REGISTRO FOTOGRÁFICO DA CAIXA COM LACRES VISÍVEIS.'}),
    foto('RESGISTRO DO ELETROGUINCHO', {ajuda:'REGISTRO FOTOGRÁFICO DO ELETROGUINCHO COM LACRES VISÍVEIS.'}),
    foto('RESGISTRO DA BALANÇA', {ajuda:'REGISTRO FOTOGRÁFICO DA BALANÇA COM LACRES VISÍVEIS.'}),
    foto('RESGISTRO DOS CABOS DE AÇO (ENROLADOS)', {ajuda:'REGISTRO FOTOGRÁFICO DAS 3 UNIDADES DE CABOS ENROLADOS.'}),
    foto('RESGISTRO DO ENROLADOR PARA CABO DE AÇO', {ajuda:'REGISTRO FOTOGRÁFICO DO EQUIPAMENTO.'}),
    foto('RESGISTRO DO TIFFOR', {ajuda:'REGISTRO FOTOGRÁFICO DO EQUIPAMENTO.'}),
    foto('RESGISTRO DAS MANILHAS', {ajuda:'REGISTRO FOTOGRÁFICO DAS MANILHAS VISÍVEIS.'}),
    foto('RESGISTRO DAS CINTAS DE IÇAMENTO', {ajuda:'REGISTRO FOTOGRÁFICO DAS CINTAS ORGANIZADAS E VISÍVEIS.'}),
    foto('RESGISTRO DO CONTRAPESO', {ajuda:'REGISTRO FOTOGRÁFICO DO EQUIPAMENTO VISÍVEL.'}),
    foto('RESGISTRO DO TROLLER', {ajuda:'REGISTRO FOTOGRÁFICO DO EQUIPAMENTO VISÍVEL.'}),
    foto('RESGISTRO DO TRAVA QUEDAS', {ajuda:'REGISTRO FOTOGRÁFICO DO EQUIPAMENTO VISÍVEL.'}),
    foto('RESGISTRO DO BALANCIN', {ajuda:'REGISTRO FOTOGRÁFICO DO EQUIPAMENTO VISÍVEL.'}),
    foto('RESGISTRO DO CABO DE ALIMENTAÇÃO', {ajuda:'REGISTRO FOTOGRÁFICO DO CABO BEM ENROLADO E VISÍVEL.'}),
    foto('INSPEÇÃO COMPLEMENTAR — REGISTRO FOTOGRÁFICO SEQUENCIAL', {
      ajuda:'No formulário original este item é um vídeo de até 1:30 min. Este app gera PDF e só aceita imagens — registre uma sequência de fotos cobrindo o mesmo percurso do vídeo.'}),
    memo('COMO ESTÁ O FUNCIONAMENTO DA PLATAFOMRA ?'),
    cProbP,
    memo('DESCREVA AQUI !!!!!', {ajuda:'Espaço reservado para detalhamento de equipamentos que estejam não conformes.',
      cond:{uid:cProbP.uid, op:'igual', valor:'Sim'}}),
    assin('ASSINATURA DO RESPOSÁVEL.')
  ]
};

/* ===================================================================
   3) CHECK LIST DE VEÍCULOS
   =================================================================== */
seq = 0;
const vMat = matriz(
  'Pontos de inspeção',
  '',
  [
    'Quanto ao funcionamento do motor',
    'Quanto ao nível de óleo, radiador e freios',
    'Quanto aos sistemas elétricos existentes no carro (alarme, sensor de ré, freios e faróis, setas, lanternas, pisca alerta)',
    'Quanto a buzina',
    'Quanto aos freios',
    'Quanto aos limpadores de para-brisa',
    'Quantos aos pedais',
    'Quanto aos cintos de segurança',
    'Quanto aos pneus',
    'Quanto ao sistema hidráulico',
    'As placas estão visiveis',
    'Quanto aos itens macaco, chave de roda e triangulos',
    'Quanto a lataria do veículo',
    'As capas dos bancos estão sendo utilizados'
  ],
  ['conforme', 'não conforme', 'não aplicado']
);

const ALTURA = ['entre 6,7mm até 4,7mm', 'entre 4,7mm até 3,7mm', 'entre 3,7mm até 2,7mm', 'abaixo de 2,7mm'];
const INTRO_FOTOS = 'Quase lá! 📸 Agora precisamos de algumas fotos do veículo para completar o checklist. ' +
                    'Certifique-se de capturar imagens claras e que mostrem os detalhes solicitados. ' +
                    'ATENÇÃO! Siga os exemplos de fotos mostradas acima de cada solicitação.';

const cCarrocinha = opc('Veículo transporta carrocinha ?', ['SIM', 'NÃO'], {obrigatorio:true});
const cAvaria = opc('Houve alguma avaria após o último check list ?', ['sim', 'não'], {obrigatorio:true});
const seCarrocinha = ()=> ({cond:{uid:cCarrocinha.uid, op:'igual', valor:'SIM'}});

const veiculo = {
  titulo: 'CHECK LIST DE VEÍCULOS',
  subtitulo: 'Extreme Wind Blade Services — Inspeção semanal',
  destino: {
    url: '', pasta: '/EW - CHECKLIST FROTAS/VEICULOS', sub: '{MM-AAAA}',
    arquivo: 'CHECKLIST_VEICULO_{campo:Placa}_{DD}-{MM}-{AAAA}_{ID}',
    sheet: true, sheetUrl: '', sheetId: ''
  },
  campos: [
    txt('Modelo', {obrigatorio:true, ajuda:'Veículo — modelo.'}),
    txt('Placa', {obrigatorio:true, ajuda:'Veículo — placa.'}),
    txt('Nome do Motorista', {obrigatorio:true}),
    txt('Nome do Parque', {obrigatorio:true}),
    txt('Cidade - Estado', {obrigatorio:true}),
    dt('Data', {obrigatorio:true}),
    num('Quilometragem do veículo', {obrigatorio:true, ajuda:'Atual no momento do checklist'}),
    ...vMat,
    foto('Frente do veículo', {obrigatorio:true, ajuda: INTRO_FOTOS}),
    foto('Para-choque Frontal Esquerdo', {obrigatorio:true}),
    foto('Lateral Esquerda', {obrigatorio:true}),
    foto('Para-choque Traseiro Esquerdo', {obrigatorio:true}),
    foto('Traseira do Veículo', {obrigatorio:true}),
    foto('Para-choque Traseiro Direito', {obrigatorio:true}),
    foto('Lateral Direita', {obrigatorio:true}),
    foto('Para-choque Frontal Direito', {obrigatorio:true}),
    foto('Para-brisa', {obrigatorio:true}),
    foto('Pneu dianteiro esquerdo + DOT', {obrigatorio:true, ajuda:'2 FOTOS VISÍVEIS.'}),
    opc('Qual é a altura do pneu dianteiro esquerdo ?', ALTURA),
    foto('Pneu dianteiro direito + DOT', {obrigatorio:true, ajuda:'2 FOTOS VISÍVEIS.'}),
    opc('Qual é a altura do pneu dianteiro direito ?', ALTURA),
    foto('Pneu traseiro esquerdo + DOT', {obrigatorio:true, ajuda:'2 FOTOS VISÍVEIS.'}),
    opc('Qual é a altura do pneu traseiro esquerdo ?', ALTURA),
    foto('Pneu traseiro direito + DOT', {obrigatorio:true, ajuda:'2 FOTOS VISÍVEIS.'}),
    opc('Qual é a altura do pneu traseiro direito ?', ALTURA),
    foto('Pneu estepe + DOT', {obrigatorio:true, ajuda:'2 FOTOS VISÍVEIS.'}),
    opc('Qual é a altura do pneu STEP ?', ALTURA),
    foto('Pneu estepe extra + DOT', {obrigatorio:true, ajuda:'2 FOTOS VISÍVEIS.'}),
    opc('Qual é a altura do pneu STEP EXTRA ?', ALTURA),
    foto('Calotas dos Pneus', {obrigatorio:true}),
    foto('Integridade do macaco do veículo', {obrigatorio:true, ajuda:'Fotografe as condições de uso do objeto.'}),
    foto('Integridade da chave de boca', {obrigatorio:true, ajuda:'Fotografe as condições de uso do objeto.'}),
    foto('Integridade do triângulo de segurança do veículo', {obrigatorio:true, ajuda:'Fotografe as condições de uso do objeto.'}),
    cCarrocinha,
    foto('Foto do reboque (mostrando tomada).', Object.assign({obrigatorio:true, ajuda:'Engate do veículo.'}, seCarrocinha())),
    foto('Foto da tomada da carrocinha.', Object.assign({obrigatorio:true}, seCarrocinha())),
    foto('Carrocinha — Lateral direita.', Object.assign({obrigatorio:true}, seCarrocinha())),
    foto('Carrocinha — Lateral esquerda.', Object.assign({obrigatorio:true}, seCarrocinha())),
    foto('Carrocinha — Feixe de molas.', Object.assign({obrigatorio:true, ajuda:'Ambos os lados.'}, seCarrocinha())),
    foto('Carrocinha — Eixos.', Object.assign({obrigatorio:true}, seCarrocinha())),
    foto('Carrocinha — Pneus.', Object.assign({obrigatorio:true, ajuda:'Ambos os lados.'}, seCarrocinha())),
    foto('Carrocinha — Estepe.', Object.assign({obrigatorio:true}, seCarrocinha())),
    foto('Carrocinha — DOT dos pneus.', Object.assign({ajuda:'Pneus + estepe.'}, seCarrocinha())),
    cAvaria,
    foto('Foto da avaria citada anteriormente.', {obrigatorio:true,
      cond:{uid:cAvaria.uid, op:'igual', valor:'sim'}}),
    memo('Descreva as condições atuais do veículo.', {obrigatorio:true,
      ajuda:'Descreva as condições a qual se encontra o veículo para que sejam tomadas as tratativas.'}),
    foto('CONDIÇÃO VEICULAR — REGISTRO FOTOGRÁFICO SEQUENCIAL', {
      ajuda:'No formulário original este item é um vídeo. Este app gera PDF e só aceita imagens — registre uma sequência de fotos cobrindo a volta completa no veículo.'}),
    assin('Assinatura do motorista responsável.', {obrigatorio:true})
  ]
};

/* ===================================================================
   Geração — idêntica ao botão "Gerar formulário" do construtor
   =================================================================== */
function esc(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

const fonte = fs.readFileSync(CONSTRUTOR, 'utf8');
const m = fonte.match(/<script id="tpl" type="text\/plain">([\s\S]*?)<\/script>/);
if(!m) throw new Error('template <script id="tpl"> não encontrado no construtor');
const TPL = m[1];

/* Duas costuras no HTML que sai do construtor, para o formulário virar
   uma página do site EW em vez de um arquivo solto:
   1) guard.js — mesmo porteiro de sessão das outras páginas (rdo, fotocard,
      calculadora, checklist). Sem ele o link direto pularia o login.
   2) seta "voltar" no cabeçalho — no celular o PWA roda sem barra de
      navegador, então sem esse botão não há como sair da tela.
   Todo o resto é exatamente o que o botão "Gerar formulário" produz. */
const GUARD = '<script src="../guard.js"><\/script>\n';
const CSS_VOLTAR = `
  .topo{display:flex;align-items:center;gap:12px}
  .topo .voltar{flex:0 0 auto;width:38px;height:38px;border-radius:50%;
    border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;
    display:grid;place-items:center;text-decoration:none;font-size:18px;line-height:1}
  .topo .voltar:hover{background:rgba(255,255,255,.14)}
`;

function costurar(html){
  html = html.replace('<meta name="viewport"', () => GUARD + '<meta name="viewport"');
  html = html.replace('</style>', () => CSS_VOLTAR + '</style>');
  html = html.replace(
    '<div class="topo"><h1 id="tTitulo"></h1><p id="tSub"></p></div>',
    () => '<div class="topo"><a class="voltar" href="index.html" title="Voltar" aria-label="Voltar">&#8592;</a>' +
          '<div><h1 id="tTitulo"></h1><p id="tSub"></p></div></div>'
  );
  if(html.indexOf('guard.js') < 0 || html.indexOf('class="voltar"') < 0 || html.indexOf('.topo .voltar') < 0)
    throw new Error('costura falhou — o template do construtor mudou');
  return html;
}

function gerar(modelo){
  const json = JSON.stringify(modelo).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
  const html = TPL
    .replace('__TITULO__', () => esc(modelo.titulo || 'Formulário'))
    .replace('__SCHEMA__', () => json)
    .split('@@FIM@@').join('</scr' + 'ipt>')
    .trim();
  return costurar(html);
}

/* validação: condição só vale se a origem vier antes */
function validar(nome, modelo){
  const pos = {};
  modelo.campos.forEach((c, k) => { pos[c.uid] = k; });
  const uids = new Set();
  modelo.campos.forEach((c, k) => {
    if(uids.has(c.uid)) throw new Error(nome + ': uid duplicado ' + c.uid);
    uids.add(c.uid);
    if(!c.rotulo || !c.rotulo.trim()) throw new Error(nome + ': campo ' + k + ' sem rótulo');
    if(c.cond){
      if(pos[c.cond.uid] == null) throw new Error(nome + ': cond aponta para uid inexistente ' + c.cond.uid);
      if(pos[c.cond.uid] >= k) throw new Error(nome + ': cond de "' + c.rotulo + '" aponta para campo posterior');
      const dono = modelo.campos[pos[c.cond.uid]];
      if((dono.opcoes || []).indexOf(c.cond.valor) < 0)
        throw new Error(nome + ': valor "' + c.cond.valor + '" não existe em "' + dono.rotulo + '"');
    }
  });
}

fs.mkdirSync(DESTINO, {recursive:true});
fs.mkdirSync(path.join(DESTINO, 'modelos'), {recursive:true});

const saidas = [
  ['gerador-eletrico', gerador],
  ['plataforma', plataforma],
  ['veiculo', veiculo]
];

saidas.forEach(([nome, modelo]) => {
  validar(nome, modelo);
  const html = gerar(modelo);
  fs.writeFileSync(path.join(DESTINO, nome + '.html'), html, 'utf8');
  fs.writeFileSync(path.join(DESTINO, 'modelos', nome + '.json'), JSON.stringify(modelo, null, 2), 'utf8');
  const nFoto = modelo.campos.filter(c => c.tipo === 'foto').length;
  const nCond = modelo.campos.filter(c => c.cond).length;
  console.log(nome.padEnd(18), String(modelo.campos.length).padStart(3) + ' campos',
              '| fotos ' + nFoto, '| condicionais ' + nCond,
              '| ' + Math.round(html.length / 1024) + ' KB');
});

console.log('');
console.log('Pronto. Confira no navegador antes de publicar.');
