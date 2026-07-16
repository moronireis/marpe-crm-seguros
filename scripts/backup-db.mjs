// Backup das tabelas deal-scoped do Marpe CRM (as que uma exclusão de deal
// remove/cascateia) + settings. Exporta JSON por tabela + manifest.
//
// Uso:  node scripts/backup-db.mjs <pasta-destino>
// Lê PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do ambiente ou do .env local.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';

// Carrega .env se as vars não estiverem no ambiente (formato KEY="valor")
if (!process.env.PUBLIC_SUPABASE_URL && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const URL_ = process.env.PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não encontrados (env ou .env).');
  process.exit(1);
}

const DEST = process.argv[2];
if (!DEST) { console.error('Uso: node scripts/backup-db.mjs <pasta-destino>'); process.exit(1); }
mkdirSync(DEST, { recursive: true });

const TABLES = [
  ['marpe_deals', 'id'],
  ['marpe_deal_activities', 'id'],
  ['marpe_deal_notes', 'id'],
  ['marpe_deal_documents', 'id'],
  ['marpe_installments', 'id'],
  ['marpe_settings', 'key'],
];

const manifest = { created_at: new Date().toISOString(), tables: {} };

for (const [table, orderCol] of TABLES) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=*&order=${orderCol}`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok && res.status !== 206 && res.status !== 416) {
      console.error(`${table}: HTTP ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    if (res.status === 416) break; // range além do fim
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  writeFileSync(`${DEST}/${table}.json`, JSON.stringify(rows));
  manifest.tables[table] = rows.length;
  console.log(`${table}: ${rows.length} linhas`);
}

writeFileSync(`${DEST}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log('Backup completo em', DEST);
