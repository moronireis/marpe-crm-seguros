import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ locals, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'ID obrigatório' }), { status: 400 });

  const sb = createServerClient();

  const [linkResult, clicksResult] = await Promise.all([
    sb.from('marpe_tracked_links').select('*').eq('id', id).single(),
    sb.from('marpe_link_clicks')
      .select('id, ip_address, user_agent, created_at')
      .eq('link_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  if (linkResult.error) {
    const status = linkResult.error.code === 'PGRST116' ? 404 : 500;
    return new Response(JSON.stringify({ error: linkResult.error.message }), { status });
  }

  return new Response(
    JSON.stringify({ link: linkResult.data, clicks: clicksResult.data || [] }),
    { status: 200 }
  );
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'ID obrigatório' }), { status: 400 });

  const sb = createServerClient();
  const { error } = await sb.from('marpe_tracked_links').delete().eq('id', id);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
