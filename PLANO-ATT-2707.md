# Plano — Atualizações 27/07 (4 PDFs "marpe att novas")

> Fonte: 4 PDFs entregues 27/07 · Inbox (15 correções + 4 melhorias) · Sincronização Corp×CRM (10 módulos) · Campanha/Templates · API Corp (contexto e-mail Agger)
> Cruzado com o estado real do CRM pós-entrega de 22-23/07 (RELATORIO-BOARD-2207.md)

---

## Leitura de cada PDF (índice)

1. **API Corp — e-mail organizado**: histórico da thread com a Agger (Bruno/Leonardo), credenciais api@marpe.com.br, timeline maio→22/07. Sem itens novos de código — o "POST /negocio" listado como bloqueio JÁ FOI resolvido por nós (09/07). Utilidade: canal formal para enviar os pedidos pendentes (SOLICITACAO-AGIA-API.md itens 1-7).
2. **Inbox — Observações, Melhorias e Correções**: 15 correções numeradas + 4 melhorias gerais (experiência WhatsApp Web, abas de funil de atendimento, composer completo, reações).
3. **Sincronização Corp×CRM**: espec de integração bidirecional em tempo real + mapeamento de 10 módulos de cadastro/negócio + campos exclusivos do CRM.
4. **Campanha/Templates**: módulo Campanha estilo waSpeed (4 estágios, 3 tipos de mensagem incl. carrossel), variáveis, destaque do nome do template, disparo via API oficial Meta (opção), remover aba Config>Status.

## Já entregue (não replanejamos — comunicar ao cliente)

| Item do PDF | Estado |
|---|---|
| Inbox 15 — persistir filtros | ✅ CRM feito 22/07 (falta replicar no Inbox — entra no S1) |
| Inbox 13/14 — encaminhar | ✅ Base entregue 22/07 (1 mensagem → 1 contato); evolução multi é o S2 |
| Inbox 9 — finalizar conversa | ✅ Badge "Finalizada" existe; falta a ABA (S1) |
| Sync — máscaras/validação CPF-CNPJ/telefone/CEP/e-mail | ✅ Novo Cliente 17/07 (falta dedupe por CPF e auto-PF/PJ — S3) |
| Sync 6 — responsável = usuário logado | ✅ 14/07 |
| Sync 6 — lookups (cliente/campanha/seguradora/ramo/tipo/base) | ✅ 17/07 (falta produtor/agente como select com código — S3) |
| Sync 7.2 — atendimentos Corp na timeline | ✅ 22/07 |
| PDF 1 — POST /negocio payload | ✅ Resolvido 09/07 (dual-write ativo) |
| Templates — variáveis por categoria | ✅ 17/07 (revisão de campos novos entra no S5) |

## Dependências externas (Agia) — sem elas alguns itens ficam bloqueados

- **Próxima ação (agendamento + descrição)** — API manda data de registro e descrição null (#28 itens 4-7 já enviados). Bloqueia: preview do card (7.3) e fidelidade do filtro. *Mitigação possível: POST /atendimento existe — investigar gravar a próxima ação como atendimento (S4).* 
- **Produtores por negócio, /usuarios, parâmetros de repasse, estado civil/escolaridade, canais de venda, grupos de produtores, PUT /negocio e PATCH /cliente (payloads)** — endpoints desconhecidos ou não documentados → rodada de PROBES (S0 do plano) + e-mail consolidado.
- **Dados bancários e upload de anexos** — API não expõe → contorno: campos/abas SÓ no CRM (S3), como o próprio PDF 3 já aceita ("campos exclusivos do CRM").

---

## ✅ S0 EXECUTADO — 27/07 · resultado dos probes

Método: `scripts/probe-corp-s0.mjs` (só GET/OPTIONS) + coleção Postman oficial (51 rotas) + validação de
escrita em **registro descartável** (cliente 2802/2803 e negócio 7766/7767, criados e excluídos no mesmo teste —
conferido com GET no fim: 404 nos dois). Nenhum registro real da Marpe foi alterado.

### Dá para fazer AGORA (sem depender da Agia)

| # | Achado | Destrava |
|---|---|---|
| 1 | **`PATCH /cliente` funciona** — identificador **no corpo** (`{codfil, codigo, ...}`); na query dá 400. Aceita `nome`, `estado_civil`, `escolaridade`, `profissao` | **S4.1** edição de cliente CRM→Corp |
| 2 | **`GET /estado_civil`** (6) e **`GET /escolaridade`** (11) existem — fora da doc | **S3.1** PF + "Informações adicionais" (Sync §1) |
| 3 | **Descrição da próxima ação é recuperável**: `prox_aten_descricao` vem null em 60/60, mas cruzando `prox_aten_codigo` com `atendimentos[]` do `GET /negocio` a descrição aparece (3/10 na amostra — os outros 7 atendimentos realmente não têm texto) | **S3.5** preview do card (Sync §7.3), parcial |
| 4 | `GET /busca_cpf?cpf_cnpj=` responde 404 "Nenhum cliente encontrado" quando não existe | **S3.3** dedupe PF/PJ |
| 5 | `ramo_tipo` e `ramo_multi` vêm no `GET /negocio` (só não vêm no cadastro `/ramos`) | Sync §3, parcial |
| 6 | `per_r`, `val_r`, `campo_base_r` vêm no negócio | Sync §5/§6 repasse, parcial |
| 7 | `PUT /telefone`, `/email`, `/endereco` liberados no OPTIONS (POST já em uso) | **S4.1** sub-recursos |

### Depende da Agia (foi para o e-mail — `SOLICITACAO-AGIA-API.md` v2)

| # | Bloqueio | Impacto no plano |
|---|---|---|
| 8 | **`PUT /negocio` → 500** em toda variação (inclusive payload completo estilo POST). Identificador é `codigo` no corpo — com `codigo_negocio`/`codneg` dá 404, então o 500 vem *depois* de achar o registro | **S4.2 fica bloqueado** |
| 9 | **`POST /atendimento` → 500** em 3 variações de payload | **S4.3 bloqueado** — e era a mitigação da #28 |
| 10 | **Não existe campo de agendamento**: 0/300 atendimentos com data futura, `realizado` sempre `"T"`, nenhum campo `agenda/prox/previsao`. `prox_aten_data` = timestamp de registro (neg. 7765: `prox_aten` 14:19:37 vs `datinc` 14:18) | **#28 confirmada como limitação da API**, não bug nosso |
| 11 | **Canais de Venda, Grupos de Produtores, Bancos e Parâmetros de Repasse não têm rota** (4 variações de nome cada; 403 de gateway = rota inexistente) | **Sync §5, §9, §10 saem do escopo** até a Agia responder |
| 12 | `/seguradoras` e `/ramos` devolvem só `codigo, nome, abreviatura`; `/produtores` e `/agentes` só `codigo, nome` | **Sync §2, §3, §4, §5**: "puxar/listar para consulta" fica no nível que já temos |

> Correção de leitura registrada: o 403 `Authorization header requires 'Credential' parameter` é o AWS Gateway
> rejeitando **rota inexistente** — não é erro de permissão. É o tell que separa "rota não existe" de "payload errado".

### Consequência para os sprints

- **S3 e S1 seguem integralmente** — não dependem de nada da Agia.
- **S4 encolhe** para o que está validado: cliente (PATCH) + telefone/email/endereço (PUT). Negócio e atendimento ficam pendurados no e-mail.
- **S3.7** (telas de consulta dos cadastros do Corp) perde canais de venda e grupos de produtores; sobra seguradoras/ramos/agentes/produtores em nível de código+nome.
- **Sync §2/§3 (tipo da seguradora, tipo do ramo)** não são implementáveis como cadastro — comunicar ao Marcel.

---

## Sprints propostos

### ~~S0 — Probes na CorpAPI + e-mail consolidado (0,5 sessão)~~ ✅ CONCLUÍDO 27/07
Resultado acima. Entregáveis: `scripts/probe-corp-s0.mjs` (reexecutável) e `SOLICITACAO-AGIA-API.md` v2 (itens 8-11 novos, prontos para o Tiago enviar).

### S1 — Inbox: correções e WhatsApp Web feel (1,5 sessão)
1. (#1/#2) Remover barra/contagem no topo da conversa → scroll infinito para cima (substitui o botão "Carregar anteriores")
2. (#3) Player de áudio estilizado (sem barra branca do `<audio>` nativo)
3. (#5) Links clicáveis nas mensagens (linkify http/https)
4. (#8) Formatação WhatsApp (*negrito*, _itálico_, ~tachado~) + investigar "vídeo expirado" indevido
5. (#10) Grupos: mensagens enviadas (fromMe) à DIREITA — bug real: webhook marca tudo inbound em grupo
6. (#11) Emoji picker no composer
7. (#12) Um áudio por vez (pausa os demais ao dar play)
8. (#9 + melhoria) Abas do funil de atendimento: Conversas · Grupos · Não lidas · Finalizadas (· Atendimento — confirmar critério com Marcel)
9. (#7) "/" mensagens rápidas: navegação por teclado + preview da mensagem com variáveis resolvidas por template
10. (#15) Persistir filtros/aba do Inbox (localStorage, mesmo padrão do CRM)
11. (#4) Verificar "Sincronizar fotos" na Config (funciona? senão remover) + (#6) investigar contatos que sumiram da lista
12. (PDF 4) Remover aba Config>Status · corrigir erro da tela Config>WhatsApp (print mostra "UazapiGO connect error 401")

### S2 — Encaminhar multi + reações (1 sessão)
1. (#13) Encaminhar mídia/mensagem para VÁRIOS contatos (multi-select no modal)
2. (#14) Selecionar VÁRIAS mensagens e encaminhar de uma vez (modo seleção estilo WhatsApp)
3. (Melhoria) Reagir às mensagens (UazapiGO /message/react — probe; armazenar em metadata)
4. (Melhoria) Botão "mensagens rápidas" (raio) ao lado do clipe

### S3 — Cadastros: Novo Cliente PF/PJ completo + CRM-only (1,5-2 sessões)
1. Novo Cliente dinâmico: PF (estado civil*, venc. CNH) / PJ (sexo some, profissão→atividade, nascimento→fundação, contato na empresa) — *estado civil: lookup Corp se S0 descobrir; senão lista local
2. Abas Dados Bancários e Anexos no cliente — SÓ CRM (API não tem): tabelas novas + upload no nosso Storage
3. Dedupe por CPF/CNPJ via `busca_cpf` + detecção automática PF/PJ pelos dígitos
4. Mapa (link Google Maps pelo endereço) abaixo do endereço
5. (Sync 7.1) Código do negócio na guia Info do card + (7.2) atividade de etapa com "de → para" e autor + (7.3) preview do card com texto da próxima ação (usa next_action local; Corp depende da Agia)
6. Novo Negócio: campo "Nome do negócio", aba Coberturas, produtor/agente como select com código (dual-write se S0 validar codpro/codage no POST)
7. Telas de consulta dos cadastros do Corp (Config > Corp): seguradoras, ramos, agentes, produtores, canais (se S0 achar endpoint) — leitura/lista

### S4 — Sincronização bidirecional (1-1,5 sessão — escopo depende do S0)
1. Edição de cliente no CRM → PATCH /cliente + PUT telefone/email/endereco (write-through)
2. Edição de negócio (Info) no CRM → PUT /negocio (se payload viável)
3. Próxima ação criada/editada no CRM → POST /atendimento no Corp (se S0 validar — isso também RESOLVE o gap da próxima ação na prática)
4. Latência Corp→CRM: manter 30min + sync-light; avaliar 15min (custo GitHub Actions)
> "Tempo real" verdadeiro exigiria webhooks do Corp — não existem; registrar como limitação ao cliente.

### S5 — Módulo Campanha estilo waSpeed (1,5-2 sessões)
1. Wizard 4 estágios: Destinatários → Ações → Revisão/Envio → Resultados
2. Fontes de destinatários: contatos salvos, conversas do inbox, etiquetas, grupos, funil/etapa do CRM, manual (+ importar planilha se couber)
3. Tipos de mensagem: simples · mídia (foto/vídeo + texto) · carrossel até 5 fotos (UazapiGO /send/carousel — já validado no projeto Azeredo)
4. Variáveis em todos os tipos + templates/rápidas
5. Resultados por destinatário (entregue/erro) — evoluir campaign_recipients
6. Templates: nome do template em DESTAQUE no editor

### S6 — Multi-instância WhatsApp por usuário (épico, 2-3 sessões — validar antes)
Cada usuário conecta o próprio número: criação de instância Uazapi por perfil, QR na Config, webhook multi-instância, envio pela instância do usuário logado, inbox filtrado/atribuído. Mexe em TODO o fluxo de mensagens — proposta de arquitetura antes de codar. (Custo: 1 instância Uazapi por número — confirmar plano com Tiago.)

### S7 — Disparo via API oficial Meta (épico, decisão comercial antes)
Opção por campanha: Uazapi (não oficial) OU Cloud API oficial. Exige: WABA da Marpe, número dedicado, templates HSM aprovados pela Meta, custos por conversa. Recomendo: aprovar escopo/custos com Marcel antes (proposta à parte).

---

## Ordem recomendada e estimativa

S0 (probes) → S1 (inbox) → S3 (cadastros) → S2 (encaminhar/reações) → S4 (bidirecional) → S5 (campanhas) → [decisões] → S6/S7.
**Total S0-S5: ~6-7,5 sessões.** S6+S7 são épicos com decisão prévia (custo/arquitetura).

## Decisões que precisamos do Marcel/Tiago

1. Aba "Atendimento" no Inbox — qual o critério de entrada/saída?
2. "IA para aprimorar respostas" (PDF 2) — escopo e provedor (é feature nova com custo por uso; proposta à parte?)
3. S6 multi-número: quantos usuários/números? (custo de instâncias Uazapi)
4. S7 API oficial Meta: seguir para orçamento?
5. Aba Status: remover de vez ou só ocultar (há dados de status em uso nos cards)
6. Pendentes antigos: P-A (msg agendada), P-B (lembretes), P-C (transferir atendimento) — o funil de abas do S1 conversa com isso
