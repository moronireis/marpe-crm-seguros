import { useState, useEffect } from 'react';
import DealTabInfo from './DealTabInfo';
import DealTabConversas from './DealTabConversas';
import DealTabAtividades from './DealTabAtividades';
import DealTabAnotacoes from './DealTabAnotacoes';
import DealTabDocumentos from './DealTabDocumentos';
import DealTabPerfil from './DealTabPerfil';

interface Stage { id: string; name: string; color: string; sort_order: number; is_terminal?: boolean; terminal_type?: string | null; }
interface Contact { id: string; name: string; phone: string | null; email: string | null; city: string | null; tags: string[]; }
interface Activity { id: string; type: string; description: string; created_at: string; metadata: Record<string, any> | null; user_id: string | null; }
interface Deal {
  id: string; title: string; ramo: string | null; seguradora: string | null; apolice: string | null;
  premio: number | null; comissao_pct: number | null; comissao_valor: number | null;
  vigencia_inicio: string | null; vigencia_fim: string | null; veiculo: string | null; placa: string | null;
  deal_type: string | null; next_action: string | null; next_action_date: string | null;
  stage_id: string; funnel_id: string;
  status_custom: string | null; status_color: string | null;
  corp_id: string | null;
  // New fields
  campanha: string | null; ja_possui_produto: boolean; seguradora_atual: string | null;
  vigencia_atual_fim: string | null; corretora_atual: string | null;
  base_calculo_repasse: number | null; pct_repasse: number | null; valor_repasse: number | null;
  agente: string | null; observacoes_proposta: string | null; produtor: string | null;
  detalhes_corp: Record<string, any> | null; created_by: string | null;
  marpe_contacts: Contact | null;
  marpe_funnel_stages: { id: string; name: string; color: string } | null;
  marpe_funnels: { id: string; name: string } | null;
  marpe_deal_activities: Activity[];
}

interface Props {
  dealId: string;
  stages: Stage[];
  onClose: () => void;
  onUpdated: () => void;
}

const LOSS_REASONS = [
  'Risco sem aceitacao',
  'Sem retorno do cliente',
  'Cliente sem interesse',
  'Cliente sem condicoes financeiras',
  'Cliente sem perfil',
  'Renovou com outra corretora',
  'Vendeu o bem segurado',
  'Outro',
];

type TabKey = 'info' | 'conversas' | 'atividades' | 'anotacoes' | 'documentos' | 'perfil';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'conversas', label: 'Conversas' },
  { key: 'atividades', label: 'Atividades' },
  { key: 'anotacoes', label: 'Notas' },
  { key: 'documentos', label: 'Docs' },
  { key: 'perfil', label: 'Corp' },
];

export default function DealPanel({ dealId, stages, onClose, onUpdated }: Props) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('info');

  // Loss reason modal state
  const [pendingStageId, setPendingStageId] = useState<string | null>(null);
  const [lossReason, setLossReason] = useState('Sem retorno do cliente');
  const [lossReasonOther, setLossReasonOther] = useState('');

  // Users map for activity tab
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  function load() {
    setLoading(true);
    fetch(`/api/deals/${dealId}`)
      .then(r => r.json())
      .then(d => {
        setDeal(d.deal);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  // Load users for activity attribution
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(d => {
        const map: Record<string, string> = {};
        (d.users || []).forEach((u: { id: string; full_name: string }) => { map[u.id] = u.full_name; });
        setUsersMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [dealId]);

  function handleStageChange(stageId: string) {
    if (!deal || stageId === deal.stage_id) return;
    const targetStage = stages.find(s => s.id === stageId);
    if (targetStage?.is_terminal && targetStage?.terminal_type === 'lost') {
      setPendingStageId(stageId);
      setLossReason('Sem retorno do cliente');
      setLossReasonOther('');
    } else {
      changeStage(stageId, null);
    }
  }

  async function changeStage(stageId: string, reason: string | null) {
    setSaving(true);
    const body: Record<string, unknown> = { stage_id: stageId };
    if (reason) body.loss_reason = reason;
    await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    load();
    onUpdated();
  }

  function confirmLoss() {
    if (!pendingStageId) return;
    const reason = lossReason === 'Outro' ? (lossReasonOther.trim() || 'Outro') : lossReason;
    changeStage(pendingStageId, reason);
    setPendingStageId(null);
  }

  async function handleInfoSave(updates: Record<string, unknown>) {
    await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    load();
    onUpdated();
  }

  async function handleSendMessage(text: string) {
    if (!deal?.marpe_contacts?.phone) return;
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: deal.marpe_contacts.id,
        deal_id: dealId,
        phone: deal.marpe_contacts.phone,
        text,
      }),
    });
  }

  const styles: Record<string, React.CSSProperties> = {
    panel: isMobile
      ? { position: 'fixed', inset: 0, zIndex: 150, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }
      : { width: 420, borderLeft: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100%', boxShadow: 'var(--shadow-lg)' },
    header: { padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-card)' },
    closeBtn: { width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, transition: 'background 0.15s, color 0.15s' },
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 10px', fontSize: 11, fontWeight: active ? 600 : 500,
    cursor: 'pointer', color: active ? 'var(--accent-light)' : 'var(--text-muted)',
    background: 'none', border: 'none',
    borderBottom: `2px solid ${active ? 'var(--accent-light)' : 'transparent'}`,
    fontFamily: 'inherit', transition: 'color 0.15s, border-color 0.15s',
    whiteSpace: 'nowrap',
  });

  if (loading) return (
    <div style={styles.panel}>
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
    </div>
  );

  if (!deal) return (
    <div style={styles.panel}>
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Negocio nao encontrado</div>
    </div>
  );

  const contact = deal.marpe_contacts;
  const isConversaTab = activeTab === 'conversas';

  return (
    <div style={styles.panel}>
      {/* Loss Reason Modal */}
      {pendingStageId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 360, maxWidth: 'calc(100vw - 32px)' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Motivo da perda</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Selecione o motivo para mover este negocio para Perdido.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {LOSS_REASONS.map(reason => (
                <label key={reason} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 8, background: lossReason === reason ? 'var(--accent-dim)' : 'var(--bg-card)', border: `1px solid ${lossReason === reason ? 'rgba(59,130,246,0.3)' : 'var(--border)'}` }}>
                  <input type="radio" name="loss_reason" value={reason} checked={lossReason === reason} onChange={() => setLossReason(reason)} style={{ accentColor: 'var(--accent)', margin: 0 }} />
                  <span style={{ fontSize: 13 }}>{reason}</span>
                </label>
              ))}
            </div>
            {lossReason === 'Outro' && (
              <input value={lossReasonOther} onChange={e => setLossReasonOther(e.target.value)} placeholder="Descreva o motivo..." style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box' }} />
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingStageId(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={confirmLoss} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>{saving ? 'Salvando...' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div style={{ flex: 1 }}>
          {contact?.id ? (
            <a href={`/contato/${contact.id}`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none', display: 'block' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-light)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            >{contact.name}</a>
          ) : (
            <div style={{ fontSize: 14, fontWeight: 600 }}>{deal.title || '—'}</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {deal.marpe_funnels?.name} · {deal.marpe_funnel_stages?.name}
          </div>
        </div>
        {contact?.id && contact?.phone && (
          <a href={`/inbox?contact=${contact.id}`} title="Abrir conversa no inbox"
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', marginRight: 4 }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent-light)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(59,130,246,0.4)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </a>
        )}
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Stage selector */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Etapa</div>
        <select value={deal.stage_id} onChange={e => handleStageChange(e.target.value)} disabled={saving}
          style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
        >
          {stages.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
        {saving && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Salvando...</div>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button key={tab.key} style={tabStyle(activeTab === tab.key)} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
            {tab.key === 'atividades' && deal.marpe_deal_activities?.length ? ` (${deal.marpe_deal_activities.length})` : ''}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: isConversaTab ? 'hidden' : 'auto', padding: isConversaTab ? 0 : '12px 16px', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'info' && (
          <DealTabInfo deal={deal} onSave={handleInfoSave} />
        )}

        {activeTab === 'conversas' && (
          <DealTabConversas
            dealId={dealId}
            contactPhone={contact?.phone || null}
            contactId={contact?.id || null}
            onSendMessage={handleSendMessage}
          />
        )}

        {activeTab === 'atividades' && (
          <DealTabAtividades
            activities={deal.marpe_deal_activities || []}
            users={usersMap}
          />
        )}

        {activeTab === 'anotacoes' && (
          <DealTabAnotacoes dealId={dealId} />
        )}

        {activeTab === 'documentos' && (
          <DealTabDocumentos dealId={dealId} />
        )}

        {activeTab === 'perfil' && (
          <DealTabPerfil corpId={deal.corp_id} dealId={dealId} />
        )}
      </div>
    </div>
  );
}
