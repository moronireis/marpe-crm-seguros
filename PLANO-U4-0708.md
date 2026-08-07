# PLANO-U4-0708 — Atualizações do u4-status (04–06/08) + retomada da CorpAPI

> Status: **PLANO — aguardando OK do Moroni**
> Fonte: leitura do u4-status (reports, testes, bloqueios, comentários) em 07/08 + re-probe da CorpAPI em 07/08 ~16:40 BRT.

---

## 0. O que chegou no u4-status desde 03/08

1. **06/08 20:38–20:42 — Tiago resolveu 7 bloqueios**, 6 deles da CorpAPI, todos com o mesmo comentário: *"Suporte da API retornou informando que as correções foram aplicadas, refazer os testes"* + print do e-mail da Agger (atendimento **2798599**): *"Os erros mencionados foram resolvidos, contudo foi passado horário e o pessoal não agendou comigo."* Bloqueios fechados:
   - GET /renovacoes → 500 (item 12)
   - Data da próxima ação divergente (item 4)
   - Gravar próxima ação — POST /atendimento 500 (item 9)
   - Alterar negociação — PUT /negocio 500 (item 8)
   - API não expõe dados da tela: descrição, produtores, usuários, header.count (itens 4–7)
   - Escrita de sinistro sem rota
   - (+ o bloqueio da divergência de repositórios, fechado sem ação nova — a decisão de infra da containerização do Renan segue em aberto)
2. **04/08 — report novo ABERTO** (Tiago): **"Ativar sincronização em tempo real da Corp"** — sem resposta ainda.
3. **Ciclo 2 `em_teste`**: roteiro E1–E26 publicado 03/08 → **0/26 rodados** pelo cliente. Jornada C2 completa até "Atualização publicada"; **checkpoint sem data**.
4. **Ciclo 1**: 23 ok · **10 pendentes** (B5, B8, B9, C1–C3, D7–D10) · 1 problema (**A12** "/" — aguarda retest com o fix do Renan que subiu 03/08).
5. Itens (tarefas): **0 abertos**. Reports em `analise` que dependem da Agger: módulo Cadastros CRUD (28–29/07), fotos de contatos (explicado — privacidade), filtros do board (R5).
6. Obs.: um dos anexos do Tiago no bloqueio de renovações é um print do painel "A casa" (report comercial do Lucas Paulesky com seta na lixeira) — parece colado por engano; confirmar com ele se era outro assunto.

---

## 1. 🚨 FASE 0 — EMERGÊNCIA (hoje): login da Corp bloqueado no "Corp+"

**Descoberta do re-probe de 07/08** (~16:40 BRT):

- `POST /login` com as credenciais de produção → **403 `"Usuário sem permissão de acesso ao Corp+."`** em 6/6 variações (`aplicacao` 0/1/2/3, sem `aplicacao`). `codfil`/`filial` no corpo → 400 "Unknown field" (o contrato do login não mudou; é **permissão do usuário**).
- **A produção ainda funciona**: disparo manual do sync diurno às 16:43 BRT → 200 em 41s (176 negócios + 9 sinistros atualizados). Env da Vercel sem rotação (CORP_* de 22/07). Conclusão: as lambdas estão rodando com **token cacheado**.
- Padrão idêntico ao incidente de 21–24/07: quando o token expirar (~24–48h), **apagão total do sync Corp**. A blindagem S0 vai acusar (banner staleness + linhas `error` no log), mas o dado congela.

**Leitura**: a Agger "resolveu os erros" migrando/habilitando o ambiente no módulo **Corp+** — e o usuário de API da Marpe ficou sem a permissão nova. É exatamente o que a issue #28 (22/07) já pedia: "login e senha + código de filial" do Corp+.

**Ações (hoje):**
- [ ] **Tiago reabre o atendimento 2798599** (o e-mail da Agger tem o botão "reabrir") pedindo: *habilitar a permissão de acesso ao Corp+ para o usuário de API* (ou enviar as credenciais novas do módulo Corp+). Urgência: o CRM perde o sync quando o token atual expirar.
- [ ] **Agendar a call oferecida pela Agger** ("foi passado horário e o pessoal não agendou") — levar a lista da Fase 1 e a pergunta de webhooks da Fase 3.
- [ ] Registrar no u4-status: bloqueio novo **"Corp+: usuário de API sem permissão (login 403)"** (dono: cliente/Tiago → Agger), comentário nos 6 bloqueios explicando que o re-teste está bloqueado pelo login.
- [ ] Se as credenciais mudarem: atualizar CORP_API_* na Vercel **+ redeploy** (env só vale em deploy novo) + monitor de retorno (padrão 22/07: monitor em background dispara o sync na hora que o login voltar).

---

## 2. FASE 1 — Re-testes das 13 pendências (assim que o login voltar) · ~0,5 sessão

Protocolo: leitura primeiro; escrita só com **registro descartável** (POST → PUT → GET → DELETE, padrão validado em 09/07 com neg_1_7633). Ao final, atualizar juntos (regra de 30/07): `RELATORIO-CORP-API.md` + painel Config>Corp (`lib/corp/integration-status.ts`) + `SOLICITACAO-AGIA-API.md` + os 6 bloqueios no u4 (reabrir o que não foi corrigido de verdade).

| # | Item (SOLICITACAO v3) | Teste | Se funcionar, destrava |
|---|---|---|---|
| 1 | Dados bancários | rota nova? | Sync do CRUD local `marpe_contact_bank` (28/07) |
| 2 | Upload de anexos | OPTIONS/POST | Aba Docs completa (hoje só download) |
| 3 | Lookup campanhas/bases | GET | Substituir DISTINCT derivado |
| 4 | Agendamento da próx. ação | GET /negocio + /atendimentos (datas futuras?) | Próxima ação fiel à tela do Corp |
| 5 | Produtores/agente da grade | GET /negocio (campos novos?) | U5 no card |
| 6 | /usuarios (código→nome) | existência | Nome do "Responsável (Corp)" (U8) |
| 7 | header.count | GET /negocios_andamento | Robustez de paginação |
| 8 | **PUT /negocio** | descartável POST→PUT→DELETE | **S4.2 — edição bidirecional da guia Info** |
| 9 | **POST /atendimento** | descartável | **S4.3 — gravar próxima ação no Corp** (+ potencializa P-B) |
| 10 | Cadastros auxiliares (canais, grupos, bancos, parâm. repasse) | existência | Módulo Cadastros ampliado |
| 11 | Detalhe de seguradoras/ramos/produtores/agentes | GET | Cadastros — consulta rica |
| 12 | **GET /renovacoes** | GET variações | Funil Renovações oficial (migração cuidadosa: 295 cards do contorno, corp_id `renov_`) |
| 13 | Escrita de cadastros | OPTIONS/POST | **Módulo Cadastros CRUD** (reports do Tiago de 28–29/07 em `analise`) |
| + | Escrita de sinistro | OPTIONS /sinistro | Registrar Sinistro CRM→Corp |

Script base: `scripts/probe-corp-s0.mjs` (leitura) + probes de escrita descartável novos.

---

## 3. FASE 2 — Implementar o que os re-testes confirmarem · 1–2 sessões

Prioridade sugerida (maior dor primeiro):

1. **S4.2 edição bidirecional** (PUT /negocio) — guia Info grava no Corp; hoje só a criação sobe.
2. **S4.3 próxima ação no Corp** (POST /atendimento) — fecha a divergência crônica + abre caminho para P-B (lembretes).
3. **Renovações pela rota oficial** (GET /renovacoes) — reconciliar com os 295 cards derivados sem duplicar.
4. **Responsável/produtores com nome** (/usuarios + item 5) — U5/U8 no card.
5. **Módulo Cadastros CRUD** (item 13) — só se a escrita de cadastros realmente liberou.

O que a Agger NÃO tiver corrigido volta como bloqueio reaberto no u4 + item na pauta da call.

---

## 4. FASE 3 — Responder o report "Sincronização em tempo real" (04/08) · 0,25 sessão

Desenho honesto para o Tiago:

- **CRM → Corp já é tempo real** (dual-write na criação; S4.2 estende para edição).
- **Corp → CRM** hoje: lista a cada 30min (GH Actions) + sync-light no load do board (throttle 10min) + refresh completo ao abrir o card (desde 03/08 inclui prêmio/comissão). 
- **Aperto possível sem a Agger**: GH Actions para **15min** (decisão 30 vs 15 pendente desde 15/07 — recomendo 15) e throttle do sync-light para 5min. 
- **Tempo real de verdade** exige evento/webhook do lado Corp → **item 14 da SOLICITACAO** + pergunta na call: *o Corp+ tem webhooks/eventos?* (a migração para Corp+ pode ter trazido isso).

---

## 5. FASE 4 — Destravar o ciclo 2 no u4-status (contínuo)

- [ ] Cobrar via Tiago o roteiro **E1–E26 (0/26)** + os **10 pendentes do ciclo 1** (B5, B8, B9, C1–C3, D7–D10) + retest do **A12** (fix candidato do Renan está no ar desde 03/08).
- [ ] **Marcar a data do checkpoint** do ciclo 2 (jornada está sem data).
- [ ] Levar ao checkpoint as decisões paradas:
  - Nome dos 4.877 negócios do Corp ("AUTO — NOME" repete a tag de ramo — pergunta feita 03/08, sem resposta);
  - Menção @ em grupos (precisa probe `mentionedJidList` na UazapiGO);
  - Busca por chassi/proposta (dado não existe no CRM nem na CorpAPI — decidir onde mora);
  - P-A (mensagem agendada) e P-B (lembretes): aprovados 28/07, priorizar quando;
  - P-C (dono da conversa): junto com S6 multi-número (épico).
- [ ] Oportunidade: tentar **recuperação parcial do histórico do WhatsApp** via `POST /message/find` da UazapiGO (descoberta de 29/07 no Casa Magnólia; referência `casa-magnolia-crm/src/pages/api/whatsapp/import-history.ts`).

---

## Estimativas

| Fase | Esforço | Depende de |
|---|---|---|
| 0 — Emergência Corp+ | hoje (ação Tiago + 0,25 sessão de registro/monitor) | Agger |
| 1 — Re-testes | 0,5 sessão | login voltar |
| 2 — Implementações | 1–2 sessões | resultado da Fase 1 |
| 3 — Tempo real | 0,25 sessão (+ decisão 15min) | — |
| 4 — Ciclo 2 | contínuo | Marcel/Tati |

**Ordem executiva**: Fase 0 AGORA → 3 (resposta rápida ao report aberto) → 1 → 2 → 4 em paralelo.
