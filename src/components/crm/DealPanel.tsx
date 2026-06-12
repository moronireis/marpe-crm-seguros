import { useState, useEffect, useRef } from 'react';

interface Stage { id: string; name: string; color: string; sort_order: number; is_terminal?: boolean; terminal_type?: string | null; }
interface Contact { id: string; name: string; phone: string | null; email: string | null; city: string | null; tags: string[]; }
interface Activity { id: string; type: string; description: string; created_at: string; }
interface Deal {
  id: string; title: string; ramo: string | null; seguradora: string | null; apolice: string | null;
  premio: number | null; comissao_pct: number | null; comissao_valor: number | null;
  vigencia_inicio: string | null; vigencia_fim: string | null; veiculo: string | null; placa: string | null;
  deal_type: string | null; next_action: string | null; next_action_date: string | null;
  stage_id: string; funnel_id: string;
  status_custom: string | null; status_color: string | null;
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
  'Risco sem aceitação',
  'Sem retorno do cliente',
  'Cliente sem interesse',
  'Cliente sem condições financeiras',
  'Cliente sem perfil',
  'Renovou com outra corretora',
  'Vendeu o bem segurado',
  'Outro',
];

const STATUS_PRESET_COLORS = ['#60A5FA', '#4ade80', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee'];

function fmt(v: number | null) {
  if (!v) return '—';
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

const ACTIVITY_ICONS: Record<string, string> = {
  stage_change: '↗',
  automation: '⚡',
  note: '📝',
  call: '📞',
  default: '·',
};

export default function DealPanel({ dealId, stages, onClose, onUpdated }: Props) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'activity' | 'chat'>('info');
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Deal chat state
  const [chatMsgs, setChatMsgs] = useState<Array<{ id: string; direction: string; body: string | null; content_type: string; created_at: string }>>([]);
  const [chatText, setChatText] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  function loadChat() {
    if (!dealId) return;
    fetch(`/api/messages?deal_id=${dealId}`)
      .then(r => r.json())
      .then(d => { setChatMsgs(d.messages || []); setTimeout(() => chatEndRef.current?.scrollIntoView(), 50); })
      .catch(() => {});
  }

  useEffect(() => { if (activeTab === 'chat') loadChat(); }, [activeTab, dealId]);

  // Poll chat messages when chat tab is active
  useEffect(() => {
    if (activeTab !== 'chat') return;
    const iv = setInterval(loadChat, 5000);
    return () => clearInterval(iv);
  }, [activeTab, dealId]);

  async function sendChatMsg() {
    if (!chatText.trim() || !deal?.marpe_contacts?.phone || sendingChat) return;
    setSendingChat(true);
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: deal.marpe_contacts.id,
        deal_id: dealId,
        phone: deal.marpe_contacts.phone,
        text: chatText,
      }),
    });
    setChatText('');
    setSendingChat(false);
    loadChat();
  }

  const chatInputRef = useRef<HTMLInputElement>(null);

  // Loss reason modal state
  const [pendingStageId, setPendingStageId] = useState<string | null>(null);
  const [lossReason, setLossReason] = useState('Sem retorno do cliente');
  const [lossReasonOther, setLossReasonOther] = useState('');

  // Status custom state
  const [statusCustom, setStatusCustom] = useState('');
  const [statusColor, setStatusColor] = useState(STATUS_PRESET_COLORS[0]);
  const [savingStatus, setSavingStatus] = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/deals/${dealId}`)
      .then(r => r.json())
      .then(d => {
        setDeal(d.deal);
        setStatusCustom(d.deal?.status_custom || '');
        setStatusColor(d.deal?.status_color || STATUS_PRESET_COLORS[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, [dealId]);

  function handleStageChange(stageId: string) {
    if (!deal || stageId === deal.stage_id) return;
    const targetStage = stages.find(s => s.id === stageId);
    if (targetStage?.is_terminal && targetStage?.terminal_type === 'lost') {
      // Show loss reason modal before saving
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

  function cancelLoss() {
    setPendingStageId(null);
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ next_action: newNote }),
    });
    setNewNote('');
    setSavingNote(false);
    load();
  }

  async function saveStatus() {
    setSavingStatus(true);
    await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_custom: statusCustom.trim() || null, status_color: statusCustom.trim() ? statusColor : null }),
    });
    setSavingStatus(false);
    load();
    onUpdated();
  }

  const s: Record<string, React.CSSProperties> = {
    panel: isMobile
      ? { position: 'fixed', inset: 0, zIndex: 150, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }
      : { width: 360, borderLeft: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100%' },
    header: { padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 },
    row: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
    label: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
    value: { fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' as const, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
    tab: (active: boolean) => ({ padding: '8px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', color: active ? 'var(--accent-light)' : 'var(--text-muted)', background: 'none', border: 'none', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, fontFamily: 'inherit' }),
    closeBtn: { width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 },
  };

  if (loading) return (
    <div style={s.panel}>
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
    </div>
  );

  if (!deal) return (
    <div style={s.panel}>
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Negócio não encontrado</div>
    </div>
  );

  const contact = deal.marpe_contacts;

  return (
    <div style={s.panel}>
      {/* Loss Reason Modal */}
      {pendingStageId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 360, maxWidth: 'calc(100vw - 32px)' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Motivo da perda</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Selecione o motivo para mover este negócio para Perdido.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {LOSS_REASONS.map(reason => (
                <label key={reason} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 8, background: lossReason === reason ? 'var(--accent-dim)' : 'var(--bg-card)', border: `1px solid ${lossReason === reason ? 'rgba(59,130,246,0.3)' : 'var(--border)'}` }}>
                  <input
                    type="radio"
                    name="loss_reason"
                    value={reason}
                    checked={lossReason === reason}
                    onChange={() => setLossReason(reason)}
                    style={{ accentColor: 'var(--accent)', margin: 0 }}
                  />
                  <span style={{ fontSize: 13 }}>{reason}</span>
                </label>
              ))}
            </div>
            {lossReason === 'Outro' && (
              <input
                value={lossReasonOther}
                onChange={e => setLossReasonOther(e.target.value)}
                placeholder="Descreva o motivo..."
                style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box' }}
              />
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={cancelLoss} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button onClick={confirmLoss} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                {saving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={s.header}>
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
        <button style={s.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Stage selector */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Etapa</div>
        <select
          value={deal.stage_id}
          onChange={e => handleStageChange(e.target.value)}
          disabled={saving}
          style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
        >
          {stages.map(st => (
            <option key={st.id} value={st.id}>{st.name}</option>
          ))}
        </select>
        {saving && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Salvando...</div>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button style={s.tab(activeTab === 'info')} onClick={() => setActiveTab('info')}>Info</button>
        <button style={s.tab(activeTab === 'chat')} onClick={() => setActiveTab('chat')}>
          Conversa
        </button>
        <button style={s.tab(activeTab === 'activity')} onClick={() => setActiveTab('activity')}>
          Atividades ({deal.marpe_deal_activities?.length || 0})
        </button>
      </div>

      <div style={{ flex: 1, overflowY: activeTab === 'chat' ? 'hidden' : 'auto', padding: activeTab === 'chat' ? 0 : '12px 16px', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'chat' ? (
          /* ── Deal Chat ─────────────────────────────────────── */
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chatMsgs.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
                  Nenhuma mensagem neste negócio ainda.
                  <br /><span style={{ fontSize: 11 }}>Envie a primeira mensagem abaixo.</span>
                </div>
              )}
              {chatMsgs.map(m => (
                <div key={m.id} style={{ alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                  <div style={{
                    padding: '8px 12px', borderRadius: 10,
                    background: m.direction === 'outbound' ? 'var(--accent-dim)' : 'var(--bg-card)',
                    border: `1px solid ${m.direction === 'outbound' ? 'rgba(59,130,246,0.2)' : 'var(--border)'}`,
                    borderBottomRightRadius: m.direction === 'outbound' ? 4 : 10,
                    borderBottomLeftRadius: m.direction === 'inbound' ? 4 : 10,
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body || `[${m.content_type}]`}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                      {new Date(m.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            {deal.marpe_contacts?.phone ? (
              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0 }}>
                <input
                  ref={chatInputRef}
                  value={chatText}
                  onChange={e => setChatText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMsg(); } }}
                  placeholder="Mensagem sobre este negócio..."
                  style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
                />
                <button
                  onClick={sendChatMsg}
                  disabled={sendingChat || !chatText.trim()}
                  style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: sendingChat ? 0.6 : 1 }}
                >
                  Enviar
                </button>
              </div>
            ) : (
              <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                Contato sem telefone registrado
              </div>
            )}
          </>
        ) : activeTab === 'info' ? (
          <>
            {contact && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contato</span>
                  <a href={`/contato/${contact.id}`} style={{ fontSize: 11, color: 'var(--accent-light)', textDecoration: 'none', fontWeight: 500 }}>Ver perfil →</a>
                </div>
                {[
                  ['Telefone', contact.phone],
                  ['E-mail', contact.email],
                  ['Cidade', contact.city],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k as string} style={s.row}>
                    <span style={s.label}>{k}</span>
                    <span style={s.value}>{v}</span>
                  </div>
                ))}
                <div style={{ height: 12 }} />
              </>
            )}

            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Seguro</div>
            {[
              ['Ramo', deal.ramo],
              ['Seguradora', deal.seguradora],
              ['Apólice', deal.apolice],
              ['Prêmio', fmt(deal.premio)],
              ['Comissão', deal.comissao_pct ? `${deal.comissao_pct}%` : null],
              ['Comissão R$', fmt(deal.comissao_valor)],
              ['Vigência início', fmtDate(deal.vigencia_inicio)],
              ['Vigência fim', fmtDate(deal.vigencia_fim)],
              ['Veículo', deal.veiculo],
              ['Placa', deal.placa],
            ].filter(([, v]) => v && v !== '—').map(([k, v]) => (
              <div key={k as string} style={s.row}>
                <span style={s.label}>{k}</span>
                <span style={s.value}>{v}</span>
              </div>
            ))}

            {/* Status custom section */}
            <div style={{ height: 12 }} />
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Status</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input
                value={statusCustom}
                onChange={e => setStatusCustom(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveStatus(); }}
                placeholder="Ex: Aguardando documentos"
                style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
              />
              <button
                onClick={saveStatus}
                disabled={savingStatus}
                style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Ok
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cor:</span>
              {STATUS_PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setStatusColor(c)}
                  title={c}
                  style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: `2px solid ${statusColor === c ? '#fff' : 'transparent'}`, cursor: 'pointer', padding: 0, outline: 'none', flexShrink: 0 }}
                />
              ))}
            </div>

            {deal.next_action && (
              <>
                <div style={{ height: 12 }} />
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Próxima ação</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: 8, padding: 10 }}>{deal.next_action}</div>
              </>
            )}

            <div style={{ height: 12 }} />
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Adicionar nota</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addNote(); }}
                placeholder="Próxima ação ou nota..."
                style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
              />
              <button
                onClick={addNote}
                disabled={savingNote || !newNote.trim()}
                style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Ok
              </button>
            </div>
          </>
        ) : (
          <>
            {(deal.marpe_deal_activities || []).length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma atividade registrada.</div>
            ) : [...(deal.marpe_deal_activities || [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(act => (
              <div key={act.id} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, marginTop: 1 }}>{ACTIVITY_ICONS[act.type] || ACTIVITY_ICONS.default}</span>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{act.description}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(act.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
