import { useState, useEffect } from 'react';

interface Automation {
  id: string; name: string; description: string | null;
  is_active: boolean; trigger_type: string; trigger_config: any;
  action_type: string; action_config: any;
  execution_count: number; last_executed_at: string | null; created_at: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  deal_stage_change: 'Mudança de etapa',
  new_contact: 'Novo contato',
  installment_due: 'Vencimento de parcela',
};

const ACTION_LABELS: Record<string, string> = {
  send_whatsapp: 'Enviar WhatsApp',
  send_survey: 'Enviar pesquisa de satisfação',
  create_activity: 'Criar atividade',
};

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AutomationsView() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', trigger_type: 'deal_stage_change',
    action_type: 'send_whatsapp', message: '', stage_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function load() {
    fetch('/api/automations')
      .then(r => r.json())
      .then(d => { setAutomations(d.automations || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function toggle(a: Automation) {
    await fetch(`/api/automations/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !a.is_active }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Desativar esta automação?')) return;
    await fetch(`/api/automations/${id}`, { method: 'DELETE' });
    load();
  }

  async function save() {
    const messageRequired = form.action_type !== 'send_survey';
    if (!form.name || (messageRequired && !form.message)) { setError('Nome e mensagem são obrigatórios'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        description: form.description || null,
        trigger_type: form.trigger_type,
        trigger_config: form.stage_id ? { stage_id: form.stage_id } : {},
        action_type: form.action_type,
        action_config: { message: form.message },
      }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setError(d.error || 'Erro ao salvar'); return; }
    setShowForm(false);
    setForm({ name: '', description: '', trigger_type: 'deal_stage_change', action_type: 'send_whatsapp', message: '', stage_id: '' });
    load();
  }

  const s: Record<string, React.CSSProperties> = {
    wrap: { display: 'flex', flexDirection: 'column', height: '100%' },
    header: { height: 56, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16, flexShrink: 0 },
    body: { flex: 1, overflowY: 'auto', padding: 24 },
    card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 14, boxShadow: 'var(--shadow-xs)', transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s' },
    badge: (active: boolean) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 100, background: active ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)', color: active ? 'var(--green)' : 'var(--text-muted)' }),
    pill: { fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'rgba(59,130,246,0.1)', color: 'var(--accent-light)', fontWeight: 500 },
    input: { width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 10 },
    select: { width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 10, cursor: 'pointer' },
    btn: (primary?: boolean) => ({ padding: '9px 18px', borderRadius: 8, border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--accent)' : 'transparent', color: primary ? '#fff' : 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }),
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Automações</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{automations.length} regra{automations.length !== 1 ? 's' : ''}</span>
        <button onClick={() => setShowForm(true)} style={{ ...s.btn(true), marginLeft: 'auto' }}>+ Nova automação</button>
      </div>

      <div style={s.body}>
        {showForm && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Nova automação</div>
            <input style={s.input} placeholder="Nome da automação" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <input style={s.input} placeholder="Descrição (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <select style={s.select} value={form.trigger_type} onChange={e => setForm(f => ({ ...f, trigger_type: e.target.value }))}>
              {Object.entries(TRIGGER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select style={s.select} value={form.action_type} onChange={e => setForm(f => ({ ...f, action_type: e.target.value }))}>
              {Object.entries(ACTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <textarea
              style={{ ...s.input, height: 80, resize: 'vertical' }}
              placeholder={
                form.action_type === 'send_survey'
                  ? '{{primeiro_nome}}, seu atendimento foi finalizado! De 1 a 5, como avalia nosso atendimento? Responda com o número.'
                  : 'Mensagem WhatsApp (use {{nome}} para o nome do contato)'
              }
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            />
            {error && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} disabled={saving} style={s.btn(true)}>{saving ? 'Salvando...' : 'Salvar'}</button>
              <button onClick={() => setShowForm(false)} style={s.btn()}>Cancelar</button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
        ) : automations.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma automação criada. Crie a primeira clicando em "+ Nova automação".</div>
        ) : automations.map(a => (
          <div key={a.id} style={s.card}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</span>
                <span style={s.badge(a.is_active)}>{a.is_active ? '● Ativa' : '○ Inativa'}</span>
              </div>
              {a.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{a.description}</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={s.pill}>Gatilho: {TRIGGER_LABELS[a.trigger_type] || a.trigger_type}</span>
                <span style={s.pill}>Ação: {ACTION_LABELS[a.action_type] || a.action_type}</span>
                {a.action_config?.message && (
                  <span style={{ ...s.pill, background: 'rgba(139,92,246,0.1)', color: '#a78bfa', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    "{a.action_config.message.slice(0, 40)}{a.action_config.message.length > 40 ? '…' : ''}"
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                {a.execution_count || 0} execuções · Última: {formatTime(a.last_executed_at)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={() => toggle(a)} style={{ ...s.btn(), fontSize: 11, padding: '5px 10px' }}>
                {a.is_active ? 'Pausar' : 'Ativar'}
              </button>
              <button onClick={() => remove(a.id)} style={{ ...s.btn(), fontSize: 11, padding: '5px 10px', color: '#f87171' }}>
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
