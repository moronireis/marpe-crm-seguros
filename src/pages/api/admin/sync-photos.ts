import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { fetchProfilePhoto } from '../../../lib/whatsapp/photos';

export const prerender = false;

// Revisão 28/07 (Inbox #4 — "verificar se a função Sincronizar está funcionando"):
// NÃO estava. Este endpoint tentava 4 rotas especulativas da UazapiGO
// (/contacts/profile-picture, /contact/get, ...) — probe de 28/07: todas 405.
// A rota real é POST /chat/details { number } → { image, imagePreview }, validada
// em 14/07 e centralizada em lib/whatsapp/photos.ts. Agora usa a lib.

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
      const picUrl = await fetchProfilePhoto(normalized);
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
