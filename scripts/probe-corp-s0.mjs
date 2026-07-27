#!/usr/bin/env node
/**
 * S0 — Probes na CorpAPI (plano 27/07)
 *
 * Descobre o que a API realmente permite ANTES de comprometer escopo dos sprints.
 * Esta rodada é NÃO-DESTRUTIVA: só GET e OPTIONS. Nenhum POST/PUT/PATCH/DELETE.
 *
 *   node scripts/probe-corp-s0.mjs            # roda tudo
 *   node scripts/probe-corp-s0.mjs --json     # saída JSON (para o relatório)
 *
 * Leitura do resultado:
 *   200        rota existe e responde
 *   4xx/5xx    rota EXISTE (o gateway deixou passar) mas o payload/param está errado
 *   403 "Credential parameter"  → rota NÃO existe (AWS Gateway rejeita antes)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const URL_BASE = env.CORP_API_URL || 'https://api.corpnuvem.com';
const JSON_OUT = process.argv.includes('--json');
const results = [];
let token = null;

const log = (...a) => { if (!JSON_OUT) console.log(...a); };

async function login() {
  for (let i = 1; i <= 3; i++) {
    const res = await fetch(`${URL_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.CORP_API_EMAIL, senha: env.CORP_API_PASSWORD, aplicacao: 0 }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e.message) }));
    if (res.ok) {
      const d = await res.json();
      token = d.token;
      return true;
    }
    await new Promise((r) => setTimeout(r, i * 2000));
  }
  return false;
}

/** Classifica a resposta: rota existe?
 *  O AWS API Gateway rejeita rota desconhecida ANTES do backend, com
 *  403 "Authorization header requires 'Credential' parameter" — é o tell de rota inexistente.
 *  Rota real devolve 200/4xx/5xx do backend Corp. */
function classify(status, body) {
  const s = typeof body === 'string' ? body : JSON.stringify(body || '');
  if (status === 403 && /'?Credential'? parameter|not a valid key/i.test(s)) return 'INEXISTENTE';
  if (status === 200 || status === 201) return 'OK';
  if (status === 404 && /não encontrad|nenhum/i.test(s)) return 'OK (vazio)';
  return 'EXISTE (erro)';
}

async function probe(method, path, params = {}, note = '') {
  const url = new URL(URL_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  let status = 0;
  let body = null;
  try {
    const res = await fetch(url.toString(), {
      method,
      headers: { Authorization: token, 'Content-Type': 'application/json' },
    });
    status = res.status;
    const txt = await res.text();
    try { body = JSON.parse(txt); } catch { body = txt.slice(0, 300); }
  } catch (e) {
    body = String(e.message);
  }
  const verdict = method === 'OPTIONS'
    ? (status === 200 ? 'OK' : classify(status, body))
    : classify(status, body);

  // OPTIONS: o header allow revela os métodos aceitos
  const row = { method, path, params, status, verdict, note };
  if (body && typeof body === 'object') {
    const keys = Object.keys(body);
    row.shape = keys.slice(0, 12);
    // conta itens se vier lista
    for (const k of keys) {
      if (Array.isArray(body[k])) {
        row.count = body[k].length;
        row.sample = body[k][0] ? Object.keys(body[k][0]).slice(0, 20) : null;
        break;
      }
    }
    if (body.header?.count != null) row.headerCount = body.header.count;
    if (body.message) row.message = String(body.message).slice(0, 160);
  } else if (body) {
    row.message = String(body).slice(0, 160);
  }
  results.push(row);
  log(
    `${verdict.padEnd(14)} ${String(status).padEnd(4)} ${method.padEnd(7)} ${path}` +
      (row.headerCount != null ? `  (${row.headerCount} regs)` : '') +
      (row.message ? `  — ${row.message}` : '') +
      (note ? `   [${note}]` : '')
  );
  return row;
}

/** OPTIONS explícito: descobre métodos permitidos sem escrever nada */
async function allowed(path) {
  try {
    const res = await fetch(URL_BASE + path, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://marpe-crm.vercel.app',
        'Access-Control-Request-Method': 'PUT',
      },
    });
    const allow =
      res.headers.get('access-control-allow-methods') || res.headers.get('allow') || '(sem header)';
    results.push({ method: 'OPTIONS', path, status: res.status, verdict: 'ALLOW', allow });
    log(`ALLOW          ${String(res.status).padEnd(4)} OPTIONS ${path}  → ${allow}`);
    return allow;
  } catch (e) {
    log(`ALLOW  erro    ${path}: ${e.message}`);
    return '';
  }
}

// ============================================================

async function main() {
  log('\n=== S0 · Probes CorpAPI (somente leitura) ===\n');
  if (!(await login())) {
    console.error('❌ Login Corp falhou — abortando (API pode estar off, checar com a Agger).');
    process.exit(1);
  }
  log('✅ login ok\n');

  log('── 1. Cadastros que o CRM ainda não consome (PDF Sync §2,3,4,5,9,10) ──');
  for (const p of [
    '/canais_venda', '/canal_venda', '/canais', '/canais_vendas',
    '/grupos_produtores', '/grupo_produtores', '/grupos_produtor', '/grupo_produtor',
    '/bancos', '/banco',
    '/estados_civis', '/estado_civil', '/civil',
    '/escolaridades', '/escolaridade',
    '/tipos_ramo', '/tipo_ramo', '/ramos_multi',
    '/tipos_seguradora', '/tipo_seguradora',
    '/parametros_repasse', '/repasses', '/repasse',
  ]) {
    await probe('GET', p, { codfil: 1 });
  }

  log('\n── 2. Dedupe por CPF/CNPJ (PDF Sync regra geral) ──');
  await probe('GET', '/busca_cpf', { cpf_cnpj: '00000000191' }, 'CPF válido inexistente');
  await probe('GET', '/cliente_cpf', { codfil: 1, cpf_cnpj: '00000000191' });

  log('\n── 3. Métodos permitidos (bidirecional — PDF Sync regra geral) ──');
  for (const p of ['/cliente', '/negocio', '/telefone', '/email', '/endereco', '/atendimento', '/atendimentos']) {
    await allowed(p);
  }

  log('\n── 4. Atendimento / próxima ação (destrava #28 na prática) ──');
  await probe('GET', '/atendimentos', { codfil: 1, qtd_pag: 1, pag: 1 }, 'shape do atendimento');
  await probe('GET', '/atendimento', { codfil: 1, codigo: 1 });

  log('\n── 5. Cadastros já consumidos (sanidade / shape p/ telas de consulta) ──');
  await probe('GET', '/seguradoras', { codfil: 1 });
  await probe('GET', '/ramos', { codfil: 1 });
  await probe('GET', '/agentes', { codfil: 1 });
  await probe('GET', '/produtores', { codfil: 1 });
  await probe('GET', '/profissoes', { codfil: 1 });

  if (JSON_OUT) console.log(JSON.stringify(results, null, 2));

  // Resumo
  const existem = results.filter((r) => r.verdict === 'OK' || r.verdict === 'OK (vazio)' || r.verdict === 'EXISTE (erro)');
  const nao = results.filter((r) => r.verdict === 'INEXISTENTE');
  log(`\n=== Resumo: ${existem.length} responderam · ${nao.length} inexistentes ===`);
  log('Inexistentes (pedir à Agia):', nao.map((r) => r.path).join(', ') || '—');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
