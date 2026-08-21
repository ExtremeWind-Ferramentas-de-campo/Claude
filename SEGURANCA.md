# Segurança — EW Site (calculadoras, checklist, fotocard)

Revisão de 06/08/2026. Este documento registra o que foi encontrado, o que foi
corrigido no código e **o que só você pode fazer** (fora do repositório).

---

## Antes de tudo: por que não dá para "embutir o token escondido"

O pedido era embutir a URL do Worker e o `APP_TOKEN` no código, de forma que
não fossem identificáveis. **A segunda parte é impossível** num site estático,
e é importante que isso esteja claro:

O GitHub Pages entrega este HTML/JS para o navegador de quem abrir. Qualquer
valor escrito no código aparece em:

- "Ver código-fonte" da página
- DevTools → Sources / Network
- cache do Service Worker (fica salvo no aparelho)
- o repositório público no GitHub — inclusive **no histórico**, mesmo depois de
  removido num commit posterior

Ofuscar (base64, XOR, quebrar a string em pedaços, `atob` em runtime) esconde de
quem olha de passagem e não resiste a cinco minutos de DevTools. Chave em
cliente público é chave publicada.

**O que foi feito no lugar:** o app não precisa mais de segredo nenhum. Todos os
segredos foram para o Cloudflare Worker, onde ficam de verdade no servidor, e a
autorização passou a ser pela **origem da requisição**. O que sobrou no código é
só um endereço público de escrita — e ninguém digita nada.

```
navegador (público, ZERO segredo)
   │   fetch https://ew-dropbox-proxy.ew-fotos.workers.dev/{upload,sheets,parques}
   ▼
Cloudflare Worker  ← aqui ficam os segredos (variáveis criptografadas)
   │   valida Origin · só escreve · caminho preso na pasta raiz · limite de tamanho
   ├──► Dropbox API          (DROPBOX_REFRESH_TOKEN / APP_KEY / APP_SECRET)
   └──► Apps Script          (GAS_URL + GAS_SECRET)
```

---

## Achados

### ALTO — Apps Script aberto na internet, com a URL publicada

O endpoint `/exec` do Apps Script estava escrito em quatro arquivos públicos
(`checklist.html`, `calculadora-ge/nordex/siemens.html`) e não verificava nada:

- `doPost` gravava em `Consumo_Reparos` e `Checklist_*` — **qualquer pessoa com
  a URL podia injetar linhas na planilha de produção**, que é a base da análise
  de consumo vs. realizado.
- `doGet?tipo=parques` devolvia a lista de todos os parques e clientes da EW.
- Sem limite de tamanho: um envio grande consumia a cota diária do Apps Script.
- `catch` devolvia `String(err)` ao chamador, vazando ID de planilha e nomes de
  função.

**Corrigido:** o Apps Script agora exige `GAS_SECRET` (Propriedade do script)
em todo GET e POST, com comparação de tempo constante, e falha fechada se a
propriedade não existir. Teto de 500 linhas e 600 KB por envio. Erro interno
virou mensagem genérica, com o detalhe só no `Logger`. A URL saiu dos arquivos
públicos — quem fala com o Apps Script agora é o Worker.

> Assim que a propriedade `GAS_SECRET` for cadastrada, **a URL antiga fica
> inofensiva mesmo estando no histórico do Git**, porque sem o segredo o script
> recusa tudo. Não é obrigatório trocar a URL de implantação.

### ALTO — `APP_TOKEN` digitado e guardado em texto puro no aparelho

A URL e o token ficavam em `localStorage`. `localStorage` é por **origem**, e a
origem do GitHub Pages é `usuario.github.io` — ou seja, **compartilhada por
todos os repositórios Pages da mesma conta**. Um XSS em qualquer outro projeto
seu naquele domínio leria o token do Dropbox. Além disso o token circulava por
conversa para ser colado em cada celular.

**Corrigido:** não existe mais token no cliente. A caixa de configuração foi
removida e o app **apaga as chaves antigas** (`ew_dbx_url`, `ew_dbx_token`) do
aparelho no primeiro carregamento.

Nota justa: o Worker que está no ar **já valida a origem** — conferido no teste,
uma chamada de `http://localhost:8766` foi recusada e a resposta trouxe
`Access-Control-Allow-Origin: https://ramiroew.github.io`. Ou seja, o token era
uma segunda tranca que, para funcionar, obrigava a espalhar um segredo por
celular e por conversa. Tirar o token e deixar a origem carregar a proteção é
troca vantajosa: some o segredo, e a defesa que de fato barrava terceiro
continua de pé.

### MÉDIO — CSP liberava qualquer worker do mundo

`connect-src 'self' https://*.workers.dev` no fotocard: em caso de XSS, dava
para exfiltrar dados para o worker de qualquer pessoa no domínio `workers.dev`.

**Corrigido:** `connect-src` fixado no endpoint do projeto, nos 6 arquivos.
Adicionado `form-action 'none'`.

### MÉDIO — lista de parques montada com `innerHTML`

`popularParques` montava `<option value="...">` por string, escapando só `"`.
No contexto do atributo isso barrava a fuga, mas era frágil: o dado vem da
planilha (que, pelo achado ALTO acima, qualquer um podia escrever) e bastava um
refactor do template para virar XSS armazenado — que executaria, porque a CSP
tem `script-src 'unsafe-inline'`.

**Corrigido:** a lista passou a ser montada por DOM (`createElement` + `.value`),
que não passa por parser de HTML. Testado com três payloads hostis: 0 tags
injetadas, 0 execuções.

### MÉDIO — caminho do upload controlado pelo cliente

`dbxPath` higienizava os caracteres proibidos do Dropbox mas deixava passar
`..`, e o Worker recebia o caminho pronto.

**Corrigido:** nos dois lados. No cliente, `..` e caracteres de controle caem
fora. No Worker, `caminhoSeguro()` decodifica, remove `.`/`..`, limita a 6
níveis e 80 caracteres por nível, exige extensão de imagem e **prende tudo
dentro de `DROPBOX_ROOT`**. O upload usa `mode: add` + `autorename`, então não
existe sobrescrever foto já enviada.

### BAIXO — Service Worker guardava resposta de API

O SW interceptava todo GET, inclusive chamadas de API, servindo cache-first.
Isso deixaria a lista de parques velha e guardava resposta de API no disco do
aparelho.

**Corrigido:** os dois Service Workers ignoram o domínio da API.

---

## Risco aceito (documentado, não corrigido)

| Item | Por que fica | Como fechar, se precisar |
|---|---|---|
| Checagem de `Origin` é burlável por `curl` | Vale contra navegador de terceiro, que é o cenário real. Pior caso: subir arquivo na pasta de fotos ou empurrar linha na planilha. Não dá para ler, apagar, nem chegar na conta do Dropbox. | Cloudflare Access (login corporativo na frente do Worker) ou PIN por técnico trocado por token de curta duração |
| `script-src 'unsafe-inline'` | Os apps são arquivo único com script e `onclick` inline. Tirar exige extrair todo o JS para arquivos externos e trocar os handlers. Hoje não há vetor de injeção conhecido. | Refactor para JS externo + `addEventListener` |
| Endereço do Worker é público | É endpoint de escrita, não segredo. A proteção está no Worker. | — |

---

## Fotocard: dois caminhos para "ir direto, sem ninguém configurar"

Em campo ninguém digita nada nos dois casos — a caixa de configuração não
existe mais. A diferença é onde fica a confiança.

| | **Caminho A — recomendado** | **Caminho B — atalho** |
|---|---|---|
| O que você faz | atualiza o `worker.js` no Cloudflare | cola o APP_TOKEN em `DBX_TOKEN`, no topo do bloco Dropbox do `fotocard/index.html` |
| Segredo no código | nenhum | o token fica público (código-fonte, DevTools, histórico do Git) |
| Quem autoriza | origem da requisição, validada no Worker | token + origem |
| Mexe no Worker | sim, uma vez | não |
| Calculadoras e checklist | funcionam | **não funcionam** — precisam das rotas `/sheets` e `/parques` |

O Caminho B resolve só o fotocard. Como as calculadoras e o checklist não
podem voltar a falar direto com o Apps Script (era o furo ALTO desta revisão),
o Worker vai precisar ser atualizado de qualquer forma — e é um copiar-colar
só, que já resolve os dois. Por isso o Caminho A é o recomendado.

Se escolher o B, `DBX_TOKEN` é a única linha a preencher, uma vez, no código —
nunca no celular de ninguém.

## O QUE VOCÊ PRECISA FAZER (o código sozinho não resolve)

⚠️ **Até fazer os passos 1 e 2, os envios param.** Nada se perde: a foto fica na
fila do IndexedDB e o checklist/calculadora na fila do `localStorage`, e tudo
sobe sozinho quando o Worker responder.

**1. Worker (Cloudflare → Workers → `ew-dropbox-proxy` → Edit code)**

O `worker.js` foi escrito para as variáveis que **já existem** neste Worker.
Não é preciso renomear nem apagar nada:

| Variável | Situação |
|---|---|
| `ALLOWED_ORIGIN` = `https://ramiroew.github.io` | já existe ✓ |
| `DROPBOX_REFRESH_TOKEN`, `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` | já existem ✓ |
| `GAS_URL` | já existe ✓ |
| `MAX_MB` = `30` | já existe ✓ (o código lê daqui o teto do upload) |
| **`GAS_SECRET`** | **falta** — valor aleatório longo, ex. `openssl rand -hex 32`. O mesmo valor vai nas Propriedades do script, no Apps Script |
| `DROPBOX_ROOT` | opcional. Sem ela, as fotos continuam caindo exatamente onde caem hoje |

Depois cole o conteúdo de [`ew-dropbox-proxy/worker.js`](ew-dropbox-proxy/worker.js)
em *Edit code* e faça deploy.

Para testar de `localhost`, acrescente `,http://localhost:8766` ao
`ALLOWED_ORIGIN` **temporariamente** e tire depois.

**2. Apps Script (planilha → Extensões → Apps Script)**

- Cole o `EW-Sheets-Script/Code.gs` atualizado
- ⚙️ *Configurações do projeto* → *Propriedades do script* →
  `GAS_SECRET` = **o mesmo valor** do Worker
- *Implantar* → *Gerenciar implantações* → editar a existente → **Nova versão**
  (mantém a mesma URL, então não precisa mexer no `GAS_URL` do Worker)

**3. Dropbox — revogar o que circulou**

O `APP_TOKEN` foi colado em celulares e provavelmente passou por conversa.
Se o Worker usava um token de acesso de longa duração do Dropbox, gere um novo
no App Console e descarte o antigo. Prefira o fluxo de refresh token.

**4. Conferir**

- Abra o app com internet, tire uma foto → deve aparecer `☁️✓ ... no Dropbox`
- Envie um checklist → deve aparecer `☁️✓ Enviado para a planilha`
- Teste que a porta está fechada — deve responder `origem_nao_autorizada`
  (sem cabeçalho `Origin`, o Worker recusa):

```bash
curl -i https://ew-dropbox-proxy.ew-fotos.workers.dev/ping
```

- E que o Apps Script recusa sem o segredo — deve responder `nao_autorizado`:

```bash
curl -s "https://script.google.com/macros/s/SEU_ID/exec?tipo=parques"
```
