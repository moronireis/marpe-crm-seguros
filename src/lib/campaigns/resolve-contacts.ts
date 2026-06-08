import { createServerClient } from '../supabase-server';

export interface SegmentFilter {
  tags?: string[];
  ramo?: string;
  city?: string;
  produtor?: string;
  deal_type?: string;
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

  const needsDeals = filter.ramo || filter.produtor || filter.deal_type;
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

  const { data: contacts, error: contactErr } = await contactQuery.limit(2000);
  if (contactErr) return { ids: [], error: contactErr.message };

  // Deduplicate (should already be unique by PK, safety net)
  const ids = [...new Set((contacts || []).map((c: any) => c.id))];
  return { ids, error: null };
}
