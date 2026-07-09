import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { getClienteAnexos, getNegocioAnexos } from '../../../lib/corp/client';

export const prerender = false;

// GET /api/corp/anexos?cliente={corp_id do contato}&negocio={corp_id do deal}
// Anexos armazenados no Corp — exibidos na aba Documentos do deal panel.
// Sem cache: as URLs são S3 pré-assinadas e expiram.
// corp_id de deal vem no formato "neg_{codfil}_{codigo}" (sync.ts); de contato é o código puro.
function corpCode(v: string | null): number {
  const m = (v || '').match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const cliente = corpCode(url.searchParams.get('cliente'));
  const negocio = corpCode(url.searchParams.get('negocio'));

  if (!cliente && !negocio) {
    return new Response(JSON.stringify({ error: 'Informe cliente e/ou negocio' }), { status: 400 });
  }

  const [cli, neg] = await Promise.allSettled([
    cliente ? getClienteAnexos(cliente) : Promise.resolve([]),
    negocio ? getNegocioAnexos(negocio) : Promise.resolve([]),
  ]);

  const errors: string[] = [];
  if (cli.status === 'rejected') errors.push(`cliente: ${cli.reason?.message || cli.reason}`);
  if (neg.status === 'rejected') errors.push(`negocio: ${neg.reason?.message || neg.reason}`);

  return new Response(JSON.stringify({
    cliente: cli.status === 'fulfilled' ? cli.value : [],
    negocio: neg.status === 'fulfilled' ? neg.value : [],
    ...(errors.length ? { errors } : {}),
  }), { status: 200, headers: { 'Cache-Control': 'no-store' } });
};
