import { useState, useEffect } from 'react';

interface Note {
  id: string;
  content: string;
  created_at: string;
  user_id: string | null;
  marpe_profiles: { id: string; full_name: string } | null;
}

interface Props {
  dealId: string;
}

export default function DealTabAnotacoes({ dealId }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  function loadNotes() {
    fetch(`/api/deals/${dealId}/notes`)
      .then(r => r.json())
      .then(d => { setNotes(d.notes || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadNotes(); }, [dealId]);

  async function handleAdd() {
    if (!newNote.trim() || saving) return;
    setSaving(true);
    const res = await fetch(`/api/deals/${dealId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newNote.trim() }),
    });
    if (res.ok) {
      setNewNote('');
      loadNotes();
    }
    setSaving(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Add note */}
      <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Adicionar nota..."
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '8px 10px',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text-primary)', fontSize: 12,
            fontFamily: 'inherit', outline: 'none', resize: 'vertical', minHeight: 60,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            onClick={handleAdd}
            disabled={saving || !newNote.trim()}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none',
              background: newNote.trim() ? 'var(--accent)' : 'rgba(59,130,246,0.3)',
              color: newNote.trim() ? '#fff' : 'var(--text-muted)',
              fontSize: 11, cursor: newNote.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', fontWeight: 600,
            }}
          >
            {saving ? 'Salvando...' : 'Adicionar Nota'}
          </button>
        </div>
      </div>

      {/* Notes list */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
        {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Carregando...</div>}
        {!loading && notes.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
            Nenhuma nota registrada.
          </div>
        )}
        {notes.map((note, i) => {
          const date = new Date(note.created_at);
          const userName = note.marpe_profiles?.full_name || 'Sistema';
          return (
            <div key={note.id} style={{
              padding: '10px 0',
              borderBottom: i < notes.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{userName}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  {date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{
                fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap',
                wordBreak: 'break-word', lineHeight: 1.5,
                background: 'var(--bg-card)', borderRadius: 6, padding: '8px 10px',
                border: '1px solid var(--border-subtle)',
              }}>
                {note.content}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
