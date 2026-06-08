import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/api-auth';
import { syncAll, syncClientes, syncDocumentos, syncNegocios } from '../../../lib/corp/sync';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAdmin(locals);
  if (profile instanceof Response) return profile;

  let body: { type?: string } = {};
  try { body = await request.json(); } catch {}

  const type = body.type || 'all';

  try {
    let results;
    switch (type) {
      case 'clientes':
        results = [await syncClientes()];
        break;
      case 'documentos':
        results = [await syncDocumentos('01/01/2025', '26/05/2026')];
        break;
      case 'negocios':
        results = [await syncNegocios()];
        break;
      default:
        results = await syncAll();
    }
    return new Response(JSON.stringify({ ok: true, results }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
