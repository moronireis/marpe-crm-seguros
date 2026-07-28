import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/api-auth';
import { createServerClient } from '../../../../lib/supabase-server';

export const prerender = false;

/**
 * Dados Bancários do cliente — SÓ CRM (revisão 28/07, PDF Sincronização §10).
 * A API do Corp não expõe a aba "Dados Bancários" (probe de 09/07: ~20 rotas
 * candidatas, todas 403 de gateway; cobrado da Agia). O próprio PDF classifica
 * como campo "diferencial e exclusivo do CRM sem integração com o Corp".
 *
 * GET    /api/contacts/[id]/bank            → lista as contas
 * POST   /api/contacts/[id]/bank            → cria { banco, agencia, conta, tipo_conta, titular, pix, observacoes }
 * PATCH  /api/contacts/[id]/bank            → edita { bank_id, ...campos }
 * DELETE /api/contacts/[id]/bank            → remove { bank_id }
 */

const json = (b: any, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

const FIELDS = ['banco', 'agencia', 'conta', 'tipo_conta', 'titular', 'pix', 'observacoes'] as const;

export const GET: APIRoute = async ({ locals, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;
  const { id } = params;
  if (!id) return json({ error: 'id required' }, 400);

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_contact_bank')
    .select('*')
    .eq('contact_id', id)
    .order('created_at', { ascending: true });

  if (error) return json({ error: error.message }, 500);
  return json({ accounts: data || [] });
};

export const POST: APIRoute = async ({ locals, params, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;
  const { id } = params;
  if (!id) return json({ error: 'id required' }, 400);

  const body = await request.json().catch(() => ({} as any));
  const row: Record<string, any> = { contact_id: id };
  for (const f of FIELDS) row[f] = (body[f] ?? '').toString().trim() || null;
  if (!row.banco && !row.conta && !row.pix) {
    return json({ error: 'Informe ao menos banco, conta ou chave PIX' }, 400);
  }

  const sb = createServerClient();
  const { data, error } = await sb.from('marpe_contact_bank').insert(row).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ account: data }, 201);
};

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;
  const { id } = params;
  if (!id) return json({ error: 'id required' }, 400);

  const body = await request.json().catch(() => ({} as any));
  if (!body.bank_id) return json({ error: 'bank_id required' }, 400);

  const updates: Record<string, any> = {};
  for (const f of FIELDS) {
    if (f in body) updates[f] = (body[f] ?? '').toString().trim() || null;
  }
  if (Object.keys(updates).length === 0) return json({ error: 'Nada para atualizar' }, 400);

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_contact_bank')
    .update(updates)
    .eq('id', body.bank_id)
    .eq('contact_id', id)
    .select()
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ account: data });
};

export const DELETE: APIRoute = async ({ locals, params, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;
  const { id } = params;
  if (!id) return json({ error: 'id required' }, 400);

  const body = await request.json().catch(() => ({} as any));
  if (!body.bank_id) return json({ error: 'bank_id required' }, 400);

  const sb = createServerClient();
  const { error } = await sb
    .from('marpe_contact_bank')
    .delete()
    .eq('id', body.bank_id)
    .eq('contact_id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
