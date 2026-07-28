import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { normalizePhone } from '../../../lib/whatsapp/send';
import { getInstanceToken } from '../../../lib/whatsapp/instance';

export const prerender = false;

/**
 * POST /api/messages/forward — issue #32 (board 22/07), ampliado no S1 #13/#14 (27/07).
 *
 * Aceita N mensagens × N destinos (era 1×1):
 *   { message_ids: [...], target_contact_ids: [...] }
 * As formas antigas `message_id` / `target_contact_id` continuam valendo — o
 * DealTabConversas e o modal antigo ainda chamam assim.
 *
 * Texto → /send/text; mídia → rebaixa o binário do nosso Storage (media_url) e
 * reenvia via /send/media. Mídia sem cópia no Storage (expirada) → conta como
 * falha daquele par, sem derrubar o resto do lote.
 *
 * Resposta 207-like: { ok, sent, failed, results[] } — o cliente mostra o que
 * passou e o que não passou, em vez de um erro único que esconde o parcial.
 */

const asArray = (v: any): string[] =>
  (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean);

export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const messageIds = asArray(body.message_ids ?? body.message_id);
  const targetIds = asArray(body.target_contact_ids ?? body.target_contact_id);
  if (!messageIds.length || !targetIds.length) {
    return new Response(JSON.stringify({ error: 'Selecione ao menos uma mensagem e um destino' }), { status: 400 });
  }
  // Teto de segurança: 30 mensagens × 30 contatos já seria disparo em massa —
  // isso é encaminhamento, campanha tem módulo próprio.
  if (messageIds.length > 30 || targetIds.length > 30) {
    return new Response(JSON.stringify({ error: 'Limite de 30 mensagens e 30 destinos por encaminhamento' }), { status: 400 });
  }

  const sb = createServerClient();

  const { data: msgs } = await sb.from('marpe_messages').select('*').in('id', messageIds);
  if (!msgs?.length) return new Response(JSON.stringify({ error: 'Mensagem não encontrada' }), { status: 404 });
  // Ordem cronológica: encaminhar 5 mensagens tem que chegar na ordem da conversa
  msgs.sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));

  const { data: targets } = await sb.from('marpe_contacts').select('id, name, phone').in('id', targetIds);
  if (!targets?.length) return new Response(JSON.stringify({ error: 'Contato de destino não encontrado' }), { status: 404 });

  const UAZAPI_URL = (import.meta.env.UAZAPI_URL || 'https://u4digital.uazapi.com').trim();
  const UAZAPI_TOKEN = await getInstanceToken();

  // Baixa cada mídia UMA vez, mesmo indo para vários destinos
  const mediaCache = new Map<string, { b64: string; mime: string } | null>();
  async function loadMedia(msg: any): Promise<{ b64: string; mime: string } | null> {
    if (mediaCache.has(msg.id)) return mediaCache.get(msg.id)!;
    let out: { b64: string; mime: string } | null = null;
    if (msg.media_url) {
      const binRes = await fetch(msg.media_url).catch(() => null);
      if (binRes?.ok) {
        const buf = Buffer.from(await binRes.arrayBuffer());
        if (buf.length <= 45 * 1024 * 1024) {
          const mime = (msg.media_mime || binRes.headers.get('content-type') || 'application/octet-stream').split(';')[0];
          out = { b64: buf.toString('base64'), mime };
        }
      }
    }
    mediaCache.set(msg.id, out);
    return out;
  }

  const results: Array<{ message_id: string; contact_id: string; contact_name: string | null; ok: boolean; error?: string }> = [];

  for (const target of targets) {
    const phoneForSend = String(target.phone || '').endsWith('@g.us')
      ? target.phone
      : normalizePhone(target.phone || '');

    for (const msg of msgs) {
      const tag = { message_id: msg.id, contact_id: target.id, contact_name: target.name ?? null };

      if (!target.phone) { results.push({ ...tag, ok: false, error: 'Contato sem telefone' }); continue; }

      try {
        let uaData: any = {};
        const isText = msg.content_type === 'text' || !msg.content_type;

        if (isText) {
          if (!msg.body?.trim()) { results.push({ ...tag, ok: false, error: 'Mensagem vazia' }); continue; }
          const uaRes = await fetch(`${UAZAPI_URL}/send/text?token=${UAZAPI_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: phoneForSend, text: msg.body }),
          });
          uaData = await uaRes.json().catch(() => ({}));
          if (!uaRes.ok && !uaData.messageid) {
            results.push({ ...tag, ok: false, error: uaData?.message || `UazapiGO ${uaRes.status}` });
            continue;
          }
        } else {
          const media = await loadMedia(msg);
          if (!media) {
            results.push({ ...tag, ok: false, error: 'Mídia expirada — sem cópia para encaminhar' });
            continue;
          }
          const typeMap: Record<string, string> = { image: 'image', video: 'video', document: 'document', audio: 'myaudio' };
          const uazType = typeMap[msg.content_type] || 'document';
          const filename = msg.metadata?.filename || msg.body || 'documento';
          const uaRes = await fetch(`${UAZAPI_URL}/send/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
            body: JSON.stringify({
              number: phoneForSend,
              type: uazType,
              file: `data:${media.mime};base64,${media.b64}`,
              ...(uazType === 'document' ? { docName: filename } : {}),
            }),
          });
          uaData = await uaRes.json().catch(() => ({}));
          if (!uaRes.ok) {
            results.push({ ...tag, ok: false, error: uaData?.message || `UazapiGO ${uaRes.status}` });
            continue;
          }
        }

        const waId = uaData.messageid || uaData.id || uaData?.message?.id || null;
        await sb.from('marpe_messages').insert({
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
        });
        // Aba Atendimento (28/07): encaminhar é uma interação nossa com o destino
        await sb.from('marpe_contacts')
          .update({ conv_status: 'atendimento' })
          .eq('id', target.id)
          .then(null, () => {});
        results.push({ ...tag, ok: true });
      } catch (e: any) {
        results.push({ ...tag, ok: false, error: e?.message || 'Falha inesperada' });
      }
    }
  }

  const sent = results.filter(r => r.ok).length;
  const failed = results.length - sent;
  return new Response(JSON.stringify({ ok: failed === 0, sent, failed, results }), {
    status: sent === 0 ? 502 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
