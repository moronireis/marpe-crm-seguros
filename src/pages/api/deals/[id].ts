import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { runAutomations } from '../../../lib/automations/engine';

export const prerender = false;

export const GET: APIRoute = async ({ locals, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_deals')
    .select(`
      *,
      marpe_contacts(id, name, phone, email, city, tags, corp_id),
      marpe_funnel_stages(id, name, color, sort_order, is_terminal, terminal_type),
      marpe_funnels(id, name),
      marpe_deal_activities(id, type, description, created_at, metadata)
    `)
    .eq('id', id)
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!data) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  return new Response(JSON.stringify({ deal: data }), { status: 200 });
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

  const allowed = [
    'title', 'stage_id', 'ramo', 'seguradora', 'apolice', 'premio',
    'comissao_pct', 'comissao_valor', 'produtor', 'vigencia_inicio',
    'vigencia_fim', 'veiculo', 'placa', 'status_custom', 'loss_reason',
    'next_action', 'next_action_date', 'responsible_id', 'deal_type',
  ];

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    last_activity: new Date().toISOString(),
  };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const sb = createServerClient();

  // Capture old stage before update (for automation trigger)
  let oldStageId: string | null = null;
  let contactId: string | null = null;
  let funnelId: string | null = null;
  if (body.stage_id) {
    const { data: existing } = await sb
      .from('marpe_deals')
      .select('stage_id, contact_id, funnel_id')
      .eq('id', id)
      .single();
    oldStageId = existing?.stage_id || null;
    contactId = existing?.contact_id || null;
    funnelId = existing?.funnel_id || null;
  }

  const { data, error } = await sb
    .from('marpe_deals')
    .update(updates)
    .eq('id', id)
    .select('*, marpe_contacts(id, name, phone, email), marpe_funnel_stages(id, name, color)')
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Log stage change activity
  if (body.stage_id && body.stage_id !== oldStageId) {
    await sb.from('marpe_deal_activities').insert({
      deal_id: id,
      user_id: profile.id,
      type: 'stage_change',
      description: `Etapa alterada`,
      metadata: { from_stage: oldStageId, to_stage: body.stage_id },
    });

    // Fire automations async (don't block response)
    runAutomations({
      type: 'deal_stage_change',
      deal_id: id,
      contact_id: contactId || undefined,
      stage_id: body.stage_id,
      funnel_id: funnelId || undefined,
    }).catch(() => {});
  }

  return new Response(JSON.stringify({ deal: data }), { status: 200 });
};
