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
