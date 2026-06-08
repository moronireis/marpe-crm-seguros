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

  const allowed = ['name', 'color', 'sort_order', 'is_terminal', 'terminal_type'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // If turning off terminal, clear terminal_type
  if ('is_terminal' in updates && !updates.is_terminal) {
    updates.terminal_type = null;
  }

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ error: 'No valid fields to update' }), { status: 400 });
  }

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_funnel_stages')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!data) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  return new Response(JSON.stringify({ stage: data }), { status: 200 });
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  const sb = createServerClient();

  // Block delete if any deals reference this stage
  const { count, error: countError } = await sb
    .from('marpe_deals')
    .select('id', { count: 'exact', head: true })
    .eq('stage_id', id);

  if (countError) return new Response(JSON.stringify({ error: countError.message }), { status: 500 });

  if (count && count > 0) {
    return new Response(
      JSON.stringify({ error: `Etapa possui ${count} negócio(s) ativo(s). Mova-os antes de excluir.` }),
      { status: 409 }
    );
  }

  const { error } = await sb
    .from('marpe_funnel_stages')
    .delete()
    .eq('id', id);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
