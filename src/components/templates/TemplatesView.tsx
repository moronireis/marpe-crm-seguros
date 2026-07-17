import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  category: string;
  body: string;
  variables: string[];
  shortcut: string | null;
  is_meta_template?: boolean;
  meta_template_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  'assistencia', 'cobranca', 'comercial', 'marketing',
  'pos-venda', 'relacionamento', 'renovacao', 'sinistro',
];

const CATEGORY_LABELS: Record<string, string> = {
  assistencia: 'Assistência',
  cobranca: 'Cobrança',
  comercial: 'Comercial',
  marketing: 'Marketing',
  'pos-venda': 'Pós-venda',
  relacionamento: 'Relacionamento',
  renovacao: 'Renovação',
  sinistro: 'Sinistro',
  geral: 'Geral',
};

const VARIABLES_CONTATO = [
  { token: '{{nome}}', label: 'Nome completo' },
  { token: '{{primeiro_nome}}', label: 'Primeiro nome' },
  { token: '{{telefone}}', label: 'Telefone' },
  { token: '{{email}}', label: 'E-mail' },
  { token: '{{cidade}}', label: 'Cidade' },
];

const VARIABLES_NEGOCIO = [
  { token: '{{veiculo}}', label: 'Veículo' },
  { token: '{{placa}}', label: 'Placa' },
  { token: '{{apolice}}', label: 'Apólice' },
  { token: '{{seguradora}}', label: 'Seguradora' },
  { token: '{{premio}}', label: 'Prêmio' },
  { token: '{{comissao}}', label: 'Comissão' },
  { token: '{{ramo}}', label: 'Ramo' },
  { token: '{{produtor}}', label: 'Produtor' },
  { token: '{{vigencia_inicio}}', label: 'Vigência início' },
  { token: '{{vigencia_fim}}', label: 'Vigência fim' },
  { token: '{{proxima_acao}}', label: 'Próxima ação' },
];

// S4.2 (issue #18): variáveis do funil de Sinistros (populadas pelo sync do Corp)
const VARIABLES_SINISTRO = [
  { token: '{{numero_sinistro}}', label: 'Número do sinistro' },
  { token: '{{situacao_sinistro}}', label: 'Situação do sinistro' },
  { token: '{{data_ocorrencia}}', label: 'Data da ocorrência' },
  { token: '{{franquia}}', label: 'Franquia' },
  { token: '{{oficina}}', label: 'Oficina' },
];

const VARIABLES_SISTEMA = [
  { token: '{{periodo_dia}}', label: 'Período do dia' },
];

// Sample data for preview
const PREVIEW_DATA: Record<string, string> = {
  nome: 'João Silva',
  primeiro_nome: 'João',
  telefone: '(11) 99999-1234',
  email: 'joao@exemplo.com',
  cidade: 'São Paulo',
  veiculo: 'GOL 2022',
  placa: 'ABC-1234',
  apolice: '123456789',
  seguradora: 'Porto Seguro',
  premio: 'R$ 1.890,00',
  comissao: 'R$ 189,00',
  ramo: 'Auto',
  produtor: 'Carlos Martins',
  vigencia_inicio: '01/01/2025',
  vigencia_fim: '01/01/2026',
  proxima_acao: '15/07/2025',
  periodo_dia: 'Bom dia',
};

function applyPreview(body: string): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => PREVIEW_DATA[key] ?? `{{${key}}}`);
}

// Extract {{variable}} tokens from body
function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ── Empty form state ──────────────────────────────────────────────────────────

function emptyForm(): Omit<Template, 'id' | 'created_at' | 'updated_at'> {
  return { name: '', category: 'comercial', body: '', variables: [], shortcut: null };
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TemplatesView() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Template | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showVars, setShowVars] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const varsPopupRef = useRef<HTMLDivElement>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  function load() {
    fetch('/api/templates')
      .then(r => r.json())
      .then(d => { setTemplates(d.templates || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  // Close vars popup on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (varsPopupRef.current && !varsPopupRef.current.contains(e.target as Node)) {
        setShowVars(false);
      }
    }
    if (showVars) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVars]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const filtered = search
    ? templates.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.body.toLowerCase().includes(search.toLowerCase())
      )
    : templates;

  const byCategory: Record<string, Template[]> = {};
  for (const t of filtered) {
    const cat = t.category || 'geral';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(t);
  }
  const sortedCategories = Object.keys(byCategory).sort();

  // ── Selection ───────────────────────────────────────────────────────────────

  function selectTemplate(t: Template) {
    setSelected(t);
    setIsNew(false);
    setForm({
      name: t.name,
      category: t.category,
      body: t.body,
      variables: t.variables || [],
      shortcut: t.shortcut,
    });
    setError('');
    setShowVars(false);
  }

  function startNew() {
    setSelected(null);
    setIsNew(true);
    setForm(emptyForm());
    setError('');
    setShowVars(false);
  }

  // ── Variable insertion ──────────────────────────────────────────────────────

  function insertVariable(token: string) {
    const ta = textareaRef.current;
    if (!ta) {
      setForm(f => ({ ...f, body: f.body + token }));
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newBody = form.body.slice(0, start) + token + form.body.slice(end);
    setForm(f => ({ ...f, body: newBody }));
    // Restore cursor after token
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
    setShowVars(false);
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function save() {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    if (!form.body.trim()) { setError('Mensagem é obrigatória'); return; }
    setSaving(true);
    setError('');

    const payload = {
      name: form.name.trim(),
      category: form.category,
      body: form.body,
      variables: extractVariables(form.body),
      shortcut: form.shortcut?.trim() || null,
    };

    const url = isNew ? '/api/templates' : `/api/templates/${selected!.id}`;
    const method = isNew ? 'POST' : 'PATCH';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setError(d.error || 'Erro ao salvar'); return; }
    load();
    if (isNew) {
      selectTemplate(d.template);
    } else {
      setSelected(d.template);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function deleteTemplate() {
    if (!selected) return;
    if (!confirm(`Excluir o template "${selected.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/templates/${selected.id}`, { method: 'DELETE' });
    setDeleting(false);
    if (!res.ok) { alert('Erro ao excluir'); return; }
    setSelected(null);
    setIsNew(false);
    load();
  }

  // ── Duplicate ───────────────────────────────────────────────────────────────

  function duplicate() {
    setSelected(null);
    setIsNew(true);
    setForm(f => ({
      ...f,
      name: f.name + ' (cópia)',
      shortcut: null,
    }));
    setError('');
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const inp: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 6,
    display: 'block',
  };

  const btnPrimary: React.CSSProperties = {
    padding: '9px 18px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 500,
  };

  const btnSecondary: React.CSSProperties = {
    padding: '9px 18px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 500,
  };

  const btnDanger: React.CSSProperties = {
    padding: '9px 18px',
    borderRadius: 8,
    border: '1px solid rgba(239,68,68,0.3)',
    background: 'transparent',
    color: '#f87171',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 500,
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const showEditor = isNew || selected !== null;
  const isDirty = selected
    ? form.name !== selected.name ||
      form.category !== selected.category ||
      form.body !== selected.body ||
      form.shortcut !== selected.shortcut
    : true;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left panel: template list ── */}
      <div style={{
        width: 320,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 16px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Templates</span>
            <button
              onClick={startNew}
              style={{
                padding: '5px 12px',
                borderRadius: 7,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Novo
            </button>
          </div>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              style={{ ...inp, paddingLeft: 30, fontSize: 12 }}
              placeholder="Buscar templates..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
              {search ? 'Nenhum resultado.' : 'Nenhum template ainda.'}
            </div>
          ) : sortedCategories.map(cat => {
            const items = byCategory[cat];
            const isCollapsed = collapsed[cat];
            const label = CATEGORY_LABELS[cat] || cat;
            return (
              <div key={cat}>
                {/* Category header */}
                <button
                  onClick={() => setCollapsed(c => ({ ...c, [cat]: !c[cat] }))}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 16px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                  }}>
                    {label}
                  </span>
                  <span style={{
                    marginLeft: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '1px 6px',
                  }}>
                    {items.length}
                  </span>
                </button>

                {/* Template items */}
                {!isCollapsed && items.map(t => {
                  const isActive = (selected?.id === t.id) && !isNew;
                  return (
                    <button
                      key={t.id}
                      onClick={() => selectTemplate(t)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        padding: '10px 16px',
                        background: isActive ? 'var(--accent-dim)' : 'transparent',
                        border: 'none',
                        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                        transition: 'background 0.12s',
                        gap: 4,
                      }}
                      onMouseEnter={e => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)';
                      }}
                      onMouseLeave={e => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                        <span style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: isActive ? 'var(--accent-light)' : 'var(--text-primary)',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {t.name}
                        </span>
                        {t.shortcut && (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 500,
                            color: 'var(--accent)',
                            background: 'var(--accent-dim)',
                            borderRadius: 4,
                            padding: '1px 5px',
                            flexShrink: 0,
                            fontFamily: 'monospace',
                          }}>
                            {t.shortcut}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {truncate(t.body.replace(/\n/g, ' '), 80)}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer count */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}>
          {templates.length} {templates.length === 1 ? 'template' : 'templates'}
        </div>
      </div>

      {/* ── Right panel: editor ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {!showEditor ? (
          /* Empty state */
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            gap: 12,
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Selecione um template
              </div>
              <div style={{ fontSize: 12 }}>ou clique em "+ Novo" para criar um novo</div>
            </div>
          </div>
        ) : (
          /* Editor */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Editor header */}
            <div style={{
              height: 56,
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 24px',
              gap: 12,
              flexShrink: 0,
            }}>
              <input
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  minWidth: 0,
                }}
                placeholder="Nome do template..."
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
              {isNew && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  background: 'var(--accent-dim)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  Novo
                </span>
              )}
            </div>

            {/* Editor body — scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Row: category + shortcut */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Categoria</label>
                  <select
                    style={inp}
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  >
                    {CATEGORY_OPTIONS.map(c => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Atalho</label>
                  <input
                    style={inp}
                    placeholder="Ex: /boasvindas"
                    value={form.shortcut || ''}
                    onChange={e => setForm(f => ({ ...f, shortcut: e.target.value || null }))}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Digite / no chat para acionar
                  </div>
                </div>
              </div>

              {/* Body editor */}
              <div>
                {/* Toolbar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Mensagem</label>
                  <div style={{ position: 'relative' }} ref={varsPopupRef}>
                    <button
                      onClick={() => setShowVars(v => !v)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 7,
                        border: '1px solid var(--border)',
                        background: showVars ? 'var(--accent-dim)' : 'transparent',
                        color: showVars ? 'var(--accent-light)' : 'var(--text-secondary)',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        transition: 'all 0.12s',
                      }}
                    >
                      <span style={{ fontFamily: 'inherit', fontSize: 13 }}>{'{ }'}</span>
                      Variáveis
                    </button>

                    {/* Variables popup */}
                    {showVars && (
                      <div style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        width: 420,
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        zIndex: 100,
                        overflow: 'hidden',
                      }}>
                        <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Tags disponíveis
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                            Clique para inserir na posição do cursor
                          </span>
                        </div>

                        <div style={{ padding: 14, display: 'flex', gap: 16 }}>
                          {/* Contato */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                              Contato
                            </div>
                            {VARIABLES_CONTATO.map(v => (
                              <button
                                key={v.token}
                                onClick={() => insertVariable(v.token)}
                                title={v.label}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '5px 8px',
                                  borderRadius: 6,
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  marginBottom: 2,
                                  transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              >
                                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--accent-light)' }}>{v.token}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{v.label}</span>
                              </button>
                            ))}
                          </div>

                          {/* Negócio */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                              Negócio
                            </div>
                            {VARIABLES_NEGOCIO.map(v => (
                              <button
                                key={v.token}
                                onClick={() => insertVariable(v.token)}
                                title={v.label}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '5px 8px',
                                  borderRadius: 6,
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  marginBottom: 2,
                                  transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              >
                                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--accent-light)' }}>{v.token}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{v.label}</span>
                              </button>
                            ))}
                          </div>

                          {/* Sinistro (S4.2, issue #18) */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                              Sinistro
                            </div>
                            {VARIABLES_SINISTRO.map(v => (
                              <button
                                key={v.token}
                                onClick={() => insertVariable(v.token)}
                                title={v.label}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '5px 8px',
                                  borderRadius: 6,
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  marginBottom: 2,
                                  transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              >
                                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--accent-light)' }}>{v.token}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{v.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Sistema */}
                        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                            Sistema
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {VARIABLES_SISTEMA.map(v => (
                              <button
                                key={v.token}
                                onClick={() => insertVariable(v.token)}
                                title={v.label}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: 6,
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              >
                                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--accent-light)' }}>{v.token}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{v.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <textarea
                  ref={textareaRef}
                  style={{
                    ...inp,
                    minHeight: 320,
                    fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace',
                    fontSize: 13,
                    lineHeight: 1.7,
                    resize: 'vertical',
                    whiteSpace: 'pre-wrap',
                    transition: 'border-color 0.15s',
                  }}
                  placeholder={`{{periodo_dia}}, {{primeiro_nome}}! 👋\n\nSua apólice da {{seguradora}} vence em {{vigencia_fim}}.\n\nPodemos renovar juntos?`}
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />

                {/* Variable chips detected */}
                {form.body && extractVariables(form.body).length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {extractVariables(form.body).map(v => (
                      <span key={v} style={{
                        fontSize: 10,
                        fontFamily: 'monospace',
                        color: 'var(--accent)',
                        background: 'var(--accent-dim)',
                        borderRadius: 4,
                        padding: '2px 6px',
                      }}>
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Preview */}
              {form.body && (
                <div>
                  <label style={labelStyle}>Pré-visualização</label>
                  <div style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: 16,
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'inherit',
                    position: 'relative',
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: 10,
                      right: 12,
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      fontWeight: 600,
                    }}>
                      Dados de exemplo
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {applyPreview(form.body)}
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)' }}>
                  {error}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 8 }}>
                <button
                  onClick={save}
                  disabled={saving || !isDirty}
                  style={{
                    ...btnPrimary,
                    opacity: saving || !isDirty ? 0.5 : 1,
                    cursor: saving || !isDirty ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>

                {!isNew && (
                  <>
                    <button onClick={duplicate} style={btnSecondary}>
                      Duplicar
                    </button>
                    <button
                      onClick={deleteTemplate}
                      disabled={deleting}
                      style={{
                        ...btnDanger,
                        marginLeft: 'auto',
                        opacity: deleting ? 0.5 : 1,
                        cursor: deleting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {deleting ? 'Excluindo...' : 'Excluir'}
                    </button>
                  </>
                )}

                {isNew && (
                  <button
                    onClick={() => { setIsNew(false); setSelected(null); }}
                    style={btnSecondary}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
