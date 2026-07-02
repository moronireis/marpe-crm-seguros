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
    // New fields (Fase 2)
    'campanha', 'ja_possui_produto', 'seguradora_atual', 'vigencia_atual_fim',
    'corretora_atual', 'base_calculo_repasse', 'pct_repasse', 'valor_repasse',
    'agente', 'observacoes_proposta', 'detalhes_corp', 'status_color',
  ];

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    last_activity: new Date().toISOString(),
  };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const sb = createServerClient();

  // Capture old values before update (for audit trail + automation trigger)
  let oldStageId: string | null = null;
  let contactId: string | null = null;
  let funnelId: string | null = null;
  let oldValues: Record<string, unknown> = {};

  // Fetch existing deal for comparison (needed for stage_change + field_update audit)
  const fieldsToTrack = Object.keys(updates).filter(k => k !== 'updated_at' && k !== 'last_activity');
  if (fieldsToTrack.length > 0) {
    const { data: existing } = await sb
      .from('marpe_deals')
      .select('*')
      .eq('id', id)
      .single();
    if (existing) {
      oldStageId = existing.stage_id || null;
      contactId = existing.contact_id || null;
      funnelId = existing.funnel_id || null;
      for (const key of fieldsToTrack) {
        oldValues[key] = existing[key] ?? null;
      }
    }
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

  // Log field_update activity for non-stage fields that changed
  const fieldLabels: Record<string, string> = {
    ramo: 'Ramo', seguradora: 'Seguradora', premio: 'Prêmio', comissao_pct: '% Comissão',
    comissao_valor: 'Vr. Comissão', produtor: 'Produtor', vigencia_inicio: 'Vigência Início',
    vigencia_fim: 'Vigência Fim', veiculo: 'Veículo', placa: 'Placa', deal_type: 'Tipo',
    campanha: 'Campanha', seguradora_atual: 'Seguradora Atual', corretora_atual: 'Corretora Atual',
    ja_possui_produto: 'Já Possui Produto', vigencia_atual_fim: 'Vigência Atual Fim',
    base_calculo_repasse: 'Base Repasse', pct_repasse: '% Repasse', valor_repasse: 'Vr. Repasse',
    agente: 'Agente', responsible_id: 'Responsável', status_custom: 'Status', next_action: 'Próxima Ação',
    next_action_date: 'Data Próxima Ação', observacoes_proposta: 'Observações',
  };
  const changedFields = fieldsToTrack.filter(k =>
    k !== 'stage_id' && k !== 'loss_reason' && k !== 'status_color' &&
    JSON.stringify(oldValues[k]) !== JSON.stringify(body[k])
  );
  if (changedFields.length > 0) {
    const changes = changedFields.map(k => ({
      field: k,
      label: fieldLabels[k] || k,
      from: oldValues[k],
      to: body[k],
    }));
    const desc = changes.map(c => `${c.label}: ${c.from ?? '—'} → ${c.to ?? '—'}`).join(', ');
    await sb.from('marpe_deal_activities').insert({
      deal_id: id,
      user_id: profile.id,
      type: 'field_update',
      description: desc.slice(0, 500),
      metadata: { changes },
    }).then(null, () => {});
  }

  return new Response(JSON.stringify({ deal: data }), { status: 200 });
};
