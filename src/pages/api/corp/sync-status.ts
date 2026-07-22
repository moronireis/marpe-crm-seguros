import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

/**
 * GET /api/corp/sync-status — S0 (board 22/07).
 * Último sync de negócios bem-sucedido + último erro registrado. Alimenta o
 * banner de staleness do CRM (a quebra do login Corp em 21/07 ficou invisível
 * por 2 dias porque nada exibia a idade do último sync).
 */
export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();
  const [succ, err] = await Promise.all([
    sb.from('marpe_corp_sync_log')
      .select('sync_type, status, records_updated, started_at')
      .like('sync_type', 'negocios%')
      .in('status', ['success', 'partial'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from('marpe_corp_sync_log')
      .select('sync_type, status, error_message, started_at')
      .eq('status', 'error')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const last = succ.data?.started_at ? new Date(succ.data.started_at).getTime() : null;
  const staleHours = last ? Math.round((Date.now() - last) / 36e5 * 10) / 10 : null;

  return new Response(JSON.stringify({
    last_success: succ.data || null,
    last_error: err.data || null,
    stale_hours: staleHours,
  }), { status: 200, headers: { 'Cache-Control': 'no-store' } });
};
