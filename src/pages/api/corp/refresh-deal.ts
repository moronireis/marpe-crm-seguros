import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { getNegocio } from '../../../lib/corp/client';
import { negocioDetailFields, deleteCorpDeletedDeal, logCorpSync, parseCorpDate } from '../../../lib/corp/sync';

export const prerender = false;

// POST /api/corp/refresh-deal { deal_id }
// Refresh em tempo real ao abrir o card (checkpoint 15/07): 1 chamada GET /negocio
// atualiza os campos Corp-owned do deal. Se o Corp responder "não encontrado"
// (negócio excluído), remove o deal do CRM na hora — mesmo caminho da reconciliação.
// Erros transitórios do Corp retornam refreshed:false e o painel segue com o dado local.
export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const body = await request.json().catch(() => ({}));
  const dealId = body.deal_id;
  if (!dealId) {
    return new Response(JSON.stringify({ error: 'deal_id requerido' }), { status: 400 });
  }

  const sb = createServerClient();
  const { data: deal } = await sb.from('marpe_deals')
    .select('id, corp_id, title, detalhes_corp')
    .eq('id', dealId)
    .maybeSingle();

  if (!deal) {
    return new Response(JSON.stringify({ error: 'Negócio não encontrado' }), { status: 404 });
  }
  if (!deal.corp_id?.startsWith('neg_')) {
    return new Response(JSON.stringify({ refreshed: false, reason: 'not_corp_negocio' }), { status: 200 });
  }

  const m = deal.corp_id.match(/(\d+)$/);
  if (!m) {
    return new Response(JSON.stringify({ refreshed: false, reason: 'corp_id_invalido' }), { status: 200 });
  }

  let detail;
  try {
    detail = await getNegocio(parseInt(m[1], 10));
  } catch {
    // Erro transitório (rede/token/5xx) — nunca tratar como exclusão
    return new Response(JSON.stringify({ refreshed: false, reason: 'corp_error' }), { status: 200 });
  }

  if (detail === null) {
    // 404 confirmado: negócio excluído no Corp → remove o deal do CRM
    const err = await deleteCorpDeletedDeal(sb, deal);
    if (err) {
      return new Response(JSON.stringify({ refreshed: false, reason: `delete_failed: ${err}` }), { status: 200 });
    }
    await logCorpSync(sb, {
      sync_type: 'negocios_reconcile',
      status: 'success',
      message: `Removido do CRM ao abrir o card (excluído no Corp): ${deal.corp_id} (${deal.title || 'sem título'})`,
    });
    return new Response(JSON.stringify({ deleted: true }), { status: 200 });
  }

  // Campos Corp-owned — o detalhe traz tudo menos vigências/tipo (que são da lista
  // e chegam pelo sync de 30 min). Preserva a flag corp_fora_andamento se existir.
  const detailFields = negocioDetailFields(detail);
  if (deal.detalhes_corp?.corp_fora_andamento) {
    detailFields.detalhes_corp = { ...detailFields.detalhes_corp, corp_fora_andamento: true };
  }
  const { error } = await sb.from('marpe_deals').update({
    ...detailFields,
    ramo: detail.ramo?.toLowerCase() || null,
    premio: detail.val_premio || null,
    comissao_valor: detail.val_c || null,
    next_action_date: parseCorpDate(detail.prox_aten_data),
    next_action: detail.prox_aten_descricao || null,
  }).eq('id', dealId);

  if (error) {
    return new Response(JSON.stringify({ refreshed: false, reason: error.message }), { status: 200 });
  }
  return new Response(JSON.stringify({ refreshed: true }), { status: 200 });
};
