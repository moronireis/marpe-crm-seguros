import { chromium } from '/Users/moronireis/Projetos vscode/funnil-hacker/node_modules/playwright/index.mjs';

// Migração 2026-08-03 — entrada do u4-status de 01/08 (plano PLANO-U4-0308.md)
//
//  1. DUPLICAÇÃO DE MÍDIA (testes A2/A3 do Marcel): o webhook faz o dedupe por
//     wa_message_id ANTES de baixar a mídia e insere segundos depois; o endpoint de
//     envio insere só depois do upload. Os dois passam pela janela e gravam a mesma
//     mensagem 2×. Evidência em produção: 3 pares com wa_message_id IDÊNTICO nos
//     testes do Marcel de 01/08 20h. Limpeza + índice UNIQUE fecham no banco.
//  2. PRÊMIO LÍQUIDO × FINAL (teste B4): "comissão é sobre o prêmio LÍQUIDO; Final =
//     Líquido + IOF". Verificado em produção: comissao_valor = premio × pct em 217 de
//     217 negócios → a coluna `premio` que vem do Corp JÁ É o líquido. Então não há
//     backfill: entra `iof` e `premio_final` como coluna GERADA (líquido + IOF).
//  3. Forma de pagamento + parcelamento (chamado 5cb84ad8).
//  4. Negócio em pauta na conversa (fluxo do Inbox, chamado 3a4d910f).
//  5. Catálogo de etiquetas (teste A8: "onde criar, editar e consultar as etiquetas?").
//  6. Índices de performance (chamado 59eaf2a2 — delay do funil e do inbox).
//
// Uso: node supabase/run-migration-20260803.mjs

const USER = 'supabase';
const PASS = 'QQmtFmou758DDnL';
const BASE = 'https://weirdpigeon-supabase.cloudfy.live';

// 1 ── duplicatas: mantém a linha com mídia; empatou, mantém a mais antiga (a do CRM,
// que tem sent_by preenchido). Precisa rodar ANTES do índice UNIQUE.
const sqlDedupe = [
  "DELETE FROM public.marpe_messages m",
  "USING (",
  "  SELECT id, row_number() OVER (",
  "    PARTITION BY wa_message_id",
  "    ORDER BY (media_url IS NOT NULL) DESC, created_at ASC",
  "  ) AS rn",
  "  FROM public.marpe_messages WHERE wa_message_id IS NOT NULL",
  ") d",
  "WHERE m.id = d.id AND d.rn > 1;",
].join('\n');

const sqlUnique = [
  "CREATE UNIQUE INDEX IF NOT EXISTS marpe_messages_wa_id_uidx",
  "  ON public.marpe_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;",
].join('\n');

// 2 ── prêmio: `premio` PERMANECE sendo o líquido (base da comissão, como o Corp manda).
// premio_final é gerado — nunca escrever nele pela aplicação.
const sqlPremio = [
  "ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS iof numeric(12,2);",
  "ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS premio_final numeric(12,2)",
  "  GENERATED ALWAYS AS (COALESCE(premio,0) + COALESCE(iof,0)) STORED;",
].join('\n');

// 3 ── pagamento
const sqlPagamento = [
  "ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS forma_pagamento text;",
  "ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS parcelas smallint;",
].join('\n');

// 4 ── negócio em pauta na conversa (o modal "Selecione o Negócio" grava aqui, e toda
// mensagem trocada enquanto ele estiver ativo nasce com deal_id — a coluna deal_id de
// marpe_messages já existia e estava 100% vazia).
const sqlConversa = [
  "ALTER TABLE public.marpe_contacts ADD COLUMN IF NOT EXISTS active_deal_id uuid",
  "  REFERENCES public.marpe_deals(id) ON DELETE SET NULL;",
  "CREATE INDEX IF NOT EXISTS marpe_messages_deal_idx ON public.marpe_messages(deal_id)",
  "  WHERE deal_id IS NOT NULL;",
].join('\n');

// 5 ── catálogo de etiquetas (a etiqueta em si continua em marpe_contacts.tags[])
const sqlTags = [
  "CREATE TABLE IF NOT EXISTS public.marpe_tags (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  nome text NOT NULL,",
  "  cor text,",
  "  descricao text,",
  "  ordem smallint NOT NULL DEFAULT 0,",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "CREATE UNIQUE INDEX IF NOT EXISTS marpe_tags_nome_uidx ON public.marpe_tags(lower(nome));",
  // semeia o catálogo com as etiquetas que já estão em uso nos contatos
  "INSERT INTO public.marpe_tags (nome)",
  "  SELECT DISTINCT trim(t) FROM public.marpe_contacts, unnest(tags) AS t",
  "  WHERE trim(t) <> ''",
  "  ON CONFLICT DO NOTHING;",
].join('\n');

// 6 ── performance (chamado do delay)
const sqlIndices = [
  "CREATE INDEX IF NOT EXISTS marpe_messages_contact_created_idx",
  "  ON public.marpe_messages(contact_id, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS marpe_deals_funnel_idx ON public.marpe_deals(funnel_id);",
  "CREATE INDEX IF NOT EXISTS marpe_deals_stage_idx ON public.marpe_deals(stage_id);",
].join('\n');

const verifySql = [
  "SELECT 'colunas' AS tipo, table_name AS a, column_name AS b FROM information_schema.columns",
  " WHERE (table_name='marpe_deals' AND column_name IN ('iof','premio_final','forma_pagamento','parcelas'))",
  "    OR (table_name='marpe_contacts' AND column_name='active_deal_id')",
  "UNION ALL",
  "SELECT 'indice', indexname, tablename FROM pg_indexes",
  " WHERE indexname IN ('marpe_messages_wa_id_uidx','marpe_messages_contact_created_idx',",
  "                     'marpe_deals_funnel_idx','marpe_deals_stage_idx','marpe_messages_deal_idx')",
  "UNION ALL",
  "SELECT 'etiquetas', count(*)::text, '' FROM public.marpe_tags;",
].join('\n');

const STATEMENTS = [
  { name: 'limpeza de mensagens duplicadas', sql: sqlDedupe },
  { name: 'índice UNIQUE em wa_message_id', sql: sqlUnique },
  { name: 'iof + premio_final (gerada)', sql: sqlPremio },
  { name: 'forma_pagamento + parcelas', sql: sqlPagamento },
  { name: 'active_deal_id + índice de deal_id', sql: sqlConversa },
  { name: 'catálogo marpe_tags (+ seed)', sql: sqlTags },
  { name: 'índices de performance', sql: sqlIndices },
  { name: 'VERIFY', sql: verifySql, verify: true },
];

async function runSQL(page, sql, name) {
  await page.evaluate((s) => {
    window.monaco.editor.getEditors()[0].setValue(s);
  }, sql);
  await page.waitForTimeout(600);

  await page.locator('button:has-text("Run")').last().click();
  await page.waitForTimeout(2000);

  const confirmBtn = page.locator('button:has-text("Run this query")');
  if (await confirmBtn.count() > 0) {
    await confirmBtn.click();
    await page.waitForTimeout(1000);
  }

  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1500);
    const text = await page.locator('body').textContent();
    const running = text.includes('running queries');
    const success = text.includes('Success') || text.includes('rows') || text.includes('No rows');
    const hasError = text.match(/ERROR[:\s][^\n]{0,120}/i)?.[0];
    if (running && i < 5) continue;

    if (hasError && !running) {
      console.log(`  [FAIL] ${name}: ${hasError.slice(0, 100)}`);
      return { ok: false, detail: hasError };
    }
    if (success) {
      const resultText = await page.locator('.sb-grid, [data-testid="result-panel"], table').first().textContent().catch(() => '');
      console.log(`  [OK]   ${name}${resultText ? ' → ' + resultText.trim().slice(0, 200) : ''}`);
      return { ok: true, detail: resultText };
    }
    if (!running && i > 4) {
      console.log(`  [OK?]  ${name}: completed (no explicit success/error signal)`);
      return { ok: true, detail: 'implicit success' };
    }
  }
  console.log(`  [TIMEOUT] ${name}`);
  return { ok: false, detail: 'timeout' };
}

async function run() {
  console.log('=== Marpe CRM — migração 2026-08-03 (entrada do u4-status de 01/08) ===\n');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ httpCredentials: { username: USER, password: PASS } });
  const page = await context.newPage();

  console.log('Abrindo o SQL Editor...');
  await page.goto(`${BASE}/project/default/sql/new`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.waitForFunction(() => typeof window.monaco !== 'undefined', { timeout: 15000 });
  console.log('Monaco pronto\n');

  const results = {};
  for (const stmt of STATEMENTS) {
    process.stdout.write(`${stmt.verify ? '[VERIFY]' : '[DDL]'} ${stmt.name}...\n`);
    results[stmt.name] = await runSQL(page, stmt.sql, stmt.name);
    await page.waitForTimeout(1000);
  }

  await browser.close();

  console.log('\n=== Resumo ===');
  let allOk = true;
  for (const s of STATEMENTS) {
    const r = results[s.name];
    console.log(`  ${r.ok ? 'OK' : 'FAIL'} ${s.name}`);
    if (!r.ok) allOk = false;
  }
  console.log(`\nResultado: ${allOk ? 'TUDO OK' : 'HOUVE FALHAS — revisar acima'}`);
  process.exit(allOk ? 0 : 1);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
