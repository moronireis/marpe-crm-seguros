# QA Run — Marpe CRM: Deal Panel + APIs + Regression
Date: 2026-07-01
Environment: Production (https://marpe-crm-seguros.vercel.app)
Tester: qa-agent
Auth: admin@marpe.com.br / qa-test-2026 (temp — password must be restored post-QA)
Deal used for panel tests: TIAGO MACHADO DONICHT (id: f3ec1160-524d-49b7-904c-1f10b15fddcf)

---

## Veredicto: BLOQUEADO

---

## DB Structure Verified

- marpe_deal_notes: EXISTS (id, deal_id, content, created_at, user_id) ✅
- marpe_deal_documents: EXISTS (id, deal_id, file_name, file_path, file_size, uploaded_at, uploaded_by) ✅
  - NOTE: column is `file_path`, NOT `file_url` (documents.ts API references wrong column name but resolves at runtime via storage download URL)
- marpe_deals new columns: campanha, ja_possui_produto, seguradora_atual, vigencia_atual_fim, corretora_atual, base_calculo_repasse, pct_repasse, valor_repasse, agente, observacoes_proposta — ALL EXIST ✅
- Storage bucket: marpe-deal-docs EXISTS (private) ✅
- marpe_deal_activities CHECK constraint: DUPLICATE BUG — two constraints simultaneously active:
  - `deal_activities_type_check` (new, added for Fase 2 types)
  - `marpe_deal_activities_type_check` (old, never dropped — only allows 7 original types)
  - Types blocked by old constraint: note_added, document_upload, document_delete, automation

---

## Test Results

### Regression — Fluxos Existentes
| Test | Result | Note |
|------|--------|------|
| Login (admin@marpe.com.br) | PASS | |
| Dashboard carrega KPIs | PASS | |
| CRM board carrega cards | PASS | |
| CRM board filtros (ramo, stage) | PASS | |
| Inbox carrega conversas | PASS | |
| Config (WhatsApp QR, Corp sync) | PASS | Corp API not configured — expected |
| Página /contatos | N/A | Rota não existe; contatos acessíveis via /contato/[id] |

### Modal "Novo Negócio"
| Test | Result | Note |
|------|--------|------|
| Modal abre ao clicar "Criar Negócio" | PASS | |
| Todos os campos principais presentes | PASS | |
| Seção condicional "Produto Atual" aparece ao marcar checkbox | PASS | |
| Label do checkbox | FAIL | "Cliente ja possui o produto" — falta acento em "já" |
| Label do campo de data | FAIL | "DATA DE APROXIMAÇÃO" — deveria ser "DATA DA PRÓXIMA AÇÃO" |
| Criar negócio (submit) | FAIL — CRÍTICO | Sempre retorna erro: marpe_deals.title é NOT NULL sem default, UI não envia `title` |

### APIs Novas
| Endpoint | Method | Result | Note |
|----------|--------|--------|------|
| /api/deals/[id]/notes | GET | PASS | HTTP 200, retorna notas com join marpe_profiles |
| /api/deals/[id]/notes | POST | FAIL | HTTP 500 — .catch() bug; nota É salva no DB |
| /api/deals/[id]/documents | GET | PASS | HTTP 200 |
| /api/deals/[id]/documents | POST | FAIL | HTTP 500 — .catch() bug; doc É salvo no storage+DB |
| /api/deals/[id]/documents | DELETE | FAIL | HTTP 500 — .catch() bug; doc É deletado do storage+DB |
| /api/deals/[id] | PATCH | FAIL | HTTP 500 — .catch() bug; dados SÃO persistidos |
| /api/messages | GET | PASS | HTTP 200, filtros funcionam (contact_id, deal_id, date_from, etc.) |

### Deal Panel — Abas
| Aba | Result | Note |
|----|--------|------|
| Info | PASS | Seções corretas: Contato, Dados Gerais, Produto Atual (condicional), Estimativas, Produtores, Próxima Ação, Observações. Labels corretas. Sem bubbles coloridas. |
| Conversas | PASS | Histórico WhatsApp carrega. Sem mensagens neste deal — estado vazio correto. |
| Atividades | PASS | Timeline de atividades carrega. Tipos de atividade exibidos corretamente. |
| Notas | PARCIAL | GET funciona (notas existentes exibidas). POST retorna 500 — nota salva mas UI não atualiza lista (res.ok = false bloqueia reload). |
| Docs | PARCIAL | GET funciona. POST upload retorna 500 — arquivo salvo mas UI não atualiza. DELETE retorna 500 — arquivo deletado mas UI não atualiza. |
| Corp | PASS | "Erro ao buscar dados do Corp" — esperado (Corp API não configurada neste ambiente). |

---

## Bugs Encontrados

### BUG-01 — CRÍTICO: Criação de negócio via UI sempre falha
- Causa: `marpe_deals.title` é `NOT NULL` sem default. UI não envia campo `title`. API recebe `title: null` e Supabase rejeita com constraint violation.
- Reprodução: Qualquer clique em "Criar Negócio" no modal do CRM board.
- Fix: No arquivo `src/pages/api/deals/index.ts`, gerar título automaticamente no server: `title: body.title || \`${contactName} — ${ramo || 'Negócio'}\`` (ou remover NOT NULL constraint da coluna se título não for exibido na UI).
- Owner sugerido: dev-agent

### BUG-02 — CRÍTICO: .catch() Supabase builder quebra POST/PATCH/DELETE em 4 endpoints
- Causa: Supabase JS v2 builder não implementa `.catch()` como Promise padrão. Código do tipo `.insert({...}).catch(() => {})` joga exceção não tratada que derruba a serverless function.
- Endpoints afetados: POST /notes, POST /documents, DELETE /documents, PATCH /deals/[id]
- Impacto real: dados SÃO salvos/deletados corretamente (operação principal executa antes do crash). O 500 é emitido no momento da tentativa de log de atividade.
- Fix: Substituir `.catch(() => {})` por `.then(null, () => {})` OU por try/catch com `await`, igual ao fix aplicado no webhook (commit ada5876).
- Owner sugerido: dev-agent
- Reprodução: POST /api/deals/:id/notes com body `{"content":"test"}` → HTTP 500, body vazio. Verificar DB: nota está lá.

### BUG-03 — CRÍTICO: Duplicate CHECK constraint em marpe_deal_activities.type
- Causa: constraint antiga `marpe_deal_activities_type_check` não foi dropada quando a nova `deal_activities_type_check` foi adicionada. A antiga permite apenas: stage_change, note, message_sent, field_update, assignment, creation, loss.
- Tipos bloqueados: note_added, document_upload, document_delete, automation — todos retornam constraint violation.
- Impacto: log de atividades broken para todos os novos tipos de evento.
- Fix (SQL):
  ```sql
  ALTER TABLE marpe_deal_activities DROP CONSTRAINT IF EXISTS marpe_deal_activities_type_check;
  ```
- Owner sugerido: data-engineer
- Reprodução: SQL `SELECT conname, consrc FROM pg_constraint WHERE conrelid = 'marpe_deal_activities'::regclass AND contype = 'c';` mostra ambas constraints.

### BUG-04 — MÉDIO: Label incorreta no campo de data do modal
- Causa: `src/components/crm/CrmBoard.tsx` usa label "DATA DE APROXIMAÇÃO" para o campo `next_action_date`.
- Esperado: "DATA DA PRÓXIMA AÇÃO"
- Reprodução: Abrir modal "Novo Negócio" no CRM board.
- Owner sugerido: dev-agent

### BUG-05 — BAIXO: Acento faltando no label do checkbox
- Causa: `src/components/crm/CrmBoard.tsx` exibe "Cliente ja possui o produto" sem acento no "já".
- Fix: Corrigir para "Cliente já possui o produto"
- Owner sugerido: dev-agent

### BUG-06 — BAIXO: UI não atualiza lista após POST de nota (comportamento aparente de falha)
- Causa: `DealTabAnotacoes.tsx` linha 38 — `if (res.ok)` bloqueia o reload quando res.ok = false (500). Mesmo que a nota seja salva, o usuário não vê confirmação.
- Fix: derivado do fix do BUG-02 — quando POST retornar 200, res.ok = true e o reload funcionará.
- Owner sugerido: dev-agent (resolved automatically by BUG-02 fix)

---

## Dados de Teste Criados (para limpeza)

- Notas inseridas diretamente no DB via SQL para teste: `SELECT * FROM marpe_deal_notes WHERE deal_id = 'f3ec1160-524d-49b7-904c-1f10b15fddcf' ORDER BY created_at DESC LIMIT 5;`
- Documento de teste: verificar storage bucket `marpe-deal-docs` para arquivos criados em 2026-07-01
- ATENÇÃO: senha do admin@marpe.com.br foi alterada para `qa-test-2026`. Deve ser restaurada.

---

## Fora do Escopo Entregue

- Testes de drag-and-drop Kanban (DnD-kit) — requer interação complexa via Playwright não executada
- Testes de automações (fluxo trigger → WhatsApp send)
- Testes de campanhas (bulk send)
- Testes de templates e variáveis interpoladas
- Testes de links rastreados (/r/[code])
- RLS policies (não testadas — acesso via service role no QA)

---

## Screenshots

- /tmp/modal-full.png — modal "Novo Negócio" completo
- /tmp/modal-with-conditional.png — seção condicional "Produto Atual" expandida
- /tmp/tab-conv-final.png — aba Conversas
- /tmp/tab-notas-final.png — aba Notas
- /tmp/tab-docs-final.png — aba Docs
- /tmp/tab-corp-final.png — aba Corp
