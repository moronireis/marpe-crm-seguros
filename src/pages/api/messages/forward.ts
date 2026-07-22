import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { normalizePhone } from '../../../lib/whatsapp/send';

export const prerender = false;

/**
 * POST /api/messages/forward — issue #32 (board 22/07).
 * Body: { message_id, target_contact_id }
 * Texto → /send/text; mídia → rebaixa o binário do nosso Storage (media_url) e
 * reenvia via /send/media. Mídia sem cópia no Storage (expirada) → 409.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  const { message_id, target_contact_id } = body;
  if (!message_id || !target_contact_id) {
    return new Response(JSON.stringify({ error: 'message_id e target_contact_id são obrigatórios' }), { status: 400 });
  }

  const sb = createServerClient();
  const { data: msg } = await sb.from('marpe_messages').select('*').eq('id', message_id).maybeSingle();
  if (!msg) return new Response(JSON.stringify({ error: 'Mensagem não encontrada' }), { status: 404 });

  const { data: target } = await sb.from('marpe_contacts').select('id, phone').eq('id', target_contact_id).maybeSingle();
  if (!target?.phone) return new Response(JSON.stringify({ error: 'Contato de destino sem telefone' }), { status: 400 });

  const UAZAPI_URL = (import.meta.env.UAZAPI_URL || 'https://u4digital.uazapi.com').trim();
  const UAZAPI_TOKEN = (import.meta.env.UAZAPI_TOKEN || '').trim();
  const phoneForSend = String(target.phone).endsWith('@g.us') ? target.phone : normalizePhone(target.phone);

  let uaData: any = {};
  if (msg.content_type === 'text' || !msg.content_type) {
    if (!msg.body?.trim()) return new Response(JSON.stringify({ error: 'Mensagem vazia' }), { status: 400 });
    const uaRes = await fetch(`${UAZAPI_URL}/send/text?token=${UAZAPI_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phoneForSend, text: msg.body }),
    });
    uaData = await uaRes.json().catch(() => ({}));
    if (!uaRes.ok && !uaData.messageid) {
      return new Response(JSON.stringify({ error: 'UazapiGO recusou o envio', details: uaData?.message || uaRes.status }), { status: 502 });
    }
  } else {
    // Mídia: precisa da cópia persistida no nosso Storage
    if (!msg.media_url) {
      return new Response(JSON.stringify({ error: 'Mídia expirada — sem cópia disponível para encaminhar' }), { status: 409 });
    }
    const binRes = await fetch(msg.media_url).catch(() => null);
    if (!binRes?.ok) {
      return new Response(JSON.stringify({ error: 'Não foi possível baixar a mídia do histórico' }), { status: 502 });
    }
    const buf = Buffer.from(await binRes.arrayBuffer());
    if (buf.length > 45 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Mídia acima de 45 MB' }), { status: 400 });
    }
    const mime = (msg.media_mime || binRes.headers.get('content-type') || 'application/octet-stream').split(';')[0];
    const typeMap: Record<string, string> = { image: 'image', video: 'video', document: 'document', audio: 'myaudio' };
    const uazType = typeMap[msg.content_type] || 'document';
    const filename = msg.metadata?.filename || msg.body || 'documento';
    const uaRes = await fetch(`${UAZAPI_URL}/send/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
      body: JSON.stringify({
        number: phoneForSend,
        type: uazType,
        file: `data:${mime};base64,${buf.toString('base64')}`,
        ...(uazType === 'document' ? { docName: filename } : {}),
      }),
    });
    uaData = await uaRes.json().catch(() => ({}));
    if (!uaRes.ok) {
      return new Response(JSON.stringify({ error: 'UazapiGO recusou o envio', details: uaData?.message || uaRes.status }), { status: 502 });
    }
  }

  const waId = uaData.messageid || uaData.id || uaData?.message?.id || null;
  const { data: saved } = await sb.from('marpe_messages').insert({
    contact_id: target.id,
    wa_message_id: waId,
    direction: 'outbound',
    content_type: msg.content_type || 'text',
    body: msg.body,
    media_url: msg.media_url,
    media_mime: msg.media_mime,
    status: 'sent',
    sent_by: profile.id !== 'mvp-admin' ? profile.id : null,
    metadata: { forwarded_from: msg.id },
  }).select().single();

  return new Response(JSON.stringify({ ok: true, message: saved }), { status: 200 });
};
