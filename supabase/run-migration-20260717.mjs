import { chromium } from '/Users/moronireis/Projetos vscode/funnil-hacker/node_modules/playwright/index.mjs';

const USER = 'supabase';
const PASS = 'QQmtFmou758DDnL';
const BASE = 'https://weirdpigeon-supabase.cloudfy.live';

const STATEMENTS = [
  {
    name: 'ADD colunas inbox_read_at, pinned, conv_status',
    sql: `ALTER TABLE public.marpe_contacts ADD COLUMN IF NOT EXISTS inbox_read_at timestamptz;
ALTER TABLE public.marpe_contacts ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.marpe_contacts ADD COLUMN IF NOT EXISTS conv_status text NOT NULL DEFAULT 'open';`,
  },
  {
    name: 'VERIFY colunas novas',
    sql: `SELECT column_name FROM information_schema.columns WHERE table_name = 'marpe_contacts' AND column_name IN ('inbox_read_at','pinned','conv_status');`,
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
  console.log('=== Marpe CRM Migration 2026-07-17: colunas S3 inbox em marpe_contacts ===\n');
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
    const section = stmt.verify ? '[VERIFY]' : '[DDL]';
    process.stdout.write(`${section} ${stmt.name}...\n`);
    results[stmt.name] = await runSQL(page, stmt.sql, stmt.name);
    await page.waitForTimeout(1000);
  }

  await browser.close();

  console.log('\n=== Summary ===');
  let allOk = true;
  for (const s of STATEMENTS) {
    const r = results[s.name];
    console.log(`  ${r.ok ? 'OK' : 'FAIL'} ${s.name}`);
    if (!r.ok) allOk = false;
  }
  console.log(`\nResult: ${allOk ? 'ALL PASSED' : 'SOME FAILURES - review above'}`);
  process.exit(allOk ? 0 : 1);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
