# Plano — Checkpoint 15/07: Sincronização Corp→CRM + Formulários + Inbox

> Última atualização: 17/07/2026
> Origem: feedback Marpe 15/07 (mensagem + 2 PDFs) + **board u4digital** (github.com/orgs/u4digital/projects/3, 26 issues em u4digital/Marpe-Project, mapeadas 17/07)
> Status: **TUDO EM PRODUÇÃO (17/07)** — S1 (15/07) + Hotfix/S2/S3/S4 (17/07) executados e validados.
> Entrega e roteiro de testes: **RELATORIO-EXECUCAO-1707.md**. Pendentes: propostas P-A/P-B/P-C (aguardam OK).

---

## 0. Board u4digital (17/07) — mapeamento das 26 issues

O board "Marpe" da u4digital consolida o feedback do cliente em issues no repo
`u4digital/Marpe-Project`. Mapeamento completo → sprint deste plano:

| Issue | Título (resumo) | Situação | Sprint |
|-------|-----------------|----------|--------|
| #16 | Atraso na sincronização Corp→CRM | ✅ **RESOLVIDA 15/07** (S1 em prod) | fechar |
| #17 | Exclusão no Corp não reflete no CRM | ✅ **RESOLVIDA 15/07** (S1 em prod) | fechar |
| #15 | Negociação criada no Corp (mesmo dia) não aparece | ◐ S1 resolve em ≤30 min, **exceto cliente novo no mesmo dia** (contato ainda não existe → deal pulado até o cron noturno; é o `skipped:1` dos logs) | **S1.5** |
| #9–#14 | Formulários: aba Corp, ordenação, apólice, tipos de campo, seguradora dropdown, Vr. Comissão | Planejadas | S2.1–S2.6 |
| #20 | Filtro "Próxima ação" no board (presets do Corp: Todas/Hoje/Esta Semana/Este Mês/Próximos/Atraso de/Personalizado) | **Nova** | **S2.7** |
| #26 | Gatilho "/" de templates não aciona nas Conversas | **Verificar em prod** (TemplateDropdown existe no Inbox e no painel — reproduzir 1º) | **S2.8** |
| #21 | Inbox não abre imagem nem áudio | **BUG diagnosticado 17/07** (ver S3.0-B) | **S3.0-B (hotfix)** |
| #1 | Enviar áudio pelo chat | Planejada | S3.2 |
| #2 | Dados do Contato oculto por padrão | Planejada | S3.4 |
| #3 | Filtro "Não lidas" | Planejada | S3.5 |
| #5 | Menu de anexos "+" completo | Planejada (Documento/Fotos/Vídeos/Câmera = S3.1; Enquete/Evento/Figurinha/Catálogo **não existem via UazapiGO** — ver S3.1) | S3.1 |
| #6 | "[Nome]" enviado junto da imagem em grupo | Planejada | S3.6 |
| #7 | Colar imagem na caixa de texto | Planejada | S3.3 |
| #4 | Menu de opções do chat estilo waSpeed (etiquetas, favoritar, transferir, finalizar...) | Ampliada | **S3.8** + decisões |
| #8 | Menções @ mostram ID numérico e perdem formatação | **Nova (bug)** | **S3.9** |
| #18 | Variáveis Corp/Inbox/CRM para templates e mensagens rápidas | **Nova** | **S4.2** |
| #27 | Funil de Sinistros: interface e consulta | Já prevista no Sprint C do checkpoint 10/07 | **S4.1** |
| #22 | Cliente HTTP para API do Corp *(descrita como Laravel)* | ✅ **JÁ EXISTE** — `src/lib/corp/client.ts` (25+ endpoints, token com renovação) | fechar |
| #23 | Formulário Novo Negócio com lookups *(descrita como Nuxt)* | ✅ **JÁ EXISTE** — modal Novo Negócio + `/api/corp/lookups` | fechar |
| #24 | Dupla persistência de Novo Negócio | ✅ **JÁ EXISTE** — dual-write no `POST /api/deals` (ligado desde 09/07, com rollback) | fechar |
| #25 | Cadastro de Novo Cliente CRM→Corp | ✅ **JÁ EXISTE** — NewContactModal (cliente+telefone+endereço+e-mail no Corp, rollback) | fechar |

> **⚠️ Nota de stack**: as issues #22–#25 descrevem o CRM como **Laravel + Nuxt** — o projeto
> real é **Astro 6 + React 19 + Supabase** (ver DOCUMENTACAO.md). As 4 funcionalidades já
> estão entregues e em produção no stack real. Recomendação: fechar com comentário
> apontando onde cada uma vive no código, e alinhar com a equipe u4digital que novas
> issues usem o repo/stack real como referência.

---

## 1. Feedback recebido

**Mensagem (comportamentos de sincronização):**

| # | Comportamento observado | Status |
|---|------------------------|--------|
| F1 | Cadastro de clientes e negociações criadas no CRM replicados corretamente para o Corp | ✅ Funcionando (dual-write validado 09/07) — nenhuma ação |
| F2 | Alterações em um card no Corp **demoram** para refletir no CRM | 🔧 Sprint S1 |
| F3 | **Exclusão** de um card no Corp **não é refletida** no CRM | 🔧 Sprint S1 |

**PDF (ajustes menores):**

| # | Ajuste | Status |
|---|--------|--------|
| P1 | Remover a aba "Corp" do card de negócio | 🔧 Sprint S2 |
| P2 | Ordenação padrão da lista = "Mais recentes" | 🔧 Sprint S2 |
| P3 | Remover o campo "Número da Apólice" dos formulários | 🔧 Sprint S2 |
| P4 | Definir o tipo correto de cada campo (texto, número, data, moeda) — telefone com 22 dígitos no print | 🔧 Sprint S2 |
| P5 | Seguradora no Novo Negócio: lista de seleção carregada do Corp (nunca texto livre) | 🔧 Sprint S2 |
| P6 | Novo Negócio: adicionar Valor da Comissão e Valor do Repasse (sincronizados com o Corp) | 🔧 Sprint S2 |

**PDF 2 — "Marpe - Ajustes Módulo Inbox.pdf" (recebido 15/07 11h):**

| # | Ajuste | Status |
|---|--------|--------|
| I1 | Incluir opção de **enviar áudio** | 🔧 Sprint S3 |
| I2 | Janela "Dados do Contato" **oculta por padrão**, com opção de ver | 🔧 Sprint S3 |
| I3 | Opção de filtrar apenas conversas **Não lidas** | 🔧 Sprint S3 |
| I4 | Estudar o menu do waSpeed e adotar opções relevantes (destaques: Documento, Fotos e vídeos, Resposta rápida, agendamento) | 🔧 Sprint S3 (análise na seção 5.7) |
| I5 | Imagem em grupo aparece com o texto "[Nome do remetente]" junto | 🔧 Sprint S3 |
| I6 | "Colar" na caixa de texto só cola texto — precisa colar imagens | 🔧 Sprint S3 |

---

## 2. Diagnóstico técnico

### F2 — Por que as alterações demoram

A arquitetura atual de sync tem 2 camadas, e a lacuna está no que cada uma cobre:

| Camada | Frequência | O que puxa | Campos cobertos |
|--------|-----------|-----------|-----------------|
| Cron noturno (`/api/internal/corp-sync`, 3h UTC) | **1x/dia** | Lista + **detalhe** de cada negócio | TODOS (seguradora, campanha, % e valores de repasse, observações, produto atual, base de cálculo…) |
| Sync-light (`/api/corp/sync-light`, disparado ao abrir o board) | A cada 10 min **se alguém abrir o board** | Só a **lista** `/negocios_andamento` | Apenas: ramo, prêmio, vr. comissão, tipo, próxima ação, vigências |

Consequências:
1. Campos que só existem no **detalhe** do negócio (a maioria do que se edita no Corp: seguradora, campanha, repasse, observações) só chegam ao CRM **no dia seguinte, às 3h**.
2. O sync-light é *fire-and-forget*: a tela que o disparou renderiza os dados **de antes** do sync — o usuário precisa recarregar de novo para ver o resultado.
3. Se ninguém abre o board, nada sincroniza durante o dia.

### F3 — Por que a exclusão não reflete

`syncNegocios` (`src/lib/corp/sync.ts`) só faz **upsert** (insert ou update). Um negócio excluído no Corp simplesmente desaparece da lista `/negocios_andamento` — e o deal correspondente fica no CRM para sempre, sem nenhum caminho de remoção.

**Cuidado essencial**: sair da lista de andamento **não significa exclusão**. Negócios *finalizados* (ganho/perdido) e *em cálculo* também saem dela. A reconciliação precisa confirmar caso a caso via `GET /negocio` antes de remover qualquer coisa.

### P5 — Por que o cliente viu texto livre na Seguradora

O modal Novo Negócio **já tem** `<select>` com as 30 seguradoras do Corp (`CrmBoard.tsx:657`). Mas quando `/api/corp/lookups` falha ou ainda não respondeu, o componente **degrada silenciosamente** para um input de texto (fallback da linha 663) — foi esse estado que o cliente fotografou. Causa provável: falha transitória do login/token Corp ou modal aberto antes do fetch concluir. O fix é eliminar a degradação, não criar o select (que já existe).

### Inbox — estado atual das capacidades pedidas

| Item | Estado no código |
|------|------------------|
| I1/I4/I6 — enviar áudio/mídia/colar imagem | O CRM só envia **texto** (`/send/text` é a única rota UazapiGO usada em `lib/whatsapp/send.ts` e `POST /api/messages`). Envio de mídia é capacidade nova — depende de validar `POST /send/media` na instância UazapiGO (recebimento/renderização de mídia já funciona). |
| I2 — Dados do Contato | Painel direito sempre visível (`InboxView.tsx:1014`), sem toggle. |
| I3 — Não lidas | Não existe marcação de leitura por conversa. O badge do menu usa heurística "última mensagem é inbound" (`/api/notifications/unread`) — uma conversa só deixa de contar quando alguém **responde**, não quando é aberta. O filtro precisa de um modelo de leitura real. |
| I5 — "[Nome]" junto da imagem | A UazapiGO entrega mensagens de grupo com o corpo prefixado `[Remetente]: texto`. O Inbox já remove o prefixo nos **textos** (`parseGroupBody`, `InboxView.tsx:425`), mas o caption de **mídia** não passa por esse parse — o prefixo vaza como texto visível sob a imagem. É bug de exibição de mensagens recebidas, não do envio. |

---

## 3. Sprint S1 — Sincronização Corp→CRM (F2 + F3)

### S1.1 — Sync diurno com detalhe (a cada 30 min)

- Novo endpoint `GET /api/internal/corp-sync-negocios` (auth via `CRON_SECRET`/`WEBHOOK_KEY`, mesmo padrão do corp-sync): roda `syncNegocios({ withDetail: true })` + reconciliação de exclusões (S1.2).
- Agendamento: a cada 30 min em horário comercial estendido (8h–20h BRT, seg–sáb). Fora disso, o cron noturno das 3h continua cobrindo tudo (clientes + documentos + negócios).
- Custo por execução: ~200 chamadas de detalhe em lotes de 5 (mesmo volume do cron noturno, que já roda sem problema).
- **Contingência de plano Vercel**: cron sub-diário exige plano Pro. Se o projeto estiver em Hobby, agendar via GitHub Actions (workflow `schedule` a cada 30 min chamando o endpoint com `x-webhook-key`) — o endpoint já aceita essa auth, custo zero.

Resultado: **qualquer** edição feita no Corp aparece no CRM em ≤30 min, sem depender de ninguém abrir o board.

### S1.2 — Reconciliação de exclusões (com trilhos de segurança)

Nova função `reconcileNegocios` em `src/lib/corp/sync.ts`, executada após o upsert (no cron diurno, no noturno e no sync-light — neste último o diff é de graça, a lista já está em memória):

1. Monta o conjunto de `corp_id` (`neg_{codfil}_{codigo}`) presentes na lista `/negocios_andamento`.
2. Busca no CRM os deals `corp_id LIKE 'neg_%'` ausentes desse conjunto → **candidatos**.
3. Para cada candidato, confirma via `GET /negocio?codigo=X`:
   - **Retorna o negócio** → ainda existe (finalizado ou em cálculo) → **não mexe** (tratamento de finalizados é o Sprint C do checkpoint 10/07, fora deste escopo).
   - **"Não encontrado"** → exclusão confirmada → remove o deal do CRM.
   - **Erro transitório** (timeout, 401, 5xx) → **não remove**; tenta no próximo ciclo. Nunca deletar por erro de rede.
4. Trilhos de segurança:
   - **Cap por execução**: se os candidatos confirmados passarem de 30 **ou** de 20% dos deals Corp → aborta a reconciliação inteira e registra alerta (protege contra lista truncada/paginação quebrada da API).
   - Toda remoção registrada em `marpe_corp_sync_log` (tipo `negocios_delete`, com códigos e cliente).
   - Notificação in-app para admins: "N negócio(s) excluído(s) no Corp foram removidos do CRM".
5. Escopo: apenas deals `neg_%`. Apólices (`doc_%`) têm outro ciclo de vida e ficam fora.

**Pré-tarefa S1.0 (probe)**: capturar a resposta exata do `GET /negocio` para um código inexistente (status + corpo), com registro descartável se preciso (padrão POST→GET→DELETE já usado em 09/07). A distinção "não encontrado" vs "erro" depende disso.

### S1.3 — Refresh do negócio ao abrir o card (tempo real percebido)

- Novo endpoint `POST /api/corp/refresh-deal` `{ deal_id }`: para deal com `corp_id neg_%`, faz **1** `GET /negocio`, atualiza os campos Corp-owned e devolve o deal fresco. Se o Corp responder "não encontrado", já dispara a remoção reconciliada (mesmo caminho do S1.2, com log).
- `DealPanel` chama ao abrir; painel atualiza silenciosamente em ~1s (skeleton discreto na primeira pintura, sem bloquear).
- É o fix de maior impacto na *percepção*: Marcel edita no Corp, clica no card no CRM → dado atual na hora, sem esperar ciclo de sync.

### S1.4 — Board atualiza após o sync-light

Hoje o board dispara o sync e ignora o resultado. Ajuste no `CrmBoard`: quando o POST retorna `synced: true` com `created + updated > 0` (ou remoções do S1.2), refazer o fetch de deals — a mesma sessão que disparou o sync vê o resultado sem F5.

### ✅ S1 — EXECUTADO EM 15/07 (commits d098cc1 + ad86005, prod + E2E)

Registro do que a execução revelou/ajustou em relação ao planejado:

- **Backup prévio**: dump das tabelas deal-scoped em `~/Backups/marpe-crm/2026-07-15/` (4.701 deals) + repo pushed.
- **Probe S1.0**: `GET /negocio` inexistente/deletado → **404 `"Nenhum negócio encontrado."`** (idêntico nos 2 casos) — essa é a confirmação de exclusão; qualquer outro erro é transitório e nunca remove.
- **Plano Vercel = Hobby confirmado** (via API) → cron diurno roda no **GitHub Actions** (`.github/workflows/corp-sync-diurno.yml`, `*/30 11-23 UTC seg–sáb`, secret `MARPE_WEBHOOK_KEY`). Testado via workflow_dispatch: success.
- **S1.4 já existia**: o CrmBoard já recarregava os deals quando o sync-light retornava `synced:true` — item riscado sem código novo.
- **Notificação de exclusão**: `marpe_notifications` é tabela morta (nenhuma UI a lê). A trilha visível é o **corp_sync_log**, exibido na página Config — cada remoção é registrada lá com corp_id + título (tipo `negocios_reconcile`).
- **Bug latente corrigido**: as CHECK constraints de `marpe_corp_sync_log` rejeitavam os valores que o código sempre usou — **todo log de sync falhou silenciosamente desde o início** (tabela vazia em prod). Migração 20260715 removeu as CHECKs; o log passou a funcionar (inclusive para o cron noturno).
- **FK sem cascade**: `marpe_automation_logs.deal_id` — anulada antes do delete (senão a remoção falharia).
- **Primeira reconciliação (backlog histórico)**: 195 candidatos acumulados desde 02/07 → 160 finalizados marcados (`corp_fora_andamento`) e **34 exclusões confirmadas removidas** (incluindo o deal de teste neg_1_7588). Teto de candidatos recalibrado 150→400 (a proteção real é a confirmação individual + cap de 30 exclusões/ciclo). Regime permanente atingido no mesmo dia: 4 candidatos/ciclo.
- **E2E completo em prod**: negócio descartável criado no Corp → sync criou o deal → `refresh-deal` (vivo) `refreshed:true` → DELETE no Corp → `refresh-deal` detectou e removeu o deal → verificado ausente. Todos os passos OK.

### S1.5 — Complemento pendente: cliente novo no mesmo dia (issue #15)

O sync de negócios pula o negócio quando o **contato ainda não existe** no CRM (cliente
criado no Corp no mesmo dia — só entra no cron noturno de clientes). Fix: no
`syncNegocios`, quando `contactMap` não tiver o `codcli`, buscar `getCliente(codcli)` no
Corp e criar o contato inline (mesmo mapeamento do `syncContactByCorpId`), aí inserir o
deal normalmente. Resultado: negociação de cliente novo aparece no CRM em ≤30 min, igual
às demais. Esforço: pequeno (cabe junto do hotfix S3.0-B).

---

## 4. Sprint S2 — Ajustes do PDF

### S2.1 — Remover aba "Corp" (P1)

- `DealPanel.tsx`: remover `{ key: 'perfil', label: 'Corp' }` do array TABS, o render condicional e o import de `DealTabPerfil`.
- Sem efeitos colaterais: o botão "Sincronizar Corp" mora no Inbox e no perfil do contato (não nessa aba), e os dados úteis dela já aparecem na aba Info.

### S2.2 — Ordenação padrão "Mais recentes" (P2)

- `CrmBoard.tsx:1133`: `useState(false)` → `useState(true)` (`sortRecentFirst`). O toggle "Vencidas primeiro" continua disponível como opção manual.

### S2.3 — Remover "Número da Apólice" dos formulários (P3)

- `DealTabInfo.tsx`: remover o input do modo edição (linhas 288–291); na leitura, exibir a linha "Apólice" **somente quando houver valor** (apólices emitidas sincronizadas do Corp continuam visíveis).
- Coluna `apolice`, variável `{{apolice}}` de templates e o chip `#123456` no card kanban permanecem — são alimentados pelo sync de documentos, não por digitação.

### S2.4 — Tipos e validação de campos (P4)

O print do cliente mostra telefone com 22 dígitos — hoje contato aceita qualquer string. Os campos numéricos de negócio já são `type="number"`; o gap real está nos formulários de contato + formatação monetária.

| Campo | Fix (client + server) |
|-------|----------------------|
| Telefone | Máscara `(DD) 9XXXX-XXXX`, só dígitos, 10–11 dígitos obrigatórios; normalização e rejeição no `POST/PATCH /api/contacts` |
| E-mail | Validação de formato no blur + no submit + no server |
| CPF/CNPJ | Máscara 11/14 dígitos + validação de dígito verificador (aviso não-bloqueante) |
| CEP | Máscara 8 dígitos (ViaCEP já existe) |
| Moeda (Prêmio, Vr. Comissão, Vr. Repasse) | Input com formatação pt-BR (`1.500,00`) que persiste número; aplicar no Novo Negócio e na edição da Info |
| Percentuais (% Comissão, % Repasse) | Clamp 0–100 no blur + validação no server (min/max atuais não impedem digitação fora da faixa) |
| Datas | Já são `type="date"` ✓ |

Onde aplicar: `NewContactModal`, edição de contato (`/contato/[id]`), modal Novo Negócio, edição da aba Info. Helper compartilhado de máscara/validação em `src/lib/masks.ts` para não duplicar.

### S2.5 — Seguradora sempre como lista de seleção (P5)

Eliminar a degradação silenciosa para texto livre:

1. **Cache persistente de lookups**: `/api/corp/lookups` grava o último resultado bom em `marpe_settings` (`corp_lookups_cache`) e, se o Corp falhar, serve o cache (stale-while-revalidate). As 30 seguradoras mudam raramente — cache de dias é aceitável.
2. **Fallback local**: se nem cache houver, popular o select com DISTINCT de `seguradora` dos deals sincronizados — ainda é uma lista, nunca texto livre.
3. **Estado de carregamento**: select desabilitado com "Carregando seguradoras…" enquanto o fetch corre; nunca input de texto.
4. Mesmo tratamento para Produtor e Agente (têm o mesmo fallback de texto hoje).

### S2.6 — Valor da Comissão + Valor do Repasse no Novo Negócio (P6)

- Adicionar os 2 campos ao modal (formato moeda do S2.4), com **auto-cálculo** `Prêmio × %` quando o percentual for preenchido — editável para override manual.
- `POST /api/deals`: aceitar e persistir `comissao_valor` e `valor_repasse` (colunas já existem; a edição da Info já os salva — só o modal de criação não envia).
- **Dual-write**: incluir `val_c` e `val_r` no payload do `POST /negocio` (`src/lib/corp/negocio.ts` — hoje envia só `per_c`/`per_r`). Validar com registro descartável (POST→GET→DELETE) que o Corp aceita/retorna os valores.
- Volta do Corp já funciona: o sync traz `val_c` pela lista e `val_r` pelo detalhe.

### S2.7 — Filtro "Próxima ação" no board (issue #20)

Replicar o filtro de período de próxima ação do Corp no board do CRM, com os mesmos
presets: **Todas** (padrão), **Hoje**, **Esta Semana**, **Este Mês**, **Próximos**,
**Atraso de** (vencidas há N dias) e **Personalizado** (intervalo de datas). Entra na
barra de filtros existente do CrmBoard (filtragem client-side sobre `next_action_date`,
mesmo padrão dos 7 filtros atuais).

### S2.8 — Verificar gatilho "/" de templates nas Conversas (issue #26)

O dropdown de templates via "/" existe no Inbox e na aba Conversas do painel
(`TemplateDropdown` compartilhado, 17 templates em prod). A issue relata que "não está
acionando" — reproduzir em prod (qual tela, qual navegador); se confirmado, corrigir o
handler de teclado/estado. Até reproduzir, tratado como verificação, não como feature.

---

## 5. Sprint S3 — Módulo Inbox

### S3.0-B — HOTFIX: imagem e áudio não abrem (issue #21) — diagnóstico 17/07

**Diagnóstico feito em prod**: das 3.877 mensagens de mídia, apenas 21 estão sem
`media_url` persistida no Storage (9 na última semana ≈ 0,5%) — o webhook falha
intermitentemente ao salvar a mídia e essas mensagens caem no fallback "Ver Imagem"
(proxy `/api/media/download` por `wa_message_id`), que tenta re-baixar da UazapiGO e
falha quando a mídia do WhatsApp já expirou → link morto (vídeo da issue mostra
exatamente isso, mensagem de 14/07). Mídias persistidas abrem normalmente (testado: 200).

Fix em 3 frentes:
1. **Webhook**: retry na persistência da mídia (2 tentativas + log da falha em vez de
   engolir) para o fallback virar exceção rara; investigar o padrão dos 9 casos da
   semana (tamanho? mime? timeout?).
2. **Proxy de re-download**: corrigir/validar o endpoint de download da UazapiGO usado
   pelo `/api/media/download`; quando a UazapiGO ainda tiver a mídia, baixar, persistir
   no Storage e redirecionar (self-healing).
3. **UI**: quando não houver mídia recuperável, mostrar estado claro ("Mídia expirada —
   peça para reenviar") em vez de link que não faz nada; conferir o player de áudio no
   mesmo cenário.

Prioridade máxima da S3 — pode sair como hotfix junto do S1.5, antes do resto do sprint.

### S3.0 — Probe UazapiGO `/send/media` (pré-tarefa)

Validar na instância Marpe-Homologa, com número de teste, o envio de: imagem (base64 + caption), documento (PDF + nome), áudio gravado (webm/opus do navegador — verificar se a UazapiGO aceita e entrega como mensagem de voz/PTT, geralmente `type: "myaudio"`). O resultado define o formato do pipeline dos itens S3.1–S3.3. Se a rota não estiver habilitada na instância, acionar u4digital antes de qualquer UI.

### S3.1 — Envio de mídia: documento, fotos e vídeos (I4 parcial)

- Botão de anexo (clipe) no composer: Documento / Fotos e vídeos, com preview antes do envio e campo de legenda.
- Pipeline: arquivo → base64 → `POST /api/messages` (aceitar `content_type` + mídia) → UazapiGO `/send/media` → gravar em `marpe_messages` com `content_type`/`media_url` (a renderização no chat já existe para mensagens recebidas — reutilizar).
- Limites: validar tamanho máx. (definir ~16 MB, padrão WhatsApp) e tipos aceitos.

### S3.2 — Envio de áudio gravado (I1)

- Botão de microfone no composer: gravação via MediaRecorder (permissão do navegador), UI de gravando/cancelar/enviar com duração.
- Envio como mensagem de voz (PTT) pelo mesmo pipeline do S3.1.
- Player das mensagens de áudio já existe no chat (recebidas) — mensagens enviadas usam o mesmo componente.

### S3.3 — Colar imagem na caixa de texto (I6)

- Handler `onPaste` no composer: `clipboardData` com arquivo/imagem → abre o mesmo preview do S3.1 (com legenda) → envia pelo pipeline de mídia. Print do Windows/Mac colado passa a funcionar.

### S3.4 — Dados do Contato oculto por padrão (I2)

- Painel direito inicia **fechado**; botão "Ver dados" no cabeçalho da conversa abre/fecha (animação de slide já no padrão Liquid Glass).
- Preferência persistida em `localStorage` (quem preferir sempre aberto, mantém).

### S3.5 — Filtro "Não lidas" com leitura real (I3)

- Migração pequena: coluna `inbox_read_at timestamptz` em `marpe_contacts` (runner Playwright padrão `run-migration-YYYYMMDD.mjs`).
- Abrir a conversa marca `inbox_read_at = now()`; não lida = última mensagem inbound mais recente que `inbox_read_at`.
- Chip/toggle "Não lidas" ao lado das abas Conversas/Grupos filtrando a lista.
- **Alinhar o badge do menu** (`/api/notifications/unread`) ao mesmo modelo — hoje ele usa a heurística "última é inbound"; badge e filtro precisam contar a mesma coisa, senão geram confusão.

### S3.6 — Fix: "[Nome]" junto da imagem em grupos (I5)

- Aplicar o `parseGroupBody` (já existente para textos) também ao caption de mídia em mensagens de grupo: prefixo vira o rótulo de remetente acima da bolha (como nos textos) e some do caption. Caption real, quando houver, permanece.

### S3.7 — Estudo do menu waSpeed (I4) — mapeamento e proposta

O que os destaques do print pedem, e onde cada um fica:

| Recurso waSpeed | Situação no CRM | Encaminhamento |
|-----------------|-----------------|----------------|
| Resposta rápida | ✅ Já existe — templates via "/" no composer | Nada a fazer (mostrar ao Marcel no treinamento) |
| Documento / Fotos e vídeos | ❌ | S3.1 |
| Áudio | ❌ | S3.2 |
| Anotações sobre o contato | ✅ Observações no painel do contato + notas no negócio | Nada a fazer |
| Mensagem agendada (ícones de relógio/calendário) | ❌ | **Proposta P-A** abaixo — precisa de OK |
| Lembrete (ícone de alarme) | Parcial — próxima ação do negócio cobre o caso de uso | **Proposta P-B** abaixo — precisa de OK |
| Câmera | — | Coberto por Fotos e vídeos (no celular o seletor de arquivo abre a câmera) |
| Enquete / Evento / Figurinha / Catálogo | — | Não se aplica: recursos nativos do WhatsApp fora do escopo da UazapiGO/CRM |

**Proposta P-A — Mensagem agendada**: botão de relógio no composer → escolher data/hora → mensagem gravada em tabela `marpe_scheduled_messages` e enviada pelo runner interno (mesma infraestrutura de agendamento do S1.1). Esforço: ~0,5 sessão. Entra como S3.8 se aprovado.

**Proposta P-B — Lembretes**: em vez de replicar o alarme do waSpeed, criar atalho "Lembrete" na conversa que preenche a próxima ação do negócio vinculado (ou cria notificação in-app com data). Reaproveita o que existe. Esforço: pequeno.

### S3.8 — Opções de conversa estilo waSpeed (issue #4)

A issue amplia o estudo do S3.7 com a barra de opções do waSpeed. Mapeamento e proposta:

| Opção waSpeed | Situação/Proposta |
|---------------|-------------------|
| Respostas rápidas | ✅ Já existe (templates via "/") |
| Organização por funil | ✅ Já existe (card ↔ conversa com deep-link) |
| Etiquetas (atribuir/filtrar) | **Entra** — contatos já têm `tags`; adicionar atribuição na conversa + filtro por etiqueta na lista |
| Favoritar conversa | **Entra** — coluna `pinned` no contato, fixa no topo da lista |
| Finalizar conversa | **Entra** — status aberta/finalizada por conversa (reabre sozinha em nova mensagem), com filtro |
| Encaminhar/exportar mensagem | **Entra (fase 2 do S3)** — encaminhar para outro contato via UazapiGO |
| Transferir atendimento | **Decisão** — exige modelo de atendentes/atribuição de conversa (setores). Casa com o gap conhecido "filtro por setor/atendente". Esforço médio-alto → proposta P-C abaixo |
| Tradução | **Fora** (baixo valor para o fluxo da corretora; reavaliar se o cliente insistir) |

**Proposta P-C — Atribuição de atendimento**: dono por conversa (Marcel/Vanessa/Adria),
transferir atendimento, filtro "minhas conversas". Esforço: ~1 sessão própria. Precisa OK.

### S3.9 — Menções (@) não resolvem nome + formatação perdida (issue #8)

Em grupos, menção aparece como `@236206122082483` em vez do nome, e negrito/marcadores
do WhatsApp somem. Fix: (1) o webhook guarda o mapa de menções (`mentionedJidList`/
participantes) no `metadata` da mensagem; render substitui `@<jid>` pelo nome do contato
(lookup por telefone) ou pelo `sender_name` conhecido; (2) renderizador leve da
formatação do WhatsApp no chat: `*negrito*`, `_itálico_`, `~tachado~`, `` `mono` `` e
listas — aplicado nas bolhas (in e out).

---

## 5B. Sprint S4 — Sinistros e variáveis (novas issues do board)

### S4.1 — Funil de Sinistros: interface e consulta (issue #27)

O funil "Sinistros" já existe no CRM (etapas Pendente/Aberto/Em Andamento/Autorizado/
Concluído) — falta populá-lo e dar entrada manual:
1. **Sync**: `GET /sinistros` do Corp → deals no funil Sinistros (corp_id prefixo
   `sin_`, etapa por situação), no cron noturno + diurno.
2. **Botão "Registrar Sinistro"** no board: busca a apólice do cliente no Corp
   (`/documentos` do contato), pré-preenche dados-base e cria o deal; discovery do
   POST de sinistro na doc Postman para dual-write (se existir rota de escrita).
3. Renovações (`GET /renovacoes` → funil Renovações) continuam previstas do Sprint C
   do checkpoint 10/07 — mesmo mecanismo, entra junto se o tempo permitir.

### S4.2 — Variáveis Corp/Inbox/CRM para templates (issue #18)

Auditar e expandir o motor de 18 variáveis para cobrir os dados hoje disponíveis do
Corp e o contexto de sinistros: catalogar variáveis por categoria (Contato, Negócio,
Apólice, Sinistro, Sistema), expor no picker de variáveis dos templates (agrupado),
garantir que mensagens rápidas e automações resolvam todas, e documentar a lista na
tela de templates. Variáveis novas candidatas: `{{sinistro_numero}}`, `{{sinistro_situacao}}`,
`{{apolice_seguradora}}`, `{{parcela_vencimento}}` (conforme dados do sync).

---

## 6. Decisões que precisam de OK (Marcel/Tiago)

1. **Exclusão no CRM: definitiva ou arquivada?** Recomendação: **exclusão definitiva** (espelha o Corp, que é a fonte da verdade de negócios; as conversas de WhatsApp não se perdem — são vinculadas ao contato, não ao negócio). Anotações/documentos anexados àquele deal no CRM são removidos junto. Alternativa mais conservadora: arquivar oculto por 30 dias antes de apagar.
2. **Sentido inverso**: excluir um card no CRM hoje **não** exclui no Corp. Manter assim? (O feedback só pediu Corp→CRM; alinhar expectativa evita o próximo "bug report".)
3. **Frequência do sync diurno**: 30 min está bom, ou preferem 15 min? (15 min dobra o volume de chamadas na API do Corp — ver risco R1.)
4. **Mensagem agendada (Proposta P-A)**: aprovam a inclusão? (~0,5 sessão a mais no S3)
5. **Lembretes (Proposta P-B)**: aprovam o formato proposto (atalho → próxima ação/notificação) em vez de replicar o alarme do waSpeed?
6. **Atribuição de atendimento (Proposta P-C, issue #4)**: querem o modelo de dono por conversa + transferir + "minhas conversas"? (~1 sessão própria)
7. **Board u4digital**: posso fechar as issues já resolvidas/implementadas (#16, #17, #22–#25) com comentário técnico mapeando cada uma, e comentar o plano/sprint nas demais? (mantém o board da equipe do Tiago como espelho fiel do andamento)

---

## 7. Riscos

| # | Risco | Mitigação |
|---|-------|-----------|
| R1 | Rate limit da CorpAPI desconhecido; sync diurno adiciona ~200 chamadas de detalhe por ciclo | Lotes de 5 (padrão atual), janela 8–20h, monitorar erros/429 no `corp_sync_log` na primeira semana; reduzir frequência se necessário |
| R2 | `POST /negocio` pode ignorar/rejeitar `val_c`/`val_r` | Probe com registro descartável antes de ligar; se rejeitar, valores ficam só no CRM e anotamos na SOLICITACAO-AGIA-API |
| R3 | Lista `/negocios_andamento` truncada (falha de paginação) poderia disparar exclusão em massa | Cap de 30 / 20% + confirmação individual via `GET /negocio` + abort com alerta |
| R4 | Cron sub-diário indisponível no plano Vercel atual | Fallback GitHub Actions (S1.1) — decisão na implementação, sem impacto no design |
| R5 | `POST /send/media` pode não estar habilitado na instância UazapiGO ou ter formato diferente do esperado | Probe S3.0 antes de qualquer UI; se indisponível, acionar u4digital (Tiago) |
| R6 | Áudio gravado no navegador sai como webm/opus — a UazapiGO pode exigir outro formato para entregar como mensagem de voz | Validar no probe S3.0; plano B: enviar como arquivo de áudio comum (funciona, perde só o visual de PTT) |

---

## 8. Ordem de execução e estimativa (revisada 17/07 com o board)

| Etapa | Conteúdo | Issues | Estimativa |
|-------|----------|--------|-----------|
| ~~S1~~ | ~~Sync diurno + reconciliação + refresh no card~~ | #16 #17 | ✅ feito 15/07 |
| **HF** | Hotfix: mídia não abre (S3.0-B) + contato ausente no sync (S1.5) + verificar "/" (S2.8) | #21 #15 #26 | 0,5–1 sessão |
| S2 | Formulários: P1–P6 + filtro Próxima ação | #9–#14 #20 | 1–1,25 sessão |
| S3.0 | Probe UazapiGO `/send/media` (imagem, documento, áudio) | — | 30 min |
| S3 | Inbox: mídia + áudio + colar + painel oculto + Não lidas + prefixo grupos + menções/formatação + etiquetas/favoritar/finalizar | #1–#8 | 2,5–3 sessões |
| S4 | Funil Sinistros (sync + Registrar Sinistro) + variáveis de template | #27 #18 | 1 sessão |
| P-A/P-B/P-C | (Se aprovados) msg agendada + lembretes + atribuição de atendimento | #4 parcial | +1,5 sessão |
| QA | E2E por sprint + validação conjunta com Tiago | — | 0,5 sessão |

Ordem: **HF → S2 → S3 → S4** (propostas P-* encaixam onde forem aprovadas). O hotfix
vem primeiro porque mídia que não abre afeta o uso diário do Inbox. Deploy de cada
bloco separado, com validação do Tiago entre eles. Total restante: **~5–6 sessões**
(+1,5 se as 3 propostas forem aprovadas).

## 9. Critérios de aceite

- [x] Alteração feita no Corp reflete no CRM em ≤30 min sem ação manual; ao abrir o card, reflete imediatamente *(S1 em prod 15/07; validado por E2E)*
- [x] Exclusão no Corp remove o card do CRM em ≤30 min, com registro no corp_sync_log (visível na Config) *(S1 em prod 15/07; 34 históricos + E2E)*
- [x] Negócio finalizado no Corp **não** é excluído do CRM pela reconciliação *(160 finalizados verificados e mantidos)*
- [ ] Aba "Corp" ausente do painel do negócio
- [ ] Board abre ordenado por "Mais recentes"
- [ ] Campo "Número da Apólice" ausente dos formulários (leitura mantém valor sincronizado quando existir)
- [ ] Telefone com dígitos a mais/menos e e-mail inválido são bloqueados com mensagem clara
- [ ] Seguradora do Novo Negócio é sempre dropdown com as seguradoras do Corp, mesmo com a API do Corp fora do ar
- [ ] Novo Negócio grava Vr. Comissão / Vr. Repasse no CRM e os valores aparecem no Corp
- [ ] Inbox envia áudio gravado, documento e fotos/vídeos, e o destinatário recebe no WhatsApp (conferido no celular)
- [ ] Ctrl+V / Cmd+V de uma imagem no composer abre preview e envia
- [ ] Painel Dados do Contato inicia oculto e abre pelo botão "Ver dados"
- [ ] Filtro "Não lidas" lista só conversas com mensagem nova; abrir a conversa a marca como lida e o badge do menu acompanha
- [ ] Imagem recebida em grupo mostra o remetente como rótulo, sem o texto "[Nome]" solto
- [ ] Toda imagem/áudio recebido abre no Inbox; mídia irrecuperável mostra "Mídia expirada", nunca link morto (#21)
- [ ] Negociação de cliente criado no Corp no mesmo dia aparece no CRM em ≤30 min (#15)
- [ ] Menção @ em grupo mostra o nome do contato e negrito/itálico do WhatsApp renderizam (#8)
- [ ] Board filtra por próxima ação com os presets do Corp (#20)
- [ ] Conversas aceitam etiqueta, favorito e finalizar, com filtros correspondentes (#4)
- [ ] Funil Sinistros populado pelo sync + botão Registrar Sinistro funcional (#27)
- [ ] Picker de variáveis por categoria nos templates, com variáveis de sinistro/apólice (#18)
