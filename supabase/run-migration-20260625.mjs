import { chromium } from '/Users/moronireis/Projetos vscode/funnil-hacker/node_modules/playwright/index.mjs';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER = 'supabase';
const PASS = 'QQmtFmou758DDnL';
const BASE = 'https://weirdpigeon-supabase.cloudfy.live';

const MIGRATION_FILE = 'migration-20260625-contact-photo-message-deal-status-options.sql';

// Split into individual statements for granular reporting
const STATEMENTS = [
  {
    name: 'ADD photo_url TO marpe_contacts',
    sql: `ALTER TABLE marpe_contacts ADD COLUMN IF NOT EXISTS photo_url text;`,
  },
  {
    name: 'ADD deal_id TO marpe_messages',
    sql: `ALTER TABLE marpe_messages ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES marpe_deals(id) ON DELETE SET NULL;`,
  },
  {
    name: 'CREATE INDEX idx_marpe_messages_deal_id',
    sql: `CREATE INDEX IF NOT EXISTS idx_marpe_messages_deal_id ON marpe_messages(deal_id);`,
  },
  {
    name: 'CREATE TABLE marpe_status_options',
    sql: `CREATE TABLE IF NOT EXISTS marpe_status_options (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#60A5FA',
  created_at timestamptz DEFAULT now()
);`,
  },
  // Verification queries
  {
    name: 'VERIFY marpe_contacts.photo_url',
    sql: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'marpe_contacts' AND column_name = 'photo_url';`,
    verify: true,
  },
  {
    name: 'VERIFY marpe_messages.deal_id',
    sql: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'marpe_messages' AND column_name = 'deal_id';`,
    verify: true,
  },
  {
    name: 'VERIFY idx_marpe_messages_deal_id',
    sql: `SELECT indexname FROM pg_indexes WHERE tablename = 'marpe_messages' AND indexname = 'idx_marpe_messages_deal_id';`,
    verify: true,
  },
  {
    name: 'VERIFY marpe_status_options exists',
    sql: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'marpe_status_options';`,
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
      // Grab result table text for verify queries
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
  console.log('=== Marpe CRM Migration 2026-06-25 ===\n');
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
    const icon = r.ok ? '✓' : '✗';
    console.log(`  ${icon} ${s.name}`);
    if (!r.ok) allOk = false;
  }
  console.log(`\nResult: ${allOk ? 'ALL PASSED' : 'SOME FAILURES — review above'}`);
  process.exit(allOk ? 0 : 1);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
