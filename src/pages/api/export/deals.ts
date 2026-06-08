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

function fmtDate(d: string | null): string {
  if (!d) return '';
  // ISO date or datetime → DD/MM/YYYY
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('pt-BR');
  } catch { return d; }
}

function fmtMoney(v: number | null): string {
  if (v == null) return '';
  return v.toFixed(2).replace('.', ',');
}

export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const format = url.searchParams.get('format') || 'csv';
  if (format !== 'csv') {
    return new Response(JSON.stringify({ error: 'Only format=csv is supported' }), { status: 400 });
  }

  const funnelId = url.searchParams.get('funnel_id');
  const sb = createServerClient();

  let query = sb
    .from('marpe_deals')
    .select(`
      id, title, ramo, seguradora, premio, comissao_valor, comissao_pct,
      vigencia_inicio, vigencia_fim, deal_type, status_custom, produtor,
      veiculo, placa, next_action, next_action_date, created_at,
      marpe_contacts ( name, phone, cpf_cnpj, email, city, state, tags ),
      marpe_funnel_stages ( name ),
      marpe_funnels ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (funnelId) {
    query = query.eq('funnel_id', funnelId);
  }

  const { data, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const headers = [
    'Nome do Contato', 'Telefone', 'Ramo', 'Seguradora',
    'Prêmio', 'Comissão', 'Vigência Início', 'Vigência Fim',
    'Funil', 'Etapa', 'Tipo', 'Status', 'Produtor',
    'Veículo', 'Placa', 'Próxima Ação', 'Data Próxima Ação',
  ];

  const rows = (data || []).map((d: any) => {
    const contact = d.marpe_contacts;
    const stage = d.marpe_funnel_stages;
    const funnel = d.marpe_funnels;

    // Comissão: prefer stored comissao_valor, fall back to pct * premio
    let comissao = '';
    if (d.comissao_valor != null) {
      comissao = fmtMoney(d.comissao_valor);
    } else if (d.comissao_pct != null && d.premio != null) {
      comissao = fmtMoney((d.comissao_pct / 100) * d.premio);
    }

    return [
      contact?.name || d.title || '',
      contact?.phone || '',
      d.ramo || '',
      d.seguradora || '',
      fmtMoney(d.premio),
      comissao,
      fmtDate(d.vigencia_inicio),
      fmtDate(d.vigencia_fim),
      funnel?.name || '',
      stage?.name || '',
      d.deal_type || '',
      d.status_custom || '',
      d.produtor || '',
      d.veiculo || '',
      d.placa || '',
      d.next_action || '',
      fmtDate(d.next_action_date),
    ];
  });

  const csv = toCSV(headers, rows);
  const filename = funnelId
    ? `negocios-funil-${funnelId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`
    : `negocios-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
