import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;
  if (profile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_profiles')
    .select('id, full_name, email, phone, role, is_active, created_at')
    .order('created_at');

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ users: data }), { status: 200 });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;
  if (profile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 });
  }

  if (!body.email || !body.password) {
    return new Response(JSON.stringify({ error: 'E-mail e senha são obrigatórios' }), { status: 400 });
  }

  const sb = createServerClient();
  // Create auth user
  const { data: authData, error: authErr } = await sb.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
  });

  if (authErr) {
    return new Response(JSON.stringify({ error: authErr.message }), { status: 400 });
  }

  // Create profile
  const { data: profileData, error: profileErr } = await sb
    .from('marpe_profiles')
    .insert({
      id: authData.user.id,
      email: body.email,
      full_name: body.full_name || body.email.split('@')[0],
      role: body.role || 'operador',
      is_active: true,
    })
    .select()
    .single();

  if (profileErr) {
    return new Response(JSON.stringify({ error: profileErr.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ user: profileData }), { status: 201 });
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;
  if (profile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  const allowed = ['full_name', 'phone', 'role', 'is_active'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_profiles')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ user: data }), { status: 200 });
};
