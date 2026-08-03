import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

/**
 * GET /api/deals/search?q=&contact_id=
 *
 * Busca do modal "Selecione o negócio" do Inbox (chamado 3a4d910f, PDF do Marcel):
 *   "Modal 'Seleciona o Negócio' com campo de busca. Nota: A busca pode ser feita
 *    por Nome do contato, Nome do Negócio, CPF, CNPJ, Placa, Chassi, Apólice, Proposta."
 *
 * Cobertos hoje: nome do contato, nome do negócio, CPF/CNPJ, placa, apólice e o
 * código do negócio no Corp (o número que a tela do Corp chama de proposta).
 * FORA: **chassi** — não existe coluna para ele em marpe_deals nem campo equivalente
 * na CorpAPI. Precisa de decisão do Marcel (criar o campo e quem preenche).
 *
 * Com `contact_id`, os negócios daquele contato vêm primeiro — é o caso normal:
 * a conversa é com alguém que já tem negócio no CRM.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();
  const q = (url.searchParams.get('q') || '').trim();
  const contactId = url.searchParams.get('contact_id');

  const COLUNAS = 'id, title, ramo, seguradora, apolice, premio, corp_id, stage_id, funnel_id, created_at, ' +
    'marpe_contacts!contact_id(id, name, cpf_cnpj, phone), marpe_funnel_stages(id, name, color)';

  // Negócios do contato da conversa — sempre no topo, mesmo sem busca
  let doContato: any[] = [];
  if (contactId) {
    const { data } = await sb.from('marpe_deals').select(COLUNAS)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(50);
    doContato = data || [];
  }

  let outros: any[] = [];
  if (q) {
    const like = `%${q}%`;
    const somenteDigitos = q.replace(/\D/g, '');

    // Campos do próprio negócio
    const filtros = [`title.ilike.${like}`, `apolice.ilike.${like}`, `placa.ilike.${like}`];
    if (somenteDigitos.length >= 3) filtros.push(`corp_id.ilike.%${somenteDigitos}%`);

    const [porNegocio, porContato] = await Promise.all([
      sb.from('marpe_deals').select(COLUNAS).or(filtros.join(',')).limit(40),
      // Nome do contato e CPF/CNPJ moram na tabela de contatos — resolve os ids antes
      (async () => {
        const filtrosContato = [`name.ilike.${like}`];
        if (somenteDigitos.length >= 3) filtrosContato.push(`cpf_cnpj.ilike.%${somenteDigitos}%`);
        const { data: cts } = await sb.from('marpe_contacts').select('id')
          .or(filtrosContato.join(',')).limit(30);
        const ids = (cts || []).map((c: any) => c.id);
        if (!ids.length) return { data: [] as any[] };
        return sb.from('marpe_deals').select(COLUNAS).in('contact_id', ids)
          .order('created_at', { ascending: false }).limit(40);
      })(),
    ]);

    outros = [...(porNegocio.data || []), ...((porContato as any).data || [])];
  }

  // Junta sem repetir, mantendo os do contato na frente
  const vistos = new Set<string>();
  const deals: any[] = [];
  for (const d of [...doContato, ...outros]) {
    if (vistos.has(d.id)) continue;
    vistos.add(d.id);
    deals.push({ ...d, do_contato: doContato.some(x => x.id === d.id) });
  }

  return new Response(JSON.stringify({ deals: deals.slice(0, 60) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
