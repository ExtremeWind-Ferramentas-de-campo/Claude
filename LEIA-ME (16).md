# Extreme Wind — Ferramentas de Campo

Site único no GitHub Pages: uma tela de entrada, um menu, quatro apps.

## O que mudou nesta versão

- **O login saiu do RDO e virou a porta do site.** Quem abre qualquer página cai na tela de entrada. Depois de entrar, o menu aparece e os quatro apps abrem sem digitar nada de novo.
- **Os quatro apps agora exigem login** — antes, calculadoras, checklist e fotocard abriam para qualquer um com o endereço.
- **Um service worker só.** Eram três (raiz, `fotocard/`, RDO), e cada um apagava o cache dos outros na ativação. Era o motivo de o app "perder o offline" sozinho.
- Cada app ganhou sua pasta.

## Estrutura

```
/
├── index.html                    tela de entrada + hub + menu das ferramentas
├── guard.js                      porteiro de sessão
├── prazos.js                     sinal de prazo semanal nos cartões
├── sw.js                         service worker (offline)
├── manifest.json                 instalação como app
├── logo-ew.png, logo-oem*.png    logos (compartilhados)
├── icon-192.png, icon-512.png    ícones
├── .nojekyll
│
├── meus-dados/                   hub pessoal (vem ANTES das ferramentas)
│   ├── index.html                submenu Meus Dados
│   ├── pe-de-meia.html           consulta dos valores guardados
│   ├── cursos.html               descontos de cursos (gerado)
│   └── dividas.html              valores em aberto (gerado)
│
├── rdo/index.html                Relatório Diário de Operação
├── fotocard/                     Fotocard / Timestamp
│   ├── index.html
│   ├── sw.js                     stub que desinstala o SW antigo
│   ├── manifest.json, icon-*.png, README.md
├── calculadora/
│   ├── index.html                seletor de cliente (era calculadora.html)
│   ├── calculadora-nordex.html
│   ├── calculadora-ge.html
│   └── calculadora-siemens.html
├── Checklist Almoxarifado/
│   ├── menu.html                 submenu: Almoxarifado/Segurança e Frotas (é o que o menu abre)
│   ├── almoxarifado-seguranca.html   Materiais + 5 checklists de inspeção (forms.app)
│   └── index.html                Checklist de Materiais
├── Checklist Frotas/
│   ├── index.html                seletor dos 3 checklists de frota
│   ├── gerador-eletrico.html     gerado pelo construtor
│   ├── plataforma.html           gerado pelo construtor
│   ├── veiculo.html              gerado pelo construtor
│   ├── _costurar.js              guard.js + seta voltar + marcação de prazo
│   └── modelos/                  construtor-formulario_2.html + os 3 .json
│
├── EW-Apps-Script-RDO/Code.gs    backend do RDO (colar no Apps Script)
├── EW-Sheets-Script/Code.gs      backend das calculadoras/checklist
├── ew-dropbox-proxy/worker.js    Cloudflare Worker
└── SEGURANCA.md                  revisão de segurança de 06/08/2026
```

## As duas telas depois do login

Entrando, o técnico cai no **hub**, com duas opções:

| Opção | Vai para |
|---|---|
| Ferramentas de Campo | `index.html#ferramentas` — os quatro apps de sempre |
| Meus Dados | `meus-dados/index.html` |

O hub e o menu de ferramentas moram no **mesmo `index.html`**, trocados pelo
`#hash`. Foi feito assim para não mexer no caminho relativo de nenhum app: se o
menu tivesse virado uma pasta, `rdo/index.html` e companhia teriam que virar
`../rdo/index.html` em todo lugar.

Por causa disso, a seta "voltar" dos apps aponta para `../index.html#ferramentas`,
e não para `../index.html` — senão o técnico voltaria para o hub e teria que dar
dois toques toda vez. Já as saídas por **logout ou sessão expirada** continuam
indo para `../index.html` puro, que é onde mora a tela de entrada.

## Meus Dados — Pé de meia, Cursos e Dívidas

Três consultas, três abas da **mesma planilha**, mesma mecânica:

| Tela | Aba | Busca por | Linhas por pessoa |
|---|---|---|---|
| Pé de meia | `Pé de meia` | CPF | 1 |
| Cursos | `Cursos` | matrícula | N (um curso cada) |
| Dívidas | `Dívidas` | matrícula | N (uma dívida cada) |

Não achou a pessoa → mensagem própria de cada tela ("Não há valor guardado na
sua conta", "Não há desconto relacionado ao pagamento de cursos", "Não há
dívidas registradas na sua conta"). A data da coluna H aparece nos dois casos,
achando ou não.

**Nem o CPF nem a matrícula viajam pelo navegador.** A sessão do site guarda só
token, nome e matrícula. Quem faz a ligação é o backend: o token é assinado e
carrega a matrícula; daí sai o CPF (mini master, coluna H) para o Pé de meia, ou
a própria matrícula para Cursos e Dívidas. Sem sessão válida ninguém consulta
nada, e o CPF nunca volta para a tela.

### Uma consulta só no backend

Tudo passa por `consultaPessoal({token, tipo})`, e o catálogo das três abas mora
em **`CP_CONSULTAS`**, no `Code.gs`. Para acrescentar uma quarta aba amanhã
basta uma entrada lá e um HTML novo — o resto do backend não muda.

A ação antiga `peDeMeia` continua existindo como atalho para
`consultaPessoal({tipo:'peDeMeia'})`. É por isso que o `pe-de-meia.html` não
precisou ser trocado junto: quem já tem a versão antiga no celular continua
funcionando enquanto o service worker não atualiza.

### O que precisa estar configurado

1. **Colar o `EW-Apps-Script-RDO/Code.gs` novo** no projeto do Apps Script do RDO.
2. **Publicar como NOVA VERSÃO da implantação existente** (Implantar → Gerenciar
   implantações → lápis → Versão: Nova versão). Criar uma implantação nova geraria
   outro endereço e o login pararia de funcionar.
3. **Dar acesso de leitura** da planilha à conta que publicou o Apps Script.
   Sem isso a consulta devolve erro de permissão.
4. Rodar **`testarConsultas()`** no editor e ler o log: ele percorre as três abas
   e mostra linha do cabeçalho, colunas achadas, colunas NÃO achadas, data e
   quantas pessoas entraram na tabela. É o teste que diz se a leitura acertou o
   layout — e o único jeito de saber que a aba `Dívidas` foi encontrada.

Propriedades do Script opcionais: `PEDEMEIA_SHEET_ID`, `PEDEMEIA_ABA`,
`CURSOS_ABA`, `DIVIDAS_ABA`. Os padrões já apontam para os nomes atuais.

### Como as abas e as colunas são achadas

**A aba** é achada pelo nome ignorando acento e caixa (`cpAcharAba`), com nome
exato tendo prioridade. `Dívidas`, `DÍvidas` e `dividas` chegam todas na mesma
aba — o nome real da aba estava escrito de dois jeitos diferentes na origem, e
não vale a pena a tela quebrar por causa disso.

**O cabeçalho** não é por posição fixa, porque planilha de administração muda de
lugar. O backend varre as 40 primeiras linhas procurando a linha que tenha a
coluna-chave (`CPF` ou `MAT`) e pelo menos dois dos títulos de valor. A
comparação passa por `pdmNorm()`, que tira acento, sobe para maiúscula e troca
pontuação por espaço — é o que faz `PÉ-DE-MEIA DA SEMANA` casar com
`PE DE MEIA DA SEMANA`.

**O casamento é em dois passes** (`cpCasarCabecalho`): primeiro igualdade exata,
depois "contém" só para o que sobrou, pulando coluna já usada. Isso não é
preciosismo: `VALOR` é pedaço de `VALOR PAGO`. Com um pass só de substring, uma
planilha que trouxesse `VALOR PAGO` antes de `VALOR` grudaria o campo Valor na
coluna errada — e o técnico veria número trocado sem nenhum erro na tela.

**A data** vem de outro caminho: procura na **coluna H**
(`PDM_COL_DATA_PADRAO`) a célula que começa com "Valor atualizado em", e pega a
de baixo (olha até 3 linhas abaixo se estiver vazia). Não achando na H, varre as
outras colunas.

### As telas de Cursos e Dívidas são geradas

`cursos.html` e `dividas.html` saem do mesmo template — só mudam rótulo, ícone,
cor e a mensagem de "não tem nada". **Não edite os dois à mão**: a primeira
correção feita só num deles já faz os dois divergirem. O gerador é o
`meus-dados/_gerar-telas.py` que veio junto; mexa nele e rode de novo.

O `pe-de-meia.html` ficou de fora do gerador de propósito: ele mostra 1 linha,
não uma lista, e forçar os dois formatos no mesmo template deixaria o template
mais complicado que os dois arquivos separados.

### Decisões que valem revisar

- **Sem cache dos valores no aparelho.** Offline a tela diz que precisa de
  internet, em vez de mostrar número velho. Valor de dinheiro desatualizado
  gera mais confusão do que valor nenhum. O cache do lado do servidor é de
  5 minutos (`PDM_CACHE_SEG`).
- **O plano B por JSONP manda o token na URL.** É o mesmo caminho que o login já
  usa, e existe porque em alguns aparelhos o navegador não deixa ler a resposta
  do POST. Para cortar: apague os blocos `p.acao === 'peDeMeia'` e
  `p.acao === 'consultaPessoal'` do `doGet` e a `pedirJsonp()` dos HTML.
- **Total só aparece com mais de um item.** Com um curso só, repetir o mesmo
  número embaixo não informa nada. Está em `consultaPessoal`, no `if
  (regs.length > 1)`.
- **Saldo devedor zerado sai em verde com ✓.** É a informação que o técnico
  procura primeiro. Classe `.quitado` nos HTML gerados.
- **O campo destacado** de cada tela é o `destaque` do `CP_CONSULTAS`: hoje
  `total` no Pé de meia e `saldo` nas outras duas.

## Como o login funciona

1. `index.html` pede matrícula e CPF e manda para o Apps Script do RDO.
2. Deu certo: grava `ew_sessao` no `localStorage` (token, nome, matrícula, validade de 48 h).
3. `guard.js` roda no `<head>` de cada app. Sem sessão válida, a página nem monta — volta para o menu.
4. O RDO manda o `token` junto em cada envio, e o Apps Script confere.

O `guard.js` deriva o endereço da raiz pelo próprio `src`, então funciona tanto em `usuario.github.io` quanto em `usuario.github.io/Repositorio/`.

## Publicar

1. Suba o conteúdo desta pasta para a raiz do repositório.
2. Settings → Pages → Branch `main`, pasta `/ (root)`.
3. Abra num celular e teste a entrada.

## Publicou versão nova e o técnico continua vendo a antiga?

O service worker busca pela rede primeiro, então a versão nova chega sozinha na primeira abertura com internet. Para forçar, suba o número em `sw.js`:

```js
const CACHE = 'ew-site-v25';   // v26, v27...
```

Se `CORE` ganhar um arquivo que não existe, a instalação inteira do service worker falha e ninguém fica com offline. Ao renomear ou mover arquivo, ajuste a lista.

## Trocar o endereço do Apps Script do RDO

Aparece em dois lugares, e os dois precisam ser iguais:

- `index.html` — constante `ENDPOINT`, no bloco de login
- `rdo/index.html` — constante `ENDPOINT`

## Detalhes que vale saber

- **Sem internet só entra quem já entrou antes.** A conferência de matrícula e CPF é feita pelo servidor. Dentro das 48 h da sessão tudo funciona offline; passado o prazo, o técnico precisa de sinal uma vez.
- **A fila offline do RDO não se perde no logout.** Ela mora no IndexedDB, separada da sessão. Mas só volta a subir depois de entrar de novo.
- **`fotocard/sw.js` virou um stub de desinstalação.** Os celulares que já usaram o Fotocard têm o service worker antigo instalado naquela pasta; é de lá que o navegador busca a atualização. Ele se desinstala e apaga o cache próprio. Dá para apagar o arquivo daqui a alguns meses, quando todo mundo já tiver aberto o app uma vez com internet.
- **`html2canvas.min.js` ficou de fora** (198 KB). O Fotocard só o citava num comentário — o card é desenhado no Canvas 2D nativo desde a v38.
- **`fotocard - Atalho.lnk` ficou de fora.** É atalho do Windows, não serve no site.
- **O `guard.js` não é segurança, é conveniência.** Qualquer pessoa grava uma sessão falsa pelo console e abre as telas. O que protege os dados é o backend conferir o token — o Apps Script do RDO faz isso, com bloqueio de 10 minutos após tentativas demais.

## Os quatro checklists de inspeção (forms.app)

Ficam em `Checklist Almoxarifado/almoxarifado-seguranca.html` e são só atalhos: abrem em nova
aba os formulários hospedados no forms.app. Não guardam nada no aparelho e não
funcionam offline — o técnico precisa de sinal para preencher e enviar, e as
respostas caem no painel do forms.app, não no Sheets nem no Dropbox da EW.

| Botão | Endereço |
|---|---|
| Acesso por Cordas | `https://099hu7e7.forms.app/checklistquipamentosindividuais-1` |
| Equipamentos Individuais | `https://099hu7e7.forms.app/checklistquipamentosindividuais` |
| Ferramentas Gerais | `https://checklist.forms.app/formulario-de-ferramentas` |
| Kit LOTO | `https://checklist.forms.app/formulario-de-ferramentas-1` |

O checklist de **Plataforma saiu desta lista em 27/08/2026**: ele virou página
do próprio site, em `Checklist Frotas/plataforma.html`. Deixar os dois no ar
geraria duas versões da mesma conferência, cada uma mandando a resposta para um
lugar diferente.

Para trocar um endereço, mexa só no `href` do cartão correspondente.

## Prazo semanal dos checklists

`prazos.js` (raiz) pinta o cartão do checklist de vermelho conforme o prazo se
aproxima. A janela abre toda **sexta**:

| Checklist | Id | Prazo | Baixa |
|---|---|---|---|
| Materiais | `materiais` | segunda | automática (ao enfileirar o envio) |
| Acesso por Cordas | `cordas` | segunda | manual |
| Equipamentos Individuais | `epi` | segunda | manual |
| Ferramentas Gerais | `ferramentas` | segunda | manual |
| Kit LOTO | `loto` | segunda | manual |
| Veículos (Frotas) | `veiculo` | terça | automática (ao gerar o PDF) |

Prazo de segunda → cartão volta ao normal na terça. Prazo de terça → volta na
quarta.

**Baixa manual**: os quatro de inspeção moram no forms.app, que não tem como
avisar o site que foram preenchidos. Nesses, o técnico toca na etiqueta
vermelha e confirma. A etiqueta tem ✓ e alvo de toque de 30 px, e o toque não
abre o formulário (`preventDefault` — o cartão é um link).

O tom fecha a cada dia — âmbar na sexta, vermelho forte no dia do vencimento,
com a etiqueta piscando. Passado o prazo o cartão volta ao normal, tenha sido
feito ou não, e fica assim até a sexta seguinte.

**Feito** baixa o alerta na hora e vale até o fim do ciclo, por checklist —
dar baixa no Kit LOTO não apaga o alerta dos outros quatro.

Onde aparece: os **seis cartões** de checklist, mais três cartões-resumo que
juntam vários — **Checklist** no menu principal, e **Almoxarifado — Segurança**
e **Frotas** no submenu. O resumo mostra o mais urgente e quantos ainda faltam
("4 pendentes · Vence amanhã").

Para pôr num cartão, basta `data-ew-prazo`. Aceita um id (`veiculo`), um grupo
(`almoxarifado`, `frotas`) ou vários separados por vírgula. Os grupos ficam em
`GRUPOS`, no `prazos.js` — checklist novo entra ali e todos os cartões-resumo
passam a contar com ele, sem mexer em HTML nenhum.

**É sinal visual, não é controle.** O "feito" mora no `localStorage`, que é por
aparelho e por navegador: o telefone do técnico não sabe que o do colega já
fez. Quem tem a verdade é a planilha. Isto serve para lembrar quem está com o
aparelho na mão.

Para mudar prazo ou escala de cor, mexa em `PRAZOS` e `cor()` no `prazos.js` —
os dois valem para o site inteiro.

## Checklist Frotas

Três checklists que **não** dependem do forms.app: rodam no próprio site, geram
o PDF no aparelho e funcionam offline depois da primeira abertura.

| Checklist | Arquivo | Origem |
|---|---|---|
| Gerador elétrico | `Checklist Frotas/gerador-eletrico.html` | `https://checklist.forms.app/check-list-gerador-eletrico` |
| Plataforma | `Checklist Frotas/plataforma.html` | `https://checklist.forms.app/formulario-plataforma-` |
| Veículo (semanal) | `Checklist Frotas/veiculo.html` | `https://checklist.forms.app/formulario-de-inspecao-do-veiculo` |

Os três HTML são **gerados**, não escritos à mão. Quem manda é o modelo JSON em
`Checklist Frotas/modelos/`. Para mudar uma pergunta:

1. Abra `Checklist Frotas/modelos/construtor-formulario_2.html`.
2. **Abrir modelo** → escolha o `.json` do checklist.
3. Edite, **Gerar formulário**, **Baixar arquivo** e substitua o HTML na pasta.
4. Baixe também o modelo atualizado (**Salvar modelo**) por cima do `.json`.

O passo 4 não é opcional: se o `.json` ficar velho, a próxima edição parte de
uma versão anterior e desfaz o que você acabou de fazer.

Depois de substituir qualquer um dos três HTML, rode `node _costurar.js` na
pasta.

**Duas costuras** são aplicadas ao que sai do construtor, e é o `_costurar.js`
que faz isso: o `<script src="../guard.js">` (senão o link direto pula o login)
e a seta "voltar" no cabeçalho (no PWA não existe barra de navegador). Sem a
seta, quem entra num checklist fica preso e o menu parece não funcionar.

### O que mudou em relação ao forms.app

- **Matriz de seleção** virou uma pergunta de escolha única por linha — o
  construtor não tem tabela de rádios. As opções (Conforme / Não conforme / N/A)
  são as mesmas, e o PDF sai linha a linha.
- **Vídeo** virou registro fotográfico sequencial. O PDF é montado no aparelho
  pelo jsPDF e não embute vídeo.
- **Nome completo** (Parque / Veículo) virou dois campos de texto, com os
  mesmos rótulos que o forms.app usava.
- **Página de boas-vindas e quebras de página** não existem: o formulário é uma
  rolagem só. Os textos de instrução foram para o campo de ajuda logo abaixo.
- A matriz eletromecânica do gerador tem **"Quanto ao marcador de combustível?"
  repetido** — o erro está no formulário original. Ficou como
  `... ? (2)` para dar para distinguir no PDF. Vale corrigir na fonte.

Texto de pergunta ficou igual ao original, erros de digitação inclusive
(`PLATAFOMRA`, `RESGISTRO`) — é o que o técnico reconhece. Opção de resposta e
texto de ajuda com erro foram corrigidos, porque saem impressos no PDF:
`não alicado` → `não aplicado`, `RIGIÃO` → `REGIÃO`. O `LEIA-ME.md` da pasta
`Checklist Frotas/` lista tudo item a item.

### Para onde vai o PDF

Hoje: só para os downloads do aparelho. O campo **Endereço do Apps Script** está
vazio de propósito nos três modelos. Preenchendo esse campo no construtor (e
regerando), o formulário passa a mandar o PDF para o Dropbox e a linha para a
planilha, como o RDO faz. As pastas de destino já estão escritas nos modelos:
`/EW - CHECKLIST FROTAS/<EQUIPAMENTO>/<MM-AAAA>/`.

## Checklist de Materiais — revisão de 27/08/2026

**Nordex e GE deixaram de dividir a mesma lista.** Eram `LISTA_NORDEX_GE`; hoje
são `LISTA_NORDEX` (43 itens) e `LISTA_GE` (47). Mexer numa não mexe na outra.

| Mudança | Nordex | GE | Siemens |
|---|---|---|---|
| TECIDO BIAX 750 | saiu | saiu | — |
| BALSA CORE 50 | saiu | saiu | — |
| BALSA CORE 32MM / 45MM | — | entraram | — |
| ESPUMA 20MM | ficou | virou `ESPUMA DE PVC S/ GROOVING 20MM` | — |
| RESINA LR-135 + ENDURECEDOR LH-135 | saíram | saíram | — |
| ENDURECEDOR LH-637 | entrou | entrou | — |
| TYVEK 60% | virou `TYVEK` | virou `TYVEK` | já era `TYVEK` |
| LOCTITE | virou `LOCTITE-243` | virou `LOCTITE-243` | — |
| COMBI | virou `COMBI 900` | virou `COMBI 900` | já era `COMBI 900` |
| MACACÃO 100% | saiu | saiu | — |
| Resina/endurecedor alternativos de balanceamento | — | entraram | já tinha |
| CYTEC — SCOTER | — | — | saiu |
| BASE MASSA — CRYSTIC X401 | — | — | virou `MASSA FILLER POLYESTER` |
| MASSA GT60 | — | — | entrou |
| ENDURECEDOR MASSA / GEL COAT — MEKP | — | — | saíram |
| BASE ADESIVO — SIKAFORCE-818 L07 | — | — | virou `ADESIVO — SIKAFORCE 818-L07` |
| ENDURECEDOR ADESIVO — SIKAFORCE-050 | — | — | saiu |

Os preços novos vieram da lista mestra: LH-637 = 708 (R$ 286,38), BALSA 32MM =
726 (R$ 346,00), BALSA CORE 45MM = 363 (R$ 550,20), ESPUMA S/ GROOVING = 202
(R$ 232,50), MASSA FILLER POLIESTER = 733 (R$ 70,52), ADESIVO SIKAFORCE = 338
(R$ 212,00), alternativos = 720/721.

**Só a MASSA GT60 ficou sem preço** — não existe código com "GT60" na lista
mestra. Ela conta normalmente no checklist e aparece no bloco "MATERIAIS SEM
PREÇO" do relatório. Enquanto estiver lá, o total da Siemens está subestimado.

**Duas traduções do `MAPA_MAT` foram REMOVIDAS, não redirecionadas**: o par
Hexion LR-135/LH-135 e o SikaForce-050. Se a calculadora ainda lançar esses
materiais, eles aparecem como "material não encontrado no checklist" — visível,
em vez de somar em silêncio no material errado. Quando a engenharia disser qual
é o substituto, aponte no `MAPA_MAT`.

**Um bug foi corrigido de passagem**: `["LH637", "ENDURECEDOR LH 635"]` mandava
todo consumo de LH-637 da calculadora para o LH-635, porque o LH-637 não existia
no checklist. Agora existe e aponta para si.

### Material fora da lista

O parque recebe coisa que a lista mestra não prevê, e isso não era contado.
Agora tem, no fim da lista, **"Há material em campo que não está na lista?"** —
Sim abre linhas de Material + Quantidade + unidade. As linhas vão para a
planilha como qualquer outro item; como não têm preço cadastrado, caem sozinhas
no bloco "MATERIAIS SEM PREÇO", que é o lugar certo para alguém decidir se
viram item de lista. Guardado por cliente E por modo (estoque/entrada), igual às
quantidades. Linha pela metade (só nome ou só quantidade) trava o envio.

**Quantidade zero não pede foto** — já era assim antes desta revisão
(`Number(qtd) > 0` em `pendencias()`): item zerado não tem tambor no parque
para fotografar.

### Entrada de material está DESLIGADA

Desativada a pedido da engenharia em 27/08/2026. A aba continua na tela,
apagada e com o selo `off`, para o técnico saber que a função existe e está
desativada — e não achar que sumiu do app.

**Para religar: `const ENTRADA_ATIVA = true;` no `index.html` do checklist.**
Só isso. O estado da aba, o bloqueio do clique e a coerção do modo salvo saem
todos dessa flag — não há segundo lugar para lembrar.

O código da entrada continua inteiro: o modo, as chaves separadas de
armazenamento (`ew_checklist_ent_*` / `ew_checklist_fent_*` / `ew_checklist_xent_*`),
a exigência de lote e validade, e o tratamento de linhas ENTRADA no Apps Script.
Nada foi apagado.

Quem tinha o aparelho salvo no modo entrada cai em "contagem de estoque" ao
abrir, e o valor salvo é corrigido — em vez de ficar preso numa aba que não
responde. O que já foi enviado como ENTRADA continua na planilha e continua
sendo usado pelas análises.

Enquanto estiver desligada, o consumo calculado pela análise semanal **não
desconta reabastecimento**: um material que foi reposto no parque aparece como
se tivesse sido consumido menos do que foi. Contagem de estoque não é afetada.

## Checklist de Materiais — unidades, fotos e PDF

**A unidade não é mais escolhida em campo.** Ela vem das planilhas de
acompanhamento de materiais e está fixa no `index.html` do checklist, em
`UNIDADE_NORDEX_GE` (aba "Contagem") e `UNIDADE_SIEMENS` (aba "PADRÃO"). O
motivo é a conferência semanal: se o app mandar `un` onde a planilha espera
`kg`, a comparação não fecha. Traduções aplicadas: `KG`→`kg`, `M²`→`m²`,
`ML` (metro linear) e `M`→`m`, `UN`/`UND`→`un`, `LT`→`L`.

Ao incluir material novo na lista, acrescente a unidade nesses dois mapas —
sem entrada no mapa, o item cai no `un` padrão.

Duas exceções deliberadas: **macacão 100%** e **fita crepe larga** estão na
planilha como `KG` e classificados como QUÍMICOS. São consumíveis, e no app
valem `un` — a engenharia decidiu assim em 26/08/2026. Na aba PADRÃO a "FITA
CREPE" já é `UN`, o que confirma que o `KG` da aba Contagem é erro de digitação.
Enquanto a planilha não for corrigida, a coluna Unidade da aba `Checklist_*`
vai dizer `un` para esses dois e a planilha de acompanhamento vai dizer `KG`.
Não quebra cálculo nenhum (a análise só usa a quantidade), mas é divergência
visível — corrija a planilha quando der.

Seis itens Siemens não existem em nenhuma das duas abas — massa, gel coat e
adesivo (Crystic, MEKP, SikaForce) e a fita 3M WPT2. A unidade deles é
suposição nossa e está marcada com comentário no arquivo.

**Foto dos químicos.** Resina, endurecedor, pintura, adesivo, massa, gel coat,
diluente e parafina ganharam campo de foto (é a mesma lista de `PERECIVEIS`,
via `ehQuimico`). A foto é reduzida para 1000 px no maior lado e gravada como
JPEG de qualidade 0,6 — dá uns 80 KB, o bastante para ler rótulo de lote. Ela
mora em chave separada da contagem (`ew_checklist_fest_*` / `ew_checklist_fent_*`)
para que estourar a cota do navegador gravando foto não leve a contagem embora.
`Limpar QTDs` apaga as fotos do modo atual junto.

Só é cobrada foto de químico **com quantidade** — item zerado não tem tambor no
parque para fotografar.

**Os botões só liberam com tudo preenchido.** `Enviar para a planilha` e
`Compartilhar (PDF)` ficam travados até: cabeçalho completo, TODOS os itens com
quantidade (zero conta — numa contagem "não tem nenhum" é resposta), todo
químico com quantidade com foto, e — na entrada — lote e validade dos
perecíveis. A tarja acima dos botões diz o que falta.

**O zero vai para a planilha.** `coletados()` manda todo item que tem valor,
inclusive `0` — é o que diz "conferi e não tem nenhum". Sem essa linha o
material desaparecia da janela da análise semanal e `consumoPeloChecklist` não
tinha base nem fim para fechar o consumo daquele material.

O `Code.gs` não precisou de mudança: ele já gravava `Number(item.qtd) || 0`, o
upsert por Semana+Parque+Material+Tipo não filtra valor, e `coletarLotes_()`
ignora linha sem validade — então perecível zerado não gera alerta falso. O
efeito prático é que cada envio agora grava a lista inteira (45 a 47 linhas por
cliente/parque/semana) em vez de só os itens com sobra.

Cuidado ao mexer em `pendenciasLote()`: lote e validade só são cobrados de
perecível com quantidade **maior que zero**. Sem esse filtro, desde que o
`coletados()` passou a trazer os zeros, o app passaria a exigir rótulo de
material que nem foi recebido.

**Compartilhar gera o PDF no próprio aparelho.** `gerarPDF()` escreve o PDF à
mão, sem biblioteca: o app precisa funcionar offline e a política de segurança
da página não deixa carregar script de fora. São páginas A4 com Helvetica
(WinAnsiEncoding, que cobre o português) e as fotos embutidas como JPEG via
filtro `DCTDecode` — sem recompressão. Depois vai para o `navigator.share` com
o arquivo anexado, que é o que abre o WhatsApp. Onde o navegador não sabe
compartilhar arquivo, o PDF é baixado para anexar à mão.

`Exportar CSV` e `Imprimir / PDF` saíram.

## Gasto em R$ (Apps Script)

O preço unitário mora no `EW-Sheets-Script/Code.gs`, em `PRECO_NORDEX_GE` e
`PRECO_SIEMENS`. Veio das duas planilhas de acompanhamento: aba
"Comparativo W30 vs W31" (Nordex) e aba "PADRÃO" (Siemens). A tabela é por
cliente porque as duas planilhas divergem — TECIDO BIAX 450 é R$ 41,48 na
Nordex e R$ 44,20 na Siemens.

A busca passa por `norm()`, então travessão, acento e caixa não atrapalham, e o
material que vem da calculadora é traduzido por `traduzirMaterial()` antes —
uma tabela serve às duas fontes.

**Duas colunas novas nas abas `Checklist_*`:** `Valor unit (R$)` e
`Valor total (R$)`. Elas guardam o valor da LINHA (QTD × preço): numa linha de
ESTOQUE é quanto vale o que está parado no parque, numa de ENTRADA é quanto
entrou. **Não é gasto.** Entraram no fim do cabeçalho, então nenhuma linha
antiga saiu de lugar.

**Gasto é consumo × preço**, e sai em duas abas novas:

| Aba | Janela | O que traz |
|---|---|---|
| `Gasto Semanal (R$)` | 8 semanas | resumo por parque/semana, detalhe por material, materiais sem preço |
| `Gasto Mensal (R$)` | mês corrente + 6 meses de histórico | fechamento mês a mês, por parque, por material |

Consumo pelo checklist entre duas contagens é
`estoque(anterior) + entradas no meio − estoque(atual)`, com as entradas
filtradas por DATA (não por número de semana — na virada do ano a semana 1 é
menor que a 52 e comparar número daria janela errada). Material com uma
contagem só não gera gasto: sem duas medições não há como saber o que saiu.
Consumo negativo aparece com aviso na coluna Obs — é contagem errada ou entrada
não lançada.

Consumo pela calculadora é a quantidade pesada na aba `Consumo_Reparos`. As duas
fontes quase nunca dão igual, e a diferença é o que interessa: material que saiu
do estoque e não apareceu em reparo nenhum.

**Cobertura em 26/08/2026: 92 de 92 itens com preço** (47 Nordex/GE + 45
Siemens). Mesmo assim, o bloco "MATERIAIS SEM PREÇO" das abas de gasto continua
valendo: material novo que entrar na lista do checklist e não for cadastrado
aqui cai nele, com o consumo certo e gasto zero — nunca escondido.

A fonte é a **lista mestra** de materiais (TIPO / ID / QUÍMICOS E CONSUMÍVEIS /
UM / CLASSE / DEMANDA / ESTOQUE ATUAL / ÚLTIMA COMPRA), e o valor usado é o da
ÚLTIMA COMPRA. Cada linha das tabelas tem, no comentário ao lado, o ID e o nome
de lá — é assim que se confere. Só o TYVEK segue com valor de lista antiga,
porque não aparece na lista mestra.

São **três** tabelas de preço: `PRECO_NORDEX_GE` (o que os dois dividem),
`PRECO_SO_NORDEX` e `PRECO_SO_GE` (os exclusivos de cada um), mais
`PRECO_SIEMENS`. O `precoIndice_()` junta comum + exclusivo por cliente.

## Resumo Semanal — quanto tem em campo, em R$

Aba nova (menu **⚙️ Automação EW → 📅 Resumo semanal**), janela de 8 semanas.
Três blocos:

1. **ESTOQUE EM PARQUE (R$)** — uma coluna por semana com o valor do material
   parado no parque, mais `Δ vs semana anterior` e `Δ vs 1ª semana do mês`.
   Linha TOTAL no fim. Célula vazia é "não houve contagem naquela semana" — e
   fica vazia mesmo, porque somar como zero derrubaria o total do parque.
2. **QTD DE MATERIAIS EM PARQUE** — quantos materiais distintos com estoque
   acima de zero, semana a semana.
3. **MATÉRIA PRIMA POR PARQUE**, um bloco por cliente, no formato do relatório
   gerencial "Matéria Prima por HH", com TOTAL por cliente e TOTAL GERAL.

As colunas **DEVOLUÇÃO MP, SOMA DE HH, Produtividade, FIM, TRIMESTRE e
Custo EPI/HH saem em branco de propósito**: nada disso passa pelo checklist, e
preencher com zero daria a impressão de que o dado existe e vale zero.

O que é preenchido:

| Coluna | De onde |
|---|---|
| PROJETOS | parque |
| R$ MATÉRIA-PRIMA | soma das ENTRADAS lançadas na janela. **Depende de a equipe lançar entrada** — se não lançar, fica subestimada. É por isso que vem acompanhada do estoque e do consumo, que não dependem disso |
| R$ MP PARQUE W_n | estoque em R$ na semana corrente |
| CONSUMO R$ | mesma fonte do Gasto Semanal, para os dois não divergirem |
| R$ EPI'S | soma dos itens marcados em `EPIS` (hoje só o TYVEK) |
| OBS | avisa quando o parque tem material sem preço cadastrado |

**Sete valores não vieram direto da lista mestra.** Todos estão marcados no
arquivo; se algum estiver errado, o gasto daquele material sai errado:

| Item | Valor | De onde |
|---|---|---|
| COMBI 900 | 44,20 | **a lista dá por metro, o app conta em kg** |
| TOP COAT 12 RAL 7035 (GRAY) e RAL 3020 (RED) | 392,40 | a lista só tem o 348 (vermelho). Em 27/08/2026 a engenharia fixou o **cinza como referência** e mandou o vermelho seguir ele; como o único valor de nota é esse, os dois ficam iguais |
| TYVEK (Nordex/GE) | 20,80 | lista Nordex antiga — a Siemens tem o mesmo produto a R$ 22,00 na tabela dela. **Vale unificar** quando alguém conferir a nota |
| MASSA GT60 | — | **sem preço**, não existe na lista mestra |

Os itens que antes estavam nesta tabela — BIAX 750, CRYSTIC X401, os dois MEKP e
o SikaForce-050 — saíram das listas em 27/08/2026 e não têm mais preço cadastrado.

O **SikaForce-050** não tem preço público: windsourcing e Castro Composites só
mostram valor após login, e o único número aberto é € 56,55 pelo cartucho de
195 ml do 818 L07 já misturado — preço de cartucho fica 2 a 3 vezes acima do
barril por quilo, então não serve de base. Os R$ 300,00 estão ancorados no
material comparável da própria lista da EW: o EPOXY ENDURECEDOR 137GF,
endurecedor de adesivo estrutural de pá, a R$ 303,65/kg. **Trocar pelo valor
real na primeira nota fiscal.**

O **COMBI** é o outro ponto frágil: o preço é por metro e o checklist conta em
kg, então aquele gasto só fecha quando as duas unidades baterem.

**Os dois TOP COAT coloridos foram renomeados** no `checklist.html` em
26/08/2026: era "TOP COAT 12 RAL 3020 RED" e "TOP COAT 12 RED 3020" (dois
vermelhos, que era o erro), virou "TOP COAT 12 RAL 7035 (GRAY)" e
"TOP COAT 12 RAL 3020 (RED)". Mexer nesse nome exige mexer em quatro lugares:
`LISTA_NORDEX_GE`, `UNIDADE_NORDEX_GE` e `PERECIVEIS` no HTML, e `MAPA_MAT` mais
a tabela de preço no `Code.gs`. No `MAPA_MAT` as entradas do colorido precisam
vir ANTES do "TOP COAT 12" genérico: a busca é por substring e o genérico
capturaria o colorido, creditando o consumo do vermelho ao cinza.

O vermelho é **RAL 3020**, igual à lista mestra. O `MAPA_MAT` ainda aceita as
grafias "RAL 7020" e "RED 3020" como origem, para registro antigo de calculadora
não deixar de casar.

Para acrescentar preço: mexa só nos números dos dois mapas. O nome tem de bater
com a grafia do `checklist.html`.
