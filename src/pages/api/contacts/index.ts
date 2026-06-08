import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();
  const search = url.searchParams.get('search') || '';
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const sourceFilter = url.searchParams.get('source') || '';       // e.g. ?source=whatsapp_group
  const excludeSource = url.searchParams.get('exclude_source') || ''; // e.g. ?exclude_source=whatsapp_group

  // Inbox mode: contacts with at least one message, ordered by most recent message
  // This is the WhatsApp-style conversation list
  const { data: msgContacts, error: msgErr } = await sb
    .from('marpe_messages')
    .select('contact_id, created_at, body, direction')
    .order('created_at', { ascending: false });

  if (msgErr) return new Response(JSON.stringify({ error: msgErr.message }), { status: 500 });

  // Deduplicate — keep only the most recent message per contact
  const seen = new Set<string>();
  const latestByContact: { contact_id: string; body: string; direction: string; created_at: string }[] = [];
  for (const m of (msgContacts || [])) {
    if (!seen.has(m.contact_id)) {
      seen.add(m.contact_id);
      latestByContact.push(m);
    }
  }

  if (latestByContact.length === 0) {
    return new Response(JSON.stringify({ contacts: [], total: 0 }), { status: 200 });
  }

  // Fetch those contacts in order
  const contactIds = latestByContact.map(m => m.contact_id);

  let query = sb
    .from('marpe_contacts')
    .select('id, name, phone, email, city, corp_id, tags, source')
    .in('id', contactIds);

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
  }

  // Source filtering — backward compatible (no param = return all)
  if (sourceFilter) {
    query = query.eq('source', sourceFilter);
  } else if (excludeSource) {
    query = query.neq('source', excludeSource);
  }

  const { data: contacts, error: contactErr } = await query.range(0, 499);
  if (contactErr) return new Response(JSON.stringify({ error: contactErr.message }), { status: 500 });

  // Re-order to match message recency order
  const contactMap = new Map((contacts || []).map((c: any) => [c.id, c]));
  const ordered = latestByContact
    .map(m => {
      const contact = contactMap.get(m.contact_id);
      if (!contact) return null;
      return {
        ...contact,
        last_message: m.body,
        last_message_direction: m.direction,
        last_message_at: m.created_at,
      };
    })
    .filter(Boolean)
    .slice(offset, offset + limit);

  return new Response(JSON.stringify({ contacts: ordered, total: ordered.length }), { status: 200 });
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
    .from('marpe_contacts')
    .insert({
      name: body.name,
      phone: body.phone || null,
      email: body.email || null,
      city: body.city || null,
      state: body.state || null,
      tags: body.tags || [],
      notes: body.notes || null,
      source: 'manual',
      responsible_id: profile.id,
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ contact: data }), { status: 201 });
};
