import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ locals, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  const sb = createServerClient();

  // Fetch contact
  const { data: contact, error } = await sb
    .from('marpe_contacts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!contact) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

  // Fetch deals with stage and funnel names
  const { data: deals } = await sb
    .from('marpe_deals')
    .select(`
      id, title, ramo, seguradora, apolice, premio, comissao_pct, comissao_valor,
      vigencia_inicio, vigencia_fim, veiculo, placa, deal_type,
      next_action, next_action_date, status_custom, status_color,
      stage_id, funnel_id, created_at, updated_at, loss_reason,
      marpe_funnel_stages ( id, name, color, is_terminal, terminal_type ),
      marpe_funnels ( id, name ),
      marpe_deal_activities ( id, type, description, created_at )
    `)
    .eq('contact_id', id)
    .order('created_at', { ascending: false });

  // Fetch message stats
  const { count: messageCount } = await sb
    .from('marpe_messages')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', id);

  const { data: lastMsgRow } = await sb
    .from('marpe_messages')
    .select('created_at')
    .eq('contact_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return new Response(JSON.stringify({
    contact,
    deals: deals || [],
    message_count: messageCount || 0,
    last_message_at: lastMsgRow?.created_at || null,
  }), { status: 200 });
};

export const PATCH: APIRoute = async ({ locals, request, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const allowed = ['name', 'phone', 'phone_secondary', 'email', 'city', 'state',
    'address', 'birth_date', 'profession', 'marital_status', 'tags', 'notes', 'responsible_id'];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_contacts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ contact: data }), { status: 200 });
};
