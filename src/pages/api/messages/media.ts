import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { normalizePhone } from '../../../lib/whatsapp/send';

export const prerender = false;

const KIND_TO_UAZAPI: Record<string, string> = {
  image: 'image',
  video: 'video',
  document: 'document',
  audio: 'myaudio', // gravação de voz → chega como mensagem de voz (PTT)
};

function extFromMime(m: string): string {
  const t = m.toLowerCase();
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  if (t.includes('gif')) return 'gif';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('webm')) return 'webm';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  if (t.includes('mp4') && t.startsWith('audio')) return 'm4a';
  if (t.includes('mp4')) return 'mp4';
  if (t.includes('pdf')) return 'pdf';
  if (t.includes('word')) return 'docx';
  if (t.includes('excel') || t.includes('spreadsheet')) return 'xlsx';
  if (t.includes('presentation')) return 'pptx';
  return 'bin';
}

/**
 * POST /api/messages/media — envio de mídia pelo Inbox (Sprint S3, issues #1 #5 #7).
 * Body: { contact_id, phone, kind: image|video|document|audio, data: dataURI,
 *         filename?, caption? }
 * Fluxo: UazapiGO POST /send/media (probe 17/07: image/myaudio/document OK com
 * data-URI; a UazapiGO transcodifica áudio server-side) → persiste o binário no
 * Storage (retry — RLS intermitente Cloudfy) → grava marpe_messages outbound.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { contact_id, phone, kind, data, filename, caption } = body;
  if (!contact_id || !phone || !kind || !data) {
    return new Response(JSON.stringify({ error: 'contact_id, phone, kind e data são obrigatórios' }), { status: 400 });
  }
  const uazType = KIND_TO_UAZAPI[kind];
  if (!uazType) {
    return new Response(JSON.stringify({ error: `kind inválido: ${kind}` }), { status: 400 });
  }
  const m = String(data).match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) {
    return new Response(JSON.stringify({ error: 'data deve ser um data-URI base64' }), { status: 400 });
  }
  const mime = m[1];
  const b64 = m[2];
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length > 45 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'Arquivo acima de 45 MB — envie um arquivo menor' }), { status: 400 });
  }

  const UAZAPI_URL = (import.meta.env.UAZAPI_URL || 'https://u4digital.uazapi.com').trim();
  const UAZAPI_TOKEN = (import.meta.env.UAZAPI_TOKEN || '').trim();

  const phoneForSend = String(phone).endsWith('@g.us') ? phone : normalizePhone(phone);

  const uaRes = await fetch(`${UAZAPI_URL}/send/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
    body: JSON.stringify({
      number: phoneForSend,
      type: uazType,
      file: data,
      ...(caption ? { text: caption } : {}),
      ...(kind === 'document' && filename ? { docName: filename } : {}),
    }),
  });
  const uaData: any = await uaRes.json().catch(() => ({}));
  if (!uaRes.ok) {
    return new Response(JSON.stringify({ error: 'UazapiGO recusou o envio', details: uaData?.message || uaRes.status }), { status: 502 });
  }

  // Persiste o binário no nosso Storage (best-effort com retry) para o histórico
  const sb = createServerClient();
  let mediaUrl: string | null = null;
  const path = `${contact_id}/out_${Date.now()}.${extFromMime(mime)}`;
  for (let i = 0; i < 3 && !mediaUrl; i++) {
    const { error } = await sb.storage.from('marpe-media').upload(path, bytes, { contentType: mime, upsert: true });
    if (!error) {
      mediaUrl = sb.storage.from('marpe-media').getPublicUrl(path).data.publicUrl;
    } else if (i < 2) {
      await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }

  const waId = uaData.messageid || uaData.id || uaData?.message?.id || null;
  const { data: saved, error: dbErr } = await sb.from('marpe_messages').insert({
    contact_id,
    wa_message_id: waId,
    direction: 'outbound',
    content_type: kind,
    body: caption || (kind === 'document' ? filename || null : null),
    media_url: mediaUrl,
    media_mime: mime,
    status: 'sent',
    sent_by: profile.id,
    metadata: { sent_via: 'inbox_media', filename: filename || null },
  }).select().single();

  if (dbErr) {
    return new Response(JSON.stringify({ sent: true, saved: false, error: dbErr.message }), { status: 200 });
  }
  return new Response(JSON.stringify({ sent: true, message: saved }), { status: 200 });
};
