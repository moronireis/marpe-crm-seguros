# Plano — Chamados do u4-status de 29/07 (6 reports novos do Tiago)

> Fonte: u4-status (u4_reports 29/07, todos com print) + 2 testes com status "problema" (A7, A12)
> \+ 2 itens do ciclo 1 ainda abertos. Verificado em 30/07 contra o código e os dados de produção.
> Estado: **PLANO — aguardando OK para executar.**

---

## Leitura dos 6 chamados (com diagnóstico)

### R1 · Inbox — "tarja branca em cima do áudio" + efeito ao abrir `[0e9cbeba]` — BUG, prioridade máxima

O print mostra o que é a tarja: **um elemento de imagem quebrado** (ícone de imagem partida à esquerda)
renderizado POR CIMA da bolha de áudio, vazando para fora dela. E "o efeito estranho ao abrir" persistiu
porque o fix de 28/07 tem uma falha real:

1. **Falha no fix do scroll**: a referência `scrolledContactRef` é marcada no primeiro disparo do efeito —
   que acontece ANTES das mensagens carregarem (lastMsgId ainda vazio). Quando as mensagens chegam, o efeito
   roda de novo e já não é "chat novo" → rolagem suave pela conversa inteira, de novo.
   **Fix**: só marcar a ref quando houver mensagens carregadas para aquele contato.
2. **Fallback de mídia frágil**: o `onError` das imagens/stickers esconde o elemento **mutando o DOM
   direto** (`style.display='none'`). O poll de 3s re-renderiza e o estilo inline do JSX **restaura** o
   elemento quebrado → a imagem morta volta a aparecer a cada ciclo (a tarja).
   **Fix**: erro de mídia vira **estado React** (Set de ids com falha) — falhou uma vez, renderiza o
   fallback "mídia expirada" definitivo, sem `<img>` no DOM. Vale para imagem, sticker e vídeo.
3. Pós-incidente há mensagens de imagem **irrecuperáveis** (media_url nulo + wa_message_id da instância
   antiga → proxy 410 sempre). Com o item 2, elas degradam limpo — sem tentativa visual.

### R2 · Inbox — abas sobrepostas `[6c597808]` — BUG visual, prioridade alta

Print: "Finalizadas" e "Atendimento" coladas/cortadas — 5 abas + badges não cabem nos 320px da lista.
**Fix**: barra de abas rolável horizontal (padrão WhatsApp/waSpeed), cada aba `flex: 0 0 auto`, fonte 10.5,
badge compacto; some a barra de rolagem visual (scrollbar none) e a aba ativa rola para ficar visível.

### R3 · Inbox — fluxo da fila `[4200f7de]` — mudança de comportamento

O Tiago **atualizou o critério** (era "clicar E responder", agora): **"ao CLICAR em um chat, ele move para
Atendimento e fica lá até ser finalizado"**. Finalizar → Finalizadas; cliente volta a falar → ciclo
reinicia; contadores contabilizando tudo.
**Fazer**:
- mover para `atendimento` já na **abertura** do chat (hoje é só no envio) — patch local + persistência;
- manter o gatilho no envio (idempotente, cobre quem responde sem abrir pela lista);
- finalizada + cliente escreve → volta para Conversas (já funciona — webhook reabre como `open`);
- **contadores por aba**: badge de não lidas em Conversas E em Atendimento (hoje o contador de não lidas
  é um só); Finalizadas mantém o total.

### R4 · Inbox — fotos que não sincronizam `[7002abf4]` — dados + endpoint

Print mostra contatos sem foto (Guilherme, Jacira). Causa raiz: **692 contatos foram marcados como
"tentados" na instância ANTIGA** (photo_synced_at de 14/07) — o backfill de 28/07 pulou todos eles, e o
botão "Sincronizar fotos" processa só 50 por clique.
**Fazer**:
- passe servidor **forçado** re-tentando todo `photo_url null` com `photo_synced_at` anterior a 28/07
  (na instância nova, via `/chat/details`);
- endpoint do botão passa a re-tentar automaticamente os marcados há mais de 30 dias;
- responder no chamado com os números: quem sobrar sem foto é **privacidade do WhatsApp do contato**
  (a API não entrega) — não há o que "consertar".

### R5 · Funis — gravar última configuração de filtros `[6af82d83]` — auditoria + gap pequeno

O print circula o toggle **"Mais recentes"** do board. A persistência de filtros existe desde 22/07
(`marpe_crm_prefs_v1`: filtros/ordenação/visão/funil) — então ou o toggle de ordenação ficou de fora do
prefs, ou algo o reseta.
**Fazer**: auditar o que o prefs v1 cobre de fato (toggle de ordenação do kanban, coluna de ordenação da
Grade, funil selecionado, "Ver todos" da janela de 12 meses); incluir o que faltar; e o pedido novo —
**botão "limpar filtros salvos"** (o "excluir filtros" do chamado).

### R6 · Módulo "Cadastros" no painel frontal `[d7868cff]` — módulo novo, parcialmente bloqueado

Pedido: tirar a consulta de cadastros de Configurações > Corp e virar um **módulo no menu** (Cadastros),
com **criar/excluir** Seguradoras, Ramos, Produtores etc., **tudo sincronizado com o Corp**.
**Dá para fazer**: página `/cadastros` no menu lateral com as 7 listas do Corp (busca, contagem, layout de
módulo — a consulta sai da Config).
**Bloqueado na Agia**: criar/editar/excluir sincronizado — **a API do Corp não tem rota de escrita** para
seguradoras/ramos/produtores/agentes (S0 provou: as rotas não existem; SOLICITACAO v2 item 11). Cadastro
"só no CRM" violaria o requisito "sincronizado com o Corp" e criaria divergência — não fazer sem a Agia.
Registrar no chamado com clareza.

## Arrasto do ciclo 1 (varredura junto)

| Item | O que fazer |
|---|---|
| Teste **A12 "problema"** — sobretela do "/" nas Conversas do card que não fecha | Reproduzir e corrigir (provável z-index/estado do TemplateDropdown no DealPanel) — entra no R1 |
| Teste **A7 "problema"** — finalizada deve voltar quando o cliente escreve | Retestar após R3 (o fluxo novo cobre); responder no teste |
| Item c1 "NÃO PUXA Responsável e Ramo do Corp" | Ramo por extenso está no ar desde 27/07 (evidenciar); Responsável nominal **depende do endpoint /usuarios da Agia** (item 6 da SOLICITACAO) — reclassificar |
| Item c1 "funil não atualiza com o Corp" | Evidenciar com o corp_sync_log atual (sync 30/30min ativo) e fechar, ou capturar caso concreto |

## Ordem, esforço e critério de pronto

| Sprint | Escopo | Esforço |
|---|---|---|
| **R1+R2** | tarja/efeito do áudio + abas roláveis + A12 | 0,5 sessão |
| **R3** | fila move ao clicar + contadores por aba | 0,25 |
| **R4** | fotos: passe forçado + endpoint com re-tentativa | 0,25 |
| **R5** | auditoria prefs + limpar filtros | 0,25 |
| **R6** | módulo /cadastros (consulta; CRUD fica registrado como Agia) | 0,5–0,75 |
| **Varredura c1 + respostas nos 6 chamados no u4** | evidências + status | 0,25 |

**Total: ~2 a 2,5 sessões.** Pronto = deploy + resposta em cada chamado no u4-status (status "analise" →
com comentário do que mudou e como testar).

## Fora deste plano (continuam onde estavam)

- **P-A / P-B / P-C** (aprovados 28/07) — leva própria; P-C pede meia sessão de arquitetura antes.
- **Tudo que depende da Agia** (PUT /negocio, POST /atendimento, /usuarios, escrita de cadastros,
  parâmetros de repasse, agendamento da próxima ação) — aguardando resposta ao SOLICITACAO-AGIA v2.
- Histórico de conversas antigo — backup/PITR (Tiago/Cloudfy).
