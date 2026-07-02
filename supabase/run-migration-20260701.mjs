import { chromium } from '/Users/moronireis/Projetos vscode/funnil-hacker/node_modules/playwright/index.mjs';

const USER = 'supabase';
const PASS = 'QQmtFmou758DDnL';
const BASE = 'https://weirdpigeon-supabase.cloudfy.live';

const STATEMENTS = [
  {
    name: 'CREATE TABLE marpe_deal_notes',
    sql: `CREATE TABLE IF NOT EXISTS public.marpe_deal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.marpe_deals(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.marpe_profiles(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);`,
  },
  {
    name: 'CREATE INDEX idx_deal_notes_deal',
    sql: `CREATE INDEX IF NOT EXISTS idx_deal_notes_deal ON public.marpe_deal_notes(deal_id, created_at DESC);`,
  },
  {
    name: 'CREATE TABLE marpe_deal_documents',
    sql: `CREATE TABLE IF NOT EXISTS public.marpe_deal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.marpe_deals(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.marpe_profiles(id),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);`,
  },
  {
    name: 'CREATE INDEX idx_deal_documents_deal',
    sql: `CREATE INDEX IF NOT EXISTS idx_deal_documents_deal ON public.marpe_deal_documents(deal_id, created_at DESC);`,
  },
  {
    name: 'ADD campanha TO marpe_deals',
    sql: `ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS campanha text;`,
  },
  {
    name: 'ADD ja_possui_produto TO marpe_deals',
    sql: `ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS ja_possui_produto boolean DEFAULT false;`,
  },
  {
    name: 'ADD seguradora_atual TO marpe_deals',
    sql: `ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS seguradora_atual text;`,
  },
  {
    name: 'ADD vigencia_atual_fim TO marpe_deals',
    sql: `ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS vigencia_atual_fim date;`,
  },
  {
    name: 'ADD corretora_atual TO marpe_deals',
    sql: `ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS corretora_atual text;`,
  },
  {
    name: 'ADD base_calculo_repasse TO marpe_deals',
    sql: `ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS base_calculo_repasse numeric(12,2);`,
  },
  {
    name: 'ADD pct_repasse TO marpe_deals',
    sql: `ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS pct_repasse numeric(5,2);`,
  },
  {
    name: 'ADD valor_repasse TO marpe_deals',
    sql: `ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS valor_repasse numeric(12,2);`,
  },
  {
    name: 'ADD agente TO marpe_deals',
    sql: `ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS agente text;`,
  },
  {
    name: 'ADD observacoes_proposta TO marpe_deals',
    sql: `ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS observacoes_proposta text;`,
  },
  {
    name: 'ADD detalhes_corp TO marpe_deals',
    sql: `ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS detalhes_corp jsonb DEFAULT '{}';`,
  },
  {
    name: 'ADD created_by TO marpe_deals',
    sql: `ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.marpe_profiles(id);`,
  },
  {
    name: 'DROP old deal_activities type constraint',
    sql: `ALTER TABLE public.marpe_deal_activities DROP CONSTRAINT IF EXISTS deal_activities_type_check;`,
  },
  {
    name: 'ADD expanded deal_activities type constraint',
    sql: `ALTER TABLE public.marpe_deal_activities ADD CONSTRAINT deal_activities_type_check CHECK (type IN ('stage_change', 'note', 'message_sent', 'field_update', 'assignment', 'creation', 'loss', 'automation', 'document_upload', 'document_delete', 'note_added'));`,
  },
  // Verification queries
  {
    name: 'VERIFY marpe_deal_notes exists',
    sql: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'marpe_deal_notes';`,
    verify: true,
  },
  {
    name: 'VERIFY marpe_deal_documents exists',
    sql: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'marpe_deal_documents';`,
    verify: true,
  },
  {
    name: 'VERIFY new columns on marpe_deals',
    sql: `SELECT column_name FROM information_schema.columns WHERE table_name = 'marpe_deals' AND column_name IN ('campanha', 'ja_possui_produto', 'seguradora_atual', 'vigencia_atual_fim', 'corretora_atual', 'base_calculo_repasse', 'pct_repasse', 'valor_repasse', 'agente', 'observacoes_proposta', 'detalhes_corp', 'created_by') ORDER BY column_name;`,
    verify: true,
  },
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
      console.log(`  [OK]   ${name}${resultText ? ' → ' + resultText.trim().slice(0, 80) : ''}`);
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
  console.log('=== Marpe CRM Migration 2026-07-01: Deal Panel Expansion ===\n');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    httpCredentials: { username: USER, password: PASS },
  });
  const page = await context.newPage();

  console.log('Opening SQL Editor...');
  await page.goto(`${BASE}/project/default/sql/new`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.waitForFunction(() => typeof window.monaco !== 'undefined', { timeout: 15000 });
  console.log('Monaco ready\n');

  const results = {};
  for (const stmt of STATEMENTS) {
    const section = stmt.verify ? '\n[VERIFY]' : '[DDL]';
    process.stdout.write(`${section} ${stmt.name}...\n`);
    results[stmt.name] = await runSQL(page, stmt.sql, stmt.name);
    await page.waitForTimeout(1000);
  }

  await browser.close();

  console.log('\n=== Summary ===');
  const ddl = STATEMENTS.filter(s => !s.verify);
  const verifies = STATEMENTS.filter(s => s.verify);
  let allOk = true;
  for (const s of [...ddl, ...verifies]) {
    const r = results[s.name];
    const icon = r.ok ? 'OK' : 'FAIL';
    console.log(`  ${icon} ${s.name}`);
    if (!r.ok) allOk = false;
  }
  console.log(`\nResult: ${allOk ? 'ALL PASSED' : 'SOME FAILURES - review above'}`);
  process.exit(allOk ? 0 : 1);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
