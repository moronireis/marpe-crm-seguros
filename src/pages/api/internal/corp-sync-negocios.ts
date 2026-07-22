import type { APIRoute } from 'astro';
import { syncNegocios, syncSinistros, logCorpSync } from '../../../lib/corp/sync';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

// Sync diurno de negócios (checkpoint 15/07): lista + DETALHE de cada negócio em
// andamento + reconciliação de exclusões. Agendado a cada 30 min (8h–20h30 BRT,
// seg–sáb) via GitHub Actions — o plano Vercel Hobby não roda cron sub-diário.
// O cron noturno (corp-sync, 3h UTC) continua cobrindo clientes + documentos.
// ?dry_run=1 → reconciliação apenas reporta o que removeria (validação segura).
export const GET: APIRoute = async ({ request, url }) => {
  const authHeader = request.headers.get('authorization') || '';
  const webhookKey = request.headers.get('x-webhook-key') || '';

  const cronSecret = import.meta.env.CRON_SECRET;
  const validCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const validWebhook = webhookKey === import.meta.env.WEBHOOK_KEY;

  if (!validCron && !validWebhook) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // S0 (22/07): falha aqui é falha DE VERDADE — retorna 500 para o curl -f do GitHub
  // Actions ficar vermelho. O 200 {ok:false} antigo deixou o cron verde por 2 dias
  // com o sync parado (login Corp 500 desde 21/07) e nada no corp_sync_log.
  if (!import.meta.env.CORP_API_URL || !import.meta.env.CORP_API_EMAIL || !import.meta.env.CORP_API_PASSWORD) {
    return new Response(JSON.stringify({ ok: false, error: 'Corp credentials not configured.' }), { status: 500 });
  }

  const dryRun = url.searchParams.get('dry_run') === '1';
  const startedAt = Date.now();

  try {
    const result = await syncNegocios({ withDetail: true, reconcileDryRun: dryRun });
    // S4.1 (issue #27): sinistros entram no ciclo diurno (1 chamada de lista, barato)
    const sinistros = await syncSinistros().catch(e => ({ type: 'sinistros', created: 0, updated: 0, skipped: 0, errors: [String(e?.message || e)] }));

    const sb = createServerClient();
    await logCorpSync(sb, {
      sync_type: 'negocios_day',
      status: result.errors.length ? 'partial' : 'success',
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      message: result.errors.length ? result.errors.slice(0, 5).join('; ') : null,
    });

    return new Response(JSON.stringify({
      ok: true,
      ran_at: new Date().toISOString(),
      duration_s: Math.round((Date.now() - startedAt) / 1000),
      dry_run: dryRun,
      negocios: {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.slice(0, 5),
      },
      reconcile: result.reconcile || null,
      sinistros: {
        created: sinistros.created,
        updated: sinistros.updated,
        skipped: sinistros.skipped,
        errors: sinistros.errors.slice(0, 3),
      },
    }), { status: 200 });
  } catch (e: any) {
    // S0 (22/07): registra a falha no corp_sync_log (antes só sucesso era logado —
    // a quebra do login Corp em 21/07 ficou invisível) e responde 500 para o
    // monitoramento externo (curl -f do GitHub Actions) acusar o problema.
    try {
      const sb = createServerClient();
      await logCorpSync(sb, {
        sync_type: 'negocios_day',
        status: 'error',
        message: String(e?.message || e).slice(0, 500),
      });
    } catch { /* log é best-effort */ }
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
};
