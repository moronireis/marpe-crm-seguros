import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DndContext, DragOverlay, useDroppable, useDraggable, PointerSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import DealPanel from './DealPanel';

// ─── Shared input styles ──────────────────────────────────────────────────────
const INPUT_S: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-primary)', fontSize: 13,
  fontFamily: 'inherit', outline: 'none',
};
const LABEL_S: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
};

// ─── Filter input style (compact, 32px height) ───────────────────────────────
const FILTER_INPUT_S: React.CSSProperties = {
  boxSizing: 'border-box', padding: '0 8px', height: 32,
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text-primary)', fontSize: 12,
  fontFamily: 'inherit', outline: 'none', minWidth: 0,
};

// ─── RAMO colors ──────────────────────────────────────────────────────────────
const RAMO_COLORS: Record<string, { bg: string; color: string }> = {
  auto: { bg: 'rgba(59,130,246,0.12)', color: '#60A5FA' },
  vida: { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa' },
  vgrp: { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa' },
  residencial: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80' },
  empresarial: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24' },
  equipamento: { bg: 'rgba(6,182,212,0.12)', color: '#22d3ee' },
  fina: { bg: 'rgba(239,68,68,0.12)', color: '#f87171' },
  consorcio: { bg: 'rgba(168,85,247,0.12)', color: '#c084fc' },
  financiamento: { bg: 'rgba(20,184,166,0.12)', color: '#2dd4bf' },
  rcge: { bg: 'rgba(251,146,60,0.12)', color: '#fb923c' },
};

// ─── DnD helpers ─────────────────────────────────────────────────────────────
function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, background: isOver ? 'rgba(59,130,246,0.04)' : 'transparent', borderRadius: 8, transition: 'background 0.15s' }}>
      {children}
    </div>
  );
}

function DraggableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 100 : 'auto' }
    : {};
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style}>
      {children}
    </div>
  );
}

const DEAL_TYPE_LABELS: Record<string, string> = {
  prospeccao: 'Prospecção',
  renovacao: 'Renovação',
  resgate: 'Resgate',
  venda_cruzada: 'Venda Cruzada',
  endosso: 'Endosso',
};

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface Funnel { id: string; name: string; stages: Stage[]; }
interface Stage { id: string; name: string; color: string; sort_order: number; is_terminal?: boolean; terminal_type?: string | null; }
interface Deal {
  id: string; title: string; ramo: string | null; seguradora: string | null; apolice: string | null;
  premio: number | null; comissao_valor: number | null; deal_type: string | null;
  vigencia_inicio: string | null; vigencia_fim: string | null; stage_id: string;
  status_custom: string | null; status_color: string | null;
  next_action: string | null; next_action_date: string | null;
  produtor: string | null; responsible_id: string | null;
  marpe_contacts: { id: string; name: string; phone: string | null } | null;
  marpe_funnel_stages: { id: string; name: string; color: string } | null;
  marpe_profiles: { id: string; full_name: string } | null;
}
interface UserOption { id: string; full_name: string; email: string; }
interface ContactOption { id: string; name: string; phone: string | null; }
interface NewDealForm {
  contact_id: string;
  ramo: string; seguradora: string; deal_type: string;
  premio: string; comissao_pct: string;
  veiculo: string; placa: string;
  next_action: string; next_action_date: string;
}
const EMPTY_FORM: NewDealForm = {
  contact_id: '', ramo: '', seguradora: '', deal_type: 'prospeccao',
  premio: '', comissao_pct: '', veiculo: '', placa: '',
  next_action: '', next_action_date: '',
};

// ─── Filter state ─────────────────────────────────────────────────────────────
interface FilterState {
  responsavel: string;
  ramo: string;
  seguradora: string;
  produtor: string;
  tipo: string;
  status: string;
  dateRange: 'todos' | 'hoje' | 'proximos7';
}
const EMPTY_FILTERS: FilterState = {
  responsavel: '', ramo: '', seguradora: '', produtor: '', tipo: '', status: '', dateRange: 'todos',
};

function countActiveFilters(f: FilterState): number {
  return [f.responsavel, f.ramo, f.seguradora, f.produtor, f.tipo, f.status].filter(Boolean).length
    + (f.dateRange !== 'todos' ? 1 : 0);
}

// ─── NewDealModal ─────────────────────────────────────────────────────────────
function NewDealModal({ funnels, activeFunnelId, onClose, onCreated }: {
  funnels: Funnel[]; activeFunnelId: string;
  onClose: () => void; onCreated: () => void;
}) {
  const [form, setForm] = useState<NewDealForm>(EMPTY_FORM);
  const [contactSearch, setContactSearch] = useState('');
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const firstStageId = funnels
    .find(f => f.id === activeFunnelId)?.stages
    ?.slice().sort((a, b) => a.sort_order - b.sort_order)[0]?.id || '';

  // Auto-fill contact from URL param
  useEffect(() => {
    const prefill = (window as any).__prefillContactId;
    if (prefill) {
      delete (window as any).__prefillContactId;
      fetch(`/api/contacts/${prefill}`).then(r => r.json()).then(d => {
        if (d.contact) {
          setForm(f => ({ ...f, contact_id: d.contact.id }));
          setContactSearch(d.contact.name + (d.contact.phone ? ` · ${d.contact.phone}` : ''));
        }
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (contactSearch.length < 2) { setContactOptions([]); setShowDropdown(false); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setContactLoading(true);
      fetch(`/api/contacts/search?search=${encodeURIComponent(contactSearch)}&limit=20`)
        .then(r => r.json())
        .then(d => { setContactOptions(d.contacts || []); setShowDropdown(true); })
        .finally(() => setContactLoading(false));
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [contactSearch]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowDropdown(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function selectContact(c: ContactOption) {
    setForm(f => ({ ...f, contact_id: c.id }));
    setContactSearch(c.name + (c.phone ? ` · ${c.phone}` : ''));
    setShowDropdown(false);
  }

  function field(key: keyof NewDealForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.contact_id) { setError('Selecione um contato.'); return; }
    if (!activeFunnelId || !firstStageId) { setError('Funil sem etapas configuradas.'); return; }
    setSubmitting(true);
    const res = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: form.contact_id,
        funnel_id: activeFunnelId,
        stage_id: firstStageId,
        ramo: form.ramo || null,
        seguradora: form.seguradora || null,
        deal_type: form.deal_type || 'prospeccao',
        premio: form.premio ? parseFloat(form.premio) : null,
        comissao_pct: form.comissao_pct ? parseFloat(form.comissao_pct) : null,
        veiculo: form.veiculo || null,
        placa: form.placa || null,
        next_action: form.next_action || null,
        next_action_date: form.next_action_date || null,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || 'Erro ao criar negócio.'); return; }
    onCreated();
    onClose();
  }

  const canSubmit = !submitting && !!form.contact_id;

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 14, width: 520, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Novo Negócio</span>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontFamily: 'inherit' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div ref={dropdownRef}>
            <label style={LABEL_S}>Contato *</label>
            <div style={{ position: 'relative' }}>
              <input
                value={contactSearch}
                onChange={e => {
                  setContactSearch(e.target.value);
                  if (!e.target.value) setForm(f => ({ ...f, contact_id: '' }));
                }}
                placeholder="Buscar por nome, telefone ou e-mail..."
                autoComplete="off"
                style={{ ...INPUT_S, borderColor: form.contact_id ? 'rgba(59,130,246,0.45)' : 'var(--border)' }}
              />
              {contactLoading && (
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-muted)' }}>...</span>
              )}
              {showDropdown && contactOptions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                  {contactOptions.map(c => (
                    <div
                      key={c.id}
                      onMouseDown={() => selectContact(c)}
                      style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</div>
                      {c.phone && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{c.phone}</div>}
                    </div>
                  ))}
                </div>
              )}
              {showDropdown && contactOptions.length === 0 && !contactLoading && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                  Nenhum contato encontrado
                </div>
              )}
            </div>
            {form.contact_id && (
              <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>Contato selecionado</div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL_S}>Ramo</label>
              <select value={form.ramo} onChange={field('ramo')} style={{ ...INPUT_S, cursor: 'pointer' }}>
                <option value="">— Selecione —</option>
                <option value="auto">Auto</option>
                <option value="vida">Vida</option>
                <option value="residencial">Residencial</option>
                <option value="empresarial">Empresarial</option>
                <option value="equipamento">Equipamento</option>
                <option value="consorcio">Consórcio</option>
                <option value="financiamento">Financiamento</option>
                <option value="rcge">RCGE</option>
              </select>
            </div>
            <div>
              <label style={LABEL_S}>Tipo</label>
              <select value={form.deal_type} onChange={field('deal_type')} style={{ ...INPUT_S, cursor: 'pointer' }}>
                <option value="prospeccao">Prospecção</option>
                <option value="renovacao">Renovação</option>
                <option value="resgate">Resgate</option>
                <option value="venda_cruzada">Venda Cruzada</option>
                <option value="endosso">Endosso</option>
              </select>
            </div>
          </div>

          <div>
            <label style={LABEL_S}>Seguradora</label>
            <input value={form.seguradora} onChange={field('seguradora')} placeholder="Ex: Porto Seguro, Bradesco..." style={INPUT_S} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL_S}>Prêmio (R$)</label>
              <input type="number" min="0" step="0.01" value={form.premio} onChange={field('premio')} placeholder="0,00" style={INPUT_S} />
            </div>
            <div>
              <label style={LABEL_S}>Comissão %</label>
              <input type="number" min="0" max="100" step="0.1" value={form.comissao_pct} onChange={field('comissao_pct')} placeholder="0,0" style={INPUT_S} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL_S}>Veículo</label>
              <input value={form.veiculo} onChange={field('veiculo')} placeholder="Opcional" style={INPUT_S} />
            </div>
            <div>
              <label style={LABEL_S}>Placa</label>
              <input value={form.placa} onChange={field('placa')} placeholder="Opcional" style={INPUT_S} />
            </div>
          </div>

          <div>
            <label style={LABEL_S}>Observação</label>
            <textarea value={form.next_action} onChange={field('next_action')} rows={3} placeholder="Próxima ação ou observação..." style={{ ...INPUT_S, resize: 'vertical', minHeight: 72 }} />
          </div>

          <div>
            <label style={LABEL_S}>Data de Aproximação</label>
            <input type="date" value={form.next_action_date} onChange={field('next_action_date')} style={INPUT_S} />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>
              {error}
            </div>
          )}
        </form>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={!canSubmit}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: canSubmit ? 'var(--accent)' : 'rgba(59,130,246,0.3)', color: canSubmit ? '#fff' : 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
          >
            {submitting ? 'Criando...' : 'Criar Negócio'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ExportFunnelButton ───────────────────────────────────────────────────────
function ExportFunnelButton({ funnelId }: { funnelId: string }) {
  function handleExport() {
    if (!funnelId) return;
    const url = `/api/export/deals?format=csv&funnel_id=${encodeURIComponent(funnelId)}`;
    window.open(url, '_blank');
  }

  return (
    <button
      onClick={handleExport}
      disabled={!funnelId}
      title="Exportar negócios do funil como CSV"
      style={{
        padding: '7px 14px', borderRadius: 6,
        border: '1px solid var(--border)', background: 'var(--bg-card)',
        color: funnelId ? 'var(--text-secondary)' : 'var(--text-muted)',
        fontSize: 12, cursor: funnelId ? 'pointer' : 'not-allowed',
        fontFamily: 'inherit', fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 6,
        opacity: funnelId ? 1 : 0.5,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M6.5 1v8M3.5 6l3 3 3-3M1.5 11h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Exportar
    </button>
  );
}

// ─── FilterBar ────────────────────────────────────────────────────────────────
function FilterBar({
  filters, onChange, onClear, users, deals,
}: {
  filters: FilterState;
  onChange: (f: Partial<FilterState>) => void;
  onClear: () => void;
  users: UserOption[];
  deals: Deal[];
}) {
  const sel = (key: keyof FilterState) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    onChange({ [key]: e.target.value });

  // Extract unique options from deals data
  const seguradoras = useMemo(() => [...new Set(deals.map(d => d.seguradora).filter(Boolean) as string[])].sort(), [deals]);
  const produtores = useMemo(() => [...new Set(deals.map(d => d.produtor).filter(Boolean) as string[])].sort(), [deals]);
  const statuses = useMemo(() => [...new Set(deals.map(d => d.status_custom).filter(Boolean) as string[])].sort(), [deals]);

  const filterInputStyle = (active: boolean): React.CSSProperties => ({
    ...FILTER_INPUT_S,
    borderColor: active ? 'rgba(59,130,246,0.5)' : 'var(--border)',
    background: active ? 'rgba(59,130,246,0.06)' : 'var(--bg-card)',
  });

  return (
    <div style={{
      padding: '10px 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
      display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
    }}>
      {/* Responsável */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Responsável</span>
        <select
          value={filters.responsavel}
          onChange={sel('responsavel')}
          style={{ ...filterInputStyle(!!filters.responsavel), width: 140, cursor: 'pointer' }}
        >
          <option value="">Todos</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </div>

      {/* Ramo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ramo</span>
        <select
          value={filters.ramo}
          onChange={sel('ramo')}
          style={{ ...filterInputStyle(!!filters.ramo), width: 130, cursor: 'pointer' }}
        >
          <option value="">Todos</option>
          <option value="auto">Auto</option>
          <option value="vida">Vida</option>
          <option value="residencial">Residencial</option>
          <option value="empresarial">Empresarial</option>
          <option value="equipamento">Equipamento</option>
          <option value="consorcio">Consórcio</option>
          <option value="financiamento">Financiamento</option>
          <option value="rcge">RCGE</option>
        </select>
      </div>

      {/* Seguradora */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Seguradora</span>
        <select
          value={filters.seguradora}
          onChange={sel('seguradora')}
          style={{ ...filterInputStyle(!!filters.seguradora), width: 150, cursor: 'pointer' }}
        >
          <option value="">Todas</option>
          {seguradoras.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Produtor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Produtor</span>
        <select
          value={filters.produtor}
          onChange={sel('produtor')}
          style={{ ...filterInputStyle(!!filters.produtor), width: 140, cursor: 'pointer' }}
        >
          <option value="">Todos</option>
          {produtores.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Tipo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tipo</span>
        <select
          value={filters.tipo}
          onChange={sel('tipo')}
          style={{ ...filterInputStyle(!!filters.tipo), width: 140, cursor: 'pointer' }}
        >
          <option value="">Todos</option>
          <option value="prospeccao">Prospecção</option>
          <option value="renovacao">Renovação</option>
          <option value="resgate">Resgate</option>
          <option value="venda_cruzada">Venda Cruzada</option>
          <option value="endosso">Endosso</option>
        </select>
      </div>

      {/* Status */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
        <select
          value={filters.status}
          onChange={sel('status')}
          style={{ ...filterInputStyle(!!filters.status), width: 130, cursor: 'pointer' }}
        >
          <option value="">Todos</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Próxima ação */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Próxima Ação</span>
        <select
          value={filters.dateRange}
          onChange={sel('dateRange')}
          style={{ ...filterInputStyle(filters.dateRange !== 'todos'), width: 140, cursor: 'pointer' }}
        >
          <option value="todos">Todas as datas</option>
          <option value="hoje">Até hoje</option>
          <option value="proximos7">Próximos 7 dias</option>
        </select>
      </div>

      {/* Clear */}
      <button
        onClick={onClear}
        style={{
          height: 32, padding: '0 12px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
          fontFamily: 'inherit', marginTop: 12, whiteSpace: 'nowrap',
        }}
      >
        Limpar filtros
      </button>
    </div>
  );
}

// ─── CrmBoard ─────────────────────────────────────────────────────────────────
export default function CrmBoard() {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [activeFunnelId, setActiveFunnelId] = useState('');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);

  // ── Search state (U4) ──────────────────────────────────────────────────────
  const [searchRaw, setSearchRaw] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Filter state (U2) ──────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  // ── Sort state (U3) ────────────────────────────────────────────────────────
  const [gradeSortDir, setGradeSortDir] = useState<'asc' | 'desc'>('asc');

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragStart(event: DragStartEvent) {
    setDraggingDealId(String(event.active.id));
  }
  async function handleDragEnd(event: DragEndEvent) {
    setDraggingDealId(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const stageId = String(over.id);
    const deal = deals.find(d => d.id === dealId);
    if (!deal || deal.stage_id === stageId) return;
    // Optimistic update
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage_id: stageId } : d));
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: stageId }),
    });
    if (!res.ok) reloadDeals(); // revert on error
  }

  // Detect mobile
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [viewMode, setViewMode] = useState<'kanban' | 'grade'>('kanban');
  useEffect(() => { if (isMobile) setViewMode('grade'); }, [isMobile]);

  // Load funnels
  useEffect(() => {
    fetch('/api/funnels').then(r => r.json()).then(d => {
      setFunnels(d.funnels || []);
      if (d.funnels?.length) setActiveFunnelId(d.funnels[0].id);
    });
  }, []);

  // Load users for filter dropdown
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => setUsers(d.users || [])).catch(() => {});
  }, []);

  // Read URL query params: ?deal=ID (open deal panel), ?new_deal=CONTACT_ID (open new deal form)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dealParam = params.get('deal');
    const newDealParam = params.get('new_deal');
    if (dealParam) setActiveDealId(dealParam);
    if (newDealParam) {
      setShowNewDeal(true);
      // Pre-fill contact after NewDealModal mounts (handled via prop)
      (window as any).__prefillContactId = newDealParam;
    }
    if (dealParam || newDealParam) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Load deals
  useEffect(() => {
    if (!activeFunnelId) return;
    setLoading(true);
    fetch(`/api/deals?funnel_id=${activeFunnelId}&limit=500`)
      .then(r => r.json())
      .then(d => { setDeals(d.deals || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeFunnelId]);

  // Debounce search input
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchDebounced(searchRaw), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchRaw]);

  const activeFunnel = funnels.find(f => f.id === activeFunnelId);
  const stages = activeFunnel?.stages || [];

  function reloadDeals() {
    if (!activeFunnelId) return;
    fetch(`/api/deals?funnel_id=${activeFunnelId}&limit=500`)
      .then(r => r.json())
      .then(d => setDeals(d.deals || []));
  }

  const updateFilters = useCallback((partial: Partial<FilterState>) => {
    setFilters(f => ({ ...f, ...partial }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setSearchRaw('');
    setSearchDebounced('');
  }, []);

  // ── Derived: filtered + sorted deals (U2 + U3 + U4) ──────────────────────
  const filteredDeals = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    in7.setHours(23, 59, 59, 999);
    const q = searchDebounced.toLowerCase().trim();

    return deals.filter(d => {
      // U4: name / title search
      if (q) {
        const name = (d.marpe_contacts?.name || '').toLowerCase();
        const title = (d.title || '').toLowerCase();
        if (!name.includes(q) && !title.includes(q)) return false;
      }
      // U2 filters
      if (filters.responsavel && d.responsible_id !== filters.responsavel) return false;
      if (filters.ramo && (d.ramo || '').toLowerCase() !== filters.ramo.toLowerCase()) return false;
      if (filters.seguradora && d.seguradora !== filters.seguradora) return false;
      if (filters.produtor && d.produtor !== filters.produtor) return false;
      if (filters.tipo && d.deal_type !== filters.tipo) return false;
      if (filters.status && d.status_custom !== filters.status) return false;
      if (filters.dateRange !== 'todos') {
        if (!d.next_action_date) return false;
        const dt = new Date(d.next_action_date);
        if (filters.dateRange === 'hoje' && dt > today) return false;
        if (filters.dateRange === 'proximos7' && (dt < new Date() || dt > in7)) return false;
      }
      return true;
    });
  }, [deals, searchDebounced, filters]);

  // Deals sorted by next_action_date for Kanban (U3)
  const sortByNextAction = useCallback((arr: Deal[]) =>
    [...arr].sort((a, b) => {
      if (!a.next_action_date && !b.next_action_date) return 0;
      if (!a.next_action_date) return 1;
      if (!b.next_action_date) return -1;
      return a.next_action_date.localeCompare(b.next_action_date);
    }), []);

  const dealsByStage = (stageId: string) =>
    sortByNextAction(filteredDeals.filter(d => d.stage_id === stageId));

  // Grade sorted deals (U3 — toggleable)
  const gradeSortedDeals = useMemo(() => {
    return [...filteredDeals].sort((a, b) => {
      if (!a.next_action_date && !b.next_action_date) return 0;
      if (!a.next_action_date) return gradeSortDir === 'asc' ? 1 : -1;
      if (!b.next_action_date) return gradeSortDir === 'asc' ? -1 : 1;
      const cmp = a.next_action_date.localeCompare(b.next_action_date);
      return gradeSortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredDeals, gradeSortDir]);

  function formatPremio(v: number | null) {
    if (!v) return '—';
    return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  function formatDate(s: string | null) {
    if (!s) return '—';
    // s is YYYY-MM-DD
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }

  function nextActionUrgency(date: string | null): React.CSSProperties {
    if (!date) return { color: 'var(--text-muted)' };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(date + 'T00:00:00');
    if (d < today) return { color: '#f87171', fontWeight: 600 }; // overdue
    if (d.getTime() === today.getTime()) return { color: '#fbbf24', fontWeight: 600 }; // today
    return { color: 'var(--text-secondary)' };
  }

  const activeFilterCount = countActiveFilters(filters);
  const isFiltering = activeFilterCount > 0 || !!searchDebounced;

  // Grade table column header with sort
  function SortableHeader({ label, style }: { label: string; style?: React.CSSProperties }) {
    return (
      <th
        onClick={() => setGradeSortDir(d => d === 'asc' ? 'desc' : 'asc')}
        style={{
          textAlign: 'left', padding: '10px 12px',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          color: 'var(--accent)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
          cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
          ...style,
        }}
      >
        {label} {gradeSortDir === 'asc' ? '↑' : '↓'}
      </th>
    );
  }

  function ColHeader({ label, style }: { label: string; style?: React.CSSProperties }) {
    return (
      <th style={{
        textAlign: 'left', padding: '10px 12px',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        color: 'var(--accent)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        ...style,
      }}>{label}</th>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

        {/* ── Topbar ─────────────────────────────────────────────────────────── */}
        <div style={{
          minHeight: 56, borderBottom: showFilters ? 'none' : '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          padding: isMobile ? '10px 12px' : '0 24px',
          gap: isMobile ? 8 : 12, flexShrink: 0,
          flexWrap: isMobile ? 'wrap' : 'nowrap',
        }}>
          {!isMobile && <span style={{ fontSize: 16, fontWeight: 600 }}>Funis</span>}

          {/* Funnel selector */}
          <select
            value={activeFunnelId}
            onChange={e => setActiveFunnelId(e.target.value)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
              fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
              flex: isMobile ? 1 : 'none',
            }}
          >
            {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>

          {/* U4: Search input */}
          <div style={{ position: 'relative', flex: isMobile ? '1 1 100%' : '1', maxWidth: isMobile ? '100%' : 300, minWidth: 140 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M8.5 8.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={searchRaw}
              onChange={e => setSearchRaw(e.target.value)}
              placeholder="Buscar por cliente ou negócio..."
              style={{
                width: '100%', boxSizing: 'border-box',
                paddingLeft: 28, paddingRight: searchRaw ? 28 : 10,
                height: 34, background: 'var(--bg-card)',
                border: `1px solid ${searchRaw ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
                borderRadius: 8, color: 'var(--text-primary)', fontSize: 12,
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            {searchRaw && (
              <button
                onClick={() => { setSearchRaw(''); setSearchDebounced(''); }}
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 2,
                }}
              >✕</button>
            )}
          </div>

          {/* Result count when filtering */}
          {!isMobile && isFiltering && (
            <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {filteredDeals.length} resultado{filteredDeals.length !== 1 ? 's' : ''}
            </span>
          )}
          {!isMobile && !isFiltering && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{deals.length} negócios</span>
          )}

          <div style={{ marginLeft: isMobile ? 0 : 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Filtros toggle (U2) */}
            <button
              onClick={() => setShowFilters(v => !v)}
              style={{
                padding: '7px 12px', borderRadius: 6, height: 34,
                border: `1px solid ${showFilters || activeFilterCount > 0 ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
                background: showFilters || activeFilterCount > 0 ? 'rgba(59,130,246,0.08)' : 'transparent',
                color: showFilters || activeFilterCount > 0 ? 'var(--accent-light)' : 'var(--text-muted)',
                fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M1 3h11M3 6.5h7M5 10h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              Filtros
              {activeFilterCount > 0 && (
                <span style={{
                  background: 'var(--accent)', color: '#fff',
                  borderRadius: '50%', width: 16, height: 16, fontSize: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                }}>{activeFilterCount}</span>
              )}
            </button>

            {/* Novo Negócio */}
            <button
              onClick={() => setShowNewDeal(true)}
              style={{
                padding: '7px 14px', borderRadius: 6, height: 34,
                border: '1px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.12)',
                color: 'var(--accent-light)', fontSize: 12, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              {isMobile ? 'Novo' : 'Novo Negócio'}
            </button>

            {!isMobile && <ExportFunnelButton funnelId={activeFunnelId} />}

            {/* View toggle */}
            {!isMobile && (['kanban', 'grade'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                style={{
                  padding: '7px 14px', borderRadius: 6, height: 34,
                  border: `1px solid ${viewMode === m ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
                  background: viewMode === m ? 'var(--accent-dim)' : 'transparent',
                  color: viewMode === m ? 'var(--accent-light)' : 'var(--text-muted)',
                  fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                }}
              >
                {m === 'kanban' ? 'Kanban' : 'Grade'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Filter bar (U2) ─────────────────────────────────────────────────── */}
        {showFilters && (
          <FilterBar
            filters={filters}
            onChange={updateFilters}
            onClear={clearFilters}
            users={users}
            deals={deals}
          />
        )}

        {/* ── Mobile result count ─────────────────────────────────────────────── */}
        {isMobile && isFiltering && (
          <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--accent)', borderBottom: '1px solid var(--border)' }}>
            {filteredDeals.length} resultado{filteredDeals.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>Carregando negócios...</div>
        ) : viewMode === 'kanban' ? (
          /* ── Kanban with drag-and-drop ────────────────────────────────── */
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: 20, display: 'flex', gap: 14 }}>
            {stages.map(stage => {
              const stageDeals = dealsByStage(stage.id);
              const sum = stageDeals.reduce((a, d) => a + (d.premio || 0), 0);
              return (
                <div key={stage.id} style={{ minWidth: 280, maxWidth: 280, height: '100%', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', marginBottom: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{stage.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 100, marginLeft: 'auto' }}>{stageDeals.length}</span>
                    {sum > 0 && <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>{formatPremio(sum)}</span>}
                  </div>
                  <DroppableColumn id={stage.id}>
                    {stageDeals.slice(0, 50).map(d => {
                      const r = RAMO_COLORS[d.ramo?.toLowerCase() || ''] || { bg: 'var(--border)', color: 'var(--text-muted)' };
                      const urgency = nextActionUrgency(d.next_action_date);
                      return (
                        <DraggableCard key={d.id} id={d.id}>
                        <div
                          onClick={() => setActiveDealId(d.id)}
                          style={{
                            background: activeDealId === d.id ? 'rgba(59,130,246,0.06)' : 'var(--bg-card)',
                            border: `1px solid ${activeDealId === d.id ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
                            borderLeft: `3px solid ${r.color}`,
                            borderRadius: 10, padding: 14, cursor: 'grab',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                              {d.marpe_contacts?.name || d.title}
                            </span>
                            {d.ramo && (
                              <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 100, textTransform: 'uppercase', background: r.bg, color: r.color }}>
                                {d.ramo}
                              </span>
                            )}
                          </div>
                          {d.seguradora && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{d.seguradora}</div>}
                          {d.status_custom && (
                            <div style={{ marginBottom: 6 }}>
                              <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 100, background: d.status_color ? `${d.status_color}22` : 'rgba(255,255,255,0.06)', color: d.status_color || 'var(--text-muted)', border: `1px solid ${d.status_color ? `${d.status_color}44` : 'var(--border)'}` }}>
                                {d.status_custom}
                              </span>
                            </div>
                          )}
                          {d.next_action_date && (
                            <div style={{ fontSize: 10, marginBottom: 4, ...urgency }}>
                              Ação: {formatDate(d.next_action_date)}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
                            {d.premio && <span><span style={{ color: 'var(--text-muted)' }}>Prêmio </span><span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{formatPremio(d.premio)}</span></span>}
                            {d.apolice && <span style={{ color: 'var(--text-muted)' }}>#{d.apolice.slice(-6)}</span>}
                          </div>
                        </div>
                        </DraggableCard>
                      );
                    })}
                    {stageDeals.length === 0 && (
                      <div style={{ padding: 20, border: '1px dashed var(--border)', borderRadius: 10, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        {isFiltering ? 'Nenhum resultado' : 'Nenhum negócio'}
                      </div>
                    )}
                    {stageDeals.length > 50 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
                        +{stageDeals.length - 50} mais
                      </div>
                    )}
                  </DroppableColumn>
                </div>
              );
            })}
          </div>
          <DragOverlay>
            {draggingDealId ? (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: 10, padding: 14, width: 264, opacity: 0.9, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {deals.find(d => d.id === draggingDealId)?.marpe_contacts?.name || 'Negócio'}
                </span>
              </div>
            ) : null}
          </DragOverlay>
          </DndContext>
        ) : (
          /* ── Grade view (U3: sortable Próxima Ação + all columns) ─────────── */
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: isMobile ? '12px 0' : 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: isMobile ? 560 : 1000 }}>
              <thead>
                <tr>
                  <ColHeader label="Contato" style={isMobile ? { position: 'sticky', left: 0, zIndex: 1 } : {}} />
                  <ColHeader label="Ramo" />
                  <ColHeader label="Seguradora" />
                  <ColHeader label="Prêmio" />
                  <ColHeader label="Produtor" />
                  <ColHeader label="Tipo" />
                  <ColHeader label="Status" />
                  <SortableHeader label="Próxima Ação" />
                  <ColHeader label="Vigência Fim" />
                  <ColHeader label="Responsável" />
                  <ColHeader label="Etapa" />
                </tr>
              </thead>
              <tbody>
                {gradeSortedDeals.slice(0, 300).map(d => {
                  const r = RAMO_COLORS[d.ramo?.toLowerCase() || ''] || { bg: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' };
                  const urgency = nextActionUrgency(d.next_action_date);
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setActiveDealId(d.id)}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Contato */}
                      <td style={{
                        padding: '8px 12px', border: '1px solid var(--border)',
                        color: 'var(--text-primary)', fontWeight: 500, fontSize: 13,
                        maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        ...(isMobile ? { position: 'sticky', left: 0, background: 'var(--bg-primary)', zIndex: 1 } : {}),
                      }}>
                        {d.marpe_contacts?.name || '—'}
                      </td>
                      {/* Ramo */}
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {d.ramo
                          ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: r.bg, color: r.color, textTransform: 'uppercase' }}>{d.ramo}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      {/* Seguradora */}
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', color: 'var(--text-secondary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.seguradora || '—'}
                      </td>
                      {/* Prêmio */}
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {formatPremio(d.premio)}
                      </td>
                      {/* Produtor */}
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.produtor || '—'}
                      </td>
                      {/* Tipo */}
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {d.deal_type
                          ? <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{DEAL_TYPE_LABELS[d.deal_type] || d.deal_type}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      {/* Status */}
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {d.status_custom
                          ? <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 100, background: d.status_color ? `${d.status_color}22` : 'rgba(255,255,255,0.06)', color: d.status_color || 'var(--text-muted)', border: `1px solid ${d.status_color ? `${d.status_color}44` : 'var(--border)'}` }}>{d.status_custom}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      {/* Próxima Ação (sortable) */}
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {d.next_action_date
                          ? <span style={{ fontSize: 12, ...urgency }}>{formatDate(d.next_action_date)}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      {/* Vigência Fim */}
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(d.vigencia_fim)}
                      </td>
                      {/* Responsável */}
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.marpe_profiles?.full_name || '—'}
                      </td>
                      {/* Etapa */}
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 11, color: d.marpe_funnel_stages?.color || 'var(--text-muted)' }}>
                          {d.marpe_funnel_stages?.name || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredDeals.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, border: '1px solid var(--border)' }}>
                      {isFiltering ? 'Nenhum negócio encontrado para os filtros aplicados.' : 'Nenhum negócio neste funil.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {filteredDeals.length > 300 && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, padding: isMobile ? '0 12px' : 0 }}>
                Mostrando 300 de {filteredDeals.length}
              </p>
            )}
          </div>
        )}
      </div>

      {activeDealId && (
        <DealPanel
          dealId={activeDealId}
          stages={stages}
          onClose={() => setActiveDealId(null)}
          onUpdated={reloadDeals}
        />
      )}

      {showNewDeal && (
        <NewDealModal
          funnels={funnels}
          activeFunnelId={activeFunnelId}
          onClose={() => setShowNewDeal(false)}
          onCreated={reloadDeals}
        />
      )}
    </div>
  );
}
