import type { APIRoute } from 'astro';
import { createServerClient } from '../../../lib/supabase-server';
import { fetchProfilePhoto } from '../../../lib/whatsapp/photos';

export const prerender = false;
export const maxDuration = 300;

// Sincroniza fotos de perfil do WhatsApp para os contatos (checkpoint 14/07).
// Chamado pelo Vercel Cron diário; também aceita chamada manual com WEBHOOK_KEY.
//
// Estratégia por execução (batch): prioriza contatos nunca sincronizados
// (photo_synced_at null) e depois os mais antigos — as URLs pps.whatsapp.net
// expiram, então o mesmo job faz backfill e refresh contínuo.
const BATCH_SIZE = 200;
const STALE_DAYS = 7;
const PAUSE_MS = 250;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('authorization') || '';
  const webhookKey = request.headers.get('x-webhook-key') || '';

  const cronSecret = import.meta.env.CRON_SECRET;
  const validCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const validWebhook = webhookKey === import.meta.env.WEBHOOK_KEY;

  if (!validCron && !validWebhook) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const sb = createServerClient();
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();

  // Contatos individuais (grupos têm JID com @) com telefone, nunca
  // sincronizados ou stale — nulls primeiro, depois os mais antigos
  const { data: contacts, error } = await sb
    .from('marpe_contacts')
    .select('id, phone, photo_synced_at')
    .not('phone', 'is', null)
    .not('phone', 'like', '%@%')
    .or(`photo_synced_at.is.null,photo_synced_at.lt.${staleCutoff}`)
    .order('photo_synced_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const c of contacts || []) {
    const photo = await fetchProfilePhoto(c.phone!);
    const updates: Record<string, unknown> = { photo_synced_at: new Date().toISOString() };
    // Sem foto no WhatsApp (ou número inexistente): mantém a photo_url atual —
    // o avatar do front degrada sozinho se ela expirar
    if (photo) updates.photo_url = photo;

    const { error: upErr } = await sb.from('marpe_contacts').update(updates).eq('id', c.id);
    if (upErr) failed++;
    else if (photo) updated++;
    else unchanged++;

    await sleep(PAUSE_MS);
  }

  const { count: remaining } = await sb
    .from('marpe_contacts')
    .select('id', { count: 'exact', head: true })
    .not('phone', 'is', null)
    .not('phone', 'like', '%@%')
    .is('photo_synced_at', null);

  return new Response(JSON.stringify({
    ok: true,
    processed: (contacts || []).length,
    updated,
    unchanged,
    failed,
    pending_first_sync: remaining ?? null,
  }), { status: 200 });
};
