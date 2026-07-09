# Solicitação à Agia (Corp Nuvem) — API de Integração

> Gerado em 2026-07-09. Pronto para o Tiago enviar por e-mail ao suporte/TI da Agia.
> Contexto: integração do CRM da Marca Corretora de Seguros com a API api.corpnuvem.com.

---

**Para:** Suporte / TI — Agia (Corp Nuvem)
**Assunto:** API Corp Nuvem — especificação do POST /negocio, dados bancários e upload de anexos

---

Olá, equipe Agia,

Somos a equipe de tecnologia que atende a **Marca Corretora de Seguros** (Marcel Foletto, São Sepé/RS). Estamos integrando o CRM da corretora à API do Corp Nuvem (`api.corpnuvem.com`), autenticando com as credenciais do próprio cliente.

A integração de leitura está funcionando muito bem (clientes, negócios em andamento, ramos, seguradoras, produtores, atendimentos e anexos), e a criação de clientes via `POST /cliente` + `/telefone` + `/endereco` + `/email` também está operacional.

Precisamos de apoio em três pontos:

## 1. POST /negocio — especificação do payload

Ao criar negociações via API, o endpoint retorna sempre **HTTP 500 "Negócio não inserido"**, mesmo enviando payloads que espelham campo a campo negociações criadas na interface do Corp (validamos os nomes dos campos contra o retorno do `GET /negocio`). Exemplo simplificado do que testamos:

```json
{
  "codfil": 1,
  "codcli": 440,
  "codram": 3,
  "codcia": 39,
  "tipo": 1,
  "val_premio": 800,
  "per_c": 10,
  "observacoes": "Teste de integração"
}
```

Poderiam nos enviar a **especificação do payload** (campos obrigatórios, formatos e valores esperados) ou um **exemplo funcional de requisição**? Esse é o único ponto que bloqueia a gravação de negócios pelo CRM em ambos os sistemas.

## 2. Dados bancários do cliente

Existe endpoint para **consultar os dados bancários** cadastrados no cliente (aba "Dados Bancários" do Cadastro de Clientes — banco, titular, conta, observações)? Não localizamos essa rota na API. Se existir, poderiam indicar o caminho e os parâmetros?

## 3. Upload de anexos

Os endpoints `GET /cliente_anexos` e `GET /negocio_anexos` funcionam perfeitamente (inclusive com as URLs pré-assinadas para download). Existe rota para **enviar anexos via API** (para cliente e/ou negociação)? O preflight OPTIONS indica apenas GET nesses caminhos.

---

**Bônus:** se houver documentação geral da API (PDF, Swagger/OpenAPI ou portal do desenvolvedor), agradecemos muito o compartilhamento — reduziria o vai-e-vem com o suporte.

Obrigado!

**Tiago Donicht** — u4digital
*(em nome de Marcel Foletto — Marca Corretora de Seguros)*
