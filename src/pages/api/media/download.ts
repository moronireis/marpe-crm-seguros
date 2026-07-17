import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

/**
 * GET /api/media/download?msgid=WA_MESSAGE_ID
 * Fallback de mídia quando a mensagem não tem media_url persistida (ou tem URL
 * inválida do CDN do WhatsApp — expira e é criptografada).
 *
 * Reescrito 17/07 (issue #21): usa a rota REAL da UazapiGO
 * (POST /message/download { id } → { fileURL, mimetype }, arquivo já
 * descriptografado) e é SELF-HEALING — persiste a mídia recuperada no Storage e
 * atualiza a mensagem, para os próximos acessos serem diretos.
 * Mídia irrecuperável → 410 (o front mostra "Mídia expirada").
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const msgId = url.searchParams.get('msgid');
  if (!msgId) return new Response('Missing msgid', { status: 400 });

  const UAZAPI_URL = (import.meta.env.UAZAPI_URL || 'https://u4digital.uazapi.com').trim();
  const UAZAPI_TOKEN = (import.meta.env.UAZAPI_TOKEN || '').trim();
  const sb = createServerClient();

  const { data: msg } = await sb
    .from('marpe_messages')
    .select('id, contact_id, media_url, media_mime, metadata')
    .eq('wa_message_id', msgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // URL persistida no Storage → redireciona direto (whatsapp.net NÃO conta:
  // conteúdo criptografado/expirado)
  if (msg?.media_url && !msg.media_url.includes('whatsapp.net')) {
    return new Response(null, { status: 302, headers: { Location: msg.media_url } });
  }

  // Já marcado como expirado em tentativa anterior → não bater na UazapiGO de novo
  if (msg?.metadata?.media_expired) {
    return new Response('Mídia expirada', { status: 410 });
  }

  // Recupera da UazapiGO
  let fileURL: string | null = null;
  let mimetype: string | null = null;
  try {
    const dlRes = await fetch(`${UAZAPI_URL}/message/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
      body: JSON.stringify({ id: msgId }),
    });
    if (dlRes.ok) {
      const dlData: any = await dlRes.json().catch(() => null);
      fileURL = dlData?.fileURL || null;
      mimetype = dlData?.mimetype || null;
    }
  } catch (_) { /* trata abaixo */ }

  if (!fileURL) {
    // Irrecuperável: marca para não re-tentar a cada render
    if (msg?.id) {
      await sb.from('marpe_messages').update({
        media_url: null,
        metadata: { ...(msg.metadata || {}), media_expired: true },
      }).eq('id', msg.id);
    }
    return new Response('Mídia expirada', { status: 410 });
  }

  const fileRes = await fetch(fileURL).catch(() => null);
  if (!fileRes || !fileRes.ok) return new Response('Falha ao baixar mídia', { status: 502 });

  const contentType = (mimetype || fileRes.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
  const bytes = Buffer.from(await fileRes.arrayBuffer());

  // Self-healing: persiste no Storage e atualiza a mensagem (best-effort — se o
  // storage falhar (RLS intermitente Cloudfy), ainda serve os bytes desta vez)
  if (msg?.id && msg.contact_id) {
    const ext = contentType.includes('jpeg') ? 'jpg'
      : contentType.includes('png') ? 'png'
      : contentType.includes('webp') ? 'webp'
      : contentType.includes('ogg') ? 'ogg'
      : contentType.includes('mpeg') ? 'mp3'
      : contentType.includes('mp4') && contentType.startsWith('audio') ? 'm4a'
      : contentType.includes('mp4') ? 'mp4'
      : contentType.includes('pdf') ? 'pdf'
      : 'bin';
    const filePath = `${msg.contact_id}/${msgId}.${ext}`;
    const { error: upErr } = await sb.storage
      .from('marpe-media')
      .upload(filePath, bytes, { contentType, upsert: true });
    if (!upErr) {
      const { data: urlData } = sb.storage.from('marpe-media').getPublicUrl(filePath);
      await sb.from('marpe_messages').update({
        media_url: urlData.publicUrl,
        media_mime: contentType,
      }).eq('id', msg.id);
    }
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=3600',
    },
  });
};
