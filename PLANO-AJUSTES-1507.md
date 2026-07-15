# Plano — Checkpoint 15/07: Sincronização Corp→CRM + Formulários + Inbox

> Última atualização: 15/07/2026
> Origem: feedback Marpe 15/07 (mensagem + PDF "Marpe - Ajustes.pdf" + PDF "Marpe - Ajustes Módulo Inbox.pdf")
> Status: PLANEJADO — aguardando OK para execução

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

---

## 5. Sprint S3 — Módulo Inbox

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

**Proposta P-B — Lembretes**: em vez de replicar o alarme do waSpeed, criar atalho "Lembrete" na conversa que preenche a próxima ação do negócio vinculado (ou cria notificação in-app com data). Reaproveita o que existe. Esforço: pequeno. Entra como S3.9 se aprovado.

---

## 6. Decisões que precisam de OK (Marcel/Tiago)

1. **Exclusão no CRM: definitiva ou arquivada?** Recomendação: **exclusão definitiva** (espelha o Corp, que é a fonte da verdade de negócios; as conversas de WhatsApp não se perdem — são vinculadas ao contato, não ao negócio). Anotações/documentos anexados àquele deal no CRM são removidos junto. Alternativa mais conservadora: arquivar oculto por 30 dias antes de apagar.
2. **Sentido inverso**: excluir um card no CRM hoje **não** exclui no Corp. Manter assim? (O feedback só pediu Corp→CRM; alinhar expectativa evita o próximo "bug report".)
3. **Frequência do sync diurno**: 30 min está bom, ou preferem 15 min? (15 min dobra o volume de chamadas na API do Corp — ver risco R1.)
4. **Mensagem agendada (Proposta P-A)**: aprovam a inclusão? (~0,5 sessão a mais no S3)
5. **Lembretes (Proposta P-B)**: aprovam o formato proposto (atalho → próxima ação/notificação) em vez de replicar o alarme do waSpeed?

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

## 8. Ordem de execução e estimativa

| Etapa | Conteúdo | Estimativa |
|-------|----------|-----------|
| S1.0 | Probe `GET /negocio` inexistente + confirmação plano Vercel | 15 min |
| S1 | Sync diurno + reconciliação de exclusões + refresh no card + board refetch | 1 sessão |
| S2 | 6 ajustes do PDF 1 (P1–P6) | 1 sessão |
| S3.0 | Probe UazapiGO `/send/media` (imagem, documento, áudio) | 30 min |
| S3 | Inbox: mídia + áudio + colar imagem + painel oculto + filtro Não lidas + fix prefixo em grupos | 1,5–2 sessões |
| S3.8/S3.9 | (Se aprovados) mensagem agendada + lembretes | +0,5 sessão |
| QA | E2E em prod: editar/excluir negócio no Corp e cronometrar reflexo; criar negócio com valores e conferir no Corp; enviar áudio/imagem/documento e conferir no celular; validação conjunta com Tiago | 0,5 sessão |

Ordem: **S1 → S2 → S3**. S1 primeiro porque é o comportamento que o cliente está testando ativamente e o que mais mina confiança; S2 são correções rápidas de formulário; S3 é o bloco mais volumoso e depende do probe S3.0. Deploy de cada sprint separado, com validação do Tiago entre eles.

## 9. Critérios de aceite

- [ ] Alteração feita no Corp reflete no CRM em ≤30 min sem ação manual; ao abrir o card, reflete imediatamente
- [ ] Exclusão no Corp remove o card do CRM em ≤30 min, com registro no log de sync e notificação in-app
- [ ] Negócio finalizado no Corp **não** é excluído do CRM pela reconciliação
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
