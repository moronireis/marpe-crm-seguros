import { useState, useEffect, useRef } from 'react';

interface Document {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  marpe_profiles: { id: string; full_name: string } | null;
}

interface Props {
  dealId: string;
  dealCorpId: string | null;
  contactCorpId: string | null;
}

// Anexo vindo do Corp (GET /api/corp/anexos). A URL é S3 pré-assinada e expira —
// por isso é buscada a cada abertura da aba e nunca persistida.
interface CorpAnexo {
  nome: string;
  tipo: string;
  url: string;
  indice_anexo: number;
  origem: 'negociacao' | 'cliente';
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.jpe', '.png', '.webp', '.gif', '.bmp'];

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILE_ICONS: Record<string, string> = {
  'application/pdf': '📄',
  'image/jpeg': '🖼',
  'image/png': '🖼',
  'image/webp': '🖼',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
};

export default function DealTabDocumentos({ dealId, dealCorpId, contactCorpId }: Props) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasCorp = Boolean(dealCorpId || contactCorpId);
  const [corpAnexos, setCorpAnexos] = useState<CorpAnexo[]>([]);
  const [corpLoading, setCorpLoading] = useState(hasCorp);
  const [corpError, setCorpError] = useState<string | null>(null);

  function loadDocs() {
    fetch(`/api/deals/${dealId}/documents`)
      .then(r => r.json())
      .then(d => { setDocs(d.documents || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadDocs(); }, [dealId]);

  function loadCorpAnexos() {
    if (!hasCorp) return;
    setCorpLoading(true);
    setCorpError(null);
    const params = new URLSearchParams();
    if (contactCorpId) params.set('cliente', contactCorpId);
    if (dealCorpId) params.set('negocio', dealCorpId);

    fetch(`/api/corp/anexos?${params}`)
      .then(r => {
        if (!r.ok) throw new Error('Falha ao buscar anexos do Corp');
        return r.json();
      })
      .then(d => {
        const merged: CorpAnexo[] = [
          ...(d.negocio || []).map((a: any) => ({ ...a, origem: 'negociacao' as const })),
          ...(d.cliente || []).map((a: any) => ({ ...a, origem: 'cliente' as const })),
        ];
        setCorpAnexos(merged);
        if (d.errors?.length) setCorpError('Parte dos anexos não pôde ser carregada');
        setCorpLoading(false);
      })
      .catch(err => {
        setCorpError(err.message);
        setCorpLoading(false);
      });
  }

  useEffect(() => { loadCorpAnexos(); }, [dealCorpId, contactCorpId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`/api/deals/${dealId}/documents`, {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      loadDocs();
    } else {
      const data = await res.json().catch(() => ({}));
      alert('Erro ao enviar: ' + (data.error || 'Falha no upload'));
    }

    setUploading(false);
    // Reset file input
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleDelete(docId: string, fileName: string) {
    if (!confirm(`Remover "${fileName}"?`)) return;
    setDeleting(docId);

    await fetch(`/api/deals/${dealId}/documents`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: docId }),
    });

    setDeleting(null);
    loadDocs();
  }

  function getDownloadUrl(filePath: string) {
    // Supabase Storage private bucket — generate signed URL via API
    // For now, construct the storage URL directly
    const supabaseUrl = (window as any).__SUPABASE_URL || '';
    if (supabaseUrl) {
      return `${supabaseUrl}/storage/v1/object/public/marpe-deal-docs/${filePath}`;
    }
    return '#';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Upload button */}
      <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          ref={fileRef}
          type="file"
          onChange={handleUpload}
          style={{ display: 'none' }}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '7px 14px', borderRadius: 6,
            border: '1px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.08)',
            color: 'var(--accent-light)', fontSize: 11, cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {uploading ? 'Enviando...' : 'Anexar Documento'}
        </button>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          PDF, DOC, XLS, imagens (max 50MB)
        </span>
      </div>

      {/* Documents list */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 4 }}>
        {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Carregando...</div>}
        {!loading && docs.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
            Nenhum documento anexado.
          </div>
        )}
        {docs.map(doc => {
          const icon = FILE_ICONS[doc.mime_type || ''] || '📎';
          const date = new Date(doc.created_at);
          const userName = doc.marpe_profiles?.full_name || 'Sistema';
          const isDeleting = deleting === doc.id;

          return (
            <div key={doc.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 0', borderBottom: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {doc.file_name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {formatSize(doc.file_size)} · {userName} · {date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <a
                  href={getDownloadUrl(doc.file_path)}
                  target="_blank"
                  rel="noopener"
                  title="Baixar"
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', textDecoration: 'none', cursor: 'pointer',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1v7M3 6l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
                <button
                  onClick={() => handleDelete(doc.id, doc.file_name)}
                  disabled={isDeleting}
                  title="Remover"
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: isDeleting ? 'var(--text-muted)' : '#f87171',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: isDeleting ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        {/* Anexos do Corp — somente leitura (a API do Corp não tem upload) */}
        {hasCorp && (
          <div style={{ marginTop: 18 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)', marginBottom: 4,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Anexos do Corp{corpAnexos.length > 0 ? ` (${corpAnexos.length})` : ''}
              </span>
              <button
                onClick={loadCorpAnexos}
                disabled={corpLoading}
                title="Atualizar (os links do Corp expiram)"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                  borderRadius: 5, border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-muted)', fontSize: 10, cursor: corpLoading ? 'default' : 'pointer',
                  fontFamily: 'inherit', opacity: corpLoading ? 0.5 : 1,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M10.5 6a4.5 4.5 0 1 1-1.32-3.18M10.5 1.5V4H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Atualizar
              </button>
            </div>

            {corpLoading && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 14 }}>
                Buscando anexos do Corp...
              </div>
            )}
            {!corpLoading && corpError && (
              <div style={{ fontSize: 11, color: '#f87171', textAlign: 'center', padding: 14 }}>
                {corpError}
              </div>
            )}
            {!corpLoading && !corpError && corpAnexos.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 14 }}>
                Nenhum anexo no Corp para este cliente/negociação.
              </div>
            )}
            {!corpLoading && corpAnexos.map(anexo => {
              const isImage = IMAGE_EXTS.includes((anexo.tipo || '').toLowerCase());
              return (
                <div key={`${anexo.origem}-${anexo.indice_anexo}`} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 0', borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <span style={{ width: 18, flexShrink: 0, display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    {isImage ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                        <circle cx="5" cy="5" r="1.2" fill="currentColor" />
                        <path d="M1.5 10.5l2.8-2.8 2.7 2.7 2-2 3.5 3.1" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 1h5.5L11.5 4v9h-8.5V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                        <path d="M8.5 1v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {anexo.nome}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {anexo.origem === 'negociacao' ? 'Negociação' : 'Cliente'} · Corp{anexo.tipo ? ` · ${anexo.tipo}` : ''}
                    </div>
                  </div>
                  <a
                    href={anexo.url}
                    target="_blank"
                    rel="noopener"
                    title="Abrir anexo"
                    style={{
                      width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                      border: '1px solid var(--border)', background: 'transparent',
                      color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', textDecoration: 'none', cursor: 'pointer',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1v7M3 6l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
