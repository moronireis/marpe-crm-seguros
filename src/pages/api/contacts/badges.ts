import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

/**
 * GET /api/contacts/badges — R3 (report 29/07): "os contadores precisam estar
 * contabilizando tudo".
 *
 * Os contadores das abas não podem vir da lista carregada: cada aba busca uma
 * fonte diferente (grupos só entram na aba Grupos), então o front nunca enxerga
 * o conjunto inteiro. Este endpoint conta no servidor, com a MESMA regra de
 * não-lida do front (última mensagem é inbound e é mais nova que inbox_read_at).
 */
export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();

  // Última mensagem por contato (janela das 3000 mais recentes — mesmo teto da lista)
  const { data: msgs, error } = await sb
    .from('marpe_messages')
    .select('contact_id, direction, created_at')
    .order('created_at', { ascending: false })
    .limit(3000);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const latest = new Map<string, { direction: string; created_at: string }>();
  for (const m of msgs || []) {
    if (!latest.has(m.contact_id)) latest.set(m.contact_id, m);
  }

  const ids = [...latest.keys()];
  if (!ids.length) {
    return new Response(JSON.stringify({ contatos: 0, grupos: 0, naolidas: 0, atendimento: 0 }), { status: 200 });
  }

  const { data: contacts } = await sb
    .from('marpe_contacts')
    .select('id, source, conv_status, inbox_read_at')
    .in('id', ids);

  // Quatro abas (fluxo de 01/08). "Finalizadas" saiu: conversa finalizada volta a
  // ser um contato comum e é contada em Contatos como qualquer outra.
  const counts = { contatos: 0, grupos: 0, naolidas: 0, atendimento: 0 };
  for (const c of contacts || []) {
    const last = latest.get(c.id)!;
    const unread = last.direction === 'inbound' &&
      (!c.inbox_read_at || new Date(last.created_at) > new Date(c.inbox_read_at));

    if (c.source === 'whatsapp_group') {
      if (unread) counts.grupos++;
      continue;
    }
    if (unread) {
      counts.naolidas++;
      if (c.conv_status === 'atendimento') counts.atendimento++;
      else counts.contatos++;
    }
  }

  return new Response(JSON.stringify(counts), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
