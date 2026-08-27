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
├── index.html                    menu + tela de entrada
├── guard.js                      porteiro de sessão
├── sw.js                         service worker (offline)
├── manifest.json                 instalação como app
├── logo-ew.png, logo-oem*.png    logos (compartilhados)
├── icon-192.png, icon-512.png    ícones
├── .nojekyll
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
│   ├── _costurar.js              põe guard.js + seta voltar nos 3 HTML baixados
│   └── modelos/                  construtor-formulario_2.html + os 3 .json
│
├── EW-Apps-Script-RDO/Code.gs    backend do RDO (colar no Apps Script)
├── EW-Sheets-Script/Code.gs      backend das calculadoras/checklist
├── ew-dropbox-proxy/worker.js    Cloudflare Worker
└── SEGURANCA.md                  revisão de segurança de 06/08/2026
```

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

## Os cinco checklists de inspeção (forms.app)

Ficam em `Checklist Almoxarifado/almoxarifado-seguranca.html` e são só atalhos: abrem em nova
aba os formulários hospedados no forms.app. Não guardam nada no aparelho e não
funcionam offline — o técnico precisa de sinal para preencher e enviar, e as
respostas caem no painel do forms.app, não no Sheets nem no Dropbox da EW.

| Botão | Endereço |
|---|---|
| Acesso por Cordas | `https://099hu7e7.forms.app/checklistquipamentosindividuais-1` |
| Equipamentos Individuais | `https://099hu7e7.forms.app/checklistquipamentosindividuais` |
| Ferramentas Gerais | `https://checklist.forms.app/formulario-de-ferramentas` |
| Plataforma | `https://checklist.forms.app/formulario-plataforma-` |
| Kit LOTO | `https://checklist.forms.app/formulario-de-ferramentas-1` |

Para trocar um endereço, mexa só no `href` do cartão correspondente.

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
de lá — é assim que se confere. CYTEC, TYVEK e MACACÃO seguem com valor da lista
antiga, porque não aparecem na lista mestra.

**Sete valores não vieram direto da lista mestra.** Todos estão marcados no
arquivo; se algum estiver errado, o gasto daquele material sai errado:

| Item | Valor | De onde |
|---|---|---|
| TECIDO BIAX 750 | 39,14 | igual ao BIAX 800/830 — decisão da engenharia |
| COMBI | 44,20 | do COMBI 900 — **a lista dá por metro, o app conta em kg** |
| TOP COAT 12 RAL 7035 (GRAY) | 392,40 | igual ao vermelho — decisão da engenharia |
| BASE MASSA — CRYSTIC X401 | 36,00 | da "MASSA PUTTY GAMESA- MAX", por tipo |
| ENDURECEDOR MASSA — MEKP | 55,00 | do BUTANOX M50 (MEKP é MEKP) |
| ENDURECEDOR GEL COAT — MEKP | 55,00 | idem |
| ENDURECEDOR ADESIVO — SIKAFORCE-050 | 300,00 | **ESTIMATIVA**, ver abaixo |

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
