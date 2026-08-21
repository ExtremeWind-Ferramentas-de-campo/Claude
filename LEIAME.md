# Atualização — inclusão do RDO no site EW

Pasta de **staging**. Nada aqui está publicado. `/EW-Site-GitHub/` não foi tocada.

Cada arquivo abaixo substitui (ou entra novo) na pasta original.

---

## Arquivos desta pasta

| Arquivo daqui | Vai para | Ação | De quem é |
|---|---|---|---|
| `index.html` | `/index.html` | substitui | Ramiro |
| `sw.js` | `/sw.js` | substitui | Ramiro |
| `fotocard/sw.js` | `/fotocard/sw.js` | substitui | Ramiro |
| `rdo/sw.js` | `/rdo/sw.js` | **novo** | seu |

## Falta um arquivo — você precisa copiar à mão

`RDO.html` → renomear para **`rdo/index.html`**

Ele não está aqui porque tem ~220 KB e **não sofreu nenhuma alteração**. É o
seu arquivo exatamente como está. Só muda de nome e de lugar.

O nome `index.html` é o que faz a URL ficar `.../rdo/` em vez de
`.../rdo/RDO.html`.

---

## Estrutura final esperada

```
/
├── index.html          ← substituído (4 cards)
├── sw.js               ← substituído
├── rdo/
│   ├── index.html      ← seu RDO.html renomeado
│   └── sw.js           ← novo
├── fotocard/
│   ├── index.html
│   └── sw.js           ← substituído
├── calculadora.html
├── calculadora-nordex.html
├── calculadora-ge.html
├── calculadora-siemens.html
├── checklist.html
├── logo-ew.png
├── logo-oem*.png
├── manifest.json
├── icon-192.png
├── icon-512.png
└── .nojekyll
```

---

## O que mudou e por quê

### 1. `index.html` — card do RDO

- Card do RDO adicionado como **primeiro** da lista, apontando para `rdo/index.html`.
- Grid passou de 3 para 2 colunas. Com 4 cards, 3 colunas deixava um card órfão
  na segunda linha. No celular continua 1 coluna, sem mudança.
- `<meta name="description">` atualizada para citar os 4 apps.
- Nada mais foi alterado: cena SVG, tema claro/escuro, CSP e rodapé intactos.

### 2. Os três `sw.js` — correção de um bug real

**O problema.** Os dois service workers existentes tinham, no `activate`:

```js
keys.filter(k => k !== CACHE).map(k => caches.delete(k))
```

`caches.keys()` é por **origem**, não por escopo do service worker. Ou seja,
cada SW enxergava — e apagava — os caches de todos os outros SW do site.

Resultado: `/sw.js` apagava o cache do `/fotocard/`, e vice-versa, a cada vez
que uma versão nova era ativada. Online passa despercebido (os dois têm
fallback de rede). **Offline não**: logo após uma publicação, o outro app fica
sem cache. Se já houve relato de "às vezes não abre offline no campo", a causa
provável é esta.

Com a entrada do RDO seriam três SW se apagando mutuamente.

**A correção.** Cada SW agora limpa apenas o que é dele, por prefixo:

| Arquivo | Prefixo | CACHE |
|---|---|---|
| `sw.js` | `ew-calc-` | `ew-calc-v22` (era v21) |
| `fotocard/sw.js` | `ew-fotocard-` | `ew-fotocard-v38` (inalterado) |
| `rdo/sw.js` | `rdo-` | `rdo-v17` (inalterado) |

Nenhuma outra lógica foi tocada: estratégias de cache, tratamento de POST e as
exceções de API (`ew-dropbox-proxy` e Apps Script) continuam iguais.

**Por que `ew-calc-v21` virou `v22`:** o `index.html` mudou. Sem incrementar,
quem já instalou o PWA continuaria vendo o index antigo, sem o card do RDO.
O `fotocard` não mudou de conteúdo, então a versão dele fica onde está.

### 3. Por que o RDO fica em `/rdo/` e não na raiz

O escopo de um service worker é a pasta onde o arquivo está:

- `/sw.js` → escopo `/`
- `/fotocard/sw.js` → escopo `/fotocard/`
- `/rdo/sw.js` → escopo `/rdo/`

Em escopos sobrepostos, o mais específico vence. Cada app mantém o seu cache.
Se o RDO fosse para a raiz, o `sw.js` dele colidiria com o do Ramiro.

O `RDO.html` já registra `sw.js` por caminho relativo, então dentro de `/rdo/`
ele encontra o arquivo certo sozinho. Nenhuma linha precisou ser alterada.

---

## Depois de publicar — teste

1. Abrir o hub e conferir os 4 cards.
2. Entrar no RDO e voltar.
3. **DevTools → Application → Service Workers**: devem aparecer 3, com escopos
   `/`, `/fotocard/` e `/rdo/`.
4. **DevTools → Application → Cache Storage**: devem coexistir `ew-calc-v22`,
   `ew-fotocard-v38` e `rdo-v17`. Se algum sumir depois de recarregar, a
   correção de prefixo não foi aplicada em algum dos arquivos.
5. Modo avião: os três apps devem abrir.

## Ao publicar versões novas daqui pra frente

- Mexeu em algum html da raiz → incremente `ew-calc-vNN` em `/sw.js`.
- Mexeu no fotocard → incremente `ew-fotocard-vNN` em `/fotocard/sw.js`.
- Mexeu no RDO → incremente `rdo-vNN` em `/rdo/sw.js`.

Sem incrementar, quem tem o app instalado continua na versão velha.

---

## Aviso

`sw.js` e `fotocard/sw.js` são código do Ramiro. O diagnóstico do bug de cache
é uma análise externa — vale ele revisar antes de publicar, já que conhece o
histórico daquele código.
