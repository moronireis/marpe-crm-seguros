import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/api-auth';
import { createServerClient } from '../../../../lib/supabase-server';

export const prerender = false;

// GET /api/deals/[id]/notes — list notes for a deal
export const GET: APIRoute = async ({ locals, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_deal_notes')
    .select('*, marpe_profiles(id, full_name)')
    .eq('deal_id', id)
    .order('created_at', { ascending: false });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ notes: data }), { status: 200 });
};

// POST /api/deals/[id]/notes — create a note
export const POST: APIRoute = async ({ locals, request, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.content?.trim()) {
    return new Response(JSON.stringify({ error: 'content required' }), { status: 400 });
  }

  const sb = createServerClient();

  const { data, error } = await sb
    .from('marpe_deal_notes')
    .insert({
      deal_id: id,
      user_id: profile.id !== 'mvp-admin' ? profile.id : null,
      content: body.content.trim(),
    })
    .select('*, marpe_profiles(id, full_name)')
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Log activity
  await sb.from('marpe_deal_activities').insert({
    deal_id: id,
    user_id: profile.id !== 'mvp-admin' ? profile.id : null,
    type: 'note_added',
    description: `Nota adicionada`,
    metadata: { note_id: data.id, preview: body.content.trim().slice(0, 100) },
  }).then(null, () => {});

  // Update deal last_activity
  await sb.from('marpe_deals')
    .update({ last_activity: new Date().toISOString() })
    .eq('id', id)
    .then(null, () => {});

  return new Response(JSON.stringify({ note: data }), { status: 201 });
};
