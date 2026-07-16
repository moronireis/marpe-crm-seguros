# Marpe CRM Seguros — Documentação do Projeto

> **Versão 15/07/2026** (checkpoint S1 em produção) — este repositório receberá atualizações futuras.
> Credenciais e acessos: **CREDENCIAIS.md** (repo privado apenas).
> Contexto técnico detalhado para desenvolvimento: **CLAUDE.md**.

---

## 1. O que é o projeto

CRM inteligente para corretora de seguros, integrado ao ERP **Corp Nuvem (Agia)** e ao
**WhatsApp** (via UazapiGO). Complementa o Corp — nunca o substitui: as integrações da
corretora com os portais das seguradoras continuam no Corp; o CRM adiciona funil visual
(kanban), inbox de WhatsApp unificado, automações, campanhas segmentadas e dashboards.

| Item | Detalhe |
|------|---------|
| Cliente | Marcel Foletto — Marca Corretora de Seguros (São Sepé, RS) |
| Parceiro comercial | Tiago Donicht (u4digital / uhunter.io) |
| Equipe de uso | Marcel (admin), Vanessa (comercial), Adria (operacional) |
| Comercial | R$ 4.900 implantação + R$ 597/mês |
| Produção | https://marpe-crm-seguros.vercel.app |
| Volume | ~2.700 clientes sincronizados do Corp, ~150-200 negociações ativas, ~4.700 deals no total (negócios + apólices) |

## 2. Stack e arquitetura

| Camada | Tecnologia |
|--------|-----------|
| Framework | Astro 6 SSR + React 19 (islands) |
| Estilo | Inline styles + design system "Liquid Glass" v2 (tokens dark/light em `src/styles/global.css`) |
| Banco | Supabase/PostgreSQL hospedado na **Cloudfy** (22+ tabelas, prefixo `marpe_`) |
| Auth | Supabase Auth (e-mail/senha, cookies `sb-access-token`/`sb-refresh-token`, middleware SSR) |
| WhatsApp | UazapiGO (bridge WhatsApp Web) — instância Marpe-Homologa no servidor u4digital |
| ERP | Corp Nuvem (Agia) via REST — leitura (sync) e escrita (dual-write de clientes e negócios) |
| Deploy | Vercel (SSR functions), plano Hobby, deploy manual `npx vercel deploy --prod` |
| Crons | Vercel Cron (diários) + GitHub Actions (sub-diário — Hobby não roda) |

### Fluxo de dados

```
Corp (Agia) ──sync──▶ Supabase (marpe_*) ◀──webhook── UazapiGO (WhatsApp)
   ▲                        ▲                              ▲
   └──dual-write────────────┤                              │
      (novo cliente/negócio │ SSR + APIs (36 endpoints)    │ envio de mensagens
       criado no CRM)       │                              │
                       Astro/React (Vercel) ───────────────┘
```

### Sincronização Corp→CRM (estado 15/07)

| Mecanismo | Frequência | O que faz |
|-----------|-----------|-----------|
| Cron noturno Vercel (`/api/internal/corp-sync`, 3h UTC) | 1x/dia | Sync completo: clientes + documentos/apólices + negócios (com detalhe) |
| Cron diurno **GitHub Actions** (`/api/internal/corp-sync-negocios`) | 30 em 30 min, 8h–20h30 BRT seg–sáb | Negócios com detalhe + **reconciliação de exclusões** |
| Sync-light (`/api/corp/sync-light`) | Ao abrir o board (auto-throttle 10 min) | Lista de negócios + reconciliação; board recarrega se houve mudança |
| Refresh no card (`/api/corp/refresh-deal`) | Ao abrir um negócio no painel | 1 GET /negocio atualiza o card na hora; se excluído no Corp, remove e avisa |
| Cron fotos (`/api/internal/sync-photos`, 7h UTC) | 1x/dia | Fotos de perfil do WhatsApp (URLs expiram — refresh contínuo) |
| Cron parcelas (`/api/internal/check-installments`, 11h UTC) | 1x/dia | Vencimento de parcelas |

**Reconciliação de exclusões** (checkpoint 15/07): negócio que sai da lista de andamento é
confirmado individualmente no Corp — 404 "Nenhum negócio encontrado." = excluído → deal
removido do CRM; existe = finalizado → mantido e marcado (`detalhes_corp.corp_fora_andamento`).
Trilhos de segurança: cap de 30 exclusões/ciclo, 20% do total, abort com lista incompleta,
erro transitório nunca remove. Auditoria: tabela `marpe_corp_sync_log` (visível em /config).

## 3. Deploy do zero (passo a passo)

1. **Clonar e instalar**
   ```bash
   git clone https://github.com/u4digital/Marpe-Project.git && cd Marpe-Project
   npm install
   ```
2. **Variáveis de ambiente** — criar `.env` local com as chaves de CREDENCIAIS.md
   (seções 2–5): `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `UAZAPI_URL`, `UAZAPI_TOKEN`, `CORP_API_URL`, `CORP_API_EMAIL`, `CORP_API_PASSWORD`,
   `WEBHOOK_KEY`, `CRON_SECRET`. Dev local: `npm run dev` → http://localhost:4321.
3. **Banco** — o Supabase da Cloudfy já está provisionado e populado. Para um ambiente novo:
   aplicar `supabase/schema.sql` + `supabase/migrations/*` (em ordem de data) + seeds
   (`seed-funnels.sql`, `seed-templates.sql`). Na Cloudfy, DDL só pelo Studio
   (runners `supabase/run-migration-*.mjs` — ver CREDENCIAIS.md §2).
4. **Vercel** — `npx vercel link` no projeto existente (ou criar novo), setar as env vars
   de produção (`npx vercel env add ...` com os valores de CREDENCIAIS.md) e deployar:
   `npx vercel deploy --prod`. Os 3 crons diários vêm de `vercel.json`.
5. **Cron diurno (GitHub Actions)** — no repositório que for executar:
   `gh secret set MARPE_WEBHOOK_KEY --body "<WEBHOOK_KEY>"` e garantir o workflow
   `corp-sync-diurno.yml` habilitado. **Ativo hoje em moronireis/marpe-crm-seguros;
   desabilitado no espelho u4digital** (não habilitar em dois repos — duplicaria o sync).
6. **Webhook do WhatsApp** — na UazapiGO, apontar o webhook da instância para
   `https://<domínio>/api/webhook/whatsapp` com eventos `messages` e `messages_groups`
   (config visível em /config do CRM, com QR code para conectar o número).
7. **Smoke test** — login (CREDENCIAIS.md §1), board /crm carrega, /config mostra
   WhatsApp conectado e logs de sync recentes, `GET /api/corp/status` responde com
   contagem de clientes.

## 4. Operação e manutenção

- **Logs de sync**: página /config (seção Corp) lê `marpe_corp_sync_log` — inclui as
  remoções da reconciliação (tipo `negocios_reconcile`, com corp_id e título de cada deal).
- **Backup do banco**: `node scripts/backup-db.mjs <pasta-destino>` (usa `.env`) — exporta
  deals e tabelas satélites em JSON. Último backup pré-S1: 15/07/2026 (4.701 deals).
- **Migrações**: nunca DDL direto via API (WAF Cloudfy bloqueia). Criar
  `supabase/migrations/YYYYMMDD-descricao.sql` + runner `run-migration-YYYYMMDD.mjs`.
- **Rate limit Corp**: sync usa lotes de 5 chamadas; se surgirem erros em rajada no log,
  reduzir frequência do cron diurno.
- **Deploy**: sempre manual (`npx vercel deploy --prod`). Não há CI de deploy por push.

## 5. Estado da versão 15/07 e roadmap

### Entregue (resumo por fase)
- **Sprints 1–4 + Fase 1** — CRM core (funis, kanban, motivos de perda, 18 variáveis),
  comunicação (inbox, grupos, anexos, campanhas segmentadas), analytics (metas, pesquisas,
  exportação, links rastreados), chatbot de primeiro contato, mobile, badges, filtros.
- **Fase 2 parcial** — painel do negócio com 6 abas replicando a Negociação do Corp,
  notas e documentos por deal, pick-lists vindas do Corp.
- **Corp write** — Novo Cliente e Novo Negócio criados no CRM replicam no Corp
  (dual-write com rollback; POST /negocio decifrado por bissecção sobre a doc Postman).
- **Redesign Liquid Glass** (10/07) — tokens v2 dark/light, vidro, View Transitions.
- **Checkpoints 10/07 e 14/07** — 12 + 4 ajustes de UX/dados (dropdowns Corp, janela de
  recência v2, fotos do WhatsApp com refresh, responsável por negócio).
- **Checkpoint 15/07 — S1 (esta versão)** — sincronização Corp→CRM em quase-tempo-real
  (≤30 min + refresh imediato no card) e exclusão espelhada com reconciliação segura.
  Bug latente corrigido: log de sync nunca gravava (CHECK constraints).

### Próximos passos (planejados em PLANO-AJUSTES-1507.md)
- **S2 — Formulários** (feedback 15/07): remover aba Corp do card, ordenação padrão
  "Mais recentes", remover campo apólice, máscaras/validação (telefone, e-mail, CPF, moeda),
  seguradora sempre dropdown, Vr. Comissão/Vr. Repasse no Novo Negócio.
- **S3 — Inbox** (feedback 15/07): enviar áudio/documento/fotos, colar imagem, painel de
  dados oculto, filtro Não lidas, fix "[Nome]" em mídia de grupo. Propostas P-A (mensagem
  agendada) e P-B (lembretes) aguardam OK do cliente.
- **Fase 2 restante** — U5–U9 (produtor no card, timeline de atendimentos via
  `/atendimentos`, endossos via `/documento_endossos`, responsável vs produtor).
- **Fase 3** — U10–U12 (agentes e grupos de produtores, canais de venda, dashboard filtrável).
- **Pendências externas (Agia via Tiago)** — `SOLICITACAO-AGIA-API.md`: endpoint de dados
  bancários, upload de anexos, lookup de campanhas/bases de repasse.

## 6. Decisões de produto que valem lembrar

1. Corp é insubstituível — o CRM complementa (integração com portais fica no Corp).
2. WhatsApp via bridge UazapiGO, não Meta Cloud API (Marcel rejeitou fluxo de templates).
3. Dark mode padrão com toggle light; estilos inline (sem Tailwind).
4. Desconectar o WhatsApp apaga mensagens e contatos vindos do WhatsApp (só Corp fica).
5. Exclusão de negócio no Corp = exclusão definitiva no CRM (espelho, com auditoria);
   conversas não se perdem (são por contato). Sentido inverso (CRM→Corp) NÃO exclui.
6. Nunca buscar etapa de funil por nome fixo — nomes são editáveis pelo cliente
   (sync usa a primeira etapa não-terminal por ordem).

## 7. Contatos

| Papel | Nome | Canal |
|-------|------|-------|
| Cliente/admin | Marcel Foletto | via grupo WhatsApp "Marpe & u4digital" |
| Comercial/coordenação | Tiago Donicht | u4digital / uhunter.io |
| Desenvolvimento | Moroni Reis | moronif.reis@gmail.com |
| ERP Corp (suporte API) | Agia | via Tiago (`SOLICITACAO-AGIA-API.md`) |
