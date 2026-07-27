import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';
import { buscaPorCpfCnpj } from '../../../lib/corp/client';

export const prerender = false;

/**
 * GET /api/corp/busca-cpf?cpf_cnpj=...
 * Checagem de duplicidade pedida no PDF de Sincronização (regra geral):
 * "validar veracidade e checar duplicidade de cadastro no sistema".
 *
 * Consulta os DOIS lados — Corp (fonte) e CRM — porque um cliente pode existir
 * no Corp sem estar sincronizado ainda.
 *
 * Nunca bloqueia o cadastro: se a Corp estiver fora do ar, devolve
 * `corp_checked: false` e o modal apenas deixa de avisar.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const raw = (url.searchParams.get('cpf_cnpj') || '').replace(/\D/g, '');
  if (raw.length !== 11 && raw.length !== 14) {
    return new Response(JSON.stringify({ error: 'Informe um CPF (11) ou CNPJ (14 dígitos)' }), { status: 400 });
  }

  const sb = createServerClient();

  const [corpList, crmRes] = await Promise.all([
    buscaPorCpfCnpj(raw),
    sb.from('marpe_contacts')
      .select('id, name, corp_id, phone')
      .eq('cpf_cnpj', raw)
      .limit(3),
  ]);

  const corp = (corpList || []).map((c: any) => ({
    codigo: c.codigo ?? c.codcli ?? null,
    nome: c.nome ?? c.cliente ?? null,
  }));

  return new Response(JSON.stringify({
    // null vindo do client = Corp não respondeu; a UI não deve afirmar "não existe"
    corp_checked: corpList !== null,
    corp,
    crm: crmRes.data || [],
    duplicate: corp.length > 0 || (crmRes.data?.length || 0) > 0,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
