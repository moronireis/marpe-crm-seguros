import { useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  phone_secondary: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  birth_date: string | null;
  profession: string | null;
  marital_status: string | null;
  tags: string[];
  notes: string | null;
  corp_id: string | null;
  responsible_id: string | null;
  source: string | null;
  cpf_cnpj: string | null;
  // Revisão 28/07 (PDF Sync §1/§10)
  contato_empresa: string | null;
  nome_negocio: string | null;
  produto_detalhes: string | null;
  cnh_vencimento: string | null;
  created_at: string;
  updated_at: string;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  created_at: string;
}

interface Deal {
  id: string;
  title: string;
  ramo: string | null;
  seguradora: string | null;
  apolice: string | null;
  premio: number | null;
  comissao_pct: number | null;
  comissao_valor: number | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  veiculo: string | null;
  placa: string | null;
  status_custom: string | null;
  status_color: string | null;
  created_at: string;
  marpe_funnel_stages: { id: string; name: string; color: string } | null;
  marpe_funnels: { id: string; name: string } | null;
  marpe_deal_activities: Activity[];
}

interface Props {
  contactId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  auto:        { bg: 'rgba(59,130,246,0.12)',  color: '#60A5FA' },
  vida:        { bg: 'rgba(139,92,246,0.12)',  color: '#a78bfa' },
  residencial: { bg: 'rgba(34,197,94,0.12)',   color: '#4ade80' },
  empresarial: { bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24' },
  equipamento: { bg: 'rgba(6,182,212,0.12)',   color: '#22d3ee' },
  viagem:      { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24' },
  saude:       { bg: 'rgba(239,68,68,0.12)',   color: '#f87171' },
};

function tagStyle(tag: string): { bg: string; color: string } {
  const lower = tag.toLowerCase();
  return TAG_COLORS[lower] || { bg: 'rgba(74,74,100,0.25)', color: 'var(--text-secondary)' };
}

function fmt(v: number | null) {
  if (!v) return '—';
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function nameColor(name: string): string {
  const colors = ['#60A5FA', '#4ade80', '#fbbf24', '#a78bfa', '#22d3ee', '#f87171', '#fb923c'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const RAMO_COLORS: Record<string, string> = {
  auto:        '#60A5FA',
  vida:        '#a78bfa',
  residencial: '#4ade80',
  empresarial: '#fbbf24',
  equipamento: '#22d3ee',
  viagem:      '#fb923c',
  saude:       '#f87171',
};

function ramoColor(ramo: string | null): string {
  if (!ramo) return 'var(--text-muted)';
  return RAMO_COLORS[ramo.toLowerCase()] || 'var(--text-secondary)';
}

const ACTIVITY_ICONS: Record<string, string> = {
  stage_change: '↗',
  automation:   '⚡',
  note:         '✎',
  call:         '☎',
  message:      '✉',
  field_update: '✏',
  default:      '·',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 20, marginBottom: 8 }}>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContactDetailView({ contactId }: Props) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [lastMessageAt, setLastMessageAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // Corp sync state
  const [corpSyncing, setCorpSyncing] = useState(false);
  const [corpSyncResult, setCorpSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function syncCorp() {
    if (!contact?.corp_id || corpSyncing) return;
    setCorpSyncing(true);
    setCorpSyncResult(null);
    try {
      const r = await fetch('/api/corp/sync-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corp_id: Number(contact.corp_id) }),
      });
      const d = await r.json();
      if (d.ok) {
        const { contact: cr, deals: dr } = d.result;
        setCorpSyncResult({ ok: true, msg: `Contato: ${cr.updated > 0 ? 'atualizado' : 'sem mudanças'} · Negócios: ${dr.created} criados, ${dr.updated} atualizados` });
        load(); // refresh the page data
      } else {
        setCorpSyncResult({ ok: false, msg: d.error || 'Erro na sincronização' });
      }
    } catch (e: any) {
      setCorpSyncResult({ ok: false, msg: 'Erro de rede' });
    }
    setCorpSyncing(false);
    setTimeout(() => setCorpSyncResult(null), 6000);
  }

  function load() {
    fetch(`/api/contacts/${contactId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setContact(d.contact);
        setDeals(d.deals || []);
        setMessageCount(d.message_count || 0);
        setLastMessageAt(d.last_message_at || null);
        setEditNotes(d.contact?.notes || '');
        setEditName(d.contact?.name || '');
        setEditPhone(d.contact?.phone || '');
        setEditEmail(d.contact?.email || '');
        setLoading(false);
      })
      .catch(() => { setError('Erro ao carregar contato.'); setLoading(false); });
  }

  useEffect(() => { load(); }, [contactId]);

  async function saveEdit() {
    setSaving(true);
    await fetch(`/api/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim() || null, email: editEmail.trim() || null, notes: editNotes.trim() || null }),
    });
    setSaving(false);
    setEditing(false);
    load();
  }

  // Flatten all activities from all deals, sorted newest first
  const allActivities: (Activity & { dealTitle: string; dealId: string })[] = deals
    .flatMap(d => (d.marpe_deal_activities || []).map(a => ({ ...a, dealTitle: d.title || d.ramo || 'Negócio', dealId: d.id })))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
        Carregando...
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
        {error || 'Contato não encontrado.'}
      </div>
    );
  }

  const avatarColor = nameColor(contact.name);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 48px' }}>

        {/* Back + Actions bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => history.back()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <svg style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }} viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Voltar
          </button>
          <div style={{ flex: 1 }} />
          <a
            href={`/inbox?contact=${contact.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', textDecoration: 'none' }}
          >
            <svg style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }} viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Enviar mensagem
          </a>
          <a
            href={`/crm?new_deal=${contact.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', textDecoration: 'none' }}
          >
            <svg style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }} viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Novo negócio
          </a>
          <button
            onClick={() => setEditing(e => !e)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: `1px solid ${editing ? 'var(--accent)' : 'var(--border)'}`, background: editing ? 'var(--accent-dim)' : 'transparent', color: editing ? 'var(--accent-light)' : 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <svg style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 2 }} viewBox="0 0 24 24">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            {editing ? 'Cancelar' : 'Editar'}
          </button>
        </div>

        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 28, padding: 24, background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: avatarColor, flexShrink: 0 }}>
            {getInitials(contact.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', outline: 'none', fontFamily: 'inherit', width: '100%', marginBottom: 8 }}
              />
            ) : (
              <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{contact.name}</h1>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {editing ? (
                <>
                  <input
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    placeholder="Telefone"
                    style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', outline: 'none', fontFamily: 'inherit', width: 180 }}
                  />
                  <input
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    placeholder="E-mail"
                    style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', outline: 'none', fontFamily: 'inherit', width: 220 }}
                  />
                </>
              ) : (
                <>
                  {contact.phone && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{contact.phone}</span>}
                  {contact.phone && contact.email && <span style={{ color: 'var(--text-muted)' }}>·</span>}
                  {contact.email && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{contact.email}</span>}
                  {contact.city && <span style={{ color: 'var(--text-muted)' }}>·</span>}
                  {contact.city && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{contact.city}{contact.state ? `, ${contact.state}` : ''}</span>}
                </>
              )}
            </div>
            {/* Tags */}
            {contact.tags && contact.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {contact.tags.map(tag => {
                  const ts = tagStyle(tag);
                  return (
                    <span key={tag} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: ts.bg, color: ts.color, letterSpacing: '0.04em' }}>
                      {tag}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 24, flexShrink: 0 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-light)' }}>{deals.length}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>Negócios</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-secondary)' }}>{messageCount}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>Mensagens</div>
            </div>
          </div>
        </div>

        {/* Save button when editing */}
        {editing && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
            <button onClick={saveEdit} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        )}

        {/* ─── Two-column layout ───────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

          {/* Info card — left */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', padding: '18px 20px' }}>
            <SectionLabel>Dados pessoais</SectionLabel>
            <InfoRow label="CPF / CNPJ"       value={contact.cpf_cnpj} />
            <InfoRow label="Telefone"          value={contact.phone} />
            <InfoRow label="Telefone secundário" value={contact.phone_secondary} />
            <InfoRow label="E-mail"            value={contact.email} />
            <InfoRow label="Endereço"          value={contact.address} />
            <InfoRow label="Cidade"            value={contact.city} />
            <InfoRow label="Estado"            value={contact.state} />
            <InfoRow label="Data de nascimento" value={contact.birth_date ? fmtDate(contact.birth_date) : null} />
            <InfoRow label="Profissão"         value={contact.profession} />
            <InfoRow label="Estado civil"      value={contact.marital_status} />
            {/* Revisão 28/07 — §1/§10 do PDF de Sincronização */}
            <InfoRow label="Vencimento da CNH" value={contact.cnh_vencimento ? fmtDate(contact.cnh_vencimento) : null} />
            <InfoRow label="Contato principal" value={contact.contato_empresa} />
            <InfoRow label="Nome do negócio"   value={contact.nome_negocio} />
            <InfoRow label="Detalhes do produto" value={contact.produto_detalhes} />
          </div>

          {/* Info card — right */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', padding: '18px 20px' }}>
            <SectionLabel>Dados do sistema</SectionLabel>
            <InfoRow label="Corp ID"    value={contact.corp_id} />
            <InfoRow label="Origem"     value={contact.source} />
            <InfoRow label="Cadastro"   value={fmtDate(contact.created_at)} />
            {lastMessageAt && <InfoRow label="Última mensagem" value={fmtDateTime(lastMessageAt)} />}

            {contact.corp_id && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={syncCorp}
                  disabled={corpSyncing}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
                    background: corpSyncing ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.12)',
                    border: '1px solid rgba(59,130,246,0.28)', borderRadius: 8,
                    color: corpSyncing ? 'var(--text-muted)' : 'var(--accent-light)',
                    fontSize: 12, fontWeight: 600, cursor: corpSyncing ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.18s', width: '100%', justifyContent: 'center',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    style={{ animation: corpSyncing ? 'spin 1s linear infinite' : 'none' }}>
                    <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                    <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                  </svg>
                  {corpSyncing ? 'Sincronizando Corp...' : 'Sincronizar Corp'}
                </button>
                {corpSyncResult && (
                  <div style={{
                    fontSize: 11, padding: '6px 10px', borderRadius: 6,
                    background: corpSyncResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${corpSyncResult.ok ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)'}`,
                    color: corpSyncResult.ok ? '#4ade80' : '#f87171',
                  }}>
                    {corpSyncResult.msg}
                  </div>
                )}
              </div>
            )}

            <SectionLabel>Notas</SectionLabel>
            {editing ? (
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                rows={5}
                placeholder="Anotações sobre o contato..."
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
            ) : contact.notes ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{contact.notes}</p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem notas.</p>
            )}
          </div>
        </div>

        {/* ─── §10: abas exclusivas do CRM — Dados Bancários e Anexos ──────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <BankSection contactId={contact.id} />
          <AnexosSection contactId={contact.id} />
        </div>

        {/* ─── Deals ──────────────────────────────────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', padding: '18px 20px', marginBottom: 20 }}>
          <SectionLabel>Negócios ({deals.length})</SectionLabel>
          {deals.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>Nenhum negócio associado a este contato.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deals.map(deal => (
                <a
                  key={deal.id}
                  href={`/crm?deal=${deal.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', textDecoration: 'none', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  {/* Ramo badge */}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: `${ramoColor(deal.ramo)}22`, color: ramoColor(deal.ramo), letterSpacing: '0.04em', flexShrink: 0, textTransform: 'uppercase', minWidth: 72, textAlign: 'center' }}>
                    {deal.ramo || '—'}
                  </span>

                  {/* Seguradora */}
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {deal.seguradora || deal.title || '—'}
                  </span>

                  {/* Prêmio */}
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', flexShrink: 0, minWidth: 100, textAlign: 'right' }}>
                    {fmt(deal.premio)}
                  </span>

                  {/* Comissão */}
                  {deal.comissao_pct && (
                    <span style={{ fontSize: 12, color: 'var(--green)', flexShrink: 0, minWidth: 56, textAlign: 'right' }}>
                      {deal.comissao_pct}%
                    </span>
                  )}

                  {/* Vigência */}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, minWidth: 130, textAlign: 'center' }}>
                    {deal.vigencia_inicio ? fmtDate(deal.vigencia_inicio) : '—'} — {deal.vigencia_fim ? fmtDate(deal.vigencia_fim) : '—'}
                  </span>

                  {/* Stage */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: deal.marpe_funnel_stages?.color || 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {deal.marpe_funnels?.name} · {deal.marpe_funnel_stages?.name}
                    </span>
                  </div>

                  {/* Arrow */}
                  <svg style={{ width: 14, height: 14, stroke: 'var(--text-muted)', fill: 'none', strokeWidth: 2, flexShrink: 0 }} viewBox="0 0 24 24">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ─── Activity Timeline ───────────────────────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', padding: '18px 20px' }}>
          <SectionLabel>Histórico de atividades ({allActivities.length})</SectionLabel>
          {allActivities.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>Nenhuma atividade registrada.</div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 28 }}>
              {/* Vertical line */}
              <div style={{ position: 'absolute', left: 9, top: 8, bottom: 8, width: 1, background: 'var(--border)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {allActivities.map((act, i) => (
                  <div key={act.id} style={{ position: 'relative', paddingBottom: i < allActivities.length - 1 ? 16 : 0 }}>
                    {/* Dot */}
                    <div style={{ position: 'absolute', left: -22, top: 3, width: 8, height: 8, borderRadius: '50%', background: 'var(--bg-card)', border: '2px solid var(--border-accent)', zIndex: 1 }} />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>{ACTIVITY_ICONS[act.type] || ACTIVITY_ICONS.default}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{act.description}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtDateTime(act.created_at)}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>·</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{act.dealTitle}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── §10 (28/07): Dados Bancários — exclusivo do CRM ─────────────────────────
// A API do Corp não expõe a aba "Dados Bancários" (probe 09/07; cobrado da Agia).

interface BankAccount {
  id: string; banco: string | null; agencia: string | null; conta: string | null;
  tipo_conta: string | null; titular: string | null; pix: string | null; observacoes: string | null;
}

const BANK_EMPTY = { banco: '', agencia: '', conta: '', tipo_conta: '', titular: '', pix: '', observacoes: '' };

function BankSection({ contactId }: { contactId: string }) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BANK_EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const F: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '7px 10px', background: 'var(--bg-primary)',
    border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
    fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
  };

  function load() {
    fetch(`/api/contacts/${contactId}/bank`)
      .then(r => r.json())
      .then(d => { setAccounts(d.accounts || []); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(load, [contactId]);

  async function save() {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/contacts/${contactId}/bank`, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { bank_id: editingId, ...form } : form),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Falha ao salvar'); setBusy(false); return; }
      setShowForm(false); setEditingId(null); setForm({ ...BANK_EMPTY });
      load();
    } catch { setErr('Erro de rede'); }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm('Remover esta conta bancária?')) return;
    await fetch(`/api/contacts/${contactId}/bank`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bank_id: id }),
    }).catch(() => {});
    load();
  }

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>Dados bancários</SectionLabel>
        <button onClick={() => { setShowForm(v => !v); setEditingId(null); setForm({ ...BANK_EMPTY }); }}
          style={{ fontSize: 11, color: 'var(--accent-light)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
          {showForm ? 'Cancelar' : '+ Adicionar'}
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 10 }}>
        Somente no CRM — a API do Corp não expõe dados bancários.
      </div>

      {showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr', gap: 8 }}>
            <input style={F} placeholder="Banco" value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} />
            <input style={F} placeholder="Agência" value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} />
            <input style={F} placeholder="Conta" value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 8 }}>
            <select style={{ ...F, cursor: 'pointer' }} value={form.tipo_conta} onChange={e => setForm(f => ({ ...f, tipo_conta: e.target.value }))}>
              <option value="">Tipo…</option>
              <option value="corrente">Corrente</option>
              <option value="poupanca">Poupança</option>
              <option value="pagamento">Pagamento</option>
            </select>
            <input style={F} placeholder="Titular" value={form.titular} onChange={e => setForm(f => ({ ...f, titular: e.target.value }))} />
          </div>
          <input style={F} placeholder="Chave PIX (opcional)" value={form.pix} onChange={e => setForm(f => ({ ...f, pix: e.target.value }))} />
          <input style={F} placeholder="Observações" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
          {err && <div style={{ fontSize: 11.5, color: '#f87171' }}>{err}</div>}
          <button onClick={save} disabled={busy}
            style={{ alignSelf: 'flex-end', padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Adicionar conta'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando…</div>
      ) : accounts.length === 0 && !showForm ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhuma conta cadastrada.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {accounts.map(a => (
            <div key={a.id} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {a.banco || 'Banco não informado'}
                    {a.tipo_conta && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {a.tipo_conta}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {[a.agencia && `Ag. ${a.agencia}`, a.conta && `Conta ${a.conta}`, a.titular].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {a.pix && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>PIX: {a.pix}</div>}
                  {a.observacoes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{a.observacoes}</div>}
                </div>
                <button onClick={() => { setEditingId(a.id); setShowForm(true); setForm({ banco: a.banco || '', agencia: a.agencia || '', conta: a.conta || '', tipo_conta: a.tipo_conta || '', titular: a.titular || '', pix: a.pix || '', observacoes: a.observacoes || '' }); }}
                  title="Editar" style={{ fontSize: 11, color: 'var(--accent-light)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Editar</button>
                <button onClick={() => remove(a.id)} title="Remover"
                  style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Remover</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── §10 (28/07): Anexos do cliente — upload exclusivo do CRM ────────────────
// O Corp só permite BAIXAR anexos via API; upload não existe (cobrado da Agia).

interface ContactDoc {
  id: string; file_name: string; file_size: number | null; created_at: string;
  signed_url: string | null;
  marpe_profiles: { full_name: string } | null;
}

function AnexosSection({ contactId }: { contactId: string }) {
  const [docs, setDocs] = useState<ContactDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  function load() {
    fetch(`/api/contacts/${contactId}/documents`)
      .then(r => r.json())
      .then(d => { setDocs(d.documents || []); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(load, [contactId]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setErr('');
    for (const file of Array.from(files).slice(0, 10)) {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`/api/contacts/${contactId}/documents`, { method: 'POST', body: fd }).catch(() => null);
      if (!r?.ok) {
        const d = await r?.json().catch(() => ({}));
        setErr(`${file.name}: ${d?.error || 'falha no upload'}`);
      }
    }
    setUploading(false);
    load();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remover o anexo "${name}"?`)) return;
    await fetch(`/api/contacts/${contactId}/documents`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: id }),
    }).catch(() => {});
    load();
  }

  const fmtSize = (n: number | null) => {
    if (!n) return '';
    if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.ceil(n / 1024)} KB`;
  };

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>Anexos</SectionLabel>
        <label style={{ fontSize: 11, color: uploading ? 'var(--text-muted)' : 'var(--accent-light)', cursor: uploading ? 'default' : 'pointer', fontWeight: 600 }}>
          {uploading ? 'Enviando…' : '+ Anexar arquivo'}
          <input type="file" multiple style={{ display: 'none' }} disabled={uploading}
            onChange={e => { upload(e.target.files); e.currentTarget.value = ''; }} />
        </label>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 10 }}>
        Guardados no CRM — a API do Corp não aceita envio de anexos.
      </div>

      {err && <div style={{ fontSize: 11.5, color: '#f87171', marginBottom: 8 }}>{err}</div>}

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando…</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhum anexo.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.7" style={{ flexShrink: 0 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.file_name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                  {[fmtSize(d.file_size), d.marpe_profiles?.full_name, fmtDate(d.created_at)].filter(Boolean).join(' · ')}
                </div>
              </div>
              {d.signed_url && (
                <a href={d.signed_url} target="_blank" rel="noopener noreferrer" title="Baixar"
                  style={{ fontSize: 11, color: 'var(--accent-light)', textDecoration: 'none', fontWeight: 600, flexShrink: 0 }}>Baixar</a>
              )}
              <button onClick={() => remove(d.id, d.file_name)} title="Remover"
                style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Remover</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
