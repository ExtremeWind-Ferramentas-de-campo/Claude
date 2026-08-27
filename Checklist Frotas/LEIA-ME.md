# Checklist Frotas

Três checklists de frota rodando **dentro do site da EW**, sem forms.app: o
técnico preenche no celular, o PDF é montado no próprio aparelho e a página
funciona offline depois da primeira abertura.

| Checklist | Arquivo | Campos | Formulário de origem |
|---|---|---|---|
| Gerador elétrico | `gerador-eletrico.html` | 35 | `https://checklist.forms.app/check-list-gerador-eletrico` |
| Plataforma | `plataforma.html` | 50 | `https://checklist.forms.app/formulario-plataforma-` |
| Veículo (semanal) | `veiculo.html` | 61 | `https://checklist.forms.app/formulario-de-inspecao-do-veiculo` |

Entrada pelo `index.html` desta pasta, que é o que o botão **Frotas** do
`Checklist Almoxarifado/menu.html` abre.

## Para mudar uma pergunta

Os três HTML são **gerados**. Não edite o HTML direto — a próxima geração
apagaria a alteração. Quem manda é o modelo em `modelos/`.

**Pelo construtor** (é o caminho normal):

1. Abra `construtor-formulario.html`.
2. **Abrir modelo** → escolha o `.json` do checklist.
3. Edite, **Gerar formulário**, **Baixar arquivo**, substitua o HTML aqui.
4. **Salvar modelo** e substitua o `.json` também.

O passo 4 não é opcional. Se o `.json` ficar velho, a edição seguinte parte de
uma versão anterior e desfaz o que você acabou de fazer.

**Pela linha de comando** (bom para mexer nos três de uma vez):

```bash
node _gerar.js
```

Regera os três HTML e os três JSON a partir da lista de campos escrita dentro
do próprio `_gerar.js`.

### As duas costuras

O HTML que sai do botão do construtor é um arquivo solto. Para virar página do
site ele precisa de duas coisas, que o `_gerar.js` põe sozinho:

- `<script src="../guard.js">` no `<head>` — sem isso o link direto pula o login;
- a seta **voltar** no cabeçalho — no PWA não existe barra de navegador.

Gerando pelo botão do construtor, refaça as duas à mão.

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

Hoje: só para os downloads do aparelho. O campo **Endereço do Apps Script**
está vazio de propósito nos três modelos.

Preenchendo esse campo no construtor e regerando, o formulário passa a mandar o
PDF para o Dropbox e a linha para a planilha, do mesmo jeito que o RDO faz. As
pastas de destino já estão escritas nos modelos:

```
/EW - CHECKLIST FROTAS/GERADOR ELETRICO/{MM-AAAA}/
/EW - CHECKLIST FROTAS/PLATAFORMA/{MM-AAAA}/
/EW - CHECKLIST FROTAS/VEICULOS/{MM-AAAA}/
```

## Offline

As três páginas entram no cache pelo `sw.js` da raiz, junto com o jsPDF do
cdnjs. Ao trocar qualquer arquivo desta pasta, **incremente o `CACHE` no
`sw.js`** — sem isso o aparelho continua servindo a versão antiga.
