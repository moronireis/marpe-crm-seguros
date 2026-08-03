import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

/**
 * Catálogo de etiquetas — teste A8 (Marcel, 01/08): "onde criar, editar e
 * consultar as etiquetas??"
 *
 * Até aqui a etiqueta só existia como texto solto dentro de `marpe_contacts.tags`:
 * dava para marcar um contato, mas não havia lugar nenhum para ver a lista, corrigir
 * um nome escrito errado ou apagar uma que não se usa mais.
 *
 * A etiqueta CONTINUA morando em marpe_contacts.tags (é o que os filtros do Inbox e
 * das campanhas já leem). A tabela marpe_tags é o catálogo: renomear ou excluir aqui
 * propaga para todos os contatos que usam a etiqueta.
 *
 * Ao contrário dos cadastros do Corp, este é 100% nosso — por isso tem escrita.
 */

export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();
  const [{ data: tags }, { data: contatos }] = await Promise.all([
    sb.from('marpe_tags').select('*').order('ordem').order('nome'),
    sb.from('marpe_contacts').select('tags').not('tags', 'is', null),
  ]);

  // Quantos contatos usam cada etiqueta — o número que responde "vale a pena manter?"
  const uso = new Map<string, number>();
  for (const c of contatos || []) {
    for (const t of (c.tags || [])) {
      const k = String(t).trim().toLowerCase();
      if (k) uso.set(k, (uso.get(k) || 0) + 1);
    }
  }

  const lista = (tags || []).map(t => ({ ...t, contatos: uso.get(t.nome.trim().toLowerCase()) || 0 }));

  // Etiquetas que estão em uso nos contatos mas ficaram fora do catálogo
  const noCatalogo = new Set(lista.map(t => t.nome.trim().toLowerCase()));
  const orfas = [...uso.entries()]
    .filter(([nome]) => !noCatalogo.has(nome))
    .map(([nome, contatos]) => ({ nome, contatos }));

  return new Response(JSON.stringify({ tags: lista, orfas }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 });
  }

  const nome = String(body.nome || '').trim();
  if (!nome) return new Response(JSON.stringify({ error: 'Informe o nome da etiqueta.' }), { status: 400 });

  const sb = createServerClient();
  const { data, error } = await sb.from('marpe_tags')
    .insert({ nome, cor: body.cor || null, descricao: body.descricao || null })
    .select().single();

  if (error) {
    // 23505 = índice único em lower(nome)
    if ((error as any).code === '23505') {
      return new Response(JSON.stringify({ error: `Já existe uma etiqueta chamada "${nome}".` }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ tag: data }), { status: 201 });
};
