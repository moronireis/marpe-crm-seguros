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
  // S3.5 (issue #3): mesmo modelo do filtro "Não lidas" do Inbox — última mensagem
  // é inbound E mais recente que inbox_read_at (marcada ao abrir a conversa).
  // Antes o badge usava só "última é inbound": a conversa contava até alguém
  // RESPONDER, mesmo já lida. Grupos continuam fora.

  const [messagesResult, contactsResult] = await Promise.all([
    sb
      .from('marpe_messages')
      .select('contact_id, direction, created_at')
      .order('created_at', { ascending: false }),
    sb
      .from('marpe_contacts')
      .select('id, source, inbox_read_at')
      .not('id', 'is', null),
  ]);

  if (messagesResult.error) {
    return new Response(
      JSON.stringify({ error: messagesResult.error.message }),
      { status: 500 }
    );
  }

  const contactInfo = new Map<string, { source: string | null; inbox_read_at: string | null }>(
    (contactsResult.data || []).map((c: any) => [c.id, { source: c.source, inbox_read_at: c.inbox_read_at }])
  );

  // Deduplicate: keep the most recent message per contact
  const seen = new Set<string>();
  let unreadConversations = 0;

  for (const msg of messagesResult.data || []) {
    if (seen.has(msg.contact_id)) continue;
    seen.add(msg.contact_id);

    const info = contactInfo.get(msg.contact_id);
    if (info?.source === 'whatsapp_group') continue;

    if (msg.direction === 'inbound' && (!info?.inbox_read_at || msg.created_at > info.inbox_read_at)) {
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
