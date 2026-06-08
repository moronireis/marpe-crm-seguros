import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.funnel_id || !body.name?.trim()) {
    return new Response(JSON.stringify({ error: 'funnel_id and name required' }), { status: 400 });
  }

  const sb = createServerClient();

  // Verify funnel exists
  const { data: funnel } = await sb
    .from('marpe_funnels')
    .select('id')
    .eq('id', body.funnel_id)
    .single();

  if (!funnel) {
    return new Response(JSON.stringify({ error: 'Funnel not found' }), { status: 404 });
  }

  // Get next sort_order within the funnel
  const { data: last } = await sb
    .from('marpe_funnel_stages')
    .select('sort_order')
    .eq('funnel_id', body.funnel_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const sort_order = body.sort_order ?? (last?.sort_order ?? 0) + 1;

  const is_terminal = body.is_terminal ?? false;
  const terminal_type = is_terminal ? (body.terminal_type ?? null) : null;

  const { data, error } = await sb
    .from('marpe_funnel_stages')
    .insert({
      funnel_id: body.funnel_id,
      name: body.name.trim(),
      color: body.color || '#3B82F6',
      sort_order,
      is_terminal,
      terminal_type,
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ stage: data }), { status: 201 });
};
