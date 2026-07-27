import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { getInstanceToken, uazapiUrl } from '../../../lib/whatsapp/instance';

export const prerender = false;

/**
 * POST /api/messages/react — S2 (27/07), pedido do PDF do Inbox ("permitir reagir").
 *
 * Body: { message_id, emoji }  — emoji vazio remove a reação (é como o WhatsApp faz).
 *
 * Payload da Uazapi descoberto por probe: POST /message/react { id, text }.
 * O `id` é o wa_message_id (id da mensagem no WhatsApp), NÃO o uuid do nosso banco —
 * mensagem sem wa_message_id (ex.: registro antigo) não tem como ser reagida.
 *
 * A reação fica em metadata.reaction do nosso registro; não criamos linha nova,
 * senão a reação apareceria como mensagem na conversa.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const messageId = String(body.message_id || '').trim();
  // string vazia = remover reação
  const emoji = typeof body.emoji === 'string' ? body.emoji.trim() : '';
  if (!messageId) {
    return new Response(JSON.stringify({ error: 'message_id é obrigatório' }), { status: 400 });
  }

  const sb = createServerClient();
  const { data: msg } = await sb
    .from('marpe_messages')
    .select('id, wa_message_id, metadata')
    .eq('id', messageId)
    .maybeSingle();

  if (!msg) return new Response(JSON.stringify({ error: 'Mensagem não encontrada' }), { status: 404 });
  if (!msg.wa_message_id) {
    return new Response(JSON.stringify({
      error: 'Esta mensagem não tem identificador do WhatsApp — não dá para reagir.',
    }), { status: 409 });
  }

  const res = await fetch(`${uazapiUrl()}/message/react`, {
    method: 'POST',
    headers: { token: await getInstanceToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: msg.wa_message_id, text: emoji }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);

  if (!res) {
    return new Response(JSON.stringify({ error: 'Sem resposta da Uazapi' }), { status: 502 });
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({} as any));
    return new Response(JSON.stringify({
      error: res.status === 404
        ? 'O WhatsApp não encontrou mais essa mensagem para reagir.'
        : `Uazapi recusou a reação (${res.status}): ${d?.error || d?.message || 'sem detalhe'}`,
    }), { status: 502 });
  }

  const metadata = {
    ...(msg.metadata || {}),
    reaction: emoji || null,
    reaction_by: profile.id !== 'mvp-admin' ? profile.id : null,
    reaction_at: emoji ? new Date().toISOString() : null,
  };
  await sb.from('marpe_messages').update({ metadata }).eq('id', msg.id);

  return new Response(JSON.stringify({ ok: true, reaction: emoji || null }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
