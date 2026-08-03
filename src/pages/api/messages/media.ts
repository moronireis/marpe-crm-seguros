import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { normalizePhone } from '../../../lib/whatsapp/send';
import { getInstanceToken } from '../../../lib/whatsapp/instance';

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

  const { contact_id, phone, kind, data, filename, caption, deal_id } = body;
  if (!contact_id || !phone || !kind || !data) {
    return new Response(JSON.stringify({ error: 'contact_id, phone, kind e data são obrigatórios' }), { status: 400 });
  }
  const uazType = KIND_TO_UAZAPI[kind];
  if (!uazType) {
    return new Response(JSON.stringify({ error: `kind inválido: ${kind}` }), { status: 400 });
  }
  // Issue #33: o MIME do MediaRecorder vem com parâmetros ("audio/webm;codecs=opus"),
  // que o regex antigo /^data:([^;]+);base64,/ rejeitava. Localiza o marcador ";base64,"
  // e normaliza o MIME para o tipo puro; a UazapiGO recebe o data-URI reconstruído limpo.
  const raw = String(data);
  const marker = raw.indexOf(';base64,');
  if (!raw.startsWith('data:') || marker === -1 || marker + 8 >= raw.length) {
    return new Response(JSON.stringify({ error: 'data deve ser um data-URI base64' }), { status: 400 });
  }
  const mime = raw.slice(5, marker).split(';')[0].trim() || 'application/octet-stream';
  const b64 = raw.slice(marker + 8);
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length > 45 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'Arquivo acima de 45 MB — envie um arquivo menor' }), { status: 400 });
  }

  const UAZAPI_URL = (import.meta.env.UAZAPI_URL || 'https://u4digital.uazapi.com').trim();
  const UAZAPI_TOKEN = await getInstanceToken();

  const phoneForSend = String(phone).endsWith('@g.us') ? phone : normalizePhone(phone);

  const uaRes = await fetch(`${UAZAPI_URL}/send/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
    body: JSON.stringify({
      number: phoneForSend,
      type: uazType,
      file: `data:${mime};base64,${b64}`,
      ...(caption ? { text: caption } : {}),
      ...(kind === 'document' && filename ? { docName: filename } : {}),
    }),
  });
  const uaData: any = await uaRes.json().catch(() => ({}));
  if (!uaRes.ok) {
    return new Response(JSON.stringify({ error: 'UazapiGO recusou o envio', details: uaData?.message || uaRes.status }), { status: 502 });
  }

  const sb = createServerClient();
  const waId = uaData.messageid || uaData.id || uaData?.message?.id || null;

  // ── Grava a linha ANTES do upload (correção 03/08, testes A2/A3) ────────────
  // Antes, o insert só acontecia depois do upload no Storage (com até 3 tentativas
  // e backoff). Nessa janela o webhook da UazapiGO chegava, não encontrava nada com
  // este wa_message_id e gravava a MESMA mensagem — duplicada no inbox, correta no
  // WhatsApp. Gravando primeiro, o webhook encontra a linha e desiste; a media_url
  // entra depois, por PATCH.
  let { data: saved, error: dbErr } = await sb.from('marpe_messages').insert({
    contact_id,
    // Negócio em pauta na conversa (chamado 3a4d910f)
    deal_id: deal_id || null,
    wa_message_id: waId,
    direction: 'outbound',
    content_type: kind,
    body: caption || (kind === 'document' ? filename || null : null),
    media_url: null,
    media_mime: mime,
    status: 'sent',
    sent_by: profile.id,
    metadata: { sent_via: 'inbox_media', filename: filename || null },
  }).select().single();

  // 23505: o webhook chegou primeiro e já gravou — reaproveita a linha dele
  if (dbErr && (dbErr as any).code === '23505' && waId) {
    const { data: existente } = await sb.from('marpe_messages')
      .select('*').eq('wa_message_id', waId).maybeSingle();
    if (existente) { saved = existente as any; dbErr = null as any; }
  }
  if (dbErr) {
    return new Response(JSON.stringify({ sent: true, saved: false, error: dbErr.message }), { status: 200 });
  }

  // Persiste o binário no nosso Storage (best-effort com retry) para o histórico
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
  if (mediaUrl && saved?.id) {
    const { data: comMidia } = await sb.from('marpe_messages')
      .update({ media_url: mediaUrl }).eq('id', saved.id).select().single();
    if (comMidia) saved = comMidia as any;
  }

  // Aba Atendimento (critério do Tiago, 28/07): responder com mídia também
  // move a conversa para "em atendimento"
  await sb.from('marpe_contacts')
    .update({ conv_status: 'atendimento' })
    .eq('id', contact_id)
    .then(null, () => {});

  return new Response(JSON.stringify({ sent: true, message: saved }), { status: 200 });
};
