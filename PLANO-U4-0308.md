# Plano — Atualizações da plataforma (entrada de 01/08 no u4-status)

> Fonte: u4-status (`marpe`) lido em 03/08 — 5 chamados abertos, 11 testes marcados como
> "problema" (8 deles pelo **Marcel**, em 01/08, com descrição), 1 PDF de especificação de
> fluxo e 1 vídeo de 40s.
> Verificado contra o código e os dados de **produção** antes de escrever.
> Estado: **EXECUTADO em 03/08** — S1, S2, S3 e S4 no ar (deploy `ltjk8dj83`), migração
> `20260803` aplicada, E2E de 7 frentes passando, u4-status atualizado (jornada e roteiro
> do ciclo 2, 16 itens, entrega, 5 chamados e 11 testes respondidos).
> Ficou de fora, com motivo: **A12** (não reproduzido — pedi o passo a passo),
> **menção @ em grupos** (depende de teste no serviço da UazapiGO) e **busca por
> chassi/proposta** (não existe o dado). Duas decisões pendentes com o Marcel estão
> na seção 3.

---

## 0. O que entrou desde a última entrega (01/08, 17h → 03/08)

Mudança de padrão importante: **o Marcel passou a usar a plataforma diretamente**. Até 31/07
quem reportava era o Tiago; em 01/08 o Marcel abriu 3 chamados, **rodou o roteiro de testes do
ciclo 1** e comentou cada falha. É a primeira validação em tela feita pelo dono do negócio.

| Origem | Qtd | Quem |
|--------|-----|------|
| Chamados abertos | 5 | Marcel (3) · Tiago (2) |
| Testes marcados "problema" | 11 | Marcel (8, em 01/08) · Tiago (3, pendentes desde 23/07) |
| Comentário operacional | 1 | Tiago: e-mail enviado à Agger em 01/08 22:57 — aguardando retorno |

Nada disso virou tarefa ainda: os 65 `u4_items` do projeto estão todos `done`.

### Os 5 chamados

| # | Título | Autor | O que é |
|---|--------|-------|---------|
| `3a4d910f` | **MODELO DE MENU INBOX** | Marcel | Miro + PDF de 5 páginas com o fluxo completo do Inbox. É reescrita de comportamento, não ajuste. |
| `196d726d` | Nome do card = nome do **negócio**, não do contato | Marcel | Print do card "Corretor Marcel". |
| `5cb84ad8` | Forma de pagamento + parcelamento no Novo Negócio | Marcel | Boleto/Débito/Cartão/PIX + 1x…10x. |
| `59eaf2a2` | Delay para abrir funil e inbox | Tiago | Print do board em esqueleto, "0 negócios". |
| `27e9e5be` | Inbox — mensagens de áudio | Tiago | Vídeo 40s. 3ª vez que reporta (29/07 segue aberto: "falha ainda persiste"). |

### Os 11 testes com problema

| Cód | Área | O que o Marcel escreveu |
|-----|------|-------------------------|
| A2 | Inbox | Clipe não filtra por tipo ("Fotos e Vídeos" mostra tudo; Docs idem) **+ foto com legenda duplica no inbox** (no WhatsApp chega certo) |
| A3 | Inbox | Colar print (Ctrl+V) **duplica o envio no inbox** |
| A5 | Inbox | Contador de não lidas não zera — leu todas, continua marcando 12 |
| A7 | Inbox | "Ao finalizar uma conversa o contato pode voltar pra aba Contatos" |
| A8 | Inbox | "onde criar, editar e consultar as etiquetas??" |
| A10 | Inbox | Menção @ não funciona em grupos; negrito deveria aparecer já na caixa de texto |
| A12 | Inbox | "ainda com a sobretela" (picker do `/` nas Conversas do card) — 3ª vez |
| B1 | CRM | "Board abre em Mais recentes — pelo que vi, abre em todos" |
| B4 | CRM | **Comissão é sobre o prêmio LÍQUIDO, não o final. Prêmio Final = Líquido + IOF. Criar um campo para cada.** |
| B6 | CRM | Filtro Próxima ação: "tá funcionando só a primeira etapa" (funil Vendas) |
| B7 | CRM | Editar no Corp e abrir o card: "não atualiza" |

---

## 1. Diagnósticos fechados antes do plano (com evidência)

### D1 · Áudio: a canvas do waveform cresce sem parar `[27e9e5be / 0e9cbeba]`

Extraí 14 quadros do vídeo do Tiago. O que ele chama de "efeito de carregando" são **as barras
do waveform espalhadas pelo painel inteiro** — traços verticais a cada ~48px do lado de fora da
bolha, que aparecem e somem.

Causa em `src/components/shared/AudioPlayer.tsx:223-232`: a `<canvas>` tem `flex: 1` **sem
`minWidth: 0` e sem largura em CSS**. Para um elemento substituído, `min-width: auto` resolve
para a largura intrínseca — que é justamente o atributo `canvas.width` que o `draw()` escreve
(`canvas.width = clientWidth * dpr`, linha 68-71). Fecha o laço:

```
draw() → canvas.width = clientWidth × dpr → largura intrínseca maior
       → min-width:auto maior → clientWidth maior → draw() de novo (rAF, 60fps)
```

Com `devicePixelRatio > 1` a canvas cresce dpr× **por quadro**. Windows a 125% (dpr 1.25) chega
a ~85× a largura original em 20 quadros. A bolha não tem `overflow: hidden`, então as barras
vazam pela tela. As 52 barras espalhadas por ~2.500px batem exatamente com o espaçamento medido
nos quadros.

**Por que nunca reproduzi aqui**: só dispara com `dpr > 1` **e** áudio que carrega metadata —
áudios expirados caem no estado `loadError` e nem desenham a canvas. Os meus dois "fixes"
anteriores (28/07 e 30/07) atacaram o scroll e a imagem quebrada, que eram sintomas reais mas
de **outro** chamado.

**Fix**: wrapper `position: relative; flex: 1; minWidth: 0; height: 34` e canvas
`position: absolute; inset: 0; width: 100%; height: 100%` — o atributo deixa de influenciar o
layout. `ResizeObserver` passa a observar o wrapper. Guard em `draw()` para sair quando a
medida não mudou.

### D2 · Duplicação de mídia no inbox: corrida entre o envio e o webhook `[A2, A3]`

Confirmado em produção. Nos testes do Marcel de 01/08 às 20h, **3 dos 5 envios pelo CRM têm uma
linha gêmea com o `wa_message_id` IDÊNTICO**:

```
CRM 20:20:45.663  3EB0C0B69BA4599E65DC2D  | GÊMEA 20:20:46.378  3EB0C0B69BA4599E65DC2D (webhook)
CRM 20:13:17.297  3EB08734B221B16DBDC89C  | GÊMEA 20:13:21.904  3EB08734B221B16DBDC89C (webhook)  legenda "moega"
CRM 20:11:41.874  3EB021AF536AA3E87C4EDF  | GÊMEA 20:11:46.308  3EB021AF536AA3E87C4EDF (webhook)  legenda "fábrica"
```

O webhook **tem** dedupe por `wa_message_id` (`webhook/whatsapp.ts:318-325`), mas a checagem
roda **cedo demais**: entre ela e o insert (linha 563) o webhook baixa a mídia e sobe para o
Storage — segundos de janela. No mesmo intervalo, `api/messages/media.ts` também só insere
**depois** do upload com até 3 tentativas (linhas 95-109). Os dois inserem. Texto não duplica
porque o caminho do webhook para texto é curto e a janela some.

**Fix (3 camadas)**:
1. **Índice UNIQUE parcial** em `marpe_messages(wa_message_id) WHERE wa_message_id IS NOT NULL`
   — impossibilita a duplicata no banco. Migração via runner Playwright (padrão do projeto).
2. Webhook e endpoint de mídia passam a inserir com `on conflict do nothing` e tratar conflito
   como sucesso.
3. `api/messages/media.ts` insere a linha **antes** do upload e faz `PATCH media_url` depois —
   fecha a janela e o histórico deixa de depender do Storage responder.
4. Limpeza única das duplicatas já gravadas (manter a linha com `media_url` preenchido).

### D3 · Delay do funil: o board baixa 4.878 negócios inteiros `[59eaf2a2]`

Medido em produção agora:

| Medida | Valor |
|--------|-------|
| Negócios no funil Vendas | **4.878** (total geral 5.209) |
| Como o `GET /api/deals` busca | `select('*')` + 3 joins, páginas de 1.000, **sequenciais** |
| Idas ao banco por abertura | **5** |
| Peso | ~1,5 MB por página → **~7,3 MB** |
| Tempo só do banco | **3,7 s** (sem lambda, sem rede do usuário, sem render) |

O board renderiza 50 cards por coluna, mas baixa os 4.878. `detalhes_corp` **não** é o peso
(média 54 bytes) — o peso é linha × colunas × joins.

**Fix**: (a) lista de colunas explícita no `select` (cai ~33% já medido); (b) as páginas em
paralelo depois de um `count` — 5 idas sequenciais viram 1 rodada; (c) trazer só os campos que
o card usa e deixar o resto para o `GET /api/deals/[id]` que o painel já faz. Meta: primeira
pintura abaixo de 1,5s. Se ainda ficar pesado, o passo seguinte é paginar por etapa (o "Mostrar
mais" já existe na UI).

**Inbox**: `GET /api/contacts` lê **as 2.000 últimas mensagens** para deduzir a última conversa
por contato, e a lista repete isso **a cada 10s** (`InboxView.tsx:622`). Trocar por uma consulta
agregada (última mensagem por contato) e subir o intervalo do poll para 20-30s quando a aba
não está em foco.

---

## 2. Sprints

### S1 — Bugs com causa confirmada · ~1 sessão

| Item | Chamado/teste | Ação |
|------|---------------|------|
| S1.1 | `27e9e5be`, `0e9cbeba` | Áudio: wrapper + canvas absoluta (D1). Fecha os dois chamados de áudio. |
| S1.2 | A2, A3 | Duplicação: índice UNIQUE + insert antes do upload + limpeza (D2). |
| S1.3 | `59eaf2a2` | Delay do board e do inbox (D3). |
| S1.4 | A2 (2ª parte) | `accept` no seletor de arquivos: "Fotos e Vídeos" → `image/*,video/*`; "Documentos" → lista de docs. |
| S1.5 | A5 | Contador de não lidas: hoje a aba filtra por `conv_status !== 'closed'` (`InboxView.tsx:785`), que **não é** critério de não-lida. Alinhar aba e badge ao mesmo critério de `inbox_read_at` já usado em `/api/contacts/badges`. |
| S1.6 | A12 | Sobretela do `/`: reproduzir com o passo-a-passo do Marcel (3ª vez reportado — pedir os passos junto do OK deste plano, ou gravar a tela do lado dele). |

### S2 — Fluxo do Inbox (PDF do Marcel) · ~1,5-2 sessões · **o épico**

O PDF `Fluxo_Menu_Inbox_CRM` especifica **4 abas: Contatos · Grupos · Não lidos · Atendimento**.
Duas mudanças estruturais:

**S2.1 — Abas (fecha A7)**. Hoje são 5 (`conversas · grupos · naolidas · finalizadas ·
atendimento`, `InboxView.tsx:302-308`). Passa a: "Conversas" vira **Contatos**, **"Finalizadas"
deixa de existir** e conversa finalizada **volta para Contatos**. O texto do PDF é explícito:
"Não precisa ter uma aba de FINALIZADAS". Isso apaga o item 3 do roadmap atual (que ainda
descreve "Finalizados" como aba).

**S2.2 — Aba Contatos = todos os contatos cadastrados**. Hoje a lista só traz quem tem
mensagem (`api/contacts/index.ts:21-40` parte das mensagens). O PDF pede **todos** — 3.496
contatos. Exige busca no servidor + rolagem infinita; não dá para carregar tudo (é o mesmo erro
do board).

**S2.3 — Conversa vinculada ao negócio** (o coração do pedido). Hoje **zero** mensagens têm
`deal_id` (verificado: 0 de 4.915). O PDF define:
- usuário inicia → começa a conversa **a partir do negócio**;
- cliente inicia → o sistema **pede para selecionar o negócio** por um modal com busca;
- busca por **nome do contato, nome do negócio, CPF, CNPJ, placa, chassi, apólice, proposta**;
- mesma conversa com mais de um negócio → botão para **trocar de negócio** (o PDF marca como
  pendência de UX: "ver onde fica melhor pra colocar").

Desenho proposto: coluna `marpe_contacts.active_deal_id` (o negócio em pauta) + gravar `deal_id`
em toda mensagem enviada/recebida enquanto ele estiver ativo. A aba Conversas do card passa a
mostrar o que é daquele negócio, com alternância "ver todas do contato" — resolve o conflito
antigo (mensagem inbound nunca traz negócio) sem inventar regra.

⚠️ **Bloqueio de dado**: `marpe_deals` **não tem `chassi` nem `proposta`** (colunas conferidas).
Placa e apólice existem. Ou criamos as duas colunas e alguém preenche, ou saem da busca da v1 —
**decisão do Marcel** (item 3 abaixo).

### S3 — Regras de negócio e campos · ~1 sessão

**S3.1 — Prêmio líquido × prêmio final (B4)** — o mais sensível, porque muda cálculo:
> "A comissão é calculada pelo prêmio LÍQUIDO e não o prêmio FINAL. Prêmio FINAL = Prêmio líq +
> IOF. Temos que criar um campo para cada porque o prêmio líquido é o que nos interessa para
> fins de cálculo de comissão e relatório de produção. Prêmio FINAL é o que interessa para o
> cliente."

Hoje existe **um** campo `premio`. Vira: `premio_liquido`, `iof`, `premio_final`
(= líquido + IOF, calculado), com a comissão sempre sobre o líquido. Alcance: modal Novo
Negócio, aba Info, Grade/CSV, variáveis `{{premio}}`, dashboard e produção, **e o dual-write no
Corp** (`val_premio` do `POST /negocio` precisa ser mapeado para um dos dois — verificar contra
um registro real antes de mexer). O campo `premio` atual fica como legado preenchido.

**S3.2 — Forma de pagamento + parcelamento (`5cb84ad8`)**: colunas `forma_pagamento`
(Boleto/Débito em conta/Cartão/PIX) e `parcelas` (1-10), no modal e na Info. Verificar se o
Corp tem esses campos antes de decidir se sincroniza ou fica só no CRM.

**S3.3 — Nome do card (`196d726d`)**: o card mostra `d.marpe_contacts?.name || d.title`
(`CrmBoard.tsx:2056`). Passa a mostrar o **nome do negócio** (`title`), com o contato na linha
de baixo. Ver decisão 1 — os títulos vindos do Corp são "AUTO — NOME DO CLIENTE", que repete a
tag de ramo do próprio card.

**S3.4 — Etiquetas (A8)**: não existe tela para criar/editar/consultar etiquetas — hoje são
texto livre em `marpe_contacts.tags`. Entra como seção no módulo **Cadastros** (que já está no
menu), com renomear e excluir refletindo nos contatos.

### S4 — Retestes e menores · ~0,5 sessão

| Item | Ação |
|------|------|
| B7 "não atualiza" | O refresh ao abrir o card existe desde 15/07 — verificar se o sync do Corp está de pé no dia do teste e instrumentar a resposta na tela ("atualizado agora"). |
| B6 "só a primeira etapa" | Reproduzir os 7 presets no funil Vendas; suspeita de interação com o teto de 50 cards por coluna. |
| B1 "abre em todos" | Conferir o que o `marpe_crm_prefs_v1` restaura e se a janela de recência está sendo aplicada na abertura. |
| A10 | Menção @ em grupos + negrito renderizado na caixa de texto antes do envio. |

---

## 3. Decisões que preciso do Marcel/Tiago

1. **Nome do card** — os 4.878 negócios vindos do Corp têm título automático "AUTO — FULANO".
   Mostrar assim (repetindo o ramo que já é tag) ou usar um formato próprio? Negócios criados no
   CRM já têm nome livre.
2. **Prêmio líquido/final** — o valor que hoje está em `premio` nos 4.878 negócios sincronizados
   é o líquido ou o final? Define o backfill.
3. **Busca do negócio no Inbox** — chassi e proposta não existem no CRM. Criar os campos (e
   quem preenche) ou a v1 busca por nome/CPF/CNPJ/placa/apólice?
4. **A12** — passo-a-passo exato da "sobretela" (3ª vez reportada, nunca reproduzida aqui).
5. **Aba Contatos com todos os 3.496 contatos** — confirma que é isso mesmo (hoje só aparece
   quem já trocou mensagem).

---

## 4. Higiene do u4-status (nossa parte)

- **Ciclo 2 está sem jornada e sem roteiro de testes** — o ciclo foi publicado em 27/07 mas os
  19 testes daquele PDF nunca viraram registro. Por isso o Marcel testou o roteiro do **ciclo
  1**. Cadastrar as 8 etapas do V2 + o roteiro.
- **Ciclo 1 nunca fechou**: checkpoint e aprovação pendentes desde 17/07.
- Transformar os 11 testes-problema e os 5 chamados em itens (hoje o projeto tem 0 itens
  abertos, o que dá a impressão errada de "nada em aberto").
- Roadmap: o item 3 ainda descreve a fila com "Finalizados" — o PDF do Marcel elimina essa aba.
- Bloqueios: os 4 da Agger continuam abertos; o Tiago enviou o e-mail em 01/08 22:57.

---

## 5. Estimativa

| Sprint | Escopo | Sessões |
|--------|--------|---------|
| S1 | Bugs de causa confirmada | 1 |
| S2 | Fluxo do Inbox (PDF) | 1,5-2 |
| S3 | Prêmio/IOF, pagamento, nome do card, etiquetas | 1 |
| S4 | Retestes e menores | 0,5 |
| **Total** | | **4-4,5** |

Ordem recomendada: **S1 → S3 → S2 → S4**. O S1 mata os três bugs que o cliente vê todo dia
(áudio, duplicação, lentidão); o S3 são campos pequenos com valor alto para o Marcel; o S2 é o
épico e merece uma sessão inteira sem disputa de contexto — e depende das decisões 1, 3 e 5.

---

## 6. Registro da execução (03/08)

**No ar**: deploy `gck8jq6if`. Migração `20260803` aplicada (7 statements + verify).
Commits `6e1e10c` (entrega) e `f7ca853` (correções vindas do repo da u4digital).

### E2E em produção — 8 frentes

| Verificação | Resultado |
|---|---|
| Board do funil Vendas | 200 · 4.877 negócios · **4,38 MB** (era ~7,3 MB) · 2,2-2,8 s |
| Etiquetas | criar 201 · duplicada 409 · renomear 200 · excluir 200, sem resíduo |
| Busca de negócios | por nome do negócio, nome do contato e código do Corp |
| Aba Contatos com todos | contato só do Corp (nunca conversou) aparece na busca |
| Índice UNIQUE de wa_message_id | 2ª gravação do mesmo id → 23505, como esperado |
| Prêmio líquido/IOF/final | PATCH 200, coluna gerada calculou 1986,99 + 13,23 = 2000,22 |
| Refresh do Corp ao abrir o card | traz prêmio e comissão (antes só percentuais e textos) |
| CSV, badges, dashboard, busca | 200 em todos |

**Regressão pega pelo E2E e corrigida antes de qualquer uso**: a coluna nova
`active_deal_id` criou uma segunda relação entre `marpe_deals` e `marpe_contacts`, e o
PostgREST passou a recusar o embed por ambiguidade — o board voltou 500. Todos os
embeds foram explicitados com `marpe_contacts!contact_id`.

### Descoberta: o repositório da u4digital seguiu por outro caminho

Ao sincronizar, apareceram 4 commits do Renan (19-21/07) que **nunca chegaram à
produção** — a linha que publica é a deste repositório. Isso explica por que o Marcel
viu de novo em 01/08 bugs que já tinham correção lá.

- Trazidas para produção: `wasSentByApi` (descarte preciso do eco da UazapiGO),
  destaque de @menções e formatação nas legendas, try/finally no envio (candidato à
  causa do A12), select de seguradora que não degrada mais para campo de texto.
- **Recusada**, com medição: a segunda camada do dedupe (descartar `fromMe` com
  outbound do mesmo tipo nos últimos 30 s) apagaria **124 das últimas 400 mensagens
  enviadas** — mensagens seguidas digitadas no celular caem no critério.
- **Não trazida**: a containerização (Docker/Traefik/Swarm, adapter Vercel→Node).
  Muda o destino do deploy; é decisão de infraestrutura do Moroni e do Tiago.

O trabalho de 03/08 foi para a branch `entrega-0308` no repositório da u4digital, sem
tocar na `main` deles.

### O que ficou de fora

| Item | Motivo |
|---|---|
| A12 (sobretela do `/`) | Não reproduzido aqui. A correção do Renan é candidata; pedi reteste e o passo a passo. |
| Menção @ funcional em grupos | Hoje vai como texto e o WhatsApp não a transforma em marcação. Precisa de probe na UazapiGO. |
| Busca por chassi e proposta | O dado não existe no CRM nem na CorpAPI. Decisão 3 da seção 3. |
| Nome dos negócios vindos do Corp | Card já mostra o nome do negócio; falta decidir o formato dos 4.877 automáticos. Decisão 1. |
