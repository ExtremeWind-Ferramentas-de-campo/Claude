# Fotocard — Extreme Wind Blade Services

App PWA para registro fotográfico de inspeção e reparo de pás eólicas.

## Versão

**v41 · 27/08/2026** — o número aparece na tela do app, embaixo do título, ao
lado do aviso de modo offline. É por ele que se sabe, olhando o celular, se o
aparelho já carregou o código novo.

### Ao publicar qualquer alteração, mexa nos três

| Onde | O quê |
|---|---|
| `index.html` → `APP_VERSAO` | sobe o número e põe a data do dia |
| `sw.js` (raiz do site) → `CACHE` | sobe o número, senão o celular serve o cache velho |
| `README.md` → tabela abaixo | uma linha com o que mudou |

Os três andam juntos. Sem o `APP_VERSAO` o técnico não tem como conferir a
versão em campo; sem o `CACHE` o arquivo novo nem chega ao aparelho.

### Histórico

| Versão | Data | O que mudou |
|---|---|---|
| v41 | 27/08/2026 | Correção: o carimbo não podia ser arrastado da posição padrão na câmera — o rodapé reorganizado na v40 engolia o toque. Área de toque mínima de 44 px para o carimbo, e a aba desempata quando card e carimbo se sobrepõem. |
| v40 | 27/08/2026 | Os ajustes da tela da galeria passam a valer também **na câmera**: abas Fotocard / Carimbo, tamanho e ângulo dos dois, ↻ e ↺, painel recolhível pelo ⚙. Rodapé da câmera reorganizado em coluna. |
| v39 | 25/08/2026 | Zoom da câmera 0,5× / 1× / 2×. Foto da galeria passa por tela de ajuste: lugar, tamanho e ângulo do fotocard e do carimbo. Carimbo passa a ser arrastável também na câmera. |
| v38 | 18/08/2026 | Versão anterior. |

## Arquivos

| Arquivo | Função |
|---------|--------|
| `index.html` | App principal (câmera + fotocard + salvar) |
| `sw.js` | Service Worker — habilita uso **offline** |
| `manifest.json` | Metadados PWA (ícone, nome, tela cheia) |
| `icon-192.png` | Ícone para celulares |
| `icon-512.png` | Ícone de alta resolução |
| `.nojekyll` | Desativa Jekyll no GitHub Pages |

## Deploy no GitHub Pages

### Passo a passo

1. Crie um repositório no GitHub (ex: `fotocard` ou `ew-fotocard`)
2. Faça upload de **todos** os arquivos desta pasta
3. Vá em **Settings → Pages**
4. Em "Source", selecione **Branch: main** e pasta **/ (root)**
5. Clique em **Save**
6. URL gerada: `https://SEU-USUARIO.github.io/NOME-DO-REPO/`

### Primeiro acesso (obrigatório)
- Abra a URL **com internet** no celular de campo
- O app será cacheado automaticamente
- A partir daí funciona **sem internet**

## Como funciona offline

```
Primeira visita (com internet)
  └─ Service Worker instala e cacheia:
       ├─ index.html   (app inteiro: card vetorial + câmera, sem bibliotecas)
       ├─ sw.js
       └─ manifest.json

Visitas seguintes (com ou sem internet)
  └─ SW serve do cache local
       └─ Câmera funciona (contexto HTTPS preservado)
            └─ Foto salva na galeria do dispositivo
```

## Campos obrigatórios

A câmera e o `💾 Salvar Fotocard` **só liberam com o fotocard inteiro
preenchido**. Foto com campo em branco vira retrabalho: o card sai com um "—"
no lugar do dado e, semanas depois, ninguém lembra qual era a torre ou a medida.

Enquanto faltar alguma coisa:

- um aviso vermelho acima dos botões diz **quantos** campos faltam e nomeia os
  três primeiros;
- os botões ficam apagados — mas **continuam clicáveis** de propósito: botão
  morto não explica nada, aqui o toque responde dizendo o que falta;
- ao tocar, os campos em branco ganham moldura vermelha e a tela rola até o
  primeiro deles.

Dois campos não são um `<input>` comum:

| Campo | O que conta como preenchido |
|---|---|
| Etapa do Processo | o `<select>` nunca fica vazio; só a opção **"Outra"** exige o texto ao lado |
| Lado / Localização | pelo menos **uma** caixa marcada |

O **Cliente** também nunca fica vazio (começa em GE), então nunca aparece na
lista de pendências.

## Memória dos campos

Em campo o técnico tira dezenas de fotos da **mesma pá**: parque, torre,
cliente, modelo, N/S, dano, medidas, lado e equipe são os mesmos da primeira
até a última foto. Esses campos ficam gravados no aparelho (`localStorage`,
chave `ew_fotocard_campos`) e voltam preenchidos no próximo acesso — inclusive
no dia seguinte e sem internet.

**Fica de fora, de propósito,** só a **Etapa do Processo** (e o "Outra"): muda a
cada etapa fotografada, então começa sempre no padrão.

Data e hora não são campo nenhum — vêm do carimbo gravado no rodapé da foto.

### Como mudar um campo gravado

O campo gravado nasce **travado** (🔒). Uma tampa transparente sobre o controle
impede o toque de chegar nele — nada é apagado sem querer, nem com dedo de luva
nem com a mão apoiada no celular. Mudar exige **dois toques**:

1. toque no campo → aparece o botão **✏️ Editar** ao lado do rótulo;
2. toque no botão → o campo libera e recebe o cursor.

Ao sair do campo ele grava e trava de novo sozinho. Campo vazio nunca trava.

### Quando a gravação acontece

Em três momentos, para não depender de um só:

1. **300 ms depois da última tecla** — gravação normal (adiada porque digitar
   dispararia isso a cada tecla e `localStorage` é síncrono);
2. **na hora em que o campo trava** (ao sair dele) — gravação imediata;
3. **na hora em que o app sai de vista** (`visibilitychange` / `pagehide`) —
   rede de segurança para quem digita e troca de aplicativo no mesmo instante,
   sem tirar o dedo do campo. Sem isso, o celular pode congelar a página antes
   dos 300 ms e levar junto as últimas teclas.

O dado sobrevive a fechar o app, matar o app na lista de recentes, reiniciar o
celular e ficar offline. **Some** se limpar os dados do site no navegador, se
desinstalar o app da tela inicial, ou em aba anônima. É por aparelho e por
navegador — não sincroniza entre celulares.

Na barra acima do formulário há ainda **🔓 Liberar todos** (destrava tudo de uma
vez, para quando muda a pá inteira — cada campo volta a travar assim que você
sai dele) e **🗑️ Limpar campos** (apaga o que está gravado no aparelho, com
confirmação).

## Fotocard vetorial (Canvas 2D)

O card não é uma captura de tela de um bloco HTML: ele é **desenhado**
com o Canvas 2D nativo do navegador (módulo `FC` dentro do `index.html`).

- **Nítido em qualquer resolução** — o vetor é rasterizado só no tamanho
  final da foto, não redimensionado depois.
- **Transparência real** — sobre a foto o fundo do card sai com opacidade
  **0,85**; texto, linhas e caixas de seleção ficam 100% opacos.
- **O que aparece na tela é o que grava** — pré-visualização, overlay ao vivo
  e foto usam o mesmo desenho.
- **Sem biblioteca externa** — dispensa o `html2canvas` (198 KB), então o
  modo offline fica mais leve.
- `💾 Salvar Fotocard (sem foto)` exporta o card **opaco** em 4× (1840 px de
  largura), para colar em relatório.

### Linhas do card

O **Pitch saiu** do formulário e do card — não era preenchido em campo. Com ele
fora, as linhas de coordenadas ficaram:

```
| Zi (mm)          | Zf (mm)          |   ← mesma divisória nas duas linhas:
| Xi (mm)          | Xf (mm)          |     os quatro valores lêem como matriz
| Dano ......................        |   ← linha inteira, 11 px (era 9 px em 1/3)
```

Os nomes de arquivo também perderam o `_P{pitch}`. Quem identifica a pá agora é
o **N/S** (o número da própria pá, não da posição no rotor):

- foto: `EW_{parque}_{torre}_{ns}_{etapa}.jpg`
- card: `EW_card_{parque}_{torre}_{ns}.png`

Pedaço vazio some do nome, e o Worker do Dropbox sobe com `autorename`, então
dois arquivos de mesmo nome não se sobrescrevem.

### Ajuste manual na tela da câmera

Vale para o **fotocard** e para o **carimbo** — as abas escolhem em qual. Ver
também "Ajuste do card e do carimbo na câmera", mais abaixo.

**Tamanho** — card de **20% a 70%** do lado menor da foto; carimbo de **40% a
200%** do corpo automático. Slider `Tam`, botões **−** / **+** ou **pinça de
dois dedos** em cima da imagem (a pinça mexe no alvo selecionado).

**Posição** — **arraste com um dedo** para onde quiser: qualquer canto, meio,
em cima do céu, longe do dano. O arraste só começa se o dedo encostar no card
ou no carimbo, então segurar o celular não sai movendo nada.

**Ângulo** — slider `Âng`, **−** / **+** (passo de 5°) ou **↻** (quarto de
volta).

**Voltar ao padrão** — botão **↺**.

#### O que engole o toque, e o que não

Só **botões e sliders** têm prioridade sobre o arraste. O fundo do rodapé,
não: o carimbo mora no canto inferior direito e fica por cima dessa faixa —
tratar o rodapé inteiro como controle deixava o carimbo **preso na posição
padrão**, sem como arrastá-lo (foi o bug da v40, corrigido na v41).

Duas regras completam isso:

- **área mínima de toque de 44 px** (`PEGA_MIN`) para o carimbo: ele é uma
  linha de texto de ~30 px, e acertar isso com luva, em cima de uma pá, não
  dá;
- quando **card e carimbo se sobrepõem**, ganha o que estiver selecionado na
  aba — sem isso, um carimbo arrastado para debaixo do card ficava preso lá.

#### Por que fração, e não pixels

A posição é guardada como **fração do espaço livre** (0 a 1 em cada eixo), não
em pixels. Por isso a mesma posição vale na tela e na foto, em qualquer
resolução e nas duas orientações: canto na tela = canto na foto, meio = meio.

O rótulo do `Tam` mostra `50% · 1080px`: a porcentagem e a **largura real que
o card vai ter na foto**. Como o card é vetorial, ele é *redesenhado* nesse
tamanho — não esticado. Em foto de 4K, 20% dá 432 px e 70% dá 1512 px, os dois
igualmente nítidos; o que muda é só o quanto ele cobre da pá.

O overlay ao vivo mostra card e carimbo no tamanho, na posição e no ângulo
reais que terão na foto (converte pela escala do `object-fit:cover` do vídeo),
então o ajuste é visual — não precisa tirar a foto para conferir. Tudo fica
guardado no aparelho (`localStorage`), então só precisa ser ajustado uma vez.

Quando o tamanho é escolhido à mão, o piso `MINW` sai de cena: a escolha da
pessoa manda, mesmo que deixe o card pequeno. O **↺** devolve o modo
automático.

### Constantes de ajuste (topo do módulo `FC`, no `index.html`)

| Constante | Valor | O que faz |
|---|---|---|
| `OPACITY` | `0.85` | opacidade do fundo do card sobre a foto |
| `FRAC0` | `0.38` | padrão: largura do card = 38% do lado **menor** da foto |
| `MARGIN` | `0.01` | folga até o canto superior direito |
| `MINW` | `400` | largura mínima do card em foto de baixa resolução |

Chaves gravadas no aparelho: `ew_card_frac` (tamanho) e `ew_card_pos`
(posição, `x,y` de 0 a 1).

Os três valores vieram do fotocard de referência usado em campo. Usar o lado
menor (e não a largura) mantém a mesma presença em foto em pé ou deitada.

## Carimbo de data e hora

Toda foto sai com o carimbo no **canto inferior direito** (padrão, e ele pode
ser arrastado para outro canto), no mesmo formato das câmeras de campo:

```
21 de abr. de 2026 16:36:08
```

Branco com contorno escuro — lê sobre céu estourado e sobre o interior escuro da
pá, sem precisar de tarja de fundo. Gira junto com o celular, pelo mesmo ângulo
do fotocard, então nunca sai deitado numa foto tirada na horizontal.

O carimbo aparece **ao vivo na tela da câmera**, no mesmo canto e no mesmo
tamanho que vai ter na foto — a conversão usa a escala do `object-fit:cover` do
vídeo, a mesma do overlay do card, então o que se vê é o que grava. O relógio
anda de segundo em segundo enquanto a câmera está aberta (e o `setInterval` é
desligado ao fechar). Ele fica na faixa de ~30 px do rodapé, **abaixo** dos
botões, e é `pointer-events:none` — não cobre nenhum lugar de toque.

Só na pré-visualização existe um teto de tamanho: ao girar o celular, alguns
aparelhos demoram para a câmera renegociar a orientação e, nesse intervalo, o
texto girado ficaria mais comprido que a tela. Na foto o carimbo sai sempre no
tamanho cheio — lá ele sempre cabe.

É a **única** marcação de tempo do app: o campo "Data / Hora" saiu do card e do
formulário. Ele era preenchido na abertura do app e, num dia inteiro de pá,
ficava horas atrasado — o carimbo é a hora exata em que o obturador disparou,
com segundos, e ninguém precisa preencher.

Com a coluna a menos, o **Modelo** passou a ocupar toda a faixa ao lado do logo,
na primeira linha do card.

O tamanho acompanha a resolução (3,8 % do lado menor da foto), igual ao card:

| Foto | Carimbo |
|---|---|
| 1280×720 | 27 px |
| 3840×2160 | 82 px |

Se o card for arrastado para o canto inferior direito, ele encosta no carimbo —
com o card na posição padrão (canto superior direito) sobra a foto inteira entre
os dois. Nesse caso, **arraste o carimbo** para outro canto: ele se move com um
dedo, igual ao card, tanto na câmera quanto na tela de ajuste da galeria. A
posição fica guardada no aparelho (`ew_stamp_pos`) e vale para os dois caminhos.
Tocar no rótulo de tamanho ("50 %") devolve tudo ao padrão: card no canto
superior direito, carimbo no inferior direito.

## Ajuste do card e do carimbo na câmera

O painel de ajustes da câmera tem os **mesmos controles** da tela da galeria —
abas **🪪 Fotocard** / **🕐 Carimbo**, sliders `Tam` e `Âng`, botão **↻**
(quarto de volta) e **↺** (voltar ao padrão). Além deles, na câmera valem os
gestos: **um dedo arrasta** o card ou o carimbo, **dois dedos (pinça)**
redimensionam o alvo selecionado. Tocar no card ou no carimbo também troca a
aba.

O botão **⚙** ao lado do 🔄 **recolhe o painel**. Fechado, o rodapé fica só com
o zoom e os botões e sobra bem mais tela para enxergar a pá — em 375×812 o
rodapé cai de 275 px para 159 px. A escolha fica guardada no aparelho
(`ew_cam_ferramentas`).

### O ângulo na câmera é um acréscimo, não um valor absoluto

Na câmera o card e o carimbo **giram sozinhos com o sensor de orientação** do
celular — é isso que impede a marcação de sair deitada numa foto tirada na
horizontal. O ajuste manual **soma** a esse giro:

```
giro na tela = −orientação do celular + ângulo escolhido
```

Com o ângulo em 0° o comportamento é exatamente o de sempre. Com o celular
deitado (90°) e ajuste de 30°, o card sai a −60°. A mesma conta vale no
overlay ao vivo e na foto gravada — é literalmente a mesma linha de código
(`R`, `bboxGirada`, `centroNoLivre`), então o que se vê na tela é o que grava.

Na galeria o ângulo é absoluto: a imagem já vem na orientação final e não há
tela girando.

### Rodapé em coluna

Toast, zoom, painel de ajustes e botões ficam empilhados num `#cam-bottom`.
Antes cada barra tinha um `bottom:` fixo em pixels e, com o painel aberto, uma
cobriria a outra. Empilhadas, cada uma acha o seu lugar sozinha, e o toast
fica ancorado no topo do rodapé (`bottom: calc(100% + 10px)`), subindo e
descendo junto.

O painel tem fundo escuro próprio porque o carimbo ao vivo passa **por cima**
dele (z-index 21) — sobre o degradê sozinho, os sliders ficavam ilegíveis
quando o técnico arrastava o carimbo para essa faixa.

## Zoom da câmera — 0,5× · 1× · 2×

Em pá eólica a distância de trabalho muda muito: dentro da plataforma não dá
para andar para trás, e o 0,5× é o que faz o dano inteiro caber no quadro; de
longe, o 2× aproxima sem ter de subir mais. Três botões abaixo do slider de
tamanho, e o app escolhe sozinho o melhor caminho que o aparelho oferece:

| Ordem | Caminho | Quando entra |
|---|---|---|
| 1 | **Lente separada** (`deviceId` da ultra-angular) | 0,5×, na maioria dos celulares com grande angular |
| 2 | **Zoom do driver** (`applyConstraints({zoom})`) | quando `capabilities.zoom` cobre o fator pedido |
| 3 | **Recorte digital** | só para 2×, quando nada acima existe |

O recorte digital grava o **centro do quadro no tamanho real do recorte**, sem
esticar: 4K com 2× ainda sai em 1920×1080. A pré-visualização usa
`transform:scale(2)` no vídeo, então o que se vê é o que grava — e o card e o
carimbo são remedidos pelo quadro recortado, não pelo do sensor.

**0,5× não tem recorte**: não há como inventar campo de visão que a lente não
capta. Sem ultra-angular o botão fica **apagado** em vez de sumir, e avisa ao
ser tocado — o técnico vê que aquela opção não existe naquele celular.

Girar o celular reabre o stream (a câmera precisa renegociar a orientação); o
zoom escolhido é reaplicado sozinho. Virar para a câmera frontal zera o zoom —
a frontal não tem ultra-angular, e manter 2× ao virar deixaria a prévia
recortada sem ninguém ter pedido.

## Foto da galeria: ajuste antes de montar

Foto que já foi tirada pela câmera do celular entra pelo botão
**🖼️ Carregar foto da galeria** e passa por uma tela de ajuste antes de virar
arquivo: a foto aparece **inteira**, com o card e o carimbo por cima. Só o
**✓ Aplicar** monta a imagem.

Antes o card e o carimbo caíam sempre no mesmo canto, no mesmo tamanho e sem
giro: se o dano estivesse ali, não havia o que fazer — a foto saía com a
marcação em cima do defeito.

O que dá para ajustar, no **fotocard** e no **carimbo** (as abas escolhem em
qual):

| Ajuste | Como | Faixa |
|---|---|---|
| **Lugar** | arraste com o dedo | qualquer ponto da foto |
| **Tamanho** | slider `Tam`, ou − / + | card 20–70 % do lado menor · carimbo 40–200 % |
| **Ângulo** | slider `Âng`, ou − / + (passo de 5°) | −180° a 180° |
| **Quarto de volta** | botão **↻** | próximo múltiplo exato de 90° |
| **Voltar ao padrão** | botão **↺** | zera lugar, tamanho e ângulo dos dois |

Tocar no card ou no carimbo dentro da foto também troca a aba — os sliders
passam a mexer naquele. O selecionado fica com contorno tracejado azul.

O ângulo serve para acompanhar uma pá deitada no quadro, ou para deitar a
marcação numa faixa estreita de céu em vez de cobrir o dano.

**Os mesmos controles existem na câmera** — ver a seção abaixo. Lugar, tamanho
e ângulo são um estado só: o que se ajusta num caminho vale no outro, fica
guardado no aparelho e serve para a próxima foto, sem ter de reajustar uma a
uma.

### Por que o que se vê é o que grava

O palco tem exatamente a proporção da foto e usa as **mesmas contas** da
montagem final: a caixa considerada é a do elemento **depois de girado**
(`bboxGirada`), e o centro sai de `centroNoLivre` — margem + fração do espaço
livre. Se a marcação não couber (card no máximo girado a 45°, por exemplo),
ela é **centralizada** em vez de escapar por um canto.

O fundo do palco é uma cópia reduzida a 1600 px — redesenhar 12 MP a cada
arraste engasgaria o celular; a montagem em tamanho cheio acontece uma única
vez, no Aplicar. O card é sempre **redesenhado** no tamanho escolhido (é
vetorial), nunca esticado.

O arraste testa o **retângulo de verdade**, não a caixa girada: um card a 45°
tem caixa quase o dobro, e o dedo pegaria no vazio ao lado dele.

Depois do Aplicar a foto segue pelo mesmo caminho da câmera: tela de revisão,
gravação no aparelho e fila do Dropbox.

## Resolução da foto

A câmera é aberta pedindo **3840×2160 (4K)**; se o aparelho não tiver, o
navegador cai sozinho na resolução mais próxima. Ao abrir a câmera o app
mostra num aviso rápido a resolução real entregue — é o que diz se a foto
vai aguentar zoom:

| Foto | Card na foto | Rótulos do card |
|---|---|---|
| 1280×720 | 360 px | 5,5 px |
| 1920×1080 | 410 px | 6,2 px |
| 3840×2160 | 821 px | 12,5 px |
| 4032×3024 (12 MP) | 1149 px | 17,5 px |
| 8000×6000 (48 MP) | 2280 px | 34,7 px |

Antes a foto era travada em 1280×720 e o card saía com 384 px — rótulos de
5,8 px, ilegíveis ao ampliar. O piso `MINW` (400 px, limitado a metade do lado
menor) garante que num aparelho sem 4K o card não fique menor do que era.

O JPEG é salvo com qualidade 0,92 (em 4K dá arquivo ~3× menor que 1,0, sem
diferença visível no texto do card).

O logo embutido tem 635×301 (2× a versão anterior), com o mesmo
enquadramento — não perde definição nem em foto de 12 MP.

## Fluxo de uso no campo

1. Abra o app → preencha os dados do fotocard
2. Toque **📷 Abrir Câmera com Fotocard**
3. Posicione a câmera → o fotocard aparece no canto superior direito
4. Escolha o enquadramento: **0,5× · 1× · 2×**
5. Se precisar, ajuste: **arraste com o dedo** para mudar de lugar, **pinça ou
   slider `Tam`** para o tamanho, **`Âng` ou ↻** para girar. As abas escolhem
   entre fotocard e carimbo; **⚙** recolhe o painel. Só na primeira vez: o app
   lembra
6. Toque o botão de captura → confira na tela de revisão → **✓ Usar esta foto**
7. Foto já tirada antes: **🖼️ Carregar foto da galeria** → escolha a aba
   (Fotocard ou Carimbo) → arraste, mude tamanho e ângulo → **✓ Aplicar**
8. Ou use **💾 Salvar Fotocard** para exportar só o card

## "Adicionar à tela inicial"

No celular:
- **Android Chrome**: Menu (⋮) → *Adicionar à tela inicial*
- **iOS Safari**: Compartilhar (□↑) → *Adicionar à tela de início*

Após adicionar, o app abre em tela cheia como um aplicativo nativo.
