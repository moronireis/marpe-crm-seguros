import { useState, useEffect, useRef } from 'react';

interface User { id: string; full_name: string; email: string; phone: string | null; role: string; is_active: boolean; }
interface WaStatus { connected: boolean; status: string; phone: string | null; name: string | null; error?: string; }
interface SyncLog { id: string; sync_type: string; status: string; records_created: number; records_updated: number; records_skipped: number; error_message: string | null; started_at: string; completed_at: string | null; }

interface FunnelStage { id: string; funnel_id: string; name: string; color: string; sort_order: number; is_terminal: boolean; terminal_type: string | null; }
interface Funnel { id: string; name: string; description: string | null; sort_order: number; is_active: boolean; stages: FunnelStage[]; }

const COLOR_PRESETS = [
  '#3B82F6', '#22C55E', '#EAB308', '#EF4444',
  '#8B5CF6', '#06B6D4', '#F97316', '#6B7280',
];

function FunnelsTab() {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // New funnel form
  const [showNewFunnel, setShowNewFunnel] = useState(false);
  const [newFunnelName, setNewFunnelName] = useState('');
  const [newFunnelDesc, setNewFunnelDesc] = useState('');
  const [savingFunnel, setSavingFunnel] = useState(false);

  // New stage form (keyed by funnel_id)
  const [newStage, setNewStage] = useState<Record<string, { name: string; color: string; is_terminal: boolean; terminal_type: string }>>({});
  const [savingStage, setSavingStage] = useState<string | null>(null);

  // Inline edit stage
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [editStageData, setEditStageData] = useState<{ name: string; color: string }>({ name: '', color: '' });

  // Delete confirm
  const [deletingStage, setDeletingStage] = useState<string | null>(null);
  const [stageError, setStageError] = useState<Record<string, string>>({});

  function loadFunnels() {
    setLoading(true);
    fetch('/api/funnels?include_inactive=1')
      .then(r => r.json())
      .then(d => { setFunnels(d.funnels || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadFunnels(); }, []);

  async function createFunnel() {
    if (!newFunnelName.trim()) return;
    setSavingFunnel(true);
    const res = await fetch('/api/funnels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFunnelName.trim(), description: newFunnelDesc.trim() || null }),
    });
    const d = await res.json();
    setSavingFunnel(false);
    if (res.ok) {
      const created = { ...d.funnel, stages: [] };
      setFunnels(prev => [...prev, created]);
      setNewFunnelName('');
      setNewFunnelDesc('');
      setShowNewFunnel(false);
      setExpandedId(d.funnel.id);
    }
  }

  async function toggleFunnel(funnel: Funnel) {
    const res = await fetch(`/api/funnels/${funnel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !funnel.is_active }),
    });
    if (res.ok) {
      setFunnels(prev => prev.map(f => f.id === funnel.id ? { ...f, is_active: !f.is_active } : f));
    }
  }

  async function addStage(funnelId: string) {
    const s = newStage[funnelId];
    if (!s?.name?.trim()) return;
    setSavingStage(funnelId);
    const stages = funnels.find(f => f.id === funnelId)?.stages || [];
    const res = await fetch('/api/funnel-stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funnel_id: funnelId,
        name: s.name.trim(),
        color: s.color || '#3B82F6',
        sort_order: stages.length + 1,
        is_terminal: s.is_terminal,
        terminal_type: s.is_terminal ? (s.terminal_type || null) : null,
      }),
    });
    const d = await res.json();
    setSavingStage(null);
    if (res.ok) {
      setFunnels(prev => prev.map(f =>
        f.id === funnelId ? { ...f, stages: [...f.stages, d.stage] } : f
      ));
      setNewStage(prev => ({ ...prev, [funnelId]: { name: '', color: '#3B82F6', is_terminal: false, terminal_type: 'won' } }));
    }
  }

  async function saveStageEdit(stageId: string, funnelId: string) {
    const res = await fetch(`/api/funnel-stages/${stageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editStageData.name, color: editStageData.color }),
    });
    if (res.ok) {
      setFunnels(prev => prev.map(f =>
        f.id === funnelId
          ? { ...f, stages: f.stages.map(s => s.id === stageId ? { ...s, ...editStageData } : s) }
          : f
      ));
      setEditingStage(null);
    }
  }

  async function moveStage(funnelId: string, stageId: string, direction: 'up' | 'down') {
    const funnel = funnels.find(f => f.id === funnelId);
    if (!funnel) return;
    const sorted = [...funnel.stages].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(s => s.id === stageId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[swapIdx];

    // Swap sort_orders
    await Promise.all([
      fetch(`/api/funnel-stages/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: b.sort_order }) }),
      fetch(`/api/funnel-stages/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: a.sort_order }) }),
    ]);

    setFunnels(prev => prev.map(f =>
      f.id === funnelId
        ? { ...f, stages: f.stages.map(s => {
            if (s.id === a.id) return { ...s, sort_order: b.sort_order };
            if (s.id === b.id) return { ...s, sort_order: a.sort_order };
            return s;
          }) }
        : f
    ));
  }

  async function deleteStage(stageId: string, funnelId: string) {
    setDeletingStage(null);
    const res = await fetch(`/api/funnel-stages/${stageId}`, { method: 'DELETE' });
    const d = await res.json();
    if (res.ok) {
      setFunnels(prev => prev.map(f =>
        f.id === funnelId ? { ...f, stages: f.stages.filter(s => s.id !== stageId) } : f
      ));
      setStageError(prev => { const n = { ...prev }; delete n[stageId]; return n; });
    } else {
      setStageError(prev => ({ ...prev, [stageId]: d.error || 'Erro ao excluir' }));
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const btnStyle = (variant: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
    fontWeight: 500, cursor: 'pointer',
    background: variant === 'primary' ? 'var(--accent)' : variant === 'danger' ? 'rgba(239,68,68,0.1)' : 'transparent',
    color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#ef4444' : 'var(--text-secondary)',
    border: variant === 'primary' ? 'none' : variant === 'danger' ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border)',
  });

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando funis...</div>;

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Funis de vendas</div>
        <button style={btnStyle('primary')} onClick={() => setShowNewFunnel(v => !v)}>
          {showNewFunnel ? 'Cancelar' : '+ Novo funil'}
        </button>
      </div>

      {showNewFunnel && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>Novo funil</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              style={inputStyle} placeholder="Nome do funil *" value={newFunnelName}
              onChange={e => setNewFunnelName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createFunnel()}
            />
            <input
              style={inputStyle} placeholder="Descrição (opcional)" value={newFunnelDesc}
              onChange={e => setNewFunnelDesc(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btnStyle()} onClick={() => { setShowNewFunnel(false); setNewFunnelName(''); setNewFunnelDesc(''); }}>Cancelar</button>
              <button style={btnStyle('primary')} onClick={createFunnel} disabled={savingFunnel || !newFunnelName.trim()}>
                {savingFunnel ? 'Salvando...' : 'Criar funil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {funnels.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum funil encontrado.</div>
      )}

      {funnels.map(funnel => {
        const isExpanded = expandedId === funnel.id;
        const sorted = [...funnel.stages].sort((a, b) => a.sort_order - b.sort_order);
        const ns = newStage[funnel.id] || { name: '', color: '#3B82F6', is_terminal: false, terminal_type: 'won' };

        return (
          <div key={funnel.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
            {/* Funnel header */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}
              onClick={() => setExpandedId(isExpanded ? null : funnel.id)}
            >
              <span style={{ fontSize: 12, color: 'var(--text-muted)', userSelect: 'none' }}>{isExpanded ? '▾' : '▸'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {funnel.name}
                  {!funnel.is_active && (
                    <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 100, background: 'rgba(107,114,128,0.15)', color: 'var(--text-muted)' }}>inativo</span>
                  )}
                </div>
                {funnel.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{funnel.description}</div>}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{funnel.stages.length} etapa{funnel.stages.length !== 1 ? 's' : ''}</span>
              <button
                style={{ ...btnStyle(funnel.is_active ? 'ghost' : 'primary'), fontSize: 11, padding: '4px 10px' }}
                onClick={e => { e.stopPropagation(); toggleFunnel(funnel); }}
              >
                {funnel.is_active ? 'Desativar' : 'Ativar'}
              </button>
            </div>

            {/* Expanded: stages */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
                {sorted.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Nenhuma etapa. Adicione abaixo.</div>
                )}

                {sorted.map((stage, idx) => (
                  <div key={stage.id}>
                    {stageError[stage.id] && (
                      <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 4, paddingLeft: 4 }}>{stageError[stage.id]}</div>
                    )}
                    {deletingStage === stage.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(239,68,68,0.06)', borderRadius: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, flex: 1, color: 'var(--text-primary)' }}>Excluir "{stage.name}"?</span>
                        <button style={btnStyle()} onClick={() => setDeletingStage(null)}>Cancelar</button>
                        <button style={btnStyle('danger')} onClick={() => deleteStage(stage.id, funnel.id)}>Confirmar</button>
                      </div>
                    ) : editingStage === stage.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <input
                          style={{ ...inputStyle, flex: 1 }} value={editStageData.name}
                          onChange={e => setEditStageData(p => ({ ...p, name: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && saveStageEdit(stage.id, funnel.id)}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          {COLOR_PRESETS.map(c => (
                            <div
                              key={c} onClick={() => setEditStageData(p => ({ ...p, color: c }))}
                              style={{ width: 16, height: 16, borderRadius: 3, background: c, cursor: 'pointer', flexShrink: 0, outline: editStageData.color === c ? '2px solid white' : 'none', outlineOffset: 1 }}
                            />
                          ))}
                        </div>
                        <button style={btnStyle()} onClick={() => setEditingStage(null)}>✕</button>
                        <button style={btnStyle('primary')} onClick={() => saveStageEdit(stage.id, funnel.id)}>Salvar</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', marginBottom: 4 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: stage.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, flex: 1, color: 'var(--text-primary)' }}>{stage.name}</span>
                        {stage.is_terminal && (
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 100, background: stage.terminal_type === 'won' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: stage.terminal_type === 'won' ? 'var(--green)' : '#ef4444', flexShrink: 0 }}>
                            {stage.terminal_type === 'won' ? 'ganho' : 'perdido'}
                          </span>
                        )}
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button
                            style={{ ...btnStyle(), padding: '3px 7px', opacity: idx === 0 ? 0.3 : 1 }}
                            disabled={idx === 0}
                            onClick={() => moveStage(funnel.id, stage.id, 'up')}
                            title="Mover para cima"
                          >↑</button>
                          <button
                            style={{ ...btnStyle(), padding: '3px 7px', opacity: idx === sorted.length - 1 ? 0.3 : 1 }}
                            disabled={idx === sorted.length - 1}
                            onClick={() => moveStage(funnel.id, stage.id, 'down')}
                            title="Mover para baixo"
                          >↓</button>
                          <button
                            style={{ ...btnStyle(), padding: '3px 7px' }}
                            onClick={() => { setEditingStage(stage.id); setEditStageData({ name: stage.name, color: stage.color }); }}
                            title="Editar"
                          >✎</button>
                          <button
                            style={{ ...btnStyle('danger'), padding: '3px 7px' }}
                            onClick={() => { setDeletingStage(stage.id); setStageError(p => { const n = { ...p }; delete n[stage.id]; return n; }); }}
                            title="Excluir"
                          >✕</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add new stage */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nova etapa</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      style={inputStyle} placeholder="Nome da etapa *"
                      value={ns.name}
                      onChange={e => setNewStage(p => ({ ...p, [funnel.id]: { ...ns, name: e.target.value } }))}
                      onKeyDown={e => e.key === 'Enter' && addStage(funnel.id)}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cor:</span>
                      {COLOR_PRESETS.map(c => (
                        <div
                          key={c} onClick={() => setNewStage(p => ({ ...p, [funnel.id]: { ...ns, color: c } }))}
                          style={{ width: 18, height: 18, borderRadius: 4, background: c, cursor: 'pointer', flexShrink: 0, outline: ns.color === c ? '2px solid white' : 'none', outlineOffset: 2 }}
                        />
                      ))}
                      <div style={{ width: 18, height: 18, borderRadius: 4, background: ns.color, border: '2px solid var(--border)', flexShrink: 0 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                        <input
                          type="checkbox" checked={ns.is_terminal}
                          onChange={e => setNewStage(p => ({ ...p, [funnel.id]: { ...ns, is_terminal: e.target.checked } }))}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        Etapa terminal
                      </label>
                      {ns.is_terminal && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(['won', 'lost'] as const).map(t => (
                            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, color: t === 'won' ? 'var(--green)' : '#ef4444' }}>
                              <input
                                type="radio" name={`terminal_type_${funnel.id}`} value={t}
                                checked={ns.terminal_type === t}
                                onChange={() => setNewStage(p => ({ ...p, [funnel.id]: { ...ns, terminal_type: t } }))}
                                style={{ accentColor: t === 'won' ? 'var(--green)' : '#ef4444' }}
                              />
                              {t === 'won' ? 'Ganho' : 'Perdido'}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        style={btnStyle('primary')}
                        onClick={() => addStage(funnel.id)}
                        disabled={savingStage === funnel.id || !ns.name.trim()}
                      >
                        {savingStage === funnel.id ? 'Salvando...' : '+ Adicionar etapa'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── WhatsApp QR Connection Panel ───────────────────────────────────────────

type QrPhase = 'idle' | 'loading' | 'showing' | 'scanning' | 'connected' | 'error';

function WhatsAppQrPanel({ waStatus, onStatusChange }: {
  waStatus: WaStatus | null;
  onStatusChange: () => void;
}) {
  const [phase, setPhase] = useState<QrPhase>('idle');
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [countdown, setCountdown] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  // Refs for intervals/timeouts — cleaned up on unmount
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimers() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (qrRefreshRef.current) { clearInterval(qrRefreshRef.current); qrRefreshRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }

  useEffect(() => () => clearTimers(), []);

  // When waStatus becomes connected externally, reflect it
  useEffect(() => {
    if (waStatus?.connected && phase !== 'idle') {
      clearTimers();
      setPhase('connected');
    }
  }, [waStatus?.connected]);

  async function fetchQr() {
    setPhase('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/whatsapp-qr');
      const data = await res.json();
      if (!res.ok || data.error) {
        setErrorMsg(data.error || 'Erro ao buscar QR code');
        setPhase('error');
        return;
      }
      setQrSrc(data.qrcode);
      setPhase('showing');
      startCountdown(60);
      startPolling();
    } catch (e: any) {
      setErrorMsg(e.message);
      setPhase('error');
    }
  }

  function startCountdown(seconds: number) {
    setCountdown(seconds);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearTimers();
          setPhase('error');
          setErrorMsg('QR Code expirou. Clique em "Gerar novo QR" para tentar novamente.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/whatsapp-status');
        const d = await res.json();
        if (d.connected) {
          clearTimers();
          setPhase('connected');
          onStatusChange();
        }
      } catch { /* ignore poll errors */ }
    }, 3000);

    // Auto-refresh QR every 28s (before the 30s expiry)
    if (qrRefreshRef.current) clearInterval(qrRefreshRef.current);
    qrRefreshRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/whatsapp-qr');
        const data = await res.json();
        if (res.ok && data.qrcode) {
          setQrSrc(data.qrcode);
          startCountdown(60);
        }
      } catch { /* ignore */ }
    }, 28000);
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar WhatsApp?\n\nIsso vai limpar todas as mensagens e contatos do WhatsApp no sistema. Contatos da Corp não serão afetados.\n\nVocê precisará escanear o QR Code novamente para reconectar.')) return;
    setActionLoading(true);
    try {
      await fetch('/api/admin/whatsapp-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      clearTimers();
      setPhase('idle');
      setQrSrc(null);
      onStatusChange();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReconnect() {
    setActionLoading(true);
    try {
      await fetch('/api/admin/whatsapp-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      // Small delay to let the instance reset
      await new Promise(r => setTimeout(r, 1500));
    } finally {
      setActionLoading(false);
    }
    fetchQr();
  }

  const btn = (variant: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit',
    fontWeight: 500, cursor: actionLoading ? 'not-allowed' : 'pointer',
    background: variant === 'primary' ? 'var(--accent)' : variant === 'danger' ? 'rgba(239,68,68,0.1)' : 'transparent',
    color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#ef4444' : 'var(--text-secondary)',
    border: variant === 'primary' ? 'none' : variant === 'danger' ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border)',
    opacity: actionLoading ? 0.5 : 1,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  });

  const isConnected = waStatus?.connected || phase === 'connected';

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Conexão do dispositivo</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        Conecte o WhatsApp escaneando o QR Code abaixo pelo celular.
      </div>

      {/* Connected state */}
      {isConnected && phase !== 'showing' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>Dispositivo conectado</span>
          </div>
          {waStatus?.name && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Perfil</span>
              <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{waStatus.name}</span>
            </div>
          )}
          {waStatus?.phone && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Número</span>
              <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{waStatus.phone}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button style={btn('ghost')} onClick={handleReconnect} disabled={actionLoading}>
              {actionLoading ? 'Aguarde...' : '↺ Reconectar'}
            </button>
            <button style={btn('danger')} onClick={handleDisconnect} disabled={actionLoading}>
              {actionLoading ? 'Aguarde...' : 'Desconectar'}
            </button>
          </div>
        </div>
      )}

      {/* Idle: not connected, no QR shown */}
      {!isConnected && phase === 'idle' && (
        <button style={btn('primary')} onClick={fetchQr}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="3" height="3" />
          </svg>
          Conectar WhatsApp
        </button>
      )}

      {/* Loading QR */}
      {phase === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
          <svg style={{ animation: 'spin 1s linear infinite' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Gerando QR Code...
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* QR code display */}
      {phase === 'showing' && qrSrc && (
        <div>
          {/* White background container — QR codes require white bg to scan */}
          <div style={{ display: 'inline-block', background: '#ffffff', padding: 16, borderRadius: 10, marginBottom: 16 }}>
            <img
              src={qrSrc}
              alt="QR Code para conectar WhatsApp"
              style={{ display: 'block', width: 256, height: 256, imageRendering: 'pixelated' }}
            />
          </div>

          {/* Countdown */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: countdown > 20 ? '#22c55e' : countdown > 10 ? '#f59e0b' : '#ef4444',
                animation: 'pulse 1s ease-in-out infinite',
              }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                QR válido por <strong style={{ color: countdown > 20 ? 'var(--green)' : countdown > 10 ? '#f59e0b' : '#ef4444' }}>{countdown}s</strong>
              </span>
              <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              Abra o WhatsApp no celular → <strong style={{ color: 'var(--text-secondary)' }}>Configurações</strong> →{' '}
              <strong style={{ color: 'var(--text-secondary)' }}>Dispositivos conectados</strong> →{' '}
              <strong style={{ color: 'var(--text-secondary)' }}>Conectar dispositivo</strong> → Escaneie o QR Code
            </div>
          </div>

          <button style={btn('ghost')} onClick={fetchQr}>
            ↺ Gerar novo QR
          </button>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div>
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{errorMsg}</div>
          <button style={btn('primary')} onClick={fetchQr}>
            ↺ Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main ConfigView ─────────────────────────────────────────────────────────

export default function ConfigView() {
  const [users, setUsers] = useState<User[]>([]);
  const [waStatus, setWaStatus] = useState<WaStatus | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [corpStatus, setCorpStatus] = useState<{ connected: boolean; clientes?: number; error?: string } | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingWa, setLoadingWa] = useState(true);
  const [loadingCorp, setLoadingCorp] = useState(true);
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'corp' | 'users' | 'funis'>('whatsapp');
  const [checkingWa, setCheckingWa] = useState(false);
  const [syncingCorp, setSyncingCorp] = useState(false);
  const [syncResult, setSyncResult] = useState<string>('');

  // Chatbot toggle state
  const [chatbotEnabled, setChatbotEnabled] = useState<boolean | null>(null);
  const [togglingChatbot, setTogglingChatbot] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [savingWelcome, setSavingWelcome] = useState(false);

  async function saveWelcomeMsg() {
    setSavingWelcome(true);
    await fetch('/api/admin/chatbot-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: chatbotEnabled ?? true, welcome_message: welcomeMsg }),
    });
    setSavingWelcome(false);
  }

  // New user form
  const [showNewUser, setShowNewUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserError, setNewUserError] = useState('');
  const [newUserForm, setNewUserForm] = useState({ email: '', password: '', full_name: '', role: 'operador' });

  async function createUser() {
    setCreatingUser(true);
    setNewUserError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUserForm),
      });
      const d = await res.json();
      if (!res.ok) { setNewUserError(d.error || 'Erro ao criar'); return; }
      setShowNewUser(false);
      setNewUserForm({ email: '', password: '', full_name: '', role: 'operador' });
      loadUsers();
    } catch { setNewUserError('Erro de conexão'); }
    finally { setCreatingUser(false); }
  }

  function loadChatbotConfig() {
    fetch('/api/admin/chatbot-config')
      .then(r => r.json())
      .then(d => { setChatbotEnabled(d.enabled ?? true); setWelcomeMsg(d.welcome_message || ''); })
      .catch(() => setChatbotEnabled(true));
  }

  async function toggleChatbot() {
    if (chatbotEnabled === null) return;
    setTogglingChatbot(true);
    const next = !chatbotEnabled;
    try {
      const res = await fetch('/api/admin/chatbot-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) setChatbotEnabled(next);
    } finally {
      setTogglingChatbot(false);
    }
  }

  function loadUsers() {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => { setUsers(d.users || []); setLoadingUsers(false); })
      .catch(() => setLoadingUsers(false));
  }

  function checkWa() {
    setCheckingWa(true);
    fetch('/api/admin/whatsapp-status')
      .then(r => r.json())
      .then(d => { setWaStatus(d); setLoadingWa(false); setCheckingWa(false); })
      .catch(() => { setLoadingWa(false); setCheckingWa(false); });
  }

  function loadCorp() {
    setLoadingCorp(true);
    Promise.all([
      fetch('/api/corp/status').then(r => r.json()).catch(() => ({ connected: false, error: 'Erro de rede' })),
      fetch('/api/internal/corp-sync-logs').then(r => r.json()).catch(() => ({ logs: [] })),
    ]).then(([status, logsData]) => {
      setCorpStatus(status);
      setSyncLogs(logsData.logs || []);
      setLoadingCorp(false);
    });
  }

  async function triggerSync(type = 'all') {
    setSyncingCorp(true);
    setSyncResult('');
    try {
      const res = await fetch('/api/corp/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const d = await res.json();
      if (d.ok) {
        const total = (d.results || []).reduce((s: number, r: any) => s + r.created + r.updated, 0);
        setSyncResult(`Sync concluído: ${total} registros processados`);
        loadCorp();
      } else {
        setSyncResult(`Erro: ${d.error}`);
      }
    } catch {
      setSyncResult('Erro de conexão');
    }
    setSyncingCorp(false);
  }

  useEffect(() => {
    loadUsers();
    checkWa();
    loadCorp();
    loadChatbotConfig();
  }, []);

  async function toggleUser(user: User) {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, is_active: !user.is_active }),
    });
    loadUsers();
  }

  const tab = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    color: active ? 'var(--accent-light)' : 'var(--text-muted)',
    background: 'none', border: 'none',
    borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
    fontFamily: 'inherit',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: 56, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Configurações</span>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, paddingLeft: 24 }}>
        <button style={tab(activeTab === 'whatsapp')} onClick={() => setActiveTab('whatsapp')}>WhatsApp</button>
        <button style={tab(activeTab === 'corp')} onClick={() => setActiveTab('corp')}>Corp (Agia)</button>
        <button style={tab(activeTab === 'users')} onClick={() => setActiveTab('users')}>Usuários</button>
        <button style={tab(activeTab === 'funis')} onClick={() => setActiveTab('funis')}>Funis</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {activeTab === 'whatsapp' && (
          <div style={{ maxWidth: 520 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Status da conexão WhatsApp</div>

            {loadingWa ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Verificando conexão...</div>
            ) : waStatus ? (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: waStatus.connected ? 'var(--green)' : '#f87171', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: waStatus.connected ? 'var(--green)' : '#f87171' }}>
                    {waStatus.connected ? 'Conectado' : 'Desconectado'}
                  </span>
                </div>
                {[
                  ['Status', waStatus.status],
                  ['Número', waStatus.phone],
                  ['Nome', waStatus.name],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{k}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
                {waStatus.error && (
                  <div style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>{waStatus.error}</div>
                )}
              </div>
            ) : null}

            <button
              onClick={checkWa}
              disabled={checkingWa}
              style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
            >
              {checkingWa ? 'Verificando...' : '↺ Verificar conexão'}
            </button>

            {/* QR Connection Panel */}
            <div style={{ marginTop: 24 }}>
              <WhatsAppQrPanel waStatus={waStatus} onStatusChange={checkWa} />
            </div>

            <div style={{ marginTop: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Webhook URL</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Configure esta URL no UazapiGO para receber mensagens:</div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 12px', color: 'var(--accent-light)', wordBreak: 'break-all' }}>
                {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/whatsapp
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Eventos: <strong>messages</strong></div>
            </div>

            {/* Chatbot toggle */}
            <div style={{ marginTop: 24, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Chatbot de primeiro atendimento</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Quando ativado, envia automaticamente uma saudação e menu de opções para novos contatos ou contatos sem resposta há mais de 24h. Desativa quando um atendente humano responder.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: chatbotEnabled === null ? '#4b5563' : chatbotEnabled ? 'var(--green)' : '#4b5563',
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: chatbotEnabled === null ? 'var(--text-muted)' : chatbotEnabled ? 'var(--green)' : 'var(--text-muted)',
                  }}>
                    {chatbotEnabled === null ? 'Carregando...' : chatbotEnabled ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <button
                  onClick={toggleChatbot}
                  disabled={togglingChatbot || chatbotEnabled === null}
                  style={{
                    padding: '7px 16px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit',
                    fontWeight: 500, cursor: togglingChatbot || chatbotEnabled === null ? 'not-allowed' : 'pointer',
                    background: chatbotEnabled ? 'rgba(239,68,68,0.1)' : 'var(--accent)',
                    color: chatbotEnabled ? '#ef4444' : '#fff',
                    border: chatbotEnabled ? '1px solid rgba(239,68,68,0.3)' : 'none',
                    opacity: togglingChatbot || chatbotEnabled === null ? 0.6 : 1,
                  }}
                >
                  {togglingChatbot ? 'Salvando...' : chatbotEnabled ? 'Desativar chatbot' : 'Ativar chatbot'}
                </button>
              </div>
              {chatbotEnabled && (
                <>
                  <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      <strong style={{ color: 'var(--text-secondary)' }}>Regras ativas:</strong><br />
                      • Envia menu apenas uma vez por contato a cada 24h<br />
                      • Silencia automaticamente quando um atendente responde<br />
                      • Nunca responde a grupos de WhatsApp<br />
                      • Marca contatos com tags de interesse automaticamente
                    </div>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Mensagem de boas-vindas</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                      Use {'{{periodo_dia}}'} para saudação automática (Bom dia/Boa tarde/Boa noite). Deixe vazio para usar a mensagem padrão.
                    </div>
                    <textarea
                      value={welcomeMsg}
                      onChange={e => setWelcomeMsg(e.target.value)}
                      rows={6}
                      placeholder="{{periodo_dia}}! 👋 Bem-vindo à Marca Corretora de Seguros.&#10;&#10;Como posso te ajudar?&#10;&#10;1️⃣ Cotação de seguro&#10;2️⃣ Segunda via de boleto&#10;3️⃣ Sinistro / Assistência 24h&#10;4️⃣ Informações sobre consórcio&#10;5️⃣ Falar com um atendente&#10;&#10;Responda com o número da opção desejada."
                      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.5 }}
                    />
                    <button
                      onClick={saveWelcomeMsg}
                      disabled={savingWelcome}
                      style={{ marginTop: 8, padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, opacity: savingWelcome ? 0.6 : 1 }}
                    >
                      {savingWelcome ? 'Salvando...' : 'Salvar mensagem'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'corp' && (
          <div style={{ maxWidth: 560 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Integração Corp (Agia)</div>

            {/* Status card */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: corpStatus?.connected ? 'var(--green)' : '#4b5563' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{loadingCorp ? 'Verificando...' : corpStatus?.connected ? 'Conectado' : 'Sem credenciais'}</span>
              </div>
              {corpStatus?.connected && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{corpStatus.clientes?.toLocaleString('pt-BR')} clientes na Corp</div>
              )}
              {!corpStatus?.connected && !loadingCorp && (
                <div style={{ fontSize: 12, color: '#f87171', marginTop: 4 }}>
                  Configure <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>CORP_API_URL</code>, <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>CORP_API_EMAIL</code> e <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>CORP_API_PASSWORD</code> nas variáveis de ambiente do Vercel.
                </div>
              )}
            </div>

            {/* Sync trigger */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'Sync completo', type: 'all' },
                { label: 'Só clientes', type: 'clientes' },
                { label: 'Só negócios', type: 'negocios' },
              ].map(({ label, type }) => (
                <button key={type} onClick={() => triggerSync(type)} disabled={syncingCorp}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, opacity: syncingCorp ? 0.5 : 1 }}>
                  {syncingCorp ? '⏳ Sincronizando...' : `↺ ${label}`}
                </button>
              ))}
            </div>
            {syncResult && (
              <div style={{ fontSize: 12, color: syncResult.startsWith('Erro') ? '#f87171' : 'var(--green)', marginBottom: 12 }}>{syncResult}</div>
            )}

            {/* Auto-sync info */}
            <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--accent-light)', fontWeight: 600, marginBottom: 4 }}>Sync automático</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Todo dia às 03:00 UTC via Vercel Cron. Janela: últimos 60 dias.</div>
            </div>

            {/* Sync history */}
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Histórico de sync</div>
            {syncLogs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhum sync realizado ainda.</div>
            ) : syncLogs.slice(0, 10).map(log => (
              <div key={log.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>{log.sync_type}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    +{log.records_created} criados · {log.records_updated} atualizados · {log.records_skipped} pulados
                  </div>
                  {log.error_message && <div style={{ fontSize: 11, color: '#f87171', marginTop: 2 }}>{log.error_message}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: log.status === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', color: log.status === 'success' ? 'var(--green)' : '#fbbf24', display: 'inline-block' }}>{log.status}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    {new Date(log.started_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'funis' && <FunnelsTab />}

        {activeTab === 'users' && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Usuários da plataforma</div>
              <button
                onClick={() => setShowNewUser(v => !v)}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: showNewUser ? 'var(--accent-dim)' : 'transparent', color: showNewUser ? 'var(--accent-light)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
              >
                {showNewUser ? 'Cancelar' : '+ Novo usuário'}
              </button>
            </div>

            {showNewUser && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nome</label>
                    <input value={newUserForm.full_name} onChange={e => setNewUserForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Nome completo" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Perfil</label>
                    <select value={newUserForm.role} onChange={e => setNewUserForm(f => ({ ...f, role: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                      <option value="operador">Operador</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>E-mail</label>
                    <input type="email" value={newUserForm.email} onChange={e => setNewUserForm(f => ({ ...f, email: e.target.value }))} placeholder="email@empresa.com" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Senha</label>
                    <input type="password" value={newUserForm.password} onChange={e => setNewUserForm(f => ({ ...f, password: e.target.value }))} placeholder="Mín. 6 caracteres" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                  </div>
                </div>
                {newUserError && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>{newUserError}</div>}
                <button
                  onClick={createUser}
                  disabled={creatingUser || !newUserForm.email || !newUserForm.password}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, opacity: creatingUser ? 0.6 : 1 }}
                >
                  {creatingUser ? 'Criando...' : 'Criar usuário'}
                </button>
              </div>
            )}

            {loadingUsers ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
            ) : users.map(u => (
              <div key={u.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1e1e30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--accent-light)', flexShrink: 0 }}>
                  {(u.full_name || u.email).charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{u.full_name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: u.role === 'admin' ? 'rgba(59,130,246,0.1)' : 'rgba(107,114,128,0.1)', color: u.role === 'admin' ? 'var(--accent-light)' : 'var(--text-muted)' }}>
                  {u.role}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: u.is_active ? 'var(--green)' : '#4b5563' }} />
                  <button
                    onClick={() => toggleUser(u)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {u.is_active ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
