import { normalizePhone } from './send';

/**
 * Foto de perfil do WhatsApp via UazapiGO (checkpoint 14/07 — "Foto do contato
 * no card"). Rota validada em 2026-07-14: POST /chat/details { number } →
 * { image, imagePreview, name, ... }.
 *
 * As URLs retornadas (pps.whatsapp.net) EXPIRAM — por isso o sync periódico
 * re-busca fotos com photo_synced_at antigo, e o CardAvatar do front degrada
 * para iniciais quando a URL quebra.
 */
export async function fetchProfilePhoto(phone: string): Promise<string | null> {
  const UAZAPI_URL = import.meta.env.UAZAPI_URL;
  const UAZAPI_TOKEN = import.meta.env.UAZAPI_TOKEN;
  if (!UAZAPI_URL || !UAZAPI_TOKEN) return null;

  const number = normalizePhone(phone);
  if (!number || number.includes('@')) return null; // grupos ficam de fora

  try {
    const res = await fetch(`${UAZAPI_URL}/chat/details?token=${UAZAPI_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
      body: JSON.stringify({ number }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.image || data.imagePreview || null;
  } catch {
    return null;
  }
}
