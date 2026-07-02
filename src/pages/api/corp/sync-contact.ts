import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { syncContactByCorpId } from '../../../lib/corp/sync';

export const prerender = false;

// POST /api/corp/sync-contact
// body: { corp_id: number }
// Syncs a single Corp client's full data (contact + deals + documents) on demand.
export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: { corp_id?: number } = {};
  try { body = await request.json(); } catch {}

  const corpId = Number(body.corp_id);
  if (!corpId || isNaN(corpId)) {
    return new Response(JSON.stringify({ error: 'corp_id required' }), { status: 400 });
  }

  const corpUrl  = import.meta.env.CORP_API_URL;
  const corpEmail = import.meta.env.CORP_API_EMAIL;
  const corpPw   = import.meta.env.CORP_API_PASSWORD;

  if (!corpUrl || !corpEmail || !corpPw) {
    return new Response(JSON.stringify({ ok: false, error: 'Corp credentials not configured on Vercel.' }), { status: 200 });
  }

  try {
    const result = await syncContactByCorpId(corpId);
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
};
