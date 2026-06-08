import { createServerClient } from '../supabase-server';

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
  const UAZAPI_TOKEN = import.meta.env.UAZAPI_TOKEN;

  if (!UAZAPI_URL || !UAZAPI_TOKEN) {
    return { ok: false, error: 'WhatsApp not configured' };
  }

  const normalizedPhone = normalizePhone(phone);

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
