import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '../../../lib/supabase-server';
import { sendWhatsAppText } from '../../../lib/whatsapp/send';
import { interpolateVariables } from '../../../lib/variables';

export const prerender = false;

// POST /api/webhook/whatsapp — receives messages from UazapiGO
// Actual payload format from UazapiGO:
// { BaseUrl, EventType, chat: { wa_chatid, name, phone }, message: { chatid, text, content: {text}, fromMe, messageid, type, wasSentByApi, messageTimestamp }, owner, token }
export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); } catch { return new Response('OK', { status: 200 }); }

  // Only process message events (individual + group)
  const allowedEvents = ['messages', 'messages_groups'];
  if (body.EventType && !allowedEvents.includes(body.EventType)) {
    return new Response('OK', { status: 200 });
  }

  const msg = body.message || {};
  const chat = body.chat || {};

  // Extract fields from actual UazapiGO format
  const chatid = msg.chatid || chat.wa_chatid || '';
  const phone = chatid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  const fromMe = msg.fromMe || false;
  const messageId = msg.messageid || msg.id || '';
  const messageType = msg.type || msg.messageType || 'text';
  const timestamp = msg.messageTimestamp || Date.now();
  const senderName = chat.name || msg.senderName || phone;
  const isGroup = msg.isGroup || chatid.endsWith('@g.us') || false;

  // Detect content type — ptt (push-to-talk) is audio in UazapiGO
  const contentType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' =
    messageType.toLowerCase().includes('image') ? 'image'
    : messageType.toLowerCase().includes('audio') || messageType.toLowerCase().includes('ptt') ? 'audio'
    : messageType.toLowerCase().includes('video') ? 'video'
    : messageType.toLowerCase().includes('document') ? 'document'
    : messageType.toLowerCase().includes('sticker') ? 'sticker'
    : 'text';

  const isMedia = contentType !== 'text' && contentType !== 'sticker';

  // Extract media URL — UazapiGO sends it in several possible fields
  const mediaUrl: string | null = isMedia
    ? (msg.mediaUrl || msg.media?.url || msg.fileUrl || msg.url || null)
    : null;

  // Extract MIME type for rendering hints
  const mediaMime: string | null = isMedia
    ? (msg.mimetype || msg.media?.mimetype || msg.mimeType || null)
    : null;

  // Text body: for media messages, prefer caption; fall back to empty string (no caption is normal)
  const messageBody: string = msg.caption || msg.text || msg.content?.text || '';

  // Skip if no phone. Skip non-media messages with no body.
  // Media messages with no caption are valid — we keep them.
  if (!phone) {
    return new Response('OK', { status: 200 });
  }
  if (!isMedia && !messageBody) {
    return new Response('OK', { status: 200 });
  }

  const sb = createServerClient();

  // Find or create contact
  let contactId: string | null = null;

  if (isGroup) {
    // For group messages: use the full group JID as the "phone" identifier
    const groupJid = chatid; // e.g. "1234567890@g.us"
    const groupName = chat.name || senderName || groupJid;

    // Find existing group contact by exact JID match
    const { data: existingGroup } = await sb
      .from('marpe_contacts')
      .select('id')
      .eq('phone', groupJid)
      .eq('source', 'whatsapp_group')
      .maybeSingle();

    if (existingGroup?.id) {
      contactId = existingGroup.id;
    } else {
      // Create group contact
      const { data: created } = await sb
        .from('marpe_contacts')
        .insert({
          name: groupName,
          phone: groupJid,
          source: 'whatsapp_group',
        })
        .select('id')
        .single();
      contactId = created?.id || null;
    }
  } else {
    // Individual contact: existing logic unchanged
    const { data: existing } = await sb
      .from('marpe_contacts')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (existing?.id) {
      contactId = existing.id;
    } else {
      // Try last 8 digits match
      const { data: partial } = await sb
        .from('marpe_contacts')
        .select('id')
        .ilike('phone', `%${phone.slice(-8)}%`)
        .maybeSingle();

      if (partial?.id) {
        contactId = partial.id;
      } else {
        // Create new contact from WhatsApp
        const { data: created } = await sb
          .from('marpe_contacts')
          .insert({
            name: senderName || phone,
            phone,
            source: 'whatsapp',
          })
          .select('id')
          .single();
        contactId = created?.id || null;
      }
    }
  }

  if (!contactId) return new Response('OK', { status: 200 });

  // Avoid duplicate messages
  if (messageId) {
    const { data: dup } = await sb
      .from('marpe_messages')
      .select('id')
      .eq('wa_message_id', messageId)
      .maybeSingle();
    if (dup?.id) return new Response('OK', { status: 200 });
  }

  // Survey response capture — only for individual inbound text messages
  if (!isGroup && !fromMe && contentType === 'text' && messageBody.trim()) {
    const trimmed = messageBody.trim();
    const ratingValue = parseInt(trimmed, 10);
    const isValidRating = !isNaN(ratingValue) && ratingValue >= 1 && ratingValue <= 5 && trimmed === String(ratingValue);

    if (isValidRating) {
      // Check for a pending survey for this contact
      const { data: pendingSurvey } = await sb
        .from('marpe_surveys')
        .select('id, contact_id')
        .eq('contact_id', contactId)
        .eq('status', 'pending')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingSurvey?.id) {
        // Record the rating and close the survey
        await sb
          .from('marpe_surveys')
          .update({
            rating: ratingValue,
            status: 'completed',
            responded_at: new Date().toISOString(),
          })
          .eq('id', pendingSurvey.id);

        // Thank-you reply
        const { data: contact } = await sb
          .from('marpe_contacts')
          .select('phone')
          .eq('id', contactId)
          .single();

        if (contact?.phone) {
          await sendWhatsAppText(
            contact.phone,
            'Obrigado pela avaliação! Sua opinião é muito importante para nós.',
            contactId,
          );
        }
      }
    }
  }

  // For group messages, prefix the body with the sender name
  const finalBody = isGroup
    ? `[${senderName}]: ${messageBody}`
    : messageBody;

  // Save message — media_url and media_mime stored for attachment rendering in inbox
  // Note: group messages are always inbound and never trigger deals or automations
  await sb.from('marpe_messages').insert({
    contact_id: contactId,
    wa_message_id: messageId || null,
    direction: isGroup ? 'inbound' : (fromMe ? 'outbound' : 'inbound'),
    content_type: contentType,
    body: finalBody || null,
    media_url: mediaUrl,
    media_mime: mediaMime,
    status: isGroup ? 'delivered' : (fromMe ? 'sent' : 'delivered'),
    metadata: { event_type: body.EventType, timestamp, instance: body.instanceName, is_group: isGroup },
  });

  // ── Chatbot de primeiro atendimento ─────────────────────────────────────────
  // Only fires for individual inbound text messages (not groups, not fromMe).
  if (!isGroup && !fromMe && contentType === 'text') {
    await handleChatbot({ sb, contactId, phone, messageBody });
  }

  return new Response('OK', { status: 200 });
};

// ── Chatbot helpers ───────────────────────────────────────────────────────────

const MENU_RESPONSES: Record<string, string> = {
  '1': 'Ótimo! Para fazermos sua cotação, preciso de alguns dados. Um de nossos consultores vai te atender em instantes. 🔜',
  '2': 'Sem problema! Vou encaminhar para nosso setor financeiro. Aguarde um momento. 📋',
  '3': 'Entendi! Vou te conectar com nossa equipe de sinistros/assistência 24h. Aguarde. 🚗',
  '4': 'Legal! Temos ótimas opções de consórcio. Um consultor especializado vai te atender. 💰',
  '5': 'Perfeito! Estou direcionando para um de nossos atendentes. Aguarde um momento. 👤',
};

const MENU_TAGS: Record<string, string> = {
  '1': 'interesse_cotacao',
  '2': 'interesse_boleto',
  '3': 'interesse_sinistro',
  '4': 'interesse_consorcio',
  '5': 'falar_atendente',
};

async function handleChatbot(opts: {
  sb: SupabaseClient;
  contactId: string;
  phone: string;
  messageBody: string;
}) {
  const { sb, contactId, phone, messageBody } = opts;

  // 1. Check chatbot is enabled globally
  const { data: setting } = await sb
    .from('marpe_settings')
    .select('value')
    .eq('key', 'chatbot')
    .maybeSingle();

  if (setting?.value?.enabled === false) return;

  // 2. Check if a human sent an outbound message in the last hour → don't interfere
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentHuman } = await sb
    .from('marpe_messages')
    .select('id')
    .eq('contact_id', contactId)
    .eq('direction', 'outbound')
    .eq('is_from_automation', false)
    .gte('created_at', oneHourAgo)
    .limit(1)
    .maybeSingle();

  if (recentHuman?.id) return;

  // 3. Check if contact replied to the chatbot menu (options 1-5)
  const trimmed = messageBody.trim();
  if (/^[1-5]$/.test(trimmed)) {
    // Only respond if the last outbound message was from automation (menu was sent)
    const { data: lastOutbound } = await sb
      .from('marpe_messages')
      .select('id, is_from_automation, created_at')
      .eq('contact_id', contactId)
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastOutbound?.is_from_automation) {
      const reply = MENU_RESPONSES[trimmed];
      if (reply) {
        await sendWhatsAppText(phone, reply, contactId, { isAutomation: true });
      }

      // Tag the contact with their chosen interest
      const newTag = MENU_TAGS[trimmed];
      if (newTag) {
        const { data: contact } = await sb
          .from('marpe_contacts')
          .select('tags')
          .eq('id', contactId)
          .single();

        if (contact) {
          const existing: string[] = contact.tags || [];
          // Also add the generic "auto_atendido" tag
          const merged = Array.from(new Set([...existing, 'auto_atendido', newTag]));
          await sb
            .from('marpe_contacts')
            .update({ tags: merged, updated_at: new Date().toISOString() })
            .eq('id', contactId);
        }
      }
      return;
    }
  }

  // 4. Determine if this is a "first contact" situation:
  //    - No previous outbound messages at all, OR
  //    - Last outbound message (automation or human) was more than 24 hours ago
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentOutbound } = await sb
    .from('marpe_messages')
    .select('id')
    .eq('contact_id', contactId)
    .eq('direction', 'outbound')
    .gte('created_at', twentyFourHoursAgo)
    .limit(1)
    .maybeSingle();

  // If there was any outbound message in the last 24h, skip greeting
  if (recentOutbound?.id) return;

  // 5. Send the welcome menu
  const menuText = interpolateVariables(
    '{{periodo_dia}}! 👋 Bem-vindo à Marca Corretora de Seguros.\n\nComo posso te ajudar?\n\n1️⃣ Cotação de seguro\n2️⃣ Segunda via de boleto\n3️⃣ Sinistro / Assistência 24h\n4️⃣ Informações sobre consórcio\n5️⃣ Falar com um atendente\n\nResponda com o número da opção desejada.',
  );

  await sendWhatsAppText(phone, menuText, contactId, { isAutomation: true });

  // Tag as auto_atendido so we can filter in inbox
  const { data: contact } = await sb
    .from('marpe_contacts')
    .select('tags')
    .eq('id', contactId)
    .single();

  if (contact) {
    const existing: string[] = contact.tags || [];
    if (!existing.includes('auto_atendido')) {
      await sb
        .from('marpe_contacts')
        .update({ tags: [...existing, 'auto_atendido'], updated_at: new Date().toISOString() })
        .eq('id', contactId);
    }
  }
}

// GET for webhook verification
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ status: 'webhook active' }), { status: 200 });
};
