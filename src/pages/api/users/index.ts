import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

// Public (any authenticated user) endpoint to list active users.
// Used by CrmBoard filter for "Responsável".
export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_profiles')
    .select('id, full_name, email, role')
    .eq('is_active', true)
    .order('full_name');

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ users: data }), { status: 200 });
};
