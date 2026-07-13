# Solicitação à Agia (Corp Nuvem) — API de Integração

> Gerado em 2026-07-09, revisado após a doc oficial (documenter.getpostman.com/view/33455116/2sAYkBrLmi).
> Atualizado em 2026-07-13 (checkpoint 10/07): adicionado o item 3 — lookups de campanhas e bases de cálculo.
> Pronto para o Tiago enviar por e-mail.

---

**Para:** Suporte / TI — Agia (Corp Nuvem)
**Assunto:** API Corp Nuvem — dados bancários, upload de anexos e lookups de campanha/base de cálculo

---

Olá, equipe Agia,

Somos a equipe de tecnologia que atende a **Marca Corretora de Seguros** (Marcel Foletto, São Sepé/RS). Estamos integrando o CRM da corretora à API do Corp Nuvem (`api.corpnuvem.com`), autenticando com as credenciais do próprio cliente. Com a documentação publicada no Postman, a integração avançou muito bem — leitura completa e criação de clientes e negociações já estão operacionais.

Ficaram apenas três pontos que não localizamos na documentação:

## 1. Dados bancários do cliente

Existe endpoint para **consultar os dados bancários** cadastrados no cliente (aba "Dados Bancários" do Cadastro de Clientes — banco, titular, conta, observações)? Não encontramos essa rota na documentação nem no retorno do `GET /cliente`. Se existir, poderiam indicar o caminho e os parâmetros?

## 2. Upload de anexos de cliente/negociação

Os endpoints `GET /cliente_anexos` e `GET /negocio_anexos` funcionam perfeitamente (inclusive com as URLs pré-assinadas para download). Existe rota para **enviar anexos avulsos** a um cliente ou a uma negociação via API? Vimos o fluxo **InCorp** (`incorp_url_post` → upload S3 → `incorp` → `incorp_contexto` → `incorp_documento`), mas ele parece específico para importação de documentos/propostas — se ele também atender anexos avulsos de cliente/negociação, poderiam confirmar o uso correto?

## 3. Lookups de Campanhas e Bases de Cálculo de Repasse

No `GET /negocio`, a campanha vem apenas como código (`codcamp`, ex.: 16) — o campo `campanha` retorna `null` mesmo quando há campanha vinculada. O mesmo vale para a base de cálculo do repasse (`campo_base_r`, ex.: 5), que na interface do Corp aparece com rótulo. Existe endpoint de **lista de campanhas** (código + nome) e de **bases de cálculo de repasse** (código + rótulo), como já existe para `/seguradoras`, `/produtores` e `/agentes`? Alternativamente, o `GET /negocio` poderia retornar os nomes resolvidos?

---

Obrigado!

**Tiago Donicht** — u4digital
*(em nome de Marcel Foletto — Marca Corretora de Seguros)*

---

## Anexo — Histórico resolvido (não enviar, referência interna)

- ~~POST /negocio retornava 500 "Negócio não inserido"~~ → **RESOLVIDO 2026-07-09** via doc oficial: além dos campos de negócio, o payload exige `etapa` (1), `status` (0), `prioridade` (3), `datinc` ("dd/mm/yyyy hh:mm"), `datalt` ("dd/mm/yyyy") e `campo_base_r` (5 = Com. Corretora). Sucesso: 201 `{ "message": "Negócio inserido.", "codigo_negocio": N }`. `DELETE /negocio?codfil=1&codigo=N` também validado.
