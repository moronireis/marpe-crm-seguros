import type { APIRoute } from 'astro';
import { syncAll } from '../../../lib/corp/sync';

export const prerender = false;

// Called by Vercel Cron daily at 03:00 UTC
// Vercel automatically sends: Authorization: Bearer <CRON_SECRET>
export const GET: APIRoute = async ({ request }) => {
  // Verify Vercel cron secret OR manual WEBHOOK_KEY
  const authHeader = request.headers.get('authorization') || '';
  const webhookKey = request.headers.get('x-webhook-key') || '';

  const cronSecret = import.meta.env.CRON_SECRET;
  const validCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const validWebhook = webhookKey === import.meta.env.WEBHOOK_KEY;

  if (!validCron && !validWebhook) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const corpUrl = import.meta.env.CORP_API_URL;
  const corpEmail = import.meta.env.CORP_API_EMAIL;
  const corpPassword = import.meta.env.CORP_API_PASSWORD;

  if (!corpUrl || !corpEmail || !corpPassword) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Corp credentials not configured. Set CORP_API_URL, CORP_API_EMAIL, CORP_API_PASSWORD on Vercel.',
    }), { status: 200 });
  }

  try {
    const results = await syncAll();
    const totalCreated = results.reduce((s, r) => s + r.created, 0);
    const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
    const totalErrors = results.flatMap(r => r.errors).length;

    return new Response(JSON.stringify({
      ok: true,
      ran_at: new Date().toISOString(),
      results,
      summary: { created: totalCreated, updated: totalUpdated, errors: totalErrors },
    }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
};
