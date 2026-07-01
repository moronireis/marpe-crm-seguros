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
}

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

export default function DealTabDocumentos({ dealId }: Props) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function loadDocs() {
    fetch(`/api/deals/${dealId}/documents`)
      .then(r => r.json())
      .then(d => { setDocs(d.documents || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadDocs(); }, [dealId]);

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
      </div>
    </div>
  );
}
