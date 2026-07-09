import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { createCliente, createTelefone, createEndereco, createEmail, deleteCliente } from '../../../lib/corp/client';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();
  const search = url.searchParams.get('search') || '';
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const sourceFilter = url.searchParams.get('source') || '';       // e.g. ?source=whatsapp_group
  const excludeSource = url.searchParams.get('exclude_source') || ''; // e.g. ?exclude_source=whatsapp_group

  // Inbox mode: contacts with at least one message, ordered by most recent message
  // This is the WhatsApp-style conversation list
  const { data: msgContacts, error: msgErr } = await sb
    .from('marpe_messages')
    .select('contact_id, created_at, body, direction, content_type')
    .order('created_at', { ascending: false })
    .limit(2000);

  if (msgErr) return new Response(JSON.stringify({ error: msgErr.message }), { status: 500 });

  // Deduplicate — keep only the most recent message per contact
  const seen = new Set<string>();
  const latestByContact: { contact_id: string; body: string; direction: string; content_type: string; created_at: string }[] = [];
  for (const m of (msgContacts || [])) {
    if (!seen.has(m.contact_id)) {
      seen.add(m.contact_id);
      latestByContact.push(m);
    }
  }

  if (latestByContact.length === 0) {
    return new Response(JSON.stringify({ contacts: [], total: 0 }), { status: 200 });
  }

  // Fetch those contacts in order
  const contactIds = latestByContact.map(m => m.contact_id);

  let query = sb
    .from('marpe_contacts')
    .select('id, name, phone, email, city, corp_id, tags, source, photo_url')
    .in('id', contactIds);

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
  }

  // Source filtering — backward compatible (no param = return all)
  if (sourceFilter) {
    query = query.eq('source', sourceFilter);
  } else if (excludeSource) {
    query = query.neq('source', excludeSource);
  }

  const { data: contacts, error: contactErr } = await query.range(0, 499);
  if (contactErr) return new Response(JSON.stringify({ error: contactErr.message }), { status: 500 });

  // Re-order to match message recency order
  const contactMap = new Map((contacts || []).map((c: any) => [c.id, c]));
  const ordered = latestByContact
    .map(m => {
      const contact = contactMap.get(m.contact_id);
      if (!contact) return null;
      return {
        ...contact,
        last_message: m.body,
        last_message_direction: m.direction,
        last_content_type: m.content_type,
        last_message_at: m.created_at,
      };
    })
    .filter(Boolean)
    .slice(offset, offset + limit);

  return new Response(JSON.stringify({ contacts: ordered, total: ordered.length }), { status: 200 });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.name) {
    return new Response(JSON.stringify({ error: 'name required' }), { status: 400 });
  }

  // Corp-integrated creation (botão Novo Cliente): grava no Corp PRIMEIRO, depois no
  // CRM com o vínculo. Se o Corp recusar o cliente, nada é criado. Sub-recursos
  // (telefone/endereço/e-mail) degradam para warnings — o cliente já existe no Corp
  // e eles podem ser completados por lá.
  let corpId: string | null = null;
  let corpCodigo: number | null = null;
  const warnings: string[] = [];

  if (body.corp) {
    try {
      corpCodigo = await createCliente({
        nome: body.name,
        pessoa: body.pessoa === 'J' ? 'J' : 'F',
        cpf_cnpj: body.cpf_cnpj || undefined,
        datanas: body.birth_date || undefined,
        sexo: body.sexo || undefined,
      });
      corpId = String(corpCodigo);
    } catch (e: any) {
      return new Response(JSON.stringify({ error: `Corp não aceitou o cadastro: ${e.message}` }), { status: 502 });
    }

    if (body.phone) {
      const digits = String(body.phone).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
      const ddd = parseInt(digits.slice(0, 2));
      const numero = digits.slice(2);
      if (ddd && numero.length >= 8) {
        try { await createTelefone({ codcli: corpCodigo, ddd, numero }); }
        catch (e: any) { warnings.push(`Telefone não gravado no Corp: ${e.message}`); }
      } else {
        warnings.push('Telefone em formato não reconhecido — não gravado no Corp.');
      }
    }
    if (body.cep || body.logradouro || body.city) {
      try {
        await createEndereco({
          codcli: corpCodigo,
          cep: body.cep ? String(body.cep).replace(/\D/g, '') : undefined,
          logradouro: body.logradouro || undefined,
          numero: body.numero_end ? parseInt(body.numero_end) : undefined,
          complemento: body.complemento || undefined,
          bairro: body.bairro || undefined,
          cidade: body.city || undefined,
          estado: body.state || undefined,
        });
      } catch (e: any) { warnings.push(`Endereço não gravado no Corp: ${e.message}`); }
    }
    if (body.email) {
      try { await createEmail({ codcli: corpCodigo, email: body.email }); }
      catch (e: any) { warnings.push(`E-mail não gravado no Corp: ${e.message}`); }
    }
  }

  const address = [
    [body.logradouro, body.numero_end].filter(Boolean).join(', '),
    body.complemento,
    body.bairro,
  ].filter(Boolean).join(' — ') || null;

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_contacts')
    .insert({
      name: body.name,
      phone: body.phone || null,
      email: body.email || null,
      cpf_cnpj: body.cpf_cnpj || null,
      birth_date: body.birth_date || null,
      profession: body.profession || null,
      address,
      city: body.city || null,
      state: body.state || null,
      tags: body.tags || [],
      notes: body.notes || null,
      corp_id: corpId,
      source: 'manual',
      responsible_id: profile.id,
    })
    .select()
    .single();

  if (error) {
    // O cliente já foi criado no Corp — desfaz para não deixar registro órfão.
    if (corpCodigo != null) {
      try { await deleteCliente(corpCodigo); }
      catch { warnings.push(`Cliente ${corpCodigo} ficou órfão no Corp — remova manualmente.`); }
    }
    return new Response(JSON.stringify({ error: error.message, warnings }), { status: 500 });
  }
  return new Response(JSON.stringify({ contact: data, warnings }), { status: 201 });
};
