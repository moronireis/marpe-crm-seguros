# Plano de Execucao — Marpe CRM Fase 2

Last updated: 2026-07-01

---

## Diagnostico: Investigacao de Sistemas Externos

### Corp Nuvem (s48.corpnuvem.com)
- **Tipo**: ERP web (Infocap/Agia) — aplicacao Java desktop via web plugin
- **Login via WebFetch**: FALHOU — requer "Windows Plugin" (Java applet) para login. Acesso somente via browser com plugin instalado
- **API REST existente**: `api.corpnuvem.com` — ja integrada no CRM (`src/lib/corp/client.ts`) com 15 endpoints
- **Campos do negocio Corp (da Image #3)**:
  - Numero negocio, Nome cliente, Status (EM ANALISE, etc), Data Proxima Acao
  - Campanha, Seguradoras (dropdown), Ramo (codigo + descricao)
  - Checkbox "Ja possui o produto", Seguradora atual, Fim de vigencia, Corretora atual
  - Premio, % Comissao, Vr. Comissao, Base Calc. Repasse, % Repasse, Vr. Repasse
  - Produtores: Agente + Produtor
  - Campo texto livre (observacoes)
- **Corp write API**: Cliente prosseguira sem write API por enquanto (questionar via email)
- **Dados de seguradoras**: Nao conseguimos acessar o portal Corp para verificar lista completa de seguradoras. Usaremos campo texto livre + dados que ja vem na API `/negocios_andamento`

### WaSpeed (waspeed.com.br)
- **Tipo**: Chrome extension para WhatsApp Web (CRM + chatbot + campanhas)
- **Login via WebFetch**: Pagina marketing/vendas — nao e um web app acessivel via URL (e extensao Chrome)
- **Usuarios/Atendentes**: Suporta "multiplos atendentes no mesmo numero" mas nao tem conceito de departamento/setor exposto via API
- **API/Webhooks**: Menciona webhooks e APIs mas NENHUMA documentacao publica encontrada
- **Filtros**: Kanban visual, etiquetas/categorias, busca — tudo via interface Chrome extension
- **Conclusao**: WaSpeed nao tem API documentada publica. Filtros por usuario/atendente terao que ser inferidos do campo `sent_by` nas mensagens do proprio CRM (UazapiGO)

---

## Respostas Incorporadas

| # | Pergunta | Resposta | Impacto |
|---|----------|----------|---------|
| Q1 | API Corp escrita | Prosseguir sem write. Nao bloqueia | Remove dependencia Corp write |
| Q2 | Guia Perfil seguradora | Dados do Corp API `/negocio` vao para Guia Info | Campos mapeados da Image #3 |
| Q3 | Armazenamento | Supabase Storage | Ja configurado (marpe-media bucket) |
| Q4 | Vinculacao conversas | Apenas msgs do respectivo negocio no card | Filtro por deal_id |
| Q5 | WaSpeed filtros | Sem API publica. Usar sent_by do CRM | Filtros baseados nos usuarios internos |

---

## Fases de Execucao

### FASE 0 — Pre-requisito: Entendimento completo
- [x] Ler DealPanel.tsx (557 linhas)
- [x] Ler CrmBoard.tsx (1543 linhas)
- [x] Ler API deals/index.ts, deals/[id].ts, messages/index.ts
- [x] Ler webhook whatsapp.ts
- [x] Ler Corp client + types
- [x] Ler schema.sql
- [x] Investigar Corp Nuvem via WebFetch
- [x] Investigar WaSpeed via WebFetch

### FASE 1 — Banco de Dados (Migration SQL)
**Arquivo**: `supabase/migrations/20260701-deal-panel-expansion.sql`

Novas tabelas:
- `marpe_deal_notes` (id, deal_id, user_id, content, created_at)
- `marpe_deal_documents` (id, deal_id, user_id, file_name, file_path, file_size, mime_type, created_at)

Novos campos em `marpe_deals`:
- `campanha text` — campo campanha do Corp
- `tipo_negocio text` — tipo de negocio adicional (complementar ao deal_type)
- `ja_possui_produto boolean default false` — checkbox Corp
- `seguradora_atual text` — seguradora do produto atual
- `vigencia_atual_fim date` — fim vigencia atual
- `corretora_atual text` — corretora do produto atual
- `base_calculo_repasse numeric(12,2)` — base de calculo
- `pct_repasse numeric(5,2)` — % repasse
- `valor_repasse numeric(12,2)` — valor repasse
- `agente text` — agente (separado de produtor)
- `observacoes_proposta text` — observacoes/detalhes livres
- `detalhes_corp jsonb` — dados extras do Corp (JSON flexivel)
- `created_by uuid references marpe_profiles(id)` — quem criou

Update constraint `deal_activities`:
- Adicionar 'document_upload', 'document_delete', 'note_added' aos tipos permitidos

### FASE 2 — APIs
**Novos endpoints**:
- `deals/[id]/notes.ts` — GET (listar) + POST (criar nota)
- `deals/[id]/documents.ts` — GET (listar) + POST (upload) + DELETE (remover)

**Endpoints atualizados**:
- `deals/index.ts` POST — aceitar novos campos, gravar created_by, log activity 'creation'
- `deals/[id].ts` PATCH — aceitar novos campos, log 'field_update' com old/new values
- `messages/index.ts` GET — adicionar filtros: date_from, date_to, sent_by, search

### FASE 3 — Frontend DealPanel (6 abas)
**Novos componentes** em `src/components/crm/`:
1. `DealTabInfo.tsx` — Replica tela Corp Image #3 (secoes: Dados Gerais, Produto Atual, Negociacao, Estimativas, Produtores, Detalhes)
2. `DealTabConversas.tsx` — Chat com filtros (data, atendente) e pesquisa
3. `DealTabAtividades.tsx` — Timeline completa com usuario, data/hora, old→new
4. `DealTabAnotacoes.tsx` — Notas com user + datetime automaticos
5. `DealTabDocumentos.tsx` — Upload/lista/download/delete
6. `DealTabPerfil.tsx` — Perfil da seguradora (dados Corp via detalhes_corp)

**Refatorado**: `DealPanel.tsx` — orquestra 6 abas + header + stage selector

### FASE 4 — Criacao de Negocio (NewDealModal)
- Adicionar campos: campanha, ja_possui_produto, seguradora_atual, vigencia_atual_fim, corretora_atual
- Gravar `created_by` na criacao
- Log activity 'creation'

### FASE 5 — Vinculacao de Conversas
- Verificar que mensagens com deal_id sao filtradas corretamente
- Garantir que outbound do DealPanel grava deal_id
- Webhook: nao precisa mudanca (deal_id ja e suportado nas mensagens)

---

## Perguntas Abertas Restantes

1. **Lista de seguradoras**: Existe uma lista fixa de seguradoras que o Marcel usa? Ou e texto livre?
2. **Lista de campanhas**: Campanhas sao texto livre ou tem opcoes pre-definidas?
3. **Permissoes**: Todos os usuarios podem ver/editar todos os negocios ou ha restricao?
4. **Notificacoes**: Notificar usuario quando uma nota ou documento e adicionado ao negocio?

---

## Ordem de Execucao

```
FASE 1 (DB) → FASE 2 (APIs) → FASE 3 + FASE 4 + FASE 5 (Frontend, em paralelo)
```

Estimativa: ~3-4 sessoes de trabalho.
