# Credenciais — Marpe CRM Seguros

> ⚠️ **CONFIDENCIAL** — este arquivo só pode existir em repositório PRIVADO.
> Se o repositório vazar ou for tornado público, rotacionar TODAS as chaves abaixo
> (Supabase service key, token UazapiGO, senha Corp, WEBHOOK_KEY/CRON_SECRET e senhas de app).
>
> Última atualização: 15/07/2026

---

## 1. Aplicação (login no CRM)

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Admin (Marcel) | admin@marpe.com.br | Marpe@2026! |
| Admin de teste (dev/QA) | admin@admin.com | admin |

URL de produção: https://marpe-crm-seguros.vercel.app

## 2. Supabase (banco de dados — hospedado na Cloudfy)

| Item | Valor |
|------|-------|
| URL do projeto | https://weirdpigeon-supabase.cloudfy.live |
| `PUBLIC_SUPABASE_URL` | https://weirdpigeon-supabase.cloudfy.live |
| `PUBLIC_SUPABASE_ANON_KEY` | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzczNzY4NTE2LCJleHAiOjE4MDUzMDQ1MTZ9.zOD4Q5UJStzMrjaAeRT13i0wfemPl8SmP3DOMKfqrYs |
| `SUPABASE_SERVICE_ROLE_KEY` | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzM3Njg1MTYsImV4cCI6MTgwNTMwNDUxNn0.Hziwx8ocWnFVLHvt5DhT8nTkL2XVMa58ofjL-0hCMxw |
| Studio SQL Editor (basic auth do navegador) | usuário `supabase` / senha `QQmtFmou758DDnL` |

- **DDL (migrações)**: o WAF da Cloudfy bloqueia DDL via API — usar os runners Playwright
  (`node supabase/run-migration-YYYYMMDD.mjs`), que abrem o Studio com o basic auth acima.
- 22+ tabelas, todas com prefixo `marpe_`. Schema base em `supabase/schema.sql` + `supabase/migrations/`.

## 3. UazapiGO (WhatsApp)

| Item | Valor |
|------|-------|
| `UAZAPI_URL` | https://u4digital.uazapi.com |
| `UAZAPI_TOKEN` | dea2592d-da3c-4209-9319-de06778d222b |
| Instância | Marpe-Homologa |
| Webhook (recebe mensagens) | https://marpe-crm-seguros.vercel.app/api/webhook/whatsapp |
| Eventos assinados | `messages`, `messages_groups` |

## 4. Corp Nuvem / Agia (ERP da corretora)

| Item | Valor |
|------|-------|
| `CORP_API_URL` | https://api.corpnuvem.com |
| `CORP_API_EMAIL` | api@marpe.com.br |
| `CORP_API_PASSWORD` | m@rp3API |
| Documentação oficial (Postman) | https://documenter.getpostman.com/view/33455116/2sAYkBrLmi |

- Login `POST /login` → token Bearer com validade de 3 dias (o client renova após 2).
- Credenciais são do ambiente do Marcel — qualquer escrita atinge dados reais da corretora.

## 5. Segredos internos da aplicação

| Item | Valor | Uso |
|------|-------|-----|
| `WEBHOOK_KEY` | marpe2026 | Header `x-webhook-key` que autoriza os endpoints `/api/internal/*` (crons externos, webhook) |
| `CRON_SECRET` | bd586356330ce2c17279951c4a5b6271d1ac2f358e765c5326d3b99511a81170 | Enviado pela Vercel como `Authorization: Bearer` nos crons nativos |

## 6. Vercel (deploy)

| Item | Valor |
|------|-------|
| Conta/Team | moronifreis-gmailcoms-projects (plano **Hobby**) |
| Projeto | marpe-crm-seguros (`prj_LYDl8aJs8jnGnPp8jHmiMhywcGBE`) |
| Domínio | https://marpe-crm-seguros.vercel.app |
| Deploy | `npx vercel deploy --prod` (manual, sem auto-deploy por git) |

Env vars de produção = seções 2–5 deste arquivo (conferir com `npx vercel env ls`).
**Atenção (plano Hobby)**: cron sub-diário não roda na Vercel — ver seção 7.

## 7. GitHub Actions (cron diurno de sync)

| Item | Valor |
|------|-------|
| Repo que executa o cron | github.com/moronireis/marpe-crm-seguros (workflow `corp-sync-diurno.yml`) |
| Secret necessário | `MARPE_WEBHOOK_KEY` = valor de `WEBHOOK_KEY` (seção 5) |
| Agenda | `*/30 11-23 UTC, seg–sáb` (= 8h–20h30 BRT) |

O espelho `u4digital/Marpe-Project` tem o mesmo workflow **desabilitado** para não duplicar
o sync. Se o cron mudar de repositório: desabilitar no antigo, `gh secret set MARPE_WEBHOOK_KEY`
e habilitar o workflow no novo.

## 8. Repositórios git

| Remote | URL | Papel |
|--------|-----|-------|
| origin | git@github.com:moronireis/marpe-crm-seguros.git | Desenvolvimento (crons ativos) |
| u4digital | https://github.com/u4digital/Marpe-Project.git | Espelho/entrega u4digital |
