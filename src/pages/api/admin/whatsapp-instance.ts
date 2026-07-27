import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { getInstance, clearInstanceCache, fetchInstanceStatus, uazapiUrl, WA_INSTANCE_KEY } from '../../../lib/whatsapp/instance';

export const prerender = false;

const json = (b: any, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * GET /api/admin/whatsapp-instance
 * Diagnóstico da instância: de onde vem o token e o que a Uazapi responde.
 * NUNCA devolve o token.
 */
export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAdmin(locals as any);
  if (profile instanceof Response) return profile;

  const inst = await getInstance();
  if (!inst.token) {
    return json({
      source: 'none', name: null, has_token: false, valid: false, connected: false,
      diagnosis: 'Nenhum token configurado — crie uma instância ou cole o token de uma existente.',
    });
  }

  const st = await fetchInstanceStatus(inst.token);
  // 401 é o caso que nos trouxe até aqui: token recusado pela Uazapi.
  const tokenRejected = st.httpStatus === 401;

  return json({
    source: inst.source,
    name: inst.name,
    has_token: true,
    valid: st.ok,
    connected: st.connected,
    phone: st.phone,
    profile_name: st.name,
    http_status: st.httpStatus,
    diagnosis: tokenRejected
      ? 'A Uazapi recusou o token desta instância. Ele foi revogado ou o servidor rotacionou as credenciais — é preciso criar uma instância nova ou colar o token atual.'
      : st.ok
        ? (st.connected ? 'Instância conectada.' : 'Token válido, número desconectado — gere o QR Code para conectar.')
        : `A Uazapi respondeu ${st.httpStatus || 'nada'}${st.message ? `: ${st.message}` : ''}.`,
  });
};

/**
 * POST /api/admin/whatsapp-instance
 * Aponta o CRM para uma instância WhatsApp utilizável, sem precisar de deploy.
 *
 * Dois modos (mesmo desenho já usado no Azeredo e no Uningá):
 *   { mode: 'create', name }  → cria no servidor via UAZAPI_ADMIN_TOKEN
 *   { mode: 'token', token }  → registra o token de uma instância criada no painel
 *
 * Em ambos, o token é validado contra a Uazapi ANTES de gravar — não trocamos um
 * token quebrado por outro quebrado.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAdmin(locals as any);
  if (profile instanceof Response) return profile;

  const body = await request.json().catch(() => ({} as any));
  const mode = body?.mode === 'create' ? 'create' : 'token';

  let token = '';
  let name: string | null = null;

  if (mode === 'token') {
    token = String(body?.token || '').trim();
    if (!token) return json({ error: 'Cole o token da instância (painel da Uazapi → sua instância → Token).' }, 400);
    name = String(body?.name || '').trim() || null;

    const st = await fetchInstanceStatus(token);
    if (!st.ok) {
      return json({
        error: st.httpStatus === 401
          ? 'A Uazapi recusou este token ("Invalid token"). Confira se copiou o token da instância certa e inteiro.'
          : `A Uazapi não validou o token (HTTP ${st.httpStatus || 'sem resposta'}${st.message ? `: ${st.message}` : ''}).`,
      }, 400);
    }
    if (!name) name = st.name || null;
  } else {
    const rawName = String(body?.name || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!rawName) return json({ error: 'Informe o nome da instância (ex.: marpe-crm).' }, 400);

    const ADMIN_TOKEN = (import.meta.env.UAZAPI_ADMIN_TOKEN || '').trim();
    if (!ADMIN_TOKEN) {
      return json({
        error: 'UAZAPI_ADMIN_TOKEN não está configurado neste projeto. Ou peça o admintoken do servidor à u4digital e adicione no Vercel, ou crie a instância no painel da Uazapi e use a opção "colar token".',
      }, 400);
    }

    try {
      const resp = await fetch(`${uazapiUrl()}/instance/create`, {
        method: 'POST',
        headers: { admintoken: ADMIN_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: rawName }),
        signal: AbortSignal.timeout(20_000),
      });
      const d = await resp.json().catch(() => ({} as any));
      token = d?.token || d?.instance?.token || '';
      if (!resp.ok || !token) {
        return json({
          error: `A Uazapi recusou a criação (${resp.status}): ${d?.message || d?.error || 'sem detalhe'} — confira o limite de instâncias do servidor com a u4digital.`,
        }, 502);
      }
      name = rawName;
    } catch (e: any) {
      return json({ error: `Falha ao falar com a Uazapi: ${e?.message || 'timeout'}` }, 502);
    }
  }

  const sb = createServerClient();
  const { error } = await sb.from('marpe_settings').upsert({
    key: WA_INSTANCE_KEY,
    value: { token, name, updated_by: (profile as any).id ?? null },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });

  if (error) {
    return json({
      error: mode === 'create'
        ? `Instância criada na Uazapi ("${name}") mas falhou ao salvar no CRM: ${error.message}. Guarde o nome — dá para registrar depois pela opção "colar token".`
        : `Falha ao salvar: ${error.message}`,
    }, 500);
  }

  clearInstanceCache();
  const st = await fetchInstanceStatus(token);

  return json({
    ok: true,
    name,
    connected: st.connected,
    phone: st.phone,
    next: st.connected
      ? 'Instância conectada.'
      : 'Instância pronta. Gere o QR Code abaixo e escaneie com o WhatsApp do número.',
  }, 201);
};
