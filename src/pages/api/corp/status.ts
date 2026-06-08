import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { listClientes, listRamos, listProdutores } from '../../../lib/corp/client';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  try {
    const { count } = await listClientes('');
    const ramos = await listRamos();
    const produtores = await listProdutores();

    return new Response(JSON.stringify({
      connected: true,
      clientes: count,
      ramos: ramos.length,
      produtores: produtores.length,
    }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({
      connected: false,
      error: err.message,
    }), { status: 200 });
  }
};
