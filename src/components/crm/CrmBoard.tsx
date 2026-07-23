import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DndContext, DragOverlay, useDroppable, useDraggable, PointerSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import DealPanel from './DealPanel';
import NewContactModal from './NewContactModal';
import { clampPct } from '../../lib/masks';

// ─── Shared input styles ──────────────────────────────────────────────────────
const INPUT_S: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 11px',
  background: 'var(--field-bg)', border: '1px solid var(--hairline)',
  borderRadius: 10, color: 'var(--text-primary)', fontSize: 13,
  fontFamily: 'inherit', outline: 'none',
  transition: 'border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out)',
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
        gap: 9,
        background: isOver ? 'var(--accent-dim)' : 'transparent',
        boxShadow: isOver ? 'inset 0 0 0 1px rgba(59,130,246,0.35), 0 0 24px var(--accent-dim)' : 'none',
        borderRadius: 12,
        transition: 'background 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out)',
        padding: '2px 2px 8px',
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

// ─── Card helpers (checkpoint 10/07, item 1 — padrão waSpeed) ─────────────────
const AVATAR_COLORS = ['#60A5FA', '#4ade80', '#fbbf24', '#a78bfa', '#22d3ee', '#f87171', '#fb923c'];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function cardInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function CardAvatar({ contact }: { contact: { name: string; photo_url?: string | null } | null }) {
  const name = contact?.name || '?';
  return (
    <div style={{
      position: 'relative', width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
      overflow: 'hidden', background: 'var(--field-bg)', border: '1px solid var(--hairline)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 8.5, fontWeight: 700, color: avatarColor(name),
    }}>
      {cardInitials(name)}
      {contact?.photo_url && (
        <img
          src={contact.photo_url}
          alt=""
          loading="lazy"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
    </div>
  );
}

function QuickAction({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={e => { e.stopPropagation(); onClick(); }}
      onPointerDown={e => e.stopPropagation()}
      style={{
        width: 26, height: 24, borderRadius: 7, border: '1px solid transparent',
        background: 'transparent', color: 'var(--text-muted)', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.18s var(--ease-out)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--field-bg)'; e.currentTarget.style.color = 'var(--accent-light)'; e.currentTarget.style.borderColor = 'var(--hairline)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'transparent'; }}
    >
      {children}
    </button>
  );
}

const QA_ICON: React.CSSProperties = { width: 13, height: 13 };

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
  marpe_contacts: { id: string; name: string; phone: string | null; photo_url?: string | null } | null;
  marpe_funnel_stages: { id: string; name: string; color: string } | null;
  marpe_profiles: { id: string; full_name: string } | null;
}
interface UserOption { id: string; full_name: string; email: string; }
interface ContactOption { id: string; name: string; phone: string | null; }
interface CurrentUser { id: string; full_name: string; }

interface NewDealForm {
  contact_id: string;
  ramo: string; seguradora: string; deal_type: string;
  premio: string; comissao_pct: string; pct_repasse: string;
  comissao_valor: string; valor_repasse: string;
  next_action: string; next_action_date: string;
  // New fields
  campanha: string; ja_possui_produto: boolean;
  seguradora_atual: string; vigencia_atual_fim: string; corretora_atual: string;
  agente: string; produtor: string; observacoes_proposta: string;
  base_calculo_repasse: string;
}
const EMPTY_FORM: NewDealForm = {
  contact_id: '', ramo: '', seguradora: '', deal_type: 'prospeccao',
  premio: '', comissao_pct: '', pct_repasse: '',
  comissao_valor: '', valor_repasse: '',
  next_action: '', next_action_date: '',
  campanha: '', ja_possui_produto: false,
  seguradora_atual: '', vigencia_atual_fim: '', corretora_atual: '',
  agente: '', produtor: '', observacoes_proposta: '',
  base_calculo_repasse: '5',
};

// Pick-lists integradas ao Corp (GET /api/corp/lookups). Fallback: listas fixas
// abaixo mantêm o modal funcional se a API Corp estiver fora.
interface CorpLookups {
  ramos: { codigo: number; nome: string }[];
  seguradoras: { codigo: number; nome: string }[];
  produtores: { codigo: number; nome: string }[];
  agentes: { codigo: number; nome: string }[];
  campanhas: string[];
  /** Códigos de campanha vistos nos negócios sincronizados — a CorpAPI não expõe os nomes */
  campanhas_cod?: number[];
  /** Códigos de base de cálculo do repasse (campo_base_r) — 5 é o default do Corp */
  bases_repasse?: number[];
  tipos: { codigo: number; nome: string; deal_type: string }[];
}
const FALLBACK_RAMOS = ['auto', 'vida', 'residencial', 'empresarial', 'equipamento', 'consorcio', 'financiamento', 'rcge'];

// ─── Filter state ─────────────────────────────────────────────────────────────
interface FilterState {
  responsavel: string[];
  etapa: string[];
  ramo: string[];
  seguradora: string[];
  produtor: string[];
  tipo: string[];
  status: string[];
  // Presets do filtro "Próxima Ação" do Corp (issue #20):
  // Todas / Hoje / Esta Semana / Este Mês / Próximos / Atraso de N dias / Personalizado
  dateRange: 'todos' | 'hoje' | 'semana' | 'mes' | 'proximos' | 'atraso' | 'custom';
  atrasoDias: string;
  proxFrom: string;
  proxTo: string;
  premioMin: string;
  premioMax: string;
  createdFrom: string;
  createdTo: string;
}
const EMPTY_FILTERS: FilterState = {
  responsavel: [], etapa: [], ramo: [], seguradora: [], produtor: [], tipo: [], status: [],
  dateRange: 'todos', atrasoDias: '7', proxFrom: '', proxTo: '',
  premioMin: '', premioMax: '', createdFrom: '', createdTo: '',
};

// Data LOCAL em yyyy-mm-dd. toISOString() é UTC: no Brasil (UTC-3) o dia virava
// às 21h locais e o preset "Hoje" zerava à noite (issue #34).
function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
          background: isActive ? 'var(--accent-dim)' : 'var(--field-bg)',
          border: `1px solid ${isActive ? 'rgba(59,130,246,0.5)' : 'var(--hairline)'}`,
          borderRadius: 9,
          transition: 'border-color 0.2s var(--ease-out), background 0.2s var(--ease-out)',
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
        <div className="glass-modal fade-in" style={{
          position: 'absolute',
          zIndex: 200,
          marginTop: 56,
          borderRadius: 12,
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

// ─── NewSinistroModal (S4.1, issue #27) ──────────────────────────────────────
// Registro manual de sinistro no funil Sinistros. Não grava no Corp (a CorpAPI
// não tem rota de escrita de sinistro confirmada) — skip_corp evita o dual-write.
// A apólice vem dos deals doc_% do contato selecionado (sync de apólices).
function NewSinistroModal({ funnels, activeFunnelId, onClose, onCreated }: {
  funnels: Funnel[]; activeFunnelId: string; onClose: () => void; onCreated: () => void;
}) {
  const [contactSearch, setContactSearch] = useState('');
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [contactId, setContactId] = useState('');
  const [contactName, setContactName] = useState('');
  const [apolices, setApolices] = useState<{ id: string; apolice: string | null; ramo: string | null; seguradora: string | null }[]>([]);
  const [form, setForm] = useState({ apoliceIdx: '', numsin: '', descricao: '', next_action: '', next_action_date: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const firstStageId = funnels.find(f => f.id === activeFunnelId)?.stages
    ?.slice().sort((a, b) => a.sort_order - b.sort_order).find(s => !s.is_terminal)?.id || '';

  useEffect(() => {
    if (contactSearch.length < 2 || contactId) { setContactOptions([]); setShowDropdown(false); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetch(`/api/contacts/search?search=${encodeURIComponent(contactSearch)}&limit=15`)
        .then(r => r.json())
        .then(d => { setContactOptions(d.contacts || []); setShowDropdown(true); })
        .catch(() => {});
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [contactSearch, contactId]);

  async function pickContact(c: ContactOption) {
    setContactId(c.id);
    setContactName(c.name);
    setContactSearch(c.name);
    setShowDropdown(false);
    // Apólices emitidas do contato (deals doc_% via consulta do sync)
    try {
      const r = await fetch(`/api/contacts/${c.id}`);
      const d = await r.json();
      const docs = (d.deals || []).filter((dl: any) => dl.corp_id?.startsWith('doc_'));
      setApolices(docs.map((dl: any) => ({ id: dl.id, apolice: dl.apolice, ramo: dl.ramo, seguradora: dl.seguradora })));
    } catch { setApolices([]); }
  }

  async function handleSubmit() {
    setError('');
    if (!contactId) { setError('Selecione o contato/segurado.'); return; }
    if (!activeFunnelId || !firstStageId) { setError('Funil Sinistros sem etapas.'); return; }
    setSubmitting(true);
    const ap = form.apoliceIdx !== '' ? apolices[parseInt(form.apoliceIdx)] : null;
    const res = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skip_corp: true,
        contact_id: contactId,
        funnel_id: activeFunnelId,
        stage_id: firstStageId,
        title: `SINISTRO ${ap?.ramo?.toUpperCase() || ''} — ${contactName}`.trim(),
        ramo: ap?.ramo || null,
        seguradora: ap?.seguradora || null,
        apolice: ap?.apolice || null,
        next_action: form.next_action || 'Acompanhar sinistro',
        next_action_date: form.next_action_date || null,
        observacoes_proposta: form.descricao || null,
        detalhes_corp: { numsin: form.numsin || null, situacao: 'ABERTO', descricao: form.descricao || null, registrado_no_crm: true },
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || 'Erro ao registrar sinistro.'); return; }
    onCreated();
    onClose();
  }

  return (
    <div className="overlay-glass" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-modal modal-pop" style={{ borderRadius: 'var(--radius-xl)', width: 470, maxWidth: 'calc(100vw - 32px)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>Registrar Sinistro</span>
          <button onClick={onClose} aria-label="Fechar" style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ position: 'relative' }}>
            <label style={LABEL_S}>Segurado *</label>
            <input value={contactSearch}
              onChange={e => { setContactSearch(e.target.value); setContactId(''); }}
              placeholder="Buscar contato..." style={INPUT_S} />
            {showDropdown && contactOptions.length > 0 && (
              <div className="glass-modal" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, borderRadius: 12, maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                {contactOptions.map(c => (
                  <div key={c.id} onClick={() => pickContact(c)}
                    style={{ padding: '8px 13px', cursor: 'pointer', fontSize: 13, transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {c.name}{c.phone ? <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> · {c.phone}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={LABEL_S}>Apólice</label>
            <select value={form.apoliceIdx} onChange={e => setForm(f => ({ ...f, apoliceIdx: e.target.value }))} disabled={!contactId} style={{ ...INPUT_S, cursor: 'pointer', opacity: contactId ? 1 : 0.6 }}>
              <option value="">{contactId ? (apolices.length ? '— Selecione a apólice —' : 'Sem apólices sincronizadas') : 'Selecione o segurado primeiro'}</option>
              {apolices.map((a, i) => (
                <option key={a.id} value={String(i)}>{(a.ramo || '').toUpperCase()} · {a.seguradora || '—'} · {a.apolice || 'sem número'}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={LABEL_S}>Número do Sinistro</label>
            <input value={form.numsin} onChange={e => setForm(f => ({ ...f, numsin: e.target.value }))} placeholder="Ex: 22806374" style={INPUT_S} />
          </div>
          <div>
            <label style={LABEL_S}>Descrição da Ocorrência</label>
            <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} placeholder="O que aconteceu..." style={{ ...INPUT_S, resize: 'vertical', minHeight: 60 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL_S}>Próxima Ação</label>
              <input value={form.next_action} onChange={e => setForm(f => ({ ...f, next_action: e.target.value }))} placeholder="Acompanhar sinistro" style={INPUT_S} />
            </div>
            <div>
              <label style={LABEL_S}>Data</label>
              <input type="date" value={form.next_action_date} onChange={e => setForm(f => ({ ...f, next_action_date: e.target.value }))} style={INPUT_S} />
            </div>
          </div>
          {error && (
            <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
          )}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--hairline)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Cancelar</button>
          <button type="button" onClick={handleSubmit} disabled={submitting || !contactId}
            style={{ padding: '8px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: (!submitting && contactId) ? 'linear-gradient(180deg, #4F8FF7, #2E6BE6)' : 'rgba(59,130,246,0.25)', color: (!submitting && contactId) ? '#fff' : 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: (!submitting && contactId) ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            {submitting ? 'Registrando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NewDealModal ─────────────────────────────────────────────────────────────
function NewDealModal({ funnels, activeFunnelId, onClose, onCreated, currentUser }: {
  funnels: Funnel[]; activeFunnelId: string;
  onClose: () => void; onCreated: () => void;
  currentUser?: CurrentUser;
}) {
  const [form, setForm] = useState<NewDealForm>(EMPTY_FORM);
  const [contactSearch, setContactSearch] = useState('');
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lookups, setLookups] = useState<CorpLookups | null>(null);
  // Campanha: '' | 'nome:X' | 'cod:16' | '__livre' (texto em form.campanha)
  const [campanhaChoice, setCampanhaChoice] = useState('');
  // Vr. Comissão/Vr. Repasse: auto-calcula de Prêmio × % até o usuário digitar
  // manualmente no campo (issue #14)
  const valorEdited = useRef({ comissao: false, repasse: false });
  useEffect(() => {
    const premio = parseFloat(form.premio);
    if (isNaN(premio)) return;
    setForm(f => {
      const next = { ...f };
      const pc = parseFloat(f.comissao_pct);
      if (!valorEdited.current.comissao && !isNaN(pc)) next.comissao_valor = (premio * pc / 100).toFixed(2);
      const pr = parseFloat(f.pct_repasse);
      if (!valorEdited.current.repasse && !isNaN(pr)) next.valor_repasse = (premio * pr / 100).toFixed(2);
      return next;
    });
  }, [form.premio, form.comissao_pct, form.pct_repasse]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Pick-lists do Corp (seguradoras/ramos/produtores/agentes + campanhas sincronizadas)
  useEffect(() => {
    fetch('/api/corp/lookups')
      .then(r => r.json())
      .then(d => setLookups(d))
      .catch(() => {});
  }, []);

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
    // Códigos Corp derivados das seleções — usados pelo dual-write quando ativo
    const corpRamo = lookups?.ramos.find(r => r.nome.toLowerCase() === form.ramo);
    const corpCia = lookups?.seguradoras.find(s => s.nome === form.seguradora);
    const corpTipo = lookups?.tipos.find(t => t.deal_type === form.deal_type);
    // Campanha: código round-tripa para o Corp; texto livre fica só no CRM
    let campanhaLabel: string | null = null;
    let corpCodcamp: number | null = null;
    if (campanhaChoice.startsWith('cod:')) {
      corpCodcamp = parseInt(campanhaChoice.slice(4));
      campanhaLabel = `Campanha ${corpCodcamp}`;
    } else if (campanhaChoice.startsWith('nome:')) {
      campanhaLabel = campanhaChoice.slice(5);
    } else if (campanhaChoice === '__livre') {
      campanhaLabel = form.campanha.trim() || null;
    }
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
        pct_repasse: form.pct_repasse ? parseFloat(form.pct_repasse) : null,
        comissao_valor: form.comissao_valor ? parseFloat(form.comissao_valor) : null,
        valor_repasse: form.valor_repasse ? parseFloat(form.valor_repasse) : null,
        next_action: form.next_action || null,
        next_action_date: form.next_action_date || null,
        campanha: campanhaLabel,
        corp_codcamp: corpCodcamp,
        base_calculo_repasse: form.base_calculo_repasse ? parseInt(form.base_calculo_repasse) : null,
        ja_possui_produto: form.ja_possui_produto,
        seguradora_atual: form.seguradora_atual || null,
        vigencia_atual_fim: form.vigencia_atual_fim || null,
        corretora_atual: form.corretora_atual || null,
        agente: form.agente || null,
        produtor: form.produtor || null,
        observacoes_proposta: form.observacoes_proposta || null,
        corp_codram: corpRamo?.codigo || null,
        corp_codcia: corpCia?.codigo || null,
        corp_tipo: corpTipo?.codigo || null,
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
      className="overlay-glass"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-modal modal-pop" style={{
        borderRadius: 'var(--radius-xl)', width: 520, maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>Novo Negócio</span>
          <button onClick={onClose} aria-label="Fechar" style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.2s var(--ease-out)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
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
                <div className="glass-modal fade-in" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, borderRadius: 12, marginTop: 6, maxHeight: 200, overflowY: 'auto' }}>
                  {contactOptions.map(c => (
                    <div
                      key={c.id}
                      onMouseDown={() => selectContact(c)}
                      style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s var(--ease-out)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</div>
                      {c.phone && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{c.phone}</div>}
                    </div>
                  ))}
                </div>
              )}
              {showDropdown && contactOptions.length === 0 && !contactLoading && (
                <div className="glass-modal fade-in" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, borderRadius: 12, marginTop: 6, padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
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
                {lookups?.ramos.length
                  ? lookups.ramos.map(r => <option key={r.codigo} value={r.nome.toLowerCase()}>{r.nome}</option>)
                  : FALLBACK_RAMOS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
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
            {/* SEMPRE select (issue #13): antes, falha/demora do /api/corp/lookups
                degradava silenciosamente para texto livre — foi o que o cliente viu.
                Agora: carregando → select desabilitado; o endpoint tem cache
                persistente, então lista vazia é caso extremo. */}
            <select
              value={form.seguradora}
              onChange={field('seguradora')}
              disabled={lookups === null}
              style={{ ...INPUT_S, cursor: lookups === null ? 'wait' : 'pointer', opacity: lookups === null ? 0.7 : 1 }}
            >
              <option value="">{lookups === null ? 'Carregando seguradoras…' : '— Selecione —'}</option>
              {(lookups?.seguradoras || []).map(s => <option key={s.codigo} value={s.nome}>{s.nome}</option>)}
              {form.seguradora && lookups && !lookups.seguradoras.some(s => s.nome === form.seguradora) && (
                <option value={form.seguradora}>{form.seguradora} (atual)</option>
              )}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL_S}>Prêmio (R$)</label>
              <input type="number" min="0" step="0.01" value={form.premio} onChange={field('premio')} placeholder="0,00" style={INPUT_S} />
            </div>
            <div>
              <label style={LABEL_S}>Comissão %</label>
              <input type="number" min="0" max="100" step="0.1" value={form.comissao_pct} onChange={field('comissao_pct')} onBlur={e => setForm(f => ({ ...f, comissao_pct: clampPct(e.target.value) }))} placeholder="0,0" style={INPUT_S} />
            </div>
            {/* Vr. Comissão / Vr. Repasse (issue #14): auto-calculados de Prêmio × %,
                editáveis para override; sincronizados com o Corp no dual-write */}
            <div>
              <label style={LABEL_S}>Vr. Comissão (R$)</label>
              <input type="number" min="0" step="0.01" value={form.comissao_valor} onChange={e => { valorEdited.current.comissao = true; field('comissao_valor')(e); }} placeholder="auto" style={INPUT_S} />
            </div>
            <div>
              <label style={LABEL_S}>Repasse %</label>
              <input type="number" min="0" max="100" step="0.1" value={form.pct_repasse} onChange={field('pct_repasse')} onBlur={e => setForm(f => ({ ...f, pct_repasse: clampPct(e.target.value) }))} placeholder="0,0" style={INPUT_S} />
            </div>
            <div>
              <label style={LABEL_S}>Vr. Repasse (R$)</label>
              <input type="number" min="0" step="0.01" value={form.valor_repasse} onChange={e => { valorEdited.current.repasse = true; field('valor_repasse')(e); }} placeholder="auto" style={INPUT_S} />
            </div>
            <div>
              <label style={LABEL_S}>Base de Cálc. Repasse</label>
              <select value={form.base_calculo_repasse} onChange={field('base_calculo_repasse')} style={{ ...INPUT_S, cursor: 'pointer' }}>
                <option value="">—</option>
                {(lookups?.bases_repasse || [5]).map(b => (
                  <option key={b} value={String(b)}>{b === 5 ? 'Com. Corretora (padrão)' : `Código ${b}`}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Campanha + Produtor + Agente */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL_S}>Campanha</label>
              <select value={campanhaChoice} onChange={e => setCampanhaChoice(e.target.value)} style={{ ...INPUT_S, cursor: 'pointer' }}>
                <option value="">—</option>
                {(lookups?.campanhas || []).map(c => <option key={`n${c}`} value={`nome:${c}`}>{c}</option>)}
                {(lookups?.campanhas_cod || []).map(c => <option key={`c${c}`} value={`cod:${c}`}>Campanha {c} (Corp)</option>)}
                <option value="__livre">Outra (digitar)...</option>
              </select>
              {campanhaChoice === '__livre' && (
                <input value={form.campanha} onChange={field('campanha')} placeholder="Nome da campanha" autoFocus style={{ ...INPUT_S, marginTop: 6 }} />
              )}
            </div>
            <div>
              <label style={LABEL_S}>Produtor</label>
              <select value={form.produtor} onChange={field('produtor')} disabled={lookups === null} style={{ ...INPUT_S, cursor: lookups === null ? 'wait' : 'pointer', opacity: lookups === null ? 0.7 : 1 }}>
                <option value="">{lookups === null ? 'Carregando…' : '—'}</option>
                {(lookups?.produtores || []).map(p => <option key={p.codigo} value={p.nome}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL_S}>Agente</label>
              <select value={form.agente} onChange={field('agente')} disabled={lookups === null} style={{ ...INPUT_S, cursor: lookups === null ? 'wait' : 'pointer', opacity: lookups === null ? 0.7 : 1 }}>
                <option value="">{lookups === null ? 'Carregando…' : '—'}</option>
                {(lookups?.agentes || []).map(a => <option key={a.codigo} value={a.nome}>{a.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Responsável — o usuário logado é o responsável pelo negócio (checkpoint 14/07) */}
          <div>
            <label style={LABEL_S}>Responsável</label>
            <input value={currentUser?.full_name || '—'} disabled readOnly style={{ ...INPUT_S, opacity: 0.75, cursor: 'default' }} />
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

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--hairline)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, transition: 'all 0.2s var(--ease-out)' }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={!canSubmit}
            style={{
              padding: '8px 20px', borderRadius: 10,
              border: canSubmit ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
              background: canSubmit ? 'linear-gradient(180deg, #4F8FF7, #2E6BE6)' : 'rgba(59,130,246,0.25)',
              boxShadow: canSubmit ? '0 3px 14px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.28)' : 'none',
              color: canSubmit ? '#fff' : 'var(--text-muted)', fontSize: 13, fontWeight: 600,
              cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              transition: 'all 0.22s var(--ease-out)',
            }}
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
        padding: '7px 14px', borderRadius: 10, height: 34,
        border: '1px solid var(--hairline)', background: 'var(--field-bg)',
        color: funnelId ? 'var(--text-secondary)' : 'var(--text-muted)',
        fontSize: 12, cursor: funnelId ? 'pointer' : 'not-allowed',
        fontFamily: 'inherit', fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 6,
        opacity: funnelId ? 1 : 0.5,
        transition: 'all 0.2s var(--ease-out)',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M6.5 1v8M3.5 6l3 3 3-3M1.5 11h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Exportar
    </button>
  );
}

// Polish 23/07: canonicaliza seguradora — o sync de documentos grava a ABREVIAÇÃO
// ("ALLI") e o detail de negócios grava o NOME ("ALLIANZ SEGUROS"), o que duplicava
// o filtro. Resolve pela tabela de seguradoras do Corp (abreviatura → nome).
function buildSeguradoraCanon(lookups: CorpFilterLookups | null): (v: string) => string {
  const map = new Map<string, string>();
  for (const s of lookups?.seguradoras || []) {
    if (s.abreviatura) map.set(s.abreviatura.trim().toUpperCase(), s.nome);
    map.set(s.nome.trim().toUpperCase(), s.nome);
  }
  return (v: string) => map.get((v || '').trim().toUpperCase()) || v;
}

interface CorpFilterLookups {
  ramos?: { codigo: number; nome: string; abreviatura?: string }[];
  seguradoras?: { codigo: number; nome: string; abreviatura?: string }[];
}

// ─── FilterBar ────────────────────────────────────────────────────────────────
function FilterBar({
  filters, onChange, onClear, users, deals, stages, corpLookups,
}: {
  filters: FilterState;
  onChange: (f: Partial<FilterState>) => void;
  onClear: () => void;
  users: UserOption[];
  deals: Deal[];
  stages: Stage[];
  corpLookups: CorpFilterLookups | null;
}) {
  // Extract unique options from deals — seguradoras canônicas (sem duplicata
  // abreviação × nome completo)
  const canonSeg = useMemo(() => buildSeguradoraCanon(corpLookups), [corpLookups]);
  const seguradoras = useMemo(() =>
    [...new Set(deals.map(d => canonSeg(d.seguradora || '')).filter(Boolean) as string[])].sort()
      .map(s => ({ value: s, label: s })),
    [deals, canonSeg]);

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

  // Polish 23/07: opções vêm dos valores REAIS dos negócios (27 ramos no banco —
  // a lista fixa de 8 usava valores que nem batiam com o formato do sync, ex.
  // "empresarial" vs "empr") com rótulo resolvido pela tabela de ramos do Corp.
  const ramoOptions = useMemo(() => {
    const label = (v: string) => {
      const hit = (corpLookups?.ramos || []).find(r =>
        (r.abreviatura || '').toLowerCase() === v || r.nome.toLowerCase() === v);
      return hit ? hit.nome : v.toUpperCase();
    };
    return [...new Set(deals.map(d => (d.ramo || '').toLowerCase()).filter(Boolean))]
      .map(v => ({ value: v, label: label(v) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [deals, corpLookups]);

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
    background: 'var(--field-bg)', border: '1px solid var(--hairline)',
    borderRadius: 9, color: 'var(--text-primary)', fontSize: 12,
    fontFamily: 'inherit', outline: 'none', minWidth: 0,
    transition: 'border-color 0.2s var(--ease-out), background 0.2s var(--ease-out)',
  };

  const activeFilterStyle: React.CSSProperties = {
    ...filterInputStyle,
    borderColor: 'rgba(59,130,246,0.5)',
    background: 'var(--accent-dim)',
  };

  return (
    <div className="glass-panel fade-in" style={{
      margin: '8px 16px 0',
      padding: '10px 16px 14px',
      borderRadius: 'var(--radius-md)',
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10,
      alignItems: 'flex-start',
      position: 'relative',
      zIndex: 20,
      flexShrink: 0,
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

      {/* Próxima Ação — presets do Corp (issue #20) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Próxima Ação</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select
            value={filters.dateRange}
            onChange={e => onChange({ dateRange: e.target.value as FilterState['dateRange'] })}
            style={filters.dateRange !== 'todos' ? activeFilterStyle : filterInputStyle}
          >
            <option value="todos">Todas</option>
            <option value="hoje">Hoje</option>
            <option value="semana">Esta Semana</option>
            <option value="mes">Este Mês</option>
            <option value="proximos">Próximos</option>
            <option value="atraso">Atraso de</option>
            <option value="custom">Personalizado</option>
          </select>
          {filters.dateRange === 'atraso' && (
            <>
              <input type="number" min="1" value={filters.atrasoDias} onChange={e => onChange({ atrasoDias: e.target.value })} style={{ ...filterInputStyle, width: 52 }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>dias+</span>
            </>
          )}
          {filters.dateRange === 'custom' && (
            <>
              <input type="date" value={filters.proxFrom} onChange={e => onChange({ proxFrom: e.target.value })} style={{ ...filterInputStyle, width: 118 }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>a</span>
              <input type="date" value={filters.proxTo} onChange={e => onChange({ proxTo: e.target.value })} style={{ ...filterInputStyle, width: 118 }} />
            </>
          )}
        </div>
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
export default function CrmBoard({ currentUser }: { currentUser?: CurrentUser }) {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [activeFunnelId, setActiveFunnelId] = useState('');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  // Aba inicial do painel quando aberto pelos ícones de acesso rápido do card
  const [activeDealTab, setActiveDealTab] = useState<'conversas' | 'anotacoes' | 'documentos' | undefined>(undefined);

  function openDeal(id: string, tab?: 'conversas' | 'anotacoes' | 'documentos') {
    setActiveDealTab(tab);
    setActiveDealId(id);
  }
  // Per-column render cap (Emitido has 4k+ deals — rendering all would freeze the DOM)
  const [visibleByStage, setVisibleByStage] = useState<Record<string, number>>({});
  const COLUMN_PAGE = 50;
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [contactToast, setContactToast] = useState<{ msg: string; warnings: string[] } | null>(null);
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

  // ── Janela de recência (checkpoint 10/07 item 11; v2 no checkpoint 14/07) ──
  // Por padrão o board mostra só negócios com atividade nos últimos 12 meses.
  // v2: created_at NÃO conta — nos deals sincronizados é a data do INSERT do
  // sync (todos recentes), o que tornava a janela inócua. Critério: próxima
  // ação; senão fim de vigência; sem datas → sempre visível.
  const RECENCY_MONTHS = 12;
  const [showOld, setShowOld] = useState(false);
  const recencyCutoff = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - RECENCY_MONTHS);
    return d.toISOString().slice(0, 10);
  }, []);
  const isRecent = useCallback((d: Deal) => {
    if (d.next_action_date) return d.next_action_date >= recencyCutoff;
    if (d.vigencia_fim) return d.vigencia_fim >= recencyCutoff;
    return true;
  }, [recencyCutoff]);

  // Ordenação do kanban: "Mais recentes" é o padrão (issue #10, checkpoint 15/07);
  // o toggle "Vencidas primeiro" (asc operacional) continua disponível
  const [sortRecentFirst, setSortRecentFirst] = useState(true);

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
      // #19: restaura o último funil aberto, se ainda existir
      const saved = (() => { try { return JSON.parse(localStorage.getItem('marpe_crm_prefs_v1') || '{}'); } catch { return {}; } })();
      const savedFunnel = d.funnels?.find((f: Funnel) => f.id === saved.activeFunnelId);
      if (savedFunnel) setActiveFunnelId(savedFunnel.id);
      else if (d.funnels?.length) setActiveFunnelId(d.funnels[0].id);
    });
  }, []);

  // Polish 23/07: lookups do Corp para rótulos dos filtros (ramos por extenso +
  // seguradoras canônicas). Cache server-side de 10 min + stale-while-revalidate.
  const [corpLookups, setCorpLookups] = useState<CorpFilterLookups | null>(null);
  useEffect(() => {
    fetch('/api/corp/lookups')
      .then(r => r.json())
      .then(d => setCorpLookups({ ramos: d.ramos || [], seguradoras: d.seguradoras || [] }))
      .catch(() => {});
  }, []);
  const canonSegBoard = useMemo(() => buildSeguradoraCanon(corpLookups), [corpLookups]);

  // S0 (22/07): idade do último sync Corp — a quebra do login em 21/07 passou
  // 2 dias invisível; agora o board avisa quando o dado está velho
  const [syncStatus, setSyncStatus] = useState<{ hours: number | null; error: string | null } | null>(null);
  useEffect(() => {
    fetch('/api/corp/sync-status')
      .then(r => r.json())
      .then(d => setSyncStatus({ hours: d.stale_hours, error: d.last_error?.error_message || null }))
      .catch(() => {});
  }, []);
  const syncStaleWarning = syncStatus && (syncStatus.hours === null || syncStatus.hours > 2);

  // #19: persiste filtros e preferências de visualização — sem isso, sair da aba
  // e voltar exigia refazer todos os filtros
  const prefsHydrated = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('marpe_crm_prefs_v1') || '{}');
      if (saved.filters) setFilters({ ...EMPTY_FILTERS, ...saved.filters });
      if (typeof saved.sortRecentFirst === 'boolean') setSortRecentFirst(saved.sortRecentFirst);
      if (saved.gradeSortDir === 'asc' || saved.gradeSortDir === 'desc') setGradeSortDir(saved.gradeSortDir);
      if (saved.viewMode === 'kanban' || saved.viewMode === 'grade') setViewMode(saved.viewMode);
      if (typeof saved.showOld === 'boolean') setShowOld(saved.showOld);
      if (countActiveFilters({ ...EMPTY_FILTERS, ...(saved.filters || {}) }) > 0) setShowFilters(true);
    } catch {}
    prefsHydrated.current = true;
  }, []);
  useEffect(() => {
    if (!prefsHydrated.current) return;
    try {
      localStorage.setItem('marpe_crm_prefs_v1', JSON.stringify({
        filters, sortRecentFirst, gradeSortDir, viewMode, showOld, activeFunnelId,
      }));
    } catch {}
  }, [filters, sortRecentFirst, gradeSortDir, viewMode, showOld, activeFunnelId]);

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

    // Janela de recência só vale sem busca/filtros ativos — busca encontra antigos
    const bypassWindow = showOld || !!q || countActiveFilters(filters) > 0;

    return deals.filter(d => {
      if (!bypassWindow && !isRecent(d)) return false;

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
      if (filters.seguradora.length > 0 && !filters.seguradora.includes(canonSegBoard(d.seguradora || ''))) return false;
      if (filters.produtor.length > 0 && !filters.produtor.includes(d.produtor || '')) return false;
      if (filters.tipo.length > 0 && !filters.tipo.includes(d.deal_type || '')) return false;
      if (filters.status.length > 0 && !filters.status.includes(d.status_custom || '')) return false;

      // Próxima Ação — presets do Corp (issue #20). Comparação por string
      // yyyy-mm-dd (next_action_date é date puro no banco).
      if (filters.dateRange !== 'todos') {
        if (!d.next_action_date) return false;
        const nd = d.next_action_date.slice(0, 10);
        const todayStr = localDateStr();
        if (filters.dateRange === 'hoje' && nd !== todayStr) return false;
        if (filters.dateRange === 'semana') {
          const now = new Date();
          const dow = (now.getDay() + 6) % 7; // segunda = 0
          const monday = new Date(now); monday.setDate(now.getDate() - dow);
          const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
          if (nd < localDateStr(monday) || nd > localDateStr(sunday)) return false;
        }
        if (filters.dateRange === 'mes' && nd.slice(0, 7) !== todayStr.slice(0, 7)) return false;
        if (filters.dateRange === 'proximos' && nd <= todayStr) return false;
        if (filters.dateRange === 'atraso') {
          const dias = parseInt(filters.atrasoDias) || 1;
          const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - dias);
          if (nd > localDateStr(cutoff)) return false;
        }
        if (filters.dateRange === 'custom') {
          if (filters.proxFrom && nd < filters.proxFrom) return false;
          if (filters.proxTo && nd > filters.proxTo) return false;
        }
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
  }, [deals, searchDebounced, filters, showOld, isRecent, canonSegBoard]);

  // Quantos negócios antigos existem no funil (para o chip da janela de recência)
  const oldCount = useMemo(() => deals.reduce((n, d) => n + (isRecent(d) ? 0 : 1), 0), [deals, isRecent]);

  // Deals sorted by next_action_date for Kanban (direção pelo toggle; nulls sempre no fim)
  const sortByNextAction = useCallback((arr: Deal[]) =>
    [...arr].sort((a, b) => {
      if (!a.next_action_date && !b.next_action_date) return 0;
      if (!a.next_action_date) return 1;
      if (!b.next_action_date) return -1;
      const cmp = a.next_action_date.localeCompare(b.next_action_date);
      return sortRecentFirst ? -cmp : cmp;
    }), [sortRecentFirst]);

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
        <div className="glass-nav anim" style={{
          minHeight: 56,
          margin: isMobile ? '8px 8px 0' : '12px 16px 0',
          borderRadius: 'var(--radius-lg)',
          display: 'flex', alignItems: 'center',
          padding: isMobile ? '10px 12px' : '8px 18px',
          gap: isMobile ? 8 : 12, flexShrink: 0,
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          position: 'relative', zIndex: 25,
        }}>
          {!isMobile && <span style={{ fontSize: 16, fontWeight: 600 }}>Funis</span>}

          {/* Funnel selector */}
          <select
            value={activeFunnelId}
            onChange={e => setActiveFunnelId(e.target.value)}
            style={{
              background: 'var(--field-bg)', border: '1px solid var(--hairline)',
              borderRadius: 10, padding: '8px 12px', color: 'var(--text-primary)',
              fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
              flex: isMobile ? 1 : 'none',
              transition: 'border-color 0.2s var(--ease-out)',
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
                height: 34, background: 'var(--field-bg)',
                border: `1px solid ${searchRaw ? 'rgba(59,130,246,0.4)' : 'var(--hairline)'}`,
                borderRadius: 999, color: 'var(--text-primary)', fontSize: 12,
                fontFamily: 'inherit', outline: 'none',
                transition: 'border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out)',
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
                padding: '7px 12px', borderRadius: 10, height: 34,
                border: `1px solid ${showFilters || activeFilterCount > 0 ? 'rgba(59,130,246,0.4)' : 'var(--hairline)'}`,
                background: showFilters || activeFilterCount > 0 ? 'var(--accent-dim)' : 'var(--field-bg)',
                color: showFilters || activeFilterCount > 0 ? 'var(--accent-light)' : 'var(--text-secondary)',
                fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                transition: 'all 0.2s var(--ease-out)',
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

            {/* Novo Cliente */}
            {!isMobile && (
              <button
                onClick={() => setShowNewContact(true)}
                style={{
                  padding: '7px 14px', borderRadius: 10, height: 34,
                  border: '1px solid var(--hairline)', background: 'var(--field-bg)',
                  color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.2s var(--ease-out)',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="4.5" cy="3.5" r="2.2" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M1 10.5c0-1.9 1.6-3.2 3.5-3.2S8 8.6 8 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  <path d="M9.5 4v4M7.5 6h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Novo Cliente
              </button>
            )}

            {/* Novo Negócio */}
            <button
              onClick={() => setShowNewDeal(true)}
              style={{
                padding: '7px 15px', borderRadius: 10, height: 34,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'linear-gradient(180deg, #4F8FF7, #2E6BE6)',
                boxShadow: '0 3px 14px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.28)',
                color: '#fff', fontSize: 12, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'all 0.22s var(--ease-out)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              {/* S4.1 (issue #27): no funil Sinistros o botão registra sinistro */}
              {isMobile ? 'Novo' : activeFunnel?.name === 'Sinistros' ? 'Registrar Sinistro' : 'Novo Negócio'}
            </button>

            {!isMobile && <ExportFunnelButton funnelId={activeFunnelId} />}

            {/* Ordenação do kanban (checkpoint 14/07 — "fixa ou configurável" → configurável) */}
            {!isMobile && viewMode === 'kanban' && (
              <button
                onClick={() => setSortRecentFirst(v => !v)}
                title="Alternar ordenação dos cards por data da próxima ação"
                style={{
                  padding: '7px 12px', borderRadius: 10, height: 34,
                  border: '1px solid var(--hairline)', background: 'var(--field-bg)',
                  color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                  transition: 'all 0.2s var(--ease-out)',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sortRecentFirst ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s var(--ease-spring)' }}>
                  <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
                </svg>
                {sortRecentFirst ? 'Mais recentes' : 'Vencidas primeiro'}
              </button>
            )}

            {/* View toggle */}
            {!isMobile && (['kanban', 'grade'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                style={{
                  padding: '7px 14px', borderRadius: 10, height: 34,
                  border: `1px solid ${viewMode === m ? 'rgba(59,130,246,0.3)' : 'var(--hairline)'}`,
                  background: viewMode === m ? 'var(--accent-dim)' : 'var(--field-bg)',
                  color: viewMode === m ? 'var(--accent-light)' : 'var(--text-muted)',
                  fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                  boxShadow: viewMode === m ? 'inset 0 1px 0 var(--highlight)' : 'none',
                  transition: 'all 0.2s var(--ease-out)',
                }}
              >
                {m === 'kanban' ? 'Kanban' : 'Grade'}
              </button>
            ))}
          </div>
        </div>

        {/* ── S0: alerta de sync Corp parado (>2h sem sucesso) ── */}
        {syncStaleWarning && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px 0', flexShrink: 0 }}>
            <span className="fade-in" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 600, color: '#fca5a5', background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 999, padding: '4px 12px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              {syncStatus?.hours === null
                ? 'Sincronização com o Corp sem registro de execução'
                : `Dados do Corp sem atualização há ${syncStatus!.hours! >= 48 ? `${Math.round(syncStatus!.hours! / 24)} dias` : `${Math.round(syncStatus!.hours!)}h`}`}
              <a href="/config" style={{ color: '#fca5a5', textDecoration: 'underline', fontWeight: 500 }}>ver Config</a>
            </span>
          </div>
        )}

        {/* ── Chip da janela de recência (item 11 — legenda de ramos removida, item 4) ── */}
        {!loading && oldCount > 0 && !isFiltering && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px 0', flexShrink: 0 }}>
            <span className="fade-in" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 999, padding: '3px 11px' }}>
              {showOld
                ? `Mostrando todos os negócios, incluindo ${oldCount.toLocaleString('pt-BR')} sem atividade há mais de ${RECENCY_MONTHS} meses`
                : `Mostrando os últimos ${RECENCY_MONTHS} meses · ${oldCount.toLocaleString('pt-BR')} antigos ocultos`}
              <button
                onClick={() => setShowOld(v => !v)}
                style={{ border: 'none', background: 'none', color: 'var(--accent-light)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                {showOld ? 'Ver só recentes' : 'Ver todos'}
              </button>
            </span>
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
            corpLookups={corpLookups}
          />
        )}

        {/* ── Mobile result count ─────────────────────────────────────────── */}
        {isMobile && isFiltering && (
          <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--accent)' }}>
            {filteredDeals.length} resultado{filteredDeals.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {loading ? (
          /* Skeleton do board enquanto os negócios carregam */
          <div style={{ flex: 1, overflow: 'hidden', padding: 16, display: 'flex', gap: 12 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="glass-panel anim" style={{ ['--i' as any]: i, minWidth: 280, maxWidth: 280, borderRadius: 'var(--radius-lg)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="skeleton" style={{ height: 14, width: '55%', marginBottom: 4 }} />
                {[0, 1, 2].map(j => (
                  <div key={j} className="skeleton" style={{ height: 84, borderRadius: 12 }} />
                ))}
              </div>
            ))}
          </div>
        ) : viewMode === 'kanban' ? (
          /* ── Kanban with drag-and-drop ────────────────────────────────── */
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {/* Fix 9: flex:1 + overflow:hidden lets each column control its own scroll */}
            <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: 16, display: 'flex', gap: 12, minHeight: 0 }}>
              {stages.map((stage, stageIdx) => {
                const stageDeals = dealsByStage(stage.id);
                const sum = stageDeals.reduce((a, d) => a + (d.premio || 0), 0);
                return (
                  /* Coluna = painel de vidro. Header fixo, DroppableColumn rola. */
                  <div key={stage.id} className="glass-panel anim" style={{ ['--i' as any]: stageIdx + 1, minWidth: 280, maxWidth: 280, display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0, height: '100%', borderRadius: 'var(--radius-lg)', padding: '0 8px 8px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 8px 10px', flexShrink: 0, borderBottom: '1px solid var(--hairline)', marginBottom: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0, boxShadow: `0 0 8px ${stage.color}88` }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stage.name}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--field-bg)', border: '1px solid var(--hairline)', padding: '1px 8px', borderRadius: 999, marginLeft: 'auto', flexShrink: 0 }}>{stageDeals.length}</span>
                      {sum > 0 && <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, flexShrink: 0 }}>{formatPremio(sum)}</span>}
                    </div>
                    {/* Fix 9: scrollable area */}
                    <DroppableColumn id={stage.id}>
                      {stageDeals.slice(0, visibleByStage[stage.id] || COLUMN_PAGE).map(d => {
                        const r = RAMO_COLORS[d.ramo?.toLowerCase() || ''] || { bg: 'var(--border)', color: 'var(--text-muted)' };
                        const urgency = nextActionUrgency(d.next_action_date);
                        return (
                          <DraggableCard key={d.id} id={d.id}>
                            <div
                              className="card-surface card-hover"
                              onClick={() => openDeal(d.id)}
                              style={{
                                borderLeft: `3px solid ${r.color}`,
                                borderRadius: 12,
                                padding: '12px 13px 8px',
                                cursor: 'grab',
                                ...(activeDealId === d.id ? {
                                  background: 'var(--accent-dim)',
                                  borderColor: 'rgba(59,130,246,0.35)',
                                  borderLeftColor: r.color,
                                  boxShadow: 'var(--shadow-accent), inset 0 1px 0 var(--highlight)',
                                } : {}),
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <CardAvatar contact={d.marpe_contacts} />
                                <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
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
                                    background: 'var(--field-bg)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--hairline)',
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
                              {/* Ações rápidas (item 1 do checkpoint — padrão waSpeed) */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
                                <QuickAction title="Conversas" onClick={() => openDeal(d.id, 'conversas')}>
                                  <svg style={QA_ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                </QuickAction>
                                <QuickAction title="Notas" onClick={() => openDeal(d.id, 'anotacoes')}>
                                  <svg style={QA_ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                                </QuickAction>
                                <QuickAction title="Documentos" onClick={() => openDeal(d.id, 'documentos')}>
                                  <svg style={QA_ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                </QuickAction>
                                {d.marpe_contacts?.id && (
                                  <a
                                    href={`/contato/${d.marpe_contacts.id}`}
                                    title="Perfil do contato"
                                    aria-label="Perfil do contato"
                                    onClick={e => e.stopPropagation()}
                                    onPointerDown={e => e.stopPropagation()}
                                    style={{
                                      width: 26, height: 24, borderRadius: 7, border: '1px solid transparent',
                                      background: 'transparent', color: 'var(--text-muted)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      cursor: 'pointer', transition: 'all 0.18s var(--ease-out)', textDecoration: 'none',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--field-bg)'; e.currentTarget.style.color = 'var(--accent-light)'; e.currentTarget.style.borderColor = 'var(--hairline)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'transparent'; }}
                                  >
                                    <svg style={QA_ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                  </a>
                                )}
                              </div>
                            </div>
                          </DraggableCard>
                        );
                      })}
                      {stageDeals.length === 0 && (
                        <div style={{ padding: 20, border: '1px dashed var(--hairline-strong)', borderRadius: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                          {isFiltering ? 'Nenhum resultado' : 'Nenhum negócio'}
                        </div>
                      )}
                      {stageDeals.length > (visibleByStage[stage.id] || COLUMN_PAGE) && (
                        <button
                          onClick={() => setVisibleByStage(v => ({ ...v, [stage.id]: (v[stage.id] || COLUMN_PAGE) + 100 }))}
                          style={{
                            fontSize: 11, color: 'var(--accent-light)', textAlign: 'center', padding: '8px 12px',
                            background: 'var(--field-bg)', border: '1px dashed var(--hairline-strong)', borderRadius: 10,
                            cursor: 'pointer', fontFamily: 'inherit', width: '100%', fontWeight: 600,
                            transition: 'all 0.2s var(--ease-out)',
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
                <div className="card-surface" style={{
                  border: '1px solid rgba(59,130,246,0.45)', borderRadius: 12, padding: 14, width: 264,
                  transform: 'rotate(2.5deg) scale(1.04)',
                  boxShadow: 'var(--shadow-lift), 0 0 24px var(--accent-dim)',
                  cursor: 'grabbing',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {deals.find(d => d.id === draggingDealId)?.marpe_contacts?.name || 'Negócio'}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          /* ── Grade view ───────────────────────────────────────────────── */
          <div className="glass-panel anim" style={{ ['--i' as any]: 1, flex: 1, overflowY: 'auto', overflowX: 'auto', padding: isMobile ? '12px 4px' : 16, margin: isMobile ? '8px 8px 8px' : '0 16px 16px', marginTop: 12, borderRadius: 'var(--radius-lg)' }}>
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
                      onClick={() => openDeal(d.id)}
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
          initialTab={activeDealTab}
          currentUser={currentUser}
          onClose={() => { setActiveDealId(null); setActiveDealTab(undefined); }}
          onUpdated={reloadDeals}
        />
      )}

      {showNewDeal && (activeFunnel?.name === 'Sinistros' ? (
        <NewSinistroModal
          funnels={funnels}
          activeFunnelId={activeFunnelId}
          onClose={() => setShowNewDeal(false)}
          onCreated={reloadDeals}
        />
      ) : (
        <NewDealModal
          funnels={funnels}
          activeFunnelId={activeFunnelId}
          currentUser={currentUser}
          onClose={() => setShowNewDeal(false)}
          onCreated={reloadDeals}
        />
      ))}

      {showNewContact && (
        <NewContactModal
          onClose={() => setShowNewContact(false)}
          onCreated={(contact, warnings) => {
            setContactToast({
              msg: contact.corp_id
                ? `Cliente ${contact.name} cadastrado no Corp (código ${contact.corp_id}) e no CRM.`
                : `Cliente ${contact.name} cadastrado no CRM.`,
              warnings,
            });
            // Emenda o fluxo do backlog: cadastrou o cliente → abre Novo Negócio já com ele
            (window as any).__prefillContactId = contact.id;
            setShowNewDeal(true);
          }}
        />
      )}

      {contactToast && (
        <div
          className="glass-modal modal-pop"
          onClick={() => setContactToast(null)}
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 1100, maxWidth: 380,
            border: '1px solid rgba(34,197,94,0.4)',
            borderRadius: 14, padding: '12px 16px', cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--green, #22c55e)', fontWeight: 600 }}>{contactToast.msg}</div>
          {contactToast.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: '#fbbf24', marginTop: 4 }}>{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
