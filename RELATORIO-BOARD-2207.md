# Relatório — Board 22/07 executado (deploys d5f7839 → c981139+)

> Data: 22/07/2026, atualizado 23/07 · Prod: https://marpe-crm-seguros.vercel.app (READY)
> Análise completa: PLANO-BOARD-2207.md · E2E automatizado: 7/7 PASS em produção

---

## ✅ ATUALIZAÇÃO 23/07 — Corp RESTABELECIDO + 2 correções extras

- **Login da CorpAPI voltou 22/07 ~21h17 (BRT)**. O monitor detectou e disparou o sync na hora: 2 negócios criados, 126 atualizados, 1 removido (excluído no Corp), 3 sinistros, 0 erros. Login estável (~1s). Validação campo a campo: **CRM = API em 128/128 negócios em andamento**. Banner de alerta do board limpou sozinho. Issues **#34 e #15 fechadas** com evidência.
- **Anexos do Corp no card (#36) corrigidos**: a API devolve anexos de negociação numa chave diferente da de cliente (`negocio_anexos`) e o CRM não lia — negócio 7512 agora lista os 2 PDFs com download OK (commit c981139).
- **Filtros do CRM (polish 23/07)**: Ramo agora lista os **27 ramos reais** dos negócios com nome por extenso (a lista fixa antiga tinha 8 opções com valores que nem batiam — ex. "empresarial" vs "empr"); Seguradora sem duplicatas (abreviação e nome completo unificados — "ALLI" = "ALLIANZ SEGUROS").
- **⚠️ Divergência REMANESCENTE (lado Agia, #28 itens 4-7)**: a "Próxima Ação" que a API entrega é a **data de registro** do atendimento, não o agendamento da tela do Corp (ex.: 7512 tela=22/07 vs API=09/07); descrição vem sempre null; grade Produtores e usuários não são expostos; `header.count` inconsistente. **O CRM está fiel à API — enquanto a Agia não responder, o filtro "Próxima ação" pode diferir do Totalizador do Corp.** Pedidos formalizados em SOLICITACAO-AGIA-API.md (itens 4-7) e na issue #28.

## ~~🚨 AÇÃO EXTERNA PENDENTE — Agia (bloqueador do sync)~~ → RESOLVIDO 23/07 (registro histórico)

O `POST /login` da CorpAPI retornou **500 de ~21/07 até 22/07 21h17 BRT** (falha na emissão de token para qualquer login válido; a validação de credenciais funcionava). Diagnóstico e evidências na issue #28. O sync se normalizou automaticamente na volta, como previsto.

## Blindagem implantada (S0) — a falha nunca mais fica invisível

1. Login Corp com **retry 3x** (backoff) antes de desistir.
2. Endpoints de sync (diurno + noturno) agora **retornam 500 em falha** → o GitHub Actions fica **VERMELHO** (antes: 200 `{ok:false}` → verde falso por 2 dias). *Os próximos runs do cron vão aparecer vermelhos até a Agia corrigir — é o comportamento esperado.*
3. **Toda falha é registrada** no `corp_sync_log` (antes só sucesso era logado).
4. **Banner no CRM**: "Dados do Corp sem atualização há Xh" quando o sync fica >2h parado (some sozinho quando normalizar).
5. Novo `GET /api/corp/sync-status` alimenta o banner.

## Entregas do dia (19 issues fechadas no board)

| # | Item | Causa-raiz / solução |
|---|------|----------------------|
| 33 | Áudio dava "data deve ser um data-URI base64" | Validação rejeitava `audio/webm;codecs=opus` (Chrome/Windows). Regex corrigido + MIME normalizado |
| 30 | Última msg não aparecia + lento | API buscava as 200 mensagens MAIS ANTIGAS. Agora abre na janela mais recente + "Carregar anteriores". Validado em contato com 1.240+ msgs |
| 29 | Números alheios como "Marcel - Marpe Seguros" | Webhook usava pushName em msgs fromMe (nome do remetente = a instância). Fix + **51 contatos renomeados** com o nome real (backup em ~/Backups/marpe-crm/2026-07-22/) |
| 31 | Perder foco após enviar | Refocus automático no composer (Inbox + card) |
| 35 | Duas caixas de texto no anexo | Campo Legenda removido — o texto do composer vira a legenda |
| 38 | Só 1 arquivo por vez | Multi-arquivo (até 10) com envio sequencial e progresso |
| 32 | Não encaminhava mensagens | Botão ↪ na mensagem → escolher contato → reenvia texto/mídia do histórico. Novo POST /api/messages/forward |
| 39 | Card sem áudio/anexo | Aba Conversas do card com mic + anexos (paridade com Inbox) |
| 37 | "Nome é obrigatório" no template | Erro agora rola/foca o campo Nome no topo, com marcação vermelha |
| 19 | Salvar último filtro | Filtros, ordenação, visão e funil persistem entre visitas (localStorage). Issue adicionada ao board |
| 20 | Filtro Próxima ação | Presets já estavam no ar (17/07); hoje: **fix de fuso horário** (o "Hoje" virava o dia às 21h BRT — toISOString é UTC) |
| 1, 2, 3, 10, 12, 14, 18, 27 | Entregues em 17/07 | Fechadas com evidência (prints das próprias issues novas mostram as features no ar) |
| 16, 17, 22–25 | S1/stack | Fechadas (autorizado 17/07 — mecanismo entregue; #22-25 descreviam stack Laravel/Nuxt inexistente) |

## #36 — parcial (depende da Agia)

Em prod: Ramo por extenso (EMPRESARIAL, não "empr") via lookups; atendimentos do Corp na aba Atividades (U6 — dados já estavam no banco, faltava exibir); "Criado no Corp por" + "Responsável (Corp)" na Info; sync preparado para produtor/agente (a doc da CorpAPI não tipa esses campos — capturamos se vierem). Pendente da Agia: endpoint de usuários (nome do responsável) e login voltar (próxima ação + anexos).

## Abertas no board (4 — atualizado 23/07)

- **#28** — respostas da Agia aos itens 4-7 (próxima ação real, descrição, produtores, usuários, count)
- **#36** — dados Corp: anexos ✓ e ramo ✓ resolvidos; produtor/responsável e próxima ação dependem da Agia
- **#4** — waSpeed: aguarda OK para P-A (msg agendada), P-B (lembretes), P-C (transferir)
- **#5** — menu "+": aguarda decisão sobre Contato/Enquete/Evento/Figurinha/Catálogo

Fechadas em 23/07: **#34** (sync normalizado, CRM=API 128/128) e **#15** (mecanismo mesmo-dia validado na retomada — skipped:0).

## Roteiro de testes (Marcel/Tati)

1. **Áudio**: gravar e enviar voz no Inbox (Chrome/Windows) → deve chegar como mensagem de voz. Idem na aba Conversas de um card.
2. **Anexos**: selecionar 3+ arquivos de uma vez → todos enviados em sequência. Digitar texto antes de enviar → vira legenda do primeiro.
3. **Conversa longa** (ex.: Jacira): abrir → as mensagens de HOJE aparecem no fim; "Carregar mensagens anteriores" puxa o histórico.
4. **Enviar mensagem** → o cursor continua no campo, dá para digitar direto.
5. **Encaminhar**: passar o mouse numa mensagem → ↪ → escolher contato → conferir no WhatsApp.
6. **Contatos**: buscar "Marcel -" no Inbox → só o Marcel real; os 51 contatos falsos agora têm o nome verdadeiro (ex.: Thaiana).
7. **Template**: criar sem nome → a tela rola até o campo Nome marcado em vermelho.
8. **CRM**: aplicar filtros → sair e voltar → filtros mantidos. Filtro Ramo agora tem todos os ramos por extenso; Seguradora sem duplicatas. (O banner vermelho de sync só aparece se o Corp parar de novo.)
9. **Card**: aba Atividades mostra "Atendimento Corp" (ex.: negócio 7512 tem o da Vanessa 09/07); aba Info mostra Ramo por extenso e "Criado no Corp por"; aba Docs lista os anexos do Corp (7512 tem 2 PDFs).
10. **Negócio novo criado no Corp** aparece no CRM em até 30 min (validado na retomada de 22/07 à noite). ⚠️ A data de "Próxima Ação" pode diferir da tela do Corp em parte dos negócios — é limitação da API da Agia (issue #28), não do CRM.

## Detalhe técnico

- Commit: `d5f7839` (origin + espelho u4digital) · 17 arquivos, +970/−97
- Novos endpoints: `/api/messages/forward`, `/api/corp/sync-status`
- E2E prod (7/7): sessão, sync-status, webhook fromMe, MIME com parâmetros, janela de mensagens, HTTP 500 do sync, log de erro
- Reparo de contatos: 50 nomes reais + 1 telefone, 0 falhas, backup antes
