# Checklist Frotas

Três checklists de frota + o formulário de **Abastecimento** (seção própria no
fim deste arquivo). Os três checklists rodando **dentro do site da EW**, sem forms.app: o
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

## Foto: só câmera

O campo de foto abre **a câmera, e só a câmera** — `type=file` com
`capture="environment"`, sem caminho para a galeria. A folha "Adicionar foto /
Tirar foto agora / Escolher da galeria" saiu; o botão do campo dispara a câmera
direto.

É por causa do que a foto significa aqui: evidência do estado do equipamento no
momento do checklist. Foto antiga do rolo do celular não serve, e olhando o PDF
não havia como saber por qual caminho ela tinha entrado.

Campo de "várias fotos" continua aceitando várias — toca em **Tirar foto** de
novo para cada uma.

No **Checklist de Materiais** (almoxarifado) a regra é a oposta e de propósito:
lá a galeria é permitida, porque a foto é conferência de rótulo de tambor, não
flagrante de estado.

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
em planilha desligado.

**O PDF só é liberado para compartilhar depois que o Dropbox confirma.** Ele é
montado em memória e fica lá; nada é baixado antes do envio. Com o `ok` do
servidor, a tela de conclusão traz o botão **Compartilhar PDF**, que abre a
folha do sistema ("enviar para...") ou baixa o arquivo onde o navegador não
compartilha arquivo. Servidor que recusa não libera nada; servidor que não
responde libera um **Compartilhar PDF** no rodapé, para conferir a pasta em vez
de gerar duplicata.

Antes o arquivo era baixado no instante em que terminava de ser montado — ou
seja, antes do envio, e mesmo quando o envio falhava, o que deixava sair por
WhatsApp um checklist que nunca chegou na pasta.

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


## Abastecimento (`abastecimento.html`)

**Não vem do construtor.** Precisa de login, busca por placa e envio de vários
arquivos, que o construtor não faz. Edite o HTML direto e **não** coloque no
`_costurar.js` — guard e seta voltar já estão no arquivo.

Backend: arquivo `EW-Apps-Script-RDO/Abastecimento.gs`, no **mesmo projeto** do
Apps Script do RDO (as rotas `frotaPorPlaca` e `abastecimento` ficam no
doPost/doGet do `Code.gs`). Usa o login, o Dropbox e a
leitura de .xlsx que já existiam para o RDO e o Meus Equipamentos.

### Campos

| Campo | Origem |
|---|---|
| Nome e matrícula | token do login (o servidor ignora o que o celular mandar) |
| Data e hora do registro | relógio do celular, **fixada no primeiro toque no formulário** (na bomba), não no envio. É também a "Data abastecimento" da planilha e define a pasta W<nn>/data. O servidor grava à parte a hora em que o envio chegou |
| Placa | técnico; ABC1D23 ou ABC1234 (as duas formas casam entre si) |
| Condutor, Parque, Frota, Cartão, Senha | planilha da frota, aba ACOMPANHAMENTO: D placa, T frota, U parque, V condutor, X cartão, Y senha. Placa repetida: vale a linha mais de baixo |
| KM abastecido | técnico, só números |
| Fotos Antes, Bomba, Depois, Nota | câmera (sem galeria, mesma regra dos checklists) |
| Observação | opcional |
| Assinatura do técnico | obrigatória; **não** vai para o rascunho — assina na hora de enviar |

### Para onde vai

```
CONTROLE DE COMBUSTÍVEL- EXTREME WIND/
├── CONTROLE DE COMBUSTÍVEL.xlsx          espelho gerado pelo app
└── W40/                                  semana ISO da data do registro
    └── 28-09-2026/                       data do REGISTRO
        └── <PARQUE>/
            ├── Abastecimento - <condutor> - <parque> - 28-09-2026.pdf   (com assinatura)
            ├── Foto - antes - <condutor> - <parque> - 28-09-2026.jpg
            ├── Foto - bomba - ...
            ├── Foto - depois - ...
            └── Foto - nota - ...
```

Segundo abastecimento do mesmo condutor/parque/dia ganha ` (2)` nos cinco
arquivos. Reenvio do mesmo registro (sem resposta no 4G) não duplica: o celular
manda um identificador e o servidor devolve o resultado do primeiro envio.

### Planilha de controle

- **Fonte da verdade:** aba `Abastecimentos` da planilha Google do RDO
  (ou `ABAST_SHEET_ID`).
- **Espelho no Dropbox:** `CONTROLE DE COMBUSTÍVEL.xlsx`, regerado a cada envio.
  O app só sobrescreve a versão que ele mesmo gravou. Se alguém editar o arquivo
  no Excel, o app para de atualizar (não apaga trabalho de ninguém). Para
  voltar: renomeie o arquivo editado e rode `abAtualizarXlsx()`. Para análise,
  puxe este arquivo por Power Query em vez de digitar nele.

### Sem internet na bomba

- Tudo fica salvo no aparelho (IndexedDB), fotos inclusive, a cada alteração.
  Só a assinatura fica de fora.
- Ao abrir o Abastecimento de novo, o rascunho volta sozinho, com um aviso e
  o botão Descartar. O cartão do menu Checklist Frotas mostra "1 não enviado".
- Enviar sem internet não perde nada: avisa e mantém o rascunho.
- Condutor/cartão/senha sem internet: as 6 últimas placas consultadas ficam
  guardadas no aparelho. Placa nunca consultada nesse celular só mostra os
  dados quando tiver sinal (dá para preencher o resto normalmente).
- No envio a placa é consultada de novo no servidor; vale a planilha atual.
- Um rascunho por aparelho. Para registrar outro, envie ou descarte o atual.

### Senha do cartão

Aparece só na tela do técnico, atrás de "Mostrar". Não vai para PDF, tela de
conclusão, Sheets nem xlsx — o PDF sai por WhatsApp. Fica guardada no
aparelho só para as últimas placas que o próprio técnico consultou.

### Instalação (uma vez)

1. No projeto do RDO: colar o `Code.gs` novo por cima do atual; **+ → Script**,
   nome `Abastecimento`, colar o `Abastecimento.gs`; salvar os dois →
   **Nova versão** da implantação existente.
2. Rodar `testarAbastecimento()` e ler o log: placas lidas, repetidas, placas
   fora do formato, pasta base encontrada.
3. Rodar `instalarGatilhoAbastecimento()` (gatilho de 10 min).
4. `testarPlaca()` com uma placa real.
5. Subir o site (o `CACHE` do `sw.js` já foi para v46). O técnico precisa abrir
   o Abastecimento uma vez COM internet para a página ficar disponível offline.
