import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const PATCH: APIRoute = async ({ locals, request, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const allowed = ['name', 'description', 'sort_order', 'is_active'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 1) {
    return new Response(JSON.stringify({ error: 'No valid fields to update' }), { status: 400 });
  }

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_funnels')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!data) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  return new Response(JSON.stringify({ funnel: data }), { status: 200 });
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  const sb = createServerClient();

  // Soft-delete: set is_active = false
  const { data, error } = await sb
    .from('marpe_funnels')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!data) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
