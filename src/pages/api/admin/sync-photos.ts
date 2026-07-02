import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

const UAZAPI_URL = import.meta.env.UAZAPI_URL || '';
const UAZAPI_TOKEN = import.meta.env.UAZAPI_TOKEN || '';

// Attempt to fetch a profile picture URL from UazapiGO for a given phone number.
// Tries multiple endpoint patterns — UazapiGO versions differ.
async function fetchProfilePic(phone: string): Promise<string | null> {
  const endpoints = [
    // Pattern 1: POST /contacts/profile-picture
    async () => {
      const r = await fetch(`${UAZAPI_URL}/contacts/profile-picture?token=${UAZAPI_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      return d?.profilePicUrl || d?.url || d?.image || d?.photo || null;
    },
    // Pattern 2: GET /contact/profile-picture?token=&number=
    async () => {
      const r = await fetch(`${UAZAPI_URL}/contact/profile-picture?token=${UAZAPI_TOKEN}&number=${encodeURIComponent(phone)}`);
      if (!r.ok) return null;
      const d = await r.json();
      return d?.profilePicUrl || d?.url || d?.image || d?.photo || null;
    },
    // Pattern 3: POST /contact/get (returns full contact info including photo)
    async () => {
      const r = await fetch(`${UAZAPI_URL}/contact/get?token=${UAZAPI_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      return d?.profilePicUrl || d?.pictureUrl || d?.photo || d?.image || null;
    },
    // Pattern 4: POST /contacts/get
    async () => {
      const r = await fetch(`${UAZAPI_URL}/contacts/get?token=${UAZAPI_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      return d?.profilePicUrl || d?.pictureUrl || d?.photo || d?.image || null;
    },
  ];

  for (const attempt of endpoints) {
    try {
      const url = await attempt();
      if (url && typeof url === 'string' && url.startsWith('http')) return url;
    } catch {
      // try next
    }
  }
  return null;
}

// POST /api/admin/sync-photos
// Body: { limit?: number, offset?: number } — defaults to 50 contacts per batch
// Returns: { updated, skipped, failed, next_offset }
export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAdmin(locals);
  if (profile instanceof Response) return profile;

  let body: any = {};
  try { body = await request.json(); } catch { /* defaults */ }

  const batchLimit = Math.min(Number(body.limit) || 50, 100);
  const offset = Number(body.offset) || 0;

  const sb = createServerClient();

  // Fetch contacts that have a WhatsApp phone number but no photo yet
  // Only individual contacts (not groups — group JIDs end in @g.us)
  const { data: contacts, error } = await sb
    .from('marpe_contacts')
    .select('id, phone, photo_url')
    .is('photo_url', null)
    .not('phone', 'ilike', '%@g.us%')
    .not('phone', 'is', null)
    .range(offset, offset + batchLimit - 1)
    .order('id');

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  if (!contacts || contacts.length === 0) {
    return new Response(JSON.stringify({ updated: 0, skipped: 0, failed: 0, done: true }), { status: 200 });
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const contact of contacts) {
    const phone: string = contact.phone || '';
    // Normalize phone: strip everything except digits, ensure it starts with country code
    const digits = phone.replace(/\D/g, '');
    if (!digits || digits.length < 8) { skipped++; continue; }

    const normalized = digits.startsWith('55') ? digits : `55${digits}`;

    try {
      const picUrl = await fetchProfilePic(normalized);
      if (picUrl) {
        await sb
          .from('marpe_contacts')
          .update({ photo_url: picUrl, updated_at: new Date().toISOString() })
          .eq('id', contact.id);
        updated++;
      } else {
        skipped++;
      }
    } catch {
      failed++;
    }

    // Rate limit: small delay between requests to avoid hammering UazapiGO
    await new Promise(r => setTimeout(r, 150));
  }

  const hasMore = contacts.length === batchLimit;

  return new Response(JSON.stringify({
    updated,
    skipped,
    failed,
    next_offset: hasMore ? offset + batchLimit : null,
    done: !hasMore,
    processed: contacts.length,
  }), { status: 200 });
};

// GET /api/admin/sync-photos — returns how many contacts still need photos
export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAdmin(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();

  const { count: totalMissing } = await sb
    .from('marpe_contacts')
    .select('id', { count: 'exact', head: true })
    .is('photo_url', null)
    .not('phone', 'ilike', '%@g.us%')
    .not('phone', 'is', null);

  const { count: totalWithPhoto } = await sb
    .from('marpe_contacts')
    .select('id', { count: 'exact', head: true })
    .not('photo_url', 'is', null);

  return new Response(JSON.stringify({
    missing_photos: totalMissing || 0,
    have_photos: totalWithPhoto || 0,
  }), { status: 200 });
};
