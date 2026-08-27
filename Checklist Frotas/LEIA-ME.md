# Checklist Frotas

Três checklists de frota rodando **dentro do site da EW**, sem forms.app: o
técnico preenche no celular, o PDF é montado no próprio aparelho e a página
funciona offline depois da primeira abertura.

| Checklist | Arquivo | Formulário de origem |
|---|---|---|
| Gerador elétrico | `gerador-eletrico.html` | `https://checklist.forms.app/check-list-gerador-eletrico` |
| Plataforma | `plataforma.html` | `https://checklist.forms.app/formulario-plataforma-` |
| Veículo (semanal) | `veiculo.html` | `https://checklist.forms.app/formulario-de-inspecao-do-veiculo` |

Entrada pelo `index.html` desta pasta, que é o que o botão **Frotas** do
`Checklist Almoxarifado/menu.html` abre.

## Para mudar uma pergunta

Os três HTML são **gerados pelo construtor**. Não edite o HTML direto — a
próxima geração apagaria a alteração. Quem manda é o modelo em `modelos/`.

1. Abra `modelos/construtor-formulario_2.html`.
2. **Abrir modelo** → escolha o `.json` do checklist.
3. Edite, **Gerar formulário**, **Baixar arquivo**, substitua o HTML aqui.
4. **Salvar modelo** e substitua o `.json` também.
5. Rode a costura:

```bash
node _costurar.js
```

6. Suba o `CACHE` no `sw.js` da raiz.

O passo 4 não é opcional. Se o `.json` ficar velho, a edição seguinte parte de
uma versão anterior e desfaz o que você acabou de fazer.

O passo 5 também não. Veja abaixo.

### As duas costuras — por que o passo 5 existe

O HTML que sai do botão **Baixar arquivo** é um arquivo solto. Para virar
página do site ele precisa de duas coisas que o construtor não põe:

- `<script src="../guard.js">` no `<head>` — sem isso o link direto pula o login;
- a seta **voltar** no cabeçalho — no PWA não existe barra de navegador, então
  quem entra num checklist fica preso na tela e o menu parece "não funcionar".

`_costurar.js` põe as duas nos três arquivos. É idempotente: rodar duas vezes
não duplica nada, e o conteúdo do formulário (perguntas, imagens de exemplo)
não é tocado — só o cabeçalho. Se um arquivo já estiver costurado, ele avisa
"já costurado" e passa adiante.

Sintoma de que faltou rodar: você abre um checklist pelo menu e não tem como
voltar.

## O que ficou diferente do forms.app

| No forms.app | Aqui | Por quê |
|---|---|---|
| Matriz de seleção | Uma pergunta de escolha única por linha | O construtor não tem tabela de rádios. As colunas viraram as opções — mesmas respostas, PDF linha a linha. |
| Upload de vídeo | Registro fotográfico sequencial | O PDF é montado pelo jsPDF no aparelho e não embute vídeo. |
| Campo "nome completo" | Dois campos de texto | Mesmos rótulos que o forms.app usava (Modelo/Placa, Parque/Cidade-Estado). |
| Boas-vindas e quebras de página | Não existem | O formulário é uma rolagem só; os textos de instrução foram para o campo de ajuda logo abaixo. |

A lógica condicional foi mantida inteira:

- **Gerador** — "DESCREVA AQUI !!!" só aparece com dano/pane = SIM.
- **Plataforma** — "DESCREVA AQUI !!!!!" só aparece com problema = Sim.
- **Veículo** — as 9 perguntas da carrocinha só aparecem com "transporta
  carrocinha = SIM"; a foto da avaria só aparece com "houve avaria = sim".

## Erros que vieram do formulário original

A regra usada foi: **texto de pergunta fica igual ao original** (é o que o
técnico reconhece e o que permite cruzar com as respostas antigas do
forms.app); **opção de resposta e texto de ajuda com erro de digitação foram
corrigidos**, porque saem impressos no PDF.

Ficaram como estão, por serem perguntas:

- Plataforma — *"COMO ESTÁ O FUNCIONAMENTO DA PLATAFOMRA ?"* e os vários
  *"RESGISTRO DE..."* (é REGISTRO).
- Gerador — a matriz eletromecânica pergunta *"Quanto ao marcador de
  combustível?"* **duas vezes**. Aqui a segunda ficou marcada com `(2)` para dar
  para distinguir no PDF. Este é o único que vale corrigir na fonte: é pergunta
  repetida, não erro de escrita.

Corrigidos:

- Veículo — coluna da matriz *"não alicado"* → **"não aplicado"**.
- Gerador — ajuda do campo Parque, *"PARQUE E RIGIÃO DE ATUAÇÃO"* →
  **"PARQUE E REGIÃO DE ATUAÇÃO"**.

## Para onde vai o PDF

O envio está **ligado** nos três: o botão diz "Gerar PDF e enviar" e aponta
para o mesmo Apps Script (`script.google.com/macros/s/AKfycbx...`), com registro
em planilha desligado. O PDF também continua caindo nos downloads do aparelho
antes de subir — se o envio falhar, o arquivo não se perde.

Pasta de destino configurada nos três:

```
\02 - EXTREME WIND\13 - LOGISTICA\CONTROLE DE VEÍCULOS\Zz-PRINCIPAIS\CHECKLIST+TELEMETRIA PDF\{MM-AAAA}
```

**Atenção à barra invertida.** A API do Dropbox trabalha com `/`, não com `\`.
O formulário manda a string do jeito que está, então o Apps Script precisa
converter — ou o caminho vira uma pasta só, com esse nome comprido inteiro.
Se os PDF não estiverem aparecendo na árvore certa no Dropbox, é aqui.
Para corrigir, troque as barras no campo **Pasta** do construtor:

```
/02 - EXTREME WIND/13 - LOGISTICA/CONTROLE DE VEÍCULOS/Zz-PRINCIPAIS/CHECKLIST+TELEMETRIA PDF
```

## Offline

As três páginas entram no cache pelo `sw.js` da raiz, junto com o jsPDF do
cdnjs. Ao trocar qualquer arquivo desta pasta, **incremente o `CACHE` no
`sw.js`** — sem isso o aparelho continua servindo a versão antiga.
