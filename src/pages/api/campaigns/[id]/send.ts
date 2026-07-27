import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/api-auth';
import { createServerClient } from '../../../../lib/supabase-server';
import { sendWhatsAppText, sendWhatsAppMedia, sendWhatsAppCarousel } from '../../../../lib/whatsapp/send';
import { interpolateVariables } from '../../../../lib/variables';
import { resolveContactIds } from '../../../../lib/campaigns/resolve-contacts';

export const prerender = false;

// POST /api/campaigns/[id]/send — dispatch campaign to all matching contacts
export const POST: APIRoute = async ({ locals, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  const sb = createServerClient();

  // Load campaign + template
  const { data: campaign, error: campErr } = await sb
    .from('marpe_campaigns')
    .select('*, marpe_templates(id, name, body)')
    .eq('id', id)
    .single();

  if (campErr || !campaign) {
    return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404 });
  }
  if (campaign.status === 'sending' || campaign.status === 'sent') {
    return new Response(JSON.stringify({ error: 'Campaign already sent or in progress' }), { status: 409 });
  }

  // S5 (27/07): três tipos de mensagem (PDF Campanha) — o corpo pode vir do
  // template OU de um texto personalizado; mídia e carrossel guardam o payload
  // em `media`. Variáveis valem para os três, como o PDF pede.
  const messageType: 'text' | 'media' | 'carousel' = campaign.message_type || 'text';
  const baseBody: string = campaign.body_override || campaign.marpe_templates?.body || '';

  if (messageType === 'text' && !baseBody.trim()) {
    return new Response(JSON.stringify({ error: 'Campanha sem texto: escolha um template ou escreva a mensagem' }), { status: 400 });
  }
  if (messageType === 'media' && !campaign.media?.dataUri) {
    return new Response(JSON.stringify({ error: 'Campanha de mídia sem arquivo' }), { status: 400 });
  }
  if (messageType === 'carousel' && !campaign.media?.cards?.length) {
    return new Response(JSON.stringify({ error: 'Carrossel sem fotos' }), { status: 400 });
  }

  // Resolve contacts from segment filter
  const filter = campaign.segment_filter || {};
  const { ids: contactIds, error: resolveErr } = await resolveContactIds(sb, filter);

  if (resolveErr) return new Response(JSON.stringify({ error: resolveErr }), { status: 500 });

  if (!contactIds.length) {
    return new Response(JSON.stringify({ error: 'Nenhum contato corresponde ao segmento' }), { status: 400 });
  }

  // Fetch full contact data for the resolved IDs
  const { data: contacts, error: contactErr } = await sb
    .from('marpe_contacts')
    .select('id, name, phone, email, city')
    .in('id', contactIds)
    .not('phone', 'is', null)
    .neq('phone', '');

  if (contactErr) return new Response(JSON.stringify({ error: contactErr.message }), { status: 500 });
  if (!contacts?.length) {
    return new Response(JSON.stringify({ error: 'Nenhum contato com telefone encontrado' }), { status: 400 });
  }

  // Mark campaign as sending
  await sb.from('marpe_campaigns').update({
    status: 'sending',
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  // Send to all contacts (fire and forget — return immediately)
  let sent = 0;
  let failed = 0;

  (async () => {
    for (const contact of contacts) {
      if (!contact.phone) continue;

      // Variáveis resolvidas por destinatário — vale para os três tipos
      const message = baseBody ? interpolateVariables(baseBody, { contact }) : '';

      let result;
      if (messageType === 'media') {
        result = await sendWhatsAppMedia(contact.phone, {
          type: campaign.media.type || 'image',
          dataUri: campaign.media.dataUri,
          caption: message || undefined,
          filename: campaign.media.filename,
        }, contact.id);
      } else if (messageType === 'carousel') {
        result = await sendWhatsAppCarousel(contact.phone, {
          text: message || undefined,
          cards: (campaign.media.cards || []).map((c: any) => ({
            image: c.image,
            text: c.text ? interpolateVariables(c.text, { contact }) : undefined,
          })),
        }, contact.id);
      } else {
        result = await sendWhatsAppText(contact.phone, message, contact.id);
      }

      await sb.from('marpe_campaign_recipients').insert({
        campaign_id: id,
        contact_id: contact.id,
        status: result.ok ? 'sent' : 'failed',
        sent_at: result.ok ? new Date().toISOString() : null,
        error_message: result.error || null,
      });

      if (result.ok) sent++; else failed++;

      // Rate limiting: ~1 msg/sec to avoid bans
      await new Promise(r => setTimeout(r, 1000));
    }

    await sb.from('marpe_campaigns').update({
      status: 'sent',
      sent_count: sent,
      failed_count: failed,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
  })();

  return new Response(JSON.stringify({
    ok: true,
    message: `Disparando para ${contacts.length} contatos`,
    total: contacts.length,
  }), { status: 200 });
};
