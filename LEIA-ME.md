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
├── checklist/
│   ├── menu.html                 submenu: Almoxarifado/Segurança e Frotas (é o que o menu abre)
│   ├── almoxarifado-seguranca.html   Materiais + 5 checklists de inspeção (forms.app)
│   └── index.html                Checklist de Materiais
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

Ficam em `checklist/almoxarifado-seguranca.html` e são só atalhos: abrem em nova
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

O botão **Frotas**, em `checklist/menu.html`, está desligado de propósito: é uma
`<div>` com a classe `breve` e o selo "Em breve". Quando os formulários de frota
existirem, troque a `<div>` por um `<a href="...">` e tire a classe `breve`.

## Checklist de Materiais — unidades, fotos e PDF

**A unidade não é mais escolhida em campo.** Ela vem das planilhas de
acompanhamento de materiais e está fixa no `index.html` do checklist, em
`UNIDADE_NORDEX_GE` (aba "Contagem") e `UNIDADE_SIEMENS` (aba "PADRÃO"). O
motivo é a conferência semanal: se o app mandar `un` onde a planilha espera
`kg`, a comparação não fecha. Traduções aplicadas: `KG`→`kg`, `M²`→`m²`,
`ML` (metro linear) e `M`→`m`, `UN`/`UND`→`un`, `LT`→`L`.

Ao incluir material novo na lista, acrescente a unidade nesses dois mapas —
sem entrada no mapa, o item cai no `un` padrão.

Dois valores vieram da planilha e parecem erro de digitação dela, não do app:
**macacão 100%** e **fita crepe larga** estão como `KG`. Ficaram como estão de
propósito, para o app não divergir da fonte. Corrigindo na planilha, corrija
aqui também.

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
