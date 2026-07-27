# Solicitação à Agia (Corp Nuvem) — API de Integração

> Gerado em 2026-07-09, revisado após a doc oficial (documenter.getpostman.com/view/33455116/2sAYkBrLmi).
> Atualizado em 2026-07-13 (checkpoint 10/07): adicionado o item 3 — lookups de campanhas e bases de cálculo.
> **v2 — 2026-07-27**: rodada de probes S0 (leitura + escrita em registro descartável) fechou os itens 4 e 5 com
> evidência empírica e acrescentou os itens 8 a 11 (escrita e cadastros que a API não expõe).
> Pronto para o Tiago enviar por e-mail.

---

**Para:** Suporte / TI — Agia (Corp Nuvem)
**Assunto:** API Corp Nuvem — escrita de negociações/atendimentos, cadastros auxiliares e dados bancários

---

Olá, equipe Agia,

Somos a equipe de tecnologia que atende a **Marca Corretora de Seguros** (Marcel Foletto, São Sepé/RS). Estamos integrando o CRM da corretora à API do Corp Nuvem (`api.corpnuvem.com`), autenticando com as credenciais do próprio cliente. Com a documentação publicada no Postman, a integração avançou muito bem — leitura completa, criação de clientes e criação de negociações já estão operacionais, e a edição de clientes via `PATCH /cliente` também foi validada.

Seguem os pontos que não localizamos na documentação ou que divergem do comportamento da interface do Corp. Os itens 8 e 9 são hoje os **bloqueios principais** do projeto.

## 1. Dados bancários do cliente

Existe endpoint para **consultar os dados bancários** cadastrados no cliente (aba "Dados Bancários" do Cadastro de Clientes — banco, titular, conta, observações)? Não encontramos essa rota na documentação nem no retorno do `GET /cliente`. Se existir, poderiam indicar o caminho e os parâmetros?

## 2. Upload de anexos de cliente/negociação

Os endpoints `GET /cliente_anexos` e `GET /negocio_anexos` funcionam perfeitamente (inclusive com as URLs pré-assinadas para download). Existe rota para **enviar anexos avulsos** a um cliente ou a uma negociação via API? Vimos o fluxo **InCorp** (`incorp_url_post` → upload S3 → `incorp` → `incorp_contexto` → `incorp_documento`), mas ele parece específico para importação de documentos/propostas — se ele também atender anexos avulsos de cliente/negociação, poderiam confirmar o uso correto?

## 3. Lookups de Campanhas e Bases de Cálculo de Repasse

No `GET /negocio`, a campanha vem apenas como código (`codcamp`, ex.: 16) — o campo `campanha` retorna `null` mesmo quando há campanha vinculada. O mesmo vale para a base de cálculo do repasse (`campo_base_r`, ex.: 5), que na interface do Corp aparece com rótulo. Existe endpoint de **lista de campanhas** (código + nome) e de **bases de cálculo de repasse** (código + rótulo), como já existe para `/seguradoras`, `/produtores` e `/agentes`? Alternativamente, o `GET /negocio` poderia retornar os nomes resolvidos?

## 4. Próxima Ação — agendamento não é exposto pela API

Na interface do Corp, a Negociação exibe **"Data Próxima Ação"** com o agendamento futuro (ex.: negócio **7512** mostrava 22/07/2026 com a descrição "COTAÇÃO PORTO ANEXO"). A API, porém, devolve outra coisa. Medições de 27/07/2026:

- `prox_aten_data` acompanha o **timestamp de registro** do atendimento, não o agendamento. Ex.: negócio 7765 → `prox_aten_data` 27/07/2026 **14:19:37**, com `datinc` do negócio 27/07/2026 **14:18** (um minuto de diferença).
- `prox_aten_descricao` retorna **vazio/null em 60 de 60** negócios em andamento consultados.
- Em uma amostra de **300 registros de `GET /atendimentos`**: **0** têm data futura e **100%** vêm com `realizado = "T"`. Não há, em nenhuma rota que localizamos, um campo de **agendamento/previsão** do atendimento.
- A descrição existe no array `atendimentos[]` do `GET /negocio` — conseguimos recuperá-la cruzando `prox_aten_codigo` com `atendimentos[].codigo`, mas só quando aquele atendimento tem texto (3 de 10 na amostra).

Perguntas: (a) qual é a definição oficial de `prox_aten_data`? (b) existe forma de obter a **data agendada** da próxima ação — a mesma da tela e do filtro "Próxima Ação" da Grade? (c) `prox_aten_descricao` nula é defeito? Esse campo é a base do funil de trabalho diário da corretora no CRM.

## 5. Produtores/Agente da negociação

A tela da Negociação tem a grade **"Produtores"** (Agente + Produtor, ex.: PADR / MARCEL), mas o `GET /negocio` não retorna nenhum campo de produtor/agente (verificamos todos os campos da resposta — há `per_r`, `val_r` e `campo_base_r` do repasse, mas nenhum vínculo de produtor). Existe rota ou campos para obter os produtores vinculados a uma negociação?

## 6. Usuários (código → nome)

O `GET /negocio` retorna `codusu_responsavel` (ex.: 1), mas não há endpoint de usuários para resolver o nome ("Responsável pela Negociação" da tela). Existe uma rota tipo `/usuarios` (código + nome)?

## 7. `header.count` inconsistente no /negocios_andamento

Em 23/07 ~00h, `GET /negocios_andamento` retornou `header.count = 28` com **128 itens** na própria resposta (página única). Em 27/07 retornou `header.count = 225` com 60 itens para `qtd_pag=60`. A paginação baseada no `count` fica imprevisível — poderiam verificar?

## 8. `PUT /negocio` — retorna 500 (BLOQUEIO)

Precisamos refletir no Corp as edições feitas no card do CRM (valor, etapa, observações). O `OPTIONS /negocio` informa `GET, POST, PUT, DELETE, OPTIONS`, mas toda tentativa de `PUT` responde **HTTP 500 "Internal Server Error"**. Testes de 27/07 em registro descartável (negócio 7767, criado e excluído no mesmo teste):

- `PUT /negocio` com `{ codigo: 7767, val_premio: 250 }` → **500**
- `PUT /negocio` com o **payload completo** aceito pelo `POST` (codfil, codcli, codram, codcia, tipo, val_premio, per_c, observacoes, etapa, status, prioridade, datinc, datalt, campo_base_r) + `codigo` → **500**
- Trocando o identificador para `codigo_negocio` ou `codneg` → **404 "Nenhum negócio encontrado"** (ou seja, o identificador correto é mesmo `codigo`; o 500 vem depois de localizar o registro)

Poderiam nos enviar a **especificação do payload do `PUT /negocio`** (campos obrigatórios e formatos) ou um exemplo funcional? É o mesmo tipo de bloqueio que tivemos no `POST /negocio` e que vocês nos ajudaram a destravar.

## 9. `POST /atendimento` — retorna 500 (BLOQUEIO)

Queremos gravar no Corp a próxima ação/atendimento registrado pelo CRM, para que o histórico fique íntegro nos dois sistemas. `OPTIONS /atendimento` informa `GET, POST, PUT, DELETE, OPTIONS`, e o `GET` funciona normalmente. Já o `POST` responde **500** em todas as variações testadas (27/07), com os nomes de campo copiados do retorno do `GET /atendimentos`:

- mínimo: `{ codfil, codcli, codopo, tipo_atendimento: "O", data, hora, descricao }`
- \+ `usuinc`, `datinc`, `ativo: "T"`, `realizado: "F"`, `tipo`, `sistema`
- sem `codopo` (só cliente); e com `titulo` + `codigo_usuario_responsavel`

Poderiam enviar a especificação do payload (ou um exemplo funcional) do `POST /atendimento`? Resolver este item resolve também, na prática, boa parte do item 4.

## 10. Cadastros auxiliares sem rota

Rotas que procuramos e que o gateway rejeita como inexistentes (403 `Authorization header requires 'Credential' parameter`, diferente do erro de aplicação), incluindo variações de nome:

| Cadastro (tela do Corp) | Rotas testadas | Precisamos para |
|---|---|---|
| **Canais de Venda** (Produção > Canais de Venda) | `/canais_venda`, `/canal_venda`, `/canais`, `/canais_vendas` | listar canais no CRM e no cadastro de negócio |
| **Grupos de Produtores** (Produção > Grupo de Produtores) | `/grupos_produtores`, `/grupo_produtores`, `/grupos_produtor`, `/grupo_produtor` | agrupar produtores (internos/externos/por cidade) |
| **Bancos** (campo "Agente/Banco" do Produtor) | `/bancos`, `/banco` | preencher o campo no cadastro de produtor |
| **Parâmetros de repasse** (base de cálculo e forma) | `/parametros_repasse`, `/repasses`, `/repasse` | calcular repasse conforme o Corp |

Essas rotas existem com outro nome? Se não existirem, podem ser disponibilizadas?

## 11. Detalhamento de Seguradoras, Ramos, Produtores e Agentes

As rotas existentes devolvem apenas identificação, o que impede reproduzir os cadastros no CRM:

- `GET /seguradoras` → `codigo, nome, abreviatura` — falta o campo **"Tipo"** (fornecedor, oficina, vistoria etc.) e o endereço
- `GET /ramos` → `codigo, nome, abreviatura` — falta **"Tipo do ramo"** e **"Ramo multi"** (que aparecem no `GET /negocio` como `ramo_tipo` e `ramo_multi`, mas não no cadastro)
- `GET /produtores` → `codigo, nome` — falta agente/banco e os parâmetros de repasse
- `GET /agentes` → `codigo, nome` — faltam os demais campos da tela

Existe versão detalhada dessas rotas (ex.: `/seguradora?codigo=`, como há `/cliente?codigo=`)?

---

Obrigado!

**Tiago Donicht** — u4digital
*(em nome de Marcel Foletto — Marca Corretora de Seguros)*

---

## Anexo — Histórico resolvido (não enviar, referência interna)

- ~~POST /negocio retornava 500 "Negócio não inserido"~~ → **RESOLVIDO 2026-07-09** via doc oficial: além dos campos de negócio, o payload exige `etapa` (1), `status` (0), `prioridade` (3), `datinc` ("dd/mm/yyyy hh:mm"), `datalt` ("dd/mm/yyyy") e `campo_base_r` (5 = Com. Corretora). Sucesso: 201 `{ "message": "Negócio inserido.", "codigo_negocio": N }`. `DELETE /negocio?codfil=1&codigo=N` também validado.
- ~~Não sabíamos se dava para editar cliente pela API~~ → **RESOLVIDO 2026-07-27** (probe S0): `PATCH /cliente` funciona com o identificador **no corpo** (`{ codfil: 1, codigo: N, ...campos }`) e devolve 200 com o cliente atualizado. Aceita `nome`, `estado_civil`, `escolaridade` e `profissao` (validado: o `GET /cliente` seguinte já trouxe `cod_estado_civil`, `cod_escolaridade` e `cod_profissao` gravados). Com o identificador na **query string** retorna 400 "Codfil ou código de cliente inválidos.".
- ~~Estado civil e escolaridade não tinham lookup~~ → **RESOLVIDO 2026-07-27** (probe S0): existem, sem estar na doc — `GET /estado_civil` (6 opções) e `GET /escolaridade` (11 opções), ambos `{ codigo, descricao }`.
