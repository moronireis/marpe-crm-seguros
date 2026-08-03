import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

/**
 * Renomear e excluir etiqueta (teste A8).
 *
 * A etiqueta vive em dois lugares: no catálogo (marpe_tags) e dentro do array
 * marpe_contacts.tags de cada contato marcado. Renomear ou excluir só no catálogo
 * deixaria os contatos apontando para um nome morto — então as duas operações
 * propagam para os contatos afetados.
 */

async function contatosComEtiqueta(sb: any, nome: string) {
  const alvo = nome.trim().toLowerCase();
  const { data } = await sb.from('marpe_contacts').select('id, tags').not('tags', 'is', null);
  return (data || []).filter((c: any) =>
    (c.tags || []).some((t: string) => String(t).trim().toLowerCase() === alvo));
}

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 });
  }

  const sb = createServerClient();
  const { data: atual } = await sb.from('marpe_tags').select('*').eq('id', id).maybeSingle();
  if (!atual) return new Response(JSON.stringify({ error: 'Etiqueta não encontrada.' }), { status: 404 });

  const novoNome = body.nome != null ? String(body.nome).trim() : atual.nome;
  if (!novoNome) return new Response(JSON.stringify({ error: 'Informe o nome da etiqueta.' }), { status: 400 });

  const { data, error } = await sb.from('marpe_tags')
    .update({
      nome: novoNome,
      ...(body.cor !== undefined ? { cor: body.cor || null } : {}),
      ...(body.descricao !== undefined ? { descricao: body.descricao || null } : {}),
    })
    .eq('id', id).select().single();

  if (error) {
    if ((error as any).code === '23505') {
      return new Response(JSON.stringify({ error: `Já existe uma etiqueta chamada "${novoNome}".` }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // Propaga o novo nome para os contatos marcados
  let atualizados = 0;
  if (novoNome !== atual.nome) {
    const alvos = await contatosComEtiqueta(sb, atual.nome);
    for (const c of alvos) {
      const tags = (c.tags || []).map((t: string) =>
        String(t).trim().toLowerCase() === atual.nome.trim().toLowerCase() ? novoNome : t);
      const { error: upErr } = await sb.from('marpe_contacts').update({ tags }).eq('id', c.id);
      if (!upErr) atualizados++;
    }
  }

  return new Response(JSON.stringify({ tag: data, contatos_atualizados: atualizados }), { status: 200 });
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  const sb = createServerClient();
  const { data: atual } = await sb.from('marpe_tags').select('*').eq('id', id).maybeSingle();
  if (!atual) return new Response(JSON.stringify({ error: 'Etiqueta não encontrada.' }), { status: 404 });

  // Tira a etiqueta dos contatos antes de apagar do catálogo
  const alvos = await contatosComEtiqueta(sb, atual.nome);
  let limpos = 0;
  for (const c of alvos) {
    const tags = (c.tags || []).filter((t: string) =>
      String(t).trim().toLowerCase() !== atual.nome.trim().toLowerCase());
    const { error: upErr } = await sb.from('marpe_contacts').update({ tags }).eq('id', c.id);
    if (!upErr) limpos++;
  }

  const { error } = await sb.from('marpe_tags').delete().eq('id', id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ ok: true, contatos_limpos: limpos }), { status: 200 });
};
