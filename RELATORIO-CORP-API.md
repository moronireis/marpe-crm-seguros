# Relatório da integração Corp (Agia) — o que sincroniza e o que não

> Auditoria de 30/07/2026, medida contra a API real (probes) e os dados de produção.
> Espelho vivo na plataforma: **Configurações → Corp → Relatório da integração** (fonte:
> `src/lib/corp/integration-status.ts` — os dois atualizam juntos).
> Objetivo: deixar claro para Marcel/Tiago o que já está 100%, o que tem limitação e o que
> precisa ser **cobrado da Agger/Agia por e-mail** para a plataforma sincronizar por completo.

---

## 1. O que está sincronizando (funcionando em produção)

| Área | Estado | Detalhe |
|---|---|---|
| Clientes Corp → CRM | ✅ | ~2,7 mil vinculados; sync 30/30min + noturno |
| Clientes CRM → Corp | ✅ | Criação na hora (cliente+telefone+endereço+e-mail) e edição via PATCH; estado civil/escolaridade entram num 2º passo automático (o POST do Corp recusa — contornado) |
| Negócios Corp → CRM | ✅ | Lista + detalhe 30/30min, com reconciliação de exclusões |
| Negócios CRM → Corp (criação) | ✅ | Dual-write ativo desde 09/07 |
| Apólices / documentos | ✅ | ~4,4 mil sincronizadas |
| Sinistros (leitura) | ✅ | Funil Sinistros populado pelo sync |
| Renovações | ⚠️ contorno | A rota /renovacoes responde **500** (30/07, todas as variações). Em produção o funil é **derivado das apólices** com vigência ≤60 dias (etapas 60/30 por proximidade; avanço automático só 60→30) |
| Atendimentos na timeline | ✅ | Histórico do Corp na aba Atividades |
| Anexos (download) | ✅ | Cliente e negociação, links renovados a cada abertura |
| Próxima ação (descrição) | ⚠️ parcial | Campo da API vem sempre vazio; recuperamos via join com os atendimentos (~1/3 tem texto) |

## 2. O que NÃO sincroniza — e de quem depende

### Depende da Agger/Agia (a API não expõe ou responde erro)

| Área | Evidência |
|---|---|
| **Editar negócio (CRM → Corp)** | `PUT /negocio` → 500 em toda variação, inclusive payload completo aceito pelo POST |
| **Gravar próxima ação/atendimento** | `POST /atendimento` → 500 em 3 variações de payload |
| **Renovações (rota oficial)** | `GET /renovacoes` → 500 em todas as combinações de parâmetros (30/07) |
| **Data agendada da próxima ação** | API devolve data de REGISTRO; agendamento da tela não existe em rota nenhuma (0/300 atendimentos com data futura) |
| **Nome do responsável** | Só vem `codusu_responsavel`; não existe rota de usuários |
| **Produtores/agente por negócio** | Grade "Produtores" da tela não é exposta |
| **Campanhas (nomes)** | Só `codcamp`; não existe lista de campanhas |
| **Parâmetros de repasse por produtor** | Sem rota |
| **Canais de venda / grupos de produtores / bancos** | Rotas não existem (4 variações de nome testadas cada) |
| **Dados bancários do cliente** | Não exposto nem para leitura |
| **Upload de anexos** | Rotas de anexo são só leitura |
| **Detalhe dos cadastros** | Seguradoras/ramos/produtores/agentes devolvem só código+nome+abreviatura (a tela do Corp tem Tipo, CEP etc.) |
| **Escrita de cadastros** | Sem POST/PUT/DELETE para seguradoras/ramos/produtores/agentes — por isso o módulo Cadastros do CRM é consulta |

### Nosso lado (dá para fazer sem a Agia — planejado)

| Área | Situação |
|---|---|
| **Parcelas/vencimentos das apólices** | DESCOBERTA 30/07: o detalhe do documento TEM o array `parcelas` (vencimento, valor, quitação). Planejado — alimenta lembretes de cobrança |
| **Endossos (usar o último)** | `/documento_endossos` existe e nunca foi consumida |
| **Dados complementares do cliente no sync** | Detalhe individual tem profissão/estado civil/endereço; enriquecimento incremental planejado |
| **Negócios finalizados (histórico)** | `/negocios_finalizados` existe e não é consumida |

## 3. E-mail pronto para a Agger/Agia (Tiago encaminha)

> **Assunto:** API Corp Nuvem — pendências que impedem a sincronização completa (Marpe Corretora)
>
> Olá, equipe Agger/Agia,
>
> Somos a equipe de tecnologia da Marca Corretora de Seguros (Marcel Foletto, São Sepé/RS).
> A integração de leitura está sólida — clientes, negócios, apólices, sinistros e anexos.
> Para sincronizar 100%, precisamos de apoio nos pontos abaixo (detalhes técnicos e exemplos
> de payload no documento que acompanha):
>
> 1. **PUT /negocio** responde 500 em todas as variações — precisamos da especificação do payload (é o que impede editar negociações pelo CRM).
> 2. **POST /atendimento** responde 500 em todas as variações — especificação do payload.
> 3. **GET /renovacoes** responde 500 com qualquer combinação de parâmetros (testado em 30/07).
> 4. **Próxima ação**: a API devolve a data de registro do atendimento; a data AGENDADA que a tela mostra não é exposta, e `prox_aten_descricao` vem sempre vazia.
> 5. Rota de **usuários** (código → nome) para resolver o responsável pela negociação.
> 6. **Produtores/agente vinculados à negociação** (grade "Produtores" da tela).
> 7. Lista de **campanhas** (código + nome) e das **bases de cálculo de repasse**.
> 8. Rotas de **canais de venda, grupos de produtores e bancos**.
> 9. **Parâmetros de repasse por produtor** (base de cálculo e forma).
> 10. **Dados bancários do cliente** (hoje sem leitura) e **upload de anexos** (hoje só download).
> 11. **Versão detalhada dos cadastros** (seguradoras, ramos, produtores, agentes) com os campos da tela — hoje só código, nome e abreviatura.
> 12. **Escrita dos cadastros** (criar/editar/excluir seguradoras, ramos, produtores, agentes) para o módulo de Cadastros do CRM sincronizar de volta.
>
> Podemos fazer uma call técnica se ajudar a destravar. Obrigado!
> Tiago Donicht — u4digital (em nome de Marcel Foletto — Marpe Corretora de Seguros)

*Os itens 1, 2, 4-11 já constam, com exemplos técnicos, no `SOLICITACAO-AGIA-API.md`; os itens 3 e 12 entraram na v3 (30/07).*

## 4. Regra de manutenção

Mudou a API ou chegou resposta da Agia → atualizar **no mesmo commit**: `src/lib/corp/integration-status.ts`
(painel da plataforma) + este arquivo + `SOLICITACAO-AGIA-API.md`.
