import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

const uazapi = () => ({
  url: import.meta.env.UAZAPI_URL || '',
  token: import.meta.env.UAZAPI_TOKEN || '',
});

// GET — fetch QR code
// UazapiGO flow: POST /instance/connect starts connecting and returns qrcode in response.
// While connecting, GET /instance/status also has qrcode in instance.qrcode field.
// So GET here: check status first — if connecting and has QR, return it. Otherwise trigger connect.
export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { url, token } = uazapi();
  if (!url || !token) {
    return json({ error: 'WhatsApp not configured' }, 503);
  }

  try {
    // First check current status — if connecting, QR might already be there
    const statusRes = await fetch(`${url}/instance/status?token=${token}`, {
      signal: AbortSignal.timeout(8000),
    });
    const statusData = statusRes.ok ? await statusRes.json().catch(() => ({})) : {};
    const instance = statusData.instance || {};
    const st = statusData.status || {};

    // Already connected — no QR needed
    if (st.connected || st.loggedIn || instance.status === 'connected') {
      return json({
        connected: true,
        status: 'connected',
        phone: instance.owner || st.jid?.split(':')[0] || null,
        name: instance.profileName || instance.name || null,
      });
    }

    // If status is "connecting" and QR is present, return it
    if (instance.status === 'connecting' && instance.qrcode) {
      return json({ qrcode: instance.qrcode, status: 'connecting' });
    }

    // Otherwise, trigger connect to generate a fresh QR
    const connectRes = await fetch(`${url}/instance/connect?token=${token}`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
    });

    if (!connectRes.ok) {
      return json({ error: `UazapiGO connect error ${connectRes.status}` }, connectRes.status);
    }

    const connectData = await connectRes.json().catch(() => ({}));

    // The connect response has qrcode directly in the root
    const qrcode = connectData.qrcode || connectData.instance?.qrcode || null;

    if (!qrcode) {
      // Maybe it connected immediately (already paired)
      if (connectData.connected || connectData.status?.connected) {
        return json({
          connected: true,
          status: 'connected',
          phone: connectData.instance?.owner || null,
          name: connectData.instance?.profileName || null,
        });
      }
      return json({ error: 'QR code not available', raw: connectData }, 503);
    }

    return json({ qrcode, status: 'connecting' });

  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
};

// POST — actions: disconnect, connect, restart
export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { url, token } = uazapi();
  if (!url || !token) {
    return json({ error: 'WhatsApp not configured' }, 503);
  }

  let body: { action?: string } = {};
  try { body = await request.json(); } catch {}

  const action = body.action;

  const ACTIONS: Record<string, { method: string; path: string }> = {
    disconnect: { method: 'POST', path: '/instance/disconnect' },
    connect: { method: 'POST', path: '/instance/connect' },
  };

  const target = ACTIONS[action || ''];
  if (!target) {
    return json({ error: 'action must be "disconnect" or "connect"' }, 400);
  }

  try {
    const res = await fetch(`${url}${target.path}?token=${token}`, {
      method: target.method,
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => ({}));

    // On disconnect: clear all WhatsApp messages and WhatsApp-sourced contacts
    if (action === 'disconnect' && res.ok) {
      const sb = createServerClient();
      // Delete all messages (they belong to the disconnected session)
      await sb.from('marpe_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      // Delete WhatsApp-sourced contacts (keep corp_sync and manual)
      await sb.from('marpe_contacts').delete().eq('source', 'whatsapp');
      await sb.from('marpe_contacts').delete().eq('source', 'whatsapp_group');
      return json({ ok: true, cleared: true, ...data });
    }

    // For connect action, extract QR if present
    if (action === 'connect' && data.qrcode) {
      return json({ ok: true, qrcode: data.qrcode, status: 'connecting' });
    }

    return json({ ok: res.ok, ...data }, res.ok ? 200 : res.status);

  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
