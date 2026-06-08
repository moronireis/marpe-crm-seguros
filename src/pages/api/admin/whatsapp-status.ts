import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const UAZAPI_URL = import.meta.env.UAZAPI_URL;
  const UAZAPI_TOKEN = import.meta.env.UAZAPI_TOKEN;

  if (!UAZAPI_URL || !UAZAPI_TOKEN) {
    return new Response(JSON.stringify({ connected: false, error: 'Not configured' }), { status: 200 });
  }

  try {
    // UazapiGO uses /instance/status (not /instance/info)
    const res = await fetch(`${UAZAPI_URL}/instance/status?token=${UAZAPI_TOKEN}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ connected: false, status: 'error', http: res.status }), { status: 200 });
    }

    const data = await res.json().catch(() => ({}));

    // UazapiGO response structure:
    // { instance: { status, name, profileName, owner, ... }, status: { connected, jid, loggedIn } }
    const instance = data.instance || {};
    const statusObj = data.status || {};

    const connected = statusObj.connected === true || statusObj.loggedIn === true || instance.status === 'connected';

    return new Response(JSON.stringify({
      connected,
      status: instance.status || (connected ? 'connected' : 'disconnected'),
      phone: instance.owner || statusObj.jid?.split(':')[0] || null,
      name: instance.profileName || instance.name || null,
      instanceName: instance.name || null,
      isBusiness: instance.isBusiness || false,
    }), { status: 200 });

  } catch (e: any) {
    return new Response(JSON.stringify({ connected: false, error: e.message }), { status: 200 });
  }
};
