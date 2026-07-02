---
name: Known Gaps and Absent Features
description: Features confirmed absent or not yet implemented as of 2026-07-01
type: project
---

As of 2026-07-01:

- **No /contatos route** — there is no contacts list page. Individual contacts are accessed at `/contato/[id]` only. Navigation sidebar has no "Contatos" link. Not a bug — by design (contacts accessed via CRM deal panel > Corp tab or direct URL).

- **Corp API not configured in QA environment** — Corp tab in deal panel always shows "Erro ao buscar dados do Corp". This is expected when CORP_API_EMAIL/CORP_API_PASSWORD env vars are not set or Corp token is expired. Not a bug in the QA context.

- **Drag-and-drop Kanban not QA'd** — DnD-kit stage transitions (drag card between columns) were not tested via Playwright. Requires complex pointer event simulation. Manual test recommended.

- **Automations flow not QA'd** — trigger → WhatsApp send pipeline not covered.

- **Campaigns bulk send not QA'd** — campaign creation and recipient resolution not covered.

- **RLS policies not QA'd** — all DB access in QA used service role key, bypassing RLS. Operador role restrictions untested.

- **Tab labels in DealPanel** — actual rendered labels differ from component key names:
  - key 'anotacoes' → label 'Notas' (NOT 'Anotações')
  - key 'perfil' → label 'Corp' (NOT 'Perfil')
  - key 'conversas' → label 'Conversas' ✅
  - key 'documentos' → label 'Docs' (NOT 'Documentos')
  This matters when writing Playwright selectors for tab clicks.
