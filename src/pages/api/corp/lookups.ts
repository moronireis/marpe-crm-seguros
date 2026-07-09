import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { listRamos, listSeguradoras, listProdutores, listAgentes, listProfissoes } from '../../../lib/corp/client';

export const prerender = false;

// Pick-lists for the Novo Negócio / Novo Cliente modals.
// Live from Corp: ramos, seguradoras, produtores, agentes, profissões.
// Derived from synced data: campanhas (Corp has no GET endpoint for them).
// Static: tipos (observed enum — Corp has no lookup endpoint).
// Cached per serverless instance for 10 minutes; the lists change rarely.
const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; body: string } | null = null;

export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  if (cache && Date.now() - cache.at < TTL_MS) {
    return new Response(cache.body, { status: 200 });
  }

  const sb = createServerClient();
  const [ramos, seguradoras, produtores, agentes, profissoes, campanhasQ] = await Promise.allSettled([
    listRamos(),
    listSeguradoras(),
    listProdutores(),
    listAgentes(),
    listProfissoes(),
    sb.from('marpe_deals').select('campanha').not('campanha', 'is', null).limit(2000),
  ]);

  const ok = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : fallback;

  const campanhaRows = (ok(campanhasQ, { data: [] } as any) as any)?.data || [];
  const campanhas = [...new Set(campanhaRows.map((d: any) => d.campanha).filter(Boolean))].sort() as string[];

  const body = JSON.stringify({
    ramos: ok(ramos, [] as Awaited<ReturnType<typeof listRamos>>),
    seguradoras: ok(seguradoras, [] as Awaited<ReturnType<typeof listSeguradoras>>),
    produtores: ok(produtores, [] as Awaited<ReturnType<typeof listProdutores>>),
    agentes: ok(agentes, [] as Awaited<ReturnType<typeof listAgentes>>),
    profissoes: ok(profissoes, [] as Awaited<ReturnType<typeof listProfissoes>>),
    campanhas,
    tipos: [
      { codigo: 1, nome: 'Prospecção', deal_type: 'prospeccao' },
      { codigo: 2, nome: 'Renovação', deal_type: 'renovacao' },
      { codigo: 3, nome: 'Resgate', deal_type: 'resgate' },
    ],
  });
  cache = { at: Date.now(), body };
  return new Response(body, { status: 200 });
};
