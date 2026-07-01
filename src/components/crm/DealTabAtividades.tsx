interface Activity {
  id: string;
  type: string;
  description: string;
  created_at: string;
  metadata: Record<string, any> | null;
  user_id: string | null;
}

interface Props {
  activities: Activity[];
  users?: Record<string, string>; // id -> full_name map
}

const TYPE_ICONS: Record<string, string> = {
  stage_change: '↗',
  field_update: '✎',
  note_added: '✐',
  creation: '+',
  automation: '⚡',
  note: '✐',
  call: '☎',
  message_sent: '✉',
  document_upload: '⬆',
  document_delete: '⬇',
  assignment: '→',
  loss: '✕',
};

const TYPE_LABELS: Record<string, string> = {
  stage_change: 'Mudança de Etapa',
  field_update: 'Campo Alterado',
  note_added: 'Nota Adicionada',
  creation: 'Criação',
  automation: 'Automação',
  note: 'Nota',
  call: 'Ligação',
  message_sent: 'Mensagem Enviada',
  document_upload: 'Documento Anexado',
  document_delete: 'Documento Removido',
  assignment: 'Atribuição',
  loss: 'Perda',
};

const TYPE_COLORS: Record<string, string> = {
  stage_change: '#60A5FA',
  field_update: '#a78bfa',
  note_added: '#4ade80',
  creation: '#22d3ee',
  automation: '#fbbf24',
  document_upload: '#4ade80',
  document_delete: '#f87171',
  loss: '#f87171',
};

export default function DealTabAtividades({ activities, users }: Props) {
  if (!activities || activities.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
        Nenhuma atividade registrada.
      </div>
    );
  }

  const sorted = [...activities].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {sorted.map((act, i) => {
        const color = TYPE_COLORS[act.type] || 'var(--text-muted)';
        const icon = TYPE_ICONS[act.type] || '·';
        const typeLabel = TYPE_LABELS[act.type] || act.type;
        const userName = act.user_id && users?.[act.user_id] ? users[act.user_id] : null;
        const date = new Date(act.created_at);

        return (
          <div key={act.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: i < sorted.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
            {/* Timeline dot */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 24 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: `${color}18`, border: `1px solid ${color}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color,
              }}>
                {icon}
              </div>
              {i < sorted.length - 1 && (
                <div style={{ width: 1, flex: 1, background: 'var(--border-subtle)', marginTop: 4 }} />
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {typeLabel}
                </span>
                {userName && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    por {userName}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {act.description}
              </div>

              {/* Show old->new for field_update */}
              {act.type === 'field_update' && act.metadata?.changes && (
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {(act.metadata.changes as Array<{ label: string; from: any; to: any }>).map((c, ci) => (
                    <div key={ci} style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontWeight: 500 }}>{c.label}:</span>
                      <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{String(c.from ?? '—')}</span>
                      <span>→</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{String(c.to ?? '—')}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                {date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
