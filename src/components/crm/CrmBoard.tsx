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
    <div
      ref={setNodeRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: isOver ? 'rgba(59,130,246,0.04)' : 'transparent',
        borderRadius: 8,
        transition: 'background 0.15s',
        paddingBottom: 8,
      }}
    >
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
  created_at: string | null;
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
  // New fields
  campanha: string; ja_possui_produto: boolean;
  seguradora_atual: string; vigencia_atual_fim: string; corretora_atual: string;
  agente: string; observacoes_proposta: string;
}
const EMPTY_FORM: NewDealForm = {
  contact_id: '', ramo: '', seguradora: '', deal_type: 'prospeccao',
  premio: '', comissao_pct: '', veiculo: '', placa: '',
  next_action: '', next_action_date: '',
  campanha: '', ja_possui_produto: false,
  seguradora_atual: '', vigencia_atual_fim: '', corretora_atual: '',
  agente: '', observacoes_proposta: '',
};

// ─── Filter state ─────────────────────────────────────────────────────────────
interface FilterState {
  responsavel: string[];
  etapa: string[];
  ramo: string[];
  seguradora: string[];
  produtor: string[];
  tipo: string[];
  status: string[];
  dateRange: 'todos' | 'hoje' | 'proximos7';
  premioMin: string;
  premioMax: string;
  createdFrom: string;
  createdTo: string;
}
const EMPTY_FILTERS: FilterState = {
  responsavel: [], etapa: [], ramo: [], seguradora: [], produtor: [], tipo: [], status: [],
  dateRange: 'todos', premioMin: '', premioMax: '', createdFrom: '', createdTo: '',
};

function countActiveFilters(f: FilterState): number {
  return (
    (f.responsavel.length > 0 ? 1 : 0) +
    (f.etapa.length > 0 ? 1 : 0) +
    (f.ramo.length > 0 ? 1 : 0) +
    (f.seguradora.length > 0 ? 1 : 0) +
    (f.produtor.length > 0 ? 1 : 0) +
    (f.tipo.length > 0 ? 1 : 0) +
    (f.status.length > 0 ? 1 : 0) +
    (f.dateRange !== 'todos' ? 1 : 0) +
    (f.premioMin || f.premioMax ? 1 : 0) +
    (f.createdFrom || f.createdTo ? 1 : 0)
  );
}

// ─── MultiSelectFilter ────────────────────────────────────────────────────────
function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  onCreateNew,
  width = 160,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
  onCreateNew?: (val: string) => void;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [newVal, setNewVal] = useState('');
  const [showNew, setShowNew] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowNew(false);
        setNewVal('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggle(val: string) {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  }

  function submitNew() {
    const v = newVal.trim();
    if (!v) return;
    if (onCreateNew) onCreateNew(v);
    onChange([...selected.filter(x => x !== v), v]);
    setNewVal('');
    setShowNew(false);
  }

  const isActive = selected.length > 0;
  const displayLabel = isActive
    ? selected.length === 1
      ? (options.find(o => o.value === selected[0])?.label || selected[0])
      : `${selected.length} selecionados`
    : 'Todos';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }} ref={ref}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width,
          height: 32,
          boxSizing: 'border-box',
          padding: '0 8px',
          background: isActive ? 'rgba(59,130,246,0.06)' : 'var(--bg-card)',
          border: `1px solid ${isActive ? 'rgba(59,130,246,0.5)' : 'var(--border)'}`,
          borderRadius: 6,
          color: isActive ? 'var(--accent-light)' : 'var(--text-secondary)',
          fontSize: 12,
          fontFamily: 'inherit',
          outline: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          textAlign: 'left',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {displayLabel}
        </span>
        {isActive && (
          <span style={{
            background: 'var(--accent)', color: '#fff',
            borderRadius: '50%', width: 16, height: 16, fontSize: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, flexShrink: 0,
          }}>{selected.length}</span>
        )}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          zIndex: 200,
          marginTop: 56,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          minWidth: width,
          maxHeight: 280,
          overflowY: 'auto',
          padding: '4px 0',
        }}>
          {options.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma opção</div>
          )}
          {options.map(opt => (
            <label
              key={opt.value}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', cursor: 'pointer', fontSize: 12,
                background: selected.includes(opt.value) ? 'rgba(59,130,246,0.08)' : 'transparent',
              }}
              onMouseEnter={e => { if (!selected.includes(opt.value)) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = selected.includes(opt.value) ? 'rgba(59,130,246,0.08)' : 'transparent'; }}
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                style={{ accentColor: 'var(--accent)', margin: 0, flexShrink: 0 }}
              />
              <span style={{ color: selected.includes(opt.value) ? 'var(--accent-light)' : 'var(--text-secondary)' }}>
                {opt.label}
              </span>
            </label>
          ))}

          {/* Criar novo */}
          {onCreateNew && !showNew && (
            <button
              type="button"
              onClick={() => setShowNew(true)}
              style={{
                width: '100%', padding: '7px 12px', background: 'transparent',
                border: 'none', borderTop: `1px solid var(--border)`,
                color: 'var(--accent)', fontSize: 12, cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              Criar novo...
            </button>
          )}
          {onCreateNew && showNew && (
            <div style={{ padding: '8px 12px', borderTop: `1px solid var(--border)`, display: 'flex', gap: 6 }}>
              <input
                autoFocus
                value={newVal}
                onChange={e => setNewVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitNew(); if (e.key === 'Escape') { setShowNew(false); setNewVal(''); } }}
                placeholder="Novo valor..."
                style={{
                  flex: 1, padding: '5px 8px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 5, color: 'var(--text-primary)', fontSize: 11,
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button
                type="button"
                onClick={submitNew}
                style={{
                  padding: '5px 10px', borderRadius: 5, border: 'none',
                  background: 'var(--accent)', color: '#fff', fontSize: 11,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Ok</button>
            </div>
          )}

          {/* Clear selection */}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              style={{
                width: '100%', padding: '7px 12px', background: 'transparent',
                border: 'none', borderTop: `1px solid var(--border)`,
                color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
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
        campanha: form.campanha || null,
        ja_possui_produto: form.ja_possui_produto,
        seguradora_atual: form.seguradora_atual || null,
        vigencia_atual_fim: form.vigencia_atual_fim || null,
        corretora_atual: form.corretora_atual || null,
        agente: form.agente || null,
        observacoes_proposta: form.observacoes_proposta || null,
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

          {/* Campanha + Agente */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL_S}>Campanha</label>
              <input value={form.campanha} onChange={field('campanha')} placeholder="Opcional" style={INPUT_S} />
            </div>
            <div>
              <label style={LABEL_S}>Agente</label>
              <input value={form.agente} onChange={field('agente')} placeholder="Opcional" style={INPUT_S} />
            </div>
          </div>

          {/* Produto Atual */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.ja_possui_produto} onChange={e => setForm(f => ({ ...f, ja_possui_produto: e.target.checked }))} style={{ accentColor: 'var(--accent)', margin: 0 }} />
              Cliente já possui o produto
            </label>
          </div>
          {form.ja_possui_produto && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, paddingLeft: 4, borderLeft: '2px solid rgba(59,130,246,0.2)' }}>
              <div>
                <label style={LABEL_S}>Seguradora Atual</label>
                <input value={form.seguradora_atual} onChange={field('seguradora_atual')} style={INPUT_S} />
              </div>
              <div>
                <label style={LABEL_S}>Vig. Atual Fim</label>
                <input type="date" value={form.vigencia_atual_fim} onChange={field('vigencia_atual_fim')} style={INPUT_S} />
              </div>
              <div>
                <label style={LABEL_S}>Corretora Atual</label>
                <input value={form.corretora_atual} onChange={field('corretora_atual')} style={INPUT_S} />
              </div>
            </div>
          )}

          <div>
            <label style={LABEL_S}>Próxima Ação</label>
            <textarea value={form.next_action} onChange={field('next_action')} rows={2} placeholder="Próxima ação ou observação..." style={{ ...INPUT_S, resize: 'vertical', minHeight: 52 }} />
          </div>

          <div>
            <label style={LABEL_S}>Data da Próxima Ação</label>
            <input type="date" value={form.next_action_date} onChange={field('next_action_date')} style={INPUT_S} />
          </div>

          <div>
            <label style={LABEL_S}>Observações da Proposta</label>
            <textarea value={form.observacoes_proposta} onChange={field('observacoes_proposta')} rows={2} placeholder="Detalhes adicionais..." style={{ ...INPUT_S, resize: 'vertical', minHeight: 52 }} />
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
  filters, onChange, onClear, users, deals, stages,
}: {
  filters: FilterState;
  onChange: (f: Partial<FilterState>) => void;
  onClear: () => void;
  users: UserOption[];
  deals: Deal[];
  stages: Stage[];
}) {
  // Extract unique options from deals
  const seguradoras = useMemo(() =>
    [...new Set(deals.map(d => d.seguradora).filter(Boolean) as string[])].sort()
      .map(s => ({ value: s, label: s })),
    [deals]);

  const produtores = useMemo(() =>
    [...new Set(deals.map(d => d.produtor).filter(Boolean) as string[])].sort()
      .map(p => ({ value: p, label: p })),
    [deals]);

  const statuses = useMemo(() =>
    [...new Set(deals.map(d => d.status_custom).filter(Boolean) as string[])].sort()
      .map(s => ({ value: s, label: s })),
    [deals]);

  const userOptions = useMemo(() =>
    users.map(u => ({ value: u.id, label: u.full_name })),
    [users]);

  const stageOptions = useMemo(() =>
    stages.map(s => ({ value: s.id, label: s.name })),
    [stages]);

  const ramoOptions = [
    { value: 'auto', label: 'Auto' },
    { value: 'vida', label: 'Vida' },
    { value: 'residencial', label: 'Residencial' },
    { value: 'empresarial', label: 'Empresarial' },
    { value: 'equipamento', label: 'Equipamento' },
    { value: 'consorcio', label: 'Consórcio' },
    { value: 'financiamento', label: 'Financiamento' },
    { value: 'rcge', label: 'RCGE' },
  ];

  const tipoOptions = [
    { value: 'prospeccao', label: 'Prospecção' },
    { value: 'renovacao', label: 'Renovação' },
    { value: 'resgate', label: 'Resgate' },
    { value: 'venda_cruzada', label: 'Venda Cruzada' },
    { value: 'endosso', label: 'Endosso' },
  ];

  // For "Criar novo" on seguradora and produtor — these are free-text fields
  // we just add them as options client-side; they become available in the list
  const [extraSeguradoras, setExtraSeguradoras] = useState<string[]>([]);
  const [extraProdutores, setExtraProdutores] = useState<string[]>([]);
  const [extraStatuses, setExtraStatuses] = useState<string[]>([]);

  const allSeguradoras = useMemo(() => {
    const all = [...seguradoras.map(s => s.value), ...extraSeguradoras];
    return [...new Set(all)].sort().map(s => ({ value: s, label: s }));
  }, [seguradoras, extraSeguradoras]);

  const allProdutores = useMemo(() => {
    const all = [...produtores.map(p => p.value), ...extraProdutores];
    return [...new Set(all)].sort().map(p => ({ value: p, label: p }));
  }, [produtores, extraProdutores]);

  const allStatuses = useMemo(() => {
    const all = [...statuses.map(s => s.value), ...extraStatuses];
    return [...new Set(all)].sort().map(s => ({ value: s, label: s }));
  }, [statuses, extraStatuses]);

  const filterInputStyle: React.CSSProperties = {
    boxSizing: 'border-box', padding: '0 8px', height: 32,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text-primary)', fontSize: 12,
    fontFamily: 'inherit', outline: 'none', minWidth: 0,
  };

  const activeFilterStyle: React.CSSProperties = {
    ...filterInputStyle,
    borderColor: 'rgba(59,130,246,0.5)',
    background: 'rgba(59,130,246,0.06)',
  };

  return (
    <div style={{
      padding: '10px 24px 14px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10,
      alignItems: 'flex-start',
      position: 'relative',
    }}>
      {/* Row 1: multi-select filters */}
      <MultiSelectFilter
        label="Responsável"
        options={userOptions}
        selected={filters.responsavel}
        onChange={vals => onChange({ responsavel: vals })}
        width={150}
      />

      <MultiSelectFilter
        label="Etapa"
        options={stageOptions}
        selected={filters.etapa}
        onChange={vals => onChange({ etapa: vals })}
        width={150}
      />

      <MultiSelectFilter
        label="Ramo"
        options={ramoOptions}
        selected={filters.ramo}
        onChange={vals => onChange({ ramo: vals })}
        width={130}
      />

      <MultiSelectFilter
        label="Seguradora"
        options={allSeguradoras}
        selected={filters.seguradora}
        onChange={vals => onChange({ seguradora: vals })}
        onCreateNew={v => setExtraSeguradoras(prev => [...new Set([...prev, v])])}
        width={150}
      />

      <MultiSelectFilter
        label="Produtor"
        options={allProdutores}
        selected={filters.produtor}
        onChange={vals => onChange({ produtor: vals })}
        onCreateNew={v => setExtraProdutores(prev => [...new Set([...prev, v])])}
        width={140}
      />

      <MultiSelectFilter
        label="Tipo"
        options={tipoOptions}
        selected={filters.tipo}
        onChange={vals => onChange({ tipo: vals })}
        width={140}
      />

      <MultiSelectFilter
        label="Status"
        options={allStatuses}
        selected={filters.status}
        onChange={vals => onChange({ status: vals })}
        onCreateNew={v => setExtraStatuses(prev => [...new Set([...prev, v])])}
        width={140}
      />

      {/* Próxima Ação date range (select) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Próxima Ação</span>
        <select
          value={filters.dateRange}
          onChange={e => onChange({ dateRange: e.target.value as FilterState['dateRange'] })}
          style={filters.dateRange !== 'todos' ? activeFilterStyle : filterInputStyle}
        >
          <option value="todos">Todas as datas</option>
          <option value="hoje">Até hoje</option>
          <option value="proximos7">Próximos 7 dias</option>
        </select>
      </div>

      {/* Prêmio range */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prêmio (R$)</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number"
            min="0"
            placeholder="Mín"
            value={filters.premioMin}
            onChange={e => onChange({ premioMin: e.target.value })}
            style={{ ...filterInputStyle, width: 70, ...(filters.premioMin ? { borderColor: 'rgba(59,130,246,0.5)', background: 'rgba(59,130,246,0.06)' } : {}) }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>–</span>
          <input
            type="number"
            min="0"
            placeholder="Máx"
            value={filters.premioMax}
            onChange={e => onChange({ premioMax: e.target.value })}
            style={{ ...filterInputStyle, width: 70, ...(filters.premioMax ? { borderColor: 'rgba(59,130,246,0.5)', background: 'rgba(59,130,246,0.06)' } : {}) }}
          />
        </div>
      </div>

      {/* Data de criação range */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Criado em</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="date"
            value={filters.createdFrom}
            onChange={e => onChange({ createdFrom: e.target.value })}
            style={{ ...filterInputStyle, width: 120, ...(filters.createdFrom ? { borderColor: 'rgba(59,130,246,0.5)', background: 'rgba(59,130,246,0.06)' } : {}) }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>–</span>
          <input
            type="date"
            value={filters.createdTo}
            onChange={e => onChange({ createdTo: e.target.value })}
            style={{ ...filterInputStyle, width: 120, ...(filters.createdTo ? { borderColor: 'rgba(59,130,246,0.5)', background: 'rgba(59,130,246,0.06)' } : {}) }}
          />
        </div>
      </div>

      {/* Clear */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: 'transparent', letterSpacing: '0.06em' }}>.</span>
        <button
          onClick={onClear}
          style={{
            height: 32, padding: '0 12px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          Limpar filtros
        </button>
      </div>
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
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  // Per-column render cap (Emitido has 4k+ deals — rendering all would freeze the DOM)
  const [visibleByStage, setVisibleByStage] = useState<Record<string, number>>({});
  const COLUMN_PAGE = 50;
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchRaw, setSearchRaw] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  // ── Sort state ────────────────────────────────────────────────────────────
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

  // Read URL query params — Fix 15: open DealPanel and switch funnel if needed
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dealParam = params.get('deal');
    const newDealParam = params.get('new_deal');
    if (dealParam) {
      setActiveDealId(dealParam);
      // Fix 15: if funnels are already loaded, switch to the correct funnel
      // If not yet loaded, we'll handle it after funnels load (see effect below)
      (window as any).__pendingDealId = dealParam;
    }
    if (newDealParam) {
      setShowNewDeal(true);
      (window as any).__prefillContactId = newDealParam;
    }
    if (dealParam || newDealParam) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Fix 15: after funnels load, resolve the pending dealId to find correct funnel
  useEffect(() => {
    const pendingDealId = (window as any).__pendingDealId;
    if (!pendingDealId || !funnels.length) return;
    delete (window as any).__pendingDealId;
    // Fetch the deal to find its funnel_id
    fetch(`/api/deals/${pendingDealId}`)
      .then(r => r.json())
      .then(d => {
        const deal = d.deal;
        if (deal?.funnel_id) {
          setActiveFunnelId(deal.funnel_id);
        }
        setActiveDealId(pendingDealId);
      })
      .catch(() => {});
  }, [funnels]);

  // Bumped when the light Corp sync finishes — re-runs the deals load below
  const [syncTick, setSyncTick] = useState(0);

  // Load deals
  useEffect(() => {
    if (!activeFunnelId) return;
    setLoading(true);
    fetch(`/api/deals?funnel_id=${activeFunnelId}`)
      .then(r => r.json())
      .then(d => { setDeals(d.deals || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeFunnelId, syncTick]);

  // Near-real-time Corp sync: fire-and-forget on board load (endpoint self-throttles
  // to 1 run / 10 min). When it actually synced, refresh the board with fresh data.
  useEffect(() => {
    fetch('/api/corp/sync-light', { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (d.synced) setSyncTick(t => t + 1); })
      .catch(() => {});
  }, []);

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
    fetch(`/api/deals?funnel_id=${activeFunnelId}`)
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

  // ── Derived: filtered + sorted deals ──────────────────────────────────────
  const filteredDeals = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    in7.setHours(23, 59, 59, 999);
    const q = searchDebounced.toLowerCase().trim();

    return deals.filter(d => {
      // Search
      if (q) {
        const name = (d.marpe_contacts?.name || '').toLowerCase();
        const title = (d.title || '').toLowerCase();
        if (!name.includes(q) && !title.includes(q)) return false;
      }

      // Fix 8+12: multi-select filters — AND logic between filter groups
      if (filters.responsavel.length > 0 && !filters.responsavel.includes(d.responsible_id || '')) return false;
      if (filters.etapa.length > 0 && !filters.etapa.includes(d.stage_id)) return false;
      if (filters.ramo.length > 0 && !filters.ramo.includes((d.ramo || '').toLowerCase())) return false;
      if (filters.seguradora.length > 0 && !filters.seguradora.includes(d.seguradora || '')) return false;
      if (filters.produtor.length > 0 && !filters.produtor.includes(d.produtor || '')) return false;
      if (filters.tipo.length > 0 && !filters.tipo.includes(d.deal_type || '')) return false;
      if (filters.status.length > 0 && !filters.status.includes(d.status_custom || '')) return false;

      // Date range filter (next_action_date)
      if (filters.dateRange !== 'todos') {
        if (!d.next_action_date) return false;
        const dt = new Date(d.next_action_date);
        if (filters.dateRange === 'hoje' && dt > today) return false;
        if (filters.dateRange === 'proximos7' && (dt < new Date() || dt > in7)) return false;
      }

      // Fix 12: Prêmio range
      if (filters.premioMin !== '') {
        const min = parseFloat(filters.premioMin);
        if (!isNaN(min) && (d.premio || 0) < min) return false;
      }
      if (filters.premioMax !== '') {
        const max = parseFloat(filters.premioMax);
        if (!isNaN(max) && (d.premio || 0) > max) return false;
      }

      // Fix 12: Created date range
      if (filters.createdFrom && d.created_at) {
        if (d.created_at.slice(0, 10) < filters.createdFrom) return false;
      }
      if (filters.createdTo && d.created_at) {
        if (d.created_at.slice(0, 10) > filters.createdTo) return false;
      }

      return true;
    });
  }, [deals, searchDebounced, filters]);

  // Deals sorted by next_action_date for Kanban
  const sortByNextAction = useCallback((arr: Deal[]) =>
    [...arr].sort((a, b) => {
      if (!a.next_action_date && !b.next_action_date) return 0;
      if (!a.next_action_date) return 1;
      if (!b.next_action_date) return -1;
      return a.next_action_date.localeCompare(b.next_action_date);
    }), []);

  const dealsByStage = (stageId: string) =>
    sortByNextAction(filteredDeals.filter(d => d.stage_id === stageId));

  // Grade sorted deals (toggleable)
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

  // ── Kanban column height for Fix 9 ────────────────────────────────────────
  // The column wrapper needs a defined height for overflow-y: auto to work.
  // We compute available height via CSS: topbar (56px) + filterbar (variable).
  // Using flex layout: column wrapper is flex-col with flex:1 and overflow:hidden,
  // so each stage column gets full height and DroppableColumn can scroll.

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

          {/* Search input */}
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

          {/* Result count */}
          {!isMobile && isFiltering && (
            <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {filteredDeals.length} resultado{filteredDeals.length !== 1 ? 's' : ''}
            </span>
          )}
          {!isMobile && !isFiltering && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{deals.length} negócios</span>
          )}

          <div style={{ marginLeft: isMobile ? 0 : 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Filtros toggle */}
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

        {/* ── Fix 19: Color legend for ramo tags ─────────────────────────── */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Ramo:</span>
            {Object.entries(RAMO_COLORS).map(([ramo, { color }]) => (
              <span key={ramo} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                {ramo}
              </span>
            ))}
          </div>
        )}

        {/* ── Filter bar ─────────────────────────────────────────────────── */}
        {showFilters && (
          <FilterBar
            filters={filters}
            onChange={updateFilters}
            onClear={clearFilters}
            users={users}
            deals={deals}
            stages={stages}
          />
        )}

        {/* ── Mobile result count ─────────────────────────────────────────── */}
        {isMobile && isFiltering && (
          <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--accent)', borderBottom: '1px solid var(--border)' }}>
            {filteredDeals.length} resultado{filteredDeals.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>Carregando negócios...</div>
        ) : viewMode === 'kanban' ? (
          /* ── Kanban with drag-and-drop ────────────────────────────────── */
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {/* Fix 9: flex:1 + overflow:hidden lets each column control its own scroll */}
            <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: 20, display: 'flex', gap: 14, minHeight: 0 }}>
              {stages.map(stage => {
                const stageDeals = dealsByStage(stage.id);
                const sum = stageDeals.reduce((a, d) => a + (d.premio || 0), 0);
                return (
                  /* Fix 9: column wrapper is flex-col with overflow:hidden.
                     Header is fixed (flexShrink:0), DroppableColumn handles scrolling. */
                  <div key={stage.id} style={{ minWidth: 280, maxWidth: 280, display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0, height: '100%' }}>
                    {/* Fix 9: Sticky column header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px 10px', flexShrink: 0, borderBottom: `2px solid ${stage.color}22`, marginBottom: 2 }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: stage.color, flexShrink: 0, boxShadow: `0 0 6px ${stage.color}88` }} />
                      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{stage.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1px 8px', borderRadius: 99, marginLeft: 'auto' }}>{stageDeals.length}</span>
                      {sum > 0 && <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700 }}>{formatPremio(sum)}</span>}
                    </div>
                    {/* Fix 9: scrollable area */}
                    <DroppableColumn id={stage.id}>
                      {stageDeals.slice(0, visibleByStage[stage.id] || COLUMN_PAGE).map(d => {
                        const r = RAMO_COLORS[d.ramo?.toLowerCase() || ''] || { bg: 'var(--border)', color: 'var(--text-muted)' };
                        const urgency = nextActionUrgency(d.next_action_date);
                        return (
                          <DraggableCard key={d.id} id={d.id}>
                            <div
                              onClick={() => setActiveDealId(d.id)}
                              onMouseEnter={() => setHoveredCardId(d.id)}
                              onMouseLeave={() => setHoveredCardId(null)}
                              style={{
                                background: activeDealId === d.id ? 'rgba(59,130,246,0.06)' : hoveredCardId === d.id ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                                border: `1px solid ${activeDealId === d.id ? 'rgba(59,130,246,0.3)' : hoveredCardId === d.id ? 'var(--border-accent)' : 'var(--border)'}`,
                                borderLeft: `3px solid ${r.color}`,
                                borderRadius: 10,
                                padding: 14,
                                cursor: 'grab',
                                boxShadow: activeDealId === d.id ? 'var(--shadow-accent)' : hoveredCardId === d.id ? 'var(--shadow-sm)' : 'none',
                                transform: hoveredCardId === d.id && activeDealId !== d.id ? 'translateY(-1px)' : 'translateY(0)',
                                transition: 'background 0.15s var(--ease), border-color 0.15s var(--ease), box-shadow 0.15s var(--ease), transform 0.15s var(--ease)',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                  {d.marpe_contacts?.name || d.title}
                                </span>
                                {d.ramo && (
                                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 100, textTransform: 'uppercase', background: r.bg, color: r.color, flexShrink: 0 }}>
                                    {d.ramo}
                                  </span>
                                )}
                              </div>
                              {d.seguradora && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{d.seguradora}</div>}
                              {/* Status badge — neutral, no colors (client request: cores no status não agregam) */}
                              {d.status_custom && (
                                <div style={{ marginBottom: 6 }}>
                                  <span style={{
                                    fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 100,
                                    background: 'rgba(255,255,255,0.06)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border)',
                                    display: 'inline-block',
                                  }}>
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
                      {stageDeals.length > (visibleByStage[stage.id] || COLUMN_PAGE) && (
                        <button
                          onClick={() => setVisibleByStage(v => ({ ...v, [stage.id]: (v[stage.id] || COLUMN_PAGE) + 100 }))}
                          style={{
                            fontSize: 11, color: 'var(--accent-light)', textAlign: 'center', padding: '8px 12px',
                            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                            cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                          }}
                        >
                          Mostrar mais ({stageDeals.length - (visibleByStage[stage.id] || COLUMN_PAGE)} restantes)
                        </button>
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
          /* ── Grade view ───────────────────────────────────────────────── */
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
                      <td style={{
                        padding: '8px 12px', border: '1px solid var(--border)',
                        color: 'var(--text-primary)', fontWeight: 500, fontSize: 13,
                        maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        ...(isMobile ? { position: 'sticky', left: 0, background: 'var(--bg-primary)', zIndex: 1 } : {}),
                      }}>
                        {d.marpe_contacts?.name || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {d.ramo
                          ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: r.bg, color: r.color, textTransform: 'uppercase' }}>{d.ramo}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', color: 'var(--text-secondary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.seguradora || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {formatPremio(d.premio)}
                      </td>
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.produtor || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {d.deal_type
                          ? <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{DEAL_TYPE_LABELS[d.deal_type] || d.deal_type}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {d.status_custom
                          ? <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 100, background: d.status_color ? `${d.status_color}22` : 'rgba(255,255,255,0.06)', color: d.status_color || 'var(--text-muted)', border: `1px solid ${d.status_color ? `${d.status_color}44` : 'var(--border)'}` }}>{d.status_custom}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {d.next_action_date
                          ? <span style={{ fontSize: 12, ...urgency }}>{formatDate(d.next_action_date)}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(d.vigencia_fim)}
                      </td>
                      <td style={{ padding: '8px 12px', border: '1px solid var(--border)', color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.marpe_profiles?.full_name || '—'}
                      </td>
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
