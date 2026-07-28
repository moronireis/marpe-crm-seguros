import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { getInstanceToken, uazapiUrl } from '../../../lib/whatsapp/instance';

export const prerender = false;

/**
 * POST /api/admin/import-chats — Revisão 28/07 (Inbox #6, "contatos que sumiram").
 *
 * Depois do incidente que zerou o histórico, a lista do Inbox só repovoaria
 * conforme mensagens novas chegassem. Descoberta de 28/07: a UazapiGO expõe
 * POST /chat/find, que devolve TODOS os chats da instância (nome, telefone,
 * foto, grupo/individual, paginado). Este endpoint importa essa lista e recria
 * os contatos — nomes e fotos voltam na hora; as mensagens antigas não (essas
 * só via backup do banco).
 *
 * Espelha exatamente o matching do webhook para não criar duplicatas:
 *   grupo      → phone = JID inteiro + source whatsapp_group
 *   individual → phone = dígitos; match exato → últimos 8 dígitos → cria
 */
export const POST: APIRoute = async ({ locals }) => {
  const profile = requireAdmin(locals);
  if (profile instanceof Response) return profile;

  const token = await getInstanceToken();
  if (!token) {
    return new Response(JSON.stringify({ error: 'WhatsApp não configurado' }), { status: 503 });
  }

  const sb = createServerClient();
  const URL_BASE = uazapiUrl();

  // Pagina o /chat/find até esgotar (teto de segurança: 4000 chats)
  const chats: any[] = [];
  for (let offset = 0; offset < 4000; offset += 500) {
    let page: any = null;
    try {
      const res = await fetch(`${URL_BASE}/chat/find`, {
        method: 'POST',
        headers: { token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 500, offset }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) break;
      page = await res.json();
    } catch { break; }
    const list = page?.chats || [];
    chats.push(...list);
    if (list.length < 500) break;
  }

  if (!chats.length) {
    return new Response(JSON.stringify({ error: 'A UazapiGO não devolveu nenhuma conversa' }), { status: 502 });
  }

  let created = 0, updated = 0, skipped = 0, groups = 0, individuals = 0;

  for (const chat of chats) {
    const jid: string = chat.wa_chatid || '';
    if (!jid || jid.includes('status@broadcast') || jid.includes('@newsletter')) { skipped++; continue; }

    const isGroup = !!chat.wa_isGroup || jid.endsWith('@g.us');
    const name: string =
      (chat.wa_contactName || chat.name || chat.lead_fullName || '').trim() ||
      jid.replace(/@.*$/, '');
    const photo: string | null = chat.imagePreview || chat.image || null;
    const photoFields = photo ? { photo_url: photo, photo_synced_at: new Date().toISOString() } : {};

    try {
      if (isGroup) {
        groups++;
        const { data: existing } = await sb
          .from('marpe_contacts')
          .select('id, name')
          .eq('phone', jid)
          .eq('source', 'whatsapp_group')
          .maybeSingle();

        if (existing?.id) {
          const updates: Record<string, any> = { ...photoFields };
          if (name && !name.includes('@g.us')) updates.name = name;
          if (Object.keys(updates).length) {
            await sb.from('marpe_contacts').update(updates).eq('id', existing.id);
            updated++;
          } else skipped++;
        } else {
          await sb.from('marpe_contacts').insert({
            name, phone: jid, source: 'whatsapp_group', ...photoFields,
          });
          created++;
        }
      } else {
        individuals++;
        const phone = jid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
        if (!phone || phone.length < 8) { skipped++; continue; }

        const { data: existing } = await sb
          .from('marpe_contacts')
          .select('id, name')
          .eq('phone', phone)
          .maybeSingle();

        let match = existing;
        if (!match?.id) {
          const { data: partial } = await sb
            .from('marpe_contacts')
            .select('id, name')
            .ilike('phone', `%${phone.slice(-8)}%`)
            .maybeSingle();
          match = partial || null;
        }

        const nameIsWeak = (n: string | null | undefined) =>
          !n || /^[\d\s()+\-]+$/.test(n) || n.includes('@');

        if (match?.id) {
          // Contato já existe (provavelmente do Corp): só completa foto e, se o
          // nome atual for fraco (número cru), o nome do WhatsApp.
          const updates: Record<string, any> = { ...photoFields };
          if (!nameIsWeak(name) && nameIsWeak(match.name)) updates.name = name;
          if (Object.keys(updates).length) {
            updates.updated_at = new Date().toISOString();
            await sb.from('marpe_contacts').update(updates).eq('id', match.id);
            updated++;
          } else skipped++;
        } else {
          await sb.from('marpe_contacts').insert({
            name: nameIsWeak(name) ? phone : name,
            phone,
            source: 'whatsapp',
            ...photoFields,
          });
          created++;
        }
      }
    } catch { skipped++; }
  }

  return new Response(JSON.stringify({
    ok: true,
    total_chats: chats.length,
    groups, individuals, created, updated, skipped,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
