import type { APIRoute } from 'astro';
import { createServerClient } from '../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const { code } = params;

  if (!code) {
    return new Response(null, { status: 302, headers: { Location: '/' } });
  }

  const sb = createServerClient();

  // Look up the slug
  const { data: link, error } = await sb
    .from('marpe_tracked_links')
    .select('id, original_url, click_count')
    .eq('slug', code)
    .maybeSingle();

  if (error || !link) {
    return new Response(null, { status: 302, headers: { Location: '/' } });
  }

  // Log click and increment count (fire-and-forget — do not block the redirect)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('cf-connecting-ip')
    || null;
  const userAgent = request.headers.get('user-agent') || null;

  sb.from('marpe_link_clicks')
    .insert({ link_id: link.id, ip_address: ip, user_agent: userAgent })
    .then(() =>
      sb.from('marpe_tracked_links')
        .update({ click_count: link.click_count + 1 })
        .eq('id', link.id)
    );

  return new Response(null, {
    status: 302,
    headers: { Location: link.original_url },
  });
};
