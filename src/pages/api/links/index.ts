import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

/** Generate a random 6-char alphanumeric slug */
function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_tracked_links')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ links: data }), { status: 200 });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 });
  }

  if (!body.name || !body.original_url) {
    return new Response(JSON.stringify({ error: 'name e original_url são obrigatórios' }), { status: 400 });
  }

  const sb = createServerClient();

  // Generate unique slug (retry up to 5 times on collision)
  let slug = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateSlug();
    const { data: existing } = await sb
      .from('marpe_tracked_links')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (!existing) { slug = candidate; break; }
  }
  if (!slug) {
    return new Response(JSON.stringify({ error: 'Não foi possível gerar slug único' }), { status: 500 });
  }

  const { data, error } = await sb
    .from('marpe_tracked_links')
    .insert({
      name: body.name,
      original_url: body.original_url,
      slug,
      source: body.source || null,
      created_by: profile.id,
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ link: data }), { status: 201 });
};
