import { createServerClient } from '../supabase-server';

export interface SegmentFilter {
  tags?: string[];
  ramo?: string;
  city?: string;
  produtor?: string;
  deal_type?: string;
  // S5 (27/07, PDF Campanha): "destinatários podendo ser contatos salvos, inbox,
  // etiquetas, grupos, CRM/aba do funil etc" + "podendo adicionar contato manual".
  /** etapa do funil do CRM (marpe_funnel_stages.id) */
  stage_id?: string;
  /** só quem tem conversa no inbox */
  from_inbox?: boolean;
  /** inclui/exclui grupos de WhatsApp (padrão: exclui) */
  include_groups?: boolean;
  /** ids escolhidos à mão, somados ao resultado do filtro */
  manual_ids?: string[];
}

/**
 * Resolve the set of contact IDs that match the given segment filter.
 * Shared by the send endpoint and the preview-count endpoint.
 *
 * Rules:
 * - Contacts MUST have a non-null, non-empty phone number.
 * - ramo / produtor / deal_type filter via a JOIN on marpe_deals.
 * - tags / city filter directly on marpe_contacts.
 * - Result is deduplicated (a contact with 3 deals returns 1 ID).
 * - No filter = all contacts with a phone number (up to 2000).
 */
export async function resolveContactIds(
  sb: ReturnType<typeof createServerClient>,
  filter: SegmentFilter
): Promise<{ ids: string[]; error: string | null }> {

  const needsDeals = filter.ramo || filter.produtor || filter.deal_type || filter.stage_id;
  let dealContactIds: Set<string> | null = null;

  if (needsDeals) {
    let dealQuery = sb
      .from('marpe_deals')
      .select('contact_id')
      .not('contact_id', 'is', null);

    if (filter.ramo) {
      dealQuery = dealQuery.eq('ramo', filter.ramo);
    }
    if (filter.produtor) {
      dealQuery = dealQuery.ilike('produtor', `%${filter.produtor}%`);
    }
    if (filter.deal_type) {
      dealQuery = dealQuery.eq('deal_type', filter.deal_type);
    }
    // S5: etapa do funil — "CRM/aba do funil" do PDF
    if (filter.stage_id) {
      dealQuery = dealQuery.eq('stage_id', filter.stage_id);
    }

    const { data: deals, error: dealErr } = await dealQuery.limit(2000);
    if (dealErr) return { ids: [], error: dealErr.message };

    dealContactIds = new Set(
      (deals || []).map((d: any) => d.contact_id).filter(Boolean)
    );

    // If no deals match, no contacts can match — short-circuit
    if (dealContactIds.size === 0) return { ids: [], error: null };
  }

  // Query contacts
  let contactQuery = sb
    .from('marpe_contacts')
    .select('id')
    .not('phone', 'is', null)
    .neq('phone', '');

  if (filter.tags?.length) {
    contactQuery = contactQuery.overlaps('tags', filter.tags);
  }
  if (filter.city) {
    contactQuery = contactQuery.ilike('city', `%${filter.city}%`);
  }
  if (dealContactIds !== null) {
    contactQuery = contactQuery.in('id', Array.from(dealContactIds));
  }
  // S5: grupos ficam FORA por padrão — disparo em massa para grupo é outra coisa
  // (e costuma ser indesejado). Só entra se pedirem explicitamente.
  if (!filter.include_groups) {
    contactQuery = contactQuery.neq('source', 'whatsapp_group');
  }

  const { data: contacts, error: contactErr } = await contactQuery.limit(2000);
  if (contactErr) return { ids: [], error: contactErr.message };

  let ids = [...new Set((contacts || []).map((c: any) => c.id))];

  // S5: "inbox" como fonte — restringe a quem já tem conversa
  if (filter.from_inbox && ids.length) {
    const { data: withMsgs } = await sb
      .from('marpe_messages')
      .select('contact_id')
      .in('contact_id', ids)
      .limit(5000);
    const talked = new Set((withMsgs || []).map((m: any) => m.contact_id));
    ids = ids.filter(id => talked.has(id));
  }

  // S5: contatos adicionados à mão entram mesmo fora do filtro — mas só se
  // tiverem telefone, senão o envio falha na hora e polui o relatório.
  if (filter.manual_ids?.length) {
    const { data: manual } = await sb
      .from('marpe_contacts')
      .select('id')
      .in('id', filter.manual_ids)
      .not('phone', 'is', null)
      .neq('phone', '');
    ids = [...new Set([...ids, ...(manual || []).map((c: any) => c.id)])];
  }

  return { ids, error: null };
}
