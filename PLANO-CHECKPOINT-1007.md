# Plano — Checkpoint Tiago 10/07 (Novos Ajustes)

Last updated: 2026-07-13
Fonte: `Downloads/Checkpoint (Marpe) - 1007 - Novos Ajustes.pdf` (Tiago Donicht — u4digital, 12 itens)
Status: item 2 RESOLVIDO em prod (hotfix 13/07, befe08b) · Sprint A IMPLEMENTADO (13/07, commit d00e2a7) — preview na Vercel aguardando aprovação para prod · Sprints B-D pendentes

---

## Mapa dos 12 itens → sprints

| # | Item (resumo) | Sprint | Nota |
|---|---|---|---|
| 2 | Tema alternando sozinho ao navegar | ✅ FEITO | Regressão do ClientRouter (View Transitions troca o `<html>` e derrubava `.light`). Fix: `astro:after-swap` reaplica. Em prod 13/07 |
| 4 | Remover legenda de Ramo acima do kanban | A | Trivial (bloco em CrmBoard) |
| 3 | Ícone de conversa no painel não direciona | A | Remover o ícone (recomendação do próprio Tiago) + consertar o deep-link `/inbox?contact=` que é usado também no /contato/[id] |
| 1 | Ícones de acesso rápido nos cards (estilo waSpeed) + foto | A | Avatar + fileira de ícones no card, todos os funis |
| 5 | Campo de mensagem: expandir + preview de variáveis | A | Textarea auto-expansível + preview resolvido client-side |
| 11 | Funil Vendas exibindo cards de 2022/2023 | A | Janela padrão de recência + chip "ver todos" |
| 6 | Aba Info sem pick-lists do Corp | B | Dropdowns Corp na edição da aba Info |
| 7 | Novo Negócio: falta Campanha e Base de cálculo repasse | B | Investigar campanhas=0 no sync; Corp NÃO tem endpoint para esses dois — derivar dos deals sincronizados |
| 9 | Trazer renovações do Corp para o funil Renovações | C | `GET /renovacoes` → cards (funil e etapas já existem no CRM) |
| 8 | Trazer sinistros do Corp + botão "Registrar sinistro" | C | `GET /sinistros` → cards; write depende de discovery na doc Postman |
| 12 | Sincronizar todos os cards com o Corp (modelo: card Tiago) | C | Auditoria de completude + backfill do detail sync |
| 10 | Aba Conversas só com interações do negócio do card | D | Requer decisão de produto (ver abaixo) — conflita com fix de 02/07 |

---

## Sprint A — Kanban & Card UX (sem dependência Corp) — 1 sessão

**A1 (item 4)** Remover a legenda de ramos acima do kanban (bloco "Fix 19" em `CrmBoard.tsx`).

**A2 (item 3)** Remover o ícone de conversa do header do `DealPanel` (sugestão do Tiago no PDF, validar com Marcel no checkpoint). Independente disso, **consertar o deep-link** `/inbox?contact={id}`: hoje o InboxView carrega só 50 contatos e o `activeContact = contacts.find(...)` falha quando o contato não está na primeira página → tela "Selecione um contato". Fix: quando houver `?contact=`, buscar `/api/contacts/{id}` e injetar na lista. O link continua usado no /contato/[id] (quick actions).

**A3 (item 1)** Cards estilo waSpeed em todos os funis:
- Avatar do contato no card (photo_url do WhatsApp; fallback iniciais coloridas)
- Fileira de ícones de acesso rápido no rodapé do card: Conversas, Notas, Docs, Perfil do contato
- Clique em cada ícone abre o `DealPanel` direto na aba correspondente → `DealPanel` ganha prop `initialTab`; Perfil navega para /contato/[id]
- Mesmo componente de card serve todos os funis — nada a replicar por funil

**A4 (item 5)** Composer da aba Conversas do card (`DealTabConversas`):
- `<input>` → `<textarea>` auto-expansível (1→6 linhas, Enter envia / Shift+Enter quebra — comportamento atual preservado)
- **Preview de variáveis**: quando o texto contém `{{...}}`, mostrar linha de preview com valores resolvidos (nome, primeiro_nome, telefone, cidade, veiculo, placa, apolice, seguradora, premio, ramo, produtor, vigências, periodo_dia — espelho client-side do `lib/variables.ts`, dados do deal+contato já estão no painel)
- Replicar o mesmo composer no Inbox (mesmo helper) — o custo marginal é pequeno e mantém consistência

**A5 (item 11)** Funil Vendas com janela padrão de recência:
- Default: exibir apenas deals com atividade recente (proposta: `created_at` OU `next_action_date` nos últimos 12 meses — confirmar janela com Marcel)
- Chip visível "Mostrando últimos 12 meses · N ocultos — ver todos" que desativa o corte
- Busca e filtros existentes ignoram o corte quando usados (busca por nome já encontra antigos)

## Sprint B — Pick-lists Corp completos — 1 sessão

**B1 (item 6)** `DealTabInfo` (modo edição): trocar inputs livres por dropdowns do Corp via `/api/corp/lookups` (já entrega seguradoras 32, produtores 11, agentes 2): Seguradora, Produtor, Agente + Campanha e Base de cálculo repasse.

**B2 (item 7)** Novo Negócio — Campanha e Base de cálculo repasse:
- **Investigar campanhas = 0** (confirmado em prod 13/07): o sync grava `campanha`/`detalhes_corp.codcamp`? Se os negócios do Corp têm campanha e ela não chega, corrigir o mapeamento do sync; depois o DISTINCT popula o dropdown
- **Fato técnico a comunicar ao Tiago**: a CorpAPI NÃO expõe endpoints de campanhas nem de bases de cálculo de repasse (confirmado na doc oficial Postman em 09/07). O CRM deriva as listas dos negócios sincronizados. Se quiserem a lista "mestra", pedir endpoint à Agia (anexar ao SOLICITACAO-AGIA-API.md)
- Adicionar dropdown "Base de cálculo repasse" ao modal (DISTINCT de `base_calculo_repasse` dos deals; o dual-write já envia `campo_base_r`)

## Sprint C — Funis Renovações e Sinistros + auditoria de sync — 1–2 sessões

**C1 (item 9)** Renovações do Corp → funil "Renovações" (funil e etapas JÁ existem: 60 dias, 30 dias, Contato Realizado, Cotação Enviada, Renovado, Cancelado):
- Novo módulo de sync consumindo `GET /renovacoes` (por faixa de vigência)
- Card criado com corp_id prefixado próprio (ex.: `renov_{codfil}_{nosnum}`) para nunca colidir com o sync de negócios (regra do formato aprendida em 09/07)
- Etapa de entrada automática pela proximidade do fim de vigência: ≤60d → "60 dias", ≤30d → "30 dias" (regra a validar com Marcel)
- Roda no cron noturno + gatilho no sync-light; updates só tocam campos Corp-owned (regra de 02/07 — nunca resetar etapa movida manualmente)

**C2 (item 8)** Sinistros do Corp → funil "Sinistros" (etapas existem: Pendente, Aberto, Em Andamento, Autorizado, Concluído):
- Sync via `GET /sinistros` (por data); mapear status do Corp → etapa (levantar valores reais na primeira carga e validar mapa com Marcel)
- Botão **"Registrar sinistro"** no board do funil Sinistros: 1º passo é discovery na collection Postman (existe POST de sinistro?). Se NÃO existir: registrar card no CRM + `POST /atendimento` no Corp como trilha, e incluir pedido de endpoint de sinistro no e-mail à Agia
- corp_id prefixado (`sin_...`)

**C3 (item 12)** Auditoria de completude do sync:
- Query: quantos deals com corp_id estão sem `detalhes_corp`/campos ricos (produtor, campanha, repasse) — backfill via detail sync em lote
- Garantir que o cron cobre todos os negócios ativos (não só os tocados recentemente) e relatar números no checkpoint

## Sprint D — Conversas por negócio (item 10) — 1 sessão + decisão de produto

**Contexto do conflito**: em 02/07 mudamos a aba Conversas para filtrar por `contact_id` porque mensagens inbound do WhatsApp **nunca** chegam com deal_id (o WhatsApp não sabe a qual negócio a mensagem se refere) — filtrar por deal mostrava aba vazia. O pedido agora é o inverso: só as conversas do negócio do card.

**Proposta a validar com Marcel/Tiago**:
1. Webhook passa a **atribuir** cada mensagem inbound ao negócio aberto mais recente do contato (grava deal_id no insert)
2. Aba Conversas do card filtra por deal_id **por padrão**, com toggle "Ver todas do contato"
3. Outbound enviado de dentro do card já carrega deal_id (comportamento atual)
4. Limitação honesta: se o cliente tem 2 negócios abertos (Auto + Vida), a heurística manda a mensagem para o mais recente — sem isso, não existe atribuição automática possível num número único de WhatsApp

## Perguntas para levar ao Tiago/Marcel

1. Item 3 — confirmam a remoção do ícone de conversa do topo do painel? (Tiago já sugeriu)
2. Item 10 — aprovam a heurística "inbound → negócio aberto mais recente" + toggle "ver todas"?
3. Item 8 — "Registrar sinistro" precisa gravar no Corp (se existir endpoint) ou basta card no CRM + atendimento no Corp? Validar mapa status→etapa
4. Item 11 — janela padrão de 12 meses ok?
5. Item 9 — regra de entrada 60d/30d ok?
6. Itens 6/7 — cientes de que Campanha e Base de cálculo repasse não têm endpoint na CorpAPI (derivamos dos dados sincronizados; pedido à Agia se quiserem lista mestra)?

## Estimativa

| Sprint | Escopo | Esforço |
|---|---|---|
| ✅ Hotfix | Item 2 (tema) | FEITO 13/07 |
| A | Itens 1, 3, 4, 5, 11 | 1 sessão |
| B | Itens 6, 7 | 1 sessão |
| C | Itens 8, 9, 12 | 1–2 sessões |
| D | Item 10 | 1 sessão (após decisão) |
| **Total restante** | | **~4–5 sessões** |

Ordem sugerida: A → B → C → D. A e B não dependem de ninguém; C tem 1 discovery (POST sinistro); D trava numa decisão de produto — levar as perguntas no próximo checkpoint e executar D por último.
