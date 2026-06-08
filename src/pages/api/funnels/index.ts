import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const includeInactive = url.searchParams.get('include_inactive') === '1';

  const sb = createServerClient();
  let query = sb
    .from('marpe_funnels')
    .select('*, marpe_funnel_stages(id, name, color, sort_order, is_terminal, terminal_type)')
    .order('sort_order');

  if (!includeInactive) query = query.eq('is_active', true);

  const { data: funnels, error } = await query;

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Sort stages within each funnel
  const sorted = funnels?.map(f => ({
    ...f,
    stages: (f.marpe_funnel_stages || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    marpe_funnel_stages: undefined,
  }));

  return new Response(JSON.stringify({ funnels: sorted }), { status: 200 });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.name?.trim()) {
    return new Response(JSON.stringify({ error: 'name required' }), { status: 400 });
  }

  const sb = createServerClient();

  // Get next sort_order
  const { data: last } = await sb
    .from('marpe_funnels')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const sort_order = (last?.sort_order ?? 0) + 1;

  const { data, error } = await sb
    .from('marpe_funnels')
    .insert({
      name: body.name.trim(),
      description: body.description?.trim() || null,
      sort_order,
      is_active: true,
      created_by: profile.id,
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ funnel: data }), { status: 201 });
};
