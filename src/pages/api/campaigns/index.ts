import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_campaigns')
    .select('*, marpe_templates(id, name, body)')
    .order('created_at', { ascending: false });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ campaigns: data }), { status: 200 });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.name) {
    return new Response(JSON.stringify({ error: 'name required' }), { status: 400 });
  }

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_campaigns')
    .insert({
      name: body.name,
      template_id: body.template_id || null,
      segment_filter: body.segment_filter || {},
      status: 'draft',
      scheduled_at: body.scheduled_at || null,
      created_by: profile.id,
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ campaign: data }), { status: 201 });
};
