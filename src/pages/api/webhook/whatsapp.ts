import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHmac, createDecipheriv } from 'crypto';
import { createServerClient } from '../../../lib/supabase-server';
import { sendWhatsAppText } from '../../../lib/whatsapp/send';
import { interpolateVariables } from '../../../lib/variables';

// ── WhatsApp media decryption ─────────────────────────────────────────────────
// WhatsApp encrypts ALL media with AES-256-CBC before uploading to CDN.
// The decryption key is derived via HKDF-SHA256 from the message's mediaKey field.
// Reference: https://faq.whatsapp.com/general/security-and-privacy/end-to-end-encryption

const WA_MEDIA_INFO: Record<string, string> = {
  image:    'WhatsApp Image Keys',
  sticker:  'WhatsApp Image Keys',
  audio:    'WhatsApp Audio Keys',
  ptt:      'WhatsApp Audio Keys',
  video:    'WhatsApp Video Keys',
  document: 'WhatsApp Document Keys',
};

function hkdfSha256(inputKey: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  // Extract
  const prk = createHmac('sha256', salt).update(inputKey).digest();
  // Expand
  const blocks = Math.ceil(length / 32);
  let prev = Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for (let i = 1; i <= blocks; i++) {
    prev = createHmac('sha256', prk).update(prev).update(info).update(Buffer.from([i])).digest();
    chunks.push(prev);
  }
  return Buffer.concat(chunks).slice(0, length);
}

function decryptWhatsAppMedia(encryptedBytes: Buffer, mediaKeyB64: string, mediaTypeLower: string): Buffer {
  const mediaKey = Buffer.from(mediaKeyB64, 'base64');
  const salt    = Buffer.alloc(32, 0);
  const info    = Buffer.from(WA_MEDIA_INFO[mediaTypeLower] || 'WhatsApp Image Keys');
  const derived = hkdfSha256(mediaKey, salt, info, 112);
  const iv         = derived.slice(0, 16);
  const cipherKey  = derived.slice(16, 48);
  // Encrypted file format: ciphertext || HMAC-SHA256(10 bytes at end)
  // We strip the last 10 bytes (MAC) before decrypting.
  const ciphertext = encryptedBytes.slice(0, -10);
  const decipher   = createDecipheriv('aes-256-cbc', cipherKey, iv);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

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
  const chatid = msg.chatid || chat.wa_chatid || body.chatid || '';
  const phone = chatid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  const fromMe = msg.fromMe ?? body.fromMe ?? false;
  const messageId = msg.messageid || msg.id || msg.key?.id || body.messageid || '';
  const timestamp = msg.messageTimestamp || body.messageTimestamp || Date.now();

  // UazapiGO sends message type in multiple possible places:
  // 1. msg.type = "image" | "imageMessage" | "audio" | "audioMessage" etc. (simplified format)
  // 2. msg.messageType = same
  // 3. body.type = top-level type field
  // 4. Keys of msg.message = raw Baileys format where {imageMessage:{...}} means image
  const baileysType = msg.message ? Object.keys(msg.message).find(k => k !== 'contextInfo') : null;
  const messageType: string =
    msg.type || msg.messageType || body.type || body.messageType ||
    baileysType || 'text';

  // If raw Baileys format, drill into the message content object for fields
  const baileysContent: any = baileysType ? (msg.message?.[baileysType] || {}) : {};

  // pushName / notify = the contact's WhatsApp display name (what the contact set for themselves)
  const pushName: string = msg.pushName || msg.notify || body.pushName || body.notify || '';
  // Issue #29: em eventos fromMe o pushName é o nome do REMETENTE — o dono da instância
  // ("Marcel - Marpe Seguros"), nunca o contato. Usá-lo aqui fazia todo número que o
  // Marcel chamava primeiro ser criado com o nome dele. Em fromMe, só o nome do chat
  // (= o contato) ou o telefone são confiáveis.
  const senderName = fromMe ? (chat.name || phone) : (chat.name || pushName || msg.senderName || phone);

  // Profile picture URL — UazapiGO may send in chat or message level
  const profilePicUrl: string | null =
    chat.profilePicUrl || chat.pictureUrl || chat.photo ||
    chat.image || chat.imagePreview || chat.profilePic ||
    msg.profilePicUrl || msg.pictureUrl || msg.profilePic ||
    body.profilePicUrl || body.pictureUrl || null;
  const isGroup = msg.isGroup || body.isGroup || chatid.endsWith('@g.us') || false;

  // For group messages: the individual participant who sent the message
  const groupParticipantJid: string =
    msg.participant || msg.sender || msg.key?.participant ||
    body.participant || body.sender || '';
  const groupParticipantPhone = groupParticipantJid
    .replace('@s.whatsapp.net', '')
    .replace('@g.us', '')
    .replace('@lid', '');
  const groupParticipantNameRaw: string =
    msg.pushName || msg.notify || msg.senderName ||
    body.pushName || body.senderName ||
    chat.pushName || chat.senderName || '';

  // UazapiGO sends type="media" with the actual content inside msg.content object.
  // Real subtype is in msg.mediaType ("image","audio","video","document","sticker").
  // The CDN URL is in msg.content.URL (capital URL).
  // MIME is in msg.content.mimetype.
  const msgContent: any = msg.content || {};

  const rawMime: string | null =
    msgContent.mimetype || msgContent.mimeType ||
    msg.mimetype || msg.media?.mimetype || msg.mimeType ||
    baileysContent.mimetype || baileysContent.mimeType || null;

  // Real subtype from mediaType field (most reliable for UazapiGO "media" type)
  const mediaSubtype: string = (msg.mediaType || '').toLowerCase();

  function detectContentType(t: string, m: string): 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' {
    if (t.includes('image') || m.startsWith('image/')) return 'image';
    if (t.includes('audio') || t.includes('ptt') || m.startsWith('audio/')) return 'audio';
    if (t.includes('video') || m.startsWith('video/')) return 'video';
    if (t.includes('document') || m.includes('pdf') || m.includes('msword') || m.includes('spreadsheet') || m.includes('presentation')) return 'document';
    if (t.includes('sticker')) return 'sticker';
    return 'text';
  }

  const msgTypeLower = messageType.toLowerCase();
  const mimeLower = (rawMime || '').toLowerCase();

  const isGenericMedia = msgTypeLower === 'media';

  // Detect: try mediaSubtype first, then messageType, then MIME
  const contentType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' =
    mediaSubtype ? detectContentType(mediaSubtype, mimeLower)
    : detectContentType(msgTypeLower, mimeLower);

  const isMedia = contentType !== 'text' && contentType !== 'sticker';

  // Extract media URL — UazapiGO puts it in msg.content.URL (capital) for "media" type
  // Also check legacy fields for other message types
  const rawMediaUrl: string | null =
    msgContent.URL || msgContent.url ||
    msg.mediaUrl || msg.media?.url || msg.fileUrl || msg.url ||
    baileysContent.url || baileysContent.mediaUrl || null;

  // Extract base64 if present
  const base64Data: string | null =
    msg.base64 || msg.data || msg.media?.base64 || msg.media?.data ||
    baileysContent.base64 || null;

  // Text body: caption for media, text for regular messages
  const messageBody: string =
    msg.caption || msg.text || msgContent.caption ||
    baileysContent.caption || body.caption || body.text || '';

  // Skip if no chatid/phone
  if (!phone) {
    return new Response('OK', { status: 200 });
  }
  // Skip text messages with no body (always keep media even without caption)
  if (!isMedia && !isGenericMedia && !messageBody) {
    return new Response('OK', { status: 200 });
  }

  // Filter group system messages (joins, leaves, title changes, etc.)
  // UazapiGO sends these as messageType "notification", "groupNotification", or similar
  const isSystemMsg = ['notification', 'groupNotification', 'e2e_notification',
    'group_change_icon', 'group_change_description', 'group_participant_add',
    'group_participant_remove', 'group_change_subject'].includes(messageType);
  if (isGroup && isSystemMsg) {
    return new Response('OK', { status: 200 });
  }

  const sb = createServerClient();

  // Resolve group participant name + photo — look up in contacts by phone
  let groupParticipantName: string = groupParticipantNameRaw;
  let groupParticipantPhoto: string | null = null;
  if (isGroup && groupParticipantPhone) {
    const { data: participantContact } = await sb
      .from('marpe_contacts')
      .select('name, photo_url')
      .ilike('phone', `%${groupParticipantPhone.slice(-8)}%`)
      .maybeSingle();
    if (participantContact) {
      const looked = participantContact.name || '';
      if (!groupParticipantName && looked && !/^[\d\s()+\-@]+$/.test(looked)) {
        groupParticipantName = looked;
      }
      if (participantContact.photo_url) {
        groupParticipantPhoto = participantContact.photo_url;
      }
    }
  }

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
      // Update group name and photo if we have better data
      const updates: Record<string, any> = {};
      if (groupName && !groupName.includes('@g.us')) updates.name = groupName;
      if (profilePicUrl) { updates.photo_url = profilePicUrl; updates.photo_synced_at = new Date().toISOString(); }
      if (Object.keys(updates).length > 0) {
        await sb.from('marpe_contacts').update(updates).eq('id', existingGroup.id);
      }
    } else {
      // Create group contact
      const { data: created } = await sb
        .from('marpe_contacts')
        .insert({
          name: groupName,
          phone: groupJid,
          source: 'whatsapp_group',
          ...(profilePicUrl ? { photo_url: profilePicUrl, photo_synced_at: new Date().toISOString() } : {}),
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
      const updates: Record<string, any> = {};

      // Update name if we have a better one (not a raw phone / JID).
      // Issue #29: em fromMe o pushName é o nome do dono da instância — não pode
      // "melhorar" o nome do contato com ele.
      const betterName = fromMe ? (chat.name || '') : (pushName || chat.name || '');
      const nameIsPhoneOrEmpty = !betterName || /^[\d\s()+\-]+$/.test(betterName) || betterName.includes('@');
      if (!nameIsPhoneOrEmpty) {
        const { data: currentContact } = await sb
          .from('marpe_contacts')
          .select('name')
          .eq('id', existing.id)
          .single();
        const currentName = currentContact?.name || '';
        const currentNameIsWeak = !currentName || /^[\d\s()+\-]+$/.test(currentName) || currentName.includes('@');
        if (currentNameIsWeak) updates.name = betterName;
      }

      // Always update photo_url when we receive one (WhatsApp pics change over time)
      if (profilePicUrl) { updates.photo_url = profilePicUrl; updates.photo_synced_at = new Date().toISOString(); }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        await sb.from('marpe_contacts').update(updates).eq('id', existing.id);
      }
    } else {
      // Try last 8 digits match
      const { data: partial } = await sb
        .from('marpe_contacts')
        .select('id')
        .ilike('phone', `%${phone.slice(-8)}%`)
        .maybeSingle();

      if (partial?.id) {
        contactId = partial.id;
        if (profilePicUrl) {
          await sb.from('marpe_contacts').update({ photo_url: profilePicUrl, photo_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', partial.id);
        }
      } else {
        // Create new contact from WhatsApp
        const { data: created } = await sb
          .from('marpe_contacts')
          .insert({
            name: senderName || phone,
            phone,
            source: 'whatsapp',
            ...(profilePicUrl ? { photo_url: profilePicUrl, photo_synced_at: new Date().toISOString() } : {}),
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

  // For group messages, prefix the body with the individual participant who sent it.
  // Only use a label if we have a real name (pushName/notify). If UazapiGO doesn't
  // send pushName for this event, omit the prefix rather than showing a numeric JID.
  const groupSenderLabel = groupParticipantName || null;
  const finalBody = isGroup
    ? (groupSenderLabel ? `[${groupSenderLabel}]: ${messageBody}` : messageBody)
    : messageBody;

  // ── Media storage ────────────────────────────────────────────────────────────
  const UAZAPI_URL = import.meta.env.UAZAPI_URL || 'https://u4digital.uazapi.com';
  const UAZAPI_TOKEN = import.meta.env.UAZAPI_TOKEN || '';

  function extFromMime(m: string | null, ct: string): string {
    const t = (m || ct).toLowerCase();
    if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
    if (t.includes('png')) return 'png';
    if (t.includes('webp')) return 'webp';
    if (t.includes('gif')) return 'gif';
    if (t.includes('ogg') || t.includes('ptt')) return 'ogg';
    if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
    if (t.includes('m4a') || t.includes('mp4a')) return 'm4a';
    if (t.includes('video') || t.includes('mp4')) return 'mp4';
    if (t.includes('pdf')) return 'pdf';
    if (t.includes('docx') || t.includes('word')) return 'docx';
    if (t.includes('xlsx') || t.includes('excel')) return 'xlsx';
    if (ct === 'audio') return 'ogg';
    if (ct === 'video') return 'mp4';
    if (ct === 'image') return 'jpg';
    return 'bin';
  }

  let finalMediaUrl: string | null = null; // Will be set to Supabase Storage URL after upload
  let finalMime: string | null = rawMime;
  let finalContentType = contentType;

  // Upload com retry: o storage da Cloudfy falha INTERMITENTE com "violates row-level
  // security policy" (réplicas com config inconsistente — diagnóstico 17/07: sucesso e
  // falha intercalados no mesmo minuto com pipeline idêntico). 2 tentativas extras
  // com backoff resolvem na prática.
  async function uploadWithRetry(path: string, bytes: Buffer, contentType2: string): Promise<{ url: string | null; error: string | null }> {
    let lastErr: string | null = null;
    for (let i = 0; i < 3; i++) {
      const { error } = await sb.storage.from('marpe-media').upload(path, bytes, { contentType: contentType2, upsert: true });
      if (!error) {
        const { data } = sb.storage.from('marpe-media').getPublicUrl(path);
        return { url: data.publicUrl, error: null };
      }
      lastErr = error.message;
      if (i < 2) await new Promise(r => setTimeout(r, 350 * (i + 1)));
    }
    return { url: null, error: lastErr };
  }

  // ── Step 1: If UazapiGO sent base64 inline, we'll upload it in Step 4
  let resolvedBase64: string | null = base64Data;
  let resolvedMimeFromDownload: string | null = null;

  // ── Step 2: Download from WhatsApp CDN, decrypt (AES-256-CBC), upload to Storage
  // WhatsApp encrypts ALL media before CDN upload. mediaKey is in msg.content.mediaKey.
  // CDN URLs expire — must be downloaded immediately in the webhook handler.
  const mediaKeyB64: string | null = msgContent.mediaKey || null;

  let mediaDebug: Record<string, any> = {};

  if ((isMedia || isGenericMedia) && rawMediaUrl && !resolvedBase64 && messageId && contactId) {
    mediaDebug.step2_started = true;
    mediaDebug.has_media_key = !!mediaKeyB64;
    mediaDebug.media_subtype = mediaSubtype;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);
      let cdnRes: Response;
      try {
        cdnRes = await fetch(rawMediaUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      mediaDebug.cdn_status = cdnRes.status;
      if (cdnRes.ok) {
        const mimeFromResp = cdnRes.headers.get('content-type') || rawMime || 'application/octet-stream';
        const mimeToUse = finalMime || rawMime || mimeFromResp;
        finalMime = mimeToUse;

        if (isGenericMedia) {
          finalContentType = detectContentType(mediaSubtype, (rawMime || mimeFromResp).toLowerCase());
        }

        let mediaBytes = Buffer.from(await cdnRes.arrayBuffer());
        mediaDebug.cdn_bytes = mediaBytes.length;

        // Decrypt if we have the mediaKey (WhatsApp AES-256-CBC encryption)
        if (mediaKeyB64 && mediaBytes.length > 10) {
          try {
            const typeForDecrypt = mediaSubtype || finalContentType;
            mediaBytes = decryptWhatsAppMedia(mediaBytes, mediaKeyB64, typeForDecrypt);
            mediaDebug.decrypted = true;
            mediaDebug.decrypted_bytes = mediaBytes.length;
            mediaDebug.first_bytes = mediaBytes.slice(0, 4).toString('hex');
          } catch (decryptErr: any) {
            mediaDebug.decrypt_error = String(decryptErr?.message || decryptErr);
          }
        }

        const ext = extFromMime(mimeToUse, finalContentType);
        const filePath = `${contactId}/${messageId}.${ext}`;
        // Strip codec/parameter suffix from MIME before upload (Supabase allowlist uses base types)
        // e.g. "audio/ogg; codecs=opus" → "audio/ogg"
        const uploadMime = mimeToUse.split(';')[0].trim();

        await sb.storage.createBucket('marpe-media', { public: true, fileSizeLimit: 52428800 }).catch(() => {});
        const up = await uploadWithRetry(filePath, mediaBytes, uploadMime);
        if (up.url) {
          finalMediaUrl = up.url;
          mediaDebug.upload_ok = true;
        } else {
          mediaDebug.upload_error = up.error;
          // NUNCA gravar a URL crua do CDN do WhatsApp: expira E o conteúdo é
          // criptografado (AES) — no front vira link morto. media_url null → o
          // front usa o proxy /api/media/download, que se auto-cura via UazapiGO.
          finalMediaUrl = null;
        }
      } else {
        mediaDebug.cdn_error = `HTTP ${cdnRes.status}`;
        finalMediaUrl = null;
      }
    } catch (err: any) {
      mediaDebug.fetch_error = String(err?.message || err);
      finalMediaUrl = null;
    }
  }

  // ── Step 3: fallback via UazapiGO POST /message/download (rota REAL, validada 17/07:
  // devolve { fileURL, mimetype } com o arquivo já descriptografado no servidor UazapiGO)
  if ((isMedia || isGenericMedia) && !resolvedBase64 && !finalMediaUrl && messageId) {
    try {
      const dlRes = await fetch(`${UAZAPI_URL}/message/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
        body: JSON.stringify({ id: messageId }),
      });
      if (dlRes.ok) {
        const dlData: any = await dlRes.json().catch(() => null);
        if (dlData?.fileURL) {
          const fileRes = await fetch(dlData.fileURL);
          if (fileRes.ok) {
            const buf = Buffer.from(await fileRes.arrayBuffer());
            resolvedBase64 = buf.toString('base64');
            resolvedMimeFromDownload = dlData.mimetype || fileRes.headers.get('content-type') || null;
            if (resolvedMimeFromDownload && isGenericMedia) {
              finalContentType = detectContentType('', resolvedMimeFromDownload.toLowerCase());
              finalMime = resolvedMimeFromDownload;
            }
            mediaDebug.step3_uazapi_ok = true;
          }
        }
      } else {
        mediaDebug.step3_status = dlRes.status;
      }
    } catch (_) { /* segue sem mídia; o proxy self-healing resolve na visualização */ }
  }

  // ── Step 4: Upload to Supabase Storage if we have base64 (inline or from UazapiGO API)
  if ((isMedia || isGenericMedia) && resolvedBase64 && !finalMediaUrl && messageId && contactId) {
    try {
      const mimeToUse = finalMime || resolvedMimeFromDownload || 'application/octet-stream';
      const uploadMime = mimeToUse.split(';')[0].trim();
      const ext = extFromMime(mimeToUse, finalContentType);
      const filePath = `${contactId}/${messageId}.${ext}`;
      const buffer = Buffer.from(resolvedBase64, 'base64');

      await sb.storage.createBucket('marpe-media', { public: true, fileSizeLimit: 52428800 }).catch(() => {});

      const up = await uploadWithRetry(filePath, buffer, uploadMime);
      if (up.url) {
        finalMediaUrl = up.url;
        finalMime = mimeToUse;
      } else {
        mediaDebug.step4_upload_error = up.error;
      }
    } catch (_) {
      // Storage upload failed — frontend will use proxy endpoint with wa_message_id
    }
  }

  // Save message — media_url and media_mime stored for attachment rendering in inbox
  // Note: group messages are always inbound and never trigger deals or automations
  await sb.from('marpe_messages').insert({
    contact_id: contactId,
    wa_message_id: messageId || null,
    direction: isGroup ? 'inbound' : (fromMe ? 'outbound' : 'inbound'),
    content_type: finalContentType,
    body: finalBody || null,
    media_url: finalMediaUrl,
    media_mime: finalMime,
    status: isGroup ? 'delivered' : (fromMe ? 'sent' : 'delivered'),
    metadata: {
      event_type: body.EventType,
      timestamp,
      instance: body.instanceName,
      is_group: isGroup,
      // Debug: store raw type fields so we can inspect what UazapiGO sends
      raw_type: messageType,
      baileys_key: baileysType || null,
      has_base64: !!resolvedBase64,
      has_media_url: !!finalMediaUrl,
      // Debug: media processing result
      ...(isMedia || isGenericMedia ? { media_debug: mediaDebug } : {}),
      ...(isGenericMedia ? { debug_msg_sample: JSON.stringify(msg).slice(0, 300) } : {}),
      ...(isGroup ? {
        sender_name: groupParticipantName || null,
        sender_photo: groupParticipantPhoto || null,
      } : {}),
    },
  });

  // S3.8: conversa finalizada reabre sozinha quando o cliente manda mensagem nova
  if (!isGroup && !fromMe) {
    await sb.from('marpe_contacts')
      .update({ conv_status: 'open' })
      .eq('id', contactId)
      .eq('conv_status', 'closed');
  }

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

  // 5. Send the welcome menu (configurable from Settings)
  const { data: menuSetting } = await sb
    .from('marpe_settings')
    .select('value')
    .eq('key', 'chatbot_welcome_message')
    .maybeSingle();

  const defaultMenu = '{{periodo_dia}}! 👋 Bem-vindo à Marca Corretora de Seguros.\n\nComo posso te ajudar?\n\n1️⃣ Cotação de seguro\n2️⃣ Segunda via de boleto\n3️⃣ Sinistro / Assistência 24h\n4️⃣ Informações sobre consórcio\n5️⃣ Falar com um atendente\n\nResponda com o número da opção desejada.';
  const menuTemplate = menuSetting?.value?.message || defaultMenu;
  const menuText = interpolateVariables(menuTemplate);

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
