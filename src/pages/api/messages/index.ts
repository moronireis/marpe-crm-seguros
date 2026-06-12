import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { interpolateVariables } from '../../../lib/variables';

export const prerender = false;

// GET /api/messages?contact_id=xxx — list messages for a contact
export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const contactId = url.searchParams.get('contact_id');
  const dealId = url.searchParams.get('deal_id');
  if (!contactId && !dealId) return new Response(JSON.stringify({ error: 'contact_id or deal_id required' }), { status: 400 });

  const sb = createServerClient();
  let query = sb.from('marpe_messages').select('*').order('created_at', { ascending: true }).limit(200);
  if (dealId) query = query.eq('deal_id', dealId);
  else if (contactId) query = query.eq('contact_id', contactId);
  const { data, error } = await query;

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ messages: data }), { status: 200 });
};

// POST /api/messages — send a message via UaZapi
export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: { contact_id?: string; phone?: string; text?: string; deal_id?: string };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.phone || !body.text) {
    return new Response(JSON.stringify({ error: 'phone and text required' }), { status: 400 });
  }

  // Resolve contact for variable interpolation (best-effort — does not block send)
  let resolvedContact: { name?: string; phone?: string; email?: string; city?: string } | undefined;
  if (body.contact_id) {
    const sb = createServerClient();
    const { data: contactRow } = await sb
      .from('marpe_contacts')
      .select('name, phone, email, city')
      .eq('id', body.contact_id)
      .single();
    if (contactRow) resolvedContact = contactRow;
  }

  // Interpolate template variables before sending
  const finalText = interpolateVariables(body.text, {
    contact: resolvedContact ?? { phone: body.phone },
  });

  const UAZAPI_URL = import.meta.env.UAZAPI_URL || 'https://u4digital.uazapi.com';
  const UAZAPI_TOKEN = import.meta.env.UAZAPI_TOKEN || '';

  // Send via UaZapi
  const uaRes = await fetch(`${UAZAPI_URL}/send/text?token=${UAZAPI_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: body.phone.replace(/\D/g, ''), text: finalText }),
  });

  const uaData = await uaRes.json().catch(() => ({}));

  if (!uaRes.ok && !uaData.messageid) {
    return new Response(JSON.stringify({ error: 'Failed to send', details: uaData }), { status: 500 });
  }

  // Save to DB
  const sb = createServerClient();
  if (body.contact_id) {
    await sb.from('marpe_messages').insert({
      contact_id: body.contact_id,
      deal_id: body.deal_id || null,
      wa_message_id: uaData.messageid || null,
      direction: 'outbound',
      content_type: 'text',
      body: finalText,
      status: 'sent',
      sent_by: profile.id !== 'mvp-admin' ? profile.id : null,
    });
  }

  return new Response(JSON.stringify({ ok: true, messageid: uaData.messageid }), { status: 200 });
};
