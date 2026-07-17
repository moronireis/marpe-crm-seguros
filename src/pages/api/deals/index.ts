import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { createNegocio } from '../../../lib/corp/client';

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
      .select('*, marpe_contacts(id, name, phone, email, tags, photo_url), marpe_funnel_stages(id, name, color, sort_order, is_terminal, terminal_type), marpe_profiles!responsible_id(id, full_name)')
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

  const { data: contact } = await sb
    .from('marpe_contacts')
    .select('name, corp_id')
    .eq('id', body.contact_id)
    .single();

  // marpe_deals.title is NOT NULL — generate it server-side when the UI doesn't send one
  let title: string = body.title?.trim();
  if (!title) {
    title = [contact?.name || 'Contato', body.ramo].filter(Boolean).join(' — ');
  }

  // Dual-write no Corp — atrás da flag corp_write_negocio ({ enabled: true } liga).
  // Payload obrigatório resolvido em 2026-07-09 via doc oficial (ver createNegocio).
  let corpDealId: string | null = null;
  // skip_corp: sinistros manuais (S4.1) não criam NEGÓCIO no Corp — não há rota
  // de escrita de sinistro confirmada na CorpAPI
  if (contact?.corp_id && !body.skip_corp) {
    const { data: flag } = await sb
      .from('marpe_settings')
      .select('value')
      .eq('key', 'corp_write_negocio')
      .maybeSingle();
    if ((flag?.value as any)?.enabled) {
      try {
        const codigo = await createNegocio({
          codfil: 1,
          codcli: parseInt(contact.corp_id),
          ...(body.corp_codram ? { codram: body.corp_codram } : {}),
          ...(body.corp_codcia ? { codcia: body.corp_codcia } : {}),
          tipo: body.corp_tipo || 1,
          ...(body.observacoes_proposta ? { observacoes: body.observacoes_proposta } : {}),
          val_premio: body.premio ? Number(body.premio) : 0,
          per_c: body.comissao_pct ? Number(body.comissao_pct) : 0,
          per_r: body.pct_repasse ? Number(body.pct_repasse) : 0,
          // Vr. Comissão / Vr. Repasse (issue #14) — round-trip com o Corp
          ...(body.comissao_valor ? { val_c: Number(body.comissao_valor) } : {}),
          ...(body.valor_repasse ? { val_r: Number(body.valor_repasse) } : {}),
          produto_ja_possui: body.ja_possui_produto ? 'T' : 'F',
          ...(body.base_calculo_repasse ? { campo_base_r: Number(body.base_calculo_repasse) } : {}),
          // Campanha só existe como código na CorpAPI (nome não é exposto) —
          // o codcamp faz o round-trip e o Corp resolve o rótulo na UI dele
          ...(body.corp_codcamp ? { codcamp: Number(body.corp_codcamp) } : {}),
        });
        // Mesmo formato do sync (neg_{codfil}_{codigo}) — senão o próximo sync
        // não reconhece o vínculo e cria um deal duplicado no CRM.
        corpDealId = `neg_1_${codigo}`;
      } catch (e: any) {
        return new Response(JSON.stringify({ error: `Corp não aceitou o negócio: ${e.message}` }), { status: 502 });
      }
    }
  }

  const { data, error } = await sb
    .from('marpe_deals')
    .insert({
      contact_id: body.contact_id,
      corp_id: corpDealId,
      funnel_id: body.funnel_id,
      stage_id: body.stage_id,
      title,
      ramo: body.ramo || null,
      seguradora: body.seguradora || null,
      apolice: body.apolice || null,
      premio: body.premio || null,
      comissao_pct: body.comissao_pct || null,
      comissao_valor: body.comissao_valor || null,
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
      ...(body.detalhes_corp ? { detalhes_corp: body.detalhes_corp } : {}),
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
