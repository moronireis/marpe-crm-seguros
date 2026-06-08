import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_automations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ automations: data }), { status: 200 });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.name || !body.trigger_type || !body.action_type) {
    return new Response(JSON.stringify({ error: 'name, trigger_type, action_type required' }), { status: 400 });
  }

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_automations')
    .insert({
      name: body.name,
      description: body.description || null,
      is_active: body.is_active ?? true,
      trigger_type: body.trigger_type,
      trigger_config: body.trigger_config || {},
      action_type: body.action_type,
      action_config: body.action_config || {},
      created_by: profile.id,
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ automation: data }), { status: 201 });
};
