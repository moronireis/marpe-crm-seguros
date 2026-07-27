import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/api-auth';
import { createServerClient } from '../../../../lib/supabase-server';

export const prerender = false;

/**
 * GET /api/campaigns/[id]/results — estágio "Resultados" do wizard (S5, PDF Campanha).
 * Devolve o status POR DESTINATÁRIO com nome e telefone, e o resumo.
 * Antes só existiam os contadores agregados na campanha; quando algo falhava,
 * não dava para saber com quem.
 */
export const GET: APIRoute = async ({ locals, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  const sb = createServerClient();

  const { data: campaign } = await sb
    .from('marpe_campaigns')
    .select('id, name, status, message_type, sent_count, failed_count, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (!campaign) return new Response(JSON.stringify({ error: 'Campanha não encontrada' }), { status: 404 });

  const { data: rows, error } = await sb
    .from('marpe_campaign_recipients')
    .select('id, contact_id, status, sent_at, error_message, marpe_contacts(name, phone)')
    .eq('campaign_id', id)
    .order('sent_at', { ascending: true, nullsFirst: false })
    .limit(2000);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const recipients = (rows || []).map((r: any) => ({
    id: r.id,
    contact_id: r.contact_id,
    name: r.marpe_contacts?.name ?? null,
    phone: r.marpe_contacts?.phone ?? null,
    status: r.status,
    sent_at: r.sent_at,
    error: r.error_message,
  }));

  const sent = recipients.filter(r => r.status === 'sent').length;
  const failed = recipients.filter(r => r.status === 'failed').length;

  // Agrupa os motivos de falha — 40 linhas de "sem telefone" viram uma só
  const errorSummary: Record<string, number> = {};
  for (const r of recipients) {
    if (r.status === 'failed' && r.error) {
      errorSummary[r.error] = (errorSummary[r.error] || 0) + 1;
    }
  }

  return new Response(JSON.stringify({
    campaign,
    total: recipients.length,
    sent,
    failed,
    pending: Math.max(0, (campaign.sent_count || 0) + (campaign.failed_count || 0) - recipients.length),
    error_summary: Object.entries(errorSummary)
      .sort((a, b) => b[1] - a[1])
      .map(([error, count]) => ({ error, count })),
    recipients,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
