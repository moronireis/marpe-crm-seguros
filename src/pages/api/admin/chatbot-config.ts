import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();
  const { data } = await sb
    .from('marpe_settings')
    .select('value')
    .eq('key', 'chatbot')
    .maybeSingle();

  const enabled = data?.value?.enabled ?? true;

  // Also fetch the welcome message
  const { data: msgData } = await sb
    .from('marpe_settings')
    .select('value')
    .eq('key', 'chatbot_welcome_message')
    .maybeSingle();

  const welcome_message = msgData?.value?.message || '';
  return new Response(JSON.stringify({ enabled, welcome_message }), { status: 200 });
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (typeof body.enabled !== 'boolean') {
    return new Response(JSON.stringify({ error: '`enabled` (boolean) required' }), { status: 400 });
  }

  const sb = createServerClient();
  await sb
    .from('marpe_settings')
    .upsert({ key: 'chatbot', value: { enabled: body.enabled }, updated_at: new Date().toISOString() });

  // Save welcome message if provided
  if (typeof body.welcome_message === 'string') {
    await sb
      .from('marpe_settings')
      .upsert({ key: 'chatbot_welcome_message', value: { message: body.welcome_message }, updated_at: new Date().toISOString() });
  }

  return new Response(JSON.stringify({ enabled: body.enabled }), { status: 200 });
};
