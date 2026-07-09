# Solicitação à Agia (Corp Nuvem) — API de Integração

> Gerado em 2026-07-09, revisado após a doc oficial (documenter.getpostman.com/view/33455116/2sAYkBrLmi).
> A doc resolveu o POST /negocio (payload obrigatório: etapa, status, prioridade, datinc, datalt, campo_base_r) —
> dual-write CRM↔Corp já está no ar. Restam 2 perguntas. Pronto para o Tiago enviar por e-mail.

---

**Para:** Suporte / TI — Agia (Corp Nuvem)
**Assunto:** API Corp Nuvem — dados bancários do cliente e upload de anexos

---

Olá, equipe Agia,

Somos a equipe de tecnologia que atende a **Marca Corretora de Seguros** (Marcel Foletto, São Sepé/RS). Estamos integrando o CRM da corretora à API do Corp Nuvem (`api.corpnuvem.com`), autenticando com as credenciais do próprio cliente. Com a documentação publicada no Postman, a integração avançou muito bem — leitura completa e criação de clientes e negociações já estão operacionais.

Ficaram apenas dois pontos que não localizamos na documentação:

## 1. Dados bancários do cliente

Existe endpoint para **consultar os dados bancários** cadastrados no cliente (aba "Dados Bancários" do Cadastro de Clientes — banco, titular, conta, observações)? Não encontramos essa rota na documentação nem no retorno do `GET /cliente`. Se existir, poderiam indicar o caminho e os parâmetros?

## 2. Upload de anexos de cliente/negociação

Os endpoints `GET /cliente_anexos` e `GET /negocio_anexos` funcionam perfeitamente (inclusive com as URLs pré-assinadas para download). Existe rota para **enviar anexos avulsos** a um cliente ou a uma negociação via API? Vimos o fluxo **InCorp** (`incorp_url_post` → upload S3 → `incorp` → `incorp_contexto` → `incorp_documento`), mas ele parece específico para importação de documentos/propostas — se ele também atender anexos avulsos de cliente/negociação, poderiam confirmar o uso correto?

---

Obrigado!

**Tiago Donicht** — u4digital
*(em nome de Marcel Foletto — Marca Corretora de Seguros)*

---

## Anexo — Histórico resolvido (não enviar, referência interna)

- ~~POST /negocio retornava 500 "Negócio não inserido"~~ → **RESOLVIDO 2026-07-09** via doc oficial: além dos campos de negócio, o payload exige `etapa` (1), `status` (0), `prioridade` (3), `datinc` ("dd/mm/yyyy hh:mm"), `datalt` ("dd/mm/yyyy") e `campo_base_r` (5 = Com. Corretora). Sucesso: 201 `{ "message": "Negócio inserido.", "codigo_negocio": N }`. `DELETE /negocio?codfil=1&codigo=N` também validado.
