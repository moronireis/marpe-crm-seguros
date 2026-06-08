import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(';')];
  for (const row of rows) lines.push(row.map(v => escape(v ?? '')).join(';'));
  return '\ufeff' + lines.join('\r\n'); // BOM for Excel UTF-8
}

export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const format = url.searchParams.get('format') || 'csv';
  if (format !== 'csv') {
    return new Response(JSON.stringify({ error: 'Only format=csv is supported' }), { status: 400 });
  }

  const sb = createServerClient();

  // Fetch all contacts with deal count via subquery
  const { data: contacts, error: contactErr } = await sb
    .from('marpe_contacts')
    .select('id, name, cpf_cnpj, phone, email, city, state, tags, source, created_at')
    .order('name', { ascending: true })
    .limit(10000);

  if (contactErr) {
    return new Response(JSON.stringify({ error: contactErr.message }), { status: 500 });
  }

  // Fetch deal counts grouped by contact_id
  const { data: dealCounts, error: dealErr } = await sb
    .from('marpe_deals')
    .select('contact_id');

  if (dealErr) {
    return new Response(JSON.stringify({ error: dealErr.message }), { status: 500 });
  }

  // Build count map
  const countMap = new Map<string, number>();
  for (const d of (dealCounts || [])) {
    countMap.set(d.contact_id, (countMap.get(d.contact_id) || 0) + 1);
  }

  const headers = [
    'Nome', 'CPF/CNPJ', 'Telefone', 'Email',
    'Cidade', 'Estado', 'Tags', 'Qtd Negócios', 'Origem',
  ];

  const rows = (contacts || []).map((c: any) => [
    c.name || '',
    c.cpf_cnpj || '',
    c.phone || '',
    c.email || '',
    c.city || '',
    c.state || '',
    Array.isArray(c.tags) ? c.tags.join(', ') : (c.tags || ''),
    String(countMap.get(c.id) || 0),
    c.source || '',
  ]);

  const csv = toCSV(headers, rows);
  const filename = `contatos-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
