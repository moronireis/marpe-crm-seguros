import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const month = parseInt(url.searchParams.get('month') || String(new Date().getMonth() + 1));
  const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()));

  if (isNaN(month) || month < 1 || month > 12) {
    return new Response(JSON.stringify({ error: 'Invalid month (1-12 required)' }), { status: 400 });
  }
  if (isNaN(year) || year < 2020 || year > 2100) {
    return new Response(JSON.stringify({ error: 'Invalid year' }), { status: 400 });
  }

  const sb = createServerClient();

  // Fetch goals for this month/year
  const { data: goals, error: goalsError } = await sb
    .from('marpe_producer_goals')
    .select('*')
    .eq('month', month)
    .eq('year', year)
    .order('producer_name');

  if (goalsError) return new Response(JSON.stringify({ error: goalsError.message }), { status: 500 });

  // Fetch actual deal performance for this month/year
  // Use created_at range for the full calendar month
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 1).toISOString(); // exclusive upper bound

  const { data: deals, error: dealsError } = await sb
    .from('marpe_deals')
    .select('produtor, premio')
    .gte('created_at', startDate)
    .lt('created_at', endDate)
    .not('produtor', 'is', null);

  if (dealsError) return new Response(JSON.stringify({ error: dealsError.message }), { status: 500 });

  // Aggregate actual performance by producer
  const actualByProducer: Record<string, { deals: number; premio: number }> = {};
  for (const deal of deals || []) {
    const name = deal.produtor as string;
    if (!actualByProducer[name]) actualByProducer[name] = { deals: 0, premio: 0 };
    actualByProducer[name].deals += 1;
    actualByProducer[name].premio += deal.premio ? Number(deal.premio) : 0;
  }

  // Merge goals with actuals
  const result = (goals || []).map(goal => {
    const actual = actualByProducer[goal.producer_name] || { deals: 0, premio: 0 };
    return {
      id: goal.id,
      producer_name: goal.producer_name,
      month: goal.month,
      year: goal.year,
      target_premio: Number(goal.target_premio),
      target_deals: goal.target_deals,
      actual_premio: actual.premio,
      actual_deals: actual.deals,
      pct_premio: goal.target_premio > 0 ? Math.round((actual.premio / Number(goal.target_premio)) * 100) : null,
      pct_deals: goal.target_deals > 0 ? Math.round((actual.deals / goal.target_deals) * 100) : null,
    };
  });

  return new Response(JSON.stringify({ goals: result, month, year }), { status: 200 });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { producer_name, month, year, target_premio, target_deals } = body;

  if (!producer_name || typeof producer_name !== 'string' || !producer_name.trim()) {
    return new Response(JSON.stringify({ error: 'producer_name required' }), { status: 400 });
  }
  if (!month || month < 1 || month > 12) {
    return new Response(JSON.stringify({ error: 'month required (1-12)' }), { status: 400 });
  }
  if (!year || year < 2020) {
    return new Response(JSON.stringify({ error: 'year required' }), { status: 400 });
  }

  const sb = createServerClient();

  const { data, error } = await sb
    .from('marpe_producer_goals')
    .upsert(
      {
        producer_name: producer_name.trim(),
        month,
        year,
        target_premio: target_premio ?? 0,
        target_deals: target_deals ?? 0,
      },
      { onConflict: 'producer_name,month,year' }
    )
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ goal: data }), { status: 200 });
};
