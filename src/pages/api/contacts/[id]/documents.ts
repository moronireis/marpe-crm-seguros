import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/api-auth';
import { createServerClient } from '../../../../lib/supabase-server';

export const prerender = false;

/**
 * Anexos do cliente — SÓ CRM (revisão 28/07, PDF Sincronização §10).
 * A API do Corp só permite BAIXAR anexos (GET /cliente_anexos); upload não existe
 * (OPTIONS: GET-only; cobrado da Agia). Espelha o padrão dos documentos do
 * negócio (marpe_deal_documents), com uma diferença: o bucket é privado e o GET
 * devolve `signed_url` por arquivo — link direto de bucket privado não abre.
 */

const BUCKET = 'marpe-contact-docs';

const json = (b: any, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ locals, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;
  const { id } = params;
  if (!id) return json({ error: 'id required' }, 400);

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_contact_documents')
    .select('*, marpe_profiles(id, full_name)')
    .eq('contact_id', id)
    .order('created_at', { ascending: false });

  if (error) return json({ error: error.message }, 500);

  // URL assinada por arquivo (1h) — o download real de bucket privado
  const docs = await Promise.all((data || []).map(async (doc: any) => {
    const { data: signed } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, 3600)
      .then(r => r, () => ({ data: null } as any));
    return { ...doc, signed_url: signed?.signedUrl || null };
  }));

  return json({ documents: docs });
};

export const POST: APIRoute = async ({ locals, request, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;
  const { id } = params;
  if (!id) return json({ error: 'id required' }, 400);

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file || !file.name) return json({ error: 'file required' }, 400);
  if (file.size > 45 * 1024 * 1024) return json({ error: 'Arquivo acima de 45 MB' }, 400);

  const sb = createServerClient();
  const filePath = `contacts/${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 52428800 }).catch(() => {});

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (uploadErr) return json({ error: 'Upload falhou: ' + uploadErr.message }, 500);

  const { data, error } = await sb
    .from('marpe_contact_documents')
    .insert({
      contact_id: id,
      user_id: profile.id !== 'mvp-admin' ? profile.id : null,
      file_name: file.name,
      file_path: filePath,
      file_size: buffer.length,
      mime_type: file.type || null,
    })
    .select('*, marpe_profiles(id, full_name)')
    .single();
  if (error) return json({ error: error.message }, 500);

  return json({ document: data }, 201);
};

export const DELETE: APIRoute = async ({ locals, request, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;
  const { id } = params;
  if (!id) return json({ error: 'id required' }, 400);

  const body = await request.json().catch(() => ({} as any));
  if (!body.document_id) return json({ error: 'document_id required' }, 400);

  const sb = createServerClient();
  const { data: doc } = await sb
    .from('marpe_contact_documents')
    .select('id, file_path')
    .eq('id', body.document_id)
    .eq('contact_id', id)
    .single();
  if (!doc) return json({ error: 'Documento não encontrado' }, 404);

  await sb.storage.from(BUCKET).remove([doc.file_path]).catch(() => {});
  const { error } = await sb.from('marpe_contact_documents').delete().eq('id', doc.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
};
