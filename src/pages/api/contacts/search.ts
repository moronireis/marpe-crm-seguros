import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

// Dedicated search endpoint for all contacts (not inbox-gated)
// Used by the New Deal modal contact type-ahead
export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const search = url.searchParams.get('search') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

  const sb = createServerClient();

  let query = sb
    .from('marpe_contacts')
    .select('id, name, phone, email, city')
    .order('name', { ascending: true })
    .limit(limit);

  if (search.trim()) {
    query = query.or(
      `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ contacts: data || [] }), { status: 200 });
};
