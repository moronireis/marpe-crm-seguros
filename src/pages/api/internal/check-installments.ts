import type { APIRoute } from 'astro';
import { createServerClient } from '../../../lib/supabase-server';
import { sendWhatsAppText } from '../../../lib/whatsapp/send';

export const prerender = false;

async function runCheck(request: Request): Promise<Response> {
  const sb = createServerClient();
  const today = new Date().toISOString().split('T')[0];
  const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

  // Find installments due today or in 3 days, not yet reminded, not paid/cancelled
  const { data: installments, error } = await sb
    .from('marpe_installments')
    .select('*, marpe_contacts(id, name, phone)')
    .in('due_date', [today, in3Days])
    .eq('reminder_sent', false)
    .not('status', 'in', '("paid","cancelled")');

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!installments?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 });
  }

  let sent = 0;
  const results = [];

  for (const inst of installments) {
    const contact = inst.marpe_contacts;
    if (!contact?.phone) continue;

    const dueDate = new Date(inst.due_date + 'T12:00:00').toLocaleDateString('pt-BR');
    const amount = inst.amount
      ? `R$ ${Number(inst.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      : '';

    const dayLabel = inst.due_date === today ? 'hoje' : 'em 3 dias';
    const message =
      `Olá ${contact.name}! Lembramos que sua parcela ${inst.installment_number}/${inst.total_installments} ` +
      `${amount ? `de ${amount} ` : ''}vence ${dayLabel} (${dueDate}). ` +
      `Em caso de dúvidas, entre em contato com a Marpe Corretora. 😊`;

    const result = await sendWhatsAppText(contact.phone, message, contact.id);

    if (result.ok) {
      await sb.from('marpe_installments')
        .update({ reminder_sent: true, updated_at: new Date().toISOString() })
        .eq('id', inst.id);
      sent++;
    }

    results.push({ installment_id: inst.id, contact: contact.name, ok: result.ok, error: result.error });
  }

  return new Response(JSON.stringify({ ok: true, sent, total: installments.length, results }), { status: 200 });
}

// GET /api/internal/check-installments
// Called by Vercel Cron — Vercel sends: Authorization: Bearer <CRON_SECRET>
export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('authorization') || '';
  const webhookKey = request.headers.get('x-webhook-key') || '';

  const cronSecret = import.meta.env.CRON_SECRET;
  const validCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const validWebhook = webhookKey === import.meta.env.WEBHOOK_KEY;

  if (!validCron && !validWebhook) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  return runCheck(request);
};

// POST /api/internal/check-installments
// Secured by WEBHOOK_KEY header — called manually or by external scheduler
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get('x-webhook-key');
  if (key !== import.meta.env.WEBHOOK_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  return runCheck(request);
};
