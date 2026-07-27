import { createServerClient } from '../supabase-server';
import { getInstanceToken, uazapiUrl } from './instance';

export interface SendResult {
  ok: boolean;
  messageid?: string;
  error?: string;
}

/**
 * Normalize a phone number to the format UaZapi expects: digits only, with
 * Brazilian country code prefix (55) when absent.
 *
 * Handles inputs like:
 *   "(55) 99999-9999"  → "5599999999"   ← 10 digits, prepend 55 → "5555999999999" ← wrong
 *   "(55) 99999-9999"  → digits = "5599999999" (10 d) → already has "55" prefix?
 *
 * Logic:
 *   1. Strip every non-digit character.
 *   2. If the result is 10 digits (DDD + 8/9-digit number), prepend "55".
 *   3. If the result is 11 digits (9-digit mobile with DDD), prepend "55".
 *   4. If already 12 or 13 digits, assume country code is present.
 *   5. Anything else: return as-is and let UaZapi error surface.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  // Already has country code (12 = landline, 13 = mobile with 9th digit)
  if (digits.length === 12 || digits.length === 13) return digits;

  // 10 digits: DDD (2) + 8-digit landline number
  // 11 digits: DDD (2) + 9-digit mobile number
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  // Unexpected length — return stripped digits; UaZapi will reject with a
  // meaningful error that will be logged to marpe_automation_logs.
  return digits;
}

export async function sendWhatsAppText(
  phone: string,
  text: string,
  contactId?: string,
  opts?: { isAutomation?: boolean; automationId?: string }
): Promise<SendResult> {
  const UAZAPI_URL = import.meta.env.UAZAPI_URL;
  const UAZAPI_TOKEN = await getInstanceToken();

  if (!UAZAPI_URL || !UAZAPI_TOKEN) {
    return { ok: false, error: 'WhatsApp not configured' };
  }

  // Group JIDs (ending in @g.us) must be passed as-is to UazapiGO — do NOT normalize them.
  // Individual numbers go through normalizePhone to ensure correct country-code format.
  const isGroupJid = phone.endsWith('@g.us');
  const normalizedPhone = isGroupJid ? phone : normalizePhone(phone);

  try {
    const res = await fetch(`${UAZAPI_URL}/send/text?token=${UAZAPI_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: normalizedPhone, text }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { ok: false, error: data.message || `HTTP ${res.status}` };
    }

    if (contactId) {
      const sb = createServerClient();
      await sb.from('marpe_messages').insert({
        contact_id: contactId,
        wa_message_id: data.messageid || null,
        direction: 'outbound',
        content_type: 'text',
        body: text,
        status: 'sent',
        is_from_automation: opts?.isAutomation || false,
        metadata: opts?.automationId ? { automation_id: opts.automationId } : null,
      });
    }

    return { ok: true, messageid: data.messageid };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/**
 * Envio de MÍDIA (S5, 27/07 — PDF Campanha: "mensagem com foto, vídeo e link").
 * Payload validado no projeto: POST /send/media
 *   { number, type: image|video|document|myaudio, file: dataURI, text?, docName? }
 * `myaudio` transcodifica para voz (PTT).
 */
export async function sendWhatsAppMedia(
  phone: string,
  media: { type: 'image' | 'video' | 'document' | 'myaudio'; dataUri: string; caption?: string; filename?: string },
  contactId?: string
): Promise<SendResult> {
  const UAZAPI_URL = uazapiUrl();
  const UAZAPI_TOKEN = await getInstanceToken();
  if (!UAZAPI_TOKEN) return { ok: false, error: 'WhatsApp not configured' };

  const isGroupJid = phone.endsWith('@g.us');
  const number = isGroupJid ? phone : normalizePhone(phone);

  try {
    const res = await fetch(`${UAZAPI_URL}/send/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
      body: JSON.stringify({
        number,
        type: media.type,
        file: media.dataUri,
        ...(media.caption ? { text: media.caption } : {}),
        ...(media.type === 'document' && media.filename ? { docName: media.filename } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.message || data.error || `HTTP ${res.status}` };

    if (contactId) {
      const sb = createServerClient();
      const contentType = media.type === 'myaudio' ? 'audio' : media.type;
      await sb.from('marpe_messages').insert({
        contact_id: contactId,
        wa_message_id: data.messageid || null,
        direction: 'outbound',
        content_type: contentType,
        body: media.caption || null,
        status: 'sent',
      });
    }
    return { ok: true, messageid: data.messageid };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/**
 * Envio de CARROSSEL até 5 fotos (S5 — PDF Campanha).
 * A rota existe nesta instância (probe 27/07: POST /send/carousel devolve
 * 400 "Missing required fields" com corpo vazio, ou seja, existe e valida).
 * Cada card leva imagem + texto próprios; `text` é a legenda geral.
 */
export async function sendWhatsAppCarousel(
  phone: string,
  carousel: { text?: string; cards: Array<{ image: string; text?: string }> },
  contactId?: string
): Promise<SendResult> {
  const UAZAPI_URL = uazapiUrl();
  const UAZAPI_TOKEN = await getInstanceToken();
  if (!UAZAPI_TOKEN) return { ok: false, error: 'WhatsApp not configured' };
  if (!carousel.cards?.length) return { ok: false, error: 'Carrossel sem imagens' };
  if (carousel.cards.length > 5) return { ok: false, error: 'Carrossel aceita no máximo 5 fotos' };

  const isGroupJid = phone.endsWith('@g.us');
  const number = isGroupJid ? phone : normalizePhone(phone);

  try {
    const res = await fetch(`${UAZAPI_URL}/send/carousel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
      body: JSON.stringify({
        number,
        text: carousel.text || '',
        carousel: carousel.cards.map(c => ({ image: c.image, text: c.text || '' })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.message || data.error || `HTTP ${res.status}` };

    if (contactId) {
      const sb = createServerClient();
      await sb.from('marpe_messages').insert({
        contact_id: contactId,
        wa_message_id: data.messageid || null,
        direction: 'outbound',
        content_type: 'image',
        body: carousel.text || `[carrossel: ${carousel.cards.length} fotos]`,
        status: 'sent',
        metadata: { carousel_cards: carousel.cards.length },
      });
    }
    return { ok: true, messageid: data.messageid };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
