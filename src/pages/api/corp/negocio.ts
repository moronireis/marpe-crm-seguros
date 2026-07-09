import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { getNegocio } from '../../../lib/corp/client';

export const prerender = false;

// GET /api/corp/negocio?codigo={corp_id do deal}
// Proxy do detalhe da negociação no Corp — consumido pela aba Perfil do deal panel.
// (A aba já chamava esta rota, que não existia — criada em 2026-07-09.)
export const GET: APIRoute = async ({ locals, url }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  // Aceita o código puro ("7588") ou o corp_id do deal ("neg_1_7588" — formato do sync)
  const m = (url.searchParams.get('codigo') || '').match(/(\d+)$/);
  const codigo = m ? parseInt(m[1], 10) : 0;
  if (!codigo) {
    return new Response(JSON.stringify({ error: 'codigo requerido' }), { status: 400 });
  }

  try {
    const negocio = await getNegocio(codigo);
    if (!negocio) {
      return new Response(JSON.stringify({ error: 'Negócio não encontrado no Corp' }), { status: 404 });
    }
    // Alias para o shape que a aba Perfil espera (val_c → val_comissao)
    return new Response(JSON.stringify({
      negocio: { ...negocio, val_comissao: (negocio as any).val_c ?? null },
    }), { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Falha ao consultar o Corp' }), { status: 502 });
  }
};
