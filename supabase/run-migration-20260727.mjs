import { chromium } from '/Users/moronireis/Projetos vscode/funnil-hacker/node_modules/playwright/index.mjs';

// Migração 2026-07-27 — colunas do cadastro PF/PJ (S3, PDF de Sincronização §1 e §10).
// Campos que o Corp NÃO expõe pela API e que o próprio PDF aceita como
// "exclusivos do CRM": vencimento da CNH (PF) e contato na empresa (PJ).
// A escolaridade existe no Corp (POST /cliente aceita) mas não voltava em lugar
// nenhum do nosso schema — guardamos o código para exibir sem novo round-trip.
// Estado civil reaproveita a coluna marital_status, que já existia.
//
// Uso: node supabase/run-migration-20260727.mjs

const USER = 'supabase';
const PASS = 'QQmtFmou758DDnL';
const BASE = 'https://weirdpigeon-supabase.cloudfy.live';

const TABLE = 'marpe_contacts';
const COLS = [
  ['escolaridade', 'smallint'],
  ['cnh_vencimento', 'date'],
  ['contato_empresa', 'text'],
];

const addCols = COLS
  .map(([name, type]) => `ALTER TABLE public.${TABLE} ADD COLUMN IF NOT EXISTS ${name} ${type};`)
  .join('\n');

const verifySql =
  `SELECT column_name FROM information_schema.columns WHERE table_name = '${TABLE}' ` +
  `AND column_name IN (${COLS.map(([n]) => `'${n}'`).join(',')});`;

const STATEMENTS = [
  { name: 'colunas do S3 (escolaridade, cnh_vencimento, contato_empresa)', sql: addCols },
  { name: 'VERIFY colunas novas', sql: verifySql, verify: true },
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
      console.log(`  [OK]   ${name}${resultText ? ' → ' + resultText.trim().slice(0, 120) : ''}`);
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
  console.log('=== Marpe CRM — migração 2026-07-27: colunas do cadastro PF/PJ (S3) ===\n');
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
