#!/usr/bin/env node
/**
 * Re-teste das 13 pendências da SOLICITACAO-AGIA-API.md (plano 07/08)
 *
 * Contexto: em 06/08 a Agger respondeu (atendimento 2798599) que "os erros
 * mencionados foram resolvidos", sem detalhar quais. Este script re-testa
 * item a item para separar corrigido / não corrigido / novo comportamento.
 *
 *   node scripts/reprobe-corp-pendencias.mjs                # só leitura (GET/OPTIONS)
 *   node scripts/reprobe-corp-pendencias.mjs --escrita      # + escrita DESCARTÁVEL (POST→PUT→GET→DELETE)
 *   node scripts/reprobe-corp-pendencias.mjs --env=/caminho/prod.env
 *
 * Escrita descartável: cria um negócio de teste no cliente 440 (Tiago), tenta
 * PUT nele, tenta POST /atendimento nele, e DELETA tudo ao final. Nenhum dado
 * real é tocado. Padrão validado em 09/07 (neg_1_7633).
 *
 * ⚠️ 07/08: o login está 403 "Usuário sem permissão de acesso ao Corp+." —
 * enquanto a Agger não habilitar a permissão, este script para no login.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envArg = process.argv.find((a) => a.startsWith('--env='));
const envPath = envArg ? envArg.slice(6) : join(root, '.env');
const ESCRITA = process.argv.includes('--escrita');
const CODCLI_TESTE = 440; // TIAGO MACHADO DONICHT — cliente usado nos probes descartáveis

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
const BASE = env.CORP_API_URL || 'https://api.corpnuvem.com';
let token = null;
const resumo = [];

function anota(item, veredito, detalhe = '') {
  resumo.push({ item, veredito, detalhe });
  console.log(`\n[${veredito}] ${item}${detalhe ? ` — ${detalhe}` : ''}`);
}

async function call(method, path, { params = {}, body } = {}) {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  try {
    const res = await fetch(url.toString(), {
      method,
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await res.text();
    let parsed; try { parsed = JSON.parse(txt); } catch { parsed = txt.slice(0, 300); }
    return { status: res.status, body: parsed, allow: res.headers.get('allow') || res.headers.get('access-control-allow-methods') };
  } catch (e) { return { status: 0, body: String(e.message) }; }
}

const inexistente = (r) => r.status === 403 && /'?Credential'? parameter|not a valid key/i.test(JSON.stringify(r.body));
const brDate = (d = new Date()) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

// ── Login ────────────────────────────────────────────────────────────────
{
  const r = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.CORP_API_EMAIL, senha: env.CORP_API_PASSWORD, aplicacao: 0 }),
  });
  const txt = await r.text();
  if (!r.ok) {
    console.log(`LOGIN ${r.status}: ${txt.slice(0, 160)}`);
    console.log('\nSem login não há re-teste. Se ainda for o 403 do Corp+, a bola está com a Agger (atendimento 2798599).');
    process.exit(1);
  }
  token = JSON.parse(txt).token;
  console.log('LOGIN OK');
}

// ── Item 12: GET /renovacoes (era 500 em toda variação) ──────────────────
{
  let ok = false;
  for (const params of [{ codfil: 1 }, { codfil: 1, datainicial: brDate(), datafinal: brDate(new Date(Date.now() + 60 * 864e5)) }]) {
    const r = await call('GET', '/renovacoes', { params });
    if (r.status === 200) {
      const lista = r.body?.renovacoes || (Array.isArray(r.body) ? r.body : []);
      anota('12. GET /renovacoes', 'CORRIGIDO', `${lista.length} itens com ${JSON.stringify(params)}; keys: ${Object.keys(lista[0] || {}).join(',')}`);
      ok = true; break;
    }
    if (r.status !== 500) anota('12. GET /renovacoes', `STATUS ${r.status}`, JSON.stringify(r.body).slice(0, 150));
  }
  if (!ok && !resumo.some((x) => x.item.startsWith('12.'))) anota('12. GET /renovacoes', 'AINDA 500');
}

// ── Itens 4/7: /negocios_andamento — prox_aten + header.count ────────────
{
  const r = await call('GET', '/negocios_andamento', { params: { codfil: 1 } });
  if (r.status === 200) {
    const itens = r.body?.negocios || r.body?.negocios_andamento || (Array.isArray(r.body) ? r.body : []);
    const count = r.body?.header?.count;
    const comDesc = itens.filter((i) => i.prox_aten_descricao).length;
    anota('7. header.count', count === itens.length ? 'CORRIGIDO' : 'AINDA INCONSISTENTE', `count=${count} vs ${itens.length} itens`);
    anota('4a. prox_aten_descricao na lista', comDesc > 0 ? 'MELHOROU' : 'AINDA NULL', `${comDesc}/${itens.length} preenchidas`);
  } else anota('4/7. /negocios_andamento', `ERRO ${r.status}`);
}

// ── Itens 4/5: GET /negocio — agendamento, produtores, agente ────────────
{
  const r = await call('GET', '/negocio', { params: { codfil: 1, codigo: 7512 } });
  if (r.status === 200) {
    const n = r.body?.negocio || r.body;
    anota('4b. /negocio: prox_aten_descricao', n?.prox_aten_descricao ? 'PREENCHIDA' : 'AINDA NULL', JSON.stringify(n?.prox_aten_descricao));
    anota('5. /negocio: grade Produtores/Agente', ('produtores' in (n || {}) || 'agente' in (n || {})) ? 'EXPOSTA' : 'AINDA AUSENTE', `keys: ${Object.keys(n || {}).join(',').slice(0, 200)}`);
  } else anota('4/5. GET /negocio 7512', `ERRO ${r.status}`);
}

// ── Item 4c: /atendimentos — existe agendamento (data futura)? ───────────
{
  const r = await call('GET', '/atendimentos', { params: { codfil: 1 } });
  if (r.status === 200) {
    const itens = r.body?.atendimentos || (Array.isArray(r.body) ? r.body : []);
    const parse = (d) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(d || ''); return m ? new Date(`${m[3]}-${m[2]}-${m[1]}`) : null; };
    const futuras = itens.filter((i) => { const d = parse(i.data); return d && d > new Date(); }).length;
    const keys = Object.keys(itens[0] || {});
    const temAgendamento = keys.some((k) => /agend|prevista|marcad/i.test(k));
    anota('4c. /atendimentos: campo de agendamento', temAgendamento || futuras > 0 ? 'APARECEU' : 'AINDA AUSENTE', `datas futuras: ${futuras}; keys: ${keys.join(',')}`);
  } else anota('4c. /atendimentos', `ERRO ${r.status}`);
}

// ── Item 6: /usuarios (era inexistente) ──────────────────────────────────
for (const path of ['/usuarios', '/usuario']) {
  const r = await call('GET', path, { params: { codfil: 1 } });
  if (!inexistente(r)) { anota(`6. GET ${path}`, r.status === 200 ? 'EXISTE AGORA' : `EXISTE (${r.status})`, JSON.stringify(r.body).slice(0, 150)); break; }
  if (path === '/usuario') anota('6. /usuarios | /usuario', 'AINDA INEXISTENTE');
}

// ── Item 1: dados bancários ──────────────────────────────────────────────
{
  let achou = null;
  for (const path of ['/cliente_bancos', '/dados_bancarios', '/cliente_dados_bancarios', '/bancos']) {
    const r = await call('GET', path, { params: { codfil: 1, codigo: CODCLI_TESTE } });
    if (!inexistente(r)) { achou = `${path} → ${r.status}`; break; }
  }
  anota('1. Dados bancários', achou ? 'ROTA APARECEU' : 'AINDA SEM ROTA', achou || '');
}

// ── Item 2: upload de anexos (métodos além de GET?) ──────────────────────
for (const path of ['/cliente_anexos', '/negocio_anexos']) {
  const r = await call('OPTIONS', path);
  const metodos = r.allow || JSON.stringify(r.body).slice(0, 80);
  anota(`2. OPTIONS ${path}`, /POST|PUT/i.test(metodos || '') ? 'ESCRITA LIBEROU' : 'AINDA GET-ONLY', `allow=${metodos}`);
}

// ── Item 3: lookups de campanhas/bases ───────────────────────────────────
{
  let achou = null;
  for (const path of ['/campanhas', '/lista_campanhas', '/bases_repasse', '/bases_calculo']) {
    const r = await call('GET', path, { params: { codfil: 1 } });
    if (!inexistente(r)) { achou = `${path} → ${r.status}`; break; }
  }
  anota('3. Lookup campanhas/bases', achou ? 'ROTA APARECEU' : 'AINDA SEM ROTA', achou || '');
}

// ── Item 10: cadastros auxiliares (canais, grupos, bancos, parâm.) ───────
{
  const achados = [];
  for (const path of ['/canais_venda', '/grupos_produtores', '/parametros_repasse', '/estado_civil', '/escolaridade']) {
    const r = await call('GET', path, { params: { codfil: 1 } });
    if (!inexistente(r)) achados.push(`${path}:${r.status}`);
  }
  anota('10. Cadastros auxiliares', achados.length > 2 ? 'NOVIDADE' : 'SEM MUDANÇA', achados.join(' ') + ' (estado_civil/escolaridade já existiam)');
}

// ── Itens 11/13: detalhe + escrita de cadastros ──────────────────────────
for (const path of ['/seguradora', '/ramo', '/produtor', '/agente']) {
  const r = await call('OPTIONS', path);
  const metodos = r.allow || (inexistente(r) ? 'rota inexistente' : JSON.stringify(r.body).slice(0, 60));
  anota(`13. OPTIONS ${path}`, /POST|PUT|PATCH/i.test(metodos || '') ? 'ESCRITA LIBEROU' : 'SEM ESCRITA', `allow=${metodos}`);
}

// ── Sinistro: rota de escrita ────────────────────────────────────────────
{
  const r = await call('OPTIONS', '/sinistro');
  const metodos = r.allow || (inexistente(r) ? 'rota inexistente' : JSON.stringify(r.body).slice(0, 60));
  anota('Extra. OPTIONS /sinistro', /POST|PUT/i.test(metodos || '') ? 'ESCRITA LIBEROU' : 'SEM ESCRITA', `allow=${metodos}`);
}

// ── Itens 8/9: PUT /negocio + POST /atendimento (DESCARTÁVEL) ────────────
if (!ESCRITA) {
  console.log('\n(Itens 8 e 9 exigem escrita — rode com --escrita para o probe descartável.)');
} else {
  console.log(`\n== ESCRITA DESCARTÁVEL (cliente ${CODCLI_TESTE}) ==`);
  const agora = new Date();
  const criado = await call('POST', '/negocio', {
    body: {
      codfil: 1, codcli: CODCLI_TESTE, codram: 31, codcia: 68, tipo: 1,
      val_premio: 100, per_c: 10,
      etapa: 1, status: 0, prioridade: 3, campo_base_r: 5,
      datinc: `${brDate(agora)} ${agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`,
      datalt: brDate(agora),
    },
  });
  const codigo = criado.body?.codigo_negocio;
  if (criado.status !== 201 || !codigo) {
    anota('8/9. POST /negocio (base do probe)', `FALHOU ${criado.status}`, JSON.stringify(criado.body).slice(0, 150));
  } else {
    console.log(`  negócio descartável criado: ${codigo}`);
    // Item 8 — PUT /negocio (era 500 em toda variação)
    const put = await call('PUT', '/negocio', { body: { codfil: 1, codigo, val_premio: 222 } });
    if (put.status >= 200 && put.status < 300) {
      const check = await call('GET', '/negocio', { params: { codfil: 1, codigo } });
      const premio = (check.body?.negocio || check.body)?.val_premio;
      anota('8. PUT /negocio', premio == 222 ? 'CORRIGIDO ✅' : 'ACEITOU MAS NÃO GRAVOU', `val_premio pós-PUT: ${premio}`);
    } else anota('8. PUT /negocio', `AINDA ${put.status}`, JSON.stringify(put.body).slice(0, 120));
    // Item 9 — POST /atendimento (era 500 em 3 variações)
    const at = await call('POST', '/atendimento', {
      body: { codfil: 1, codneg: codigo, descricao: 'Probe u4digital — descartável', data: brDate(agora), realizado: 'F' },
    });
    if (at.status >= 200 && at.status < 300) {
      anota('9. POST /atendimento', 'CORRIGIDO ✅', JSON.stringify(at.body).slice(0, 120));
      const codAt = at.body?.codigo_atendimento || at.body?.codigo;
      if (codAt) await call('DELETE', '/atendimento', { params: { codfil: 1, codigo: codAt } });
    } else anota('9. POST /atendimento', `AINDA ${at.status}`, JSON.stringify(at.body).slice(0, 120));
    // Limpeza
    const del = await call('DELETE', '/negocio', { params: { codfil: 1, codigo } });
    console.log(`  limpeza: DELETE /negocio ${codigo} → ${del.status}`);
  }
}

// ── Resumo ───────────────────────────────────────────────────────────────
console.log('\n══════════ RESUMO ══════════');
for (const r of resumo) console.log(`  ${r.veredito.padEnd(20)} ${r.item}`);
console.log('\nApós rodar: atualizar RELATORIO-CORP-API.md + lib/corp/integration-status.ts + SOLICITACAO-AGIA-API.md + bloqueios no u4-status (regra de 30/07: os quatro juntos).');
