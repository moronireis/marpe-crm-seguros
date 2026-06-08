import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

/**
 * GET /api/notifications/unread
 *
 * Returns:
 *   { unreadConversations: number, pendingDeals: number }
 *
 * unreadConversations — contacts where the latest message is inbound
 *   (client waiting for a reply). Group contacts excluded.
 *
 * pendingDeals — deals with next_action_date <= today (overdue actions).
 */
export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();

  // ── 1. Unread conversations ──────────────────────────────────────────────
  // Fetch all messages ordered newest first, deduplicate by contact,
  // then count those whose latest message is inbound.
  // Exclude group contacts (source = 'whatsapp_group').

  const [messagesResult, groupContactsResult] = await Promise.all([
    sb
      .from('marpe_messages')
      .select('contact_id, direction, created_at')
      .order('created_at', { ascending: false }),
    sb
      .from('marpe_contacts')
      .select('id')
      .eq('source', 'whatsapp_group'),
  ]);

  if (messagesResult.error) {
    return new Response(
      JSON.stringify({ error: messagesResult.error.message }),
      { status: 500 }
    );
  }

  const groupIds = new Set<string>(
    (groupContactsResult.data || []).map((c: { id: string }) => c.id)
  );

  // Deduplicate: keep the most recent message per contact
  const seen = new Set<string>();
  let unreadConversations = 0;

  for (const msg of messagesResult.data || []) {
    if (seen.has(msg.contact_id)) continue;
    seen.add(msg.contact_id);

    // Skip group contacts
    if (groupIds.has(msg.contact_id)) continue;

    // Latest message is inbound → client is waiting
    if (msg.direction === 'inbound') {
      unreadConversations++;
    }
  }

  // ── 2. Pending (overdue) deals ───────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const { count: pendingDeals, error: dealsError } = await sb
    .from('marpe_deals')
    .select('id', { count: 'exact', head: true })
    .lte('next_action_date', today)
    .not('next_action_date', 'is', null);

  if (dealsError) {
    return new Response(
      JSON.stringify({ error: dealsError.message }),
      { status: 500 }
    );
  }

  return new Response(
    JSON.stringify({
      unreadConversations,
      pendingDeals: pendingDeals ?? 0,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
