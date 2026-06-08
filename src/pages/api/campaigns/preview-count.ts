import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { resolveContactIds } from '../../../lib/campaigns/resolve-contacts';

export const prerender = false;

// POST /api/campaigns/preview-count
// Body: { segment_filter: SegmentFilter }
// Returns: { count: number }
export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const filter = body?.segment_filter || {};
  const sb = createServerClient();

  const { ids, error } = await resolveContactIds(sb, filter);
  if (error) return new Response(JSON.stringify({ error }), { status: 500 });

  return new Response(JSON.stringify({ count: ids.length }), { status: 200 });
};
