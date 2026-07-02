import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/api-auth';
import { createServerClient } from '../../../../lib/supabase-server';

export const prerender = false;

// GET /api/deals/[id]/documents — list documents for a deal
export const GET: APIRoute = async ({ locals, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  const sb = createServerClient();
  const { data, error } = await sb
    .from('marpe_deal_documents')
    .select('*, marpe_profiles(id, full_name)')
    .eq('deal_id', id)
    .order('created_at', { ascending: false });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ documents: data }), { status: 200 });
};

// POST /api/deals/[id]/documents — upload a document
export const POST: APIRoute = async ({ locals, request, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file || !file.name) {
    return new Response(JSON.stringify({ error: 'file required' }), { status: 400 });
  }

  const sb = createServerClient();

  // Upload to Supabase Storage
  const ext = file.name.split('.').pop() || 'bin';
  const timestamp = Date.now();
  const filePath = `deals/${id}/${timestamp}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  await sb.storage.createBucket('marpe-deal-docs', { public: false, fileSizeLimit: 52428800 }).catch(() => {});

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadErr } = await sb.storage
    .from('marpe-deal-docs')
    .upload(filePath, buffer, { contentType: file.type || 'application/octet-stream', upsert: false });

  if (uploadErr) {
    return new Response(JSON.stringify({ error: 'Upload failed: ' + uploadErr.message }), { status: 500 });
  }

  // Save metadata to DB
  const { data, error } = await sb
    .from('marpe_deal_documents')
    .insert({
      deal_id: id,
      user_id: profile.id !== 'mvp-admin' ? profile.id : null,
      file_name: file.name,
      file_path: filePath,
      file_size: buffer.length,
      mime_type: file.type || null,
    })
    .select('*, marpe_profiles(id, full_name)')
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Log activity
  await sb.from('marpe_deal_activities').insert({
    deal_id: id,
    user_id: profile.id !== 'mvp-admin' ? profile.id : null,
    type: 'document_upload',
    description: `Documento anexado: ${file.name}`,
    metadata: { document_id: data.id, file_name: file.name, file_size: buffer.length },
  }).then(null, () => {});

  // Update deal last_activity
  await sb.from('marpe_deals')
    .update({ last_activity: new Date().toISOString() })
    .eq('id', id)
    .then(null, () => {});

  return new Response(JSON.stringify({ document: data }), { status: 201 });
};

// DELETE /api/deals/[id]/documents — delete a document
export const DELETE: APIRoute = async ({ locals, request, params }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!body.document_id) {
    return new Response(JSON.stringify({ error: 'document_id required' }), { status: 400 });
  }

  const sb = createServerClient();

  // Get the document to find file_path
  const { data: doc } = await sb
    .from('marpe_deal_documents')
    .select('id, file_name, file_path')
    .eq('id', body.document_id)
    .eq('deal_id', id)
    .single();

  if (!doc) {
    return new Response(JSON.stringify({ error: 'Document not found' }), { status: 404 });
  }

  // Delete from storage
  await sb.storage.from('marpe-deal-docs').remove([doc.file_path]).catch(() => {});

  // Delete from DB
  const { error } = await sb
    .from('marpe_deal_documents')
    .delete()
    .eq('id', body.document_id);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Log activity
  await sb.from('marpe_deal_activities').insert({
    deal_id: id,
    user_id: profile.id !== 'mvp-admin' ? profile.id : null,
    type: 'document_delete',
    description: `Documento removido: ${doc.file_name}`,
    metadata: { file_name: doc.file_name },
  }).then(null, () => {});

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
