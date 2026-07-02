import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

/**
 * GET /api/media/download?msgid=WA_MESSAGE_ID
 * Proxies media files from UazapiGO using server-side token auth.
 * Used as fallback when media_url is not stored in DB (e.g. webhook didn't receive base64
 * and the direct URL from UazapiGO requires auth that the browser can't supply).
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const msgId = url.searchParams.get('msgid');
  if (!msgId) return new Response('Missing msgid', { status: 400 });

  const UAZAPI_URL = import.meta.env.UAZAPI_URL || 'https://u4digital.uazapi.com';
  const UAZAPI_TOKEN = import.meta.env.UAZAPI_TOKEN || '';

  // Try UazapiGO download endpoint
  // UazapiGO download media: GET /download/media?token=TOKEN&messageId=MSGID
  let res: Response | null = null;
  const endpoints = [
    `${UAZAPI_URL}/download/media?token=${UAZAPI_TOKEN}&messageId=${encodeURIComponent(msgId)}`,
    `${UAZAPI_URL}/messages/media?token=${UAZAPI_TOKEN}&messageId=${encodeURIComponent(msgId)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const r = await fetch(endpoint, { headers: { token: UAZAPI_TOKEN } });
      if (r.ok) { res = r; break; }
    } catch (_) {}
  }

  if (!res || !res.ok) {
    // As last resort, look up media_url from DB
    const sb = createServerClient();
    const { data: msg } = await sb
      .from('marpe_messages')
      .select('media_url')
      .eq('wa_message_id', msgId)
      .maybeSingle();

    if (msg?.media_url) {
      // Redirect to the stored URL
      return new Response(null, {
        status: 302,
        headers: { Location: msg.media_url },
      });
    }

    return new Response('Media not found', { status: 404 });
  }

  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const contentLength = res.headers.get('content-length');
  const data = await res.arrayBuffer();

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400, immutable',
  };
  if (contentLength) headers['Content-Length'] = contentLength;

  return new Response(data, { status: 200, headers });
};
