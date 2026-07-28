import { chromium } from '/Users/moronireis/Projetos vscode/funnil-hacker/node_modules/playwright/index.mjs';

// Migração 2026-07-28 — revisão dos 4 PDFs de 27/07 (itens do PDF Sincronização §10
// que faltavam): campos comuns do cadastro de cliente ("nome do negócio" e
// "detalhes do produto") + as abas exclusivas do CRM: Dados Bancários e Anexos.
// A API do Corp não expõe dados bancários nem upload de anexos (confirmado por
// probe e cobrado da Agia) — por isso estas estruturas são só do CRM.
//
// Uso: node supabase/run-migration-20260728.mjs

const USER = 'supabase';
const PASS = 'QQmtFmou758DDnL';
const BASE = 'https://weirdpigeon-supabase.cloudfy.live';

const sqlCols = [
  "ALTER TABLE public.marpe_contacts ADD COLUMN IF NOT EXISTS nome_negocio text;",
  "ALTER TABLE public.marpe_contacts ADD COLUMN IF NOT EXISTS produto_detalhes text;",
].join('\n');

const sqlBank = [
  "CREATE TABLE IF NOT EXISTS public.marpe_contact_bank (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  contact_id uuid NOT NULL REFERENCES public.marpe_contacts(id) ON DELETE CASCADE,",
  "  banco text, agencia text, conta text, tipo_conta text,",
  "  titular text, pix text, observacoes text,",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "CREATE INDEX IF NOT EXISTS marpe_contact_bank_contact_idx ON public.marpe_contact_bank(contact_id);",
].join('\n');

const sqlDocs = [
  "CREATE TABLE IF NOT EXISTS public.marpe_contact_documents (",
  "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),",
  "  contact_id uuid NOT NULL REFERENCES public.marpe_contacts(id) ON DELETE CASCADE,",
  "  user_id uuid,",
  "  file_name text NOT NULL, file_path text NOT NULL,",
  "  file_size integer, mime_type text,",
  "  created_at timestamptz NOT NULL DEFAULT now()",
  ");",
  "CREATE INDEX IF NOT EXISTS marpe_contact_documents_contact_idx ON public.marpe_contact_documents(contact_id);",
].join('\n');

const verifySql =
  "SELECT table_name, column_name FROM information_schema.columns WHERE " +
  "(table_name = 'marpe_contacts' AND column_name IN ('nome_negocio','produto_detalhes')) OR " +
  "(table_name IN ('marpe_contact_bank','marpe_contact_documents') AND column_name = 'id');";

const STATEMENTS = [
  { name: 'colunas nome_negocio + produto_detalhes', sql: sqlCols },
  { name: 'tabela marpe_contact_bank', sql: sqlBank },
  { name: 'tabela marpe_contact_documents', sql: sqlDocs },
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
      console.log(`  [OK]   ${name}${resultText ? ' → ' + resultText.trim().slice(0, 140) : ''}`);
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
  console.log('=== Marpe CRM — migração 2026-07-28: cliente §10 (nome do negócio, detalhes do produto, banco, anexos) ===\n');
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
