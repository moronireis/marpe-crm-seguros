import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();
  const funnelId = url.searchParams.get('funnel_id');

  // Fetch ALL deals of the funnel — Supabase caps each request at 1000 rows,
  // so paginate server-side. (A fixed limit of 500 hid ~90% of the 4.5k deals.)
  const PAGE_SIZE = 1000;
  const all: any[] = [];
  for (let page = 0; ; page++) {
    let query = sb.from('marpe_deals')
      .select('*, marpe_contacts(id, name, phone, email, tags), marpe_funnel_stages(id, name, color, sort_order, is_terminal, terminal_type), marpe_profiles!responsible_id(id, full_name)')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (funnelId) query = query.eq('funnel_id', funnelId);

    const { data, error } = await query;
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    all.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return new Response(JSON.stringify({ deals: all }), { status: 200 });
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

  // marpe_deals.title is NOT NULL — generate it server-side when the UI doesn't send one
  let title: string = body.title?.trim();
  if (!title) {
    const { data: contact } = await sb
      .from('marpe_contacts')
      .select('name')
      .eq('id', body.contact_id)
      .single();
    title = [contact?.name || 'Contato', body.ramo].filter(Boolean).join(' — ');
  }

  const { data, error } = await sb
    .from('marpe_deals')
    .insert({
      contact_id: body.contact_id,
      funnel_id: body.funnel_id,
      stage_id: body.stage_id,
      title,
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
      // New fields (Fase 2)
      created_by: profile.id,
      campanha: body.campanha || null,
      ja_possui_produto: body.ja_possui_produto ?? false,
      seguradora_atual: body.seguradora_atual || null,
      vigencia_atual_fim: body.vigencia_atual_fim || null,
      corretora_atual: body.corretora_atual || null,
      base_calculo_repasse: body.base_calculo_repasse || null,
      pct_repasse: body.pct_repasse || null,
      valor_repasse: body.valor_repasse || null,
      agente: body.agente || null,
      observacoes_proposta: body.observacoes_proposta || null,
      veiculo: body.veiculo || null,
      placa: body.placa || null,
      next_action: body.next_action || null,
      next_action_date: body.next_action_date || null,
    })
    .select('*, marpe_contacts(id, name, phone), marpe_funnel_stages(id, name, color)')
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Log creation activity
  await sb.from('marpe_deal_activities').insert({
    deal_id: data.id,
    user_id: profile.id,
    type: 'creation',
    description: 'Negócio criado',
    metadata: { contact_name: data.marpe_contacts?.name || null },
  }).then(null, () => {});

  return new Response(JSON.stringify({ deal: data }), { status: 201 });
};
