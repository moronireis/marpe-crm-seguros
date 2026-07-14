import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import DealTabInfo from './DealTabInfo';
import DealTabConversas from './DealTabConversas';
import DealTabAtividades from './DealTabAtividades';
import DealTabAnotacoes from './DealTabAnotacoes';
import DealTabDocumentos from './DealTabDocumentos';
import DealTabPerfil from './DealTabPerfil';

interface Stage { id: string; name: string; color: string; sort_order: number; is_terminal?: boolean; terminal_type?: string | null; }
interface Contact { id: string; name: string; phone: string | null; email: string | null; city: string | null; tags: string[]; corp_id: string | null; }
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
  responsible_id: string | null;
  marpe_profiles: { id: string; full_name: string } | null;
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
  /** Aba aberta ao montar/trocar de negócio (ícones de acesso rápido do card) */
  initialTab?: TabKey;
  /** Usuário logado — responsável padrão do negócio (checkpoint 14/07) */
  currentUser?: { id: string; full_name: string };
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

export default function DealPanel({ dealId, stages, onClose, onUpdated, initialTab, currentUser }: Props) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab || 'info');

  // Ao trocar de negócio (ou de aba pedida pelos ícones do card), abre na aba certa
  useEffect(() => {
    setActiveTab(initialTab || 'info');
  }, [dealId, initialTab]);

  // Loss reason modal state
  const [pendingStageId, setPendingStageId] = useState<string | null>(null);
  const [lossReason, setLossReason] = useState('Sem retorno do cliente');
  const [lossReasonOther, setLossReasonOther] = useState('');

  // Users map for activity tab
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  // Indicador deslizante das abas
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});
  const [ink, setInk] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useLayoutEffect(() => {
    const el = tabRefs.current[activeTab];
    if (el) setInk({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeTab, loading, deal]);

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

  const panelClass = isMobile ? 'glass-modal panel-in' : 'glass-nav panel-in';
  const styles: Record<string, React.CSSProperties> = {
    panel: isMobile
      ? { position: 'fixed', inset: 0, zIndex: 150, display: 'flex', flexDirection: 'column', overflowY: 'auto', border: 'none', borderRadius: 0 }
      : { width: 420, margin: '12px 16px 16px 4px', borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', flexShrink: 0, height: 'calc(100% - 28px)', boxShadow: 'var(--shadow-panel), inset 0 1px 0 var(--highlight)', overflow: 'hidden' },
    header: { padding: '16px 18px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 10 },
    closeBtn: { width: 30, height: 30, borderRadius: 9, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s var(--ease-out)', flexShrink: 0 },
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '9px 10px', fontSize: 11, fontWeight: active ? 700 : 500,
    cursor: 'pointer', color: active ? 'var(--accent-light)' : 'var(--text-muted)',
    background: 'none', border: 'none',
    fontFamily: 'inherit', transition: 'color 0.2s var(--ease-out)',
    whiteSpace: 'nowrap',
  });

  if (loading) return (
    <div className={panelClass} style={styles.panel}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="skeleton" style={{ height: 18, width: '60%' }} />
        <div className="skeleton" style={{ height: 12, width: '40%' }} />
        <div className="skeleton" style={{ height: 34, width: '100%', marginTop: 8 }} />
        <div className="skeleton" style={{ height: 12, width: '85%', marginTop: 10 }} />
        <div className="skeleton" style={{ height: 12, width: '70%' }} />
        <div className="skeleton" style={{ height: 12, width: '78%' }} />
      </div>
    </div>
  );

  if (!deal) return (
    <div className={panelClass} style={styles.panel}>
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Negocio nao encontrado</div>
    </div>
  );

  const contact = deal.marpe_contacts;
  const isConversaTab = activeTab === 'conversas';

  return (
    <div className={panelClass} style={styles.panel}>
      {/* Loss Reason Modal — portal: o painel tem backdrop-filter + overflow hidden,
          que criariam containing block / clipariam um position:fixed interno */}
      {pendingStageId && createPortal(
        <div className="overlay-glass">
          <div className="glass-modal modal-pop" style={{ borderRadius: 'var(--radius-xl)', padding: 24, width: 360, maxWidth: 'calc(100vw - 32px)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.01em' }}>Motivo da perda</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Selecione o motivo para mover este negocio para Perdido.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {LOSS_REASONS.map(reason => (
                <label key={reason} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 10, background: lossReason === reason ? 'var(--accent-dim)' : 'var(--field-bg)', border: `1px solid ${lossReason === reason ? 'rgba(59,130,246,0.3)' : 'var(--hairline)'}`, transition: 'all 0.18s var(--ease-out)' }}>
                  <input type="radio" name="loss_reason" value={reason} checked={lossReason === reason} onChange={() => setLossReason(reason)} style={{ accentColor: 'var(--accent)', margin: 0 }} />
                  <span style={{ fontSize: 13 }}>{reason}</span>
                </label>
              ))}
            </div>
            {lossReason === 'Outro' && (
              <input value={lossReasonOther} onChange={e => setLossReasonOther(e.target.value)} placeholder="Descreva o motivo..." style={{ width: '100%', padding: '8px 11px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box' }} />
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingStageId(null)} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s var(--ease-out)' }}>Cancelar</button>
              <button onClick={confirmLoss} disabled={saving} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'linear-gradient(180deg, #f0524f, #d63b38)', boxShadow: '0 3px 14px var(--red-dim), inset 0 1px 0 rgba(255,255,255,0.2)', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, transition: 'all 0.2s var(--ease-out)' }}>{saving ? 'Salvando...' : 'Confirmar'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Header */}
      <div style={styles.header}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {contact?.id ? (
            <a href={`/contato/${contact.id}`} style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none', display: 'block', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.2s var(--ease-out)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-light)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            >{contact.name}</a>
          ) : (
            <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{deal.title || '—'}</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {deal.marpe_funnels?.name} · {deal.marpe_funnel_stages?.name}
          </div>
        </div>
        {/* Ícone de conversa removido (checkpoint 10/07, item 3 — sugestão do Tiago):
            a interação fica pela aba Conversas logo abaixo */}
        <button style={styles.closeBtn} onClick={onClose} aria-label="Fechar painel">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Stage selector */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, fontWeight: 600 }}>Etapa</div>
        <select value={deal.stage_id} onChange={e => handleStageChange(e.target.value)} disabled={saving}
          style={{ width: '100%', padding: '8px 11px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', transition: 'border-color 0.2s var(--ease-out)' }}
        >
          {stages.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
        {saving && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Salvando...</div>}
      </div>

      {/* Tabs com indicador deslizante */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--hairline)', flexShrink: 0, overflowX: 'auto', position: 'relative' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            ref={el => { tabRefs.current[tab.key] = el; }}
            style={tabStyle(activeTab === tab.key)}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.key === 'atividades' && deal.marpe_deal_activities?.length ? ` (${deal.marpe_deal_activities.length})` : ''}
          </button>
        ))}
        <span aria-hidden="true" style={{
          position: 'absolute', bottom: 0, height: 2,
          left: ink.left, width: ink.width,
          background: 'linear-gradient(90deg, var(--accent), var(--accent-light))',
          borderRadius: '2px 2px 0 0',
          boxShadow: '0 0 10px var(--accent-glow)',
          transition: 'left 0.32s var(--ease-glass), width 0.32s var(--ease-glass)',
        }} />
      </div>

      {/* Tab content (crossfade na troca de aba) */}
      <div key={activeTab} className="fade-in" style={{ flex: 1, overflowY: isConversaTab ? 'hidden' : 'auto', padding: isConversaTab ? 0 : '12px 16px', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'info' && (
          <DealTabInfo deal={deal} onSave={handleInfoSave} currentUser={currentUser} />
        )}

        {activeTab === 'conversas' && (
          <DealTabConversas
            dealId={dealId}
            contactPhone={contact?.phone || null}
            contactId={contact?.id || null}
            onSendMessage={handleSendMessage}
            varContext={{ contact: contact || undefined, deal }}
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
          <DealTabDocumentos
            dealId={dealId}
            dealCorpId={deal.corp_id}
            contactCorpId={deal.marpe_contacts?.corp_id ?? null}
          />
        )}

        {activeTab === 'perfil' && (
          <DealTabPerfil corpId={deal.corp_id} dealId={dealId} />
        )}
      </div>
    </div>
  );
}
