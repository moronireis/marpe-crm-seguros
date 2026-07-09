# Marpe CRM Seguros

CRM inteligente para corretora de seguros, integrado com Corp (Agia) ERP + WhatsApp via UazapiGO.

## Quick Start

```bash
npm install
cp .env.example .env  # Fill in credentials
npm run dev            # http://localhost:4321
npm run build          # Production build
npx vercel deploy --prod  # Deploy to production
```

## Stack

| Component | Choice | Notes |
|-----------|--------|-------|
| Framework | Astro 6 SSR | Server-side rendering on Vercel |
| UI | React 19 | Islands architecture (client:load) |
| Styling | Inline styles | Dark theme, CSS custom properties in global.css |
| Database | Supabase (PostgreSQL) | Cloudfy-hosted, 22 tables prefixed `marpe_` |
| Auth | Supabase Auth | Email/password, cookie sessions (24h access, 30d refresh) |
| WhatsApp | UazapiGO | Bridge at u4digital.uazapi.com |
| ERP | Corp Nuvem (Agia) | REST API at api.corpnuvem.com |
| Deploy | Vercel | SSR functions + static assets |
| Crons | Vercel Cron | Corp sync 3am UTC, installments 11am UTC (8am BRT) |

## Environment Variables

```
PUBLIC_SUPABASE_URL          # Supabase project URL
PUBLIC_SUPABASE_ANON_KEY     # Supabase public key
SUPABASE_SERVICE_ROLE_KEY    # Admin service role key
UAZAPI_URL                   # UazapiGO bridge URL
UAZAPI_TOKEN                 # UazapiGO instance token
WEBHOOK_KEY                  # Internal webhook auth key
CORP_API_URL                 # Corp Nuvem API URL
CORP_API_EMAIL               # Corp login email
CORP_API_PASSWORD            # Corp login password
```

## Project Structure

```
src/
  components/
    automations/AutomationsView.tsx   # Automation rules CRUD
    campaigns/CampaignsView.tsx       # Campaign creation + segmented send
    config/ConfigView.tsx             # WhatsApp QR, Corp sync, Users, Funnels
    contacts/ContactDetailView.tsx    # Full contact profile
    crm/CrmBoard.tsx                  # Kanban/Grid + filters + search
    crm/DealPanel.tsx                 # Deal detail editor
    dashboard/DashboardView.tsx       # KPIs, charts, goals, activity feed
    inbox/InboxView.tsx               # WhatsApp inbox (conversations + groups)
    links/LinksView.tsx               # Tracked links management
    templates/TemplatesView.tsx       # Template editor with variable insertion
  layouts/
    AppLayout.astro                   # Sidebar + main area + notification badges
  lib/
    automations/engine.ts             # Automation trigger executor
    campaigns/resolve-contacts.ts     # Shared contact resolver for campaigns
    corp/client.ts                    # Corp API HTTP client (15 endpoints)
    corp/sync.ts                      # Full Corp → Supabase sync
    corp/types.ts                     # TypeScript interfaces for Corp API
    whatsapp/send.ts                  # WhatsApp send + phone normalization
    variables.ts                      # 18-variable interpolation engine
    supabase.ts                       # Client-side Supabase
    supabase-server.ts                # Server-side Supabase (service role)
    api-auth.ts                       # Auth middleware (requireAuth, requireAdmin)
    access.ts                         # Authorization helpers
  pages/
    api/                              # 36 REST API endpoints
    contato/[id].astro                # Contact detail page
    crm/index.astro                   # CRM board page
    config/index.astro                # Settings page
    r/[code].ts                       # Public link redirect (tracked)
    *.astro                           # All other pages
  styles/
    global.css                        # CSS variables, dark theme tokens
supabase/
  schema.sql                          # Full PostgreSQL schema (17 core tables)
  migration-goals.sql                 # Producer goals table
  migration-surveys.sql               # Satisfaction surveys table
  migration-chatbot.sql               # Settings table (chatbot toggle)
  seed-funnels.sql                    # Default funnels + stages
  seed-templates.sql                  # Default message templates
```

## Database Tables (22 total, all prefixed `marpe_`)

| Table | Purpose |
|-------|---------|
| profiles | User accounts (admin/operador) |
| contacts | Insurance clients (CPF, phone, address, tags, corp_id) |
| funnels | Customizable sales pipelines |
| funnel_stages | Pipeline stages with colors, terminal states |
| deals | Insurance negotiations (prêmio, comissão, vigência, ramo, apólice) |
| deal_activities | Audit log (stage changes, notes, messages) |
| messages | WhatsApp chat history (permanent) |
| templates | Quick-reply message templates with variables |
| automations | Trigger-action rules (stage change → WhatsApp) |
| automation_logs | Execution audit trail |
| campaigns | Bulk message campaigns |
| campaign_recipients | Per-contact delivery tracking |
| whatsapp_sessions | WhatsApp number tracking |
| installments | Payment installment tracking |
| loss_reasons | Predefined deal loss reasons |
| tracked_links | Short URLs with click tracking |
| link_clicks | Click analytics (IP, UA, timestamp) |
| notifications | In-app notifications |
| corp_sync_log | Corp API sync audit trail |
| producer_goals | Monthly targets per producer |
| surveys | Satisfaction survey responses (1-5 rating) |
| settings | Key-value config (chatbot toggle, etc.) |

## Variable Engine

Templates and automations support these variables (case-insensitive):

| Variable | Source | Example |
|----------|--------|---------|
| `{{nome}}` | contact.name | "João Silva" |
| `{{primeiro_nome}}` | First word of name | "João" |
| `{{telefone}}` | contact.phone | "(55) 99999-9999" |
| `{{email}}` | contact.email | "joao@email.com" |
| `{{cidade}}` | contact.city | "São Sepé" |
| `{{veiculo}}` | deal.veiculo | "GOL 2022" |
| `{{placa}}` | deal.placa | "ABC1D23" |
| `{{apolice}}` | deal.apolice | "7131" |
| `{{seguradora}}` | deal.seguradora | "Porto Seguro" |
| `{{premio}}` | deal.premio (BRL) | "R$ 2.563,00" |
| `{{comissao}}` | deal.comissao_valor (BRL) | "R$ 512,60" |
| `{{ramo}}` | deal.ramo | "auto" |
| `{{produtor}}` | deal.produtor | "Marcel" |
| `{{vigencia_inicio}}` | deal.vigencia_inicio (DD/MM/YYYY) | "01/06/2026" |
| `{{vigencia_fim}}` | deal.vigencia_fim (DD/MM/YYYY) | "01/06/2027" |
| `{{proxima_acao}}` | deal.next_action | "Ligar para cliente" |
| `{{periodo_dia}}` | Computed from hour | "Bom dia" / "Boa tarde" / "Boa noite" |

Manual fill-in fields use `[brackets]`: `[oficina]`, `[valor_franquia]`, `[nº_atendimento]`, etc.

## UazapiGO Endpoints (validated)

| Action | Method | Path |
|--------|--------|------|
| Status | GET | `/instance/status?token=TOKEN` |
| Connect + QR | POST | `/instance/connect?token=TOKEN` |
| Disconnect | POST | `/instance/disconnect?token=TOKEN` |
| Send text | POST | `/send/text?token=TOKEN` body: `{ number, text }` |
| Webhook config | GET/POST | `/webhook?token=TOKEN` |

Webhook events: `["messages", "messages_groups"]`

QR code is returned in `/instance/connect` response as `data:image/png;base64,...` in the `qrcode` field. When status is `connecting`, QR is also available in `/instance/status` → `instance.qrcode`.

**NOT available**: `/instance/qrcode`, `/instance/logout`, `/instance/restart` — these return 404/405.

## Corp API Endpoints

**Official docs (Postman)**: https://documenter.getpostman.com/view/33455116/2sAYkBrLmi — "CorpAPI" (shared by Tiago 2026-07-09). Collection JSON downloadable via `documenter.gw.postman.com/api/collections/33455116/2sAYkBrLmi?segregateAuth=true&versionTag=latest`.

All authenticated via `POST /login` → Bearer token (3-day expiry, refreshed after 2 days).

| Endpoint | Returns |
|----------|---------|
| `/lista_clientes` | Client list (codigo, nome, ddd, numero) |
| `/cliente` | Client detail (address, profession, marital status) |
| `/documentos` | Policies by date range |
| `/documento` | Single policy detail |
| `/renovacoes` | Renewals by date range |
| `/negocios_andamento` | Active negotiations |
| `/negocio` | Single negotiation detail |
| `/sinistros` | Claims by date range |
| `/ramos` | Insurance branches |
| `/produtores` | Producer list |
| `/producao` | Production report |
| `/documentos_bi` | BI data |
| `/cliente_anexos` | Client attachments — `?codfil=1&codigo={codcli}`, presigned S3 URLs (expiring) |
| `/negocio_anexos` | Negotiation attachments — `?codfil=1&codigo={codneg}`, presigned S3 URLs (expiring) |

More endpoints in the official doc, not yet consumed by the CRM (useful for Fases 2/3):

- `/documento_anexos?codfil=1&nosnum=` — policy attachments; `/documento_endossos?codfil=1&nosnum=` — endorsements (**solves U7**); `/itens` — policy items
- `/cliente_cpf?codfil=1&cpf_cnpj=` and `/busca_cpf?cpf_cnpj=` — CPF lookup (dedupe for Novo Cliente); `/cliente_ligacoes?codigo=` — client relationships
- `/negocios_finalizados`, `/negocios_em_calculo` — additional negotiation lists; `/lista_ramos?telram=1`; `/prod_docs` (GET/POST/PATCH/DELETE)
- `PUT /telefone`, `PUT /email`, `PUT /endereco` (+ DELETEs) — contact sub-resource updates (bidirectional contact sync)
- `POST /cliente` accepts nested `enderecos[]`, `emails[]`, `telefones[]` in a single call (per doc; current CRM flow uses 4 calls and works)
- **InCorp** document-import pipeline: `GET /incorp_url_post?nome_arquivo=` → presigned S3 form POST → `GET /incorp_url_download?key=` → `POST /incorp {link}` (parses the file) → `POST /incorp_contexto` (+agente/produtor) → `POST /incorp_documento` (+`path_anexo_s3`) — creates a documento with attachment. Import-specific; not a generic client/negotiation anexo upload.

## Key Design Decisions

1. **Dark theme only** — no light mode, no toggle. CSS vars in global.css.
2. **Inline styles** — no Tailwind, no CSS modules. All styles are React inline objects.
3. **Corp is irreplaceable** — the CRM complements Corp, never replaces. Portal integrations with insurers are Corp's domain.
4. **WhatsApp via bridge** — UazapiGO wraps WhatsApp Web. Not Meta Cloud API (Marcel rejected API templates/approval flow).
5. **Client-side filtering** — CRM filters run on the already-fetched deals array. No server-side filtering needed for ~1500 deals.
6. **Disconnect clears data** — when WhatsApp is disconnected, all messages and WhatsApp-sourced contacts are deleted. Only Corp contacts remain.

## Corp Write Integration (Backlog 2026-07-08)

Write endpoints discovered by disposable-record testing (POST → GET → DELETE):

| Endpoint | Status | Payload |
|----------|--------|---------|
| `POST /cliente` | ✅ Working | `{ nome*, pessoa, cpf_cnpj, datanas, sexo }` — other fields silently ignored or 500 |
| `POST /telefone` | ✅ Working | `{ padrao: 'T', codcli, tipo: 'R', ddd, numero }` |
| `POST /endereco` | ✅ Working | `{ padrao: 'T', codcli, tipo: 'R', cep, logradouro, numero, complemento, bairro, cidade, estado }` |
| `POST /email` | ✅ Working | `{ padrao: 'T', codcli, email }` |
| `DELETE /cliente` | ✅ Working | query `?codfil=1&codigo=X` |
| `POST /negocio` | ✅ Working (2026-07-09) | Requires `etapa:1, status:0, prioridade:3, datinc:"dd/mm/yyyy hh:mm", datalt:"dd/mm/yyyy", campo_base_r:5` + business fields (codfil, codcli, codram, codcia, tipo, val_premio, per_c...). Without the 6 state/date fields → 500 "Negócio não inserido". Success: 201 `{ codigo_negocio }`. Discovered via the official Postman doc + bisection. |
| `DELETE /negocio` | ✅ Working | query `?codfil=1&codigo=X` → `{ "message": "Negócio deletado" }` |

- "Novo Cliente" button (CRM board) → creates in Corp first (cliente + telefone + endereço + email), then `marpe_contacts` with `corp_id`. Corp failure = nothing created; CRM failure = Corp rollback via DELETE.
- "Novo Negócio" modal → pick-lists live from Corp (`/api/corp/lookups`: seguradoras, ramos, produtores, agentes + campanhas from synced deals). Corp dual-write in `POST /api/deals` is **ENABLED** (flag `corp_write_negocio` `{ enabled: true }` since 2026-07-09). The created deal stores `corp_id` in the sync format `neg_1_{codigo_negocio}` — plain numbers would make the next sync create a duplicate deal.
- Extra GET endpoints available: `/seguradoras`, `/agentes`, `/profissoes`, `/atendimentos` (14K+ tarefas — useful for U6).
- Unknown Corp routes return AWS Gateway 403 ("Credential parameter"); real routes return 200/4xx/5xx. OPTIONS reveals allowed methods safely.

### Corp Anexos (2026-07-09)

- `GET /cliente_anexos?codfil=1&codigo={codcli}` and `GET /negocio_anexos?codfil=1&codigo={codneg}` → `{ header: { count }, anexos: [{ nome, tipo, url, indice_anexo }] }`. The `url` is a presigned S3 link that expires — fetch on demand, never cache/persist. Param MUST be `codigo` (other names → 500). No attachments → 404 `"Nenhum anexo encontrado..."` (treated as empty list in `lib/corp/client.ts`).
- Both routes are **GET-only** (OPTIONS preflight: `GET,OPTIONS`) — no anexo upload via API. Asked Agia (see `SOLICITACAO-AGIA-API.md`).
- **Dados bancários are NOT exposed by the Corp API** (not in `GET /cliente`, ~20 candidate routes all 403). Also asked Agia.
- CRM surface: `GET /api/corp/anexos?cliente={corp_id contato}&negocio={corp_id deal}` (no-store) feeds the read-only "Anexos do Corp" section in the deal panel's Documentos tab. `GET /api/corp/negocio?codigo=` was also created — the Perfil tab already called it, but the route was missing (latent bug fixed).

## Remaining Work

### Fase 2: Dados Corp Completos
- **U5**: Add `produtor` field to deal cards (pull from Corp sync)
- **U6**: Pull attendance history from Corp into deal activity timeline
- **U7**: Endosso handling — when policy has endorsements, pull data from the latest one
- **U8**: Separate `responsável` (who manages) vs `produtor` (who sells) as distinct fields
- **U9**: Corp sync on events — trigger sync when new negotiation/client/update detected (not just daily cron)

### Fase 3: Estrutura e Dashboard
- **U10**: Agents + Producer Groups — CRUD + filtering by group (internos, externos, por cidade)
- **U11**: Sales channels field on deals (corretora, Facebook, indicação, etc.)
- **U12**: Dashboard filterable by producer/group

### Future (discussed but not scoped)
- Multiple WhatsApp numbers in parallel
- Benefits club / voucher system for partners (auto-center, gas stations)
- Replace Corp entirely (very complex — portal integrations with insurers)

## Client Context

- **Client**: Marcel Foletto — Marca Corretora de Seguros (São Sepé, RS)
- **Team**: Marcel (admin), Vanessa (commercial), Adria (operations)
- **Active clients**: ~1,000 with 1,362 active contracts
- **WhatsApp volume**: ~100 conversations/day across 3 numbers
- **Insurance types**: auto, vida, residencial, empresarial, equipamento, consórcio, financiamento
- **Business model**: service-based (retention via quality of service, not acquisition via ads)
- **Previously tried**: RD Station, Monday, Clint, iSpeed, chatbots — none fit insurance workflow
