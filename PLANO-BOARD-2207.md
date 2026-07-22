# Plano — Board u4digital 22/07/2026 (39 issues, análise completa)

> Fonte: https://github.com/orgs/u4digital/projects/3 (view 2) + issues em u4digital/Marpe-Project
> Analisado em 22/07/2026 — 38 itens no board + issue #19 que está no repo mas FORA do board.
> Todas as 28 screenshots das 30 issues abertas foram baixadas e inspecionadas.

---

## 🚨 DESCOBERTA CRÍTICA — Sync Corp PARADO desde 21/07 (causa externa)

**`POST /login` da CorpAPI retorna 500 "Internal Server Error" em 5/5 tentativas (~16s cada)**
com as credenciais de produção. Evidências:

- Último `negocios_day` no `marpe_corp_sync_log`: **20/07 23:32 UTC**. Zero registros em 21 e 22/07.
- Cron noturno (3h UTC) também sem registros em 21 e 22/07.
- GitHub Actions aparece **verde** porque o endpoint responde `200 {ok:false, error:"Corp login failed"}` — `curl -f` não falha. Runs de 22–25s = login falhou rápido; run das 20:40 (fail, 15m) = login pendurou.
- Updates esporádicos (ex.: deal 7512 às 21:27 UTC de 22/07) vieram de **lambdas warm com token cacheado** (token Corp vale 3 dias — vão expirar de vez até ~23-24/07).
- Explica o cluster de reclamações do Marcel: #34 (funil "Hoje" zerado com 42 no Corp), #36 (Data Próxima Ação parada em 09/07), #16 (atraso), agrava #15.
- Issue #28 (Tiago, 22/07) pede ao suporte "login e senha + código de filial" do módulo Corp+ → indício de que a Agia mexeu no acesso ~21/07. Contato: Leonardo (leonardowolff@agger.com.br).

**Ação imediata (S0)** — não depende de código novo, mas exige comunicação externa HOJE.

---

## Mapa das 39 issues (estado real verificado em código/prod)

### Já entregues — fechar no board (com validação Marcel/Tiago)
| # | Título | Evidência |
|---|--------|-----------|
| 6,7,8,9,11,13,21,26 | (fechadas no repo) | Done no board ✓ |
| 10 | Ordenação "Mais recentes" padrão | CrmBoard.tsx:1335 — implementado 17/07 |
| 16 | Atraso sync (mecanismo) | S1 15/07 entregue; latência atual = login 500 (S0). Fechar após S0 validado |
| 17 | Exclusão Corp→CRM | Reconciliação em prod (removeu neg_1_7460 em 20/07, log comprova). Fechar |
| 20 | Filtro Próxima ação (presets Corp) | Todos os 7 presets em CrmBoard.tsx:1196-1201. Dado que estava errado = S0 |
| 22 | Cliente HTTP Corp | Existe: `src/lib/corp/client.ts` (issue descreve stack errado Laravel/Nuxt) |
| 23 | Form Novo Negócio integrado | Existe: lookups Corp no modal (idem stack errado) |
| 24 | Dupla persistência | Dual-write ON desde 09/07 (`corp_write_negocio` enabled) |
| 25 | Novo Cliente CRM→Corp | Existe: NewContactModal + POST /api/contacts {corp:true} |
| 27 | Funil Sinistros | S4 17/07: syncSinistros + NewSinistroModal. Validar e fechar |
| 2, 3 | Painel Dados oculto / Filtro Não lidas | S3 17/07 (visíveis nos prints das issues novas!). Validar e fechar |
| 18 | Variáveis organizadas | S4 17/07 (variáveis sinistro + picker por categoria). Validar com Marcel |

### Bugs novos 22/07 (validação Marcel) — causa-raiz identificada
| # | Sintoma | Causa-raiz confirmada |
|---|---------|----------------------|
| 33 | Áudio: "data deve ser um data-URI base64" | Regex `media.ts:58` `/^data:([^;]+);base64,/` rejeita MIME com parâmetro (`audio/webm;codecs=opus` do MediaRecorder Chrome/Windows) |
| 30 | Thread não mostra últimas msgs + lento | `/api/messages` ordena `created_at ASC` + `limit 200` → conversa >200 msgs mostra as 200 MAIS ANTIGAS |
| 29 | Números alheios com nome "Marcel - Marpe Seguros" | Webhook: em `fromMe`, `pushName` = nome do REMETENTE (dono da instância) e entra em `senderName` → contato criado com nome do Marcel (webhook/whatsapp.ts:91,296) |
| 31 | Composer perde foco após enviar | Falta refocus no textarea pós-send |
| 34 | Funil "Hoje" zerado (Corp tem 42) | Dados stale — sync parado (S0). Filtro em si OK |
| 36 | Não puxa: Responsável, Ramo (abreviação), Produtor, Próx. ação, Atendimentos, Anexos | Mix: dados stale (S0) + Fase 2 U5/U6/U8 nunca implementada + `next_action` (descrição) sempre null (nome de campo da lista a conferir) + ramo grava abreviação da lista (ex. "empr") em vez do nome (codram→lookup) + anexos Corp com erro parcial no 7512 |
| 37 | "Nome é obrigatório" ao criar template | Validação TemplatesView.tsx:217 — reproduzir (estado/UX do campo nome; provável nome não preenchido + erro longe do campo) |
| 35 | Duas caixas de texto no anexo | Campo "Legenda (opcional)" no preview de anexo — remover |
| 38 | Só 1 arquivo por vez | Input de anexo sem `multiple` |
| 32 | Não encaminha msg/foto/arquivo | Feature inexistente — implementar |
| 39 | Sem áudio/anexo na aba Conversas do card | DealTabConversas: composer só texto (Inbox tem mic+anexo) |

### Pendentes já conhecidos
- **#15** — negócio criado no Corp no mesmo dia: contato ainda não existe → deal `skipped`. Fix: criar contato on-the-fly no sync (GET /cliente).
- **#14** — Vr. Comissão (e Vr. Repasse) no Novo Negócio: campo ausente; `val_c`/`val_r` já validados no POST /negocio.
- **#12** — máscaras/validação de tipos nos forms (print: telefone "559999999999999999999999").
- **#19** (FORA do board — adicionar) — persistir últimos filtros selecionados.
- **#5** — menu "+" ampliado (Documento/Fotos já existem; definir corte: Contato/Câmera/Enquete/etc.).
- **#4** — waSpeed: etiquetas/favoritar/finalizar ENTREGUES; aguardam decisão: transferir (P-C), agendada (P-A), lembretes (P-B); tradução recomendo ficar fora.
- **#28** — e-mail Agia: somar login 500 + pendências antigas (dados bancários, upload anexos, lookup campanhas/bases).

---

## Sprints

### S0 — Emergência sync (0,5 sessão) 🔴
1. **Comunicar Agia** (via Tiago/Marcel, canal da #28): login 500 desde ~21/07, evidência técnica pronta. Perguntar se acesso/módulo mudou (nova credencial Corp+?). Se vierem credenciais novas → trocar env Vercel + secret GH.
2. Blindagem (código, independe da Agia):
   - Endpoint diurno retorna **HTTP 500 quando ok:false** → GH Actions fica vermelho de verdade.
   - `corp_sync_log` registra **falhas** (hoje só grava sucesso — silêncio total desde 21/07).
   - Retry 3x com backoff no login Corp.
   - Banner na Config + board: "Último sync Corp: há Xh" (vermelho se >1h em horário comercial).
3. Login voltou → sync manual completo + validar #34/#36-datas + fechar #16/#20.

### S1 — Bugs Inbox críticos (1–1,5 sessão)
1. #33: regex aceita parâmetros MIME + normaliza `type` p/ UazapiGO. Testar Chrome Windows real.
2. #30: buscar ÚLTIMAS N msgs (desc+reverse) + "Carregar anteriores" + revisar polling/payload (lentidão).
3. #31: refocus textarea pós-send (Inbox + DealPanel).
4. #29: `fromMe` nunca usa pushName p/ nome; **script de reparo** dos contatos contaminados (nome=dono, telefone≠dono → renomear via /chat/details ou telefone). Auditar quantos.
5. #37: reproduzir + fix (erro junto ao campo, scroll, não perder conteúdo).
6. #35: remover campo Legenda do preview de anexo.
7. #38: `multiple` + fila sequencial de envio com progresso.

### S2 — Composer paridade + encaminhar (1 sessão)
1. #39: extrair composer compartilhado (mic + anexos) → DealTabConversas.
2. #32: menu contextual na bolha → "Encaminhar" → picker de contato → reenvio (probe `/message/forward` UazapiGO; fallback re-upload do media_url).
3. #5: corte proposto — Documento, Fotos e Vídeos (já ok), + Contato (vCard), + Resposta rápida. Câmera/Enquete/Evento/Figurinha/Catálogo: validar com Tiago se UazapiGO suporta / se vale.

### S3 — Dados Corp no card = Fase 2 antecipada (1,5–2 sessões)
1. #36: detail sync popular `produtor`/`agente`/responsável-Corp + `next_action` descrição + **ramo nome completo** (codram→lookup; corrige tb duplicatas de seguradora abreviada nos filtros) + exibir na Info.
2. #36/U6: atendimentos do Corp na timeline (Atividades) read-only.
3. #36: debugar anexos Corp parciais no 7512 ("Parte dos anexos não pôde ser carregada").
4. #14: Vr. Comissão + Vr. Repasse no modal e na Info (round-trip val_c/val_r).
5. #12: máscaras (telefone, e-mail, moeda, data, CPF/CNPJ).
6. #15: contato on-the-fly no sync (mata o skipped mesmo-dia).
7. #19: persistir filtros (localStorage por usuário) + adicionar issue ao board.

### S4 — Board hygiene + decisões (0,5 sessão)
- Fechar: #10, #16, #17, #20, #22-#25, #27, #2, #3, #18 (conforme validação).
- Cobrar decisões: P-A (msg agendada), P-B (lembretes), P-C (transferir atendimento), escopo #5, tradução fora.
- #28: consolidar e-mail Agia (login 500 + dados bancários + upload anexos + lookup campanhas/bases).

**Estimativa total: ~5 sessões.** Bloqueadores externos: Agia (login) para S0/S3; decisões Marcel/Tiago para S2.3/S4.

---

## Riscos
- Tokens warm expiram até ~23-24/07 → sem ação da Agia, TUDO de Corp para (inclusive lookups, dual-write, anexos). S0.1 é urgente.
- RLS storage Cloudfy intermitente (mitigado por uploadWithRetry, monitorar em #33/#38).
- Reparo de contatos #29: renomear em massa exige cuidado para não sobrescrever nomes editados à mão — só tocar contatos cujo nome == nome da instância.
