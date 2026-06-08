import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();
  const funnelId = url.searchParams.get('funnel_id');
  const limit = parseInt(url.searchParams.get('limit') || '500');

  let query = sb.from('marpe_deals')
    .select('*, marpe_contacts(id, name, phone, email, tags), marpe_funnel_stages(id, name, color, sort_order, is_terminal, terminal_type), marpe_profiles!responsible_id(id, full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (funnelId) {
    query = query.eq('funnel_id', funnelId);
  }

  const { data, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ deals: data }), { status: 200 });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.contact_id || !body.funnel_id || !body.stage_id) {
    return new Response(JSON.stringify({ error: 'contact_id, funnel_id, stage_id required' }), { status: 400 });
  }

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_deals')
    .insert({
      contact_id: body.contact_id,
      funnel_id: body.funnel_id,
      stage_id: body.stage_id,
      title: body.title || null,
      ramo: body.ramo || null,
      seguradora: body.seguradora || null,
      apolice: body.apolice || null,
      premio: body.premio || null,
      comissao_pct: body.comissao_pct || null,
      produtor: body.produtor || null,
      vigencia_inicio: body.vigencia_inicio || null,
      vigencia_fim: body.vigencia_fim || null,
      deal_type: body.deal_type || 'renovacao',
      responsible_id: profile.id,
    })
    .select('*, marpe_contacts(id, name, phone), marpe_funnel_stages(id, name, color)')
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ deal: data }), { status: 201 });
};
