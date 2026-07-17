# Relatório de Execução — 17/07/2026

> Checkpoint 15/07 executado por completo: **Hotfix + Sprint S2 + Sprint S3 + Sprint S4**
> **20 issues do board u4digital** implementadas ou resolvidas, em produção em
> https://marpe-crm-seguros.vercel.app
> Planejamento de referência: `PLANO-AJUSTES-1507.md`

---

## 1. O que foi feito

### Hotfix — Mídia que não abre (#21) + sync de cliente novo (#15)

- **Causa-raiz do #21 encontrada**: o storage da Cloudfy falha de forma INTERMITENTE
  com erro de RLS (réplicas inconsistentes — sucesso e falha no mesmo minuto com o
  mesmo código), e quando falhava o webhook gravava a URL crua do CDN do WhatsApp,
  que expira E é criptografada → 1.285 mídias com link morto (1/3 do total).
- Correções: upload com **retry** no webhook; **nunca mais** gravar URL do CDN;
  fallback e proxy reescritos com a rota **real** da UazapiGO (`POST /message/download`
  — as rotas antigas eram especulativas e nunca existiram); proxy agora é
  **self-healing** (recupera, persiste e corrige a mensagem).
- **Backfill executado em produção**: das 1.295 mídias quebradas, **458 recuperadas**
  (voltam a abrir) e **837 marcadas como expiradas** — o WhatsApp não tem mais os
  bytes; agora mostram "Imagem/Áudio expirado — peça para reenviar" em vez de link morto.
- Bucket de mídia liberado para todos os tipos (xlsx/pptx eram recusados).
- **#15**: negociação de cliente criado no Corp **no mesmo dia** agora cria o contato
  na hora durante o sync (antes ficava pulada até o cron noturno de clientes).

### Sprint S2 — Formulários e board (#9–#14, #20)

- **#9** Aba "Corp" removida do painel do negócio.
- **#10** Board abre ordenado por "Mais recentes" (toggle "Vencidas primeiro" continua).
- **#11** Campo "Número da Apólice" removido dos formulários (leitura só aparece quando
  a apólice veio do sync do Corp; variável `{{apolice}}` preservada).
- **#12** Máscaras e validação: telefone `(DD) 9XXXX-XXXX` (10-11 dígitos), e-mail,
  CPF/CNPJ com dígito verificador, CEP — no Novo Cliente e no painel do Inbox, com
  **validação também no servidor** (telefone de 22 dígitos agora é rejeitado com
  mensagem clara). Percentuais limitados a 0-100.
- **#13** Seguradora (e Produtor/Agente) no Novo Negócio: **sempre** lista de seleção —
  estado "Carregando…" enquanto busca e **cache persistente** dos lookups (se o Corp
  estiver fora do ar, serve a última lista boa; nunca mais degrada para texto livre).
- **#14** Campos **Vr. Comissão** e **Vr. Repasse** no Novo Negócio, auto-calculados
  de Prêmio × % (editáveis), gravados no CRM e enviados ao Corp no dual-write
  (**validado**: Corp aceita e devolve `val_c`/`val_r`).
- **#20** Filtro "Próxima ação" com os presets do Corp: Todas / Hoje / Esta Semana /
  Este Mês / Próximos / Atraso de N dias / Personalizado (intervalo).

### Sprint S3 — Inbox (#1–#8)

- **#1** **Enviar áudio**: botão de microfone, gravação com contador, revisão antes do
  envio; chega como mensagem de voz no WhatsApp (UazapiGO transcodifica).
- **#5** **Menu de anexos**: clipe com "Documento" e "Fotos e vídeos" (com legenda e
  preview antes de enviar; no celular o seletor abre a câmera). Enquete/Evento/
  Figurinha/Catálogo **não existem** na API da UazapiGO — fora do possível.
- **#7** **Colar imagem** (Ctrl+V/Cmd+V) na caixa de texto → abre o preview e envia.
- **#2** Painel "Dados do Contato" **oculto por padrão**; botão "Dados" no cabeçalho
  abre/fecha e a preferência fica salva no navegador.
- **#3** Filtro **"Não lidas"** com contador, ao lado de Conversas/Grupos — com
  **leitura real**: abrir a conversa marca como lida (persistido) e o **badge do menu
  lateral passou a contar do mesmo jeito** (antes só zerava quando alguém respondia).
- **#6** Prefixo "[Remetente]" **não vaza mais** como legenda de imagem em grupos —
  vira o nome do remetente acima da bolha, como nos textos.
- **#8** **Menções** `@556299999999` viram `@Nome` (quando o número é um contato) e a
  **formatação do WhatsApp** renderiza: *negrito*, _itálico_, ~tachado~ e ```mono```.
- **#4** (parcial, itens sem dependência de decisão): **etiquetas** por conversa
  (criar/remover no painel + filtro na lista), **favoritar** (estrela — fixa no topo)
  e **finalizar conversa** (badge "Finalizada"; reabre sozinha se o cliente mandar
  mensagem). Respostas rápidas e organização por funil já existiam.

### Sprint S4 — Sinistros e variáveis (#27, #18)

- **#27** **Funil Sinistros sincronizado do Corp**: sinistros dos últimos 12 meses
  viram cards (vínculo pela apólice), etapa segue a situação do Corp (Em Andamento/
  Autorizado/Concluído...), com número do sinistro, franquia, oficina, responsável e
  descrição. **3 sinistros reais já entraram em produção.** No funil Sinistros o botão
  vira **"Registrar Sinistro"**: modal com segurado + apólice (das sincronizadas) +
  número + descrição. Corrigido de quebra: a consulta de sinistros do Corp usava um
  parâmetro que sempre retornou 404 (nunca tinha funcionado).
- **#18** **Variáveis de sinistro** no motor e no picker de templates (grupo novo
  "Sinistro"): `{{numero_sinistro}}`, `{{situacao_sinistro}}`, `{{data_ocorrencia}}`,
  `{{franquia}}`, `{{oficina}}` — funcionam em templates, mensagens rápidas e automações.

### Já validado automaticamente (E2E em produção)

- Sync diurno + reconciliação + sinistros rodando (GitHub Actions a cada 30 min).
- Telefone de 22 dígitos → bloqueado com mensagem; e-mail inválido → bloqueado.
- Proxy de mídia: expirada → estado terminal; persistida → abre direto.
- Corp aceita e devolve Vr. Comissão/Vr. Repasse (registro descartável POST→GET→DELETE).
- Envio de imagem, voz e documento validado via API (self-message na instância).

---

## 2. O que precisa ser testado (roteiro para Marcel/Tiago)

### Inbox
- [ ] Abrir uma conversa e **enviar um áudio** (microfone → parar → enviar) — conferir
  que chega como mensagem de voz no celular do destinatário
- [ ] Enviar **foto com legenda** e **PDF** pelo clipe — conferir no celular
- [ ] **Copiar um print e colar (Ctrl+V)** na caixa de texto → preview → enviar
- [ ] Conferir que o painel de dados começa **oculto** e abre no botão "Dados"
- [ ] Aba **"Não lidas"**: deixar alguém mandar mensagem, ver o contador subir, abrir a
  conversa e ver a bolinha sumir (sem precisar responder); badge do menu acompanha
- [ ] **Favoritar** uma conversa (estrela) → vai para o topo da lista
- [ ] **Finalizar** uma conversa → badge "Finalizada"; pedir para a pessoa mandar
  mensagem → reabre sozinha
- [ ] Criar uma **etiqueta** no painel do contato e filtrar por ela na lista
- [ ] Em grupo: imagem recebida NÃO mostra mais o texto "[Nome]" solto
- [ ] Mensagem com *negrito* e menção @ de um contato → renderiza nome e formatação
- [ ] Mídias antigas: as recuperáveis voltaram a abrir; as irrecuperáveis mostram
  "expirada — peça para reenviar" (⚠️ 837 mídias antigas são irrecuperáveis — o
  WhatsApp não guarda os bytes; isso é esperado)
- [ ] **#26**: tentar o "/" dos templates nas Conversas — no nosso teste o código está
  correto nas duas telas; se não acionar, anotar **qual tela e navegador** para
  reproduzirmos

### CRM / Negócios
- [ ] Board abre em "Mais recentes"
- [ ] Aba "Corp" sumiu do painel do negócio
- [ ] Novo Negócio: Seguradora é dropdown mesmo com internet lenta ("Carregando…")
- [ ] Novo Negócio: digitar Prêmio 1000 e Comissão 20% → Vr. Comissão preenche 200
  automaticamente (e dá para editar); depois conferir os valores no Corp
- [ ] Formulários: campo apólice sumiu; telefone/e-mail inválidos são bloqueados
- [ ] Filtro "Próxima ação": testar Hoje / Esta Semana / Atraso de 7 dias / Personalizado
- [ ] Editar um negócio no Corp e abrir o card no CRM → dado atualizado na hora
- [ ] Excluir um negócio de teste no Corp → some do CRM em até 30 min (registrado no
  log da página Config)
- [ ] Criar um cliente novo no Corp E uma negociação para ele no mesmo dia → aparece
  no CRM em até 30 min

### Funil Sinistros
- [ ] Abrir o funil Sinistros → 3 sinistros reais sincronizados do Corp, na etapa
  correspondente à situação
- [ ] Botão "Registrar Sinistro" → escolher segurado → apólices dele aparecem no
  select → registrar → card criado
- [ ] Template usando `{{numero_sinistro}}` / `{{situacao_sinistro}}` numa conversa
  de sinistro

---

## 3. Pendências e limitações conhecidas

| Item | Situação |
|------|----------|
| **P-A Mensagem agendada** | Aguarda OK de vocês (proposta no plano, ~0,5 sessão) |
| **P-B Lembretes** | Aguarda OK (atalho → próxima ação do negócio) |
| **P-C Transferir atendimento / "minhas conversas"** | Aguarda OK (~1 sessão — exige modelo de atendentes) |
| Tradução de mensagens (waSpeed) | Fora do escopo (baixo valor para o fluxo) |
| Enquete/Evento/Figurinha/Catálogo no anexo | A API da UazapiGO não expõe — inviável hoje |
| 837 mídias antigas | Irrecuperáveis (WhatsApp expirou); marcadas e com estado claro na UI |
| Escrita de sinistro no Corp | CorpAPI não tem rota confirmada — sinistro manual fica só no CRM (o sync não sobrescreve) |
| Mover card de sinistro manualmente | A etapa segue a situação do Corp — no próximo sync o card volta para a etapa correspondente (sinistro é Corp-owned) |
| Issues #22–#25 do board | Já implementadas desde antes (descreviam stack Laravel/Nuxt inexistente) — podem ser fechadas |
| Issues #16/#17 | Resolvidas na S1 (15/07) — podem ser fechadas |

## 4. Referências técnicas

- Migração nova: `supabase/migrations/20260717-inbox-s3-columns.sql`
  (`inbox_read_at`, `pinned`, `conv_status` em marpe_contacts) — aplicada em prod.
- Scripts novos: `scripts/backfill-media.mjs` (backfill de mídia), `scripts/backup-db.mjs`.
- Endpoint novo: `POST /api/messages/media` (envio de mídia via UazapiGO `/send/media`).
- Rota UazapiGO descoberta/validada: `POST /message/download {id}` → `{fileURL, mimetype}`.
- Sinistros: `syncSinistros()` roda no cron noturno e no diurno (30 min).
- Backup pré-execução: `~/Backups/marpe-crm/2026-07-15/`.
