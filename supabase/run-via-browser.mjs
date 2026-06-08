import { chromium } from '/Users/moronireis/Projetos vscode/funnil-hacker/node_modules/playwright/index.mjs';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER = 'supabase';
const PASS = 'QQmtFmou758DDnL';
const BASE = 'https://weirdpigeon-supabase.cloudfy.live';

const parts = [
  { name: 'Part 1: Tables', file: 'setup-part1-tables.sql' },
  { name: 'Part 2: Functions', file: 'setup-part2-functions.sql' },
  { name: 'Part 3: Seeds', file: 'setup-part3-seeds.sql' },
];

async function runSQL(page, sql, name) {
  // Set SQL in Monaco
  await page.evaluate((s) => { (window).monaco.editor.getEditors()[0].setValue(s); }, sql);
  await page.waitForTimeout(500);

  // Click Run
  await page.locator('button:has-text("Run")').last().click();
  await page.waitForTimeout(2000);

  // Handle confirmation modal
  const confirmBtn = page.locator('button:has-text("Run this query")');
  if (await confirmBtn.count() > 0) {
    await confirmBtn.click();
    await page.waitForTimeout(1000);
  }

  // Wait for result
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(2000);
    const text = await page.locator('body').textContent();
    const running = text.includes('running queries');
    const success = text.includes('Success') || text.includes('rows');
    const hasError = text.match(/ERROR[:\s][^\n]{0,100}/i)?.[0];

    if (success) {
      console.log(`  ${name}: SUCCESS`);
      return true;
    }
    if (hasError && !running) {
      console.log(`  ${name}: ERROR — ${hasError.slice(0, 80)}`);
      await page.screenshot({ path: `/tmp/sb-${name.replace(/\s/g, '-')}.png` });
      return false;
    }
    if (!running && i > 3) {
      // Check if result panel shows anything
      console.log(`  ${name}: Completed (no explicit success/error)`);
      return true;
    }
  }
  console.log(`  ${name}: Timeout`);
  return false;
}

async function run() {
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
  await page.waitForFunction(() => typeof (window).monaco !== 'undefined', { timeout: 15000 });
  console.log('Monaco ready\n');

  for (const part of parts) {
    const sql = readFileSync(join(__dirname, part.file), 'utf-8');
    console.log(`Running ${part.name} (${sql.length} chars)...`);
    await runSQL(page, sql, part.name);
    await page.waitForTimeout(2000);
  }

  // Verify
  console.log('\nVerifying tables...');
  await page.evaluate((s) => { (window).monaco.editor.getEditors()[0].setValue(s); },
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'marpe_%' ORDER BY tablename;");
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Run")').last().click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/sb-verify.png' });

  await browser.close();
  console.log('Done!');
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
